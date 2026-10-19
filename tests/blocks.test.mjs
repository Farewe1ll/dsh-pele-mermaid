/**
 * Unit tests for the Mermaid code-block manager (src/client/blocks.js).
 *
 * Plain `node:test` + `node:assert/strict` + jsdom; no test runner beyond Node.
 * The engine adapter is always a fake so these tests do not need Pele, canvas,
 * or engine.js itself; settle timing uses an injected fake clock.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { attachCodeBlockFiber } from './helpers/fiber.mjs'
import { SOURCE_HIDDEN_ATTR } from '../src/client/theme-css.js'

import {
  MERMAID_LANG,
  createBlockManager,
  readFenceLanguage,
  readFenceSource,
} from '../src/client/blocks.js'

/** Documented class names (docs/ARCH.md § theme-css.js CLASS). */
const CLASS = {
  diagram: 'dsh-pele-mermaid-diagram',
  toolbar: 'dsh-pele-mermaid-toolbar',
  error: 'dsh-pele-mermaid-error',
  source: 'dsh-pele-mermaid-source',
  active: 'dsh-pele-mermaid-active',
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const BASE_SOURCE = 'flowchart LR\n  A-->B'

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeDocument() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://app.test/',
  })
  return dom.window.document
}

/**
 * Build one CodeBlock fixture exactly like the DSH primitives DOM contract:
 *
 *   <div class="md-code-block css-block">
 *     <div class="css-banner-wrap">
 *       <div class="css-banner" data-code-block-banner>
 *         <div class="css-infostring">mermaid</div>
 *         <div class="css-action"><button type="button">Copy</button></div>
 *       </div>
 *     </div>
 *     <div class="css-content" data-code-block-content>
 *       <pre class="css-plain"><code>…</code></pre>
 *     </div>
 *   </div>
 */
function addBlock(doc, opts = {}) {
  const {
    language = 'mermaid',
    source = BASE_SOURCE,
    banner = true,
    pre = true,
    blockClass = 'md-code-block css-block',
  } = opts

  const block = doc.createElement('div')
  block.className = blockClass

  if (banner) {
    const wrap = doc.createElement('div')
    wrap.className = 'css-banner-wrap'
    const bannerEl = doc.createElement('div')
    bannerEl.className = 'css-banner'
    bannerEl.setAttribute('data-code-block-banner', '')
    const info = doc.createElement('div')
    info.className = 'css-infostring'
    info.textContent = language
    const action = doc.createElement('div')
    action.className = 'css-action'
    const copy = doc.createElement('button')
    copy.type = 'button'
    copy.textContent = 'Copy'
    action.appendChild(copy)
    bannerEl.appendChild(info)
    bannerEl.appendChild(action)
    wrap.appendChild(bannerEl)
    block.appendChild(wrap)
  }

  const content = doc.createElement('div')
  content.className = 'css-content'
  content.setAttribute('data-code-block-content', '')
  if (pre) {
    const preEl = doc.createElement('pre')
    preEl.className = 'css-plain'
    const code = doc.createElement('code')
    code.textContent = source
    preEl.appendChild(code)
    content.appendChild(preEl)
  }
  block.appendChild(content)

  doc.body.appendChild(block)
  return {
    block,
    content,
    banner: block.querySelector('[data-code-block-banner]'),
    copyButton: block.querySelector('button'),
  }
}

/** Deterministic clock: `advance(ms)` runs every due scheduled callback. */
function makeClock() {
  let time = 0
  const queue = []
  let seq = 0
  return {
    now: () => time,
    schedule(fn, ms) {
      const delay = Number.isFinite(ms) ? Math.max(0, ms) : 0
      const job = { at: time + delay, fn, id: ++seq }
      queue.push(job)
      return job.id
    },
    get pending() {
      return queue.length
    },
    advance(ms) {
      const target = time + Math.max(0, Number(ms) || 0)
      let guard = 0
      for (;;) {
        if (++guard > 100000) throw new Error('fake clock runaway')
        let best = -1
        for (let i = 0; i < queue.length; i += 1) {
          if (queue[i].at <= target && (best === -1 || queue[i].at < queue[best].at)) best = i
        }
        if (best === -1) break
        const [job] = queue.splice(best, 1)
        time = job.at
        job.fn()
      }
      time = target
    },
  }
}

/**
 * Fake engine adapter: records calls and appends an SVG to the container on
 * success; returns `ok:false` (or throws) when configured.
 */
