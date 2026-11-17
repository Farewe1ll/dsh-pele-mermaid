#!/usr/bin/env node
/** Read-only installed-host probe. Never opens a user profile or starts DSH.
 * Runs the installed CodeBlock function unchanged with pinned real React;
 * external styling, toolbar and highlighter helpers are fixture adapters.
 * This proves that component's props/update/Copy paths, not a live chat session.
 *
 * The minified identifiers the extracted function closes over are version
 * specific. Bindings are resolved by installed frontend version through
 * tests/helpers/react-code-block.mjs, and an unknown version fails with an
 * actionable UnsupportedHostError instead of a raw ReferenceError.
 */
import assert from 'node:assert/strict'
import { openSync, readSync, closeSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import {
  resolveInstalledBindings,
  UnsupportedHostError,
  SUPPORTED_HOST_VERSIONS,
} from '../tests/helpers/react-code-block.mjs'
import { readFenceFacts, createBlockManager } from '../src/client/blocks.js'

const archive = process.env.DSH_APP_ASAR || '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'
const frontend = 'dsh/node_modules/@deepseek-ai/dsh-web-frontend'

/** Extraction boundary mismatch for a known version: the map itself is stale. */
class StaleBindingMapError extends Error {
  constructor({ version, name }) {
    super(
      `stale binding map for DSH frontend ${version}: the extracted CodeBlock references ` +
      `undeclared identifier "${name}". Update the binding map in tests/helpers/react-code-block.mjs (see docs/ARCH.md).`,
    )
    this.name = 'StaleBindingMapError'
    this.code = 'stale-binding-map'
    this.version = version
    this.bindingName = name
  }
}

/**
 * Read (never write) the installed frontend metadata and main asset from the
 * electron asar archive. The main asset is hashed as raw bytes; its byte size
 * is the asar entry size.
 *
 * @returns {{ version: string, frontendPackage: string, assetPath: string, assetBytes: number, assetSha256: string, source: string }}
 */
function readInstalledFrontend() {
  const fd = openSync(archive, 'r')
  try {
    const prefix = Buffer.alloc(16)
    readSync(fd, prefix, 0, 16, 0)
    const headerBytes = Buffer.alloc(prefix.readUInt32LE(12))
    readSync(fd, headerBytes, 0, headerBytes.length, 16)
    const header = JSON.parse(headerBytes)
    const entry = (name) => {
      let item = header
      for (const part of name.split('/')) item = item.files[part]
      return item
    }
    const readEntry = (name) => {
      const item = entry(name)
      const content = Buffer.alloc(item.size)
      readSync(fd, content, 0, content.length, 8 + prefix.readUInt32LE(4) + Number(item.offset))
      return content
    }
    const version = JSON.parse(readEntry(`${frontend}/package.json`).toString()).version
    const assetDir = entry(`${frontend}/dist/assets`).files
    const mainName = Object.keys(assetDir).find((name) => /^index-.*\.js$/.test(name))
    assert.ok(mainName, 'installed frontend must ship a main index asset')
    const assetPath = `${frontend}/dist/assets/${mainName}`
    const assetBuffer = readEntry(assetPath)
    return {
      version,
      frontendPackage: frontend,
      assetPath,
      assetBytes: entry(assetPath).size,
      assetSha256: createHash('sha256').update(assetBuffer).digest('hex'),
      source: assetBuffer.toString(),
    }
  } finally {
    closeSync(fd)
  }
}

/** @param {unknown} error @returns {string | null} missing identifier name */
function missingIdentifier(error) {
  if (!(error instanceof ReferenceError)) return null
  const stack = typeof error.stack === 'string' ? error.stack : ''
  // Only the recompiled host function lives in a `new Function` eval frame;
  // a ReferenceError from a fixture adapter must keep its own identity.
  if (!stack.includes('(eval at ')) return null
  const match = /^([\w$]+) is not defined$/.exec(error.message)
  return match ? match[1] : null
}

/**
 * Render the installed component and verify its host contracts.
 *
 * @param {Object} options
 * @param {Function} options.InstalledCodeBlock extracted host function
 * @param {Document} options.document jsdom document
 * @param {Function} options.createRoot react-dom/client createRoot
 * @param {Function} options.flushSync react-dom flushSync
 * @param {{ text: string | undefined }} options.copyState host Copy recorder
 * @param {string[]} options.checks collected check descriptions
 */
function probeInstalledComponent({ InstalledCodeBlock, document, createRoot, flushSync, copyState, checks }) {
  /**
   * Mount the installed component once and allow committed re-renders through
   * the same React root (the host updates props without remounting the block).
   */
  const mount = (props) => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let disposed = false
    const page = {
      container,
      update(next) { flushSync(() => root.render(React.createElement(InstalledCodeBlock, next))) },
      block() { return container.querySelector('.md-code-block') },
      unmount() {
        if (disposed) return
        disposed = true
        flushSync(() => root.unmount())
        container.remove()
      },
    }
    page.update(props)
    return page
  }

  /**
   * The host Copy control lives in the banner; the plugin's own Diagram/Source
   * toolbar is inserted into the content region, so never take the last button
   * of the whole block.
   */
  const copyButton = (block) => {
    const banner = block.querySelector('[data-code-block-banner]')
    const buttons = banner ? Array.from(banner.querySelectorAll('button')) : []
    return buttons.length > 0 ? buttons[buttons.length - 1] : null
  }

  const clickCopy = (block, expected) => {
    const button = copyButton(block)
    assert.ok(button, 'installed component must render a host Copy control')
    copyState.text = undefined
    flushSync(() => button.click())
    assert.equal(copyState.text, expected, 'host Copy must receive all but one trailing newline')
  }

  let latestSource
  const manager = createBlockManager({
    document,
    settleMs: 0,
    mountDiagram(container, source) {
      latestSource = source
      container.textContent = 'Diagram fixture'
      return { ok: true, destroy() { container.replaceChildren() } }
    },
  })
  try {
    /* 1. Default (plain) banner: committed props, mermaid-only mounting. */
    const plain = mount({ lang: 'mermaid', code: 'flowchart LR\n A-->B\n', copyLabel: 'Copy', copiedLabel: 'Copied' })
    try {
      let lastBlock
      for (const [lang, code] of [
        ['mermaid', 'flowchart LR\n A-->B\n'],
        ['mermaid', 'flowchart LR\n A-->C\n'],
        ['text', 'flowchart LR\n A-->D\n'],
        ['javascript', 'const answer = 42\n'],
        ['mermaid', 'flowchart LR\n A-->E\n'],
      ]) {
        plain.update({ lang, code, copyLabel: 'Copy', copiedLabel: 'Copied' })
        const block = plain.block()
        assert.ok(block, 'installed CodeBlock must render .md-code-block')
        const facts = readFenceFacts(block)
        assert.equal(facts.lang, lang, 'React props supply the exact language')
        assert.equal(facts.source, code, 'React props supply the exact source')
        assert.equal(facts.fromReact, true)
        assert.equal(facts.hasBanner, true)
        assert.ok(block.querySelector('[data-code-block-content]'), 'content hook must be present')
        const banner = block.querySelector('[data-code-block-banner]')
        assert.ok(banner, 'banner hook must be present')
        assert.ok(banner.textContent.includes(lang), 'plain banner exposes the committed language')
        const pre = block.querySelector('pre')
        assert.ok(pre, 'source <pre> must be present')
        assert.equal(pre.textContent, code.slice(0, -1), 'source keeps all but one trailing newline')
        const parent = pre.parentElement
        manager.scan()
        assert.equal(manager.count, lang === 'mermaid' ? 1 : 0, 'only mermaid fences are enhanced')
        if (lang === 'mermaid') assert.equal(latestSource, code, 'the diagram mounts the committed source')
        assert.equal(pre.parentElement, parent, 'the plugin must not move the host <pre>')
        lastBlock = block
      }
      checks.push('plain banner: exact lang/code props across five committed renders; mermaid-only mount; host <pre> parent preserved')
      plain.unmount()
      assert.equal(readFenceFacts(lastBlock).fromReact, false, 'unmounted component supplies no committed props')
      manager.scan()
      assert.equal(manager.count, 0, 'unmount removes the mounted diagram')
      checks.push('unmounted component supplies no React props')
    } finally {
      plain.unmount()
    }

    /* 2. Card-toolbar banner: the shape the live host renders when toolbarLabels is passed. */
    const cardCode = 'flowchart LR\n A-->B\n'
    const card = mount({
      lang: 'mermaid',
      code: cardCode,
      copyLabel: 'Copy',
      copiedLabel: 'Copied',
      toolbarLabels: { codeLabel: '代码块', wrapLabel: 'Wrap', unwrapLabel: 'Unwrap' },
    })
    try {
      const block = card.block()
      assert.ok(block, 'card-bannered CodeBlock must render')
      assert.equal(block.getAttribute('data-code-wrap'), 'true', 'toolbarLabels selects the card toolbar shape')
      const banner = block.querySelector('[data-code-block-banner]')
      assert.ok(banner, 'card banner must keep the stable banner hook')
      assert.ok(banner.textContent.includes('代码块'), 'card banner shows the host generic label for mermaid')
      assert.ok(banner.textContent.includes('Copy'), 'card banner renders a Copy control')
      const facts = readFenceFacts(block)
      assert.equal(facts.lang, 'mermaid')
      assert.equal(facts.source, cardCode)
      assert.equal(facts.fromReact, true)
      const content = block.querySelector('[data-code-block-content]')
      const pre = content.querySelector('pre')
      assert.ok(pre)
      const parent = pre.parentElement
      manager.scan()
      assert.equal(manager.count, 1)
      assert.equal(latestSource, cardCode)
      assert.equal(pre.parentElement, parent, 'the plugin must not move the host <pre>')
      clickCopy(block, cardCode.slice(0, -1))
      checks.push('card banner: toolbarLabels branch keeps [data-code-block-banner], mounts mermaid, preserves source parent, host Copy works')
    } finally {
      card.unmount()
      manager.scan()
    }

    /* 3. Plain / static-HTML / streaming source-ownership shapes. */
    const shapeCode = 'line one\nline two\n\n'
    for (const [lang, streaming, shape] of [
      ['mermaid', false, 'plain'],
      ['javascript', false, 'static'],
      ['javascript', true, 'streaming'],
    ]) {
      const page = mount({
        lang,
        code: shapeCode,
        ...(streaming ? { streaming: true } : {}),
        copyLabel: 'Copy',
        copiedLabel: 'Copied',
      })
      try {
        const block = page.block()
        const content = block.querySelector('[data-code-block-content]')
        assert.ok(content, 'content hook must be present')
        const pre = content.querySelector('pre')
        assert.ok(pre, 'each shape must still expose the source <pre>')
        const injectedHtml = pre.parentElement !== content
        assert.equal(injectedHtml, shape === 'static', `${shape}: source shape`)
        if (shape === 'static') assert.equal(pre.parentElement.parentElement, content, 'static shape injects one HTML wrapper')
        assert.equal(pre.textContent, shapeCode.slice(0, -1), 'source keeps all but one trailing newline')
        clickCopy(block, shapeCode.slice(0, -1))
        manager.scan()
        assert.equal(manager.count, shape === 'plain' ? 1 : 0)
        checks.push(`${shape}: source shape and host Copy preserve all but one trailing newline`)
      } finally {
        page.unmount()
        manager.scan()
      }
    }
  } finally {
    manager.destroy()
  }
}

