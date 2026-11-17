import React from 'react'

const h = React.createElement
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 * Behavioral fixture for the DSH CodeBlock primitive, using real React.
 * Mirrors its one-trailing-newline removal, Copy query/fallback, generic
 * toolbar label and three source ownership shapes. Tokenization and visual
 * styling are deliberately outside this fixture's lifecycle assertions.
 */
export function CodeBlock({ code, lang, mode = 'plain', onCopy = () => {}, epoch = 0 }) {
  const ref = React.useRef(null)
  const displayCode = code.endsWith('\n') ? code.slice(0, -1) : code
  let source
  if (mode === 'static') {
    source = h('div', {
      key: epoch,
      dangerouslySetInnerHTML: { __html: `<pre class="shiki"><code><span class="line">${escapeHtml(displayCode)}</span></code></pre>` },
    })
  } else {
    source = h('pre', { key: epoch, className: mode === 'streaming' ? 'shiki' : 'plain' },
      h('code', null, mode === 'streaming' ? h('span', { className: 'line' }, displayCode) : displayCode))
  }
  return h('div', { ref, className: 'md-code-block' },
    h('div', { 'data-code-block-banner': '' },
      h('span', null, lang === 'javascript' ? lang : '代码块'),
      h('button', { type: 'button', onClick: () => onCopy(ref.current?.querySelector('pre')?.textContent ?? displayCode) }, 'Copy')),
    h('div', { 'data-code-block-content': '' }, source))
}

/* -------------------------------------------------------------------------- */
/* Installed-host binding adapters                                            */
/* -------------------------------------------------------------------------- */

/**
 * The installed CodeBlock function is extracted from the DSH frontend bundle
 * and recompiled with its minified free identifiers supplied as parameters.
 * The identifier names are a property of one frontend build, so every adapter
 * is keyed by the installed frontend version.
 *
 * Adapters below are fixtures: they emulate the behavior the component relies
 * on (styling, toolbar chrome, visibility activation, tokenization) but they
 * are not host code. The component's own React hooks, JSX body, update rules
 * and Copy callback path still execute unchanged.
 */

/**
 * Raised when the installed DSH frontend has no binding adapter yet. The
 * installed CodeBlock cannot be executed against a stale identifier map without
 * a raw ReferenceError, so callers get an actionable diagnostic instead.
 */
export class UnsupportedHostError extends Error {
  /**
   * @param {Object} [options]
   * @param {string} [options.version] installed frontend version
   * @param {string} [options.assetSha256] installed frontend main-asset sha256
   * @param {readonly string[]} [options.supportedVersions] known versions
   */
  constructor({ version, assetSha256, supportedVersions = SUPPORTED_HOST_VERSIONS } = {}) {
    const digest = typeof assetSha256 === 'string' && assetSha256.length > 0
      ? assetSha256.slice(0, 12)
      : 'asset sha256 unavailable'
    super(
      `unsupported DSH frontend ${version ?? 'unknown'} (${digest}): update the binding map in ` +
      `tests/helpers/react-code-block.mjs (see docs/ARCH.md). Known versions: ${supportedVersions.join(', ')}.`,
    )
    this.name = 'UnsupportedHostError'
    /** Stable diagnostic code for callers that branch on it. */
    this.code = 'unsupported-host'
    this.version = version ?? null
    this.assetSha256 = assetSha256 ?? null
    this.supportedVersions = [...supportedVersions]
  }
}

/**
 * Bundle boundary of the minified CodeBlock function. Both known frontend
 * builds start at `function <id>({code:` and end before the following
 * `}function ` declaration, so the extraction stays byte-identical.
 */