function makeMount(config = {}) {
  const { ok = true, error = null, throwError = null } = config
  const calls = []
  const destroyed = []
  let alive = 0
  function mountDiagram(container, source) {
    calls.push({ container, source, at: alive })
    if (throwError !== null) throw throwError
    if (!ok) {
      alive += 1
      return {
        ok: false,
        error,
        refresh() {},
        destroy() {
          alive -= 1
          destroyed.push(source)
        },
      }
    }
    alive += 1
    const doc = container.ownerDocument
    const svg = doc.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('class', 'pele')
    svg.setAttribute('data-fake-source', source)
    container.appendChild(svg)
    return {
      ok: true,
      error: null,
      refresh() {},
      destroy() {
        alive -= 1
        destroyed.push(source)
        container.replaceChildren()
      },
    }
  }
  mountDiagram.calls = calls
  mountDiagram.destroyed = destroyed
  Object.defineProperty(mountDiagram, 'alive', { get: () => alive })
  return mountDiagram
}

/** Create a manager wired to a fresh document, fake clock and fake engine. */
function setup(opts = {}) {
  const doc = opts.document ?? makeDocument()
  const clock = opts.clock ?? makeClock()
  const mountDiagram = opts.mountDiagram ?? makeMount()
  const manager = createBlockManager({
    document: doc,
    locale: 'en',
    schedule: clock.schedule,
    now: clock.now,
    ...opts.manager,
    mountDiagram,
  })
  return { doc, clock, mountDiagram, manager }
}

/** Query the single mounted diagram container of a block. */
function containerOf(block) {
  return block.querySelector(`.${CLASS.diagram}`)
}

/** Toolbar buttons [diagram, source]. */
function buttonsOf(block) {
  return Array.from(block.querySelectorAll(`.${CLASS.toolbar} button`))
}

/* -------------------------------------------------------------------------- */
/* Readers                                                                    */
/* -------------------------------------------------------------------------- */

test('MERMAID_LANG is the mermaid fence tag', () => {
  assert.equal(MERMAID_LANG, 'mermaid')
})

test('readFenceLanguage reads the banner, strips chrome, lowercases', () => {
  const doc = makeDocument()
  const { block } = addBlock(doc, { language: 'Mermaid' })
  assert.equal(readFenceLanguage(block), 'mermaid')

  // Card-toolbar shape: extra svg icon and several action buttons.
  const banner = block.querySelector('[data-code-block-banner]')
  banner.innerHTML = ''
  const icon = doc.createElementNS(SVG_NS, 'svg')
  banner.appendChild(icon)
  const label = doc.createElement('span')
  label.textContent = 'mermaid'
  banner.appendChild(label)
  const actions = doc.createElement('div')
  actions.className = 'css-action'
  const copy = doc.createElement('button')
  copy.textContent = 'Copy'
  const download = doc.createElement('button')
  download.textContent = 'Download'
  actions.appendChild(copy)
  actions.appendChild(download)
  banner.appendChild(actions)
  assert.equal(readFenceLanguage(block), 'mermaid')
  // HTML remains untouched by the reader.
  assert.equal(copy.textContent, 'Copy')
})

test('readFenceLanguage returns null when unreadable', () => {
  const doc = makeDocument()
  const { block } = addBlock(doc, { banner: false })
  assert.equal(readFenceLanguage(block), null)
  assert.equal(readFenceLanguage(null), null)
  assert.equal(readFenceLanguage({}), null)

  // Banner with only chrome and no language text.
  const other = addBlock(doc).block
  const banner = other.querySelector('[data-code-block-banner]')
  banner.innerHTML = '<div class="css-action"><button>Copy</button></div>'
  assert.equal(readFenceLanguage(other), null)
})

test('readFenceSource returns the raw fence text and null when absent', () => {
  const doc = makeDocument()
  const source = 'flowchart LR\n  A-->B\n'
  const { block } = addBlock(doc, { source })
  assert.equal(readFenceSource(block), source, 'source is passed through as-is')

  const withoutPre = addBlock(doc, { pre: false }).block
  assert.equal(readFenceSource(withoutPre), null)
  assert.equal(readFenceSource(null), null)

  const withoutContent = doc.createElement('div')
  withoutContent.className = 'md-code-block'
  doc.body.appendChild(withoutContent)
  assert.equal(readFenceSource(withoutContent), null)
})

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

test('scan skips non-mermaid, blank and missing-source blocks', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  addBlock(doc, { language: 'javascript', source: 'console.log(1)' })
  addBlock(doc, { language: 'mermaid', source: '   \n\t ' })
  addBlock(doc, { language: 'mermaid', pre: false })
  addBlock(doc, { banner: false })

  manager.scan()
  clock.advance(1000)

  assert.equal(mountDiagram.calls.length, 0)
  assert.equal(manager.count, 0)
  assert.equal(doc.querySelectorAll(`.${CLASS.diagram}`).length, 0)
  assert.equal(doc.querySelectorAll(`.${CLASS.error}`).length, 0)
})

