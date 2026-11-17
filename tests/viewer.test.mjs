/**
 * Unit tests for the fullscreen viewer (src/client/viewer.js).
 *
 * jsdom has no layout engine, so the stage box is injected through the
 * documented `measureStage` seam (800x600 inner area). Everything else is the
 * real overlay: DOM structure, focus trap, scroll lock, viewBox zoom/pan,
 * keyboard/pointer handling and teardown.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { createViewer } from '../src/client/viewer.js'
import { CLASS } from '../src/client/theme-css.js'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" class="pele pele-flowchart" viewBox="0 0 400 200" width="400" height="200"><g id="diagram"><rect width="400" height="200"/></g></svg>'
const STAGE = { width: 800, height: 600 }

function makeEnv(options = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><button id="trigger">open</button></body></html>', {
    url: 'https://dsh-pele-mermaid.test/',
  })
  const { window } = dom
  const { document } = window
  // jsdom does not implement scrolling; the viewer only needs the call to exist.
  window.scrollTo = () => {}
  const viewer = createViewer({
    document,
    view: window,
    locale: options.locale ?? 'en',
    measureStage: options.measureStage ?? (() => ({ ...STAGE })),
  })
  return { dom, window, document, viewer }
}

function rootOf(document) {
  return document.querySelector('[data-dsh-pele-mermaid-viewer]')
}

function dialogOf(document) {
  return document.querySelector(`.${CLASS.viewerDialog}`)
}

function svgOf(document) {
  return document.querySelector(`.${CLASS.viewerSvg}`)
}

function buttonsOf(document) {
  return Array.from(document.querySelectorAll(`.${CLASS.viewerToolbar} button`))
}

function open(env, params = {}) {
  return env.viewer.open({ svg: SVG, width: 400, height: 200, ...params })
}

function key(env, target, name, options = {}) {
  target.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options }))
}

function pointer(env, target, type, x, y) {
  target.dispatchEvent(new env.window.MouseEvent(type, {
    bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y,
  }))
}

function wheel(env, target, { clientX = 0, clientY = 0, deltaY = 0, ctrlKey = false } = {}) {
  const Ctor = env.window.WheelEvent
  if (typeof Ctor === 'function') {
    target.dispatchEvent(new Ctor('wheel', { bubbles: true, cancelable: true, clientX, clientY, deltaY, ctrlKey }))
    return
  }
  const event = new env.window.Event('wheel', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    deltaY: { value: deltaY },
    ctrlKey: { value: ctrlKey },
    metaKey: { value: false },
  })
  target.dispatchEvent(event)
}

test('open builds an accessible modal, locks scrolling and focuses the close button', () => {
  const env = makeEnv()
  const trigger = env.document.getElementById('trigger')
  trigger.focus()
  assert.equal(open(env), true)

  const root = rootOf(env.document)
  const dialog = dialogOf(env.document)
  assert.ok(root, 'overlay root exists')
  assert.equal(root.className, CLASS.viewer)
  assert.equal(dialog.getAttribute('role'), 'dialog')
  assert.equal(dialog.getAttribute('aria-modal'), 'true')
  assert.equal(dialog.getAttribute('aria-label'), 'Diagram viewer')

  assert.deepEqual(buttonsOf(env.document).map((button) => button.getAttribute('aria-label')), [
    'Zoom out', 'Zoom in', 'Fit to window', 'Close viewer',
  ])
  assert.ok(buttonsOf(env.document).every((button) => button.querySelector('svg')), 'icon controls are decorative SVGs')

  const svg = svgOf(env.document)
  assert.equal(svg.getAttribute('viewBox'), '0 0 400 200')
  assert.ok(svg.getAttribute('class').includes(CLASS.viewerSvg))
  assert.equal(svg.getAttribute('tabindex'), null, 'the inline tabindex is removed')

  assert.equal(env.document.body.style.overflow, 'hidden', 'background scroll is locked')
  assert.equal(env.document.activeElement, buttonsOf(env.document)[3], 'focus enters the dialog')
  assert.equal(env.viewer.isOpen, true)
  assert.equal(env.viewer.scale, 1)

  env.viewer.destroy()
})

test('open starts at the inline zoom factor and clamps it', () => {
  const env = makeEnv()
  assert.equal(open(env, { zoomFactor: 2 }), true)
  assert.equal(env.viewer.scale, 2)
  assert.equal(svgOf(env.document).getAttribute('viewBox'), '100 50 200 100')
  env.viewer.close()

  assert.equal(open(env, { zoomFactor: 100 }), true)
  assert.equal(env.viewer.scale, 8)
  env.viewer.close()

  assert.equal(open(env, { zoomFactor: 0.1 }), true)
  assert.equal(env.viewer.scale, 1)
  env.viewer.destroy()
})

test('zoom buttons and fit-to-window drive the viewBox and disabled states', () => {
  const env = makeEnv()
  open(env)
  const buttons = buttonsOf(env.document)
  const [zoomOut, zoomIn, fit] = buttons

  assert.equal(zoomOut.disabled, true, 'cannot zoom out below fit')
  zoomIn.click()
  assert.equal(env.viewer.scale, 1.25)
  assert.equal(svgOf(env.document).getAttribute('viewBox'), '40 20 320 160')
  assert.equal(zoomOut.disabled, false)

  zoomOut.click()
  assert.equal(env.viewer.scale, 1)
  assert.equal(svgOf(env.document).getAttribute('viewBox'), '0 0 400 200')

  for (let index = 0; index < 20; index += 1) zoomIn.click()
  assert.equal(env.viewer.scale, 8)
  assert.equal(zoomIn.disabled, true, 'cannot zoom in past the cap')

  fit.click()
  assert.equal(env.viewer.scale, 1)
  assert.equal(svgOf(env.document).getAttribute('viewBox'), '0 0 400 200')
  env.viewer.destroy()
})

test('Ctrl/Cmd + wheel zooms at the pointer; plain wheel is ignored', () => {
  const env = makeEnv()
  open(env)
  const stage = env.document.querySelector(`.${CLASS.viewerStage}`)

  wheel(env, stage, { clientX: 400, clientY: 300, deltaY: -100, ctrlKey: true })
  assert.ok(env.viewer.scale > 1, 'ctrl+wheel zooms in')
  const zoomed = env.viewer.scale
  const viewBox = svgOf(env.document).getAttribute('viewBox')
  assert.doesNotMatch(viewBox, /^0 0 400 200$/, 'the viewBox is cropped while zoomed')

  wheel(env, stage, { clientX: 400, clientY: 300, deltaY: -100 })
  assert.equal(env.viewer.scale, zoomed, 'without ctrl/meta the page keeps scrolling')

  wheel(env, stage, { clientX: 400, clientY: 300, deltaY: 100, ctrlKey: true })
  assert.ok(env.viewer.scale < zoomed, 'the opposite wheel direction zooms out')
  env.viewer.destroy()
})

test('dragging pans a zoomed diagram and clamps to the diagram bounds', () => {
  const env = makeEnv()
  open(env)
  const stage = env.document.querySelector(`.${CLASS.viewerStage}`)
  const zoomIn = buttonsOf(env.document)[1]
  zoomIn.click()
  zoomIn.click()
  assert.equal(env.viewer.scale, 1.5625)

  const before = svgOf(env.document).getAttribute('viewBox')
  pointer(env, stage, 'pointerdown', 0, 0)
  pointer(env, stage, 'pointermove', 100, 0)
  pointer(env, stage, 'pointerup', 100, 0)
  const moved = svgOf(env.document).getAttribute('viewBox')
  assert.notEqual(moved, before)
  const x = Number(moved.split(/\s+/)[0])
  assert.ok(x >= 0 && x < 72, `panned x stays in bounds, got ${moved}`)

  // A drag far past the left edge clamps at 0 instead of exposing blank space.
  pointer(env, stage, 'pointerdown', 0, 0)
  pointer(env, stage, 'pointermove', 4000, 4000)
  pointer(env, stage, 'pointerup', 4000, 4000)
  assert.equal(svgOf(env.document).getAttribute('viewBox'), '0 0 256 128')
  assert.equal(stage.hasAttribute('data-panning'), false, 'panning state is cleared')
  env.viewer.destroy()
})

test('Escape closes, restores focus and the previous scroll lock', () => {
  const env = makeEnv()
  const trigger = env.document.getElementById('trigger')
  const scrollCalls = []
  env.window.scrollTo = (x, y) => scrollCalls.push([x, y])
  env.document.body.style.overflow = 'scroll'
  trigger.focus()

  let closed = 0
  open(env, { onClose: () => { closed += 1 } })
  assert.equal(env.document.body.style.overflow, 'hidden')

  key(env, env.document, 'Escape')
  assert.equal(env.viewer.isOpen, false)
  assert.equal(rootOf(env.document), null, 'the overlay is removed')
  assert.equal(env.document.body.style.overflow, 'scroll', 'the previous overflow is restored')
  assert.equal(env.document.activeElement, trigger, 'focus returns to the trigger')
  assert.equal(closed, 1)
  assert.equal(scrollCalls.length, 1, 'the previous scroll position is restored')
  env.document.body.style.overflow = ''
  env.viewer.destroy()
})

test('Tab and Shift+Tab are trapped inside the dialog', () => {
  const env = makeEnv()
  open(env)
  const [zoomOut, zoomIn, fit, close] = buttonsOf(env.document)

  assert.equal(env.document.activeElement, close)
  // Disabled controls are skipped: at fit scale only zoomIn/fit/close are focusable.
  assert.equal(zoomOut.disabled, true)
  key(env, env.document, 'Tab')
  assert.equal(env.document.activeElement, zoomIn, 'Tab from the last control wraps to the first focusable')
  key(env, env.document, 'Tab')
  assert.equal(env.document.activeElement, fit)
  key(env, env.document, 'Tab', { shiftKey: true })
  assert.equal(env.document.activeElement, zoomIn)
  key(env, env.document, 'Tab', { shiftKey: true })
  assert.equal(env.document.activeElement, close, 'Shift+Tab from the first focusable wraps to the last')
  env.viewer.destroy()
})

test('backdrop click closes; a click inside the dialog does not', () => {
  const env = makeEnv()
  open(env)
  const dialog = dialogOf(env.document)
  dialog.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }))
  assert.equal(env.viewer.isOpen, true, 'clicking the dialog keeps it open')

  // The backdrop is a child of the overlay root; a real pointer click targets it.
  const backdrop = env.document.querySelector(`.${CLASS.viewerBackdrop}`)
  assert.ok(backdrop, 'backdrop exists')
  backdrop.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }))
  assert.equal(env.viewer.isOpen, false)
  assert.equal(rootOf(env.document), null)

  // A synthetic click that targets the overlay root itself also closes it.
  open(env)
  rootOf(env.document).dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }))
  assert.equal(env.viewer.isOpen, false)
  env.viewer.destroy()
})

test('repeated open never stacks overlays; destroy releases everything', () => {
  const env = makeEnv()
  assert.equal(open(env), true)
  assert.equal(open(env), true)
  assert.equal(env.document.querySelectorAll('[data-dsh-pele-mermaid-viewer]').length, 1)

  env.viewer.close()
  assert.equal(rootOf(env.document), null)
  assert.equal(env.document.body.style.overflow, '')

  assert.equal(open(env), true)
  env.viewer.destroy()
  assert.equal(rootOf(env.document), null)
  assert.equal(env.viewer.isOpen, false)
  assert.equal(open(env), false, 'a destroyed viewer refuses to reopen')
  assert.equal(env.document.body.style.overflow, '')
})

test('Escape after close is inert (listeners were released)', () => {
  const env = makeEnv()
  open(env)
  env.viewer.close()
  assert.doesNotThrow(() => key(env, env.document, 'Escape'))
  assert.equal(rootOf(env.document), null)
  env.viewer.destroy()
})

test('zh locale localizes every control', () => {
  const env = makeEnv({ locale: 'zh' })
  open(env)
  assert.equal(dialogOf(env.document).getAttribute('aria-label'), '图表查看器')
  assert.deepEqual(buttonsOf(env.document).map((button) => button.getAttribute('aria-label')), [
    '缩小', '放大', '适应窗口', '关闭查看器',
  ])
  env.viewer.destroy()
})

test('invalid input fails closed without touching the page', () => {
  const env = makeEnv()
  assert.equal(env.viewer.open({ svg: '' }), false)
  assert.equal(env.viewer.open({ svg: '<svg' }), false)
  assert.equal(env.viewer.open({ svg: '<html></html>' }), false)
  assert.equal(rootOf(env.document), null)
  assert.equal(env.document.body.style.overflow, '')
  assert.equal(env.viewer.isOpen, false)
  env.viewer.destroy()
})

test('keyboard zoom and arrow panning work while the dialog is open', () => {
  const env = makeEnv()
  open(env)
  key(env, env.document, '+')
  assert.equal(env.viewer.scale, 1.25)
  key(env, env.document, '-')
  assert.equal(env.viewer.scale, 1)
  key(env, env.document, '+')
  const before = svgOf(env.document).getAttribute('viewBox')
  key(env, env.document, 'ArrowRight')
  assert.notEqual(svgOf(env.document).getAttribute('viewBox'), before)
  key(env, env.document, '0')
  assert.equal(svgOf(env.document).getAttribute('viewBox'), '0 0 400 200')
  env.viewer.destroy()
})
