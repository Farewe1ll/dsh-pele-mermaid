#!/usr/bin/env node
/**
 * Real-profile install verification for dsh-pele-mermaid.
 *
 * Proves the README's two load-bearing claims against the real `dsh` binary,
 * WITHOUT touching any user profile:
 *
 *   A. ACTIVE — the package installs into a throwaway profile, the composed
 *      config contains its Loader row, the composed client boot graph
 *      (`globalThis["__DSH_BOOT__"]`) contains an entry with id
 *      "dsh-pele-mermaid" and a batch URL, and that URL serves the built bundle
 *      with the `window.__ModuleLoader__.load({id:"dsh-pele-mermaid"` wrapper.
 *
 *   B. DISABLED — adding `{ id, disabled: true }` to that throwaway profile's
 *      cordis.patch.yml removes the entry from the boot graph entirely: the
 *      index HTML contains zero occurrences of the plugin id, its /plugins
 *      route 404s, and `--dump-config` shows the row as disabled. To make
 *      "DSH exactly normal" concrete, the plugin is then uninstalled and the
 *      boot graph is compared with the disabled one (rev-normalized, because
 *      the loader's per-boot `rev` values are not stable across boots).
 *
 * ISOLATION (hard requirement): every dsh command runs with
 * `DSH_HOME=<mkdtemp under os.tmpdir()>`, pnpm's store is redirected into that
 * temp dir, and the temp dir is deleted on success. The real ~/.dsh profiles
 * and the running Desktop app are never read or written.
 *
 * Usage:
 *   node scripts/verify-install.mjs            # run, clean up temp dir on pass
 *   node scripts/verify-install.mjs --keep     # keep the temp dir for inspection
 *   node scripts/verify-install.mjs --output=docs/evidence/install.json
 *   DSH_BIN=/path/to/dsh node scripts/verify-install.mjs
 *
 * Exit code 0 only if every step passes; logs each command and observation.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_ID = 'dsh-pele-mermaid'
const BUNDLE_PATH = path.join(ROOT, 'lib', 'client.js')
const KEEP_TEMP = process.argv.includes('--keep')
const OUTPUT_PATH = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length)
const DSH_BIN = process.env.DSH_BIN || 'dsh'
const THEME_PACKAGE = '@deepseek-ai/dsh-client-ui-theme'

/** @type {string | null} */
let currentStep = null
/** @type {Record<string, unknown>} */
const evidence = {}
let tempRoot = ''

/* -------------------------------------------------------------------------- */
/* Logging / assertions                                                       */
/* -------------------------------------------------------------------------- */

function log(message = '') {
  console.log(message)
}

function beginStep(title) {
  currentStep = title
  log(`\n--- ${title} ---`)
}

function pass(message) {
  log(`[PASS] ${message}`)
}

function note(key, value) {
  evidence[key] = value
  log(`       ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
}

function normalizeWhitespace(text) {
  return String(text).replace(/\r\n/g, '\n')
}

/* -------------------------------------------------------------------------- */
/* Process helpers                                                            */
/* -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run one command to completion, capturing stdout/stderr.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number }} [options]
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function runCommand(command, args, { cwd = ROOT, env = {}, timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(result)
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      finish(new Error(`timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => finish(error))
    child.on('close', (code) => finish(null, { code, stdout, stderr }))
  })
}

/**
 * Run a dsh command with the isolated DSH_HOME and log a redacted command line.
 * @param {string[]} args
 * @param {{ timeoutMs?: number, label?: string }} [options]
 */
async function runDsh(args, { timeoutMs = 180_000, label = null } = {}) {
  const shown = [DSH_BIN, ...args].join(' ')
  if (label) log(`$ ${shown}   # ${label}`)
  else log(`$ ${shown}`)
  const result = await runCommand(DSH_BIN, args, {
    env: dshEnv(),
    timeoutMs,
  })
  const combined = normalizeWhitespace(result.stdout + result.stderr).trim()
  if (combined) {
    for (const line of combined.split('\n').slice(-40)) log(`    ${line}`)
  }
  return result
}