/* -------------------------------------------------------------------------- */
/* Settle gate                                                                */
/* -------------------------------------------------------------------------- */

test('settle gate: renders only after the source is stable for settleMs', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block, content } = addBlock(doc, { source: BASE_SOURCE })

  manager.scan()
  assert.equal(mountDiagram.calls.length, 0, 'not rendered on the first pass')
  assert.equal(manager.count, 0)
  assert.ok(content.querySelector('pre'), 'source stays visible while settling')

  clock.advance(179)
  assert.equal(mountDiagram.calls.length, 0, 'not rendered just before the window')

  clock.advance(1)
  assert.equal(mountDiagram.calls.length, 1, 'rendered exactly at the settle window')
  assert.equal(mountDiagram.calls[0].source, BASE_SOURCE)
  assert.equal(manager.count, 1)
  const container = containerOf(block)
  assert.ok(container, 'diagram container exists')
  assert.equal(container.querySelector('svg.pele')?.tagName.toLowerCase(), 'svg')
  assert.ok(content.querySelector(`pre[${SOURCE_HIDDEN_ATTR}]`), 'source remains mounted but hidden')
})

test('settle gate: streaming source changes reset the window (never partial)', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block, content } = addBlock(doc, { source: 'flowchart LR' })
  const code = content.querySelector('code')

  manager.scan() // t=0, source A
  clock.advance(100) // t=100
  code.textContent = 'flowchart LR\n  A-->'
  manager.scan() // t=100, source B resets `since`

  clock.advance(80) // t=180: the old timer fires early -> re-arms
  assert.equal(mountDiagram.calls.length, 0, 'not mounted while changing')

  clock.advance(100) // t=280: B has now been stable for 180ms
  assert.equal(mountDiagram.calls.length, 1, 'mounted only after B settled')
  assert.equal(mountDiagram.calls[0].source, 'flowchart LR\n  A-->')
  assert.equal(manager.count, 1)
  assert.equal(containerOf(block)?.querySelectorAll('svg.pele').length, 1)
})

/* -------------------------------------------------------------------------- */
/* Successful mount                                                           */
/* -------------------------------------------------------------------------- */

test('successful mount inserts our container, keeps the artifact, leaves banner alone', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block, content, banner, copyButton } = addBlock(doc)
  const originalPre = content.querySelector('pre')

  manager.scan()
  clock.advance(180)

  assert.equal(mountDiagram.calls.length, 1)
  assert.equal(mountDiagram.alive, 1)
  assert.equal(manager.count, 1)

  const container = containerOf(block)
  assert.ok(container)
  assert.equal(container.querySelector('svg.pele').getAttribute('data-fake-source'), BASE_SOURCE)
  assert.equal(content.querySelectorAll(`.${CLASS.diagram}`).length, 1)
  assert.equal(originalPre.parentElement, content, 'original parent is preserved')
  assert.equal(originalPre.hasAttribute(SOURCE_HIDDEN_ATTR), true)

  // Banner and its Copy button are untouched and still in place.
  assert.equal(block.querySelector('[data-code-block-banner]'), banner)
  assert.equal(banner.querySelector('button'), copyButton)
  assert.equal(copyButton.textContent, 'Copy')
  assert.equal(banner.querySelector('.css-infostring').textContent, 'mermaid')
  assert.equal(banner.parentNode, block.firstElementChild)
})

test('same-source scans are a no-op (no re-render)', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block } = addBlock(doc)

  manager.scan()
  clock.advance(180)
  assert.equal(mountDiagram.calls.length, 1)
  assert.equal(mountDiagram.alive, 1)

  manager.scan()
  manager.scan()
  clock.advance(1000)
  manager.scan()
  clock.advance(180)

  assert.equal(mountDiagram.calls.length, 1)
  assert.equal(mountDiagram.destroyed.length, 0)
  assert.equal(containerOf(block).querySelectorAll('svg.pele').length, 1)
})

/* -------------------------------------------------------------------------- */
/* Toolbar / source toggle                                                    */
/* -------------------------------------------------------------------------- */

