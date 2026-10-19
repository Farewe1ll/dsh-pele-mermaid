/**
 * End-to-end smoke test for the BUILT browser bundle (`lib/client.js`).
 *
 * This is the only test that exercises the artifact DSH actually serves, so it
 * covers the full browser-half contract from docs/ARCH.md:
 *
 *  1. The module-loader wrapper: `window.__ModuleLoader__.load({ id, factory })`
 *     with the id equal to the package name.
 *  2. `factory(require)` never calls `require` (Pele and every dependency are
 *     bundled) and returns a static `inject: ['theme']` plus an `apply()`.
 *  3. Applying the plugin to the ARCH.md CodeBlock DOM replaces settled mermaid
 *     fences with Pele diagrams, keeps the banner/source semantics, leaves
 *     non-mermaid blocks alone, and degrades to source + a plain-text error for
 *     an undrawable fence.
 *  4. Theme changes with unchanged font inputs never re-render (colour changes
 *     are pure CSS); a font-metric change does re-render.
 *  5. `ctx.effect()`'s disposer restores the pre-plugin DOM byte-for-byte and
 *     stops observing the document.
 *  6. A fence added after boot (streaming / session-history path) is picked up
 *     by the MutationObserver and rendered after it settles.
 *
 * The bundle is evaluated with `window.eval(source)` inside a jsdom window with
 * `runScripts: 'outside-only'`, so the wrapper and the plugin run in the jsdom
 * realm: bare `setTimeout`/`MutationObserver` resolve to the window's
 * implementations exactly as they will in the real browser.
 *
 * If `lib/client.js` is missing the whole file fails loudly: build first.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

import { JSDOM, VirtualConsole } from 'jsdom'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE_PATH = path.join(ROOT, 'lib/client.js')
const PACKAGE_PATH = path.join(ROOT, 'package.json')

if (!existsSync(BUNDLE_PATH)) {
  throw new Error(
    'lib/client.js is missing — run `npm run build` first ' +
      '(or `npm run verify`, which runs `build --check` before this test).',
  )
}

const BUNDLE = readFileSync(BUNDLE_PATH, 'utf8')
const PKG = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'))

const BUNDLE_ID = 'dsh-pele-mermaid'
const WRAPPER_PREFIX =
  `window.__ModuleLoader__.load({id:${JSON.stringify(BUNDLE_ID)},` +
  'factory:(require)=>{var module={exports:{}};var exports=module.exports;\n'
const WRAPPER_SUFFIX = '\nreturn module.exports;}});\n'
const STYLE_ATTR = 'data-dsh-pele-mermaid'
const FORBIDDEN_CDN_MARKERS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fastly.jsdelivr.net',
  'esm.sh',
  'skypack',
]

/** jsdom notices that are expected in this headless environment. */
const EXPECTED_JSDOM_NOTICES = ['HTMLCanvasElement', 'getContext']

/* -------------------------------------------------------------------------- */
/* Fixture DOM (docs/ARCH.md CodeBlock contract)                              */
/* -------------------------------------------------------------------------- */

/** @param {string} text */
function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * @param {string} language
 * @param {string} source
 */
function codeBlockHtml(language, source) {
  return [
    '<div class="md-code-block">',
    '  <div class="md-code-block-card">',
    '    <div class="md-code-block-banner" data-code-block-banner>',
    '      <div class="md-code-block-infostring">' + escapeHtml(language) + '</div>',
    '      <div class="md-code-block-action"><button type="button">Copy</button></div>',
    '    </div>',
    '  </div>',
    '  <div class="md-code-block-content" data-code-block-content>',
    '    <pre class="md-code-block-pre"><code>' + escapeHtml(source) + '</code></pre>',
    '  </div>',
    '</div>',
  ].join('\n')
}

const FLOWCHART = 'flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[Ship]\n  B -->|no| D[Fix]'
const SEQUENCE = 'sequenceDiagram\n  Alice->>Bob: Hello Bob\n  Bob-->>Alice: Hi Alice'
const PIE = 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85'
const INVALID = 'definitely not a mermaid diagram at all'
const JAVASCRIPT = 'const answer = 42\nconsole.log(answer)'

