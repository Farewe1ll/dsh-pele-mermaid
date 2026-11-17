/**
 * Behavioral verification for Phase 2 tooling & evidence-governance contracts:
 *  1. `scripts/verify-install.mjs`: tarball-authoritative expectations and
 *     byte-level route response verification (`resolveInstallExpectations`,
 *     `verifyServedRouteBody`).
 *  2. `scripts/verify-visual.mjs`: default `.artifacts/<run-id>/` staging
 *     isolation, frozen-zone write protection, and `.run-id` owner-marker
 *     checks (`prepareVisualOutputDir`).
 *  3. `scripts/manifest.mjs`: manifest generation, self-exclusion, and
 *     `--check` integrity validation (`buildManifest`, `writeManifest`,
 *     `checkManifest`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  readTarballEntries,
  resolveInstallExpectations,
  verifyServedRouteBody,
} from '../scripts/verify-install.mjs'
import { prepareVisualOutputDir, writeVisualOutputFile } from '../scripts/verify-visual.mjs'
import {
  buildManifest,
  writeManifest,
  checkManifest,
  hashFile,
  verifyHistoricalArchives,
} from '../scripts/manifest.mjs'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/**
 * Build a minimal POSIX ustar `.tgz` archive in memory from `{ [path]: Buffer | string }`.
 * @param {Record<string, Buffer | string>} entries
 * @returns {Buffer}
 */
function createTestTgz(entries) {
  /** @type {Buffer[]} */
  const blocks = []
  for (const [name, raw] of Object.entries(entries)) {
    const content = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8')
    const header = Buffer.alloc(512, 0)
    header.write(name, 0, Math.min(Buffer.byteLength(name), 100), 'utf8')
    header.write('0000644\0', 100, 8, 'ascii')
    header.write('0000000\0', 108, 8, 'ascii')
    header.write('0000000\0', 116, 8, 'ascii')
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii')
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii')
    // Checksum placeholder: 8 spaces (0x20) at 148..156
    header.fill(0x20, 148, 156)
    header[156] = '0'.charCodeAt(0)
    header.write('ustar\0', 257, 6, 'ascii')
    header.write('00', 263, 2, 'ascii')
    let sum = 0
    for (let i = 0; i < 512; i += 1) sum += header[i]
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii')
    blocks.push(header)
    blocks.push(content)
    const remainder = content.length % 512
    if (remainder !== 0) {
      blocks.push(Buffer.alloc(512 - remainder, 0))
    }
  }
  blocks.push(Buffer.alloc(1024, 0))
  return gzipSync(Buffer.concat(blocks))
}