test('toolbar toggles Diagram ⇄ Source with aria-pressed and the same pre node', () => {
  const { doc, clock, manager } = setup()
  const { block, content } = addBlock(doc)
  const originalPre = content.querySelector('pre')

  manager.scan()
  clock.advance(180)

  const toolbar = block.querySelector(`.${CLASS.toolbar}`)
  assert.ok(toolbar)
  assert.equal(toolbar.getAttribute('role'), 'group')
  const [diagramButton, sourceButton] = buttonsOf(block)
  assert.ok(diagramButton && sourceButton)
  assert.equal(diagramButton.textContent, 'Diagram')
  assert.equal(sourceButton.textContent, 'Source')
  assert.equal(diagramButton.getAttribute('aria-pressed'), 'true')
  assert.equal(sourceButton.getAttribute('aria-pressed'), 'false')
  assert.ok(diagramButton.classList.contains(CLASS.active))
  assert.ok(!sourceButton.classList.contains(CLASS.active))

  // Diagram -> Source
  sourceButton.click()
  assert.equal(sourceButton.getAttribute('aria-pressed'), 'true')
  assert.equal(diagramButton.getAttribute('aria-pressed'), 'false')
  assert.ok(sourceButton.classList.contains(CLASS.active))
  const wrapper = content.querySelector(`.${CLASS.source}`)
  assert.ok(wrapper, 'toolbar marks Source mode')
  assert.equal(originalPre.parentElement, content, 'original pre stays in its host-owned position')
  assert.equal(originalPre.hasAttribute(SOURCE_HIDDEN_ATTR), false)
  assert.equal(originalPre.textContent, BASE_SOURCE)
  assert.equal(content.querySelector(`.${CLASS.diagram} [data-dsh-pele-mermaid-host]`).hidden, true)
  assert.equal(manager.count, 1, 'diagram still mounted while inspecting source')

  // Source -> Diagram
  diagramButton.click()
  assert.equal(diagramButton.getAttribute('aria-pressed'), 'true')
  assert.equal(sourceButton.getAttribute('aria-pressed'), 'false')
  assert.equal(content.querySelector(`.${CLASS.source}`), null)
  assert.equal(content.querySelector('pre'), originalPre)
  assert.equal(originalPre.hasAttribute(SOURCE_HIDDEN_ATTR), true)
  assert.equal(manager.count, 1)

  // Toggling is idempotent.
  diagramButton.click()
  sourceButton.click()
  sourceButton.click()
  assert.equal(content.querySelectorAll(`.${CLASS.source}`).length, 1)
  assert.equal(content.querySelectorAll(`.${CLASS.toolbar}`).length, 1)
})

test('locale controls toolbar labels (zh)', () => {
  const { doc, clock, manager } = setup({ manager: { locale: 'zh' } })
  const { block } = addBlock(doc)
  manager.scan()
  clock.advance(180)
  const [diagramButton, sourceButton] = buttonsOf(block)
  assert.equal(manager.locale, 'zh')
  assert.equal(diagramButton.textContent, '图表')
  assert.equal(sourceButton.textContent, '源码')
  assert.equal(block.querySelector(`.${CLASS.toolbar}`).getAttribute('aria-label'), '图表操作')
})

test('default locale falls back gracefully when none is injected', () => {
  const doc = makeDocument()
  const clock = makeClock()
  const mountDiagram = makeMount()
  const manager = createBlockManager({
    document: doc,
    schedule: clock.schedule,
    now: clock.now,
    mountDiagram,
  })
  assert.ok(manager.locale === 'en' || manager.locale === 'zh')
  const { block } = addBlock(doc)
  manager.scan()
  clock.advance(180)
  const [diagramButton] = buttonsOf(block)
  assert.equal(
    diagramButton.textContent,
    manager.locale === 'zh' ? '图表' : 'Diagram',
  )
})

/* -------------------------------------------------------------------------- */
/* Error fallback                                                             */
/* -------------------------------------------------------------------------- */

test('mount failure keeps the DSH source visible and appends a plain-text note', () => {
  const mountDiagram = makeMount({ ok: false, error: '<b>bad</b> syntax' })
  const { doc, clock, manager } = setup({ mountDiagram })
  const { block, content } = addBlock(doc)
  const originalPre = content.querySelector('pre')

  manager.scan()
  clock.advance(180)

  assert.equal(mountDiagram.calls.length, 1)
  assert.equal(manager.count, 0)
  assert.equal(content.querySelector(`.${CLASS.diagram}`), null)
  assert.equal(content.querySelector('pre'), originalPre, 'source stays visible exactly as rendered')
  assert.ok(content.contains(originalPre))
  const note = content.querySelector(`.${CLASS.error}`)
  assert.ok(note, 'error note appended')
  assert.equal(note.textContent, 'Pele: <b>bad</b> syntax')
  assert.equal(note.querySelector('b'), null, 'error message is textContent, never HTML')
  assert.equal(block.querySelectorAll(`.${CLASS.error}`).length, 1)

  // Same source: the record stays, no retry storm.
  manager.scan()
  clock.advance(500)
  assert.equal(mountDiagram.calls.length, 1)
  assert.equal(manager.count, 0)
})

