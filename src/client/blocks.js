/**
 * dsh-pele-mermaid — Mermaid code-block manager.
 *
 * Detects settled ` ```mermaid ` fences in the rendered DSH Markdown DOM,
 * mounts a Pele diagram inside `[data-code-block-content]`, keeps the original
 * `<pre>` as the source artifact, and restores the page to its pre-plugin DOM
 * on destroy.
 *
 * Contracts (docs/ARCH.md § `src/client/blocks.js`):
 *  - `scan()` is synchronous and idempotent; it is also the settle-timer
 *    callback, so calling it from an external debounce is expected.
 *  - Nothing here may throw into React: every DOM operation is defensive and
 *    `scan()` swallows failures.
 *  - We never touch the DSH code-block banner (its Copy button keeps working
 *    because CodeBlock falls back to its `source` prop when no `<pre>` exists).
 *  - Pele is NOT imported here directly; `mountDiagram` is injected (defaults
 *    to the engine adapter) so the DOM layer stays testable and swappable.
 *
 * @module dsh-pele-mermaid/blocks
 */

import { CLASS as THEME_CLASS } from './theme-css.js'
import { mountDiagram as engineMountDiagram } from './engine.js'

/** Language tag of the fenced blocks this plugin owns. */
export const MERMAID_LANG = 'mermaid'

/** Stable DSH hooks (hashed CSS-module classes are never used). */
const BLOCK_SELECTOR = '.md-code-block'
const BANNER_SELECTOR = '[data-code-block-banner]'
const CONTENT_SELECTOR = '[data-code-block-content]'

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
 * @param {Node} parent
 * @param {Node} node
 * @returns {number} child index, or -1
 */