/** Environment used for EVERY dsh invocation: isolated home + temp pnpm store. */
function dshEnv() {
  return {
    DSH_HOME: path.join(tempRoot, 'home'),
    npm_config_store_dir: path.join(tempRoot, 'pnpm-store'),
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    NO_COLOR: '1',
  }
}

/** @param {string[]} args */
async function dshDumpConfig(args) {
  const result = await runDsh(args)
  return {
    ...result,
    text: normalizeWhitespace(result.stdout + result.stderr),
  }
}

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

/* -------------------------------------------------------------------------- */
/* Isolated web server lifecycle                                              */
/* -------------------------------------------------------------------------- */

/**
 * Start `dsh web --no-open` in an isolated profile and wait for its token URL.
 * @param {string} label
 */
async function startWebServer(label) {
  const port = await freePort()
  const logPath = path.join(tempRoot, 'logs', `${label}.log`)
  await mkdir(path.dirname(logPath), { recursive: true })
  log(`$ ${DSH_BIN} web --no-open --port ${port}   # ${label}, DSH_HOME=${path.join(tempRoot, 'home')}`)
  const child = spawn(DSH_BIN, ['web', '--no-open', '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, ...dshEnv() },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  const append = (chunk) => {
    output += chunk
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const tokenPattern = /dsh web: (http:\/\/127\.0\.0\.1:(\d+)\/\?(?:[^\s]*token=[A-Za-z0-9_-]+))/
  const startedAt = Date.now()
  /** @type {{ tokenUrl: string, port: string } | null} */
  let started = null
  while (Date.now() - startedAt < 90_000) {
    if (child.exitCode !== null) break
    const match = tokenPattern.exec(output)
    if (match) {
      started = { tokenUrl: match[1], port: match[2] }
      break
    }
    await sleep(100)
  }
  if (!started) {
    try {
      child.kill('SIGKILL')
    } catch {
      /* ignore */
    }
    throw new Error(`web server (${label}) did not print its token URL in 90s. Output:\n${output.slice(-3000)}`)
  }

  const server = {
    label,
    port: Number(started.port),
    tokenUrl: started.tokenUrl,
    baseUrl: `http://127.0.0.1:${started.port}/`,
    output: () => output,
    async stop() {
      if (child.exitCode !== null) return output
      const exited = new Promise((resolve) => child.once('exit', resolve))
      child.kill('SIGTERM')
      const killer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }, 10_000)
      await Promise.race([exited, sleep(12_000)])
      clearTimeout(killer)
      await writeFile(logPath, output, 'utf8')
      return output
    },
  }

  // Authenticate: the printed URL is the only way to obtain the session cookie.
  const response = await fetch(server.tokenUrl, { redirect: 'manual' })
  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  assert.ok(setCookies.length > 0, 'dsh web token URL must set an auth cookie')
  const cookie = setCookies[0].split(';')[0]
  assert.match(cookie, /^dsh-auth-/, 'auth cookie must be the dsh-auth cookie')
  server.cookie = cookie
  log(`    authenticated (cookie name ${cookie.split('=')[0]}, token redacted)`)
  return server
}

/**
 * Fetch a URL from the isolated web server with its auth cookie.
 * @param {string} url
 * @param {string} cookie
 */
async function fetchWithAuth(url, cookie) {
  const response = await fetch(url, {
    headers: { cookie },
    redirect: 'manual',
  })
  const body = await response.text()
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    body,
  }
}

/**
 * Fetch the authenticated index HTML.
 * @param {{ baseUrl: string, cookie?: string }} server
 */
async function fetchIndex(server) {
  assert.ok(server.cookie, 'server must be authenticated before fetching the index')
  const response = await fetchWithAuth(server.baseUrl, server.cookie)
  assert.equal(response.status, 200, `GET / must return 200, got ${response.status}`)
  assert.match(response.contentType, /text\/html/, 'index must be HTML')
  return response.body
}