test('a changed source retries after failure and errorPrefix is configurable', () => {
  const mountDiagram = makeMount({ ok: false, error: 'broken' })
  const { doc, clock, manager } = setup({
    mountDiagram,
    manager: { errorPrefix: 'Mermaid error: ' },
  })
  const { block, content } = addBlock(doc)

  manager.scan()
  clock.advance(180)
  assert.equal(content.querySelector(`.${CLASS.error}`).textContent, 'Mermaid error: broken')

  content.querySelector('code').textContent = 'flowchart TD\n  X-->Y'
  manager.scan()
  clock.advance(180)

  assert.equal(mountDiagram.calls.length, 2)
  assert.equal(mountDiagram.calls[1].source, 'flowchart TD\n  X-->Y')
  // Fake engine still fails, so the note reflects the retry's error only.
  assert.equal(content.querySelectorAll(`.${CLASS.error}`).length, 1)
  assert.equal(content.querySelector('pre') !== null, true)
  assert.equal(manager.count, 0)
})

test('ok engine error message falls back to plain text and a thrown adapter is contained', () => {
  const thrown = () => {
    throw new Error('kaboom')
  }
  const { doc, clock, manager } = setup({ mountDiagram: thrown })
  const { content } = addBlock(doc)

  assert.doesNotThrow(() => {
    manager.scan()
    clock.advance(180)
  })
  const note = content.querySelector(`.${CLASS.error}`)
  assert.ok(note)
  assert.equal(note.textContent, 'Pele: kaboom')
  assert.equal(manager.count, 0)

  // Edge: adapter returns ok:false with no message at all.
  const silent = makeMount({ ok: false, error: null })
  const second = setup({ mountDiagram: silent })
  addBlock(second.doc)
  second.manager.scan()
  second.clock.advance(180)
  const silentNote = second.doc.querySelector(`.${CLASS.error}`)
  assert.ok(silentNote)
  assert.equal(silentNote.textContent, 'Pele: unable to render diagram')
})

/* -------------------------------------------------------------------------- */
/* Refresh                                                                    */
/* -------------------------------------------------------------------------- */

test('refreshAll re-mounts every mounted diagram with the same source', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block } = addBlock(doc)

  manager.scan()
  clock.advance(180)
  assert.equal(mountDiagram.calls.length, 1)
  assert.equal(mountDiagram.alive, 1)

  manager.refreshAll()

  assert.equal(mountDiagram.calls.length, 2)
  assert.equal(mountDiagram.calls[1].source, BASE_SOURCE)
  assert.equal(mountDiagram.destroyed.length, 1, 'old handle destroyed')
  assert.equal(mountDiagram.alive, 1)
  assert.equal(manager.count, 1)
  assert.equal(block.querySelectorAll(`.${CLASS.diagram}`).length, 1)
  assert.equal(block.querySelectorAll('svg.pele').length, 1)
  assert.equal(block.querySelectorAll(`.${CLASS.toolbar}`).length, 1)

  // Source view survives a rebuild (Pele output stays hidden).
  buttonsOf(block)[1].click()
  manager.refreshAll()
  assert.equal(block.querySelectorAll(`.${CLASS.diagram}`).length, 1)
  assert.equal(button(block, 'Source').getAttribute('aria-pressed'), 'true')
  assert.equal(block.querySelector('pre') !== null, true)
})

function button(block, label) {
  return Array.from(block.querySelectorAll(`.${CLASS.toolbar} button`)).find(
    (candidate) => candidate.textContent === label,
  )
}

test('refreshAll ignores error and pending blocks', () => {
  const mountDiagram = makeMount({ ok: false, error: 'nope' })
  const { doc, clock, manager } = setup({ mountDiagram })
  addBlock(doc)

  manager.scan()
  clock.advance(180)
  const callsAfterError = mountDiagram.calls.length
  manager.refreshAll()
  assert.equal(mountDiagram.calls.length, callsAfterError, 'error block not rebuilt')

  const second = setup()
  addBlock(second.doc)
  second.manager.scan() // pending, not yet settled
  second.manager.refreshAll()
  assert.equal(second.mountDiagram.calls.length, 0)
})

/* -------------------------------------------------------------------------- */
/* Destroy / restore                                                          */
/* -------------------------------------------------------------------------- */

