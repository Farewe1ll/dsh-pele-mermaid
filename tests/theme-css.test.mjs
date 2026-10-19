/**
 * Unit tests for the plugin stylesheet (src/client/theme-css.js).
 *
 * The module is imported statically, before jsdom globals exist: that proves
 * `buildStyles()`/`STYLE_ATTR`/`CLASS` are pure and that the only `document`
 * reference is the call-time default parameter of `installStyles`.
 *
 * Contract checks:
 *  - every required `--pele-*` variable is mapped to a DSH token;
 *  - no hardcoded palette colors and no network references;
 *  - installStyles is single-owner/idempotent per document, and its disposer
 *    only ever removes the element it installed.
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'

import { JSDOM } from 'jsdom'

import { buildStyles, CLASS, installStyles, STYLE_ATTR } from '../src/client/theme-css.js'

const GLOBAL_KEYS = ['window', 'document', 'getComputedStyle']

/** @type {Map<string, { had: boolean, value: unknown }>} */
const savedGlobals = new Map()
/** @type {import('jsdom').JSDOM} */
let dom
/** @type {import('jsdom').DOMWindow} */
let window
/** @type {Document} */
let document
/** @type {import('jsdom').JSDOM[]} */
const extraDocs = []

before(() => {
  for (const key of GLOBAL_KEYS) {
    savedGlobals.set(key, {
      had: Object.prototype.hasOwnProperty.call(globalThis, key),
      value: /** @type {Record<string, unknown>} */ (globalThis)[key],
    })
  }
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://dsh-pele-mermaid.test/',
  })
  window = dom.window
  document = window.document

  const globals = /** @type {Record<string, unknown>} */ (globalThis)
  globals.window = window
  globals.document = document
  globals.getComputedStyle = window.getComputedStyle.bind(window)
})

afterEach(() => {
  for (const extra of extraDocs.splice(0)) {
    try {
      extra.window.close()
    } catch {
      // best-effort teardown
    }
  }
  if (document) {
    document.head.replaceChildren()
    document.body.replaceChildren()
  }
})

after(() => {
  try {
    window.close()
  } catch {
    // best-effort teardown
  }
  for (const [key, saved] of savedGlobals) {
    const globals = /** @type {Record<string, unknown>} */ (globalThis)
    if (saved.had) globals[key] = saved.value
    else delete globals[key]
  }
  savedGlobals.clear()
})

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** @param {Document} doc */
function countStyles(doc) {
  return doc.querySelectorAll(`style[${STYLE_ATTR}]`).length
}

/** @returns {Document} */
function freshDocument() {
  const extra = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  extraDocs.push(extra)
  return extra.window.document
}

/**
 * Body of the first rule whose selector starts a rule block.
 * @param {string} styles
 * @param {string} selector
 * @returns {string}
 */
function ruleBody(styles, selector) {
  const match = styles.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))
  return match ? match[1] : ''
}

/** Required mapping: Pele variable -> DSH token expression. */
const REQUIRED_MAPPING = [
  ['--pele-bg', 'var(--dsw-alias-markdown-code-block)'],
  ['--pele-fg', 'var(--dsw-alias-label-primary)'],
  ['--pele-muted', 'var(--dsw-alias-label-tertiary)'],
  ['--pele-line', 'var(--dsw-alias-label-secondary)'],
  ['--pele-surface', 'var(--dsw-alias-bg-layer-1)'],
  ['--pele-surface-alt', 'var(--dsw-alias-markdown-code-block-banner)'],
  ['--pele-border', 'var(--dsw-alias-border-l2)'],
  ['--pele-accent', 'var(--dsw-alias-brand-primary)'],
  ['--pele-critical', 'var(--dsw-alias-state-error-primary)'],
  ['--pele-error', 'var(--dsw-alias-state-error-primary)'],
  ['--pele-font', 'var(--dsw-font-family)'],
  ['--pele-font-mono', 'var(--ds-font-family-code, ui-monospace, monospace)'],
  ['--pele-radius', 'var(--dsw-radius-md)'],
]

test('STYLE_ATTR and CLASS are the documented, namespaced contract', () => {
  assert.equal(STYLE_ATTR, 'data-dsh-pele-mermaid')
  assert.deepEqual({ ...CLASS }, {
    diagram: 'dsh-pele-mermaid-diagram',
    toolbar: 'dsh-pele-mermaid-toolbar',
    error: 'dsh-pele-mermaid-error',
    source: 'dsh-pele-mermaid-source',
    active: 'dsh-pele-mermaid-active',
  })
  assert.ok(Object.isFrozen(CLASS))
  for (const value of Object.values(CLASS)) {
    assert.match(value, /^dsh-pele-mermaid-/)
  }
})

