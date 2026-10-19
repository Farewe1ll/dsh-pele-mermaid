import React from 'react'

const h = React.createElement
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 * Behavioral fixture for DSH 0.2.1-rc.2 CodeBlock, using real React.
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

/** Dependencies for exercising the installed CodeBlock function in isolation.
 * Its React hooks, JSX body and Copy callback run unchanged. Styling, toolbar,
 * visibility activation and tokenization are fixture adapters, not live DSH.
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