test('destroy restores the exact original DOM and is idempotent', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block, content } = addBlock(doc)
  const originalPre = content.querySelector('pre')
  const before = doc.body.innerHTML

  manager.scan()
  clock.advance(180)
  assert.equal(manager.count, 1)
  assert.notEqual(doc.body.innerHTML, before)

  manager.destroy()

  assert.equal(doc.body.innerHTML, before, 'page DOM round-trips exactly')
  assert.equal(content.childNodes.length, 1)
  assert.equal(content.firstChild, originalPre, 'same <pre> node reinserted')
  assert.equal(originalPre.parentNode, content)
  assert.equal(doc.querySelectorAll(`.${CLASS.diagram}`).length, 0)
  assert.equal(doc.querySelectorAll(`.${CLASS.toolbar}`).length, 0)
  assert.equal(doc.querySelectorAll(`.${CLASS.error}`).length, 0)
  assert.equal(manager.count, 0)
  assert.equal(mountDiagram.destroyed.length, 1, 'Pele handle destroyed')
  assert.equal(mountDiagram.alive, 0)

  assert.doesNotThrow(() => manager.destroy(), 'destroy is idempotent')
  assert.doesNotThrow(() => manager.destroy())

  manager.scan()
  clock.advance(1000)
  assert.equal(doc.body.innerHTML, before, 'destroyed manager never re-applies')
  assert.equal(mountDiagram.calls.length, 1)
})

test('destroy restores the DOM from source view and while a block is in error', () => {
  const { doc, clock, manager } = setup()
  const first = addBlock(doc)
  const beforeFirst = doc.body.innerHTML
  manager.scan()
  clock.advance(180)
  buttonsOf(first.block)[1].click()
  manager.destroy()
  assert.equal(doc.body.innerHTML, beforeFirst)

  const failing = makeMount({ ok: false, error: 'bad' })
  const second = setup({ mountDiagram: failing })
  addBlock(second.doc)
  const beforeError = second.doc.body.innerHTML
  second.manager.scan()
  second.clock.advance(180)
  second.manager.destroy()
  assert.equal(second.doc.body.innerHTML, beforeError)
})

test('destroy while a settle timer is pending mounts nothing', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  addBlock(doc)
  const before = doc.body.innerHTML
  manager.scan()
  assert.equal(mountDiagram.calls.length, 0)
  manager.destroy()
  clock.advance(1000)
  assert.equal(mountDiagram.calls.length, 0)
  assert.equal(doc.body.innerHTML, before)
  assert.equal(manager.count, 0)
})

/* -------------------------------------------------------------------------- */
/* Multiple blocks                                                            */
/* -------------------------------------------------------------------------- */

test('multiple blocks: independent settle, mount and restore', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const a = addBlock(doc, { source: 'flowchart LR\n  A-->B' })
  const b = addBlock(doc, { source: 'sequenceDiagram\n  A->>B: hi' })
  const js = addBlock(doc, { language: 'javascript', source: 'let x = 1' })
  const blank = addBlock(doc, { language: 'mermaid', source: '  ' })
  const before = doc.body.innerHTML

  manager.scan()
  assert.equal(mountDiagram.calls.length, 0)
  clock.advance(180)

  assert.equal(mountDiagram.calls.length, 2)
  assert.equal(manager.count, 2)
  assert.ok(containerOf(a.block))
  assert.ok(containerOf(b.block))
  assert.equal(containerOf(js.block), null)
  assert.equal(containerOf(blank.block), null)
  assert.equal(mountDiagram.calls[0].source, 'flowchart LR\n  A-->B')
  assert.equal(mountDiagram.calls[1].source, 'sequenceDiagram\n  A->>B: hi')

  manager.destroy()
  assert.equal(doc.body.innerHTML, before)
  assert.equal(mountDiagram.destroyed.length, 2)
  assert.equal(manager.count, 0)
})

/* -------------------------------------------------------------------------- */
/* React self-healing                                                         */
/* -------------------------------------------------------------------------- */

test('React wipe (same source): next scan re-applies without waiting', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block, content } = addBlock(doc)

  manager.scan()
  clock.advance(180)
  assert.equal(mountDiagram.calls.length, 1)

  // React replaces the whole content subtree with a fresh pre.
  const freshPre = doc.createElement('pre')
  const freshCode = doc.createElement('code')
  freshCode.textContent = BASE_SOURCE
  freshPre.appendChild(freshCode)
  content.replaceChildren(freshPre)

  manager.scan()

  assert.equal(mountDiagram.calls.length, 2, 're-applied on the next scan')
  assert.equal(manager.count, 1)
  assert.equal(content.querySelectorAll(`.${CLASS.diagram}`).length, 1)
  assert.equal(content.querySelectorAll('pre').length, 1)
  assert.equal(block.querySelectorAll(`.${CLASS.toolbar}`).length, 1)
  // The fresh React pre became the new source artifact.
  buttonsOf(block)[1].click()
  assert.equal(content.querySelector('pre'), freshPre)
})