/**
 * The fixture page: three drawable mermaid fences, one undrawable mermaid fence
 * (error fallback), and one non-mermaid fence the plugin must ignore.
 */
const FIXTURE_HTML = [
  '<!doctype html><html><head><title>dsh-pele-mermaid bundle fixture</title></head><body>',
  '<div class="markdown">',
  codeBlockHtml('mermaid', FLOWCHART),
  codeBlockHtml('mermaid', SEQUENCE),
  codeBlockHtml('mermaid', PIE),
  codeBlockHtml('mermaid', INVALID),
  codeBlockHtml('javascript', JAVASCRIPT),
  '</div>',
  '</body></html>',
].join('\n')

/**
 * Build one new CodeBlock element after boot (the streaming path).
 * @param {Document} document
 * @param {string} language
 * @param {string} source
 * @returns {HTMLElement}
 */
function createCodeBlockElement(document, language, source) {
  const block = document.createElement('div')
  block.className = 'md-code-block'

  const card = document.createElement('div')
  card.className = 'md-code-block-card'
  const banner = document.createElement('div')
  banner.className = 'md-code-block-banner'
  banner.setAttribute('data-code-block-banner', '')
  const infostring = document.createElement('div')
  infostring.className = 'md-code-block-infostring'
  infostring.textContent = language
  const action = document.createElement('div')
  action.className = 'md-code-block-action'
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.textContent = 'Copy'
  action.appendChild(copy)
  banner.append(infostring, action)
  card.appendChild(banner)

  const content = document.createElement('div')
  content.className = 'md-code-block-content'
  content.setAttribute('data-code-block-content', '')
  const pre = document.createElement('pre')
  pre.className = 'md-code-block-pre'
  const code = document.createElement('code')
  code.textContent = source
  pre.appendChild(code)
  content.appendChild(pre)

  block.append(card, content)
  return block
}

/* -------------------------------------------------------------------------- */
/* jsdom environment                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Immutable snapshot of the pre-plugin document, used to prove the bundle has
 * no import-time DOM side effects and that teardown restores the page.
 * @param {Document} document
 */
function captureBaseline(document) {
  const blocks = Array.from(document.querySelectorAll('.md-code-block'))
  return {
    html: document.body.innerHTML,
    blocks,
    pres: blocks.map((block) => block.querySelector('pre')),
    banners: blocks.map((block) => {
      const banner = block.querySelector('[data-code-block-banner]')
      return banner ? banner.outerHTML : null
    }),
  }
}

/**
 * Evaluate the built bundle in a fresh jsdom window and invoke its factory.
 * @param {string} [html]
 */
function createBundleRuntime(html = FIXTURE_HTML) {
  /** @type {string[]} */
  const jsdomNotices = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => {
    jsdomNotices.push(String((error && error.message) || error))
  })

  const dom = new JSDOM(html, {
    url: 'https://dsh-pele-mermaid.test/',
    runScripts: 'outside-only',
    virtualConsole,
  })
  const { window } = dom
  const document = window.document

  /** @type {Array<{ id: string, factory: (require: (specifier: string) => unknown) => unknown }>} */
  const registrations = []
  /** @type {Record<string, unknown>} */
  const globals = window
  globals.__ModuleLoader__ = {
    load(registration) {
      registrations.push(registration)
    },
  }

  const baseline = captureBaseline(document)

  // The bundle itself must not touch the DOM at load time; only the factory
  // call below is allowed to build the module.
  window.eval(BUNDLE)

  const requireCalls = { count: 0, specifiers: /** @type {string[]} */ ([]) }
  const exportsObject = registrations.length === 1
    ? registrations[0].factory((specifier) => {
        requireCalls.count += 1
        requireCalls.specifiers.push(specifier)
        throw new Error(`bundled factory called require(${JSON.stringify(specifier)}); it must be dependency-free`)
      })
    : null

  return {
    dom,
    window,
    document,
    registrations,
    exportsObject,
    requireCalls,
    baseline,
    jsdomNotices,
    close() {
      try {
        window.close()
      } catch {
        // jsdom teardown is best-effort.
      }
    },
  }
}

