/**
 * dsh-pele-mermaid — fullscreen diagram viewer.
 *
 * A single reusable overlay dialog that reuses the *pristine* SVG produced by
 * the engine (it never re-runs Pele and never reparents the inline DOM):
 *
 *  - opens at the inline zoom factor, then supports wheel/button zoom and drag
 *    panning inside a fixed-aspect stage (viewBox cropping keeps vectors crisp);
 *  - locks background scrolling, traps Tab focus, closes on Escape/backdrop and
 *    restores focus + scroll position;
 *  - removes every listener, observer-owned node and scroll lock on close and on
 *    plugin teardown. Opening twice can never leave a second overlay behind.
 *
 * @module dsh-pele-mermaid/viewer
 */
import { CLASS } from './theme-css.js'
import { createIcon } from './icons.js'

/** Stage inner padding (px); mirrors the stylesheet. */
const STAGE_PADDING = 16

/** Zoom bounds relative to the fit-to-window view. */
const MIN_SCALE = 1
const MAX_SCALE = 8

/** One wheel/button zoom step. */
const ZOOM_STEP = 1.25

/** Keyboard pan step in screen pixels. */
const PAN_STEP = 48

/** Localized viewer chrome. */
const VIEWER_LABELS = Object.freeze({
  zh: Object.freeze({
    dialog: '图表查看器',
    controls: '查看器操作',
    close: '关闭查看器',
    zoomIn: '放大',
    zoomOut: '缩小',
    fit: '适应窗口',
  }),
  en: Object.freeze({
    dialog: 'Diagram viewer',
    controls: 'Viewer controls',
    close: 'Close viewer',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit to window',
  }),
})

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
 * @param {unknown} value
 * @returns {number | null}
 */
function positive(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Contain one aspect ratio inside a box (letterboxing).
 * @param {number} width
 * @param {number} height
 * @param {number} maxWidth
 * @param {number} maxHeight
 * @returns {{ width: number, height: number }}
 */
function contain(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height)
  return { width: width * scale, height: height * scale }
}

/** @param {number} value */
function cssPixels(value) {
  return `${Math.round(value * 1000) / 1000}px`
}

/** @param {number} value */
function svgNumber(value) {
  return String(Math.round(value * 1000) / 1000)
}

/**
 * Create one reusable viewer. DOM access happens only inside `open()`.
 *
 * @param {Object} [options]
 * @param {Document} [options.document]
 * @param {DOMWindow} [options.view]
 * @param {string} [options.locale] `zh`/`en`, defaults to `navigator.language`
 * @param {(stage: Element) => { width: number, height: number }} [options.measureStage]
 *   test seam; defaults to the stage's layout box minus padding
 * @param {number} [options.maxScale]
 * @returns {{ open: (params?: Object) => boolean, close: () => void, destroy: () => void,
 *   isOpen: boolean, scale: number, zoomIn: () => void, zoomOut: () => void, fit: () => void }}
 */
