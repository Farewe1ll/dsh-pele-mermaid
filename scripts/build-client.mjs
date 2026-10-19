#!/usr/bin/env node
/**
 * Build the dsh-pele-mermaid browser half.
 *
 * The DSH client-modules Loader consumes one script per package, registered
 * through `window.__ModuleLoader__.load({ id, factory })`, where `id` is the
 * owning package name and `factory(require)` returns the module exports. Pele
 * is bundled in (it is synchronous and dependency-free), so the factory never
 * calls `require`.
 *
 * Usage:
 *   node scripts/build-client.mjs            # write lib/client.js
 *   node scripts/build-client.mjs --check    # build in memory and compare
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = path.join(ROOT, 'src/client/index.js')
const OUT = path.join(ROOT, 'lib/client.js')
const CHECK = process.argv.includes('--check')
const TARGETS = ['chrome110', 'safari16']

/** CDN/network markers that must never appear in the bundled browser half. */
const FORBIDDEN_MARKERS = ['cdn.jsdelivr.net', 'unpkg.com', 'fastly.jsdelivr.net', 'esm.sh', 'skypack']

async function main() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  const id = pkg.name
  if (typeof id !== 'string' || id.length === 0) throw new Error('package.json: missing package name')
  if (pkg.exports?.['./client'] !== './lib/client.js') {
    throw new Error('package.json: exports["./client"] must be "./lib/client.js"')
  }

  const startedAt = Date.now()
  const result = await build({
    entryPoints: [ENTRY],
    absWorkingDir: ROOT,
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    target: TARGETS,
    minify: true,
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
    charset: 'utf8',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  if (result.outputFiles.length !== 1) {
    throw new Error(`expected exactly one output file, got ${result.outputFiles.length}`)
  }
  const bundled = result.outputFiles[0].text

  const banner =
    `window.__ModuleLoader__.load({id:${JSON.stringify(id)},` +
    `factory:(require)=>{var module={exports:{}};var exports=module.exports;\n`
  const footer = `\nreturn module.exports;}});\n`
  const output = banner + bundled + footer

  for (const marker of FORBIDDEN_MARKERS) {
    if (output.includes(marker)) throw new Error(`browser bundle references a CDN: ${marker}`)
  }
  if (!output.includes(`id:${JSON.stringify(id)}`)) throw new Error('browser bundle is missing the module-loader registration')
  if (output.length > 4_000_000) throw new Error(`browser bundle is unexpectedly large: ${output.length} bytes`)

  const size = Buffer.byteLength(output, 'utf8')
  const duration = Date.now() - startedAt

  if (CHECK) {
    if (!existsSync(OUT)) throw new Error('lib/client.js does not exist; run the build without --check')
    const current = await readFile(OUT, 'utf8')
    if (current !== output) throw new Error('lib/client.js is stale; run `npm run build`')
    console.log(`build-client: up to date (${size} bytes, ${duration} ms)`)
    return
  }

  await mkdir(path.dirname(OUT), { recursive: true })
  await writeFile(OUT, output, 'utf8')
  console.log(`build-client: wrote lib/client.js (${size} bytes, ${duration} ms, module id "${id}")`)
}

main().catch((error) => {
  console.error('build-client failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
