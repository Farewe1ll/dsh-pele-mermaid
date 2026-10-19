#!/usr/bin/env node
/** Read-only installed-host probe. Never opens a user profile or starts DSH.
 * Runs the installed CodeBlock function unchanged with pinned real React;
 * external styling, toolbar and highlighter helpers are fixture adapters.
 * This proves that component's props/update/Copy paths, not a live chat session.
 */
import assert from 'node:assert/strict'
import { openSync, readSync, closeSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { installedComponentBindings } from '../tests/helpers/react-code-block.mjs'
import { readFenceFacts, createBlockManager } from '../src/client/blocks.js'

const archive = process.env.DSH_APP_ASAR || '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'
const fd = openSync(archive, 'r')
const prefix = Buffer.alloc(16)
readSync(fd, prefix, 0, 16, 0)
const headerBytes = Buffer.alloc(prefix.readUInt32LE(12))
readSync(fd, headerBytes, 0, headerBytes.length, 16)
const header = JSON.parse(headerBytes)
function entry(name) {
  let item = header
  for (const part of name.split('/')) item = item.files[part]
  return item
}
function readEntry(name) {
  const item = entry(name)
  const content = Buffer.alloc(item.size)
  readSync(fd, content, 0, content.length, 8 + prefix.readUInt32LE(4) + Number(item.offset))
  return content.toString()
}
const frontend = 'dsh/node_modules/@deepseek-ai/dsh-web-frontend'
const version = JSON.parse(readEntry(`${frontend}/package.json`)).version
const assets = entry(`${frontend}/dist/assets`).files
const mainName = Object.keys(assets).find((name) => /^index-.*\.js$/.test(name))
const source = readEntry(`${frontend}/dist/assets/${mainName}`)
closeSync(fd)
const start = source.search(/function [\w$]+\(\{code:/)
const end = source.indexOf('}function ', start)
assert.ok(start >= 0 && end > start, 'installed CodeBlock must match the audited extraction boundary')
const componentSource = source.slice(start, end + 1)
assert.ok(componentSource.includes('data-code-block-content'))
assert.ok(componentSource.includes('querySelector("pre")?.textContent'))
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://host.test/' })
for (const key of ['window', 'document', 'Node', 'HTMLElement']) globalThis[key] = dom.window[key]
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')
let copied
const bindings = installedComponentBindings(jsxRuntime, (text) => { copied = text })
const InstalledCodeBlock = new Function(...Object.keys(bindings), `return (${componentSource})`)(...Object.values(bindings))
const checks = []
try {
  const mountPoint = document.createElement('div')
  document.body.append(mountPoint)
  const root = createRoot(mountPoint)
  let latestSource
  const manager = createBlockManager({ document, settleMs: 0, mountDiagram(container, source) {
    latestSource = source
    container.textContent = 'Diagram fixture'
    return { ok: true, destroy() { container.replaceChildren() } }
  } })
  try {
    for (const [lang, code] of [
      ['mermaid', 'flowchart LR\n A-->B\n'],
      ['mermaid', 'flowchart LR\n A-->C\n'],
      ['text', 'flowchart LR\n A-->D\n'],
      ['mermaid', 'flowchart LR\n A-->E\n'],
    ]) {
      flushSync(() => root.render(React.createElement(InstalledCodeBlock, { lang, code, toolbarLabels: {} })))
      const block = mountPoint.querySelector('.md-code-block')
      const facts = readFenceFacts(block)
      assert.equal(facts.lang, lang)
      assert.equal(facts.source, code)
      assert.equal(facts.fromReact, true)
      assert.ok(block.querySelector('[data-code-block-banner]').textContent.startsWith('代码块'))
      const pre = block.querySelector('pre')
      const parent = pre.parentElement
      manager.scan()
      assert.equal(manager.count, lang === 'mermaid' ? 1 : 0)
      if (lang === 'mermaid') assert.equal(latestSource, code)
      assert.equal(pre.parentElement, parent)
    }
    checks.push('generic toolbar: current props, mount/update/language reuse across four committed renders; source parent preserved')
    const block = mountPoint.querySelector('.md-code-block')
    flushSync(() => root.unmount())
    assert.equal(readFenceFacts(block).fromReact, false)
    manager.scan()
    assert.equal(manager.count, 0)
    assert.equal(mountPoint.childNodes.length, 0)
    checks.push('unmounted component supplies no React props')
  } finally {
    manager.destroy()
    mountPoint.remove()
  }
  for (const [lang, streaming, shape] of [
    ['mermaid', false, 'plain'], ['javascript', false, 'static'], ['javascript', true, 'streaming'],
  ]) {
    const point = document.createElement('div')
    document.body.append(point)
    const root = createRoot(point)
    try {
      const code = 'line one\nline two\n\n'
      flushSync(() => root.render(React.createElement(InstalledCodeBlock, { lang, code, streaming, toolbarLabels: {} })))
      const content = point.querySelector('[data-code-block-content]')
      const pre = content.querySelector('pre')
      assert.ok(pre)
      assert.equal(pre.parentElement === content, shape !== 'static')
      assert.equal(pre.textContent, code.slice(0, -1))
      copied = undefined
      flushSync(() => point.querySelector('button').click())
      assert.equal(copied, code.slice(0, -1))
      checks.push(`${shape}: source shape and host Copy preserve all but one trailing newline`)
    } finally {
      flushSync(() => root.unmount())
      point.remove()
    }
  }
  const evidence = {
    status: 'PASS', date: new Date().toISOString(), hostVersion: version, reactVersion: React.version,
    archive, componentAsset: `${frontend}/dist/assets/${mainName}`,
    componentSha256: createHash('sha256').update(componentSource).digest('hex'),
    bundleSha256: createHash('sha256').update(readFileSync(new URL('../lib/client.js', import.meta.url))).digest('hex'),
    scope: 'Installed CodeBlock function, real React; fixture styling/toolbar/tokenization helpers. Not a live DSH session.',
    checks,
  }
  const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9)
  if (output) { mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n') }
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  dom.window.close()
}
