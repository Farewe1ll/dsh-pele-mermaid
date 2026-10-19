/**
 * dsh-pele-mermaid — Pele adapter.
 *
 * Mounts one Mermaid source into a caller-owned container with Pele and exposes
 * a tiny, stable handle to the block layer:
 *
 *   { ok, error, refresh(), destroy() }
 *
 * Design constraints (see docs/ARCH.md, "Browser-half contracts"):
 *  - Synchronous. Pele is synchronous and dependency-free.
 *  - Never throws for diagram content: a syntax/unsupported/limit error comes
 *    back as `{ ok: false, error: '<plain text>' }` and the container is left
 *    empty. The block layer decides how to show the source + the error note.
 *  - Engine-owned options only. Diagram authors never pass options through.
 *  - No `document` / `window` access at module import time; everything is
 *    resolved when `mountDiagram()` is called.
 *  - `refresh()` re-lays out in place (font/measurement change). Theme colors
 *    are pure CSS and must never reach this module.
 *  - `destroy()` is idempotent: it tears down Pele's observers/controls and
 *    clears the container exactly once.
 *
 * @typedef {Object} DiagramHandle
 * @property {boolean} ok          false when the source could not be drawn.
 * @property {string | null} error plain-text error message, null when ok.
 * @property {() => void} refresh  re-layout in place (fonts/width changed).
 * @property {() => void} destroy  stop observers, clear the container.
 */

import { mount } from 'pele'

/**
 * Pele display options used by {@link mountDiagram}. Frozen so no caller can
 * smuggle author-controlled options into the renderer.
 *
 * Images are disabled, including relative URLs, so diagrams cannot embed
 * image resources. Links retain Pele's filtering and require user activation.
 * Deliberately absent: `icons`, `sanitize`, `links` overrides,
 * `config`, `limit`, and any author-supplied style. Pele's built-in escaping,
 * link filtering, and size/edge limits stay at their defaults.
 *
 * @type {Readonly<{ zoom: true, autoDirection: true, responsive: true, images: false }>}
 */
export const DIAGRAM_OPTIONS = Object.freeze({
  zoom: true,
  autoDirection: true,
  responsive: true,
  images: false,
})

/** Fallback text when Pele reports a non-Error without a usable message. */
const DEFAULT_ERROR = 'Diagram could not be rendered.'

/** Plain-text message used when the caller passes something that is not an element. */
const INVALID_CONTAINER_ERROR = 'Diagram container is not a DOM element.'

/**
 * Duck-typed element check: works across realms (iframes, jsdom) without
 * touching a global `HTMLElement`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isElement(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    /** @type {{ nodeType?: unknown, appendChild?: unknown }} */ (value).nodeType === 1 &&
    typeof (/** @type {{ appendChild?: unknown }} */ (value).appendChild) === 'function'
  )
}

/**
 * Convert any thrown/reported value into a non-empty plain-text message.
 * Never returns HTML; callers assign it with `textContent`.
 *
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  if (typeof error === 'string') {
    return error.trim() === '' ? DEFAULT_ERROR : error
  }
  if (error !== null && typeof error === 'object') {
    const message = /** @type {{ message?: unknown }} */ (error).message
    if (typeof message === 'string' && message.trim() !== '') return message
    return DEFAULT_ERROR
  }
  if (error === undefined || error === null) return DEFAULT_ERROR
  try {
    const text = String(error)
    return text.trim() === '' ? DEFAULT_ERROR : text
  } catch {
    return DEFAULT_ERROR
  }
}

/**
 * Remove every child of the container, tolerating exotic/cross-realm elements.
 *
 * @param {Element} container
 */
function clearContainer(container) {
  if (!container) return
  try {
    if (typeof container.replaceChildren === 'function') {
      container.replaceChildren()
      return
    }
    while (container.firstChild !== null) {
      container.removeChild(container.firstChild)
    }
  } catch {
    // A container that cannot be cleared is still a valid failure result; the
    // block layer owns the surrounding DOM and will remove it.
  }
}

/**
 * Shared shape for a handle that never mounted anything.
 *
 * @param {string} error
 * @returns {DiagramHandle}
 */
function failedHandle(error) {
  return {
    ok: false,
    error,
    refresh() {
      // Nothing is mounted; refresh is a no-op (and never throws).
    },
    destroy() {
      // Nothing was mounted, so there is no Pele state to release and no DOM
      // we still own. A no-op here also means a stale failed handle can never
      // clear a diagram a later call mounted into the same container.
    },
  }
}

/**
 * Mount one Mermaid source into `container` with Pele.
 *
 * Synchronous; never throws for diagram errors (returns ok:false instead).
 * Options are engine-owned constants, never author-supplied.
 *
 * On success the container ends up with Pele's output (its `<svg class="pele">`
 * plus Pele's own zoom controls) and nothing else. Note: Pele writes the SVG
 * with `innerHTML`/`replaceChildren`, so callers must append any of their own
 * overlay UI *after* this call, and re-add it after a Pele-internal re-render
 * (the block layer's refresh path re-mounts instead of relying on that).
 *
 * @param {HTMLElement} container - caller-owned, already in the document.
 * @param {string} source - Mermaid source exactly as authored.
 * @returns {DiagramHandle}
 */
export function mountDiagram(container, source) {
  if (!isElement(container)) {
    return failedHandle(INVALID_CONTAINER_ERROR)
  }

  let text
  if (typeof source === 'string') {
    text = source
  } else if (source === undefined || source === null) {
    text = ''
  } else {
    try {
      text = String(source)
    } catch {
      text = ''
    }
  }

  /** @type {import('pele').Mounted | null} */
  let mounted = null
  try {
    mounted = mount(container, text, DIAGRAM_OPTIONS)
  } catch (error) {
    // A Pele parse/render failure is normally captured in `mounted.error`; this
    // guard is for environment failures (detached document, missing matcher,
    // future Pele behavior). Either way: no throw, empty container, plain text.
    clearContainer(container)
    return failedHandle(messageOf(error))
  }

  // Pele reports initial parse failures on the handle instead of throwing, and
  // can still return a handle when it could not produce an SVG.
  const reportedError =
    mounted === null || mounted === undefined
      ? DEFAULT_ERROR
      : mounted.error !== undefined && mounted.error !== null
        ? mounted.error
        : mounted.result === undefined || mounted.result === null
          ? DEFAULT_ERROR
          : null

  if (reportedError !== null) {
    if (mounted) {
      try {
        mounted.destroy()
      } catch {
        // Best-effort teardown of a handle that never rendered.
      }
    }
    clearContainer(container)
    return failedHandle(messageOf(reportedError))
  }

  /** @type {import('pele').Mounted | null} */
  const active = mounted
  let disposed = false

  return {
    ok: true,
    error: null,

    refresh() {
      if (disposed) return
      try {
        active.refresh()
      } catch {
        // Keep the last good render rather than throwing into the host. Pele
        // re-renders lazily and owns its own retry/error state.
      }
    },

    destroy() {
      if (disposed) return
      disposed = true
      try {
        active.destroy()
      } catch {
        // Observers/controls may already be gone (React wiped the subtree);
        // teardown must stay idempotent and quiet.
      }
      clearContainer(container)
    },
  }
}
