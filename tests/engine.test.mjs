/**
 * Unit tests for the Pele adapter (src/client/engine.js).
 *
 * The engine module is imported statically, i.e. BEFORE the jsdom globals are
 * installed in `before()`. That ordering is intentional: it proves the module
 * has no `document`/`window` access at import time. Pele itself is also safe to
 * import in Node (the canvas measurer is resolved lazily at mount time).
 *
 * jsdom has no canvas 2d context, so Pele's documented metrics-table fallback
 * is what lays out every diagram here. That is exactly the path a browser
 * without canvas support takes, so we exercise it instead of injecting a
 * custom measurer (production keeps browser defaults).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { after, afterEach, before, test } from 'node:test'

import { JSDOM, VirtualConsole } from 'jsdom'

import { DIAGRAM_OPTIONS, mountDiagram } from '../src/client/engine.js'

const GLOBAL_KEYS = ['window', 'document', 'HTMLElement', 'Node', 'SVGElement', 'getComputedStyle']

/** @type {Map<string, { had: boolean, value: unknown }>} */
const savedGlobals = new Map()
/** @type {import('jsdom').JSDOM} */
let dom
/** @type {import('jsdom').DOMWindow} */
let window
/** @type {Document} */
let document
/** @type {Array<Error & { message: string }>} */
const jsdomErrors = []

before(() => {
  for (const key of GLOBAL_KEYS) {
    savedGlobals.set(key, {
      had: Object.prototype.hasOwnProperty.call(globalThis, key),
      value: /** @type {Record<string, unknown>} */ (globalThis)[key],
    })
  }

  // Collect jsdom errors instead of forwarding them to stderr; the canvas
  // "Not implemented" notice is expected and asserted below. No sendTo(console)
  // means the warning never pollutes test output.
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => {
    jsdomErrors.push(/** @type {Error & { message: string }} */ (error))
  })

  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://dsh-pele-mermaid.test/',
    virtualConsole,
  })
  window = dom.window
  document = window.document

  const globals = /** @type {Record<string, unknown>} */ (globalThis)
  globals.window = window
  globals.document = document
  globals.HTMLElement = window.HTMLElement
  globals.Node = window.Node
  globals.SVGElement = window.SVGElement
  globals.getComputedStyle = window.getComputedStyle.bind(window)
})

afterEach(() => {
  if (document) document.body.replaceChildren()
})

after(() => {
  try {
    window.close()
  } catch {
    // jsdom teardown is best-effort.
  }
  for (const [key, saved] of savedGlobals) {
    const globals = /** @type {Record<string, unknown>} */ (globalThis)
    if (saved.had) globals[key] = saved.value
    else delete globals[key]
  }
  savedGlobals.clear()
})

/** @returns {HTMLElement} */
function makeContainer() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

test('engine module imports without any DOM globals (no import-time document access)', () => {
  // The static import at the top already ran before `before()` installed the
  // jsdom globals. Re-prove it deterministically in a clean child process too.
  const engineUrl = new URL('../src/client/engine.js', import.meta.url).href
  const script = `const eng = await import(${JSON.stringify(engineUrl)}); console.log(typeof eng.mountDiagram === 'function' ? 'import-ok' : 'bad');`
  const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.match(stdout, /import-ok/)
})

test('DIAGRAM_OPTIONS is the frozen, engine-owned display contract', () => {
  assert.deepEqual({ ...DIAGRAM_OPTIONS }, { zoom: true, autoDirection: true, responsive: true, images: false })
  assert.ok(Object.isFrozen(DIAGRAM_OPTIONS))
  assert.equal(Object.isExtensible(DIAGRAM_OPTIONS), false)
})

test('mounts a flowchart synchronously with Pele despite jsdom lacking canvas 2d', () => {
  // Precondition: jsdom's canvas has no 2d context, so this exercises Pele's
  // built-in width-table fallback (the documented no-canvas path).
  assert.equal(document.createElement('canvas').getContext('2d'), null)

  const container = makeContainer()
  const handle = mountDiagram(container, 'flowchart LR\n A-->B')

  assert.equal(handle.ok, true)
  assert.equal(handle.error, null)
  assert.equal(typeof handle.refresh, 'function')
  assert.equal(typeof handle.destroy, 'function')

  const svg = container.querySelector('svg.pele')
  assert.ok(svg, 'Pele svg is present in the container')
  assert.match(String(svg.getAttribute('class')), /\bpele-flowchart\b/)
  assert.ok(Number(svg.getAttribute('width')) > 0)
  assert.ok(Number(svg.getAttribute('height')) > 0)
  assert.equal(container.querySelectorAll('svg.pele').length, 1)

  // zoom: true is part of DIAGRAM_OPTIONS; Pele renders its own controls.
  assert.ok(container.querySelector('.pele-zoom'), 'zoom controls were mounted')
  assert.equal(container.querySelectorAll('.pele-zoom button').length, 3)

  handle.destroy()
})

