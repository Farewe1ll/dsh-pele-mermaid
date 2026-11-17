#!/usr/bin/env node
/** Reproduce screenshots and JSON together using an isolated headless Chrome. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, writeFile, rm } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OWNER_MARKER_FILE = '.run-id'
/** Wide fixture column: one class-diagram row, CJK labels wrapped but not cramped. */
const WIDE = { width: 1400, height: 2400, deviceScaleFactor: 1, mobile: false }
/**
 * Narrow fixture column: 720px wide crosses Pele's 640px autoDirection
 * breakpoint for this harness page (content column ~602px), so separate class
 * groups wrap onto new rows and the CJK/label cases are exercised in a chat-
 * like narrow column. 760px would *not* cross it (content column ~642px).
 */
const DESKTOP = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }
const SHORT = { width: 1400, height: 500, deviceScaleFactor: 1, mobile: false }
const NARROW = { width: 720, height: 2200, deviceScaleFactor: 1, mobile: false }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * Generate a distinct `<YYYY-MM-DD>-<short-bundle-sha>-<seq>` run identifier.
 * @param {string} [root]
 */
export async function generateVisualRunId(root = ROOT) {
  const date = new Date().toISOString().slice(0, 10)
  let shortSha = 'nobundle'
  try {
    const bundleBytes = await readFile(path.join(root, 'lib', 'client.js'))
    shortSha = sha256(bundleBytes).slice(0, 8)
  } catch {
    /* fallback to nobundle */
  }
  const seq = randomBytes(3).toString('hex')
  return `${date}-${shortSha}-${seq}`
}

/**
 * Resolve the canonical real path of `targetPath`, even when leaf segments do
 * not exist yet, by resolving `realpath` on the deepest existing ancestor.
 *
 * @param {string} targetPath
 * @returns {Promise<string>}
 */
export async function resolveRealPath(targetPath) {
  const abs = path.resolve(targetPath)
  /** @type {string[]} */
  const tail = []
  let current = abs
  while (true) {
    try {
      await lstat(current)
      break
    } catch {
      const parent = path.dirname(current)
      if (parent === current) break
      tail.unshift(path.basename(current))
      current = parent
    }
  }
  let resolvedBase = current
  try {
    resolvedBase = await realpath(current)
  } catch {
    /* keep lexical path when realpath cannot resolve a broken link */
  }
  return tail.length > 0 ? path.join(resolvedBase, ...tail) : resolvedBase
}

/**
 * Check whether `targetPath` (lexically or after resolving symlinks on existing
 * ancestors) lies inside a frozen directory (`docs/evidence/**` or
 * `tests/fixtures/screenshots/**`).
 *
 * @param {string} root
 * @param {string} targetPath
 * @returns {Promise<'screenshots' | 'evidence' | null>}
 */
async function classifyFrozenZone(root, targetPath) {
  const lexicalRoot = path.resolve(root)
  const lexicalTarget = path.resolve(targetPath)
  const realRoot = await resolveRealPath(lexicalRoot)
  const realTarget = await resolveRealPath(lexicalTarget)

  for (const [r, t] of [
    [lexicalRoot, lexicalTarget],
    [realRoot, realTarget],
  ]) {
    const screenshotsDir = path.join(r, 'tests', 'fixtures', 'screenshots')
    if (t === screenshotsDir || t.startsWith(screenshotsDir + path.sep)) {
      return 'screenshots'
    }
  }
  for (const [r, t] of [
    [lexicalRoot, lexicalTarget],
    [realRoot, realTarget],
  ]) {
    const evidenceDir = path.join(r, 'docs', 'evidence')
    if (t === evidenceDir || t.startsWith(evidenceDir + path.sep)) {
      return 'evidence'
    }
  }
  return null
}

/**
 * Write one visual output artifact (`fixture-*.png`, `visual-evidence.json`, or
 * `.run-id`) into `outputDir`, refusing to write through a symbolic link or into
 * a frozen zone.
 *
 * @param {string} outputDir
 * @param {string} filename
 * @param {Buffer | string} data
 * @param {{ root?: string }} [options]
 */
export async function writeVisualOutputFile(
  outputDir,
  filename,
  data,
  { root = ROOT } = {},
) {
  if (
    typeof filename !== 'string' ||
    filename.trim() === '' ||
    path.basename(filename) !== filename ||
    filename === '.' ||
    filename === '..'
  ) {
    throw new Error(`invalid visual output filename: ${String(filename)}`)
  }
  const targetPath = path.join(path.resolve(outputDir), filename)
  try {
    const info = await lstat(targetPath)
    if (info.isSymbolicLink()) {
      throw new Error(`refusing to write visual output through symbolic link: ${targetPath}`)
    }
  } catch (error) {
    if (error && /** @type {any} */ (error).code !== 'ENOENT') throw error
  }

  const dirZone = await classifyFrozenZone(root, outputDir)
  const fileZone = await classifyFrozenZone(root, targetPath)
  if (dirZone === 'screenshots' || fileZone === 'screenshots') {
    throw new Error(`refusing to write to frozen historical screenshots directory: ${targetPath}`)
  }
  if (dirZone === 'evidence' || fileZone === 'evidence') {
    throw new Error(`refusing to write to frozen evidence directory: ${targetPath}`)
  }

  await writeFile(targetPath, data)
}

