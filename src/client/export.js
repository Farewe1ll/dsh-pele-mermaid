/**
 * dsh-pele-mermaid — standalone SVG export.
 *
 * Turns Pele's *pristine* render result (`Mounted.result.svg`) into a portable
 * `.svg` file:
 *
 *  - the natural-size `width`/`height` and `viewBox` are restored, so an inline
 *    zoom/pan state can never crop the exported diagram;
 *  - the resolved `--pele-*` theme variables are written onto the root element,
 *    so the file keeps the current DSH colors outside the app;
 *  - the clone is sanitized (no scripts, event-handler attributes,
 *    `foreignObject`, or external image/asset references) before serialization.
 *
 * No network access, no renderer re-run, and no author-controlled options.
 *
 * @module dsh-pele-mermaid/export
 */
import { PELE_VARIABLE_NAMES } from './theme-css.js'

/** SVG namespace used by the exported root. */
const SVG_NS = 'http://www.w3.org/2000/svg'

/** Hard cap on exported markup; Pele's own output limits are well below this. */
const MAX_SVG_LENGTH = 4_000_000

/** Elements that must never reach an exported file. */
const FORBIDDEN_ELEMENTS = Object.freeze(new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'image',
  'audio',
  'video',
]))

/** External schemes that stay clickable in an exported file. */
const SAFE_LINK_SCHEME = /^(?:https?:|mailto:|tel:)/i