test('buildStyles is pure, deterministic and non-empty', () => {
  const first = buildStyles()
  const second = buildStyles()
  assert.equal(typeof first, 'string')
  assert.ok(first.length > 0)
  assert.equal(first, second)
  // Pure string: no HTML parser got involved.
  assert.match(first, /--pele-bg:/)
})

test('every Pele variable is mapped to its DSH token', () => {
  const styles = buildStyles()
  for (const [name, value] of REQUIRED_MAPPING) {
    const pattern = new RegExp(`${escapeRegExp(name)}\\s*:\\s*${escapeRegExp(value)}\\s*;`)
    assert.match(styles, pattern, `missing mapping ${name}: ${value};`)
  }
})

test('mapping block is scoped to the diagram container', () => {
  const styles = buildStyles()
  const diagramRule = ruleBody(styles, `.${CLASS.diagram}`)
  assert.ok(diagramRule.length > 0)
  assert.match(diagramRule, /--pele-bg:/)
  assert.match(diagramRule, /--pele-radius:/)
})

test('no hardcoded palette colors are baked into the stylesheet', () => {
  const styles = buildStyles()
  assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}\b/, 'hex color literal found')
  assert.doesNotMatch(styles, /\b(?:rgb|rgba|hsl|hsla)\(/i, 'functional color literal found')
  assert.doesNotMatch(
    styles,
    /(?:^|[^\w-])(?:white|black|red|blue|green|gray|grey|yellow|orange|purple|pink|brown)(?:[^\w-]|$)/i,
    'named palette color found',
  )
  // Colors may only enter as token references or inheritable keywords.
  const colorDeclarations = [...styles.matchAll(/(?:^|[;\s{])color\s*:\s*([^;}]+)/gi)].map((match) =>
    match[1].trim(),
  )
  assert.ok(colorDeclarations.length > 0, 'the stylesheet does declare colors')
  for (const value of colorDeclarations) {
    assert.match(
      value,
      /^(?:var\(--[a-z0-9-]+\)|inherit|currentColor|transparent)$/i,
      `hardcoded or unexpected color value: ${value}`,
    )
  }
})

