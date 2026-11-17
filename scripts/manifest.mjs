#!/usr/bin/env node
/**
 * Evidence manifest generator and integrity checker (`scripts/manifest.mjs`).
 *
 * Implements the manifest conventions in `docs/MAINTENANCE.md` §2–§3:
 *  - Explicit public-file inventory (`evidenceFiles`), sorted lexicographically
 *    with exact byte lengths and SHA-256 digests, and an explicit
 *    `pathBase: "run-dir"` contract so checks never silently fall back to the
 *    repository root when a run-directory file is missing.
 *  - Historical schema v1 manifests without `pathBase` that use repo-relative
 *    paths require explicit `--legacy-root-paths` (`legacyRootPaths: true`).
 *  - Excludes the manifest file itself from `evidenceFiles` (and rejects a
 *    manifest that lists itself during `--check`), preventing circular hashes.
 *  - Refuses to overwrite an existing `manifest.json` by default (`flag: 'wx'`).
 *    Frozen directories (`docs/evidence/**`, `tests/fixtures/screenshots/**`,
 *    or any directory with `PUBLICATION.md`) never allow overwriting an existing
 *    manifest even with `--overwrite`; staging directories allow `--overwrite`
 *    only when `.run-id` matches the explicit `--run-id=<id>`.
 *
 * Usage:
 *   node scripts/manifest.mjs --dir=.artifacts/run-01
 *   node scripts/manifest.mjs --dir=docs/evidence/2026-11-17 --check
 *   node scripts/manifest.mjs --manifest=docs/evidence/manifest.json --legacy-root-paths --check
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OWNER_MARKER_FILE = '.run-id'

/** Files excluded when collecting default public evidence entries in a run dir. */
const DEFAULT_EXCLUDED_BASENAMES = new Set([
  'manifest.json',
  'PUBLICATION.md',
  OWNER_MARKER_FILE,
  '.DS_Store',
])

/**
 * Normalize a path to POSIX forward slashes.
 * @param {string} p
 */
function toPosix(p) {
  return p.split(path.sep).join('/')
}

/**
 * Resolve the canonical real path of `targetPath`, even if the leaf segment(s)
 * do not exist yet, by resolving `realpath` on the deepest existing ancestor.
 *
 * @param {string} targetPath
 * @returns {Promise<string>}
 */
export async function resolveRealPath(targetPath) {
  const abs = path.resolve(targetPath)
  /** @type {string[]} */
  const tail = []
  let current = abs
  while (!existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    tail.unshift(path.basename(current))
    current = parent
  }
  const resolvedBase = existsSync(current) ? await realpath(current) : current
  return tail.length > 0 ? path.join(resolvedBase, ...tail) : resolvedBase
}

/**
 * Whether `candidate` is `zoneDir` or a path inside `zoneDir`.
 * @param {string} candidate
 * @param {string} zoneDir
 */
function isInsideDir(candidate, zoneDir) {
  return candidate === zoneDir || candidate.startsWith(zoneDir + path.sep)
}

/**
 * Check whether `targetPath` (lexically or after resolving symlinks) lies inside
 * a frozen zone (`docs/evidence/**` or `tests/fixtures/screenshots/**`).
 *
 * @param {string} root
 * @param {string} targetPath
 */
async function isFrozenPath(root, targetPath) {
  const lexicalRoot = path.resolve(root)
  const lexicalTarget = path.resolve(targetPath)
  const realRoot = await resolveRealPath(lexicalRoot)
  const realTarget = await resolveRealPath(lexicalTarget)

  for (const [r, t] of [
    [lexicalRoot, lexicalTarget],
    [realRoot, realTarget],
  ]) {
    if (
      isInsideDir(t, path.join(r, 'docs', 'evidence')) ||
      isInsideDir(t, path.join(r, 'tests', 'fixtures', 'screenshots'))
    ) {
      return true
    }
  }
  return false
}

/**
 * Compute `{ bytes, sha256 }` for one regular file on disk.
 * @param {string} filePath
 */
export async function hashFile(filePath) {
  const buf = await readFile(filePath)
  return {
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
  }
}

/**
 * Recursively list regular files under `dirPath`, excluding the manifest itself
 * and provenance/staging metadata files. Rejects symbolic links inside the run
 * directory so a manifest cannot hash external targets through symlinks.
 *
 * @param {string} dirPath
 * @param {string} manifestAbsPath
 * @returns {Promise<string[]>} absolute file paths
 */