test('React wipe (changed source): re-settles instead of mounting stale text', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { content } = addBlock(doc)

  manager.scan()
  clock.advance(180)
  assert.equal(mountDiagram.calls.length, 1)

  const freshPre = doc.createElement('pre')
  const freshCode = doc.createElement('code')
  freshCode.textContent = 'flowchart TD\n  X-->Y'
  freshPre.appendChild(freshCode)
  content.replaceChildren(freshPre)

  manager.scan()
  assert.equal(mountDiagram.calls.length, 1, 'not mounted before the new source settles')
  assert.equal(manager.count, 0)

  clock.advance(180)
  assert.equal(mountDiagram.calls.length, 2)
  assert.equal(mountDiagram.calls[1].source, 'flowchart TD\n  X-->Y')
  assert.equal(manager.count, 1)
})

test('host patching its original source re-settles on the next scan', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block, content } = addBlock(doc)

  manager.scan()
  clock.advance(180)
  // Toggle without moving the host's source node.
  buttonsOf(block)[1].click()
  const pre = content.querySelector('pre')
  buttonsOf(block)[0].click()
  assert.equal(pre.isConnected, true)

  // The source update remains in the observed host subtree.
  pre.querySelector('code').textContent = 'sequenceDiagram\n  A->>B: hi'
  manager.scan()
  assert.equal(manager.count, 0, 'old diagram dropped for the changed source')
  assert.equal(mountDiagram.destroyed.length, 1)

  clock.advance(180)
  assert.equal(mountDiagram.calls.length, 2)
  assert.equal(mountDiagram.calls[1].source, 'sequenceDiagram\n  A->>B: hi')
  assert.equal(manager.count, 1)
})

test('React removing the whole block cleans up and never throws', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block, content } = addBlock(doc)
  const before = block.innerHTML

  manager.scan()
  clock.advance(180)
  assert.equal(manager.count, 1)

  block.remove()
  assert.doesNotThrow(() => manager.scan())
  assert.equal(manager.count, 0)
  assert.equal(mountDiagram.alive, 0)
  assert.equal(mountDiagram.destroyed.length, 1)
  assert.equal(block.innerHTML, before, 'detached block subtree restored')
  assert.equal(block.querySelectorAll(`.${CLASS.diagram}`).length, 0)
  assert.equal(content.querySelectorAll('pre').length, 1)

  // A later scan with no matching blocks stays quiet.
  assert.doesNotThrow(() => manager.scan())
  clock.advance(1000)
  assert.equal(manager.count, 0)
})

/* -------------------------------------------------------------------------- */
/* Test seams                                                                 */
/* -------------------------------------------------------------------------- */

test('options.classes overrides every class name we add', () => {
  const custom = {
    diagram: 'x-diagram',
    toolbar: 'x-toolbar',
    error: 'x-error',
    source: 'x-source',
    active: 'x-active',
  }
  // Successful mount: container, toolbar and active button use our names.
  const { doc, clock, manager } = setup({ manager: { classes: custom } })
  const { block } = addBlock(doc)
  manager.scan()
  clock.advance(180)
  assert.ok(block.querySelector('.x-diagram'))
  assert.ok(block.querySelector('.x-toolbar'))
  assert.ok(block.querySelector('.x-toolbar button.x-active'))
  assert.equal(block.querySelector('.' + CLASS.diagram), null)
  assert.equal(block.querySelector('.' + CLASS.toolbar), null)

  // Error path: the note uses the overridden error class as well.
  const failing = makeMount({ ok: false, error: 'e' })
  const second = setup({ mountDiagram: failing, manager: { classes: custom } })
  const failingBlock = addBlock(second.doc).block
  second.manager.scan()
  second.clock.advance(180)
  assert.ok(failingBlock.querySelector('.x-error'))
  assert.equal(failingBlock.querySelector('.' + CLASS.error), null)
})

test('custom settleMs is honored', () => {
  const { doc, clock, mountDiagram, manager } = setup({ manager: { settleMs: 50 } })
  addBlock(doc)
  manager.scan()
  clock.advance(49)
  assert.equal(mountDiagram.calls.length, 0)
  clock.advance(1)
  assert.equal(mountDiagram.calls.length, 1)
})

