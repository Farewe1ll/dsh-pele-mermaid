import assert from 'node:assert/strict'
import { after, afterEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React from 'react'
import { CodeBlock } from './helpers/react-code-block.mjs'
import { readFenceFacts, createBlockManager } from '../src/client/blocks.js'
import { SOURCE_HIDDEN_ATTR } from '../src/client/theme-css.js'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://host.test/' })
const saved = new Map()
for (const key of ['window', 'document', 'Node', 'HTMLElement', 'MutationObserver']) {
  saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] })
}
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')
const roots = new Set()
const cleanups = new Set()
const h = React.createElement

function host() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  return {
    container,
    render: (props) => flushSync(() => root.render(h(CodeBlock, props))),
    unmount() { flushSync(() => root.unmount()); roots.delete(root) },
    block: () => container.querySelector('.md-code-block'),
  }
}

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups.clear()
  for (const root of roots) flushSync(() => root.unmount())
  roots.clear()
  document.body.replaceChildren()
})

function manage(page, { observe = false } = {}) {
  const mounts = []
  let alive = 0
  const manager = createBlockManager({
    document, settleMs: 0, locale: 'en',
    mountDiagram(container, source) {
      mounts.push(source)
      alive += 1
      container.textContent = 'Rendered diagram'
      return { ok: true, destroy() { alive -= 1; container.replaceChildren() } }
    },
  })
  const observer = observe ? new MutationObserver(() => manager.scan()) : null
  observer?.observe(page.container, { childList: true, subtree: true, characterData: true })
  const cleanup = () => { observer?.disconnect(); manager.destroy() }
  cleanups.add(cleanup)
  return { manager, mounts, cleanup, get alive() { return alive } }
}

const mutationsSettled = () => new Promise((resolve) => setImmediate(resolve))

test('real React: a source-only update remains observable and renders the committed source', async () => {
  const page = host()
  page.render({ lang: 'mermaid', code: 'flowchart LR\n A-->B\n' })
  const pre = page.block().querySelector('pre')
  const parent = pre.parentElement
  const plugin = manage(page, { observe: true })
  plugin.manager.scan()
  await mutationsSettled()
  assert.equal(plugin.manager.count, 1)
  page.render({ lang: 'mermaid', code: 'flowchart LR\n A-->C\n' })
  await mutationsSettled()
  assert.deepEqual(plugin.mounts, ['flowchart LR\n A-->B\n', 'flowchart LR\n A-->C\n'])
  assert.equal(pre.parentElement, parent)
  assert.equal(page.block().querySelector('pre'), pre)
  assert.equal(plugin.alive, 1)
  plugin.cleanup()
  assert.equal(pre.textContent, 'flowchart LR\n A-->C')
  assert.equal(pre.hasAttribute(SOURCE_HIDDEN_ATTR), false)
  page.render({ lang: 'mermaid', code: 'flowchart LR\n A-->D\n' })
  assert.equal(pre.textContent, 'flowchart LR\n A-->D', 'updates still work after plugin disposal')
})

for (const mode of ['plain', 'streaming', 'static']) {
  test(`real React: ${mode} Copy, source toggle and cleanup preserve the host node and newline behavior`, () => {
    const page = host()
    let copied
    page.render({ lang: 'mermaid', code: 'flowchart LR\n  A-->B\n\n', mode, onCopy: (value) => { copied = value } })
    const block = page.block()
    const baseline = block.innerHTML
    const pre = block.querySelector('pre')
    const parent = pre.parentElement
    const copy = () => { flushSync(() => block.querySelector('[data-code-block-banner] button').click()); return copied }
    const expected = copy()
    assert.equal(expected, 'flowchart LR\n  A-->B\n')
    const plugin = manage(page)
    plugin.manager.scan()
    assert.equal(copy(), expected)
    assert.equal(pre.parentElement, parent)
    assert.equal(pre.hasAttribute(SOURCE_HIDDEN_ATTR), true)
    block.querySelectorAll('.dsh-pele-mermaid-toolbar button')[1].click()
    assert.equal(pre.hasAttribute(SOURCE_HIDDEN_ATTR), false)
    assert.equal(pre.parentElement, parent)
    assert.equal(copy(), expected)
    plugin.manager.refreshAll()
    assert.equal(block.querySelector('[data-dsh-pele-mermaid-host]').hidden, true)
    assert.equal(pre.parentElement, parent)
    plugin.cleanup()
    assert.equal(block.innerHTML, baseline)
    assert.equal(block.querySelector('pre'), pre)
    assert.equal(plugin.alive, 0)
  })
}