/**
 * Resolve and prepare the output directory for a visual verification run:
 *  - Without `outputDirArg`, defaults to `.artifacts/<run-id>/` under `root`.
 *  - Raw visual captures must always target a staging directory; any path under
 *    the public/frozen zones (`tests/fixtures/screenshots/**` or
 *    `docs/evidence/**`, whether existing or brand-new, direct or via symlink)
 *    is rejected immediately in the preparation step without creating any
 *    directory or `.run-id` marker.
 *  - Rejects `outputDir` if `outputDir` itself is a symbolic link or contains
 *    symbolic link entries.
 *  - For staging directories outside frozen zones, a non-empty directory is
 *    writable only when `overwrite: true` AND the directory's `.run-id` owner
 *    marker exists (as a regular file) and equals `runId`.
 *
 * @param {{
 *   root?: string,
 *   outputDirArg?: string | null,
 *   runId?: string | null,
 *   overwrite?: boolean,
 * }} [options]
 * @returns {Promise<{ outputDir: string, runId: string }>}
 */
export async function prepareVisualOutputDir({
  root = ROOT,
  outputDirArg = null,
  runId = null,
  overwrite = false,
} = {}) {
  const resolvedRoot = path.resolve(root)
  const effectiveRunId =
    typeof runId === 'string' && runId.trim() !== ''
      ? runId.trim()
      : await generateVisualRunId(resolvedRoot)
  const outputDir =
    typeof outputDirArg === 'string' && outputDirArg.trim() !== ''
      ? path.resolve(resolvedRoot, outputDirArg.trim())
      : path.join(resolvedRoot, '.artifacts', effectiveRunId)

  let outputStat = null
  try {
    outputStat = await lstat(outputDir)
  } catch (error) {
    if (!error || /** @type {any} */ (error).code !== 'ENOENT') throw error
  }

  const zone = await classifyFrozenZone(resolvedRoot, outputDir)
  if (zone === 'screenshots') {
    throw new Error(
      `refusing to write to frozen historical screenshots directory: ${outputDir}`,
    )
  }
  if (zone === 'evidence') {
    throw new Error(
      `refusing to write raw visual capture to frozen evidence directory (use a staging directory first): ${outputDir}`,
    )
  }

  if (outputStat && outputStat.isSymbolicLink()) {
    throw new Error(`refusing to use symbolic link as visual output directory: ${outputDir}`)
  }

  const markerPath = path.join(outputDir, OWNER_MARKER_FILE)
  if (!outputStat) {
    await mkdir(outputDir, { recursive: true })
    await writeVisualOutputFile(outputDir, OWNER_MARKER_FILE, `${effectiveRunId}\n`, {
      root: resolvedRoot,
    })
    return { outputDir, runId: effectiveRunId }
  }

  const dirEntries = await readdir(outputDir, { withFileTypes: true })
  for (const entry of dirEntries) {
    if (entry.isSymbolicLink()) {
      throw new Error(
        `refusing to write to directory containing symbolic link "${entry.name}": ${outputDir}`,
      )
    }
  }

  if (dirEntries.length === 0) {
    await writeVisualOutputFile(outputDir, OWNER_MARKER_FILE, `${effectiveRunId}\n`, {
      root: resolvedRoot,
    })
    return { outputDir, runId: effectiveRunId }
  }

  if (!overwrite) {
    throw new Error(
      `refusing to write to non-empty directory without --overwrite and matching .run-id: ${outputDir}`,
    )
  }

  if (!existsSync(markerPath)) {
    throw new Error(
      `refusing to overwrite directory without ${OWNER_MARKER_FILE} owner marker: ${outputDir}`,
    )
  }
  const markerStat = await lstat(markerPath)
  if (markerStat.isSymbolicLink()) {
    throw new Error(`refusing to trust symbolic link ${OWNER_MARKER_FILE}: ${markerPath}`)
  }
  const existingOwner = (await readFile(markerPath, 'utf8')).trim()
  if (existingOwner !== effectiveRunId) {
    throw new Error(
      `refusing to overwrite directory owned by run "${existingOwner}" (current run "${effectiveRunId}"): ${outputDir}`,
    )
  }
  return { outputDir, runId: effectiveRunId }
}