async function collectRunDirFiles(dirPath, manifestAbsPath) {
  /** @type {string[]} */
  const collected = []
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (DEFAULT_EXCLUDED_BASENAMES.has(entry.name)) continue
      const full = path.join(current, entry.name)
      if (path.resolve(full) === manifestAbsPath) continue
      if (entry.isSymbolicLink()) {
        throw new Error(`refusing to include symbolic link in evidence manifest: ${full}`)
      }
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        collected.push(full)
      }
    }
  }
  await walk(dirPath)
  return collected
}

/**
 * Build a manifest object for a run directory or an explicit file list.
 * All file entries are resolved strictly relative to `dir` (`pathBase: "run-dir"`).
 *
 * @param {{
 *   dir: string,
 *   root?: string,
 *   manifestPath?: string,
 *   files?: string[],
 *   runId?: string,
 * }} options
 */
export async function buildManifest({
  dir,
  root = ROOT,
  manifestPath,
  files,
  runId,
}) {
  if (!dir || typeof dir !== 'string') {
    throw new Error('buildManifest requires a target `dir`')
  }
  const resolvedRoot = path.resolve(root)
  const resolvedDir = path.resolve(resolvedRoot, dir)
  if (!existsSync(resolvedDir)) {
    throw new Error(`evidence directory does not exist: ${resolvedDir}`)
  }
  const realDir = await resolveRealPath(resolvedDir)
  const resolvedManifest = manifestPath
    ? path.resolve(resolvedRoot, manifestPath)
    : path.join(resolvedDir, 'manifest.json')
  const realManifest = await resolveRealPath(resolvedManifest)
  if (
    path.dirname(resolvedManifest) !== resolvedDir ||
    path.dirname(realManifest) !== realDir
  ) {
    throw new Error(
      `manifestPath must reside directly inside the owning run directory (${resolvedDir}): ${resolvedManifest}`,
    )
  }

  /** @type {string[]} */
  let targetFiles
  if (Array.isArray(files) && files.length > 0) {
    targetFiles = []
    for (const file of files) {
      if (typeof file !== 'string' || file.trim() === '' || path.isAbsolute(file)) {
        throw new Error(`evidence file must be a relative path inside the run directory: ${String(file)}`)
      }
      // Strictly resolve against the run directory; never fall back to repo root.
      const resolved = path.resolve(resolvedDir, file)
      const rel = path.relative(resolvedDir, resolved)
      if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`evidence file escapes the run directory: ${file}`)
      }
      if (
        resolved === resolvedManifest ||
        path.basename(resolved) === 'manifest.json'
      ) {
        throw new Error(`manifest must not include itself in evidenceFiles: ${file}`)
      }
      if (!existsSync(resolved)) {
        throw new Error(`listed evidence file does not exist in run directory: ${file}`)
      }
      const linkInfo = await lstat(resolved)
      if (linkInfo.isSymbolicLink()) {
        throw new Error(`refusing to include symbolic link in evidence manifest: ${file}`)
      }
      const realFile = await resolveRealPath(resolved)
      if (realFile === realManifest) {
        throw new Error(`manifest must not include itself in evidenceFiles: ${file}`)
      }
      if (!isInsideDir(realFile, realDir)) {
        throw new Error(`evidence file resolves outside the run directory: ${file}`)
      }
      targetFiles.push(resolved)
    }
  } else {
    targetFiles = await collectRunDirFiles(resolvedDir, resolvedManifest)
  }

  if (targetFiles.length === 0) {
    throw new Error(`no public evidence files found in ${resolvedDir}`)
  }

  /** @type {Array<[string, { bytes: number, sha256: string }]>} */
  const pairs = []
  for (const absFile of targetFiles) {
    const realFile = await resolveRealPath(absFile)
    if (path.resolve(absFile) === resolvedManifest || realFile === realManifest) {
      throw new Error(`manifest must not include itself: ${absFile}`)
    }
    if (!isInsideDir(realFile, realDir)) {
      throw new Error(`evidence file resolves outside the run directory: ${absFile}`)
    }
    const info = await stat(absFile)
    if (!info.isFile()) {
      throw new Error(`evidence entry is not a regular file: ${absFile}`)
    }
    const relKey = toPosix(path.relative(resolvedDir, absFile))
    pairs.push([relKey, await hashFile(absFile)])
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  /** @type {Record<string, { bytes: number, sha256: string }>} */
  const evidenceFiles = {}
  for (const [key, digest] of pairs) {
    evidenceFiles[key] = digest
  }

  const pkgPath = path.join(resolvedRoot, 'package.json')
  let pkgInfo = { name: 'dsh-pele-mermaid', version: 'unknown' }
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
      pkgInfo = { name: pkg.name ?? 'dsh-pele-mermaid', version: pkg.version ?? 'unknown' }
    } catch {
      /* keep fallback */
    }
  }

  return {
    schemaVersion: 1,
    pathBase: 'run-dir',
    generatedAt: new Date().toISOString(),
    runId: runId ?? path.basename(resolvedDir),
    package: pkgInfo,
    evidenceFiles,
  }
}

