/**
 * dsh-pele-mermaid — inline icon set.
 *
 * Small, dependency-free SVG icons for the diagram toolbar and the fullscreen
 * viewer. Every icon is decorative (`aria-hidden`) because the owning control
 * carries a localized `aria-label`/`title`; nothing here loads a font, a sprite,
 * or a remote resource.
 *
 * @module dsh-pele-mermaid/icons
 */
import { CLASS } from './theme-css.js'

/** SVG namespace used by every icon child. */
const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * 24x24 stroke icons. Paths use `currentColor` via the parent <svg>, so the
 * toolbar/viewer CSS owns the actual color tokens.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const ICON_PATHS = Object.freeze({
  download: Object.freeze(['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14']),
  fullscreen: Object.freeze([
    'M8 3H5a2 2 0 0 0-2 2v3',
    'M16 3h3a2 2 0 0 1 2 2v3',
    'M8 21H5a2 2 0 0 1-2-2v-3',
    'M16 21h3a2 2 0 0 0 2-2v-3',
  ]),
  close: Object.freeze(['M18 6 6 18', 'm6 6 12 12']),
  zoomIn: Object.freeze([
    'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z',
    'm20 21-4.5-4.5',
    'M7.5 10.5h6',
    'M10.5 7.5v6',
  ]),
  zoomOut: Object.freeze([
    'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z',
    'm20 21-4.5-4.5',
    'M7.5 10.5h6',
  ]),
  fit: Object.freeze([
    'M8 3H5a2 2 0 0 0-2 2v3',
    'M16 3h3a2 2 0 0 1 2 2v3',
    'M8 21H5a2 2 0 0 1-2-2v-3',
    'M16 21h3a2 2 0 0 0 2-2v-3',
    'M9 9h6v6H9z',
  ]),
})

/**
 * Build one decorative icon element.
 *
 * @param {Document} doc
 * @param {string} name - key of {@link ICON_PATHS}
 * @returns {SVGElement}
 */
export function createIcon(doc, name) {
  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', CLASS.icon)
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const paths = ICON_PATHS[name]
  if (!Array.isArray(paths)) return svg
  for (const d of paths) {
    const path = doc.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  return svg
}