const COMPONENT_BOUNDARY = Object.freeze({
  start: /function [\w$]+\(\{code:/,
  end: '}function ',
})

/**
 * Audited minified identifiers each known frontend build's CodeBlock closes
 * over. Exported so a probe can distinguish a stale map from a missing adapter.
 */
export const INSTALLED_BINDING_NAMES = Object.freeze({
  '0.2.1-rc.2': Object.freeze(['C', 'u', 'Mn', 'de', 'Y_', 'l4', 'ho', 'kR', 'B8', 'VF', 'WF', '_R', 'zo', 'd4']),
  '0.2.2-rc.3': Object.freeze([
    'x', 'm', 'NW', 'AW', 'Db', 'Dp', 'ns', 'RW', 'lB', 'H7', 'FW', 'UW', 'oB', 'Ss', '$t', 'pe', 'Rp', 'HW',
  ]),
})

/** Versions with a known binding adapter, oldest first. */
export const SUPPORTED_HOST_VERSIONS = Object.freeze(Object.keys(INSTALLED_BINDING_NAMES))

/** Dependencies for exercising the installed 0.2.1-rc.2 CodeBlock function in
 * isolation. Its React hooks, JSX body and Copy callback run unchanged.
 * Styling, toolbar, visibility activation and tokenization are fixture
 * adapters, not live DSH.
 */
export function installedComponentBindings(jsxRuntime, onCopy) {
  return {
    C: React,
    u: jsxRuntime,
    Mn: { block: 'host-block', content: 'host-content', plain: 'host-plain' },
    de: (...names) => names.filter(Boolean).join(' '),
    Y_: (_ref, lang) => lang === 'javascript',
    l4: () => () => {},
    ho: () => 0,
    kR: class {
      updateFrame(code) {
        return { generation: 0, appended: [], tail: code.split('\n').map((text) => [{ text, style: {} }]) }
      }
    },
    B8: (tokens, index) => h(React.Fragment, { key: index }, index > 0 ? '\n' : '',
      h('span', { className: 'line' }, tokens.map((token, key) => h('span', { key, style: token.style }, token.text)))),
    VF: { className: 'shiki css-variables', tabIndex: 0 },
    WF: 32,
    _R: (code) => `<pre class="shiki"><code><span class="line">${escapeHtml(code)}</span></code></pre>`,
    zo: async (text) => { onCopy(text); return true },
    d4: ({ lang, onCopy: copy }) => h('div', { 'data-code-block-banner': '' },
      h('span', null, lang === 'javascript' ? lang : '代码块'),
      h('button', { onClick: copy }, 'Copy')),
  }
}

/**
 * Dependencies for exercising the installed 0.2.2-rc.3 CodeBlock function in
 * isolation (signature: code, lang, diff, streaming, className, contentRef,
 * lineNumbers, showHeader, copyLabel, copiedLabel, toolbarLabels, wrap).
 *
 * The adapters keep the component's own branch logic observable: `Db` is a
 * plain activation predicate that turns on the highlighted branches for
 * JavaScript, so the probe reaches the plain, static-HTML and streaming source
 * shapes deterministically instead of depending on an IntersectionObserver or
 * asynchronous grammar loading. Diff rendering is disabled (`NW` false,
 * `AW` undefined) because the probe does not exercise the diff path.
 *
 * Styling, toolbar chrome, visibility activation and tokenization here are
 * fixture adapters, not host code.
 *
 * @param {Object} jsxRuntime real `react/jsx-runtime`
 * @param {(text: string) => void} onCopy records the host Copy path payload
 * @returns {Record<string, unknown>} parameters for the extracted function
 */
export function installedComponentBindings022rc3(jsxRuntime, onCopy) {
  /** @type {Record<string, string>} */
  const cssModule = {
    block: 'host-block',
    bannerWrap: 'host-banner-wrap',
    banner: 'host-banner',
    infostring: 'host-infostring',
    action: 'host-action',
    copyButton: 'host-copy-button',
    content: 'host-content',
    plain: 'host-plain',
    card: 'host-card',
    numbered: 'host-numbered',
    diffFence: 'host-diff-fence',
    diffLine: 'host-diff-line',
    diffAdd: 'host-diff-add',
    diffDel: 'host-diff-del',
    diffMarker: 'host-diff-marker',
    diffContext: 'host-diff-context',
    diffHunk: 'host-diff-hunk',
    diffMeta: 'host-diff-meta',
  }
  return {
    x: React,
    m: jsxRuntime,
    // Diff path is outside the probe's scope; keep it inert.
    NW: () => false,
    AW: undefined,
    // Real host: IntersectionObserver + grammar availability. Fixture: a plain
    // predicate so the highlighted branches are reachable in a test render.
    Db: (_ref, lang) => lang === 'javascript',
    Dp: () => () => {},
    ns: () => 0,
    RW: () => undefined,
    /** Streaming frame accumulator stub: every display line is emitted as a tail line. */
    lB: class {
      updateFrame(code) {
        return { generation: 0, appended: [], tail: code.split('\n').map((text) => [{ text, style: {} }]) }
      }
    },
    /** Line renderer: newline separators plus one span.line per source line. */
    H7: (tokens, index) => h(React.Fragment, { key: index }, index > 0 ? '\n' : '',
      h('span', { className: 'line' }, tokens.map((token, key) => h('span', { key, style: token.style }, token.text)))),
    FW: 32,
    UW: { className: 'shiki css-variables', tabIndex: 0 },
    /** Static-shape HTML builder (escaped, one span.line for the whole source). */
    oB: (code) => `<pre class="shiki"><code><span class="line">${escapeHtml(code)}</span></code></pre>`,
    /** Host clipboard write: records the exact text the component queried. */
    Ss: async (text) => { onCopy(text); return true },
    $t: cssModule,
    pe: (...names) => names.filter(Boolean).join(' '),
    /**
     * Card-toolbar banner. Mirrors the host component's stable hooks: a
     * [data-code-block-banner] container, a language label, a wrap control when
     * one is provided, and the Copy button wired to the component's callback.
     */
    Rp: ({ lang, labels = {}, copyLabel, copiedLabel, copied, wrapped, onCopy: copy, onWrap }) =>
      h('div', { className: 'host-card-header', 'data-code-block-banner': '' },
        h('div', { className: 'host-card-heading' },
          h('span', { className: 'host-card-language' }, lang === 'javascript' ? lang : (labels.codeLabel ?? '代码块'))),
        h('div', { className: 'host-card-actions' },
          typeof onWrap === 'function'
            ? h('button', { type: 'button', className: 'host-card-action', 'aria-label': labels.wrapLabel, 'aria-pressed': !!wrapped, onClick: onWrap }, labels.wrapLabel)
            : null,
          h('button', {
            type: 'button',
            className: 'host-card-action host-card-copy',
            'aria-label': copied ? copiedLabel : copyLabel,
            onClick: copy,
          }, copied ? copiedLabel : (copyLabel ?? '')))),
    /** Diff row renderer (inert while the diff path is disabled). */
    HW: (row, index) => h(React.Fragment, { key: index }, index > 0 ? '\n' : '',
      h('span', { className: 'line' }, row && typeof row.text === 'string' ? row.text : '')),
  }
}

/** @type {Map<string, (jsxRuntime: Object, onCopy: (text: string) => void) => Record<string, unknown>>} */
const BINDING_ADAPTERS = new Map([
  ['0.2.1-rc.2', installedComponentBindings],
  ['0.2.2-rc.3', installedComponentBindings022rc3],
])

/**
 * Resolve the binding map for one installed frontend version.
 *
 * @param {Object} options
 * @param {string} options.version installed `dsh-web-frontend` version
 * @param {Object} options.jsxRuntime real `react/jsx-runtime`
 * @param {(text: string) => void} [options.onCopy] records host Copy payloads
 * @param {string} [options.assetSha256] installed main asset hash, diagnostics only
 * @returns {{ bindings: Record<string, unknown>, componentMatcher: { start: RegExp, end: string } }}
 * @throws {UnsupportedHostError} when the version has no adapter yet
 */
export function resolveInstalledBindings({ version, jsxRuntime, onCopy, assetSha256 } = {}) {
  const create = BINDING_ADAPTERS.get(version)
  if (typeof create !== 'function') {
    throw new UnsupportedHostError({ version, assetSha256, supportedVersions: SUPPORTED_HOST_VERSIONS })
  }
  const copy = typeof onCopy === 'function' ? onCopy : () => {}
  return { bindings: create(jsxRuntime, copy), componentMatcher: COMPONENT_BOUNDARY }
}