/**
 * Build and write `manifest.json` for a run directory.
 *
 * By default (`overwrite: false`), refuses to overwrite an existing
 * `manifest.json` (`flag: 'wx'`). Even when `overwrite: true` is passed:
 *  - frozen directories (`docs/evidence/**`, `tests/fixtures/screenshots/**`,
 *    or any directory containing `PUBLICATION.md`) are never overwritable;
 *  - a staging directory is overwritable only when `runId` is explicitly
 *    supplied and matches the directory's `.run-id` owner marker.
 *
 * @param {{
 *   dir: string,
 *   root?: string,
 *   manifestPath?: string,
 *   files?: string[],
 *   runId?: string,
 *   overwrite?: boolean,
 * }} options
 */
export async function writeManifest(options) {
  if (!options || !options.dir || typeof options.dir !== 'string') {
    throw new Error('writeManifest requires a target `dir`')
  }
  const resolvedRoot = path.resolve(options?.root ?? ROOT)
  const resolvedDir = path.resolve(resolvedRoot, options.dir)
  if (!existsSync(resolvedDir)) {
    throw new Error(`evidence directory does not exist: ${resolvedDir}`)
  }
  const realDir = await resolveRealPath(resolvedDir)
  const resolvedManifest = options.manifestPath
    ? path.resolve(resolvedRoot, options.manifestPath)
    : path.join(resolvedDir, 'manifest.json')
  const realManifest = await resolveRealPath(resolvedManifest)
  const manifestParentDir = path.dirname(resolvedManifest)
  const realManifestParentDir = path.dirname(realManifest)
  if (
    manifestParentDir !== resolvedDir ||
    realManifestParentDir !== realDir
  ) {
    throw new Error(
      `manifestPath must reside directly inside the owning run directory (${resolvedDir}): ${resolvedManifest}`,
    )
  }
  const overwrite = options?.overwrite === true

  if (existsSync(resolvedManifest)) {
    const manifestStat = await lstat(resolvedManifest)
    if (manifestStat.isSymbolicLink()) {
      throw new Error(`refusing to write manifest through symbolic link: ${resolvedManifest}`)
    }
    if (!overwrite) {
      throw new Error(
        `refusing to overwrite existing manifest (freeze baseline protected): ${resolvedManifest}`,
      )
    }
    if (
      (await isFrozenPath(resolvedRoot, resolvedDir)) ||
      (await isFrozenPath(resolvedRoot, resolvedManifest)) ||
      existsSync(path.join(resolvedDir, 'PUBLICATION.md')) ||
      existsSync(path.join(manifestParentDir, 'PUBLICATION.md')) ||
      existsSync(path.join(realManifestParentDir, 'PUBLICATION.md'))
    ) {
      throw new Error(
        `refusing to overwrite manifest in frozen evidence directory: ${resolvedManifest}`,
      )
    }
    const explicitRunId = typeof options.runId === 'string' ? options.runId.trim() : ''
    const markerPath = path.join(realManifestParentDir, OWNER_MARKER_FILE)
    if (!explicitRunId || !existsSync(markerPath)) {
      throw new Error(
        `refusing to overwrite staging manifest without explicit runId and ${OWNER_MARKER_FILE} marker: ${resolvedManifest}`,
      )
    }
    const markerStat = await lstat(markerPath)
    if (markerStat.isSymbolicLink()) {
      throw new Error(`refusing to trust symbolic link ${OWNER_MARKER_FILE}: ${markerPath}`)
    }
    const owner = (await readFile(markerPath, 'utf8')).trim()
    if (owner !== explicitRunId) {
      throw new Error(
        `refusing to overwrite manifest owned by run "${owner}" (current run "${explicitRunId}"): ${resolvedManifest}`,
      )
    }
  }

  const manifest = await buildManifest({
    ...options,
    root: resolvedRoot,
    manifestPath: resolvedManifest,
  })
  const writeFlag = overwrite ? 'w' : 'wx'
  await writeFile(resolvedManifest, JSON.stringify(manifest, null, 2) + '\n', {
    encoding: 'utf8',
    flag: writeFlag,
  })
  return { manifestPath: resolvedManifest, manifest }
}