/**
 * Apply the plugin with a minimal fake Cordis context, mirroring only the
 * public surfaces the plugin declares: `inject: ['theme']`, `ctx.effect`,
 * `ctx.on('theme/change')`, `ctx.get('theme')`.
 *
 * @param {ReturnType<typeof createBundleRuntime>} runtime
 */
function applyPlugin(runtime) {
  /** @type {Array<(snapshot: unknown) => void>} */
  const themeListeners = []
  /** @type {unknown} */
  const fontSnapshot = { fontSizes: {}, fontFamilies: {} }
  /** @type {(() => void) | null} */
  let fiberCleanup = null
  let effectCalls = 0
  let getThemeCalls = 0

  const fakeTheme = {
    getTheme() {
      getThemeCalls += 1
      return fontSnapshot
    },
  }

  const ctx = {
    effect(fn) {
      effectCalls += 1
      const cleanup = fn()
      if (typeof cleanup === 'function') fiberCleanup = cleanup
      return () => {
        if (typeof cleanup === 'function') cleanup()
      }
    },
    on(event, callback) {
      if (event === 'theme/change') themeListeners.push(callback)
      return () => {
        const index = themeListeners.indexOf(callback)
        if (index >= 0) themeListeners.splice(index, 1)
      }
    },
    get(service) {
      return service === 'theme' ? fakeTheme : undefined
    },
  }

  assert.equal(typeof runtime.exportsObject?.apply, 'function', 'bundle exports must include apply()')
  runtime.exportsObject.apply(ctx)
  assert.equal(effectCalls, 1, 'apply() must own its resources through exactly one ctx.effect()')

  return {
    ctx,
    themeListeners,
    fontSnapshot,
    getThemeCalls: () => getThemeCalls,
    cleanup() {
      assert.ok(fiberCleanup, 'ctx.effect() must return a disposer')
      fiberCleanup()
    },
    emitTheme(snapshot) {
      for (const listener of themeListeners.slice()) listener(snapshot)
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Async helpers                                                              */
/* -------------------------------------------------------------------------- */

/** @param {number} ms */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Poll until `predicate` is truthy.
 * @param {() => boolean} predicate
 * @param {Object} [options]
 * @param {string} [options.message]
 * @param {number} [options.timeout]
 * @param {number} [options.interval]
 */
async function waitFor(predicate, { message = 'condition', timeout = 5000, interval = 20 } = {}) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (predicate()) return
    await wait(interval)
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${message}`)
}

/** @param {Document} document */
const diagramSvgs = (document) => Array.from(document.querySelectorAll('[data-dsh-pele-mermaid-host] svg.pele'))

/** @param {Document} document */
const diagrams = (document) => Array.from(document.querySelectorAll('.dsh-pele-mermaid-diagram'))

/** @param {Document} document */
const styleElements = (document) => Array.from(document.querySelectorAll(`style[${STYLE_ATTR}]`))

/** @param {Document} document */
function assertOnlyExpectedJsdomNotices(notices) {
  const unexpected = notices.filter(
    (notice) => !EXPECTED_JSDOM_NOTICES.some((expected) => notice.includes(expected)),
  )
  assert.deepEqual(unexpected, [], `unexpected jsdom notices: ${JSON.stringify(unexpected)}`)
}

/** Keep every jsdom window this file opens, and close them all at the end. */
const openEnvironments = []

/** @param {ReturnType<typeof createBundleRuntime>} runtime */
function track(runtime) {
  openEnvironments.push(runtime)
  return runtime
}

after(() => {
  for (const runtime of openEnvironments.splice(0)) runtime.close()
})

/* -------------------------------------------------------------------------- */
/* 1. Wrapper + factory contract                                              */
/* -------------------------------------------------------------------------- */

test('bundle wrapper: registers exactly id "dsh-pele-mermaid" and the factory never requires', () => {
  assert.equal(PKG.name, BUNDLE_ID, 'package name must be the module-loader id')
  assert.equal(PKG.exports?.['./client'], './lib/client.js', 'exports["./client"] must point at the built bundle')

  assert.ok(BUNDLE.length > 400_000, `bundle is unexpectedly small (${BUNDLE.length} bytes)`)
  assert.ok(BUNDLE.length < 4_000_000, `bundle is unexpectedly large (${BUNDLE.length} bytes)`)
  assert.ok(
    BUNDLE.startsWith(WRAPPER_PREFIX),
    `bundle must start with the DSH module-loader wrapper for id "${BUNDLE_ID}"; got: ${JSON.stringify(BUNDLE.slice(0, 120))}`,
  )
  assert.ok(BUNDLE.endsWith(WRAPPER_SUFFIX), 'bundle must close the module-loader wrapper and return module.exports')

  for (const marker of FORBIDDEN_CDN_MARKERS) {
    assert.equal(BUNDLE.includes(marker), false, `bundle must not reference a CDN: ${marker}`)
  }
  assert.equal(BUNDLE.includes('import('), false, 'bundle must not use dynamic import() (no async/network loading)')

  const runtime = track(createBundleRuntime())
  assert.equal(runtime.registrations.length, 1, '__ModuleLoader__.load must be called exactly once')
  const registration = runtime.registrations[0]
  assert.equal(registration.id, BUNDLE_ID, 'module-loader id must equal the package name')
  assert.equal(typeof registration.factory, 'function', 'registration must carry a factory')
  assert.equal(runtime.requireCalls.count, 0, 'factory(require) must never call require')
  assert.equal(runtime.document.body.innerHTML, runtime.baseline.html, 'bundle must not touch the DOM at load time')
  assert.equal(styleElements(runtime.document).length, 0, 'bundle must not install styles before apply()')

  assert.ok(runtime.exportsObject, 'factory must return module exports')
  // Cross-realm array: copy it into this realm before deep comparison.
  assert.ok(Array.isArray(runtime.exportsObject.inject), 'inject must be a static array (Cordis contract)')
  assert.deepEqual(Array.from(runtime.exportsObject.inject), ['theme'], "exports.inject must be the static array ['theme']")
  assert.equal(typeof runtime.exportsObject.apply, 'function', 'exports must include apply()')
  assert.equal(runtime.requireCalls.count, 0, 'factory(require) must never call require')
})

/* -------------------------------------------------------------------------- */
/* 2. Real mount into the ARCH.md CodeBlock DOM                                */
/* -------------------------------------------------------------------------- */

test('apply(): settled mermaid fences become Pele diagrams; banners, source and non-mermaid blocks are preserved', async () => {
  const runtime = track(createBundleRuntime())
  const { document } = runtime
  const plugin = applyPlugin(runtime)

  try {
    await waitFor(() => diagramSvgs(document).length === 3, { message: '3 Pele diagrams to mount' })
    await wait(50) // let the whole debounced scan settle

    const { blocks, pres, banners } = runtime.baseline
    const mounted = diagrams(document)

    assert.equal(mounted.length, 3, 'exactly the 3 drawable mermaid fences must be mounted')
    assert.equal(diagramSvgs(document).length, 3, 'each diagram must contain exactly one svg.pele')
    assert.equal(styleElements(document).length, 1, 'exactly one plugin stylesheet must be installed')
    assert.ok(styleElements(document)[0].textContent.includes('--pele-bg'), 'stylesheet must map Pele variables')

    const expectedTypes = ['flowchart', 'sequence', 'pie']
    for (const [index, type] of expectedTypes.entries()) {
      const block = blocks[index]
      const content = block.querySelector('[data-code-block-content]')
      const container = content.querySelector('.dsh-pele-mermaid-diagram')
      assert.ok(container, `block ${index} must contain the plugin diagram container`)
      assert.equal(container.parentElement, content, 'diagram container must live inside [data-code-block-content]')

      const host = container.querySelector('[data-dsh-pele-mermaid-host]')
      assert.ok(host, `block ${index} must expose the Pele mount host`)
      const svgs = host.querySelectorAll('svg.pele')
      assert.equal(svgs.length, 1, 'svg.pele count must not include Pele zoom-control icons')
      assert.ok(
        svgs[0].getAttribute('class').split(/\s+/).includes(`pele-${type}`),
        `block ${index} must render a pele-${type} diagram, got class ${JSON.stringify(svgs[0].getAttribute('class'))}`,
      )
      assert.ok(host.querySelectorAll('.pele-zoom button').length >= 2, 'Pele zoom controls must be present')

      // The source artifact is detached while the diagram is shown, but retained.
      assert.equal(document.contains(pres[index]), false, 'original <pre> must be detached while the diagram is mounted')

      // Banner untouched: DSH's Copy button keeps working.
      const banner = block.querySelector('[data-code-block-banner]')
      assert.equal(banner.outerHTML, banners[index], 'the DSH code-block banner must not be modified')

      // Toolbar contract.
      const toolbar = container.querySelector('.dsh-pele-mermaid-toolbar')
      assert.ok(toolbar, 'diagram must expose a toolbar')
      assert.equal(toolbar.getAttribute('role'), 'group')
      const buttons = Array.from(toolbar.querySelectorAll('button'))
      assert.deepEqual(
        buttons.map((button) => button.textContent),
        ['Diagram', 'Source'],
        'default (en) locale labels',
      )
      assert.deepEqual(
        buttons.map((button) => button.getAttribute('aria-pressed')),
        ['true', 'false'],
        'Diagram must be pressed while the diagram is shown',
      )
    }

    // The undrawable fence keeps its source visible and gets a plain-text note.
    const invalidBlock = blocks[3]
    const invalidContent = invalidBlock.querySelector('[data-code-block-content]')
    assert.equal(document.contains(pres[3]), true, 'invalid fence must keep the original <pre> visible')
    assert.equal(invalidContent.querySelector('.dsh-pele-mermaid-diagram'), null, 'invalid fence must not mount a diagram')
    const errorNote = invalidContent.querySelector('.dsh-pele-mermaid-error')
    assert.ok(errorNote, 'invalid fence must get a plain-text error note')
    assert.ok(errorNote.textContent.startsWith('Pele: '), `error note must use the plain-text prefix, got ${JSON.stringify(errorNote.textContent)}`)
    assert.match(errorNote.textContent, /diagram/i, 'error note should carry Pele\'s message')

    // The non-mermaid fence is completely untouched.
    const jsBlock = blocks[4]
    const jsContent = jsBlock.querySelector('[data-code-block-content]')
    assert.equal(document.contains(pres[4]), true, 'non-mermaid <pre> must stay in place')
    assert.equal(jsBlock.querySelector('.dsh-pele-mermaid-diagram'), null)
    assert.equal(jsBlock.querySelector('.dsh-pele-mermaid-toolbar'), null)
    assert.equal(jsBlock.querySelector('.dsh-pele-mermaid-error'), null)
    assert.equal(jsBlock.querySelector('[data-code-block-banner]').outerHTML, banners[4])

    assert.equal(runtime.requireCalls.count, 0, 'require must never be called at runtime either')
    assert.equal(plugin.getThemeCalls() >= 1, true, 'apply() must read the injected theme service once')
    assertOnlyExpectedJsdomNotices(runtime.jsdomNotices)
  } finally {
    plugin.cleanup()
  }
})

/* -------------------------------------------------------------------------- */
/* 3. Diagram ⇄ Source toggle                                                 */
/* -------------------------------------------------------------------------- */

test('toolbar: Diagram/Source round-trips the original <pre> node and aria-pressed state', async () => {
  const runtime = track(createBundleRuntime())
  const { document } = runtime
  const plugin = applyPlugin(runtime)

  try {
    await waitFor(() => diagramSvgs(document).length === 3, { message: '3 Pele diagrams to mount' })
    const firstBlock = runtime.baseline.blocks[0]
    const content = firstBlock.querySelector('[data-code-block-content]')
    const originalPre = runtime.baseline.pres[0]
    const container = content.querySelector('.dsh-pele-mermaid-diagram')
    const host = container.querySelector('[data-dsh-pele-mermaid-host]')
    const buttons = Array.from(container.querySelectorAll('.dsh-pele-mermaid-toolbar button'))

    buttons[1].click() // Source
    assert.equal(document.contains(originalPre), true, 'Source view must reinsert the original <pre> into the page')
    assert.ok(originalPre.closest('.dsh-pele-mermaid-source'), 'restored <pre> must be wrapped in the source view')
    assert.equal(content.contains(originalPre), true, 'the source wrapper must live in the code-block content')
    assert.equal(host.hidden, true, 'diagram host must be hidden while showing source')
    assert.deepEqual(
      buttons.map((button) => button.getAttribute('aria-pressed')),
      ['false', 'true'],
      'aria-pressed must follow the Source view',
    )
    assert.equal(diagramSvgs(document).length, 3, 'toggling to source must not unmount the diagrams')

    buttons[0].click() // Diagram
    assert.equal(document.contains(originalPre), false, 'Diagram view must detach the source again')
    assert.equal(content.querySelector('.dsh-pele-mermaid-source'), null, 'source wrapper must be removed')
    assert.equal(host.hidden, false, 'diagram host must be visible again')
    assert.deepEqual(
      buttons.map((button) => button.getAttribute('aria-pressed')),
      ['true', 'false'],
      'aria-pressed must follow the Diagram view',
    )
    assert.equal(diagramSvgs(document).length, 3, 'the same diagrams must still be mounted')

    // The banner's Copy button is still there and untouched.
    assert.ok(firstBlock.querySelector('[data-code-block-banner] button'), 'DSH Copy button must remain in the banner')
  } finally {
    plugin.cleanup()
  }
})

/* -------------------------------------------------------------------------- */
/* 4. Theme policy: colours are CSS-only, font changes rebuild               */
/* -------------------------------------------------------------------------- */

test('theme/change: unchanged font inputs never re-render; a font change rebuilds in place', async () => {
  const runtime = track(createBundleRuntime())
  const { document } = runtime
  const plugin = applyPlugin(runtime)

  try {
    await waitFor(() => diagramSvgs(document).length === 3, { message: '3 Pele diagrams to mount' })
    assert.equal(plugin.themeListeners.length, 1, 'apply() must subscribe to theme/change exactly once')

    const before = diagramSvgs(document)

    // Same font inputs (a colour/scheme-only theme change): no re-render at all.
    plugin.emitTheme({ fontSizes: {}, fontFamilies: {} })
    await wait(450)
    const afterSameFonts = diagramSvgs(document)
    assert.equal(afterSameFonts.length, 3)
    for (const [index, svg] of afterSameFonts.entries()) {
      assert.equal(svg, before[index], 'the exact same svg.pele node must survive a colour-only theme change')
    }
    assert.equal(document.querySelectorAll('.dsh-pele-mermaid-error').length, 1, 'colour change must not introduce errors')

    // Font-metric change: the diagrams are rebuilt (labels may need re-measuring).
    plugin.emitTheme({ fontSizes: { code: 15 }, fontFamilies: { code: 'ui-monospace' } })
    await wait(600)
    const afterFontChange = diagramSvgs(document)
    assert.equal(afterFontChange.length, 3, 'font change must re-mount the same number of diagrams')
    for (const [index, svg] of afterFontChange.entries()) {
      assert.notEqual(svg, before[index], 'font change must replace the svg.pele nodes (re-measured labels)')
    }
    assert.equal(document.querySelectorAll('.dsh-pele-mermaid-error').length, 1, 'font change must not change the error fallback count')
    assertOnlyExpectedJsdomNotices(runtime.jsdomNotices)
  } finally {
    plugin.cleanup()
  }
})

/* -------------------------------------------------------------------------- */
/* 5. Teardown restores the page byte-for-byte and stops observing           */
/* -------------------------------------------------------------------------- */

test('ctx.effect cleanup: restores the pre-plugin DOM byte-identically and stops observing', async () => {
  const runtime = track(createBundleRuntime())
  const { document } = runtime
  const plugin = applyPlugin(runtime)

  await waitFor(() => diagramSvgs(document).length === 3, { message: '3 Pele diagrams to mount' })
  assert.notEqual(document.body.innerHTML, runtime.baseline.html, 'the plugin must have changed the page while active')

  plugin.cleanup()

  assert.equal(document.body.innerHTML, runtime.baseline.html, 'teardown must restore document.body.innerHTML byte-identically')
  assert.equal(styleElements(document).length, 0, 'teardown must remove the plugin stylesheet')
  assert.equal(diagramSvgs(document).length, 0, 'teardown must unmount every Pele diagram')
  assert.equal(diagrams(document).length, 0, 'teardown must remove every plugin container')
  assert.equal(document.querySelectorAll('.dsh-pele-mermaid-error').length, 0, 'teardown must remove error notes')
  assert.equal(document.querySelectorAll('.dsh-pele-mermaid-toolbar').length, 0, 'teardown must remove toolbars')

  // Node identity, not just serialized HTML: the same <pre> nodes come back.
  for (const [index, pre] of runtime.baseline.pres.entries()) {
    assert.equal(document.contains(pre), true, `original <pre> ${index} must be reinserted`)
    assert.equal(
      pre.parentElement,
      runtime.baseline.blocks[index].querySelector('[data-code-block-content]'),
      `original <pre> ${index} must return to its original container`,
    )
  }

  // Idempotent: a second disposer call is harmless.
  plugin.cleanup()
  assert.equal(document.body.innerHTML, runtime.baseline.html)

  // The observer and timers are gone: a new mermaid fence must NOT be picked up.
  const late = createCodeBlockElement(document, 'mermaid', 'flowchart LR\n  X[late] --> Y[must not render]')
  document.body.appendChild(late)
  await wait(700)
  assert.equal(late.querySelector('svg.pele'), null, 'a disposed plugin must not observe or mutate the page')
  assert.equal(styleElements(document).length, 0, 'a disposed plugin must not reinstall styles')
})

/* -------------------------------------------------------------------------- */
/* 6. MutationObserver path: a fence added after boot (streaming/history)     */
/* -------------------------------------------------------------------------- */

test('MutationObserver: a mermaid fence appended after boot settles and renders', async () => {
  // Start with an empty document (no fences yet), like the first streamed token.
  const runtime = track(
    createBundleRuntime('<!doctype html><html><head></head><body><div class="markdown"></div></body></html>'),
  )
  const { document } = runtime
  const plugin = applyPlugin(runtime)

  try {
    await wait(400) // debounce + settle window with nothing to render
    assert.equal(diagramSvgs(document).length, 0, 'no diagrams before any fence exists')

    const late = createCodeBlockElement(document, 'mermaid', 'flowchart LR\n  Stream[Streaming reply] --> Settle[Settled fence]\n  Settle --> Render[Pele diagram]')
    document.querySelector('.markdown').appendChild(late)

    await waitFor(() => late.querySelector('svg.pele'), { message: 'mutation-observed diagram to mount' })

    const container = late.querySelector('.dsh-pele-mermaid-diagram')
    assert.ok(container, 'the observed fence must be wrapped in the plugin container')
    assert.equal(late.querySelectorAll('[data-dsh-pele-mermaid-host] svg.pele').length, 1)
    assert.equal(document.querySelectorAll('.dsh-pele-mermaid-toolbar button').length, 2)
    assert.equal(styleElements(document).length, 1, 'the single stylesheet is reused, not stacked')
  } finally {
    plugin.cleanup()
  }
})