test('custom errorPrefix and mountDiagram injection work together', () => {
  const mountDiagram = makeMount()
  const { doc, clock, manager } = setup({
    mountDiagram,
    manager: { errorPrefix: 'E: ', settleMs: 0 },
  })
  addBlock(doc)
  manager.scan() // settleMs 0 -> mounts on the first pass
  assert.equal(mountDiagram.calls.length, 1)
  assert.equal(manager.count, 1)
  assert.equal(doc.querySelector(`.${CLASS.error}`), null)
  manager.destroy()
})

test('scan is defensive when document-like inputs are broken', () => {
  const doc = makeDocument()
  const clock = makeClock()
  const manager = createBlockManager({
    document: doc,
    mountDiagram: makeMount(),
    schedule: clock.schedule,
    now: clock.now,
  })
  // Poisoned block-ish nodes must not make scan throw.
  const fake = doc.createElement('div')
  fake.className = 'md-code-block'
  const banner = doc.createElement('div')
  banner.setAttribute('data-code-block-banner', '')
  banner.textContent = 'mermaid'
  fake.appendChild(banner)
  doc.body.appendChild(fake)
  assert.doesNotThrow(() => manager.scan())
  clock.advance(1000)
  assert.equal(manager.count, 0)
  manager.destroy()
})

/* -------------------------------------------------------------------------- */
/* Detection: DSH card-toolbar shape (real chat DOM)                          */
/* -------------------------------------------------------------------------- */

test('readFenceLanguage: a generic code label is not a language', () => {
  const doc = makeDocument()
  const { block } = addBlock(doc, { language: '代码块' })
  assert.equal(readFenceLanguage(block), null, 'localized generic label => unknown')

  const { block: english } = addBlock(doc, { language: 'Code' })
  assert.equal(readFenceLanguage(english), null, 'en generic label => unknown')
})

test('card mode: React fiber props give the exact language and source', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const codeBlockProps = { code: 'flowchart LR\n  A-->B', lang: 'mermaid' }
  // Simulate the host fiber -> CodeBlock component fiber chain React attaches.
  const { block } = addBlock(doc, { language: '代码块', source: 'rendered pre fallback' })
  attachCodeBlockFiber(block, codeBlockProps)

  assert.equal(readFenceLanguage(block), 'mermaid')
  assert.equal(readFenceSource(block), codeBlockProps.code, 'React code prop wins over the rendered pre')

  manager.scan()
  clock.advance(300)
  assert.equal(mountDiagram.calls.length, 1)
  assert.equal(mountDiagram.calls[0].source, codeBlockProps.code)
  assert.equal(manager.count, 1)
  manager.destroy()
})

test('generic banner without usable React internals leaves even valid diagram source untouched', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block } = addBlock(doc, { language: '代码块', source: BASE_SOURCE })
  const before = block.outerHTML
  manager.scan()
  clock.advance(300)
  assert.equal(mountDiagram.calls.length, 0)
  assert.equal(manager.count, 0)
  assert.equal(block.outerHTML, before)
  manager.destroy()
})

test('uncommitted or malformed fiber props cannot override an explicit DOM language', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  const { block } = addBlock(doc, { language: 'javascript', source: BASE_SOURCE })
  const component = attachCodeBlockFiber(block, { lang: 'mermaid', code: BASE_SOURCE })
  component.return.stateNode.current = null
  assert.equal(readFenceLanguage(block), 'javascript')
  manager.scan()
  clock.advance(300)
  assert.equal(mountDiagram.calls.length, 0)
  manager.destroy()
})

test('unknown language becoming explicit mermaid retries the unchanged source with the error path', () => {
  const { doc, clock, mountDiagram, manager } = setup({
    mountDiagram: makeMount({ ok: false, error: 'Parse error' }),
  })
  const { block } = addBlock(doc, { language: '代码块', source: 'flowchart LR A--' })
  manager.scan()
  clock.advance(300)
  assert.equal(mountDiagram.calls.length, 0)
  attachCodeBlockFiber(block, { lang: 'mermaid', code: 'flowchart LR A--' })
  manager.scan()
  clock.advance(300)
  assert.equal(mountDiagram.calls.length, 1)
  assert.ok(block.querySelector(`.${CLASS.error}`))
  assert.equal(block.querySelector(`pre[${SOURCE_HIDDEN_ATTR}]`), null)
  manager.destroy()
})

test('explicit non-mermaid languages with drawable diagram source stay native', () => {
  const { doc, clock, mountDiagram, manager } = setup()
  addBlock(doc, { language: 'lua', source: BASE_SOURCE })
  manager.scan()
  clock.advance(300)
  assert.equal(mountDiagram.calls.length, 0)
  manager.destroy()
})
