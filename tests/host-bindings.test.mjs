/**
 * Unit tests for the versioned installed-host binding layer
 * (tests/helpers/react-code-block.mjs).
 *
 * That layer is what lets `scripts/verify-host.mjs` execute the real minified
 * CodeBlock function under pinned React: the function's free identifiers are
 * minified names baked into one frontend build, so adapters are keyed by the
 * installed frontend version. These tests are fast and deterministic and never
 * read the installed DSH app.asar.
 *
 * Contract checks:
 *  - every supported version resolves to exactly the audited identifier names;
 *  - the original 0.2.1-rc.2 map keeps working unchanged;
 *  - an unknown version throws an actionable `unsupported-host` error rather
 *    than letting the extracted function die with a raw ReferenceError;
 *  - a synthetic component referencing every adapter renders under real React,
 *    so a missing binding cannot hide behind the fixture.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { JSDOM } from 'jsdom'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'

import {
  INSTALLED_BINDING_NAMES,
  SUPPORTED_HOST_VERSIONS,
  UnsupportedHostError,
  installedComponentBindings,
  resolveInstalledBindings,
} from './helpers/react-code-block.mjs'

const GLOBAL_KEYS = ['window', 'document', 'Node', 'HTMLElement']

/** @type {Map<string, PropertyDescriptor | undefined>} */
const savedGlobals = new Map()
/** @type {import('jsdom').JSDOM} */
let dom
/** @type {Function} */
let createRoot
/** @type {Function} */
let flushSync

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://host.test/' })
  for (const key of GLOBAL_KEYS) {
    savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] })
  }
  ;({ createRoot } = await import('react-dom/client'))
  ;({ flushSync } = await import('react-dom'))
})

after(() => {
  for (const key of GLOBAL_KEYS) {
    const descriptor = savedGlobals.get(key)
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
  dom.window.close()
})

/**
 * @param {React.ReactElement} element
 * @returns {{ container: HTMLElement, root: import('react-dom/client').Root, dispose: () => void }}
 */
function renderElement(element) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  flushSync(() => root.render(element))
  let disposed = false
  return {
    container,
    root,
    dispose() {
      if (disposed) return
      disposed = true
      flushSync(() => root.unmount())
      container.remove()
    },
  }
}

test('every supported host version resolves to its audited identifier map', () => {
  assert.deepEqual([...SUPPORTED_HOST_VERSIONS], ['0.2.1-rc.2', '0.2.2-rc.3'])
  assert.ok(SUPPORTED_HOST_VERSIONS.includes('0.2.2-rc.3'), 'the installed P2 host must be supported')

  for (const version of SUPPORTED_HOST_VERSIONS) {
    const { bindings, componentMatcher } = resolveInstalledBindings({ version, jsxRuntime })
    assert.deepEqual(Object.keys(bindings).sort(), [...INSTALLED_BINDING_NAMES[version]].sort(), `${version}: binding names`)
    for (const name of INSTALLED_BINDING_NAMES[version]) {
      assert.ok(Object.hasOwn(bindings, name), `${version}: missing binding ${name}`)
    }
    assert.ok(componentMatcher.start instanceof RegExp, 'versioned adapter supplies the extraction start matcher')
    assert.equal(typeof componentMatcher.end, 'string', 'versioned adapter supplies the extraction end marker')
  }
})

test('the original 0.2.1-rc.2 map keeps its audited names and wiring', () => {
  const bindings = installedComponentBindings(jsxRuntime, () => {})
  assert.deepEqual(Object.keys(bindings), ['C', 'u', 'Mn', 'de', 'Y_', 'l4', 'ho', 'kR', 'B8', 'VF', 'WF', '_R', 'zo', 'd4'])
  assert.equal(bindings.C, React)
  assert.equal(bindings.u, jsxRuntime)
  assert.equal(bindings.Y_({}, 'javascript'), true)
  assert.equal(bindings.Y_({}, 'mermaid'), false)

  const resolved = resolveInstalledBindings({ version: '0.2.1-rc.2', jsxRuntime })
  assert.deepEqual(Object.keys(resolved.bindings), Object.keys(bindings))
})

test('the 0.2.2-rc.3 map exposes every identifier its component closes over', () => {
  const { bindings } = resolveInstalledBindings({ version: '0.2.2-rc.3', jsxRuntime, onCopy: () => {} })
  assert.deepEqual(
    Object.keys(bindings),
    ['x', 'm', 'NW', 'AW', 'Db', 'Dp', 'ns', 'RW', 'lB', 'H7', 'FW', 'UW', 'oB', 'Ss', '$t', 'pe', 'Rp', 'HW'],
  )
  assert.equal(bindings.x, React)
  assert.equal(bindings.m, jsxRuntime)
  assert.equal(typeof bindings.NW, 'function')
  assert.equal(typeof bindings.Db, 'function')
  assert.equal(typeof bindings.Dp, 'function')
  assert.equal(typeof bindings.ns, 'function')
  assert.equal(typeof bindings.lB, 'function')
  assert.equal(typeof bindings.H7, 'function')
  assert.equal(typeof bindings.oB, 'function')
  assert.equal(typeof bindings.Ss, 'function')
  assert.equal(typeof bindings.pe, 'function')
  assert.equal(typeof bindings.Rp, 'function')
  assert.equal(typeof bindings.HW, 'function')
  assert.equal(typeof bindings.FW, 'number')
  for (const key of ['block', 'banner', 'bannerWrap', 'content', 'infostring', 'action', 'copyButton', 'plain', 'card', 'numbered', 'diffFence']) {
    assert.equal(typeof bindings.$t[key], 'string', `$t.${key} class name`)
  }
})