/** Relative luminance of #rrggbb / rgb(...) colors, for the export background. */
function luminanceOf(color) {
  let channels = null
  const hex = /^#([0-9a-f]{6})$/i.exec(String(color).trim())
  if (hex) {
    channels = [0, 2, 4].map((index) => Number.parseInt(hex[1].slice(index, index + 2), 16) / 255)
  } else {
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(String(color).trim())
    if (rgb) channels = [1, 2, 3].map((index) => Number(rgb[index]) / 255)
  }
  if (!channels) return null
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** Background rect facts from one downloaded SVG text. */
function backgroundOf(text) {
  const rect = /<rect[^>]*data-dsh-pele-mermaid-background[^>]*>/.exec(text)
  if (!rect) return null
  return {
    element: rect[0],
    fill: /fill="([^"]+)"/.exec(rect[0])?.[1] ?? null,
    width: /width="([^"]+)"/.exec(rect[0])?.[1] ?? null,
    height: /height="([^"]+)"/.exec(rect[0])?.[1] ?? null,
  }
}
async function main() {
  const outputDirArg = process.argv.find((arg) => arg.startsWith('--output-dir='))?.slice('--output-dir='.length) ?? null
  const runIdArg = process.argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length) ?? null
  const overwrite = process.argv.includes('--overwrite')
  const { outputDir: output, runId } = await prepareVisualOutputDir({
    root: ROOT,
    outputDirArg,
    runId: runIdArg,
    overwrite,
  })
  console.error(`verify-visual: run-id=${runId} output-dir=${output}`)

  const profile = await mkdtemp(path.join(os.tmpdir(), 'dsh-pele-visual-'))
  let server, chrome, ws
  const pending = new Map()
  let serial = 0
  async function until(fn, label, timeout = 15000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const value = await fn()
      if (value) return value
      await sleep(50)
    }
    throw new Error(`Timed out: ${label}`)
  }
  function send(method, params = {}) {
    const id = ++serial
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
      pending.set(id, { resolve, reject, timer })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  async function stop(child) {
    if (!child || child.exitCode !== null) return
    child.kill('SIGTERM')
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(3000)])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  /** Dispatch one real Escape keystroke through CDP (not a synthetic DOM event). */
  async function pressEscape() {
    const key = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  }
  try {
    let serverOutput = ''
  server = spawn(process.execPath, ['scripts/serve-fixture.mjs', '--port', '0', '--quiet'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', (chunk) => { serverOutput += chunk })
  server.stderr.on('data', (chunk) => { serverOutput += chunk })
  const url = await until(() => {
    if (server.exitCode !== null) throw new Error(serverOutput)
    return /serve-fixture: light (http[^\s]+)/.exec(serverOutput)?.[1]
  }, 'fixture server')
  // Normal runs keep Chrome's renderer sandbox. Restricted CI/agent sandboxes
  // cannot start it (the renderer target crashes right after Page.enable and
  // every CDP call then hangs), so that environment opts into sandbox-free
  // Chrome explicitly with DSH_VISUAL_CHROME_NO_SANDBOX=1.
  const sandboxEscape = process.env.DSH_VISUAL_CHROME_NO_SANDBOX === '1'
    ? ['--no-sandbox', '--disable-setuid-sandbox']
    : []
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', ...sandboxEscape, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let chromeErrors = ''
  chrome.stderr.on('data', (chunk) => { chromeErrors += chunk })
  const port = await until(async () => {
    if (chrome.exitCode !== null) throw new Error(chromeErrors)
    try { return Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]) } catch { return null }
  }, 'headless Chrome')
  const browser = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  ws = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  const exceptions = []
  const requests = []
  /** Error-level console/log entries (a ResizeObserver loop error shows up here). */
  const consoleErrors = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const promise = pending.get(message.id)
      if (!promise) return
      clearTimeout(promise.timer)
      pending.delete(message.id)
      if (message.error) promise.reject(new Error(JSON.stringify(message.error)))
      else promise.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails)
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '))
    } else if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
      consoleErrors.push(message.params.entry.text)
    } else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url)
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  try {
    await send('Log.enable')
  } catch {
    // Log domain is optional; Runtime.consoleAPICalled still carries page errors.
  }
  await send('Emulation.setDeviceMetricsOverride', WIDE)
  await send('Page.navigate', { url: `${url}?locale=en` })
  await until(() => evaluate('!!window.__fixture?.report().ready'), 'eight initial diagrams')
  await evaluate('document.fonts.ready.then(() => true)')
  const evidence = {
    status: 'PASS', date: new Date().toISOString(), browser: browser.Browser,
    scope: 'Browser fixture with static committed-shape Fiber objects; real React lifecycle is tested separately. P1 cases: CJK wrapping, class-diagram group wrapping (wide vs narrow column), generic angle-bracket labels, rich <sub>/<sup>/<code>/<kbd>/<samp> labels.',
    url, query: '?locale=en', viewport: WIDE,
    bundleSha256: sha256(await readFile(path.join(ROOT, 'lib/client.js'))), screenshots: {},
  }
  async function capture(name) {
    await evaluate('window.__fixture.updateReport()')
    await sleep(100)
    const report = await evaluate('window.__fixture.report()')
    assert.deepEqual(report.errors, [])
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    const filename = `fixture-${name}.png`
    await writeVisualOutputFile(output, filename, bytes, { root: ROOT })
    evidence.screenshots[filename] = { bytes: bytes.length, sha256: sha256(bytes) }
    return report
  }
  const flat = (entry, count) => Array.from({ length: count }, () => entry).flat()

  /* -------------------- downloaded-SVG capture harness -------------------- */
  // The plugin builds a Blob and clicks a temporary anchor. Keep that blob URL
  // alive and remember the click, then read the exact SVG text back in-page —
  // no file-system download behavior or browser flags needed.
  await evaluate(`(() => {
    window.__fixtureDownloads = [];
    window.__originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__fixtureDownloads.push({ href: this.href, name: this.download });
        return;
      }
      return window.__originalAnchorClick.call(this);
    };
    window.__originalRevokeObjectURL = URL.revokeObjectURL;
    URL.revokeObjectURL = function () {};
    return true;
  })()`)

  async function captureDownload(label) {
    const clicked = await evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.dsh-pele-mermaid-toolbar button[aria-label="Download SVG"]'))[0];
      if (!button || button.disabled) return false;
      window.__fixtureDownloads.length = 0;
      button.click();
      return true;
    })()`)
    assert.equal(clicked, true, `${label}: export button is enabled`)
    const download = await evaluate(`(async () => {
      for (let i = 0; i < 100 && window.__fixtureDownloads.length === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const entry = window.__fixtureDownloads[window.__fixtureDownloads.length - 1];
      if (!entry) return null;
      const text = await (await fetch(entry.href)).text();
      return { name: entry.name, bytes: text.length, text };
    })()`)
    assert.ok(download, `${label}: download captured`)
    assert.match(download.name, /^pele-[a-z-]+-\d{8}-\d{6}\.svg$/)
    return download
  }

  /* ---------------------------- wide column ---------------------------- */
  evidence.light = await capture('light')
  const light = evidence.light
  assert.equal(light.expectedDiagrams, 8)
  assert.equal(light.diagramKinds.length, 9)
  assert.deepEqual(light.diagramKinds, [
    'flowchart', 'sequenceDiagram', 'pie', 'gantt',
    'flowchart (CJK wrapping)', 'classDiagram (group wrapping)',
    'flowchart (generic labels)', 'flowchart (rich labels)', 'mermaid (invalid)',
  ])
  assert.equal(light.invalidSources, 1)
  assert.equal(light.dom.blocks, 10)
  assert.equal(light.dom.mountedContainers, 8)
  assert.equal(light.dom.hosts, 8)
  assert.equal(light.dom.diagramSvgs, 8)
  assert.deepEqual(light.dom.svgTypes, ['flowchart', 'sequence', 'pie', 'gantt', 'flowchart', 'class', 'flowchart', 'flowchart'])
  assert.equal(light.dom.toolbars, 8)
  assert.equal(light.dom.toolbarButtons, 32)
  assert.deepEqual(light.dom.toolbarButtonsPerDiagram, [4, 4, 4, 4, 4, 4, 4, 4])
  assert.equal(light.dom.iconButtons, 16)
  assert.equal(light.dom.downloadButtons, 8)
  assert.equal(light.dom.fullscreenButtons, 8)
  assert.equal(light.dom.disabledToolbarButtons, 0)
  assert.equal(light.dom.zoomIconSvgs, 24)
  assert.equal(light.dom.errorNotes, 1)
  assert.equal(light.dom.styleElements, 1)
  assert.equal(light.dom.sourceViews, 0)
  assert.equal(light.dom.viewerOpen, false)
  assert.equal(light.dom.viewerOverlays, 0)
  assert.equal(light.dom.viewerDialogs, 0)
  assert.equal(light.dom.viewerToolbarButtons, 0)
  assert.equal(light.dom.viewerViewBox, null)
  assert.equal(light.remounts, 8)
  assert.equal(light.dom.bannerTexts.length, 10)
  assert.ok(light.dom.bannerTexts.slice(0, 9).every((text) => text === '代码块'))
  assert.equal(light.dom.bannerTexts[9], 'javascript')
  assert.deepEqual(light.dom.toolbarLabels, flat(['Diagram', 'Source', '', ''], 8))
  assert.deepEqual(light.dom.ariaPressed, flat(['true', 'false', null, null], 8))
  assert.ok(light.dom.diagramWidths.every((width) => width > 0))
  assert.ok(light.dom.hostWidths.every((width) => width > 0))
  assert.equal(await evaluate("[...document.querySelectorAll('pre[data-dsh-pele-mermaid-source-hidden]')].every(pre => getComputedStyle(pre).display === 'none')"), true)

  /* ------------------ exported SVG: fixed theme + background -------------- */
  const lightExport = await captureDownload('light export')
  const lightExportBackground = backgroundOf(lightExport.text)
  evidence.exportLight = {
    name: lightExport.name,
    bytes: lightExport.bytes,
    background: lightExportBackground,
    themeValue: /--pele-bg:\s*([^;"]+)/.exec(lightExport.text)?.[1]?.trim() ?? null,
  }
  assert.ok(lightExportBackground, 'the downloaded file contains a background rect')
  assert.ok(Number(lightExportBackground.width) > 0)
  assert.ok(Number(lightExportBackground.height) > 0)
  assert.equal(
    lightExportBackground.fill,
    evidence.exportLight.themeValue,
    'the canvas background uses the same resolved --pele-bg value as the file',
  )
  assert.ok(luminanceOf(lightExportBackground.fill) > 0.5, `light export background is light, got ${lightExportBackground.fill}`)

  /* --------------------- P1 visual facts, wide column --------------------- */
  const wideFacts = await evaluate('window.__fixture.diagramFacts()')
  evidence.p1Wide = wideFacts
  assert.ok(wideFacts.cjk.wrappedLabels >= 1, 'at least one CJK label wraps')
  assert.ok(wideFacts.cjk.maxLines >= 2, 'CJK label uses multiple lines')
  assert.equal(wideFacts.cjk.punctuationKept, true, 'closing punctuation stays on the last wrapped line')
  assert.equal(wideFacts.class.classNodes, 3)
  assert.equal(wideFacts.class.rows, 1, 'wide column: three class groups share one row')
  assert.equal(wideFacts.generic.angleBracketsIntact, true, 'List<Diagram>/Map<String, Diagram> text survives')
  assert.ok(wideFacts.rich.sub >= 1, '<sub> rendered as baseline-shift=sub')
  assert.ok(wideFacts.rich.sup >= 1, '<sup> rendered as baseline-shift=super')
  assert.ok(wideFacts.rich.mono >= 3, '<code>/<kbd>/<samp> render with the mono font token')
  for (const [name, fact] of Object.entries({ cjk: wideFacts.cjk, class: wideFacts.class, generic: wideFacts.generic, rich: wideFacts.rich })) {
    assert.ok(fact.width <= fact.hostWidth + 2, `${name} fits the wide column`)
  }
  // Wide-column counterpart to fixture-narrow.png: the same P1 cards with the
  // class groups on one row and the CJK labels wrapped instead of stretched.
  assert.equal(await evaluate('window.__fixture.scrollToDiagram(4)'), true)
  await sleep(200)
  evidence.wideP1 = await capture('wide-p1')
  await evaluate('window.scrollTo(0, 0)')
  await sleep(150)

  /* ------------------------------ dark mode ------------------------------ */
  await evaluate('window.__fixture.toggleTheme()')
  await sleep(400)
  evidence.dark = await capture('dark')
  assert.equal(evidence.dark.remounts, evidence.light.remounts, 'colour theme flip re-renders nothing')
  assert.notEqual(evidence.dark.pele.vars['--pele-bg'], evidence.light.pele.vars['--pele-bg'])

  /* ------------------- dark exported SVG: readable background ------------- */
  const darkExport = await captureDownload('dark export')
  const darkExportBackground = backgroundOf(darkExport.text)
  evidence.exportDark = {
    name: darkExport.name,
    bytes: darkExport.bytes,
    background: darkExportBackground,
    themeValue: /--pele-bg:\s*([^;"]+)/.exec(darkExport.text)?.[1]?.trim() ?? null,
  }
  assert.ok(darkExportBackground, 'the dark download also has its own background rect')
  assert.equal(
    darkExportBackground.fill,
    evidence.exportDark.themeValue,
    'the dark canvas background uses the resolved dark --pele-bg',
  )
  assert.notEqual(darkExportBackground.fill, lightExportBackground.fill, 'dark export is visually different')
  assert.ok(luminanceOf(darkExportBackground.fill) < 0.2, `dark export background is dark, got ${darkExportBackground.fill}`)
  assert.match(darkExport.text, /--pele-fg:\s*(?:#f|rgb\(2[0-9][0-9])/i, 'dark export keeps the light text color')

  // Open the downloaded bytes themselves on a white stand-in page: this is the
  // reviewer-visible claim — a dark export must stay readable outside DSH.
  const darkSvgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(darkExport.text)}`
  await evaluate(`(() => {
    const wrap = document.createElement('div');
    wrap.id = 'export-dark-preview';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;display:flex;align-items:center;justify-content:center;padding:32px;box-sizing:border-box';
    const img = document.createElement('img');
    img.alt = 'downloaded dark SVG';
    img.src = ${JSON.stringify(darkSvgUrl)};
    img.style.cssText = 'width:100%;max-width:1200px;height:auto;box-shadow:0 0 0 1px #dddddd';
    wrap.appendChild(img);
    document.body.appendChild(wrap);
    return true;
  })()`)
  await sleep(150)
  const darkPreview = await evaluate(`(() => {
    const img = document.querySelector('#export-dark-preview img');
    return img ? { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight } : null;
  })()`)
  assert.ok(darkPreview && darkPreview.naturalWidth > 0, 'standalone dark export rendered on the white page')
  evidence.exportDarkPreview = darkPreview
  evidence.exportDarkPreviewShot = await capture('export-dark-preview')
  await evaluate("document.getElementById('export-dark-preview')?.remove()")
  await sleep(100)

  /* ----------------------------- source view ----------------------------- */
  assert.equal(await evaluate("window.__sourcePre = document.querySelector('.md-code-block pre'); window.__sourceParent = window.__sourcePre.parentNode; window.__fixture.clickSource(); window.__sourcePre.parentNode === window.__sourceParent && getComputedStyle(window.__sourcePre).display !== 'none'"), true)
  evidence.sourceView = await capture('source-view')
  assert.equal(evidence.sourceView.dom.sourceViews, 1)
  await evaluate('window.__fixture.clickDiagram()')
  assert.equal(await evaluate('window.__sourcePre.parentNode === window.__sourceParent'), true)
  await sleep(400)

  /* ---------------- back to light for readable viewer/narrow ------------- */
  await evaluate('window.__fixture.toggleTheme()')
  await sleep(400)
  const relight = await evaluate('window.__fixture.report()')
  assert.equal(relight.theme, 'light')
  assert.equal(relight.remounts, evidence.light.remounts, 'second colour flip re-renders nothing')

  function closeNumber(actual, expected, label, epsilon = 0.03) {
    assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
      `${label}: ${actual} ≈ ${expected}`)
  }
  function assertViewerGeometry(report, label, fit = false) {
    const { viewerSvgRect: svg, viewerStageRect: stage, viewerContentRect: area, viewerNaturalSize: content } = report.dom
    assert.ok(svg && stage && area && area.width > 0 && area.height > 0, `${label}: measurable stage`)
    for (const field of ['x', 'y', 'width', 'height']) closeNumber(svg[field], area[field], `${label}: SVG fills content ${field}`)
    const [x, y, width, height] = report.dom.viewerViewBox.split(/\s+/).map(Number)
    // Compare in screen pixels to allow viewBox's 0.001-unit serialization.
    const unit = area.width / width
    closeNumber(height * unit, area.height, `${label}: equal aspect ratio`, 0.1)
    for (const [origin, extent, natural] of [[x, width, content.width], [y, height, content.height]]) {
      if (fit || extent >= natural) closeNumber(origin, (natural - extent) / 2, `${label}: centered axis`, 0.002)
      else assert.ok(origin >= -0.002 && origin + extent <= natural + 0.002, `${label}: clamped axis`)
      if (fit) assert.ok(extent + 0.002 >= natural, `${label}: fit shows entire diagram`)
    }
    if (fit) assert.ok(Math.abs(width - content.width) <= 0.002 || Math.abs(height - content.height) <= 0.002, `${label}: fit touches an axis`)
  }

  /* --------------------------- fullscreen viewer -------------------------- */
  assert.equal(await evaluate('window.__fixture.openViewer(0)'), true)
  await until(() => evaluate('window.__fixture.report().dom.viewerOpen === true'), 'fullscreen overlay')
  const viewerReport = await evaluate('window.__fixture.report()')
  assert.equal(viewerReport.dom.viewerOverlays, 1, 'exactly one overlay')
  assert.equal(viewerReport.dom.viewerDialogs, 1, 'exactly one role=dialog')
  assert.equal(viewerReport.dom.viewerToolbarButtons, 4)
  assertViewerGeometry(viewerReport, 'initial fit', true)
  assert.equal(await evaluate("document.querySelectorAll('[data-dsh-pele-mermaid-viewer]').length"), 1)
  assert.equal(await evaluate("(() => { const d = document.querySelector('.dsh-pele-mermaid-viewer-dialog'); return !!d && d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' })()"), true)
  assert.equal(await evaluate("!!document.querySelector('.dsh-pele-mermaid-viewer-svg[viewBox]')"), true)
  assert.equal(await evaluate('document.body.style.overflow'), 'hidden', 'viewer locks background scroll')
  const baseViewBox = viewerReport.dom.viewerViewBox.split(/\s+/).map(Number)
  assert.equal(await evaluate("(() => { const buttons = document.querySelectorAll('.dsh-pele-mermaid-viewer-toolbar button'); if (!buttons[1]) return false; buttons[1].click(); return true })()"), true)
  await sleep(100)
  const zoomedViewBox = await evaluate("document.querySelector('.dsh-pele-mermaid-viewer-svg').getAttribute('viewBox')")
  assert.ok(Number(zoomedViewBox.split(/\s+/)[2]) < baseViewBox[2], 'zoom reduces the visible width')
  await evaluate("(() => { const buttons = document.querySelectorAll('.dsh-pele-mermaid-viewer-toolbar button'); if (buttons[2]) buttons[2].click() })()")
  await sleep(100)
  const restoredBox = (await evaluate("document.querySelector('.dsh-pele-mermaid-viewer-svg').getAttribute('viewBox')")).split(/\s+/).map(Number)
  restoredBox.forEach((value, index) => closeNumber(value, baseViewBox[index], 'fit restores the whole diagram', 0.001))
  /* -------------- viewer stays theme-live while open (P5 fix) ------------- */
  const viewerTheme = (label) => evaluate(`(() => {
    const svg = document.querySelector('.dsh-pele-mermaid-viewer-svg');
    const rect = svg && svg.querySelector('[data-dsh-pele-mermaid-background]');
    const dialog = document.querySelector('.dsh-pele-mermaid-viewer-dialog');
    return {
      label: ${JSON.stringify(label)},
      hasBackground: !!rect,
      backgroundFill: rect ? getComputedStyle(rect).fill : null,
      dialogBackground: dialog ? getComputedStyle(dialog).backgroundColor : null,
      inlineStyle: svg ? svg.getAttribute('style') : null,
    };
  })()`)
  const viewerLight = await viewerTheme('light')
  assert.equal(viewerLight.hasBackground, true, 'viewer svg has the framed background rect')
  assert.match(String(viewerLight.inlineStyle), /var\(--dsw-/, 'viewer keeps token expressions, not frozen colors')
  assert.ok(luminanceOf(viewerLight.backgroundFill) > 0.5, `light viewer background is light, got ${viewerLight.backgroundFill}`)

  await evaluate('window.__fixture.toggleTheme()')
  await sleep(400)
  const viewerDark = await viewerTheme('dark')
  assert.equal(await evaluate('window.__fixture.report().dom.viewerOpen'), true, 'theme switch keeps the viewer open')
  assert.equal(await evaluate('window.__fixture.report().dom.viewerOverlays'), 1, 'still exactly one overlay')
  assert.notEqual(viewerDark.backgroundFill, viewerLight.backgroundFill, 'viewer diagram repaints on theme switch')
  assert.notEqual(viewerDark.dialogBackground, viewerLight.dialogBackground, 'viewer chrome repaints on theme switch')
  assert.ok(luminanceOf(viewerDark.backgroundFill) < 0.5, `dark viewer background is dark, got ${viewerDark.backgroundFill}`)
  evidence.viewerTheme = { light: viewerLight, dark: viewerDark }
  evidence.viewerDark = await capture('viewer-dark')
  assert.equal(evidence.viewerDark.dom.viewerOpen, true, 'viewer stays open after the theme switch')

  await evaluate('window.__fixture.toggleTheme()')
  await sleep(400)
  const viewerRelit = await viewerTheme('light-again')
  assert.equal(await evaluate('window.__fixture.report().dom.viewerOpen'), true)
  assert.equal(viewerRelit.backgroundFill, viewerLight.backgroundFill, 'viewer returns to the light theme value')
  evidence.viewer = await capture('viewer')
  assert.equal(evidence.viewer.dom.viewerOpen, true)

  /* ------------------------ Escape closes + focus ------------------------ */
  await pressEscape()
  await until(() => evaluate('window.__fixture.report().dom.viewerOpen === false'), 'Escape closes the viewer')
  const viewerClosed = await evaluate('window.__fixture.report()')
  assert.equal(viewerClosed.dom.viewerOverlays, 0, 'overlay removed')
  assert.equal(viewerClosed.dom.viewerDialogs, 0)
  assert.equal(viewerClosed.dom.viewerViewBox, null)
  assert.equal(viewerClosed.dom.viewerFocusRestored, true, 'focus returns to the Fullscreen trigger')
  assert.equal(await evaluate('document.body.style.overflow'), '', 'background scroll lock released')
  assert.equal(viewerClosed.dom.diagramSvgs, 8, 'closing the viewer keeps every inline diagram')
  evidence.viewerClosed = viewerClosed

  // Reopen and close through the fixture control: repeated open/close must not
  // leave a second overlay behind, and focus must return to the new trigger.
  assert.equal(await evaluate('window.__fixture.openViewer(1)'), true)
  await until(() => evaluate('window.__fixture.report().dom.viewerOpen === true'), 'viewer reopened')
  assert.equal(await evaluate('window.__fixture.report().dom.viewerOverlays'), 1)
  assert.equal(await evaluate('window.__fixture.report().dom.viewerDialogs'), 1)
  assert.equal(await evaluate('window.__fixture.closeViewer()'), true)
  await until(() => evaluate('window.__fixture.report().dom.viewerOpen === false'), 'viewer closed through its control')
  const viewerReclosed = await evaluate('window.__fixture.report()')
  assert.equal(viewerReclosed.dom.viewerOverlays, 0, 'no duplicate overlay after repeated open/close')
  assert.equal(viewerReclosed.dom.viewerFocusRestored, true, 'focus returns to the trigger after close()')
  evidence.viewerReclosed = viewerReclosed

  // Wide, tall and ordinary diagrams in desktop and short windows. Geometry
  // checks are independent of which axis limits fit; repeat after zoom/pan/resize.
  evidence.viewerGeometry = []
  for (const viewport of [DESKTOP, SHORT]) {
    await send('Emulation.setDeviceMetricsOverride', viewport)
    await sleep(250)
    for (const [name, index] of [['wide', 0], ['tall', 7], ['ordinary', 2]]) {
      assert.equal(await evaluate(`window.__fixture.openViewer(${index})`), true)
      const fitReport = await evaluate('window.__fixture.report()')
      assertViewerGeometry(fitReport, `${name} ${viewport.height} fit`, true)
      const fitBox = fitReport.dom.viewerViewBox.split(/\s+/).map(Number)
      await evaluate(`(() => {
        const stage = document.querySelector('.dsh-pele-mermaid-viewer-stage');
        for (const [type, x, y] of [['pointerdown', 100, 100], ['pointermove', 180, 140], ['pointerup', 180, 140]])
          stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));
      })()`)
      const fittedAfterPan = (await evaluate('window.__fixture.report()')).dom.viewerViewBox.split(/\s+/).map(Number)
      fittedAfterPan.forEach((v, i) => closeNumber(v, fitBox[i], 'fit drag no-op', 0.001))
      await evaluate(`(() => {const b = document.querySelectorAll('.dsh-pele-mermaid-viewer-toolbar button')[1]; for (let i = 0; i < 4; i++) b.click()})()`)
      const zoomReport = await evaluate('window.__fixture.report()')
      assertViewerGeometry(zoomReport, `${name} ${viewport.height} zoom`)
      if (name !== 'ordinary') await capture(`viewer-${name}-${viewport.height}-zoom`)
      const rect = zoomReport.dom.viewerSvgRect
      // Real coordinate input exercises pointer capture and the full viewport.
      const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + 80, y: start.y + 40, button: 'left', buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x + 80, y: start.y + 40, button: 'left', clickCount: 1 })
      const panReport = await evaluate('window.__fixture.report()')
      assertViewerGeometry(panReport, `${name} ${viewport.height} pan`)
      const before = panReport.dom.viewerViewBox.split(/\s+/).map(Number)
      const zoomBox = zoomReport.dom.viewerViewBox.split(/\s+/).map(Number)
      assert.ok(before.some((value, index) => Math.abs(value - zoomBox[index]) > 0.001), `${name}: real drag moves the zoomed diagram`)
      const resized = { ...viewport, height: viewport.height + 100 }
      await send('Emulation.setDeviceMetricsOverride', resized)
      await sleep(150)
      const resizeReport = await evaluate('window.__fixture.report()')
      assertViewerGeometry(resizeReport, `${name} ${viewport.height} resize`)
      const after = resizeReport.dom.viewerViewBox.split(/\s+/).map(Number)
      for (const axis of [0, 1]) {
        const content = [resizeReport.dom.viewerNaturalSize.width, resizeReport.dom.viewerNaturalSize.height][axis]
        const extent = after[axis + 2]
        const desired = before[axis] + before[axis + 2] / 2 - extent / 2
        const origin = extent >= content ? (content - extent) / 2 : Math.max(0, Math.min(content - extent, desired))
        closeNumber(after[axis], origin, `${name}: resize center`, 0.002)
      }
      const area = resizeReport.dom.viewerContentRect, natural = resizeReport.dom.viewerNaturalSize
      const fitUnits = Math.min(area.width / natural.width, area.height / natural.height)
      closeNumber((area.width / after[2]) / fitUnits, 1.25 ** 4, `${name}: resize retains zoom`, 0.001)
      evidence.viewerGeometry.push({ name, viewport, fit: fitReport.dom, zoom: zoomReport.dom, pan: panReport.dom, resize: resizeReport.dom })
      await evaluate('window.__fixture.closeViewer()')
      await send('Emulation.setDeviceMetricsOverride', viewport)
      await sleep(100)
    }
  }

  /* --------------------- narrow column: P1 layout claims ------------------ */
  await send('Emulation.setDeviceMetricsOverride', NARROW)
  await until(() => evaluate('window.__fixture.diagramFacts().class.rows === 3'), 'class groups wrapped onto their own rows', 20000)
  const narrowReport = await evaluate('window.__fixture.report()')
  const narrowFacts = await evaluate('window.__fixture.diagramFacts()')
  evidence.narrowViewport = NARROW
  evidence.p1Narrow = narrowFacts
  assert.equal(narrowReport.dom.diagramSvgs, 8, 'no diagrams lost when the column narrows')
  assert.equal(narrowReport.dom.toolbars, 8)
  assert.equal(narrowReport.dom.toolbarButtons, 32)
  assert.equal(narrowFacts.class.classNodes, 3)
  assert.equal(narrowFacts.class.rows, 3, 'narrow column: separate class groups move onto three rows')
  assert.ok(narrowFacts.class.width <= narrowFacts.class.hostWidth + 2)
  assert.ok(narrowFacts.cjk.maxLines >= 2, 'CJK label still wraps in the narrow column')
  assert.equal(narrowFacts.cjk.punctuationKept, true)
  assert.equal(narrowFacts.generic.angleBracketsIntact, true)
  assert.ok(narrowFacts.rich.sub >= 1)
  assert.ok(narrowFacts.rich.sup >= 1)
  assert.ok(narrowFacts.rich.mono >= 3)
  for (const [name, fact] of Object.entries({ cjk: narrowFacts.cjk, class: narrowFacts.class, generic: narrowFacts.generic, rich: narrowFacts.rich })) {
    assert.ok(fact.width <= fact.hostWidth + 2, `${name} fits the narrow column`)
  }
  assert.equal(await evaluate('window.__fixture.scrollToDiagram(4)'), true)
  await sleep(250)
  evidence.narrow = await capture('narrow')

  /* ---------------------- restore wide viewport + settle ------------------ */
  await send('Emulation.setDeviceMetricsOverride', WIDE)
  await until(() => evaluate('window.__fixture.diagramFacts().class.rows === 1'), 'class groups back on one row', 20000)
  const restored = await evaluate('window.__fixture.report()')
  assert.equal(restored.dom.diagramSvgs, 8, 'no diagrams lost after restoring the viewport')
  assert.deepEqual(exceptions, [], 'resize/zoom produced no page exceptions')
  assert.deepEqual(consoleErrors, [], 'resize/zoom produced no error-level console messages (no ResizeObserver loop)')

  /* ------------------- font refresh + teardown (byte identity) ------------ */
  await sleep(400)
  const remountsBeforeFont = (await evaluate('window.__fixture.report()')).remounts
  await evaluate('window.__fixture.emitTheme("font")')
  await until(() => evaluate(`window.__fixture.report().remounts === ${remountsBeforeFont + 8}`), 'font refresh remounts eight diagrams')
  evidence.fontRefresh = await capture('font-refresh')
  assert.equal(evidence.fontRefresh.remounts, remountsBeforeFont + 8)
  assert.equal(evidence.fontRefresh.dom.diagramSvgs, 8)
  evidence.remounts = {
    initial: evidence.light.remounts,
    beforeFont: remountsBeforeFont,
    afterFont: evidence.fontRefresh.remounts,
    fontDelta: evidence.fontRefresh.remounts - remountsBeforeFont,
    note: 'The initial mount adds one svg.pele per diagram (8). Colour-only theme flips add zero. Resize re-renders add nodes too, so the font refresh is measured as a +8 delta from the value immediately before it.',
  }
  assert.equal(await evaluate('window.__fixture.teardown()'), true)
  evidence.teardown = await capture('teardown')
  assert.equal(evidence.teardown.dom.diagramSvgs, 0)
  assert.equal(evidence.teardown.dom.styleElements, 0)
  assert.equal(evidence.teardown.dom.toolbarButtons, 0)
  assert.equal(evidence.teardown.dom.viewerOverlays, 0)
  assert.equal(evidence.teardown.teardown.tornDown, true)
  assert.equal(evidence.teardown.teardown.restored, true)
  assert.deepEqual(exceptions, [])
  const origin = new URL(url).origin + '/'
  // Blob URLs created by the export path resolve to the same fixture origin;
  // they are in-page object URLs, not external traffic.
  const external = requests.filter((request) => {
    if (request.startsWith(origin)) return false
    // In-page object/data URLs from the export and preview harness are local
    // content, not external traffic.
    if (request.startsWith(`blob:${origin}`)) return false
    if (request.startsWith('data:')) return false
    return true
  })
  assert.deepEqual(external, [], 'fixture page makes no external requests')
  evidence.network = { scope: 'Requests from this fixture page only, for these sample diagrams', externalRequests: external }
  assert.deepEqual(consoleErrors, [], 'the whole run produced no error-level console messages')
  evidence.console = { scope: 'Error-level console/log entries during the whole run', errors: consoleErrors }
  await writeVisualOutputFile(output, 'visual-evidence.json', JSON.stringify(evidence, null, 2) + '\n', {
    root: ROOT,
  })
  console.log(JSON.stringify({ status: 'PASS', runId, outputDir: output, browser: browser.Browser, bundleSha256: evidence.bundleSha256, viewport: WIDE, narrowViewport: NARROW, viewerViewports: [DESKTOP, SHORT], consoleErrors: evidence.console.errors, screenshots: evidence.screenshots }, null, 2))
  } finally {
    ws?.close()
    for (const promise of pending.values()) clearTimeout(promise.timer)
    await stop(chrome)
    await stop(server)
    // Chrome helpers may finish writing shortly after the parent exits.
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

const IS_MAIN =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (IS_MAIN) {
  main().catch((error) => {
    console.error('verify-visual: FAIL —', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
