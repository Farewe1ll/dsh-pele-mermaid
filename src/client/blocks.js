/**
 * dsh-pele-mermaid — Mermaid code-block manager.
 *
 * Detects settled ` ```mermaid ` fences in the rendered DSH Markdown DOM,
 * mounts a Pele diagram inside `[data-code-block-content]`, keeps the original
 * `<pre>` as the source artifact, and removes only plugin additions on destroy,
 * preserving host updates.
 *
 * Contracts (docs/ARCH.md § `src/client/blocks.js`):
 *  - `scan()` is synchronous and idempotent; it is also the settle-timer
 *    callback, so calling it from an external debounce is expected.
 *  - Nothing here may throw into React: every DOM operation is defensive and
 *    `scan()` swallows failures.
 *  - We never touch the DSH code-block banner (its Copy button keeps working
 *    because its original `<pre>` stays in the host-owned subtree).
 *  - Pele is NOT imported here directly; `mountDiagram` is injected (defaults
 *    to the engine adapter) so the DOM layer stays testable and swappable.
 *
 * @module dsh-pele-mermaid/blocks
 */

import { CLASS as THEME_CLASS, SOURCE_HIDDEN_ATTR } from './theme-css.js'
import { mountDiagram as engineMountDiagram } from './engine.js'

/** Language tag of the fenced blocks this plugin owns. */
export const MERMAID_LANG = 'mermaid'

/** Stable DSH hooks (hashed CSS-module classes are never used). */
const BLOCK_SELECTOR = '.md-code-block'
const BANNER_SELECTOR = '[data-code-block-banner]'
const CONTENT_SELECTOR = '[data-code-block-content]'

/**
 * DSH renders a fence whose language Shiki cannot highlight (Mermaid is one)
 * with the toolbar's localized generic label instead of the info string:
 * `t('codeBlock.title')` — `代码块` in zh, `Code` in en. Such a label carries no
 * language information, so it is treated as "unknown" rather than as an
 * explicit non-Mermaid language.
 */
const GENERIC_CODE_LABELS = new Set(['代码块', 'code'])

/** React internals: host DOM nodes carry their owning fiber and DOM props. */
const REACT_FIBER_PREFIX = '__reactFiber$'

/** Maximum ancestor hops when looking for the CodeBlock component fiber. */
const FIBER_WALK_LIMIT = 40

/** Root validation includes the host app's providers outside CodeBlock. */
const FIBER_ROOT_WALK_LIMIT = 512

/** Default settle window: source must be unchanged this long before rendering. */
const DEFAULT_SETTLE_MS = 180

/** Default prefix for the plain-text error note. */
const DEFAULT_ERROR_PREFIX = 'Pele: '

/** Shown only when the engine returns no message at all (should not happen). */
const FALLBACK_MOUNT_ERROR = 'unable to render diagram'

/**
 * Class names owned by `theme-css.js` (imported exactly once; never duplicated
 * here). `options.classes` is a test seam only.
 */
const DEFAULT_CLASS = THEME_CLASS

/** Toolbar labels per supported locale. */
const TOOLBAR_LABELS = Object.freeze({
  zh: Object.freeze({ group: '图表操作', diagram: '图表', source: '源码' }),
  en: Object.freeze({ group: 'Diagram controls', diagram: 'Diagram', source: 'Source' }),
})

/* -------------------------------------------------------------------------- */
/* Small defensive helpers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * @param {unknown} value
 * @returns {value is Element}
 */
function isElement(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (/** @type {Element} */ (value).querySelector) === 'function' &&
    typeof (/** @type {Element} */ (value).nodeType) === 'number' &&
    /** @type {Element} */ (value).nodeType === 1
  )
}

/**
 * `querySelector` that never throws (detached/invalid selectors, proxies).
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element | null}
 */
function safeQuery(root, selector) {
  try {
    return root.querySelector(selector)
  } catch {
    return null
  }
}