function indexInParent(parent, node) {
  try {
    return Array.prototype.indexOf.call(parent.childNodes, node)
  } catch {
    return -1
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
 * Read the settled fence language from a CodeBlock banner, lowercased.
 *
 * The banner can be either the plain infostring banner or the card-toolbar
 * shape, so the banner is cloned and interactive chrome (buttons, SVG icons,
 * aria-hidden icon wrappers) is stripped before reading the remaining text.
 *
 * @param {Element | null | undefined} block - a `.md-code-block` element
 * @returns {string | null} lowercased language tag, or null when unreadable
 */
export function readFenceLanguage(block) {
  if (!isElement(block)) return null
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
  return token ? token.toLowerCase() : null
}

/**
 * Read the fence source from the settled code-block content, or null.
 *
 * The raw `textContent` is returned unchanged (Pele owns source semantics);
 * callers only trim for the blank-source check.
 *
 * @param {Element | null | undefined} block - a `.md-code-block` element
 * @returns {string | null}
 */
export function readFenceSource(block) {
  if (!isElement(block)) return null
  const content = safeQuery(block, CONTENT_SELECTOR)
  if (!content) return null
  const pre = safeQuery(content, 'pre')
  if (!pre) return null
  return textOf(pre)
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
 * @property {number} originalIndex          pre position inside content
 * @property {string} source                 last observed source
 * @property {number} since                  now() when `source` last changed
 * @property {boolean} pendingTimer
 * @property {'pending'|'mounted'|'error'} status
 * @property {DiagramHandle | null} handle
 * @property {Element | null} container
 * @property {Element | null} host      Pele mount target (sibling of the toolbar)
 * @property {Element | null} toolbar
 * @property {{ diagram: HTMLButtonElement, source: HTMLButtonElement } | null} buttons
 * @property {Element | null} sourceWrapper
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
    const index = indexInParent(content, pre)
    return {
      block,
      content,
      pre,
      originalIndex: index >= 0 ? index : content.childNodes.length,
      source,
      since: now(),
      pendingTimer: false,
      status: 'pending',
      handle: null,
      container: null,
      host: null,
      toolbar: null,
      buttons: null,
      sourceWrapper: null,
      errorNote: null,
      view: 'diagram',
    }
  }

  /**
   * First `<pre>` in `content` that we do not own (i.e. React rendered it).
   * A `<pre>` inside our container (source view) belongs to us and is skipped.
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

  /**
   * Latest observable source for a record: a React-rendered `<pre>` wins,
   * otherwise our detached source artifact (React may patch that detached node
   * directly when it re-renders text without replacing the tree).
   * @param {BlockRecord | null} record
   * @param {Element | null} externalPre
   * @returns {string | null}
   */
  function observedSource(record, externalPre) {
    if (externalPre) return textOf(externalPre)
    if (record && record.pre) return textOf(record.pre)
    return null
  }

  /**
   * Put the source artifact back exactly where DSH rendered it.
   * @param {BlockRecord} record
   * @returns {boolean}
   */
  function restorePre(record) {
    const content = record.content
    const pre = record.pre
    if (!content || !pre) return false
    try {
      if (pre.parentNode) pre.parentNode.removeChild(pre)
      const index = record.originalIndex
      const reference = content.childNodes[index] ?? null
      content.insertBefore(pre, reference)
      return true
    } catch {
      return false
    }
  }

  /**
   * Remove every node we inserted (toolbar/container/error/source view) and
   * destroy the Pele handle. Never touches the DSH banner.
   *
   * Order matters: the engine's `destroy()` clears the diagram container, so
   * the source artifact is detached first.
   *
   * @param {BlockRecord} record
   * @param {{ restorePre?: boolean }} [opts]
   */
  function destroyDiagramDom(record, opts = {}) {
    const container = record.container
    const wrapper = record.sourceWrapper
    // Detach the artifact before destroying the engine container/wrapper.
    if (record.pre && record.pre.parentNode) {
      const parent = record.pre.parentNode
      if (parent === wrapper || (container && container.contains(record.pre))) {
        try {
          parent.removeChild(record.pre)
        } catch {
          /* ignore */
        }
      }
    }
    const handle = record.handle
    record.handle = null
    if (handle && typeof handle.destroy === 'function') {
      try {
        handle.destroy()
      } catch {
        /* defensive: engine bugs must not leak */
      }
    }
    record.container = null
    record.host = null
    record.toolbar = null
    record.buttons = null
    record.sourceWrapper = null
    if (wrapper && wrapper.parentNode) {
      try {
        wrapper.parentNode.removeChild(wrapper)
      } catch {
        /* ignore */
      }
    }
    if (container && container.parentNode) {
      try {
        container.parentNode.removeChild(container)
      } catch {
        /* ignore */
      }
    }
    if (record.errorNote && record.errorNote.parentNode) {
      try {
        record.errorNote.parentNode.removeChild(record.errorNote)
      } catch {
        /* ignore */
      }
    }
    record.errorNote = null
    record.view = 'diagram'
    if (opts.restorePre) restorePre(record)
  }

  /**
   * Restore a record's DOM and forget it. Pending records never touched the
   * DOM, so they are dropped without moving the `<pre>` (exact round-trip).
   * @param {BlockRecord} record
   */
  function cleanupRecord(record) {
    if (!record) return
    if (record.status === 'pending') {
      record.handle = null
      record.container = null
      record.errorNote = null
      record.sourceWrapper = null
      record.view = 'diagram'
      return
    }
    destroyDiagramDom(record, { restorePre: true })
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
    setPressed(buttons.diagram, !sourceView)
    setPressed(buttons.source, sourceView)
  }

  /* ------------------------------- views -------------------------------- */

  /** @param {BlockRecord} record */
  function isMountedHealthy(record) {
    const { content, container, host, toolbar, sourceWrapper, pre } = record
    if (!content || !isLive(content, doc)) return false
    if (!container || !isLive(container, doc) || !content.contains(container)) return false
    if (!host || !isLive(host, doc) || !container.contains(host)) return false
    if (!toolbar || !isLive(toolbar, doc) || !container.contains(toolbar)) return false
    if (record.view === 'source') {
      return !!(
        sourceWrapper &&
        isLive(sourceWrapper, doc) &&
        content.contains(sourceWrapper) &&
        pre &&
        sourceWrapper.contains(pre) &&
        host.hidden === true
      )
    }
    // Diagram view: the source artifact must be detached from the content.
    if (host.hidden === true) return false
    return !pre || !content.contains(pre)
  }

  /** @param {BlockRecord} record */
  function isErrorHealthy(record) {
    const { content, pre, errorNote } = record
    if (!content || !isLive(content, doc)) return false
    if (!pre || !content.contains(pre)) return false
    return !!(errorNote && isLive(errorNote, doc) && content.contains(errorNote))
  }

  /** @param {BlockRecord} record */
  function showSource(record) {
    if (destroyed || !record || record.status !== 'mounted') return
    if (!isMountedHealthy(record)) {
      mountRecord(record)
      return
    }
    if (record.view === 'source') return
    try {
      const wrapper = doc.createElement('div')
      wrapper.className = classes.source
      wrapper.appendChild(record.pre)
      record.content.appendChild(wrapper)
      record.sourceWrapper = wrapper
      // Hide the Pele host, keep our toolbar visible so the user can toggle back.
      record.host.hidden = true
      record.view = 'source'
      updateToolbar(record)
    } catch {
      /* ignore */
    }
  }

  /** @param {BlockRecord} record */
  function showDiagram(record) {
    if (destroyed || !record || record.status !== 'mounted') return
    if (record.view !== 'source') return
    try {
      const wrapper = record.sourceWrapper
      if (wrapper) {
        if (record.pre && record.pre.parentNode === wrapper) wrapper.removeChild(record.pre)
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
      }
      record.sourceWrapper = null
      if (record.host) record.host.hidden = false
      record.view = 'diagram'
      updateToolbar(record)
    } catch {
      /* ignore */
    }
  }

  /* -------------------------------- mount ------------------------------- */

  /**
   * Build the diagram/error state for `record.source`, destroying any previous
   * handle and our previous DOM first. The source artifact is detached from the
   * content only while a diagram is mounted.
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

    // A React replacement may have re-rendered the <pre>; adopt its node.
    const externalPre = findExternalPre(content, record)
    if (externalPre && externalPre !== record.pre) {
      if (record.pre && record.pre !== externalPre && record.pre.parentNode) {
        try {
          record.pre.parentNode.removeChild(record.pre)
        } catch {
          /* ignore */
        }
      }
      record.pre = externalPre
    }

    // Drop previous diagram/error DOM, then make sure the artifact is detached
    // from the content exactly once before mounting.
    destroyDiagramDom(record, { restorePre: false })
    const pre = record.pre
    if (!pre) {
      records.delete(block)
      return
    }
    if (pre.parentNode === content) {
      const index = indexInParent(content, pre)
      if (index >= 0) record.originalIndex = index
      try {
        content.removeChild(pre)
      } catch {
        /* ignore */
      }
    } else if (pre.parentNode) {
      try {
        pre.parentNode.removeChild(pre)
      } catch {
        /* ignore */
      }
    }

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
      content.appendChild(container)
      record.container = container
      record.host = host
      record.toolbar = toolbar
      record.buttons = buttons
    } catch {
      // Extremely defensive: restore the source and leave the block untouched.
      destroyDiagramDom(record, { restorePre: true })
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
      destroyDiagramDom(record, { restorePre: true })
      showError(record, message)
      return
    }

    record.handle = /** @type {DiagramHandle} */ (handle)
    record.status = 'mounted'
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
    if (record.pre.parentNode !== content || indexInParent(content, record.pre) !== record.originalIndex) {
      restorePre(record)
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
    record.sourceWrapper = null
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
    const content = record.content
    const external = content ? findExternalPre(content, record) : null
    destroyDiagramDom(record, { restorePre: false })
    if (external) {
      if (record.pre && record.pre !== external && record.pre.parentNode) {
        try {
          record.pre.parentNode.removeChild(record.pre)
        } catch {
          /* ignore */
        }
      }
      record.pre = external
      if (content) record.originalIndex = Math.max(0, indexInParent(content, external))
    } else if (content && record.pre) {
      // Put the kept artifact back while we wait so the page shows source.
      restorePre(record)
    }
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

  /**
   * @param {Element} block
   */
  function scanBlock(block) {
    const record = records.get(block) ?? null
    const content = safeQuery(block, CONTENT_SELECTOR)
    const language = readFenceLanguage(block)

    if (language !== MERMAID_LANG || !content) {
      if (record) {
        cleanupRecord(record)
        records.delete(block)
      }
      return
    }
    if (record) record.content = /** @type {Element} */ (content)

    const externalPre = findExternalPre(/** @type {Element} */ (content), record)
    const source = observedSource(record, externalPre)
    if (source === null || source.trim() === '') {
      if (record) {
        cleanupRecord(record)
        records.delete(block)
      }
      return
    }

    if (!record) {
      const fresh = createRecord(block, /** @type {Element} */ (content), /** @type {Element} */ (externalPre), source)
      records.set(block, fresh)
      progressPending(fresh)
      return
    }

    if (externalPre && externalPre !== record.pre) record.pre = externalPre

    if (record.status === 'pending') {
      if (source !== record.source) {
        record.source = source
        record.since = now()
        if (externalPre) record.originalIndex = Math.max(0, indexInParent(/** @type {Element} */ (content), externalPre))
      }
      progressPending(record)
      return
    }
    if (record.status === 'mounted') {
      maintainMounted(record, source)
      return
    }
    if (record.status === 'error') {
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