/**
 * Validate a manifest's `evidenceFiles` against disk.
 *
 * Path resolution is strictly determined by `manifest.pathBase`:
 *  - `"run-dir"` (default for all new manifests): every entry is resolved
 *    strictly inside `manifestDir`; missing files never fall back to `root`.
 *  - `"repo-root"` or `legacyRootPaths: true` (for the historical 2026-10-19
 *    manifest without `pathBase`): every entry is resolved strictly inside
 *    `root`.
 *
 * @param {{
 *   manifestPath?: string,
 *   dir?: string,
 *   root?: string,
 *   legacyRootPaths?: boolean,
 * }} options
 */
export async function checkManifest({
  manifestPath,
  dir,
  root = ROOT,
  legacyRootPaths = false,
} = {}) {
  const resolvedRoot = path.resolve(root)
  const resolvedDir = dir ? path.resolve(resolvedRoot, dir) : null
  const resolvedManifest = manifestPath
    ? path.resolve(resolvedRoot, manifestPath)
    : resolvedDir
      ? path.join(resolvedDir, 'manifest.json')
      : null

  if (!resolvedManifest || !existsSync(resolvedManifest)) {
    throw new Error(`manifest file does not exist: ${resolvedManifest ?? '<unspecified>'}`)
  }

  const raw = JSON.parse(await readFile(resolvedManifest, 'utf8'))
  const evidenceFiles = raw?.evidenceFiles
  if (!evidenceFiles || typeof evidenceFiles !== 'object' || Object.keys(evidenceFiles).length === 0) {
    throw new Error(`manifest has no evidenceFiles entries: ${resolvedManifest}`)
  }

  const manifestDir = resolvedDir ?? path.dirname(resolvedManifest)
  /** @type {string} */
  let baseDir
  if (raw.pathBase === 'run-dir') {
    baseDir = manifestDir
  } else if (raw.pathBase === 'repo-root') {
    baseDir = resolvedRoot
  } else if (raw.pathBase === undefined) {
    baseDir = legacyRootPaths ? resolvedRoot : manifestDir
  } else {
    throw new Error(`unsupported manifest pathBase: ${JSON.stringify(raw.pathBase)}`)
  }

  const realBaseDir = await resolveRealPath(baseDir)
  const realManifest = await resolveRealPath(resolvedManifest)

  /** @type {string[]} */
  const errors = []
  let checkedCount = 0

  for (const [entryKey, expected] of Object.entries(evidenceFiles)) {
    if (typeof entryKey !== 'string' || entryKey.trim() === '' || path.isAbsolute(entryKey)) {
      errors.push(`invalid evidence file key: ${String(entryKey)}`)
      continue
    }

    const targetPath = path.resolve(baseDir, entryKey)
    const relToBase = path.relative(baseDir, targetPath)
    if (relToBase === '' || relToBase.startsWith('..') || path.isAbsolute(relToBase)) {
      errors.push(`evidence file escapes pathBase: ${entryKey}`)
      continue
    }

    if (
      targetPath === resolvedManifest ||
      entryKey === 'manifest.json' ||
      (path.basename(entryKey) === path.basename(resolvedManifest) &&
        path.dirname(targetPath) === path.dirname(resolvedManifest))
    ) {
      errors.push(`manifest lists itself in evidenceFiles: ${entryKey}`)
      continue
    }

    if (!existsSync(targetPath)) {
      errors.push(`missing evidence file: ${entryKey}`)
      continue
    }

    const realTarget = await resolveRealPath(targetPath)
    if (realTarget === realManifest) {
      errors.push(`manifest lists itself in evidenceFiles: ${entryKey}`)
      continue
    }
    if (!isInsideDir(realTarget, realBaseDir)) {
      errors.push(`evidence file resolves outside pathBase: ${entryKey}`)
      continue
    }

    const actual = await hashFile(targetPath)
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
      errors.push(
        `mismatch for ${entryKey}: expected ${expected.bytes}B/${expected.sha256}, got ${actual.bytes}B/${actual.sha256}`,
      )
      continue
    }
    checkedCount += 1
  }

  if (errors.length > 0) {
    const err = new Error(`manifest check failed (${errors.length} issue(s)):\n  - ${errors.join('\n  - ')}`);
    /** @type {any} */ (err).errors = errors
    throw err
  }

  return {
    ok: true,
    manifestPath: resolvedManifest,
    checkedCount,
    manifest: raw,
  }
}