/**
 * @param {Node | null | undefined} node
 * @param {Document} doc
 * @returns {boolean} whether `node` is currently attached to `doc`
 */
function isLive(node, doc) {
  if (!node) return false
  try {
    if (typeof /** @type {Node} */ (node).isConnected === 'boolean') {
      return /** @type {Node} */ (node).isConnected
    }
    const owner = /** @type {Node} */ (node).ownerDocument
    return !!owner && owner === doc
  } catch {
    return false
  }
}

/**
 * @param {Node} node
 * @returns {string | null}
 */
function textOf(node) {
  try {
    const value = /** @type {Node & { textContent?: string | null }} */ (node).textContent
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * Plain-text message for a thrown mount error.
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  if (error && typeof error === 'object') {
    const message = /** @type {{ message?: unknown }} */ (error).message
    if (typeof message === 'string' && message.trim() !== '') return message
  }
  if (typeof error === 'string' && error.trim() !== '') return error
  return FALLBACK_MOUNT_ERROR
}

/**
 * @param {unknown} input
 * @returns {{ diagram: string, toolbar: string, error: string, source: string, active: string }}
 */
function normalizeClasses(input) {
  /** @type {Record<string, string>} */
  const merged = { ...DEFAULT_CLASS }
  if (input && typeof input === 'object') {
    for (const key of Object.keys(merged)) {
      const value = /** @type {Record<string, unknown>} */ (input)[key]
      if (typeof value === 'string' && value.trim() !== '') merged[key] = value.trim()
    }
  }
  return /** @type {{ diagram: string, toolbar: string, error: string, source: string, active: string }} */ (
    Object.freeze(merged)
  )
}

/**
 * @param {unknown} input
 * @returns {'zh' | 'en'}
 */
function resolveLocale(input) {
  if (typeof input === 'string' && input.trim() !== '') {
    return input.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en'
  }
  try {
    const language = typeof navigator !== 'undefined' ? String(navigator.language ?? '') : ''
    return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

/**
 * @param {unknown} input
 * @returns {number}
 */
function normalizeSettleMs(input) {
  const value = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(value) || value < 0) return DEFAULT_SETTLE_MS
  return value
}

/* -------------------------------------------------------------------------- */
/* Public readers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a React 18 fiber against the committed root. The DOM's attached
 * fiber can be the previous alternate after an update. Return pointers alone
 * are insufficient: bailout subtrees can be shared by both parent alternates.
 * Check child membership up to root.current, considering both parents. Unknown
 * internals or a disconnected tree fail closed and leave DOM fallback usable.
 * @param {any} fiber
 * @param {Map<object, boolean>} membership
 * @returns {any | null}
 */
function currentFiber(fiber, membership) {
  function belongs(node, depth = 0) {
    if (!node || depth >= FIBER_ROOT_WALK_LIMIT) return false
    if (membership.has(node)) return membership.get(node)
    membership.set(node, false)
    if (node.tag === 3) {
      const current = node.stateNode?.current === node
      membership.set(node, current)
      return current
    }
    for (const parent of [node.return, node.return?.alternate]) {
      if (!parent) continue
      let child = parent.child
      // Bound malformed/private structures as well as ancestor traversal.
      for (let count = 0; child && count < 4096; count += 1, child = child.sibling) {
        if (child !== node) continue
        if (belongs(parent, depth + 1)) {
          membership.set(node, true)
          return true
        }
        break
      }
    }
    return false
  }
  if (belongs(fiber)) return fiber
  return belongs(fiber?.alternate) ? fiber.alternate : null
}

/**
 * Find the CodeBlock component props through React's host fiber.
 *
 * DSH renders a fence whose language Shiki cannot highlight (Mermaid is one)
 * with a localized generic code label, so the DOM alone no longer states the
 * language. React attaches a fiber to every host node; walking up the `return`
 * chain from the `.md-code-block` host reaches the CodeBlock component fiber,
 * whose memoized props still carry the raw `code` and `lang` the Markdown
 * renderer passed. This reads a framework internal on purpose — every caller
 * falls back to DOM-only facts when it is unavailable.
 *
 * @param {Element} block - a `.md-code-block` element
 * @returns {{ code: string, lang?: unknown } | null}
 */
function reactCodeBlockProps(block) {
  try {
    if (!block.isConnected) return null
    for (const key of Object.getOwnPropertyNames(block)) {
      if (!key.startsWith(REACT_FIBER_PREFIX)) continue
      const membership = new Map()
      /** @type {{ memoizedProps?: unknown, return?: unknown } | null} */
      let fiber = /** @type {any} */ (block)[key]
      if (fiber?.stateNode !== block) return null
      for (let depth = 0; fiber !== null && depth < FIBER_WALK_LIMIT; depth += 1) {
        fiber = currentFiber(fiber, membership)
        if (!fiber) return null
        const props = fiber.memoizedProps
        if (
          props !== null &&
          typeof props === 'object' &&
          typeof (/** @type {{ code?: unknown }} */ (props).code) === 'string' &&
          'lang' in /** @type {object} */ (props)
        ) {
          return /** @type {{ code: string, lang?: unknown }} */ (props)
        }
        fiber = fiber.return ?? null
      }
      break
    }
  } catch {
    /* React internals are optional; DOM facts still work */
  }
  return null
}

/**
 * Read a language tag from the rendered banner, lowercased.
 *
 * The banner can be either the plain infostring banner or the card-toolbar
 * shape, so the banner is cloned and interactive chrome (buttons, SVG icons,
 * aria-hidden icon wrappers) is stripped before reading the remaining text.
 * A generic code label (`代码块` / `Code`) is not a language and reads as null.
 *
 * @param {Element} block - a `.md-code-block` element
 * @returns {string | null}
 */
function readBannerLanguage(block) {
  const banner = safeQuery(block, BANNER_SELECTOR)
  if (!isElement(banner)) return null
  let text = ''
  try {
    const clone = banner.cloneNode(true)
    if (isElement(clone)) {
      for (const chrome of clone.querySelectorAll('button, svg, [aria-hidden="true"]')) {
        chrome.remove()
      }
      text = textOf(clone) ?? ''
    }
  } catch {
    return null
  }
  const trimmed = text.trim()
  if (trimmed === '') return null
  const token = trimmed.split(/\s+/)[0]
  if (!token) return null
  const lowered = token.toLowerCase()
  return GENERIC_CODE_LABELS.has(lowered) ? null : lowered
}

/**
 * Read the round-trip facts for one rendered fence.
 *
 * - `lang`: the exact fence info-string language when React internals expose it,
 *   otherwise the banner tag; null when the banner only shows a generic code
 *   label (the case for Mermaid in the real DSH chat UI).
 * - `source`: the raw fenced code when React exposes it, otherwise the rendered
 *   `<pre>` text (returned unchanged; callers own blank checks).
 *
 * @param {Element | null | undefined} block - a `.md-code-block` element
 * @returns {{ lang: string | null, source: string | null, fromReact: boolean, hasBanner: boolean }}
 */
export function readFenceFacts(block) {
  if (!isElement(block)) return { lang: null, source: null, fromReact: false, hasBanner: false }
  const props = reactCodeBlockProps(block)
  const hasBanner = isElement(safeQuery(block, BANNER_SELECTOR))
  /** @type {string | null} */
  let lang = null
  /** @type {string | null} */
  let source = null
  if (props) {
    const rawLang = props.lang
    if (typeof rawLang === 'string') {
      const token = rawLang.trim().split(/\s+/)[0]
      if (token) lang = token.toLowerCase()
    }
    if (typeof props.code === 'string') source = props.code
  }
  if (!props) lang = readBannerLanguage(block)
  if (source === null) {
    const content = safeQuery(block, CONTENT_SELECTOR)
    const pre = content ? safeQuery(content, 'pre') : null
    if (pre) source = textOf(pre)
  }
  return { lang, source, fromReact: props !== null, hasBanner }
}

/**
 * Read the settled fence language, lowercased.
 * @param {Element | null | undefined} block - a `.md-code-block` element
 * @returns {string | null} lowercased language tag, or null when unknown
 */
export function readFenceLanguage(block) {
  return readFenceFacts(block).lang
}

/**
 * Read the fence source, preferring the exact React `code` prop.
 * @param {Element | null | undefined} block - a `.md-code-block` element
 * @returns {string | null}
 */
export function readFenceSource(block) {
  return readFenceFacts(block).source
}

/* -------------------------------------------------------------------------- */
/* Block manager                                                              */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {Object} DiagramHandle
 * @property {boolean} ok
 * @property {string | null} error
 * @property {() => void} [refresh]
 * @property {() => void} [destroy]
 */

/**
 * @typedef {Object} BlockRecord
 * @property {Element} block
 * @property {Element} content
 * @property {Element | null} pre            source artifact (original <pre>)
 * @property {string} source                 last observed source
 * @property {number} since                  now() when `source` last changed
 * @property {boolean} pendingTimer
 * @property {'pending'|'mounted'|'error'} status
 * @property {DiagramHandle | null} handle
 * @property {Element | null} container
 * @property {Element | null} host      Pele mount target (sibling of the toolbar)
 * @property {Element | null} toolbar
 * @property {{ diagram: HTMLButtonElement, source: HTMLButtonElement } | null} buttons
 * @property {boolean} hidingSource
 * @property {string | null} previousHiddenAttribute
 * @property {Element | null} errorNote
 * @property {'diagram'|'source'} view
 */

/**
 * Create one page's block manager.
 *
 * @param {Object} [options]
 * @param {Document} [options.document]
 * @param {(container: Element, source: string) => DiagramHandle} [options.mountDiagram]
 * @param {(fn: () => void, ms: number) => unknown} [options.schedule] settle timer seam
 * @param {() => number} [options.now] clock seam
 * @param {number} [options.settleMs] default 180
 * @param {'zh'|'en'|string} [options.locale] default from `navigator.language`
 * @param {string} [options.errorPrefix] default `'Pele: '`
 * @param {Partial<Record<'diagram' | 'toolbar' | 'error' | 'source' | 'active', string>>} [options.classes]
 *   test seam; defaults to the theme-css `CLASS` map
 */
export function createBlockManager(options = {}) {
  const opts = options ?? {}
  const doc =
    opts.document && typeof opts.document === 'object'
      ? opts.document
      : typeof document !== 'undefined'
        ? document
        : null
  const classes = normalizeClasses(opts.classes)
  const locale = resolveLocale(opts.locale)
  const labels = TOOLBAR_LABELS[locale]
  const settleMs = normalizeSettleMs(opts.settleMs)
  const errorPrefix = typeof opts.errorPrefix === 'string' ? opts.errorPrefix : DEFAULT_ERROR_PREFIX
  const mount = typeof opts.mountDiagram === 'function' ? opts.mountDiagram : engineMountDiagram
  const schedule =
    typeof opts.schedule === 'function'
      ? opts.schedule
      : /** @param {() => void} fn @param {number} ms */ (fn, ms) => setTimeout(fn, ms)
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now()

  /** @type {Map<Element, BlockRecord>} */
  const records = new Map()
  let destroyed = false

  /* ------------------------------ records ------------------------------- */

  /**
   * @param {Element} block
   * @param {Element} content
   * @param {Element} pre
   * @param {string} source
   * @returns {BlockRecord}
   */
  function createRecord(block, content, pre, source) {
    return {
      block,
      content,
      pre,
      source,
      since: now(),
      pendingTimer: false,
      status: 'pending',
      handle: null,
      container: null,
      host: null,
      toolbar: null,
      buttons: null,
      hidingSource: false,
      previousHiddenAttribute: null,
      errorNote: null,
      view: 'diagram',
    }
  }

  /**
   * First `<pre>` in `content` that we do not own (i.e. React rendered it).
   * Skip any engine-generated pre; host source nodes never enter our container.
   * @param {Element} content
   * @param {BlockRecord | null} record
   * @returns {Element | null}
   */
  function findExternalPre(content, record) {
    let pres
    try {
      pres = content.querySelectorAll('pre')
    } catch {
      return null
    }
    for (const pre of pres) {
      if (record && record.container && record.container.contains(pre)) continue
      return pre
    }
    return null
  }

  /** Hide/show the host source without changing its parent, text or children. */
  function setSourceHidden(record, hidden) {
    const pre = record.pre
    if (!pre) return
    try {
      if (hidden) {
        if (!record.hidingSource) record.previousHiddenAttribute = pre.getAttribute(SOURCE_HIDDEN_ATTR)
        pre.setAttribute(SOURCE_HIDDEN_ATTR, '')
        record.hidingSource = true
      } else if (record.hidingSource) {
        if (record.previousHiddenAttribute === null) pre.removeAttribute(SOURCE_HIDDEN_ATTR)
        else pre.setAttribute(SOURCE_HIDDEN_ATTR, record.previousHiddenAttribute)
        record.hidingSource = false
        record.previousHiddenAttribute = null
      }
    } catch {
      /* Host removal can race a scan; never move or recreate its source. */
    }
  }

  /** Remove only our DOM and restore only the source attribute we changed. */
  function destroyDiagramDom(record) {
    setSourceHidden(record, false)
    const handle = record.handle
    record.handle = null
    if (handle && typeof handle.destroy === 'function') {
      try { handle.destroy() } catch { /* engine cleanup is best effort */ }
    }
    for (const node of [record.container, record.errorNote]) {
      try { node?.remove() } catch { /* detached by host */ }
    }
    record.container = null
    record.host = null
    record.toolbar = null
    record.buttons = null
    record.errorNote = null
    record.view = 'diagram'
  }

  /** Forget plugin state without restoring any old host subtree. */
  function cleanupRecord(record) {
    if (!record) return
    destroyDiagramDom(record)
    record.status = 'pending'
  }

  /* ------------------------------ toolbar ------------------------------- */

  /**
   * @param {string} label
   * @param {() => void} onActivate
   * @returns {HTMLButtonElement}
   */
  function makeButton(label, onActivate) {
    const button = /** @type {HTMLButtonElement} */ (doc.createElement('button'))
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', (event) => {
      try {
        if (event && typeof event.preventDefault === 'function') event.preventDefault()
      } catch {
        /* ignore */
      }
      try {
        onActivate()
      } catch {
        /* never throw out of a UI handler */
      }
    })
    return button
  }

  /**
   * @param {BlockRecord} record
   * @returns {{ toolbar: Element, buttons: { diagram: HTMLButtonElement, source: HTMLButtonElement } }}
   */
  function buildToolbar(record) {
    const toolbar = doc.createElement('div')
    toolbar.className = classes.toolbar
    toolbar.setAttribute('role', 'group')
    toolbar.setAttribute('aria-label', labels.group)
    const diagramButton = makeButton(labels.diagram, () => showDiagram(record))
    const sourceButton = makeButton(labels.source, () => showSource(record))
    toolbar.appendChild(diagramButton)
    toolbar.appendChild(sourceButton)
    return { toolbar, buttons: { diagram: diagramButton, source: sourceButton } }
  }

  /**
   * @param {HTMLButtonElement | null | undefined} button
   * @param {boolean} pressed
   */
  function setPressed(button, pressed) {
    if (!button) return
    try {
      button.setAttribute('aria-pressed', pressed ? 'true' : 'false')
      if (classes.active) button.classList.toggle(classes.active, pressed)
    } catch {
      /* ignore */
    }
  }

  /** @param {BlockRecord} record */
  function updateToolbar(record) {
    const buttons = record.buttons
    if (!buttons) return
    const sourceView = record.view === 'source'
    record.container?.classList.toggle(classes.source, sourceView)
    setPressed(buttons.diagram, !sourceView)
    setPressed(buttons.source, sourceView)
  }

  /* ------------------------------- views -------------------------------- */

  /** @param {BlockRecord} record */
  function isMountedHealthy(record) {
    const { content, container, host, toolbar, pre } = record
    if (!content || !isLive(content, doc) || !pre || !content.contains(pre)) return false
    if (!container || container.parentNode !== content) return false
    if (!host || host.parentNode !== container || !toolbar || toolbar.parentNode !== container) return false
    return record.view === 'source'
      ? host.hidden === true && !record.hidingSource
      : host.hidden !== true && pre.hasAttribute(SOURCE_HIDDEN_ATTR)
  }

  /** @param {BlockRecord} record */
  function isErrorHealthy(record) {
    const { content, pre, errorNote } = record
    return !!(content && isLive(content, doc) && pre && content.contains(pre) &&
      errorNote && errorNote.parentNode === content)
  }

  /** @param {BlockRecord} record */
  function showSource(record) {
    if (destroyed || !record || record.status !== 'mounted') return
    if (!isMountedHealthy(record)) { scan(); return }
    setSourceHidden(record, false)
    record.host.hidden = true
    record.view = 'source'
    updateToolbar(record)
  }

  /** @param {BlockRecord} record */
  function showDiagram(record) {
    if (destroyed || !record || record.status !== 'mounted') return
    if (!isMountedHealthy(record)) { scan(); return }
    setSourceHidden(record, true)
    record.host.hidden = false
    record.view = 'diagram'
    updateToolbar(record)
  }

  /* -------------------------------- mount ------------------------------- */

  /**
   * Build the diagram/error state for `record.source`, destroying any previous
   * handle and our previous DOM first. The original source stays in place.
   * @param {BlockRecord} record
   */
  function mountRecord(record) {
    if (destroyed || !record) return
    const block = record.block
    if (!isElement(block) || !isLive(block, doc)) {
      cleanupRecord(record)
      records.delete(block)
      return
    }
    const content = isElement(record.content) && isLive(record.content, doc)
      ? record.content
      : safeQuery(block, CONTENT_SELECTOR)
    if (!content) {
      cleanupRecord(record)
      records.delete(block)
      return
    }
    record.content = content
    // A font-metric refresh must not throw the user out of the Source view.
    const previousView = record.view === 'source' ? 'source' : 'diagram'

    const pre = findExternalPre(content, record)
    destroyDiagramDom(record)
    if (!pre) {
      records.delete(block)
      return
    }
    record.pre = pre

    // Pele owns the inner host's innerHTML (`svg.pele` + zoom controls), so the
    // toolbar is a sibling in normal flow and survives Pele-internal re-renders.
    /** @type {Element} */
    let container
    /** @type {Element} */
    let host
    /** @type {Element} */
    let toolbar
    /** @type {{ diagram: HTMLButtonElement, source: HTMLButtonElement } | null} */
    let buttons = null
    try {
      container = doc.createElement('div')
      container.className = classes.diagram
      const built = buildToolbar(record)
      toolbar = built.toolbar
      buttons = built.buttons
      host = doc.createElement('div')
      // Internal mount target; not a public styling class.
      host.setAttribute('data-dsh-pele-mermaid-host', '')
      container.appendChild(toolbar)
      container.appendChild(host)
      // Insert our toolbar before the host source's top-level child; never
      // reparent the pre, including content > div > pre from static Shiki.
      let sourceRoot = pre
      while (sourceRoot.parentNode && sourceRoot.parentNode !== content) sourceRoot = sourceRoot.parentNode
      content.insertBefore(container, sourceRoot)
      record.container = container
      record.host = host
      record.toolbar = toolbar
      record.buttons = buttons
    } catch {
      // Extremely defensive: restore the source and leave the block untouched.
      destroyDiagramDom(record)
      return
    }

    let handle = null
    let thrown = null
    try {
      handle = mount(host, record.source)
    } catch (error) {
      thrown = error
    }

    const ok = thrown === null && !!handle && handle.ok !== false
    if (!ok) {
      const message =
        thrown !== null
          ? messageOf(thrown)
          : handle && typeof handle.error === 'string' && handle.error.trim() !== ''
            ? handle.error
            : FALLBACK_MOUNT_ERROR
      if (handle && typeof handle.destroy === 'function') {
        try {
          handle.destroy()
        } catch {
          /* ignore */
        }
      }
      destroyDiagramDom(record)
      showError(record, message)
      return
    }

    record.handle = /** @type {DiagramHandle} */ (handle)
    record.status = 'mounted'
    setSourceHidden(record, true)
    record.view = 'diagram'
    record.errorNote = null
    updateToolbar(record)
    if (previousView === 'source') showSource(record)
  }

  /**
   * Show the DSH source exactly as rendered plus a plain-text error note.
   * The record is kept so a later source change retries the mount.
   * @param {BlockRecord} record
   * @param {string} message
   */
  function showError(record, message) {
    const content = record.content
    if (!content || !record.pre) {
      record.status = 'error'
      return
    }
    try {
      const note = doc.createElement('div')
      note.className = classes.error
      // Plain text only: a diagram error must never inject HTML.
      note.textContent = errorPrefix + message
      content.appendChild(note)
      record.errorNote = note
    } catch {
      /* ignore */
    }
    record.status = 'error'
    record.view = 'diagram'
    record.handle = null
    record.container = null
    record.host = null
    record.toolbar = null
    record.buttons = null
  }

  /* ------------------------------- settle ------------------------------- */

  /**
   * @param {BlockRecord} record
   */
  function ensureSettleTimer(record) {
    if (destroyed || record.pendingTimer) return
    record.pendingTimer = true
    // Wait only the remaining part of the window; an early timer (source
    // changed after it was armed) re-arms for the remaining time in scan().
    let remaining = settleMs
    try {
      remaining = Math.max(0, settleMs - (now() - record.since))
    } catch {
      remaining = settleMs
    }
    try {
      schedule(() => {
        record.pendingTimer = false
        if (destroyed) return
        try {
          scan()
        } catch {
          /* never throw out of a timer */
        }
      }, remaining)
    } catch {
      record.pendingTimer = false
    }
  }

  /**
   * Mount once the settle window elapsed for the current source, else arm the
   * settle timer.
   * @param {BlockRecord} record
   */
  function progressPending(record) {
    if (destroyed || record.status !== 'pending') return
    let elapsed = 0
    try {
      elapsed = now() - record.since
    } catch {
      elapsed = 0
    }
    if (elapsed >= settleMs) {
      mountRecord(record)
      return
    }
    ensureSettleTimer(record)
  }

  /**
   * Reset a record to the settle gate with a new source (old DOM removed).
   * @param {BlockRecord} record
   * @param {string} source
   */
  function resetForSource(record, source) {
    destroyDiagramDom(record)
    record.source = source
    record.since = now()
    record.status = 'pending'
    record.view = 'diagram'
    progressPending(record)
  }

  /* ------------------------------ scanning ------------------------------ */

  /**
   * @param {BlockRecord} record
   * @param {string} source
   */
  function maintainMounted(record, source) {
    if (source !== record.source) {
      resetForSource(record, source)
      return
    }
    if (!isMountedHealthy(record)) {
      // React replaced (or dropped) our nodes without changing the source:
      // re-apply immediately instead of waiting for another settle window.
      mountRecord(record)
    }
  }

  /**
   * @param {BlockRecord} record
   * @param {string} source
   */
  function maintainError(record, source) {
    if (source !== record.source) {
      resetForSource(record, source)
      return
    }
    if (!isErrorHealthy(record)) {
      // React wiped the note and/or moved the <pre>: self-heal at once.
      mountRecord(record)
    }
  }

  /** @param {Element} block */
  function scanBlock(block) {
    let record = records.get(block) ?? null
    let settledSince = null
    let previousView = 'diagram'
    const content = safeQuery(block, CONTENT_SELECTOR)
    const pre = content ? findExternalPre(content, record) : null
    const facts = readFenceFacts(block)
    const source = facts.source
    // Explicit committed React language wins; an explicit DOM banner is the
    // fallback. Unknown language stays native, regardless of parseable source.
    if (!content || !pre || !facts.hasBanner || facts.lang !== MERMAID_LANG || source === null || source.trim() === '') {
      if (record) { cleanupRecord(record); records.delete(block) }
      return
    }
    if (record && (record.content !== content || record.pre !== pre)) {
      // React owns replacement/removal. Only remove our old additions; never
      // reinsert the old pre or flatten a newly highlighted subtree.
      if (record.source === source) { settledSince = record.since; previousView = record.view }
      cleanupRecord(record)
      records.delete(block)
      record = null
    }
    if (!record) {
      record = createRecord(block, content, pre, source)
      if (settledSince !== null) { record.since = settledSince; record.view = previousView }
      records.set(block, record)
      progressPending(record)
      return
    }
    if (record.status === 'pending') {
      if (source !== record.source) { record.source = source; record.since = now() }
      progressPending(record)
    } else if (record.status === 'mounted') {
      maintainMounted(record, source)
    } else if (record.status === 'error') {
      maintainError(record, source)
    }
  }

  /** Synchronous pass over every rendered code block. Never throws. */
  function scan() {
    if (destroyed || !doc || typeof doc.querySelectorAll !== 'function') return
    /** @type {NodeListOf<Element> | null} */
    let blocks = null
    try {
      blocks = doc.querySelectorAll(BLOCK_SELECTOR)
    } catch {
      return
    }
    const seen = new Set()
    try {
      for (const block of blocks) seen.add(block)
    } catch {
      return
    }
    // Retire records whose block left the page (React removed/recycled it).
    for (const [block, record] of Array.from(records)) {
      try {
        if (!seen.has(block) || !isLive(block, doc)) {
          cleanupRecord(record)
          records.delete(block)
        }
      } catch {
        /* keep scanning */
      }
    }
    for (const block of blocks) {
      try {
        scanBlock(block)
      } catch {
        /* never throw into React */
      }
    }
  }

  /**
   * Rebuild every mounted diagram with its current source.
   * This is the only path that rebuilds an unchanged diagram (font metrics
   * changed); colour/theme changes are pure CSS.
   */
  function refreshAll() {
    if (destroyed) return
    scan()
    for (const record of Array.from(records.values())) {
      if (record.status !== 'mounted') continue
      try {
        mountRecord(record)
      } catch {
        /* never throw into the theme listener */
      }
    }
  }

  /** Restore every block and release every handle. Idempotent. */
  function destroy() {
    if (destroyed) return
    destroyed = true
    for (const record of Array.from(records.values())) {
      try {
        cleanupRecord(record)
      } catch {
        /* keep restoring the rest */
      }
    }
    records.clear()
  }

  return {
    scan,
    refreshAll,
    destroy,
    get count() {
      if (destroyed) return 0
      let mounted = 0
      for (const record of records.values()) {
        if (record.status === 'mounted') mounted += 1
      }
      return mounted
    },
    /** Locale actually used for toolbar labels. */
    get locale() {
      return locale
    },
  }
}