/* -------------------------------------------------------------------------- */
/* Boot graph parsing                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Extract and parse `globalThis["__DSH_BOOT__"] = {...}` from the index HTML.
 * The object is embedded unescaped inside a <script> tag; string-aware bracket
 * matching keeps it robust against `{`/`}` inside boot URLs or release strings.
 * @param {string} html
 * @returns {{ boot: any, json: string }}
 */
function extractBoot(html) {
  const markers = ['globalThis["__DSH_BOOT__"]', 'window.__DSH_BOOT__', '__DSH_BOOT__']
  let markerIndex = -1
  for (const marker of markers) {
    markerIndex = html.indexOf(marker)
    if (markerIndex >= 0) break
  }
  assert.ok(markerIndex >= 0, 'index HTML must contain a __DSH_BOOT__ assignment')
  const start = html.indexOf('{', markerIndex)
  assert.ok(start >= 0, '__DSH_BOOT__ must be assigned an object')

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        const json = html.slice(start, index + 1)
        return { boot: JSON.parse(json), json }
      }
    }
  }
  throw new Error('unterminated __DSH_BOOT__ object')
}

/**
 * Stable structural view of a boot graph: per-boot `rev` values change on every
 * boot even for an identical profile (loader build ids), so they are
 * normalized away. Everything else (entry ids/order/inject/external, batch
 * phases, batch entry lists) must be identical between equal profiles.
 * @param {any} boot
 */
function normalizeBoot(boot) {
  const json = JSON.stringify(boot)
    .replace(/rev=[0-9a-f]+/g, 'rev=<rev>')
    .replace(/"rev":"[0-9a-f]+"/g, '"rev":"<rev>"')
  return JSON.parse(json)
}

/** @param {any} boot */
function bootEntry(boot, id = PLUGIN_ID) {
  return Array.isArray(boot?.entries) ? boot.entries.find((entry) => entry?.id === id) : undefined
}

/* -------------------------------------------------------------------------- */
/* Main verification                                                          */
/* -------------------------------------------------------------------------- */