/**
 * Explicit Git-history archival audit (`--verify-archives`).
 *
 * Requires a full Git repository containing the historical commits (`6b66a2a…`,
 * `a819777…`, `e59a294…`). Kept separate from `npm test` so source archives and
 * shallow clones can run the behavioral test suite without `.git` history.
 *
 * @param {{ root?: string }} [options]
 */
export async function verifyHistoricalArchives({ root = ROOT } = {}) {
  const resolvedRoot = path.resolve(root)
  const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
  const commitA81 = 'a8197776c879ca60af2e2d7800b67e60dd014d92'
  const commitE59 = 'e59a2945bc085b27420c13eda0b836afaeee500d'
  const commit6b6 = '6b66a2a201a1f26733fd2919db1fa5b5169f2295'

  for (const commit of [commit6b6, commitA81, commitE59]) {
    try {
      execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
        cwd: resolvedRoot,
        stdio: 'ignore',
      })
    } catch {
      throw new Error(
        `historical commit ${commit} is unavailable in ${resolvedRoot} (shallow clone or source archive); fetch full git history before running --verify-archives`,
      )
    }
  }

  // 1. Restore and verify all 14 evidenceFiles of the 2026-10-19 manifest from a819777
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-verify-archives-'))
  try {
    const manifestBytes = execFileSync(
      'git',
      ['show', `${commitA81}:docs/evidence/manifest.json`],
      { cwd: resolvedRoot },
    )
    if (
      manifestBytes.length !== 8462 ||
      sha256(manifestBytes) !== '5b2e95b480d7992af5a5ee56b917fd1c1b7a950b77b1f850de1daf81360b8e5b'
    ) {
      throw new Error('2026-10-19 manifest identity mismatch in commit a819777')
    }
    const manifest = JSON.parse(manifestBytes.toString('utf8'))
    const manifestPath = path.join(tmp, 'docs', 'evidence', 'manifest.json')
    await mkdir(path.dirname(manifestPath), { recursive: true })
    await writeFile(manifestPath, manifestBytes)

    for (const relPath of Object.keys(manifest.evidenceFiles)) {
      const fileBytes = execFileSync('git', ['show', `${commitA81}:${relPath}`], {
        cwd: resolvedRoot,
        maxBuffer: 10 * 1024 * 1024,
      })
      const target = path.join(tmp, relPath)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, fileBytes)
    }

    const restoredCheck = await checkManifest({
      manifestPath,
      root: tmp,
      legacyRootPaths: true,
    })

    // 2. Verify the two deduplicated 2026-11-17 console wrapper logs in commit e59a294
    const hostProbeLog = execFileSync(
      'git',
      ['show', `${commitE59}:docs/evidence/2026-11-17/host-probe.log`],
      { cwd: resolvedRoot },
    )
    if (
      hostProbeLog.length !== 1553 ||
      sha256(hostProbeLog) !== '1bb01ff1751b57d952403e39fb060891c8678e5e157cb4ab426e14557d390a2b'
    ) {
      throw new Error('2026-11-17 host-probe.log mismatch in commit e59a294')
    }
    const visualLog = execFileSync(
      'git',
      ['show', `${commitE59}:docs/evidence/2026-11-17/visual.log`],
      { cwd: resolvedRoot },
    )
    if (
      visualLog.length !== 1923 ||
      sha256(visualLog) !== 'b5c5e0a1355b28723d6c46a195da12cdef8a3f9e344f39cffc5383eb42cb1dce'
    ) {
      throw new Error('2026-11-17 visual.log mismatch in commit e59a294')
    }

    // 3. Verify all five 0.1.0 baseline screenshots in commit 6b66a2a (VERIFICATION-HISTORY §3)
    const expected010Captures = [
      [
        'tests/fixtures/screenshots/fixture-light.png',
        328743,
        '94bc70361e27dd31bb7d6a0949472bf60a43bb4d96ab02f0fa80cd2fa9f66b9a',
      ],
      [
        'tests/fixtures/screenshots/fixture-dark.png',
        333277,
        'c23cec5a30ea54f08640895bf1cc7f499e9a391f774d4a735ab205702ea2ba39',
      ],
      [
        'tests/fixtures/screenshots/fixture-source-view.png',
        333460,
        '587e83d9c60e312000197173965b0eb866f06b143b1b074360c21b76832e244b',
      ],
      [
        'tests/fixtures/screenshots/fixture-font-refresh.png',
        333389,
        'eb71722822003c9df9ba63590fae7326528a45559fb8df6841e5b8b8fe4fb4d7',
      ],
      [
        'tests/fixtures/screenshots/fixture-teardown.png',
        231100,
        'b05d4a5f4a7fc168d1fe716d7d95387605e9583b06fb1d1ad6b8ebaa4d04a290',
      ],
    ]
    for (const [relPath, expectedBytes, expectedSha] of expected010Captures) {
      const pngBytes = execFileSync(
        'git',
        ['show', `${commit6b6}:${relPath}`],
        { cwd: resolvedRoot, maxBuffer: 10 * 1024 * 1024 },
      )
      if (pngBytes.length !== expectedBytes || sha256(pngBytes) !== expectedSha) {
        throw new Error(`0.1.0 ${relPath} mismatch in commit 6b66a2a`)
      }
    }

    return {
      ok: true,
      restored20261019Files: restoredCheck.checkedCount,
      verified010Captures: expected010Captures.length,
      verifiedCommits: [commit6b6, commitA81, commitE59],
    }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const verifyArchives = args.includes('--verify-archives')
  const overwrite = args.includes('--overwrite')
  const legacyRootPaths = args.includes('--legacy-root-paths')
  const dir = args.find((a) => a.startsWith('--dir='))?.slice('--dir='.length)
  const manifestPath = args.find((a) => a.startsWith('--manifest='))?.slice('--manifest='.length)
  const rootArg = args.find((a) => a.startsWith('--root='))?.slice('--root='.length)
  const effectiveRoot = rootArg ? path.resolve(ROOT, rootArg) : ROOT
  const runId = args.find((a) => a.startsWith('--run-id='))?.slice('--run-id='.length)
  const filesArg = args.find((a) => a.startsWith('--files='))?.slice('--files='.length)
  const files = filesArg ? filesArg.split(',').map((s) => s.trim()).filter(Boolean) : undefined

  if (verifyArchives) {
    const res = await verifyHistoricalArchives({ root: effectiveRoot })
    console.log(
      `manifest: PASS (--verify-archives: ${res.restored20261019Files}/14 files from a819777, deduplicated logs from e59a294, ${res.verified010Captures}/5 0.1.0 captures from 6b66a2a)`,
    )
    return
  }

  if (check) {
    const result = await checkManifest({
      manifestPath,
      dir,
      root: effectiveRoot,
      legacyRootPaths,
    })
    console.log(
      `manifest: PASS (${result.checkedCount} files verified in ${path.relative(effectiveRoot, result.manifestPath)})`,
    )
    return
  }

  if (!dir) {
    throw new Error(
      'usage: node scripts/manifest.mjs --dir=<run-dir> [--manifest=<path>] [--root=<dir>] [--files=a,b] [--run-id=<id>] [--overwrite] [--legacy-root-paths] [--check]',
    )
  }
  const { manifestPath: writtenPath, manifest } = await writeManifest({
    dir,
    manifestPath,
    files,
    runId,
    overwrite,
    root: effectiveRoot,
  })
  console.log(
    `manifest: wrote ${path.relative(effectiveRoot, writtenPath)} (${Object.keys(manifest.evidenceFiles).length} files)`,
  )
}

const IS_MAIN =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (IS_MAIN) {
  main().catch((error) => {
    console.error('manifest: FAIL —', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
