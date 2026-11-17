#!/usr/bin/env node
/** Pack without hooks to avoid prepack recursion, then inspect the actual archive. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
export const PACKAGE_FILES = [
  'CHANGELOG.md', 'LICENSE', 'README.md', 'README.zh.md', 'THIRD-PARTY-NOTICES.txt',
  'cordis.patch.yml', 'docs/KNOWN-LIMITATIONS.md', 'index.js', 'lib/client.js', 'package.json',
].sort()

export function verifyInventory(files) {
  assert.deepEqual(files.map((file) => file.path).sort(), PACKAGE_FILES,
    'Package inventory changed: review missing or unexpected files before release')
}

export function verifyNotices(notices, upstream) {
  assert.ok(upstream.includes('Copyright (c) 2026 kepano'), 'Unexpected Pele license: review the upgrade')
  assert.ok(upstream.includes('Lucide Icons and Contributors'), 'Missing upstream Lucide notice')
  assert.ok(notices.includes(upstream.trim()), 'Ship the complete pinned Pele LICENSE, including Lucide ISC')
}

export async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-package-check-'))
  try {
    const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
    const lock = JSON.parse(await readFile(path.join(ROOT, 'package-lock.json'), 'utf8'))
    assert.equal(lock.version, pkg.version, 'Lockfile version must match the package')
    assert.equal(lock.packages[''].version, pkg.version, 'Lockfile root version must match')
    assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies, 'Lockfile dependencies must match')
    // npm_execpath uses the invoking npm version, including inside lifecycle hooks.
    const npm = process.env.npm_execpath
    const args = ['pack', '--ignore-scripts', '--json', '--pack-destination', tmp, '--cache', path.join(tmp, 'cache')]
    const output = execFileSync(npm ? process.execPath : 'npm', npm ? [npm, ...args] : args,
      { cwd: ROOT, encoding: 'utf8' })
    const [packed] = JSON.parse(output)
    verifyInventory(packed.files)
    execFileSync('tar', ['-xzf', path.join(tmp, packed.filename), '-C', tmp])
    const unpacked = path.join(tmp, 'package')
    // Check archive bytes against the checkout, rather than only npm's inventory.
    for (const file of PACKAGE_FILES) {
      assert.deepEqual(await readFile(path.join(unpacked, file)), await readFile(path.join(ROOT, file)), file)
    }
    verifyNotices(await readFile(path.join(unpacked, 'THIRD-PARTY-NOTICES.txt'), 'utf8'),
      await readFile(path.join(ROOT, 'node_modules/pele/LICENSE'), 'utf8'))
    const host = await import(pathToFileURL(path.join(unpacked, pkg.main)))
    assert.equal(typeof host.apply, 'function')
    const patch = await readFile(path.join(unpacked, pkg.dsh.bundle.patch), 'utf8')
    assert.ok(patch.includes(`name: ${pkg.name}`))
    let registration
    vm.runInNewContext(await readFile(path.join(unpacked, pkg.exports['./client']), 'utf8'), {
      window: { __ModuleLoader__: { load(value) { registration = value } } },
    }, { timeout: 5000 })
    assert.equal(registration?.id, pkg.name)
    const client = registration.factory(() => { throw new Error('Unexpected runtime dependency') })
    assert.equal(typeof client.apply, 'function')
    assert.deepEqual(Array.from(client.inject), ['theme'])
    console.log(`verify-package: PASS — ${packed.entryCount} files; ${packed.size} packed bytes; notices, entry points and archive bytes checked`)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1 })
}