export function createViewer(options = {}) {
  const opts = options ?? {}
  const doc =
    opts.document && typeof opts.document === 'object'
      ? opts.document
      : typeof document !== 'undefined'
        ? document
        : null
  const view =
    opts.view ??
    (() => {
      try {
        return doc ? doc.defaultView : null
      } catch {
        return null
      }
    })()
  const labels = VIEWER_LABELS[resolveLocale(opts.locale)]
  const maxScale = positive(opts.maxScale) ?? MAX_SCALE
  const measureStage =
    typeof opts.measureStage === 'function'
      ? opts.measureStage
      : /** @param {Element} stage */ (stage) => {
          try {
            const rect = stage.getBoundingClientRect()
            const width = (rect && rect.width > 0 ? rect.width : stage.clientWidth) - STAGE_PADDING * 2
            const height = (rect && rect.height > 0 ? rect.height : stage.clientHeight) - STAGE_PADDING * 2
            if (width > 0 && height > 0) return { width, height }
          } catch {
            /* fall through to the natural-size box */
          }
          return { width: 0, height: 0 }
        }

  let destroyed = false
  /**
   * @type {null | {
   *   root: Element, backdrop: Element, dialog: Element, stage: Element, canvas: Element, svg: SVGElement,
   *   width: number, height: number, scale: number, x: number, y: number,
   *   box: { width: number, height: number }, panning: null | { id: number, x: number, y: number, startX: number, startY: number },
   *   buttons: { zoomOut: HTMLButtonElement, zoomIn: HTMLButtonElement, fit: HTMLButtonElement, close: HTMLButtonElement },
   *   saved: { focus: Element | null, bodyOverflow: string, htmlOverflow: string | null, scrollX: number, scrollY: number },
   *   listeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions | undefined]>,
   *   onClose: null | (() => void), closed: boolean
   * }}
   */
  let state = null

  /**
   * @param {string} label
   * @param {string} icon
   * @param {() => void} onActivate
   * @returns {HTMLButtonElement}
   */
  function makeIconButton(label, icon, onActivate) {
    const button = /** @type {HTMLButtonElement} */ (doc.createElement('button'))
    button.type = 'button'
    button.setAttribute('aria-label', label)
    button.title = label
    button.appendChild(createIcon(doc, icon))
    button.addEventListener('click', (event) => {
      try {
        event.preventDefault()
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

  /** @param {EventTarget} target @param {string} type @param {EventListener} handler @param {AddEventListenerOptions | undefined} listenerOptions */
  function listen(target, type, handler, listenerOptions) {
    if (!state) return
    try {
      target.addEventListener(type, handler, listenerOptions)
      state.listeners.push([target, type, handler, listenerOptions])
    } catch {
      /* a target that refuses listeners simply has no extra input */
    }
  }

  /** Recompute the displayed box for the current stage size. */
  function layout() {
    if (!state) return
    const available = measureStage(state.stage)
    let box
    if (available.width > 0 && available.height > 0) {
      box = contain(state.width, state.height, available.width, available.height)
    } else {
      box = { width: state.width, height: state.height }
    }
    state.box = box
    try {
      if (state.canvas) {
        state.canvas.style.width = cssPixels(box.width)
        state.canvas.style.height = cssPixels(box.height)
      }
      state.svg.style.width = cssPixels(box.width)
      state.svg.style.height = cssPixels(box.height)
    } catch {
      /* inline sizing is an optimization only */
    }
    applyScale()
  }

  /** Write the cropped viewBox and refresh button states. */
  function applyScale() {
    if (!state) return
    const viewWidth = state.width / state.scale
    const viewHeight = state.height / state.scale
    state.x = clamp(state.x, 0, Math.max(0, state.width - viewWidth))
    state.y = clamp(state.y, 0, Math.max(0, state.height - viewHeight))
    try {
      state.svg.setAttribute('viewBox', `${svgNumber(state.x)} ${svgNumber(state.y)} ${svgNumber(viewWidth)} ${svgNumber(viewHeight)}`)
    } catch {
      /* ignore */
    }
    if (state.buttons) {
      state.buttons.zoomOut.disabled = state.scale <= MIN_SCALE + 1e-6
      state.buttons.zoomIn.disabled = state.scale >= maxScale - 1e-6
    }
  }

  /**
   * @param {number} nextScale
   * @param {{ px: number, py: number } | null} anchor stage-local anchor
   */
  function setScale(nextScale, anchor) {
    if (!state) return
    const scale = clamp(nextScale, MIN_SCALE, maxScale)
    if (state.box.width <= 0 || state.box.height <= 0) {
      state.scale = scale
      applyScale()
      return
    }
    const oldViewWidth = state.width / state.scale
    const oldViewHeight = state.height / state.scale
    const px = anchor ? clamp(anchor.px, 0, state.box.width) : state.box.width / 2
    const py = anchor ? clamp(anchor.py, 0, state.box.height) : state.box.height / 2
    const pointX = state.x + (px / state.box.width) * oldViewWidth
    const pointY = state.y + (py / state.box.height) * oldViewHeight
    state.scale = scale
    const nextViewWidth = state.width / scale
    const nextViewHeight = state.height / scale
    state.x = pointX - (px / state.box.width) * nextViewWidth
    state.y = pointY - (py / state.box.height) * nextViewHeight
    applyScale()
  }

  /**
   * Convert client coordinates into stage-local coordinates.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ px: number, py: number }}
   */
  function stagePoint(clientX, clientY) {
    /** @type {{ left: number, top: number, width: number, height: number } | null} */
    let rect = null
    try {
      rect = state.svg.getBoundingClientRect()
    } catch {
      rect = null
    }
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) {
      try {
        rect = state.stage.getBoundingClientRect()
      } catch {
        rect = null
      }
    }
    const left = rect && Number.isFinite(rect.left) ? rect.left : 0
    const top = rect && Number.isFinite(rect.top) ? rect.top : 0
    const width = rect && rect.width > 0 ? rect.width : state.box.width
    const height = rect && rect.height > 0 ? rect.height : state.box.height
    return {
      px: width > 0 ? clamp(clientX - left, 0, state.box.width) : 0,
      py: height > 0 ? clamp(clientY - top, 0, state.box.height) : 0,
    }
  }

  /** @param {number} clientX @param {number} clientY @param {number} factor */
  function zoomAt(clientX, clientY, factor) {
    if (!state) return
    setScale(state.scale * factor, stagePoint(clientX, clientY))
  }

  /** @param {number} dx @param {number} dy screen-pixel delta */
  function panBy(dx, dy) {
    if (!state || state.box.width <= 0 || state.box.height <= 0) return
    const viewWidth = state.width / state.scale
    const viewHeight = state.height / state.scale
    state.x -= (dx * viewWidth) / state.box.width
    state.y -= (dy * viewHeight) / state.box.height
    applyScale()
  }

  function zoomIn() {
    if (!state) return
    setScale(state.scale * ZOOM_STEP, null)
  }

  function zoomOut() {
    if (!state) return
    setScale(state.scale / ZOOM_STEP, null)
  }

  function fit() {
    if (!state) return
    state.scale = MIN_SCALE
    state.x = 0
    state.y = 0
    applyScale()
  }

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (!state) return
    const key = event.key
    if (key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (key === 'Tab') {
      trapFocus(event)
      return
    }
    if (key === '+' || key === '=') {
      event.preventDefault()
      zoomIn()
    } else if (key === '-' || key === '_') {
      event.preventDefault()
      zoomOut()
    } else if (key === '0') {
      event.preventDefault()
      fit()
    } else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault()
      const dx = key === 'ArrowLeft' ? PAN_STEP : key === 'ArrowRight' ? -PAN_STEP : 0
      const dy = key === 'ArrowUp' ? PAN_STEP : key === 'ArrowDown' ? -PAN_STEP : 0
      panBy(dx, dy)
    }
  }

  /** @param {KeyboardEvent} event */
  function trapFocus(event) {
    if (!state) return
    /** @type {HTMLElement[]} */
    const focusable = []
    try {
      for (const node of state.dialog.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')) {
        focusable.push(/** @type {HTMLElement} */ (node))
      }
    } catch {
      /* ignore */
    }
    if (focusable.length === 0) {
      event.preventDefault()
      try {
        state.dialog.focus()
      } catch {
        /* ignore */
      }
      return
    }
    const active = (() => {
      try {
        return doc.activeElement
      } catch {
        return null
      }
    })()
    const index = focusable.indexOf(/** @type {HTMLElement} */ (active))
    const next = event.shiftKey
      ? focusable[index <= 0 ? focusable.length - 1 : index - 1]
      : focusable[index === -1 || index === focusable.length - 1 ? 0 : index + 1]
    event.preventDefault()
    try {
      next.focus()
    } catch {
      /* ignore */
    }
  }

  /** @param {PointerEvent} event */
  function onPointerDown(event) {
    if (!state) return
    if (event.button !== undefined && event.button !== 0) return
    state.panning = {
      id: event.pointerId ?? 0,
      x: event.clientX ?? 0,
      y: event.clientY ?? 0,
      startX: state.x,
      startY: state.y,
    }
    try {
      state.stage.setAttribute('data-panning', '')
    } catch {
      /* ignore */
    }
    try {
      state.stage.setPointerCapture?.(event.pointerId)
    } catch {
      /* optional */
    }
  }

  /** @param {PointerEvent} event */
  function onPointerMove(event) {
    if (!state || !state.panning) return
    if ((event.pointerId ?? 0) !== state.panning.id) return
    if (state.box.width <= 0 || state.box.height <= 0) return
    const viewWidth = state.width / state.scale
    const viewHeight = state.height / state.scale
    const dx = (event.clientX ?? 0) - state.panning.x
    const dy = (event.clientY ?? 0) - state.panning.y
    state.x = state.panning.startX - (dx * viewWidth) / state.box.width
    state.y = state.panning.startY - (dy * viewHeight) / state.box.height
    applyScale()
  }

  /** @param {PointerEvent} event */
  function endPan(event) {
    if (!state || !state.panning) return
    if (event && (event.pointerId ?? 0) !== state.panning.id && event.type !== 'pointercancel') return
    state.panning = null
    try {
      state.stage.removeAttribute('data-panning')
    } catch {
      /* ignore */
    }
    try {
      state.stage.releasePointerCapture?.(event?.pointerId)
    } catch {
      /* optional */
    }
  }

  /** @param {WheelEvent} event */
  function onWheel(event) {
    if (!state || !(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    const delta = clamp(-(event.deltaY ?? 0), -60, 60)
    zoomAt(event.clientX ?? 0, event.clientY ?? 0, Math.pow(2, delta * 0.02))
  }

  function onBackdropClick(event) {
    if (!state) return
    if (event.target !== state.root && event.target !== state.backdrop) return
    close()
  }

  function onViewportResize() {
    if (!state) return
    layout()
  }

  /**
   * Close the overlay, restore focus/scroll and release every listener.
   * Idempotent; safe after `destroy()`.
   */
  function close() {
    if (!state || state.closed) return
    const current = state
    state = null
    current.closed = true
    for (const [target, type, handler, listenerOptions] of current.listeners) {
      try {
        target.removeEventListener(type, handler, listenerOptions)
      } catch {
        /* ignore */
      }
    }
    try {
      current.root.remove()
    } catch {
      /* ignore */
    }
    try {
      doc.body.style.overflow = current.saved.bodyOverflow
      if (current.saved.htmlOverflow !== null && doc.documentElement) {
        doc.documentElement.style.overflow = current.saved.htmlOverflow
      }
    } catch {
      /* ignore */
    }
    try {
      if (view && typeof view.scrollTo === 'function') {
        view.scrollTo(current.saved.scrollX, current.saved.scrollY)
      }
    } catch {
      /* ignore */
    }
    try {
      const focusTarget = current.saved.focus
      if (focusTarget && typeof focusTarget.focus === 'function' && focusTarget.isConnected !== false) {
        focusTarget.focus()
      }
    } catch {
      /* ignore */
    }
    if (typeof current.onClose === 'function') {
      try {
        current.onClose()
      } catch {
        /* never throw out of teardown */
      }
    }
  }

  /**
   * Open the overlay with one sanitized, natural-size SVG.
   *
   * @param {Object} [params]
   * @param {string} [params.svg] sanitized SVG document text
   * @param {number} [params.width] natural width
   * @param {number} [params.height] natural height
   * @param {number} [params.zoomFactor] inline zoom relative to inline fit (1 = fit)
   * @param {() => void} [params.onClose]
   * @returns {boolean} whether the overlay opened
   */
  function open(params = {}) {
    if (destroyed || !doc || typeof doc.createElement !== 'function') return false
    let body = null
    try {
      body = doc.body
    } catch {
      body = null
    }
    if (!body) return false
    close()
    const svgText = typeof params.svg === 'string' ? params.svg : ''
    if (svgText === '') return false
    const Parser = view?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null)
    if (typeof Parser !== 'function') return false
    /** @type {Document | null} */
    let parsed = null
    try {
      parsed = new Parser().parseFromString(svgText, 'image/svg+xml')
    } catch {
      parsed = null
    }
    const sourceRoot = parsed?.documentElement ?? null
    if (!sourceRoot || String(sourceRoot.localName || '').toLowerCase() !== 'svg') return false
    if (typeof parsed.querySelector === 'function' && parsed.querySelector('parsererror') !== null) return false
    const width = positive(params.width) ?? positive(sourceRoot.getAttribute('width'))
    const height = positive(params.height) ?? positive(sourceRoot.getAttribute('height'))
    if (width === null || height === null) return false

    /** @type {SVGElement} */
    let svg
    try {
      svg = /** @type {SVGElement} */ (doc.importNode(sourceRoot, true))
      svg.setAttribute('width', String(width))
      svg.setAttribute('height', String(height))
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      const existing = String(svg.getAttribute('class') || '').trim()
      svg.setAttribute('class', existing === '' ? CLASS.viewerSvg : `${existing} ${CLASS.viewerSvg}`)
      svg.removeAttribute('tabindex')
    } catch {
      return false
    }

    let root
    let backdrop
    let dialog
    let stage
    let closeButton
    let buttons
    try {
      root = doc.createElement('div')
      root.className = CLASS.viewer
      root.setAttribute('data-dsh-pele-mermaid-viewer', '')
      backdrop = doc.createElement('div')
      backdrop.className = CLASS.viewerBackdrop
      dialog = doc.createElement('div')
      dialog.className = CLASS.viewerDialog
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.setAttribute('aria-label', labels.dialog)
      dialog.tabIndex = -1
      const toolbar = doc.createElement('div')
      toolbar.className = CLASS.viewerToolbar
      toolbar.setAttribute('role', 'toolbar')
      toolbar.setAttribute('aria-label', labels.controls)
      buttons = {
        zoomOut: makeIconButton(labels.zoomOut, 'zoomOut', () => zoomOut()),
        zoomIn: makeIconButton(labels.zoomIn, 'zoomIn', () => zoomIn()),
        fit: makeIconButton(labels.fit, 'fit', () => fit()),
        close: makeIconButton(labels.close, 'close', () => close()),
      }
      closeButton = buttons.close
      toolbar.appendChild(buttons.zoomOut)
      toolbar.appendChild(buttons.zoomIn)
      toolbar.appendChild(buttons.fit)
      toolbar.appendChild(buttons.close)
      stage = doc.createElement('div')
      stage.className = CLASS.viewerStage
      const canvas = doc.createElement('div')
      canvas.className = CLASS.viewerCanvas
      canvas.appendChild(svg)
      stage.appendChild(canvas)
      dialog.appendChild(toolbar)
      dialog.appendChild(stage)
      root.appendChild(backdrop)
      root.appendChild(dialog)
      body.appendChild(root)
    } catch {
      try {
        root?.remove()
      } catch {
        /* ignore */
      }
      return false
    }

    let savedFocus = null
    let bodyOverflow = ''
    let htmlOverflow = null
    try {
      savedFocus = doc.activeElement
      bodyOverflow = body.style.overflow
      htmlOverflow = doc.documentElement ? doc.documentElement.style.overflow : null
      body.style.overflow = 'hidden'
      if (doc.documentElement) doc.documentElement.style.overflow = 'hidden'
    } catch {
      /* scroll lock is best effort */
    }

    state = {
      root,
      backdrop,
      dialog,
      stage,
      canvas: /** @type {Element} */ (stage.firstElementChild),
      svg,
      width,
      height,
      scale: 1,
      x: 0,
      y: 0,
      box: { width: 0, height: 0 },
      panning: null,
      buttons,
      saved: {
        focus: savedFocus,
        bodyOverflow,
        htmlOverflow,
        scrollX: Number(view?.scrollX) || 0,
        scrollY: Number(view?.scrollY) || 0,
      },
      listeners: [],
      onClose: typeof params.onClose === 'function' ? params.onClose : null,
      closed: false,
    }

    listen(doc, 'keydown', /** @type {EventListener} */ (onKeyDown), true)
    listen(root, 'click', /** @type {EventListener} */ (onBackdropClick), undefined)
    listen(stage, 'pointerdown', /** @type {EventListener} */ (onPointerDown), undefined)
    listen(stage, 'pointermove', /** @type {EventListener} */ (onPointerMove), undefined)
    listen(stage, 'pointerup', /** @type {EventListener} */ (endPan), undefined)
    listen(stage, 'pointercancel', /** @type {EventListener} */ (endPan), undefined)
    listen(stage, 'wheel', /** @type {EventListener} */ (onWheel), { passive: false })
    if (view && typeof view.addEventListener === 'function') {
      listen(view, 'resize', /** @type {EventListener} */ (onViewportResize), undefined)
    }

    layout()
    const factor = positive(params.zoomFactor) ?? MIN_SCALE
    state.scale = clamp(factor, MIN_SCALE, maxScale)
    state.x = (width - width / state.scale) / 2
    state.y = (height - height / state.scale) / 2
    applyScale()
    try {
      closeButton?.focus()
    } catch {
      /* ignore */
    }
    return true
  }

  return {
    open,
    close,
    destroy() {
      if (destroyed) return
      close()
      destroyed = true
    },
    get isOpen() {
      return state !== null
    },
    get scale() {
      return state ? state.scale : MIN_SCALE
    },
    zoomIn,
    zoomOut,
    fit,
  }
}