test('tarball mode: candidate tarball differs from workspace bundle -> uses tarball expectations and records matchesWorkspaceBundle: false', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-tarball-diff-'))
  try {
    await mkdir(path.join(tmp, 'lib'), { recursive: true })
    const wsBundle = Buffer.from(
      'window.__ModuleLoader__.load({id:"dsh-pele-mermaid",factory:(require)=>{/* workspace */}});\n',
      'utf8',
    )
    const tgzBundle = Buffer.from(
      'window.__ModuleLoader__.load({id:"dsh-pele-mermaid",factory:(require)=>{/* candidate-tarball */}});\n',
      'utf8',
    )
    await writeFile(path.join(tmp, 'lib', 'client.js'), wsBundle)
    await writeFile(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'dsh-pele-mermaid', version: '0.1.9-ws' }),
    )
    const tgzBytes = createTestTgz({
      'package/package.json': JSON.stringify({ name: 'dsh-pele-mermaid', version: '0.2.0-candidate' }),
      'package/lib/client.js': tgzBundle,
    })
    const tgzPath = path.join(tmp, 'candidate.tgz')
    await writeFile(tgzPath, tgzBytes)

    const resolved = await resolveInstallExpectations({
      sourceArg: 'candidate.tgz',
      workspaceRoot: tmp,
    })
    assert.equal(resolved.sourceKind, 'tarball')
    assert.equal(resolved.pkg.version, '0.2.0-candidate', 'must use tarball package.json version')
    assert.equal(resolved.bundleBytes.equals(tgzBundle), true, 'must use tarball lib/client.js bytes')
    assert.equal(resolved.bundleSha256, sha256(tgzBundle))
    assert.equal(resolved.matchesWorkspaceBundle, false)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('tarball mode: workspace lib/client.js is missing -> still validates standalone tarball and records matchesWorkspaceBundle: "unavailable"', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-tarball-nows-'))
  try {
    const tgzBundle = Buffer.from(
      'window.__ModuleLoader__.load({id:"dsh-pele-mermaid",factory:(require)=>{/* standalone */}});\n',
      'utf8',
    )
    const tgzBytes = createTestTgz({
      'package/package.json': JSON.stringify({ name: 'dsh-pele-mermaid', version: '0.2.0' }),
      'package/lib/client.js': tgzBundle,
    })
    const tgzPath = path.join(tmp, 'standalone.tgz')
    await writeFile(tgzPath, tgzBytes)

    const resolved = await resolveInstallExpectations({
      sourceArg: tgzPath,
      workspaceRoot: tmp,
    })
    assert.equal(resolved.sourceKind, 'tarball')
    assert.equal(resolved.bundleBytes.equals(tgzBundle), true)
    assert.equal(resolved.bundleSha256, sha256(tgzBundle))
    assert.equal(
      resolved.matchesWorkspaceBundle,
      'unavailable',
      'missing workspace bundle must be recorded as "unavailable", not false',
    )
    assert.equal(readTarballEntries(tgzBytes).size, 2)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('response comparison: valid bundle + valid loader suffix (including variable-length rev) passes and records response sha256', () => {
  const bundle = Buffer.from(
    'window.__ModuleLoader__.load({id:"dsh-pele-mermaid",factory:(require)=>{return {};}});\n',
    'utf8',
  )
  // 1) Historical 12-hex-char rev (73-byte suffix)
  const suffix12 = ';\n//# sourceMappingURL=??dsh-pele-mermaid/client.js.map&rev=203a6529fd35\n'
  assert.equal(Buffer.byteLength(suffix12), 73)
  const body12 = Buffer.concat([bundle, Buffer.from(suffix12, 'utf8')])
  const res12 = verifyServedRouteBody(body12, bundle)
  assert.equal(res12.bytes, body12.length)
  assert.equal(res12.sha256, sha256(body12))
  assert.equal(res12.servedOverCommittedBytes, 73)
  assert.equal(res12.prefixMatchesBundle, true)

  // 2) Variable-length rev (e.g. 20 hex chars -> 81-byte suffix) must also pass
  const suffix20 = ';\n//# sourceMappingURL=??dsh-pele-mermaid/client.js.map&rev=203a6529fd35deadbeef\n'
  assert.equal(Buffer.byteLength(suffix20), 81)
  const body20 = Buffer.concat([bundle, Buffer.from(suffix20, 'utf8')])
  const res20 = verifyServedRouteBody(body20, bundle)
  assert.equal(res20.servedOverCommittedBytes, 81)
  assert.equal(res20.sha256, sha256(body20))
})

test('response comparison: altered prefix, truncation, trailing garbage, and invalid UTF-8 with identical decoded string prefix all fail', () => {
  const basePrefix = Buffer.from(
    'window.__ModuleLoader__.load({id:"dsh-pele-mermaid",factory:(require)=>{/*',
    'utf8',
  )
  const baseTail = Buffer.from('*/}});\n', 'utf8')
  const validSuffix = Buffer.from(
    ';\n//# sourceMappingURL=??dsh-pele-mermaid/client.js.map&rev=abcdef012345\n',
    'utf8',
  )

  // Two buffers with distinct invalid UTF-8 bytes (0xc0 vs 0xc1) that decode to
  // the exact same UTF-8 string (both produce U+FFFD) under Buffer.toString('utf8').
  const expectedBundle = Buffer.concat([basePrefix, Buffer.from([0xc0]), baseTail])
  const spoofedBundle = Buffer.concat([basePrefix, Buffer.from([0xc1]), baseTail])
  const spoofedResponse = Buffer.concat([spoofedBundle, validSuffix])

  assert.equal(
    spoofedResponse.toString('utf8').startsWith(expectedBundle.toString('utf8')),
    true,
    'precondition: string startsWith would falsely pass on distinct invalid UTF-8 bytes',
  )
  assert.throws(
    () => verifyServedRouteBody(spoofedResponse, expectedBundle),
    /exact expected lib\/client\.js bytes/,
    'byte-level prefix check must reject distinct raw bytes even when UTF-8 strings match',
  )

  // Truncated response
  assert.throws(
    () => verifyServedRouteBody(expectedBundle.subarray(0, expectedBundle.length - 2), expectedBundle),
    /exact expected lib\/client\.js bytes/,
  )

  // Appended illegal trailing content after suffix
  const withExtra = Buffer.concat([expectedBundle, validSuffix, Buffer.from('/* extra */', 'utf8')])
  assert.throws(
    () => verifyServedRouteBody(withExtra, expectedBundle),
    /only append the loader source-map suffix/,
  )

  // Invalid UTF-8 in suffix
  const badSuffix = Buffer.concat([expectedBundle, Buffer.from([0xff, 0xfe])])
  assert.throws(
    () => verifyServedRouteBody(badSuffix, expectedBundle),
    /not valid UTF-8/,
  )
})

test('output protection: new staging directory succeeds; frozen directories reject even with --overwrite; staging --overwrite requires matching .run-id', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-visual-dir-'))
  try {
    // Set up fake frozen zones inside tmp root
    const screenshotsDir = path.join(tmp, 'tests', 'fixtures', 'screenshots')
    const evidenceRunDir = path.join(tmp, 'docs', 'evidence', '2026-11-17')
    await mkdir(screenshotsDir, { recursive: true })
    await mkdir(evidenceRunDir, { recursive: true })
    const pngFile = path.join(screenshotsDir, 'fixture-light.png')
    const jsonFile = path.join(evidenceRunDir, 'install.json')
    await writeFile(pngFile, 'original-png-bytes', 'utf8')
    await writeFile(jsonFile, '{"status":"PASS"}\n', 'utf8')
    const pngBefore = await hashFile(pngFile)
    const jsonBefore = await hashFile(jsonFile)

    // 1. Default output creates a new .artifacts/<run-id> directory with .run-id
    const fresh = await prepareVisualOutputDir({ root: tmp, runId: '2026-11-17-906b1cc2-001' })
    assert.equal(fresh.outputDir, path.join(tmp, '.artifacts', '2026-11-17-906b1cc2-001'))
    assert.equal((await readFile(path.join(fresh.outputDir, '.run-id'), 'utf8')).trim(), '2026-11-17-906b1cc2-001')

    // 2. Frozen screenshots directory is rejected even with overwrite: true
    await assert.rejects(
      () =>
        prepareVisualOutputDir({
          root: tmp,
          outputDirArg: 'tests/fixtures/screenshots',
          overwrite: true,
        }),
      /frozen historical screenshots directory/,
    )
    assert.deepEqual(await hashFile(pngFile), pngBefore, 'frozen screenshot file must remain untouched')

    // 3. Frozen non-empty docs/evidence directory is rejected even with overwrite: true
    await assert.rejects(
      () =>
        prepareVisualOutputDir({
          root: tmp,
          outputDirArg: 'docs/evidence/2026-11-17',
          overwrite: true,
        }),
      /frozen evidence directory/,
    )
    assert.deepEqual(await hashFile(jsonFile), jsonBefore, 'frozen evidence file must remain untouched')

    // 4. Staging directory with matching .run-id succeeds when overwrite: true, fails when overwrite: false or runId differs
    await writeFile(path.join(fresh.outputDir, 'dummy.png'), 'data', 'utf8')
    await assert.rejects(
      () =>
        prepareVisualOutputDir({
          root: tmp,
          outputDirArg: fresh.outputDir,
          runId: '2026-11-17-906b1cc2-001',
          overwrite: false,
        }),
      /without --overwrite/,
    )
    await assert.rejects(
      () =>
        prepareVisualOutputDir({
          root: tmp,
          outputDirArg: fresh.outputDir,
          runId: '2026-11-17-906b1cc2-002',
          overwrite: true,
        }),
      /owned by run/,
    )
    const reused = await prepareVisualOutputDir({
      root: tmp,
      outputDirArg: fresh.outputDir,
      runId: '2026-11-17-906b1cc2-001',
      overwrite: true,
    })
    assert.equal(reused.outputDir, fresh.outputDir)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('manifest: valid manifest passes --check, excludes itself, and fails when a file is missing or modified', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-manifest-'))
  try {
    const runDir = path.join(tmp, 'docs', 'evidence', 'run-01')
    await mkdir(runDir, { recursive: true })
    await writeFile(path.join(runDir, 'host-probe.json'), '{"status":"PASS"}\n', 'utf8')
    await writeFile(path.join(runDir, 'install.json'), '{"status":"PASS","route":200}\n', 'utf8')
    await writeFile(path.join(runDir, 'PUBLICATION.md'), '# Provenance notes\n', 'utf8')

    const { manifestPath, manifest } = await writeManifest({
      dir: 'docs/evidence/run-01',
      root: tmp,
    })
    assert.equal('manifest.json' in manifest.evidenceFiles, false, 'manifest must not list itself')
    assert.equal('PUBLICATION.md' in manifest.evidenceFiles, false, 'PUBLICATION.md provenance stays outside public file checks')
    assert.deepEqual(Object.keys(manifest.evidenceFiles), ['host-probe.json', 'install.json'])

    // Valid manifest passes checkManifest
    const checkResult = await checkManifest({ manifestPath, root: tmp })
    assert.equal(checkResult.ok, true)
    assert.equal(checkResult.checkedCount, 2)

    // Modifying a file causes checkManifest to fail
    await writeFile(path.join(runDir, 'host-probe.json'), '{"status":"TAMPERED"}\n', 'utf8')
    await assert.rejects(
      () => checkManifest({ manifestPath, root: tmp }),
      /mismatch for host-probe\.json/,
    )

    // Missing file causes checkManifest to fail
    await rm(path.join(runDir, 'host-probe.json'))
    await assert.rejects(
      () => checkManifest({ manifestPath, root: tmp }),
      /missing evidence file: host-probe\.json/,
    )

    // Explicit self-inclusion is rejected by both buildManifest and checkManifest
    await assert.rejects(
      () =>
        buildManifest({
          dir: 'docs/evidence/run-01',
          root: tmp,
          files: ['install.json', 'manifest.json'],
        }),
      /must not include itself/,
    )
    const circularManifest = {
      ...manifest,
      evidenceFiles: {
        'install.json': manifest.evidenceFiles['install.json'],
        'manifest.json': { bytes: 10, sha256: '0'.repeat(64) },
      },
    }
    await writeFile(manifestPath, JSON.stringify(circularManifest, null, 2), 'utf8')
    await assert.rejects(
      () => checkManifest({ manifestPath, root: tmp }),
      /manifest lists itself in evidenceFiles/,
    )
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('manifest [P2-1]: deleting a file in the run directory fails even when an identical file exists at the repo root', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-manifest-nofallback-'))
  try {
    const runDir = path.join(tmp, 'docs', 'evidence', 'run-nofallback')
    await mkdir(runDir, { recursive: true })
    const sameContent = '{"report":"identical-in-root-and-rundir"}\n'
    await writeFile(path.join(tmp, 'report.json'), sameContent, 'utf8')
    await writeFile(path.join(runDir, 'report.json'), sameContent, 'utf8')

    const { manifestPath, manifest } = await writeManifest({
      dir: 'docs/evidence/run-nofallback',
      root: tmp,
    })
    assert.equal(manifest.pathBase, 'run-dir')

    // Delete report.json from the run directory while keeping tmp/report.json intact
    await rm(path.join(runDir, 'report.json'))
    await assert.rejects(
      () => checkManifest({ manifestPath, root: tmp }),
      /missing evidence file: report\.json/,
      'checkManifest must not fall back to a same-named file at the repository root',
    )

    // Historical schema v1 manifest without pathBase only resolves against root when legacyRootPaths: true
    const legacyManifestPath = path.join(tmp, 'docs', 'evidence', 'legacy-manifest.json')
    const rootReportHash = await hashFile(path.join(tmp, 'report.json'))
    await writeFile(
      legacyManifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          evidenceFiles: {
            'report.json': rootReportHash,
          },
        },
        null,
        2,
      ),
      'utf8',
    )
    await assert.rejects(
      () => checkManifest({ manifestPath: legacyManifestPath, root: tmp, legacyRootPaths: false }),
      /missing evidence file: report\.json/,
    )
    const legacyOk = await checkManifest({
      manifestPath: legacyManifestPath,
      root: tmp,
      legacyRootPaths: true,
    })
    assert.equal(legacyOk.ok, true)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('manifest [P2-2]: writeManifest refuses to overwrite an existing manifest by default and never overwrites frozen evidence manifests', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-manifest-nooverwrite-'))
  try {
    // 1. Frozen evidence directory: second writeManifest is rejected even with overwrite: true
    const frozenRunDir = path.join(tmp, 'docs', 'evidence', 'run-frozen')
    await mkdir(frozenRunDir, { recursive: true })
    await writeFile(path.join(frozenRunDir, 'install.json'), '{"status":"PASS"}\n', 'utf8')
    const { manifestPath } = await writeManifest({
      dir: 'docs/evidence/run-frozen',
      root: tmp,
    })
    const originalManifestHash = await hashFile(manifestPath)

    // Tamper with the evidence file and attempt to regenerate the manifest
    await writeFile(path.join(frozenRunDir, 'install.json'), '{"status":"MODIFIED"}\n', 'utf8')
    await assert.rejects(
      () => writeManifest({ dir: 'docs/evidence/run-frozen', root: tmp }),
      /refusing to overwrite existing manifest/,
    )
    await assert.rejects(
      () =>
        writeManifest({
          dir: 'docs/evidence/run-frozen',
          root: tmp,
          overwrite: true,
          runId: 'run-frozen',
        }),
      /refusing to overwrite manifest in frozen evidence directory/,
    )
    assert.deepEqual(
      await hashFile(manifestPath),
      originalManifestHash,
      'frozen manifest.json must remain byte-for-byte unchanged',
    )
    await assert.rejects(
      () => checkManifest({ manifestPath, root: tmp }),
      /mismatch for install\.json/,
      'original manifest still catches the tampered file',
    )

    // 2. Staging directory outside frozen zones: requires overwrite: true AND matching .run-id
    const stagingDir = path.join(tmp, '.artifacts', 'staging-run-1')
    await mkdir(stagingDir, { recursive: true })
    await writeFile(path.join(stagingDir, '.run-id'), 'staging-run-1\n', 'utf8')
    await writeFile(path.join(stagingDir, 'visual.json'), '{"step":1}\n', 'utf8')

    await writeManifest({ dir: '.artifacts/staging-run-1', root: tmp, runId: 'staging-run-1' })
    await writeFile(path.join(stagingDir, 'visual.json'), '{"step":2}\n', 'utf8')

    await assert.rejects(
      () => writeManifest({ dir: '.artifacts/staging-run-1', root: tmp, runId: 'staging-run-1' }),
      /refusing to overwrite existing manifest/,
    )
    await assert.rejects(
      () =>
        writeManifest({
          dir: '.artifacts/staging-run-1',
          root: tmp,
          runId: 'wrong-run-id',
          overwrite: true,
        }),
      /owned by run/,
    )
    const updated = await writeManifest({
      dir: '.artifacts/staging-run-1',
      root: tmp,
      runId: 'staging-run-1',
      overwrite: true,
    })
    const checkUpdated = await checkManifest({ manifestPath: updated.manifestPath, root: tmp })
    assert.equal(checkUpdated.ok, true)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('output protection [P2-3]: symlinked directories, symlinked parents, and symlinked output files cannot bypass frozen-zone protection', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-visual-symlink-'))
  try {
    const screenshotsDir = path.join(tmp, 'tests', 'fixtures', 'screenshots')
    const evidenceDir = path.join(tmp, 'docs', 'evidence', '2026-11-17')
    await mkdir(screenshotsDir, { recursive: true })
    await mkdir(evidenceDir, { recursive: true })
    const pngPath = path.join(screenshotsDir, 'fixture-light.png')
    const evidencePath = path.join(evidenceDir, 'install.json')
    await writeFile(pngPath, 'pristine-historical-screenshot', 'utf8')
    await writeFile(evidencePath, '{"pristine":true}\n', 'utf8')
    // Even if an attacker plants a matching .run-id inside the target directory,
    // a symlink alias must still be rejected as a frozen zone.
    await writeFile(path.join(screenshotsDir, '.run-id'), 'spoof-run\n', 'utf8')
    const pngBefore = await hashFile(pngPath)
    const evidenceBefore = await hashFile(evidencePath)

    // 1. Direct directory symlink pointing to tests/fixtures/screenshots
    await mkdir(path.join(tmp, '.artifacts'), { recursive: true })
    const aliasShots = path.join(tmp, '.artifacts', 'alias-shots')
    await symlink(screenshotsDir, aliasShots)

    await assert.rejects(
      () =>
        prepareVisualOutputDir({
          root: tmp,
          outputDirArg: '.artifacts/alias-shots',
          runId: 'spoof-run',
          overwrite: true,
        }),
      /frozen historical screenshots directory/,
    )
    assert.deepEqual(await hashFile(pngPath), pngBefore)

    // 2. Non-existent child under a symlinked parent pointing into docs/evidence/2026-11-17
    const aliasEvidenceParent = path.join(tmp, '.artifacts', 'alias-evidence')
    await symlink(path.join(tmp, 'docs', 'evidence'), aliasEvidenceParent)
    await assert.rejects(
      () =>
        prepareVisualOutputDir({
          root: tmp,
          outputDirArg: '.artifacts/alias-evidence/2026-11-17',
          runId: 'spoof-run',
          overwrite: true,
        }),
      /frozen evidence directory/,
    )
    assert.deepEqual(await hashFile(evidencePath), evidenceBefore)

    // 3. Normal staging directory containing a file symlink to a frozen screenshot
    const { outputDir } = await prepareVisualOutputDir({
      root: tmp,
      runId: 'normal-staging-run',
    })
    await symlink(pngPath, path.join(outputDir, 'fixture-light.png'))

    await assert.rejects(
      () =>
        prepareVisualOutputDir({
          root: tmp,
          outputDirArg: outputDir,
          runId: 'normal-staging-run',
          overwrite: true,
        }),
      /containing symbolic link/,
    )
    await assert.rejects(
      () =>
        writeVisualOutputFile(outputDir, 'fixture-light.png', Buffer.from('clobbered'), {
          root: tmp,
        }),
      /symbolic link/,
    )
    assert.deepEqual(
      await hashFile(pngPath),
      pngBefore,
      'file symlink inside staging directory must never overwrite the frozen screenshot',
    )
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('publication record [P2-4]: 2026-11-17 PUBLICATION.md records the exact historical 15c30e9 and e59a294 artifact digests and deduplicated log locators', async () => {
  const pubText = await readFile(
    new URL('../docs/evidence/2026-11-17/PUBLICATION.md', import.meta.url),
    'utf8',
  )
  // 15c30e9 initial 0.2.0 pass
  assert.match(
    pubText,
    /738,710.*3259e916e0017a66090781493376b982ef2ab373be062bbb8795ec54cd913c82/,
  )
  assert.match(
    pubText,
    /295,928.*309aa03f57234182e7e5aa624005e70364f77e6f5c5951a10ca9b2dc84ebc96d/,
  )
  // e59a294 post-review pass
  assert.match(
    pubText,
    /739,526.*906b1cc2f77c99a41e8453d85bd1554e60ff36b7a9d12558b3e998a56f1ea4af/,
  )
  assert.match(
    pubText,
    /297,759.*824a8e06d5442f63cda6ef34efd96874a7f065b5820b4574b2e6941fe4acc630/,
  )
  // Deduplicated log hashes and commit locator recorded in PUBLICATION.md
  assert.match(
    pubText,
    /host-probe\.log.*1,553.*1bb01ff1751b57d952403e39fb060891c8678e5e157cb4ab426e14557d390a2b/,
  )
  assert.match(
    pubText,
    /visual\.log.*1,923.*b5c5e0a1355b28723d6c46a195da12cdef8a3f9e344f39cffc5383eb42cb1dce/,
  )
})

test('manifest [P2-5]: custom manifestPath outside the owning run directory is rejected and never overwrites another run directory manifest', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-manifest-crossdir-'))
  try {
    const dirA = path.join(tmp, '.artifacts', 'run-A')
    const dirB = path.join(tmp, '.artifacts', 'run-B')
    await mkdir(dirA, { recursive: true })
    await mkdir(dirB, { recursive: true })

    await writeFile(path.join(dirA, '.run-id'), 'run-A\n', 'utf8')
    await writeFile(path.join(dirA, 'probe.json'), '{"from":"A"}\n', 'utf8')

    await writeFile(path.join(dirB, '.run-id'), 'run-B\n', 'utf8')
    await writeFile(path.join(dirB, 'PUBLICATION.md'), '# Frozen B\n', 'utf8')
    await writeFile(path.join(dirB, 'probe.json'), '{"from":"B"}\n', 'utf8')

    const { manifestPath: manifestBPath } = await writeManifest({
      dir: '.artifacts/run-B',
      root: tmp,
      runId: 'run-B',
    })
    const manifestBHashBefore = await hashFile(manifestBPath)

    // Attempt to use run-A's matching .run-id to overwrite run-B's manifest via manifestPath
    await assert.rejects(
      () =>
        writeManifest({
          dir: '.artifacts/run-A',
          manifestPath: '.artifacts/run-B/manifest.json',
          root: tmp,
          runId: 'run-A',
          overwrite: true,
        }),
      /manifestPath must reside directly inside the owning run directory/,
    )
    await assert.rejects(
      () =>
        buildManifest({
          dir: '.artifacts/run-A',
          manifestPath: '.artifacts/run-B/manifest.json',
          root: tmp,
        }),
      /manifestPath must reside directly inside the owning run directory/,
    )
    assert.deepEqual(
      await hashFile(manifestBPath),
      manifestBHashBefore,
      'target manifest in run-B must remain byte-for-byte unchanged',
    )
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('output protection [P2-6]: brand-new docs/evidence/<run-id> path is rejected at preparation time without creating the directory or .run-id', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-visual-newevidence-'))
  try {
    await mkdir(path.join(tmp, 'docs', 'evidence'), { recursive: true })
    const newPublicRunDir = path.join(tmp, 'docs', 'evidence', '2026-11-18-new-run')

    await assert.rejects(
      () =>
        prepareVisualOutputDir({
          root: tmp,
          outputDirArg: 'docs/evidence/2026-11-18-new-run',
          runId: '2026-11-18-new-run',
        }),
      /frozen evidence directory/,
    )
    assert.equal(
      existsSync(newPublicRunDir),
      false,
      'prepareVisualOutputDir must not create the public evidence directory or leave a .run-id behind',
    )

    // Also via a symlinked parent pointing to docs/evidence
    await mkdir(path.join(tmp, '.artifacts'), { recursive: true })
    await symlink(path.join(tmp, 'docs', 'evidence'), path.join(tmp, '.artifacts', 'ev-link'))
    await assert.rejects(
      () =>
        prepareVisualOutputDir({
          root: tmp,
          outputDirArg: '.artifacts/ev-link/2026-11-18-symlink-new',
          runId: '2026-11-18-symlink-new',
          overwrite: true,
        }),
      /frozen evidence directory/,
    )
    assert.equal(
      existsSync(path.join(tmp, 'docs', 'evidence', '2026-11-18-symlink-new')),
      false,
      'symlinked new public directory must not be created either',
    )
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('verifyHistoricalArchives: reports actionable unavailable-history diagnostic in a .git-less source directory', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-test-nogit-'))
  try {
    await assert.rejects(
      () => verifyHistoricalArchives({ root: tmp }),
      /shallow clone or source archive.*fetch full git history before running --verify-archives/,
    )
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})