test('no scheme-specific selectors or network references', () => {
  const styles = buildStyles()
  assert.doesNotMatch(styles, /prefers-color-scheme/i)
  assert.doesNotMatch(styles, /\[data-theme/i)
  assert.doesNotMatch(styles, /\[data-color-scheme/i)
  assert.doesNotMatch(styles, /\.dark\b/)
  assert.doesNotMatch(styles, /@import/i)
  assert.doesNotMatch(styles, /url\(\s*['"]?(?:https?:|ftp:|\/\/)/i)
  assert.doesNotMatch(styles, /https?:\/\//i)
})

test('card, toolbar, source and error chrome are styled with DSH tokens', () => {
  const styles = buildStyles()

  const diagramLayout = styles.match(new RegExp(`${escapeRegExp(`.${CLASS.diagram}`)}\\s*\\{[^}]*box-sizing:[^}]*\\}`))
  assert.ok(diagramLayout, 'diagram card rule is present')
  assert.match(diagramLayout[0], /padding:/)
  assert.match(diagramLayout[0], /background:\s*var\(--pele-bg\)/)
  assert.match(diagramLayout[0], /border-bottom-left-radius:\s*var\(--dsw-radius-md\)/)
  assert.match(diagramLayout[0], /border-bottom-right-radius:\s*var\(--dsw-radius-md\)/)

  const toolbar = ruleBody(styles, `.${CLASS.toolbar}`)
  assert.ok(toolbar.length > 0)
  assert.match(toolbar, /display:\s*flex/)
  assert.match(toolbar, /justify-content:\s*flex-end/)

  const button = ruleBody(styles, `.${CLASS.toolbar} button`)
  assert.ok(button.length > 0)
  assert.match(button, /appearance:\s*none/)
  assert.match(button, /color:\s*var\(--dsw-alias-label-tertiary\)/)

  const pressed = ruleBody(styles, `.${CLASS.toolbar} button[aria-pressed="true"]`)
  assert.match(pressed, /var\(--dsw-alias-markdown-code-block-banner\)/)
  assert.match(pressed, /var\(--dsw-alias-label-primary\)/)

  const focus = ruleBody(styles, `.${CLASS.toolbar} button:focus-visible`)
  assert.match(focus, /var\(--dsw-alias-border-l2\)/)

  const source = ruleBody(styles, `.${CLASS.source} > pre`)
  assert.match(source, /margin:\s*0/)

  const error = ruleBody(styles, `.${CLASS.error}`)
  assert.ok(error.length > 0)
  assert.match(error, /var\(--dsw-alias-state-error-primary\)/)
  assert.match(error, /white-space:\s*pre-wrap/)

  // The state hook is exported; it deliberately has no visual rules of its own.
  assert.ok(styles.includes(`.${CLASS.active}`))
})

test('installStyles installs exactly one stylesheet with the built text', () => {
  const doc = freshDocument()
  const dispose = installStyles(doc)

  const styles = doc.querySelectorAll(`style[${STYLE_ATTR}]`)
  assert.equal(styles.length, 1)
  assert.equal(styles[0].getAttribute(STYLE_ATTR), '')
  assert.equal(styles[0].textContent, buildStyles())
  assert.equal(styles[0].parentNode, doc.head)

  dispose()
  assert.equal(countStyles(doc), 0)
})

test('installStyles defaults to the global document', () => {
  const dispose = installStyles()
  assert.equal(countStyles(document), 1)
  assert.equal(document.querySelector(`style[${STYLE_ATTR}]`).textContent, buildStyles())
  dispose()
  assert.equal(countStyles(document), 0)
})

test('installStyles is single-owner and idempotent per document', () => {
  const doc = freshDocument()
  const disposeFirst = installStyles(doc)
  const firstElement = doc.querySelector(`style[${STYLE_ATTR}]`)
  assert.equal(countStyles(doc), 1)

  const disposeSecond = installStyles(doc)
  assert.equal(countStyles(doc), 1, 'repeated install must not stack stylesheets')
  const secondElement = doc.querySelector(`style[${STYLE_ATTR}]`)
  assert.notEqual(secondElement, firstElement, 'new owner replaces the previous element')

  // First disposer is stale now: it must not remove the replacement.
  disposeFirst()
  assert.equal(countStyles(doc), 1)

  disposeSecond()
  assert.equal(countStyles(doc), 0)
  disposeSecond()
  assert.equal(countStyles(doc), 0)
})

test('installStyles removes a stale element carrying STYLE_ATTR before adding', () => {
  const doc = freshDocument()
  const stale = doc.createElement('style')
  stale.setAttribute(STYLE_ATTR, 'stale')
  stale.textContent = '/* stale */'
  doc.head.appendChild(stale)
  assert.equal(countStyles(doc), 1)

  const dispose = installStyles(doc)
  assert.equal(countStyles(doc), 1)
  assert.notEqual(doc.querySelector(`style[${STYLE_ATTR}]`), stale)
  assert.equal(stale.isConnected, false)
  assert.equal(doc.querySelector(`style[${STYLE_ATTR}]`).textContent, buildStyles())

  dispose()
  assert.equal(countStyles(doc), 0)
})

test('the disposer removes only the element it installed', () => {
  const doc = freshDocument()
  const dispose = installStyles(doc)
  const foreign = doc.createElement('style')
  foreign.setAttribute(STYLE_ATTR, 'foreign-owner')
  foreign.textContent = '/* foreign */'
  doc.head.appendChild(foreign)
  assert.equal(countStyles(doc), 2)

  dispose()
  assert.equal(countStyles(doc), 1)
  assert.equal(doc.querySelector(`style[${STYLE_ATTR}]`), foreign, 'foreign stylesheet untouched')
  assert.equal(foreign.isConnected, true)
})

test('the disposer is safe when its element was already removed', () => {
  const doc = freshDocument()
  const dispose = installStyles(doc)
  const installed = doc.querySelector(`style[${STYLE_ATTR}]`)
  installed.remove()

  const foreign = doc.createElement('style')
  foreign.setAttribute(STYLE_ATTR, '')
  doc.head.appendChild(foreign)

  assert.doesNotThrow(() => dispose())
  assert.equal(countStyles(doc), 1)
  assert.equal(doc.querySelector(`style[${STYLE_ATTR}]`), foreign)
})

test('styles are isolated per document', () => {
  const docA = freshDocument()
  const docB = freshDocument()
  const disposeA = installStyles(docA)
  const disposeB = installStyles(docB)

  assert.equal(countStyles(docA), 1)
  assert.equal(countStyles(docB), 1)
  assert.notEqual(docA.querySelector(`style[${STYLE_ATTR}]`), docB.querySelector(`style[${STYLE_ATTR}]`))

  disposeA()
  assert.equal(countStyles(docA), 0)
  assert.equal(countStyles(docB), 1)
  disposeB()
})

test('installStyles tolerates unusable document-like arguments', () => {
  for (const invalid of [null, {}, { querySelectorAll: 'not-a-function' }]) {
    let dispose
    assert.doesNotThrow(() => {
      dispose = installStyles(/** @type {any} */ (invalid))
    })
    assert.equal(typeof dispose, 'function')
    assert.doesNotThrow(() => dispose())
    assert.doesNotThrow(() => dispose())
  }
})
