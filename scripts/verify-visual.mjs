#!/usr/bin/env node
/** Reproduce screenshots and JSON together using an isolated headless Chrome. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(ROOT, 'tests/fixtures/screenshots')
const chromePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
/** Wide fixture column: one class-diagram row, CJK labels wrapped but not cramped. */
const WIDE = { width: 1400, height: 2400, deviceScaleFactor: 1, mobile: false }
/**
 * Narrow fixture column: 720px wide crosses Pele's 640px autoDirection
 * breakpoint for this harness page (content column ~602px), so separate class
 * groups wrap onto new rows and the CJK/label cases are exercised in a chat-
 * like narrow column. 760px would *not* cross it (content column ~642px).
 */
const NARROW = { width: 720, height: 2200, deviceScaleFactor: 1, mobile: false }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
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
    await writeFile(path.join(output, filename), bytes)
    evidence.screenshots[filename] = { bytes: bytes.length, sha256: sha256(bytes) }
    return report
  }
  const flat = (entry, count) => Array.from({ length: count }, () => entry).flat()

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

  /* --------------------------- fullscreen viewer -------------------------- */
  assert.equal(await evaluate('window.__fixture.openViewer(0)'), true)
  await until(() => evaluate('window.__fixture.report().dom.viewerOpen === true'), 'fullscreen overlay')
  const viewerReport = await evaluate('window.__fixture.report()')
  assert.equal(viewerReport.dom.viewerOverlays, 1, 'exactly one overlay')
  assert.equal(viewerReport.dom.viewerDialogs, 1, 'exactly one role=dialog')
  assert.equal(viewerReport.dom.viewerToolbarButtons, 4)
  assert.match(String(viewerReport.dom.viewerViewBox), /^0 0 [\d.]+ [\d.]+$/, 'viewer svg has a natural-size viewBox')
  assert.equal(await evaluate("document.querySelectorAll('[data-dsh-pele-mermaid-viewer]').length"), 1)
  assert.equal(await evaluate("(() => { const d = document.querySelector('.dsh-pele-mermaid-viewer-dialog'); return !!d && d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' })()"), true)
  assert.equal(await evaluate("!!document.querySelector('.dsh-pele-mermaid-viewer-svg[viewBox]')"), true)
  assert.equal(await evaluate('document.body.style.overflow'), 'hidden', 'viewer locks background scroll')
  const baseViewBox = viewerReport.dom.viewerViewBox
  assert.equal(await evaluate("(() => { const buttons = document.querySelectorAll('.dsh-pele-mermaid-viewer-toolbar button'); if (!buttons[1]) return false; buttons[1].click(); return true })()"), true)
  await sleep(100)
  const zoomedViewBox = await evaluate("document.querySelector('.dsh-pele-mermaid-viewer-svg').getAttribute('viewBox')")
  assert.notEqual(zoomedViewBox, baseViewBox, 'zoom in crops the viewBox')
  await evaluate("(() => { const buttons = document.querySelectorAll('.dsh-pele-mermaid-viewer-toolbar button'); if (buttons[2]) buttons[2].click() })()")
  await sleep(100)
  assert.equal(await evaluate("document.querySelector('.dsh-pele-mermaid-viewer-svg').getAttribute('viewBox')"), baseViewBox, 'fit restores the whole diagram')
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
  const external = requests.filter((request) => !request.startsWith(new URL(url).origin + '/'))
  assert.deepEqual(external, [], 'fixture page makes no external requests')
  evidence.network = { scope: 'Requests from this fixture page only, for these sample diagrams', externalRequests: external }
  assert.deepEqual(consoleErrors, [], 'the whole run produced no error-level console messages')
  evidence.console = { scope: 'Error-level console/log entries during the whole run', errors: consoleErrors }
  await writeFile(path.join(output, 'visual-evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'PASS', browser: browser.Browser, bundleSha256: evidence.bundleSha256, viewport: WIDE, narrowViewport: NARROW, consoleErrors: evidence.console.errors, screenshots: evidence.screenshots }, null, 2))
} finally {
  ws?.close()
  for (const promise of pending.values()) clearTimeout(promise.timer)
  await stop(chrome)
  await stop(server)
  await rm(profile, { recursive: true, force: true })
}
