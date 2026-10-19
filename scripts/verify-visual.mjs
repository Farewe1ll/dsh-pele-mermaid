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
try {
  let serverOutput = ''
  server = spawn(process.execPath, ['scripts/serve-fixture.mjs', '--port', '0', '--quiet'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', (chunk) => { serverOutput += chunk })
  server.stderr.on('data', (chunk) => { serverOutput += chunk })
  const url = await until(() => {
    if (server.exitCode !== null) throw new Error(serverOutput)
    return /serve-fixture: light (http[^\s]+)/.exec(serverOutput)?.[1]
  }, 'fixture server')
  chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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
    else if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url)
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 2400, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${url}?locale=en` })
  await until(() => evaluate('!!window.__fixture?.report().ready'), 'four initial diagrams')
  await evaluate('document.fonts.ready.then(() => true)')
  const evidence = {
    status: 'PASS', date: new Date().toISOString(), browser: browser.Browser,
    scope: 'Browser fixture with static committed-shape Fiber objects; real React lifecycle is tested separately.',
    url, query: '?locale=en', viewport: { width: 1400, height: 2400, deviceScaleFactor: 1 },
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
  evidence.light = await capture('light')
  assert.equal(evidence.light.dom.diagramSvgs, 4)
  assert.equal(evidence.light.dom.errorNotes, 1)
  assert.ok(evidence.light.dom.bannerTexts.slice(0, 5).every((text) => text === '代码块'))
  assert.equal(await evaluate("[...document.querySelectorAll('pre[data-dsh-pele-mermaid-source-hidden]')].every(pre => getComputedStyle(pre).display === 'none')"), true)
  await evaluate('window.__fixture.toggleTheme()')
  await sleep(400)
  evidence.dark = await capture('dark')
  assert.equal(evidence.dark.remounts, evidence.light.remounts)
  assert.notEqual(evidence.dark.pele.vars['--pele-bg'], evidence.light.pele.vars['--pele-bg'])
  assert.equal(await evaluate("window.__sourcePre = document.querySelector('.md-code-block pre'); window.__sourceParent = window.__sourcePre.parentNode; window.__fixture.clickSource(); window.__sourcePre.parentNode === window.__sourceParent && getComputedStyle(window.__sourcePre).display !== 'none'"), true)
  evidence.sourceView = await capture('source-view')
  assert.equal(evidence.sourceView.dom.sourceViews, 1)
  await evaluate('window.__fixture.clickDiagram()')
  assert.equal(await evaluate('window.__sourcePre.parentNode === window.__sourceParent'), true)
  await sleep(400)
  await evaluate('window.__fixture.emitTheme("font")')
  await until(() => evaluate(`window.__fixture.report().remounts === ${evidence.light.remounts + 4}`), 'font refresh')
  evidence.fontRefresh = await capture('font-refresh')
  assert.equal(await evaluate('window.__fixture.teardown()'), true)
  evidence.teardown = await capture('teardown')
  assert.equal(evidence.teardown.dom.diagramSvgs, 0)
  assert.equal(evidence.teardown.dom.styleElements, 0)
  assert.deepEqual(exceptions, [])
  const external = requests.filter((request) => !request.startsWith(new URL(url).origin + '/'))
  assert.deepEqual(external, [], 'fixture page makes no external requests')
  evidence.network = { scope: 'Requests from this fixture page only, for these sample diagrams', externalRequests: external }
  await writeFile(path.join(output, 'visual-evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'PASS', browser: browser.Browser, bundleSha256: evidence.bundleSha256, screenshots: evidence.screenshots }, null, 2))
} finally {
  ws?.close()
  for (const promise of pending.values()) clearTimeout(promise.timer)
  await stop(chrome)
  await stop(server)
  await rm(profile, { recursive: true, force: true })
}