/** Unsafe style/CSS payload markers. */
const UNSAFE_STYLE = /(?:expression\s*\(|javascript:|vbscript:|@import)/i
/** `url(...)` is only safe when it targets an in-document fragment. */
const NON_LOCAL_URL = /url\(\s*['"]?(?!#)/i

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function positiveNumber(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

/**
 * @param {Document | null | undefined} doc
 * @returns {DOMWindow | null}
 */
export function viewOf(doc) {
  try {
    return doc && doc.defaultView ? doc.defaultView : null
  } catch {
    return null
  }
}

/**
 * Read the current `--pele-*` theme variables from the inline diagram card.
 * Computed style wins (it resolves DSH token chains); the element's inline
 * style is the fallback for environments that do not expose custom properties
 * through `getComputedStyle` (for example jsdom in tests).
 *
 * @param {Element | null | undefined} container
 * @param {DOMWindow | null | undefined} view
 * @returns {Record<string, string>}
 */
export function collectThemeVariables(container, view) {
  /** @type {Record<string, string>} */
  const variables = {}
  if (!container || typeof container !== 'object') return variables
  /** @type {CSSStyleDeclaration | null} */
  let computed = null
  try {
    if (view && typeof view.getComputedStyle === 'function') {
      computed = view.getComputedStyle(container)
    }
  } catch {
    computed = null
  }
  for (const name of PELE_VARIABLE_NAMES) {
    let value = ''
    try {
      if (computed) value = String(computed.getPropertyValue(name) || '').trim()
    } catch {
      value = ''
    }
    if (value === '') {
      try {
        const inline = container.style
        if (inline && typeof inline.getPropertyValue === 'function') {
          value = String(inline.getPropertyValue(name) || '').trim()
        }
      } catch {
        value = ''
      }
    }
    // A CSS value with structural characters or an external URL is not allowed
    // into the serialized attribute; the SVG's own fallbacks take over then.
    if (value !== '' && !/[;{}<>]|url\(\s*['"]?(?!#)/i.test(value)) variables[name] = value
  }
  return variables
}

/**
 * @param {string | null | undefined} href
 * @param {string} tag
 * @returns {boolean}
 */
function isSafeHref(href, tag) {
  const value = String(href ?? '').trim()
  if (value === '') return true
  if (value.startsWith('#')) return true
  if (tag === 'use') return false
  return SAFE_LINK_SCHEME.test(value)
}

/**
 * Remove active content and external references from a parsed SVG tree.
 *
 * @param {Element} root
 */
function sanitizeTree(root) {
  /** @type {Element[]} */
  const elements = [root]
  try {
    elements.push(...Array.from(root.querySelectorAll('*')))
  } catch {
    // A tree without querySelectorAll is still worth sanitizing at the root.
  }
  for (const element of elements) {
    let tag = ''
    try {
      tag = String(element.localName || element.tagName || '').toLowerCase()
    } catch {
      tag = ''
    }
    if (tag !== 'svg' && FORBIDDEN_ELEMENTS.has(tag)) {
      try {
        element.remove()
      } catch {
        // Parent may already be gone; the element removes with it.
      }
      continue
    }
    let attributes
    try {
      attributes = Array.from(element.attributes ?? [])
    } catch {
      continue
    }
    for (const attribute of attributes) {
      const name = String(attribute.name || '').toLowerCase()
      const value = String(attribute.value ?? '')
      try {
        if (name.startsWith('on')) {
          element.removeAttribute(attribute.name)
        } else if (name === 'href' || name === 'xlink:href') {
          if (!isSafeHref(value, tag)) element.removeAttribute(attribute.name)
        } else if (name === 'src') {
          element.removeAttribute(attribute.name)
        } else if (name === 'style') {
          if (UNSAFE_STYLE.test(value) || NON_LOCAL_URL.test(value)) element.removeAttribute(attribute.name)
        }
      } catch {
        // Best effort: a hostile tree must never throw out of export.
      }
    }
  }
}

/**
 * Append resolved theme variables to the root element's `style` attribute,
 * preserving Pele's own inline style declarations.
 *
 * @param {Element} root
 * @param {Record<string, string>} variables
 */
function applyThemeVariables(root, variables) {
  const names = Object.keys(variables)
  if (names.length === 0) return
  let existing = ''
  try {
    existing = String(root.getAttribute('style') || '').trim()
  } catch {
    existing = ''
  }
  const suffix = names.map((name) => `${name}: ${variables[name]}`).join('; ')
  const style = existing === '' ? suffix : `${existing.replace(/;\s*$/, '')}; ${suffix}`
  try {
    root.setAttribute('style', style)
  } catch {
    // A root that rejects attributes is simply not styled further.
  }
}

/**
 * Build one standalone SVG document from a pristine engine snapshot.
 *
 * @param {{ svg?: unknown, width?: unknown, height?: unknown, type?: unknown } | null | undefined} snapshot
 * @param {Object} [options]
 * @param {Document} [options.document]
 * @param {DOMWindow} [options.view]
 * @param {Element | null} [options.container] inline diagram card for theme vars
 * @returns {string | null} serialized SVG, or null when it cannot be exported
 */
export function buildExportSvg(snapshot, options = {}) {
  try {
    if (!snapshot || typeof snapshot !== 'object') return null
    const text = typeof snapshot.svg === 'string' ? snapshot.svg.trim() : ''
    if (text === '' || text.length > MAX_SVG_LENGTH) return null
    const doc = options?.document ?? (typeof document !== 'undefined' ? document : null)
    const view = options?.view ?? viewOf(doc)
    const Parser = view?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null)
    const Serializer = view?.XMLSerializer ?? (typeof XMLSerializer !== 'undefined' ? XMLSerializer : null)
    if (!doc || typeof Parser !== 'function' || typeof Serializer !== 'function') return null

    const parsed = new Parser().parseFromString(text, 'image/svg+xml')
    const root = parsed?.documentElement ?? null
    if (!root || String(root.localName || '').toLowerCase() !== 'svg') return null
    if (typeof parsed.querySelector === 'function' && parsed.querySelector('parsererror') !== null) return null

    sanitizeTree(root)

    // Natural size and the full-diagram viewBox always win over an inline
    // zoom/pan state: exporting must never crop the diagram.
    const width = positiveNumber(snapshot.width) ?? positiveNumber(root.getAttribute('width'))
    const height = positiveNumber(snapshot.height) ?? positiveNumber(root.getAttribute('height'))
    if (width !== null && height !== null) {
      root.setAttribute('width', String(width))
      root.setAttribute('height', String(height))
      root.setAttribute('viewBox', `0 0 ${width} ${height}`)
    } else if (root.getAttribute('viewBox') === null) {
      return null
    }
    if (root.getAttribute('xmlns') === null) root.setAttribute('xmlns', SVG_NS)

    applyThemeVariables(root, collectThemeVariables(options?.container, view))
    return new Serializer().serializeToString(parsed)
  } catch {
    return null
  }
}

/**
 * Local timestamp `YYYYMMDD-HHmmss`.
 * @param {Date} date
 * @returns {string}
 */
function timestamp(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/**
 * `pele-<type>-YYYYMMDD-HHmmss.svg`; the type is reduced to filename-safe
 * characters and falls back to `diagram`.
 *
 * @param {unknown} type
 * @param {Date} [date]
 * @returns {string}
 */
export function exportFilename(type, date = new Date()) {
  const safe = String(type ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `pele-${safe || 'diagram'}-${timestamp(date instanceof Date ? date : new Date())}.svg`
}

/**
 * Offer one SVG string as a file download and revoke the object URL afterwards.
 *
 * @param {string} svgText
 * @param {string} filename
 * @param {Object} [options]
 * @param {Document} [options.document]
 * @param {DOMWindow} [options.view]
 * @param {typeof URL | { createObjectURL?: Function, revokeObjectURL?: Function }} [options.url]
 * @returns {boolean} whether a download was dispatched
 */
export function downloadSvg(svgText, filename, options = {}) {
  try {
    if (typeof svgText !== 'string' || svgText === '' || typeof filename !== 'string' || filename === '') return false
    const doc = options?.document ?? (typeof document !== 'undefined' ? document : null)
    const view = options?.view ?? viewOf(doc)
    const BlobCtor = view?.Blob ?? (typeof Blob !== 'undefined' ? Blob : null)
    const UrlApi = options?.url ?? view?.URL ?? (typeof URL !== 'undefined' ? URL : null)
    if (!doc || typeof BlobCtor !== 'function' || !UrlApi || typeof UrlApi.createObjectURL !== 'function') return false
    const objectUrl = UrlApi.createObjectURL(new BlobCtor([svgText], { type: 'image/svg+xml;charset=utf-8' }))
    if (typeof objectUrl !== 'string' || objectUrl === '') return false
    const anchor = doc.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    const parent = doc.body ?? doc.documentElement
    if (!parent) return false
    parent.appendChild(anchor)
    anchor.click()
    anchor.remove()
    const revoke = () => {
      try {
        UrlApi.revokeObjectURL(objectUrl)
      } catch {
        // Nothing else to release if the browser already dropped it.
      }
    }
    if (view && typeof view.setTimeout === 'function') view.setTimeout(revoke, 0)
    else revoke()
    return true
  } catch {
    return false
  }
}