test('handle exposes exactly { ok, error, refresh, destroy }', () => {
  const container = makeContainer()
  const handle = mountDiagram(container, 'flowchart TD\n X-->Y')
  assert.deepEqual(Object.keys(handle).sort(), ['destroy', 'error', 'ok', 'refresh'])
  handle.destroy()
})

test('syntax error: ok:false, plain-text message, container left empty', () => {
  const container = makeContainer()
  const handle = mountDiagram(container, 'flowchart LR\n A-->')

  assert.equal(handle.ok, false)
  assert.equal(typeof handle.error, 'string')
  assert.ok(handle.error.length > 0)
  assert.match(handle.error, /parse error|expecting/i)
  assert.equal(container.childNodes.length, 0)
  assert.equal(container.innerHTML, '')
  assert.doesNotThrow(() => handle.destroy())
})

test('unsupported source: ok:false with Pele message and empty container', () => {
  const container = makeContainer()
  const handle = mountDiagram(container, 'hello world, not a diagram')

  assert.equal(handle.ok, false)
  assert.equal(typeof handle.error, 'string')
  assert.match(handle.error, /no diagram type detected/i)
  assert.equal(container.innerHTML, '')
})

test('never throws for diagram content, invalid containers, or odd source values', () => {
  const container = makeContainer()
  const sources = [
    '',
    '   \n\t ',
    'flowchart LR\n A-->',
    'nonsense',
    'flowchart LR',
    'sequenceDiagram\n Alice->>Bob: hi\n',
    null,
    undefined,
    42,
    Symbol('source'),
    { toString: () => 'flowchart LR\n A-->B' },
  ]

  for (const source of sources) {
    assert.doesNotThrow(() => {
      const handle = mountDiagram(container, /** @type {any} */ (source))
      assert.equal(typeof handle.ok, 'boolean')
      if (!handle.ok) assert.equal(typeof handle.error, 'string')
      handle.destroy()
    }, `did not throw for source: ${String(source).slice(0, 40)}`)
    assert.equal(container.childNodes.length, 0, 'every handle was torn down')
  }

  for (const invalid of [null, undefined, {}, 'not-an-element', 0, false]) {
    let handle
    assert.doesNotThrow(() => {
      handle = mountDiagram(/** @type {any} */ (invalid), 'flowchart LR\n A-->B')
    })
    assert.equal(handle.ok, false)
    assert.equal(typeof handle.error, 'string')
    assert.ok(handle.error.length > 0)
    assert.doesNotThrow(() => handle.refresh())
    assert.doesNotThrow(() => handle.destroy())
  }
})

test('oversized source is rejected by Pele limits without throwing', () => {
  const container = makeContainer()
  const source = `flowchart LR\n${Array.from({ length: 4000 }, (_, index) => `N${index}-->N${index + 1}`).join('\n')}`

  const handle = mountDiagram(container, source)

  assert.equal(handle.ok, false)
  assert.equal(typeof handle.error, 'string')
  assert.match(handle.error, /longer than the limit/i)
  assert.equal(container.childNodes.length, 0)
})

test('diagram labels are escaped by Pele: markup never becomes DOM', () => {
  const container = makeContainer()
  const handle = mountDiagram(container, 'flowchart LR\n A["<img src=x onerror=alert(1)>"]-->B')

  // Whatever Pele decides (valid label vs. parse error), adapter output must
  // never contain an injected element.
  assert.equal(container.querySelector('img'), null)
  assert.equal(container.querySelector('script'), null)
  assert.equal(typeof handle.ok, 'boolean')
  handle.destroy()
})

