/**
 * Unit tests for the standalone SVG export (src/client/export.js).
 *
 * Pure jsdom Document/DOMParser/XMLSerializer; no Pele and no network. The
 * fixtures model Pele's pristine render result plus deliberately hostile markup
 * so sanitization, natural sizing, theming and download dispatch are all
 * covered without a browser.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import {
  buildExportSvg,
  collectThemeVariables,
  downloadSvg,
  exportFilename,
} from '../src/client/export.js'

const HOSTILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="pele pele-flowchart" viewBox="10 10 50 30" width="210" height="64" style="--_bg: var(--pele-bg,#fff)">
  <script>alert(1)</script>
  <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
  <image href="https://evil.test/remote.svg" width="10" height="10"/>
  <a href="javascript:alert(1)"><text>bad</text></a>
  <a href="https://example.test/doc"><text>link</text></a>
  <a href="#node-a"><text>internal</text></a>
  <use href="https://evil.test/sprite.svg#shape"/>
  <use href="#local-shape"/>
  <g onclick="alert(1)" style="fill: url(https://evil.test/paint.svg)">
    <rect width="10" height="10"/>
  </g>
  <g id="node-a"><text>Node A</text></g>
</svg>`

const SNAPSHOT = Object.freeze({
  svg: HOSTILE_SVG,
  width: 210,
  height: 64,
  type: 'flowchart',
})

function makeDoc() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://dsh-pele-mermaid.test/',
  })
  return { dom, window: dom.window, document: dom.window.document }
}

function parseSvg(document, text) {
  return new document.defaultView.DOMParser().parseFromString(text, 'image/svg+xml')
}

test('buildExportSvg restores the complete natural-size diagram', () => {
  const { document, window } = makeDoc()
  const exported = buildExportSvg(SNAPSHOT, { document, view: window })
  assert.equal(typeof exported, 'string')
  assert.match(exported, /^<svg[\s>]/)

  const parsed = parseSvg(document, exported)
  assert.equal(parsed.querySelector('parsererror'), null, 'exported SVG must be well-formed XML')
  const root = parsed.documentElement
  assert.equal(root.localName, 'svg')
  assert.equal(root.getAttribute('width'), '210')
  assert.equal(root.getAttribute('height'), '64')
  // The zoomed inline viewBox must never leak into the exported file.
  assert.equal(root.getAttribute('viewBox'), '0 0 210 64')
})

test('buildExportSvg strips active content and external references', () => {
  const { document, window } = makeDoc()
  const exported = buildExportSvg(SNAPSHOT, { document, view: window })
  const parsed = parseSvg(document, exported)
  const xml = new window.XMLSerializer().serializeToString(parsed)

  assert.doesNotMatch(xml, /<script/i)
  assert.doesNotMatch(xml, /<foreignObject/i)
  assert.doesNotMatch(xml, /<image/i)
  assert.doesNotMatch(xml, /\son\w+\s*=/i, 'no event-handler attributes may survive')
  assert.doesNotMatch(xml, /javascript:/i)
  assert.doesNotMatch(xml, /https:\/\/evil\.test/i, 'external asset references must be removed')
  assert.doesNotMatch(xml, /url\(\s*https?:/i)

  // Legitimate links and in-document references stay.
  assert.match(xml, /https:\/\/example\.test\/doc/)
  assert.match(xml, /#node-a/)
  assert.match(xml, /#local-shape/)
})

test('buildExportSvg writes resolved --pele-* theme variables onto the root', () => {
  const { document, window } = makeDoc()
  const container = document.createElement('div')
  container.style.setProperty('--pele-bg', 'rgb(1, 2, 3)')
  container.style.setProperty('--pele-fg', '#123456')
  document.body.append(container)

  const variables = collectThemeVariables(container, window)
  assert.equal(variables['--pele-bg'], 'rgb(1, 2, 3)')
  assert.equal(variables['--pele-fg'], '#123456')

  const parsed = parseSvg(document, buildExportSvg(SNAPSHOT, { document, view: window, container }))
  const style = parsed.documentElement.getAttribute('style') || ''
  assert.match(style, /--pele-bg:\s*rgb\(1, 2, 3\)/)
  assert.match(style, /--pele-fg:\s*#123456/)
  // Pele's own inline variables are preserved next to ours.
  assert.match(style, /--_bg:/)
})

test('buildExportSvg fails closed for unusable input', () => {
  const { document, window } = makeDoc()
  assert.equal(buildExportSvg(null, { document, view: window }), null)
  assert.equal(buildExportSvg({}, { document, view: window }), null)
  assert.equal(buildExportSvg({ svg: '' }, { document, view: window }), null)
  assert.equal(buildExportSvg({ svg: '<svg' }, { document, view: window }), null)
  assert.equal(buildExportSvg({ svg: '<html></html>' }, { document, view: window }), null)
  // No dimensions anywhere: cannot describe a portable natural-size file.
  assert.equal(buildExportSvg({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>' }, { document, view: window }), null)
})

test('exportFilename uses pele-<type>-YYYYMMDD-HHmmss.svg', () => {
  const date = new Date(2026, 10, 17, 9, 5, 7)
  assert.equal(exportFilename('flowchart', date), 'pele-flowchart-20261117-090507.svg')
  assert.equal(exportFilename('Sequence Diagram', date), 'pele-sequence-diagram-20261117-090507.svg')
  assert.equal(exportFilename('../etc/passwd', date), 'pele-etc-passwd-20261117-090507.svg')
  assert.equal(exportFilename(undefined, date), 'pele-diagram-20261117-090507.svg')
  assert.match(exportFilename('flowchart'), /^pele-flowchart-\d{8}-\d{6}\.svg$/)
})

test('downloadSvg dispatches a file download and revokes the object URL', async () => {
  const { document, window } = makeDoc()
  const created = []
  const revoked = []
  /** @type {Array<() => void>} */
  const timers = []
  const fakeUrl = {
    createObjectURL(blob) {
      created.push(blob)
      return 'blob:fake-object-url'
    },
    revokeObjectURL(url) {
      revoked.push(url)
    },
  }
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts
      this.type = options?.type
    }
  }
  const fakeView = {
    Blob: FakeBlob,
    URL: fakeUrl,
    setTimeout(fn) {
      timers.push(fn)
      return timers.length
    },
  }
  let clicked = null
  document.body.addEventListener('click', (event) => {
    clicked = { download: event.target.download, href: event.target.href }
  })

  const svg = buildExportSvg(SNAPSHOT, { document, view: window })
  const ok = downloadSvg(svg, 'pele-flowchart-20261117-090507.svg', { document, view: fakeView, url: fakeUrl })
  assert.equal(ok, true)
  assert.equal(created.length, 1)
  assert.equal(created[0].parts[0], svg)
  assert.equal(created[0].type, 'image/svg+xml;charset=utf-8')
  assert.equal(clicked.download, 'pele-flowchart-20261117-090507.svg')
  assert.equal(clicked.href, 'blob:fake-object-url')
  assert.equal(document.querySelectorAll('a').length, 0, 'the temporary anchor is removed')
  assert.deepEqual(revoked, [])
  for (const timer of timers) timer()
  assert.deepEqual(revoked, ['blob:fake-object-url'])
})

test('downloadSvg refuses without a usable URL/Blob or content', () => {
  const { document } = makeDoc()
  assert.equal(downloadSvg('', 'x.svg', { document }), false)
  assert.equal(downloadSvg('<svg/>', '', { document }), false)
  assert.equal(downloadSvg('<svg/>', 'x.svg', { document, view: { Blob: class {} } }), false)
  assert.equal(downloadSvg('<svg/>', 'x.svg', { document, view: null, url: {} }), false)
})
