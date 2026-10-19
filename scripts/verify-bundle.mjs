#!/usr/bin/env node
/**
 * `npm run verify` — artifact verification entry point.
 *
 * Two steps, in order, because order matters: a stale bundle must never be
 * "verified" by a smoke test that happens to still pass.
 *
 *   1. `node scripts/build-client.mjs --check`
 *      Rebuilds in memory and fails if lib/client.js is stale, missing, or if
 *      the wrapper/id/CDN checks fail. This is the only way to prove that the
 *      committed bundle matches src/client/.
 *   2. `node --test tests/bundle.test.mjs`
 *      Evaluates the committed bundle in jsdom: module-loader wrapper, factory
 *      without require, mount/toggle/theme/teardown behaviour, and the
 *      MutationObserver path.
 *
 * Exit code 0 only when both steps pass. Prints the bundle identity (size,
 * SHA-256, module id) so the result can be copied into docs/VERIFICATION.md.
 *
 * Usage: npm run verify
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NODE = process.execPath
const BUNDLE_PATH = path.join(ROOT, 'lib/client.js')

/**
 * @param {string} label
 * @param {string[]} nodeArgs
 */
function runStep(label, nodeArgs) {
  console.log(`\n=== ${label} ===`)
  console.log(`$ ${path.basename(NODE)} ${nodeArgs.join(' ')}`)
  const startedAt = Date.now()
  const result = spawnSync(NODE, nodeArgs, {
    cwd: ROOT,
    stdio: 'inherit',
  })
  const duration = Date.now() - startedAt
  if (result.error) {
    console.error(`\n${label}: failed to launch — ${result.error.message}`)
    return { ok: false, duration }
  }
  const ok = result.status === 0
  console.log(`${label}: ${ok ? 'PASS' : 'FAIL'} (${duration} ms, exit ${result.status})`)
  return { ok, duration }
}

function bundleIdentity() {
  if (!existsSync(BUNDLE_PATH)) {
    return { exists: false }
  }
  const bytes = readFileSync(BUNDLE_PATH)
  const text = bytes.toString('utf8')
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const match = /^window\.__ModuleLoader__\.load\(\{id:("(?:[^"\\]|\\.)*")/.exec(text)
  return {
    exists: true,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    wrapperId: match ? JSON.parse(match[1]) : null,
    packageName: pkg.name,
    packageVersion: pkg.version,
  }
}

function main() {
  const startedAt = Date.now()
  console.log('dsh-pele-mermaid verify — build check + bundle smoke test')
  console.log(`workspace: ${ROOT}`)
  console.log(`node:      ${process.version} (${NODE})`)

  const buildStep = runStep('step 1/2: build --check (bundle freshness)', ['scripts/build-client.mjs', '--check'])
  if (!buildStep.ok) {
    console.error(
      '\nverify: FAIL — lib/client.js is missing or stale. Run `npm run build`, review the diff, and re-run `npm run verify`.',
    )
    process.exitCode = 1
    return
  }

  const testStep = runStep('step 2/2: bundle smoke test (jsdom, real built bundle)', ['--test', 'tests/bundle.test.mjs'])

  const identity = bundleIdentity()
  console.log('\n=== bundle identity ===')
  if (identity.exists) {
    console.log(`file:        ${path.relative(ROOT, BUNDLE_PATH)}`)
    console.log(`bytes:       ${identity.bytes.toLocaleString('en-US')}`)
    console.log(`sha256:      ${identity.sha256}`)
    console.log(`wrapper id:  ${JSON.stringify(identity.wrapperId)} (package ${identity.packageName}@${identity.packageVersion})`)
  } else {
    console.log('file:        missing')
  }

  const ok = testStep.ok && identity.exists && identity.wrapperId === identity.packageName
  const total = Date.now() - startedAt
  console.log(`\nverify: ${ok ? 'PASS' : 'FAIL'} — 2 steps in ${total} ms`)
  if (!ok) process.exitCode = 1
}

main()