test('diagram images are disabled for remote and relative URLs without breaking the graph', () => {
  for (const url of ['https://example.invalid/probe.svg', 'probe.svg', '/probe.svg']) {
    const container = makeContainer()
    const handle = mountDiagram(container, `flowchart LR\n A@{ img: "${url}", label: "Probe", h: 40 }\n A-->B`)
    assert.equal(handle.ok, true, `image syntax still renders: ${url}`)
    assert.ok(container.querySelector('svg.pele'))
    assert.equal(container.querySelector('image, img'), null, `no image resource: ${url}`)
    assert.ok(!container.innerHTML.includes(url), 'the disabled URL is absent from the output')
    handle.refresh()
    assert.equal(container.querySelector('image, img'), null, 'refresh keeps images disabled')
    handle.destroy()
  }
})

test('destroy clears the container and is idempotent', () => {
  const container = makeContainer()
  const handle = mountDiagram(container, 'flowchart LR\n A-->B')
  assert.equal(handle.ok, true)
  assert.ok(container.childElementCount > 0)

  handle.destroy()
  assert.equal(container.childNodes.length, 0)
  assert.equal(container.innerHTML, '')

  assert.doesNotThrow(() => handle.destroy())
  assert.doesNotThrow(() => handle.refresh())
  assert.equal(container.childNodes.length, 0)
})

test('refresh re-lays out in place without throwing', () => {
  const container = makeContainer()
  const handle = mountDiagram(container, 'flowchart LR\n A-->B')
  assert.equal(handle.ok, true)

  assert.doesNotThrow(() => handle.refresh())
  assert.ok(container.querySelector('svg.pele'))
  assert.equal(container.querySelectorAll('svg.pele').length, 1)

  handle.destroy()
  assert.equal(container.childNodes.length, 0)
})

test('failed mount after a successful one leaves the container empty', () => {
  const container = makeContainer()
  assert.equal(mountDiagram(container, 'flowchart LR\n A-->B').ok, true)
  assert.ok(container.querySelector('svg.pele'))

  const failed = mountDiagram(container, 'flowchart LR\n A-->')
  assert.equal(failed.ok, false)
  assert.equal(typeof failed.error, 'string')
  assert.equal(container.childNodes.length, 0)
})

test('handles only clear their own container', () => {
  const first = makeContainer()
  const second = makeContainer()
  const firstHandle = mountDiagram(first, 'flowchart LR\n A-->B')
  const secondHandle = mountDiagram(second, 'flowchart LR\n C-->D')

  assert.equal(firstHandle.ok, true)
  assert.equal(secondHandle.ok, true)

  firstHandle.destroy()
  assert.equal(first.childNodes.length, 0)
  assert.ok(second.querySelector('svg.pele'))

  secondHandle.destroy()
  assert.equal(second.childNodes.length, 0)
})

test('destroy and refresh are safe after a host render already removed the diagram', () => {
  const container = makeContainer()
  const handle = mountDiagram(container, 'flowchart LR\n A-->B')
  assert.equal(handle.ok, true)

  // Simulate a React pass that replaces the whole wrapper under us.
  container.replaceChildren()

  assert.doesNotThrow(() => handle.refresh())
  assert.doesNotThrow(() => handle.destroy())
  assert.doesNotThrow(() => handle.destroy())
  assert.equal(container.childNodes.length, 0)
})

test('refresh and destroy are safe when the container was detached by the host', () => {
  const container = makeContainer()
  const handle = mountDiagram(container, 'flowchart LR\n A-->B')
  assert.equal(handle.ok, true)

  container.remove()
  assert.doesNotThrow(() => handle.refresh())
  assert.doesNotThrow(() => handle.destroy())
  assert.equal(container.childNodes.length, 0)
})

test('mounting does not add classes or wrappers of its own to the container', () => {
  const container = makeContainer()
  container.className = 'caller-owned'
  const handle = mountDiagram(container, 'flowchart LR\n A-->B')
  assert.equal(handle.ok, true)
  assert.equal(container.className, 'caller-owned')
  // Pele owns its children (svg + zoom controls); the adapter adds nothing.
  for (const child of Array.from(container.children)) {
    const tag = child.tagName.toLowerCase()
    assert.ok(tag === 'svg' || String(child.getAttribute('class')).includes('pele'), `unexpected adapter child: ${tag}`)
  }
  handle.destroy()
})

test('mounting produced no unexpected jsdom errors', () => {
  const unexpected = jsdomErrors.filter(
    (error) => !/Not implemented: HTMLCanvasElement/i.test(String(error && error.message)),
  )
  assert.deepEqual(
    unexpected.map((error) => String(error && error.message)),
    [],
  )
})