test('an unknown host version fails with an actionable typed error, not a ReferenceError', () => {
  const assetSha256 = 'abcdef0123456789'.repeat(4)

  assert.throws(
    () => resolveInstalledBindings({ version: '0.2.2-rc.1', jsxRuntime, assetSha256 }),
    (error) => {
      assert.ok(error instanceof UnsupportedHostError, 'typed error class')
      assert.ok(error instanceof Error, 'still an Error')
      assert.equal(error.name, 'UnsupportedHostError')
      assert.equal(error.code, 'unsupported-host')
      assert.equal(error.version, '0.2.2-rc.1')
      assert.equal(error.assetSha256, assetSha256)
      assert.match(error.message, /unsupported DSH frontend 0\.2\.2-rc\.1 \(abcdef012345\)/)
      assert.match(error.message, /update the binding map in tests\/helpers\/react-code-block\.mjs/)
      assert.match(error.message, /\(see docs\/ARCH\.md\)/)
      assert.match(error.message, /Known versions: 0\.2\.1-rc\.2, 0\.2\.2-rc\.3/)
      return true
    },
  )

  // Even with no metadata at all the diagnostic stays readable and typed.
  assert.throws(
    () => resolveInstalledBindings(),
    (error) => {
      assert.ok(error instanceof UnsupportedHostError)
      assert.equal(error.code, 'unsupported-host')
      assert.match(error.message, /unsupported DSH frontend unknown \(asset sha256 unavailable\)/)
      return true
    },
  )
})

test('the extraction boundary matcher still selects the CodeBlock function', () => {
  const { componentMatcher } = resolveInstalledBindings({ version: '0.2.2-rc.3', jsxRuntime })
  const sample = 'var a=1;function Zb({code:e,lang:t}){return e}function Qq(){return 2}'
  const start = sample.search(componentMatcher.start)
  const end = sample.indexOf(componentMatcher.end, start)
  assert.ok(start >= 0 && end > start, 'boundary matcher must find the component')
  assert.equal(sample.slice(start, end + 1), 'function Zb({code:e,lang:t}){return e}')
})

test('a representative adapter set renders a synthetic component without ReferenceError', async () => {
  /** @type {string[]} */
  const copied = []
  const { bindings } = resolveInstalledBindings({
    version: '0.2.2-rc.3',
    jsxRuntime,
    onCopy: (text) => { copied.push(text) },
  })
  // References every adapter name exactly as the extracted component does; a
  // missing map entry would throw at render time and fail this test.
  const BindingProbe = new Function(
    ...Object.keys(bindings),
    `
      return function BindingProbe() {
        const lines = [[{ text: 'alpha', style: {} }], [{ text: 'beta', style: {} }]]
        const frame = new lB().updateFrame('alpha\\nbeta\\n', 'javascript')
        const html = oB('const n = 1', 'javascript')
        const diffParser = AW
        const diffRow = HW({ kind: 'context', text: 'meta' }, 0)
        const clipboardWrite = Ss
        return m.jsxs(x.Fragment, { children: [
          m.jsx('pre', { ...UW, children: m.jsx('code', { children: lines.map((tokens, index) => H7(tokens, index)) }) }),
          m.jsx('div', { dangerouslySetInnerHTML: { __html: html } }),
          m.jsx('span', {
            className: pe($t.block, $t.content),
            children: [
              String(NW('text')),
              String(diffParser),
              String(Db(null, 'text')),
              String(typeof Dp),
              String(ns()),
              String(RW({ rows: new Map() })),
              String(frame.generation),
              String(FW),
              String(typeof clipboardWrite),
            ].join('|'),
          }),
          m.jsx(Rp, {
            lang: 'mermaid',
            labels: { codeLabel: '代码块', wrapLabel: 'Wrap', unwrapLabel: 'Unwrap' },
            copyLabel: 'Copy',
            copiedLabel: 'Copied',
            copied: false,
            wrapped: true,
            onCopy: () => {},
            onWrap: () => {},
          }),
          m.jsx('span', { children: diffRow }),
        ] })
      }
    `,
  )(...Object.values(bindings))

  const rendered = renderElement(React.createElement(BindingProbe))
  try {
    const text = rendered.container.textContent
    assert.match(text, /alpha/, 'H7 line rendering')
    assert.match(text, /beta/, 'H7 line rendering')
    assert.match(text, /const n = 1/, 'oB static HTML')
    assert.match(text, /代码块/, 'Rp card banner')
    assert.match(text, /Copy/, 'Rp Copy control')
    assert.equal(copied.length, 0, 'rendering must not perform a clipboard write')
  } finally {
    rendered.dispose()
  }

  assert.equal(await bindings.Ss('clipboard payload'), true)
  assert.deepEqual(copied, ['clipboard payload'], 'the host Copy callback records the queried text')
})