async function main() {
  const startedAt = Date.now()
  log('dsh-pele-mermaid — real-profile install / disable verification')
  log(`workspace: ${ROOT}`)
  log(`dsh:       ${DSH_BIN}`)
  log(`node:      ${process.version}`)

  /* ---------------------------------------------------------------------- */
  beginStep('0. preflight (isolated temp home, bundle identity)')

  if (!existsSync(BUNDLE_PATH)) {
    throw new Error('lib/client.js is missing — run `npm run build` first.')
  }
  const bundleBytes = await readFile(BUNDLE_PATH)
  const bundleText = bundleBytes.toString('utf8')
  const bundleSha256 = createHash('sha256').update(bundleBytes).digest('hex')
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, PLUGIN_ID, 'package name must be dsh-pele-mermaid')
  assert.ok(
    bundleText.startsWith(`window.__ModuleLoader__.load({id:${JSON.stringify(PLUGIN_ID)}`),
    'built bundle must start with the module-loader wrapper',
  )
  note('bundle.path', path.relative(ROOT, BUNDLE_PATH))
  note('bundle.bytes', bundleBytes.length)
  note('bundle.sha256', bundleSha256)

  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-verify-install-'))
  const homeDir = path.join(tempRoot, 'home')
  const resolvedTemp = path.resolve(tempRoot)
  const resolvedRoot = path.resolve(os.tmpdir())
  assert.ok(
    resolvedTemp.startsWith(resolvedRoot + path.sep),
    `temp DSH_HOME must live under os.tmpdir(); refusing to continue with ${resolvedTemp}`,
  )
  await mkdir(path.join(tempRoot, 'evidence'), { recursive: true })
  note('temp.root', tempRoot)
  note('temp.dsh_home', homeDir)
  pass('isolated temp DSH_HOME created (real ~/.dsh profiles untouched)')

  const dshVersion = await runCommand(DSH_BIN, ['-V'], { env: dshEnv(), timeoutMs: 30_000 })
  if (dshVersion.code !== 0) {
    throw new Error(`dsh -V failed (${dshVersion.code}): ${dshVersion.stdout}${dshVersion.stderr}`)
  }
  note('dsh.version', dshVersion.stdout.trim())

  /** @type {Array<() => Promise<unknown>>} */
  const serversToStop = []
  let succeeded = false
  try {
    /* -------------------------------------------------------------------- */
    beginStep('1. install the plugin into a throwaway web profile')
    const install = await runDsh(['plugin', '--profile', 'web', 'add', ROOT], { label: 'install from workspace path' })
    assert.equal(install.code, 0, `plugin install failed with exit ${install.code}`)
    const profileDir = path.join(homeDir, 'profiles', 'web')
    const profilePackage = JSON.parse(await readFile(path.join(profileDir, 'package.json'), 'utf8'))
    assert.equal(
      profilePackage.dependencies?.[PLUGIN_ID] !== undefined,
      true,
      'profile package.json must depend on dsh-pele-mermaid',
    )
    assert.ok(
      Array.isArray(profilePackage.dsh?.profile?.bundles) && profilePackage.dsh.profile.bundles.includes(PLUGIN_ID),
      'bundled profile must list dsh-pele-mermaid as a bundle layer',
    )
    note('install.profile.dependency', profilePackage.dependencies[PLUGIN_ID])
    note('install.profile.bundles', profilePackage.dsh.profile.bundles)
    pass('plugin installed as a bundle layer in the throwaway web profile')

    /* -------------------------------------------------------------------- */
    beginStep('2. composed config contains the Loader row (active)')
    const activeConfig = await dshDumpConfig(['--profile', 'web', '--dump-config'])
    assert.equal(activeConfig.code, 0, '--dump-config failed')
    assert.ok(activeConfig.text.includes('# == dsh-pele-mermaid'), 'dump-config must list the dsh-pele-mermaid patch layer')
    const activeSection = configSection(activeConfig.text, `# == ${PLUGIN_ID}`)
    assert.match(activeSection, new RegExp(`^- id: ${PLUGIN_ID}$`, 'm'), 'dump-config must contain the inserted Loader row')
    assert.match(activeSection, new RegExp(`^  name: ${PLUGIN_ID}$`, 'm'), 'Loader row name must be the package name')
    assert.equal(/disabled:\s*true/.test(activeSection), false, 'active Loader row must not be disabled')
    note('dump-config.active.section', activeSection.trim().replace(/\n/g, ' | '))
    await writeFile(path.join(tempRoot, 'evidence', 'dump-config.active.yml'), activeConfig.text, 'utf8')
    pass('composed config contains an active dsh-pele-mermaid Loader row')

    /* -------------------------------------------------------------------- */
    beginStep('3. active boot graph: entry with id dsh-pele-mermaid + bundle route')
    const activeServer = await startWebServer('web-active')
    serversToStop.push(() => activeServer.stop())
    const activeHtml = await fetchIndex(activeServer)
    note('active.index.bytes', Buffer.byteLength(activeHtml))
    await mkdir(path.join(tempRoot, 'evidence'), { recursive: true })
    await writeFile(path.join(tempRoot, 'evidence', 'index.active.html'), activeHtml, 'utf8')

    const activeBoot = extractBoot(activeHtml)
    await writeFile(path.join(tempRoot, 'evidence', 'boot.active.json'), JSON.stringify(activeBoot.boot, null, 2), 'utf8')
    const activeEntry = bootEntry(activeBoot.boot)
    assert.ok(activeEntry, 'active boot graph must contain an entry with id "dsh-pele-mermaid"')
    assert.match(
      String(activeEntry.url),
      /^plugins\/\?\?dsh-pele-mermaid\/client\.js&rev=[0-9a-f]+$/,
      `boot entry URL must be the plugin bundle batch URL, got ${JSON.stringify(activeEntry.url)}`,
    )
    const urlRev = /rev=([0-9a-f]+)$/.exec(activeEntry.url)?.[1]
    assert.equal(activeEntry.rev, urlRev, 'entry.rev must match the URL rev')
    assert.ok(Array.isArray(activeEntry.inject) && activeEntry.inject.includes(THEME_PACKAGE), 'entry.inject must declare the theme service package')
    assert.ok(
      activeBoot.boot.batches.some((batch) => Array.isArray(batch.entries) && batch.entries.includes(PLUGIN_ID)),
      'boot graph batches must schedule dsh-pele-mermaid',
    )
    assert.ok(
      activeHtml.includes('dsh-pele-mermaid/client.js'),
      'index HTML must preload/register the plugin bundle',
    )
    assert.ok(
      activeBoot.boot.entries.length > 1,
      'boot graph must still contain the shipped DSH client entries',
    )
    note('active.boot.entry', activeEntry)
    note('active.boot.entries', activeBoot.boot.entries.length)
    note('active.boot.batches', activeBoot.boot.batches.length)
    note('active.boot.release', activeBoot.boot.release)
    note('active.html.pluginOccurrences', (activeHtml.match(/dsh-pele-mermaid/g) || []).length)

    const routePath = activeEntry.url
    const routeUrl = `${activeServer.baseUrl}${routePath}`
    log(`$ curl (authenticated) ${routeUrl.replace(/&rev=[0-9a-f]+$/, '&rev=<rev>')}`)
    const route = await fetchWithAuth(routeUrl, activeServer.cookie)
    assert.equal(route.status, 200, `plugin bundle route must return 200, got ${route.status}`)
    assert.match(route.contentType, /javascript/, `plugin bundle route must serve JavaScript, got ${route.contentType}`)
    assert.ok(
      route.body.startsWith(`window.__ModuleLoader__.load({id:${JSON.stringify(PLUGIN_ID)}`),
      'served route must start with the module-loader wrapper for dsh-pele-mermaid',
    )
    assert.ok(
      route.body.startsWith(bundleText),
      'served route must be the committed lib/client.js bytes (+ loader source-map suffix)',
    )
    const suffix = route.body.slice(bundleText.length)
    assert.match(
      suffix,
      /^;\n\/\/# sourceMappingURL=.*dsh-pele-mermaid\/client\.js\.map&rev=[0-9a-f]+\n$/,
      `served route must only append the loader source-map suffix, got ${JSON.stringify(suffix.slice(0, 120))}`,
    )
    note('active.route.status', route.status)
    note('active.route.contentType', route.contentType)
    note('active.route.bytes', Buffer.byteLength(route.body))
    note('active.route.servedOverCommittedBytes', Buffer.byteLength(route.body) - bundleBytes.length)
    note('active.route.suffix', suffix.replace(/\n/g, '\\n'))
    note('active.route.hasWrapper', route.body.startsWith(`window.__ModuleLoader__.load({id:${JSON.stringify(PLUGIN_ID)}`))
    await writeFile(path.join(tempRoot, 'evidence', 'route.active.client.js'), route.body, 'utf8')
    pass('active boot graph entry present and its bundle route serves the wrapped built bundle')

    await activeServer.stop()
    serversToStop.length = 0
    pass('active web server stopped')

    /* -------------------------------------------------------------------- */
    beginStep('4. DISABLED: patch the row off and prove it leaves the boot graph')
    const patchPath = path.join(profileDir, 'cordis.patch.yml')
    const disabledPatch = [
      '# Verification: keep the package installed but disable its Loader row.',
      `- id: ${PLUGIN_ID}`,
      `  name: ${PLUGIN_ID}`,
      '  disabled: true',
      '',
    ].join('\n')
    await writeFile(patchPath, disabledPatch, 'utf8')
    note('disabled.patch.file', patchPath)
    note('disabled.patch.content', disabledPatch.trim().replace(/\n/g, ' | '))

    const disabledConfig = await dshDumpConfig(['--profile', 'web', '--dump-config'])
    assert.equal(disabledConfig.code, 0, '--dump-config (disabled) failed')
    const disabledSection = configSection(disabledConfig.text, `# == ${PLUGIN_ID}`)
    assert.match(disabledSection, /patched by .*cordis\.patch\.yml/, 'dump-config must annotate the user patch layer')
    assert.match(disabledSection, new RegExp(`^- id: ${PLUGIN_ID}$`, 'm'))
    assert.match(disabledSection, /^  disabled: true$/m, 'composed config must carry the disabled flag')
    note('dump-config.disabled.section', disabledSection.trim().replace(/\n/g, ' | '))
    await writeFile(path.join(tempRoot, 'evidence', 'dump-config.disabled.yml'), disabledConfig.text, 'utf8')
    pass('composed config shows the row as disabled (package still installed)')

    const disabledServer = await startWebServer('web-disabled')
    serversToStop.push(() => disabledServer.stop())
    const disabledHtml = await fetchIndex(disabledServer)
    note('disabled.index.bytes', Buffer.byteLength(disabledHtml))
    await writeFile(path.join(tempRoot, 'evidence', 'index.disabled.html'), disabledHtml, 'utf8')
    const disabledBoot = extractBoot(disabledHtml)
    await writeFile(path.join(tempRoot, 'evidence', 'boot.disabled.json'), JSON.stringify(disabledBoot.boot, null, 2), 'utf8')

    assert.equal(bootEntry(disabledBoot.boot), undefined, 'disabled boot graph must NOT contain the dsh-pele-mermaid entry')
    assert.equal(
      disabledBoot.boot.batches.some((batch) => Array.isArray(batch.entries) && batch.entries.includes(PLUGIN_ID)),
      false,
      'disabled boot graph batches must not schedule dsh-pele-mermaid',
    )
    assert.equal(
      (disabledHtml.match(/dsh-pele-mermaid/g) || []).length,
      0,
      'disabled index HTML must contain ZERO occurrences of the plugin id (no preload, no boot entry)',
    )
    note('disabled.boot.entries', disabledBoot.boot.entries.length)
    note('disabled.boot.batches', disabledBoot.boot.batches.length)
    note('disabled.html.pluginOccurrences', 0)
    note('disabled.html.shrunkByBytes', Buffer.byteLength(activeHtml) - Buffer.byteLength(disabledHtml))

    // No route is served for the disabled plugin: the previously valid path 404s
    // on the disabled server (a new port, so rebuild the URL against it).
    const disabledRoute = await fetchWithAuth(`${disabledServer.baseUrl}${routePath}`, disabledServer.cookie)
    assert.equal(disabledRoute.status, 404, `disabled plugin route must 404, got ${disabledRoute.status}`)
    note('disabled.route.status', disabledRoute.status)
    note('disabled.route.bytes', Buffer.byteLength(disabledRoute.body))
    pass('disabled boot graph omits the plugin entirely and its /plugins route 404s')

    await disabledServer.stop()
    serversToStop.length = 0
    pass('disabled web server stopped')

    /* -------------------------------------------------------------------- */
    beginStep('5. "DSH exactly normal": disabled boot graph == freshly uninstalled profile')
    const remove = await runDsh(['plugin', '--profile', 'web', 'remove', PLUGIN_ID], { label: 'uninstall completely' })
    assert.equal(remove.code, 0, `plugin remove failed with exit ${remove.code}`)
    const removedPackage = JSON.parse(await readFile(path.join(profileDir, 'package.json'), 'utf8'))
    assert.equal(removedPackage.dependencies?.[PLUGIN_ID], undefined, 'removed profile must no longer depend on the plugin')
    assert.equal(
      (removedPackage.dsh?.profile?.bundles || []).includes(PLUGIN_ID),
      false,
      'removed profile must no longer list the plugin bundle layer',
    )
    note('removed.profile.bundles', removedPackage.dsh.profile.bundles)

    const removedServer = await startWebServer('web-removed')
    serversToStop.push(() => removedServer.stop())
    const removedHtml = await fetchIndex(removedServer)
    await writeFile(path.join(tempRoot, 'evidence', 'index.removed.html'), removedHtml, 'utf8')
    const removedBoot = extractBoot(removedHtml)
    await writeFile(path.join(tempRoot, 'evidence', 'boot.removed.json'), JSON.stringify(removedBoot.boot, null, 2), 'utf8')
    assert.equal(bootEntry(removedBoot.boot), undefined, 'removed boot graph must not contain the plugin entry')

    const disabledNormalized = normalizeBoot(disabledBoot.boot)
    const removedNormalized = normalizeBoot(removedBoot.boot)
    assert.deepEqual(
      disabledNormalized,
      removedNormalized,
      'disabled boot graph must be structurally identical to a freshly uninstalled DSH profile (rev-normalized)',
    )
    note('parity.disabledEqualsRemoved', true)
    note('parity.entries', removedBoot.boot.entries.length)
    note('parity.batches', removedBoot.boot.batches.length)
    note('parity.note', 'per-boot rev values normalized; entry ids/order/inject and batch structure compared exactly')
    pass('disabled state is structurally identical to an uninstalled DSH profile')

    await removedServer.stop()
    serversToStop.length = 0
    pass('removed web server stopped')

    succeeded = true
  } finally {
    for (const stopServer of serversToStop) {
      try {
        await stopServer()
      } catch (error) {
        log(`warning: failed to stop a web server: ${error instanceof Error ? error.message : error}`)
      }
    }
    if (!succeeded) {
      log(`\nverify-install: FAIL — evidence kept for inspection at ${tempRoot}`)
    }
  }

  /* ---------------------------------------------------------------------- */
  beginStep('6. cleanup')
  if (succeeded && !KEEP_TEMP) {
    await rm(tempRoot, { recursive: true, force: true })
    assert.equal(existsSync(tempRoot), false, 'temp DSH_HOME must be deleted after a successful run')
    pass(`temp DSH_HOME removed (${tempRoot})`)
    note('cleanup.tempRemoved', true)
    evidence['cleanup.tempPath'] = tempRoot
  } else {
    pass(`temp DSH_HOME kept at ${tempRoot}`)
    note('cleanup.tempRemoved', false)
  }

  /* ---------------------------------------------------------------------- */
  const elapsed = Date.now() - startedAt
  log('\n=== verify-install: PASS ===')
  log(`elapsed: ${elapsed} ms`)
  log('reproduce (all commands used DSH_HOME=<temp dir under os.tmpdir()>):')
  log(`  DSH_HOME=<tmp>/home dsh plugin --profile web add ${ROOT}`)
  log('  DSH_HOME=<tmp>/home dsh --profile web --dump-config')
  log('  DSH_HOME=<tmp>/home dsh web --no-open --port <free port>')
  log('  # fetch the printed ?token= URL, keep the dsh-auth cookie, then GET / and the boot-graph batch URL')
  log(
    `  active boot entry: ${JSON.stringify({
      id: evidence['active.boot.entry']?.id,
      url: evidence['active.boot.entry']?.url,
      inject: evidence['active.boot.entry']?.inject,
    })}`,
  )
  log(`  served route: ${evidence['active.route.status']} ${evidence['active.route.bytes']} bytes (committed bundle + loader source-map suffix)`)
  log(`  disabled: entry absent, ${String(evidence['disabled.html.pluginOccurrences'])} HTML occurrences, route ${evidence['disabled.route.status']}`)
  log('  disabled boot graph == freshly uninstalled profile (rev-normalized): true')
  if (OUTPUT_PATH) {
    const target = path.resolve(ROOT, OUTPUT_PATH)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, JSON.stringify({
      status: 'PASS', date: new Date().toISOString(), elapsedMs: elapsed,
      packageVersion: pkg.version, nodeVersion: process.version,
      scope: 'Isolated DSH web profile install/disable/remove and served bundle identity; no live chat interaction.',
      evidence,
    }, null, 2) + '\n')
  }
}

/**
 * Extract one `# == <layer>` section from --dump-config output (up to the next
 * layer comment).
 * @param {string} text
 * @param {string} header
 */
function configSection(text, header) {
  const index = text.indexOf(header)
  assert.ok(index >= 0, `dump-config must contain a section starting with ${JSON.stringify(header)}`)
  const rest = text.slice(index + header.length)
  const next = rest.indexOf('\n# == ')
  return next >= 0 ? rest.slice(0, next) : rest
}

main().catch((error) => {
  log('')
  log(`verify-install: FAIL at step: ${currentStep || 'unknown'}`)
  log(`reason: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  process.exitCode = 1
})