test('real React: source replacements and language reuse never resurrect an obsolete pre', async () => {
  const page = host()
  page.render({ lang: 'mermaid', code: 'flowchart LR\n A-->B', mode: 'plain' })
  const originalPre = page.block().querySelector('pre')
  const plugin = manage(page, { observe: true })
  plugin.manager.scan()
  page.render({ lang: 'javascript', code: 'console.log(1)\n', mode: 'static' })
  await mutationsSettled()
  assert.equal(plugin.manager.count, 0)
  assert.equal(page.container.contains(originalPre), false)
  const staticPre = page.block().querySelector('pre')
  assert.equal(staticPre.parentElement.parentElement.hasAttribute('data-code-block-content'), true)
  assert.equal(staticPre.textContent, 'console.log(1)')
  page.render({ lang: 'mermaid', code: 'flowchart LR\n A-->C', mode: 'streaming' })
  await mutationsSettled()
  assert.equal(plugin.manager.count, 1)
  assert.equal(page.container.contains(staticPre), false)
  const latestPre = page.block().querySelector('pre')
  plugin.cleanup()
  assert.equal(page.container.querySelectorAll('pre').length, 1)
  assert.equal(page.block().querySelector('pre'), latestPre)
  assert.equal(latestPre.hasAttribute(SOURCE_HIDDEN_ATTR), false)
  page.render({ lang: 'javascript', code: 'console.log(2)', mode: 'plain' })
  assert.equal(page.block().querySelector('pre').textContent, 'console.log(2)')
})

test('real React: innerHTML replacement and unmount release plugin state without restoring old source', async () => {
  const page = host()
  page.render({ lang: 'mermaid', code: 'flowchart LR\n A-->B', mode: 'static' })
  const oldPre = page.block().querySelector('pre')
  const plugin = manage(page, { observe: true })
  plugin.manager.scan()
  page.render({ lang: 'mermaid', code: 'flowchart LR\n A-->C', mode: 'static' })
  await mutationsSettled()
  assert.equal(oldPre.isConnected, false)
  assert.equal(oldPre.hasAttribute(SOURCE_HIDDEN_ATTR), false)
  assert.equal(page.block().querySelectorAll('.dsh-pele-mermaid-diagram').length, 1)
  assert.equal(plugin.mounts.at(-1), 'flowchart LR\n A-->C')
  page.unmount()
  await mutationsSettled()
  assert.equal(plugin.manager.count, 0)
  assert.equal(plugin.alive, 0)
  plugin.cleanup()
  assert.equal(page.container.childNodes.length, 0)
})
after(() => {
  dom.window.close()
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
})

test('real React 18.3.1: readers follow committed CodeBlock props across alternate fibers and reuse', () => {
  assert.equal(React.version, '18.3.1')
  const page = host()
  for (const [lang, code] of [
    ['mermaid', 'flowchart LR\n A-->B\n'],
    ['mermaid', 'flowchart LR\n A-->C\n'],
    ['text', 'flowchart LR\n A-->D\n'],
    ['mermaid', 'flowchart LR\n A-->E\n'],
  ]) {
    page.render({ lang, code })
    const facts = readFenceFacts(page.block())
    assert.equal(facts.lang, lang, 'language belongs to the committed render')
    assert.equal(facts.source, code, 'source belongs to the committed render')
    assert.equal(facts.fromReact, true)
  }
  const block = page.block()
  page.unmount()
  assert.equal(readFenceFacts(block).fromReact, false, 'unmounted fibers cannot supply live props')
})

test('real React: memo bailouts and suspended work never expose uncommitted CodeBlock props', () => {
  const point = document.createElement('div')
  document.body.append(point)
  const root = createRoot(point)
  roots.add(root)
  const MemoBlock = React.memo(CodeBlock)
  const never = new Promise(() => {})
  function Suspend({ active }) { if (active) throw never; return null }
  const render = (tick, code, suspend = false) => flushSync(() => root.render(
    h(React.Suspense, { fallback: h('span', null, 'Loading') },
      h('div', { 'data-tick': tick },
        h(MemoBlock, { lang: 'mermaid', code }), h(Suspend, { active: suspend }))),
  ))
  render(0, 'flowchart LR\n A-->B')
  const block = point.querySelector('.md-code-block')
  for (let i = 1; i <= 4; i += 1) {
    render(i, 'flowchart LR\n A-->B')
    assert.equal(readFenceFacts(block).source, 'flowchart LR\n A-->B')
  }
  render(5, 'flowchart LR\n A-->Uncommitted', true)
  assert.equal(readFenceFacts(block).source, 'flowchart LR\n A-->B')
  render(6, 'flowchart LR\n A-->C')
  assert.equal(readFenceFacts(block).source, 'flowchart LR\n A-->C')
})

test('real React: root validation works through a deep host provider tree', () => {
  const point = document.createElement('div')
  document.body.append(point)
  const root = createRoot(point)
  roots.add(root)
  function Layer({ children }) { return children }
  for (const suffix of ['First', 'Updated']) {
    const code = `flowchart LR\n A-->${suffix}`
    let tree = h(CodeBlock, { lang: 'mermaid', code })
    for (let i = 0; i < 80; i += 1) tree = h(Layer, null, tree)
    flushSync(() => root.render(tree))
    const facts = readFenceFacts(point.querySelector('.md-code-block'))
    assert.equal(facts.lang, 'mermaid')
    assert.equal(facts.source, code)
    assert.equal(facts.fromReact, true)
  }
})