/**
 * @param {ReturnType<typeof readInstalledFrontend>} installed
 * @returns {Promise<Object>} evidence record
 */
async function runProbe(installed) {
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')
  /** @type {{ text: string | undefined }} */
  const copyState = { text: undefined }
  const { bindings, componentMatcher } = resolveInstalledBindings({
    version: installed.version,
    jsxRuntime,
    onCopy: (text) => { copyState.text = text },
    assetSha256: installed.assetSha256,
  })
  const start = installed.source.search(componentMatcher.start)
  const end = installed.source.indexOf(componentMatcher.end, start)
  assert.ok(start >= 0 && end > start, 'installed CodeBlock must match the audited extraction boundary')
  const componentSource = installed.source.slice(start, end + 1)
  assert.ok(componentSource.includes('data-code-block-content'))
  assert.ok(componentSource.includes('querySelector("pre")?.textContent'))
  const InstalledCodeBlock = new Function(
    ...Object.keys(bindings),
    `return (${componentSource})`,
  )(...Object.values(bindings))
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://host.test/' })
  for (const key of ['window', 'document', 'Node', 'HTMLElement']) globalThis[key] = dom.window[key]
  try {
    const checks = []
    try {
      probeInstalledComponent({
        InstalledCodeBlock,
        document: dom.window.document,
        createRoot,
        flushSync,
        copyState,
        checks,
      })
    } catch (error) {
      const name = missingIdentifier(error)
      if (name !== null) throw new StaleBindingMapError({ version: installed.version, name })
      throw error
    }
    return {
      status: 'PASS',
      date: new Date().toISOString(),
      hostVersion: installed.version,
      bindingVersion: installed.version,
      supportedBindingVersions: SUPPORTED_HOST_VERSIONS,
      reactVersion: React.version,
      archive,
      componentAsset: installed.assetPath,
      componentAssetBytes: installed.assetBytes,
      frontendAssetSha256: installed.assetSha256,
      componentSha256: createHash('sha256').update(componentSource).digest('hex'),
      componentBytes: componentSource.length,
      bundleSha256: createHash('sha256').update(readFileSync(new URL('../lib/client.js', import.meta.url))).digest('hex'),
      scope: 'Installed CodeBlock function, real React; fixture styling/toolbar/visibility/tokenization helpers. Not a live DSH session.',
      checks,
    }
  } finally {
    dom.window.close()
  }
}

/** @param {unknown} error */
function printDiagnostic(error) {
  if (error instanceof UnsupportedHostError) {
    console.error(`verify:host: ${error.message}`)
    console.error('verify:host: the installed-host probe did not run; add a binding adapter and re-run.')
    return true
  }
  if (error instanceof StaleBindingMapError) {
    console.error(`verify:host: ${error.message}`)
    return true
  }
  return false
}

try {
  const installed = readInstalledFrontend()
  const evidence = await runProbe(installed)
  const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9)
  if (output) {
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n')
  }
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  if (!printDiagnostic(error)) throw error
  process.exitCode = 1
}
