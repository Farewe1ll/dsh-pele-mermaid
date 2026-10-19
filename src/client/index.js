/**
 * dsh-pele-mermaid — browser half.
 *
 * One Cordis client plugin that watches the rendered assistant Markdown for
 * settled ```mermaid code blocks and replaces each fence body with a Pele
 * diagram. Pele is bundled into this file: synchronous rendering, zero runtime
 * dependencies, no network.
 *
 * Decoupling contract:
 *  - No `require()` of any DSH client package; we only use the public `theme`
 *    Cordis service (declared in `inject`, a static array).
 *  - Colors/fonts flow through our stylesheet: `--pele-*` variables are defined
 *    from DSH `--dsw-*` tokens, so light/dark/theme changes are pure CSS and
 *    never re-render a diagram.
 *  - The Markdown DOM is read and locally augmented; the Session log and the
 *    original code-block source are never modified. Destroying the plugin
 *    restores the page to its pre-plugin DOM.
 */
import { installStyles } from './theme-css.js'
import { createBlockManager } from './blocks.js'

/** Services used by this plugin. Must stay a static array (Cordis contract). */
export const inject = ['theme']

/** Debounce for DOM mutation bursts (streaming Markdown, layout churn). */
const SCAN_DEBOUNCE_MS = 150

/**
 * Client plugin body.
 * @param {import('@deepseek-ai/cordis').Context} ctx - owning client fiber context.
 */
export function apply(ctx) {
  if (typeof document === 'undefined') return

  ctx.effect(() => {
    /** @type {MutationObserver | null} */
    let observer = null
    /** @type {ReturnType<typeof createBlockManager> | null} */
    let manager = null
    /** @type {(() => void) | null} */
    let removeStyles = null
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null
    /** @type {(() => void) | null} */
    let removeDomReady = null
    /** @type {(() => void) | null} */
    let removeTheme = null
    let lastFontKey = ''
    let disposed = false
    let started = false

    const runScan = () => {
      if (disposed || manager === null) return
      manager.scan()
    }

    const scheduleScan = () => {
      if (disposed) return
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        runScan()
      }, SCAN_DEBOUNCE_MS)
    }

    const scheduleRefresh = () => {
      if (disposed) return
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (disposed || manager === null) return
        manager.refreshAll()
      }, SCAN_DEBOUNCE_MS)
    }

    const readLocale = () => {
      try {
        const language = typeof navigator !== 'undefined' ? String(navigator.language ?? '') : ''
        return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch {
        return 'en'
      }
    }

    const fontKeyOf = (snapshot) => {
      try {
        // Only measurement inputs: colors/scheme must not trigger a rebuild.
        return JSON.stringify([snapshot?.fontSizes ?? null, snapshot?.fontFamilies ?? null])
      } catch {
        return ''
      }
    }

    const wireTheme = () => {
      try {
        const theme = ctx.get('theme')
        if (theme === undefined || theme === null || typeof theme.getTheme !== 'function') return
        lastFontKey = fontKeyOf(theme.getTheme())
        removeTheme = ctx.on('theme/change', (snapshot) => {
          if (disposed) return
          const next = fontKeyOf(snapshot)
          if (next === lastFontKey) return
          lastFontKey = next
          scheduleRefresh()
        })
      } catch {
        // A missing theme service only costs the optional font-refresh path.
      }
    }

    const start = () => {
      if (disposed || started) return
      if (typeof document === 'undefined' || document.body === null) return
      started = true
      removeStyles = installStyles(document)
      manager = createBlockManager({
        document,
        locale: readLocale(),
      })
      observer = new MutationObserver(() => scheduleScan())
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      wireTheme()
      scheduleScan()
    }

    if (typeof document !== 'undefined' && document.body !== null) {
      start()
    } else if (typeof document !== 'undefined') {
      const onReady = () => {
        start()
      }
      document.addEventListener('DOMContentLoaded', onReady, { once: true })
      removeDomReady = () => document.removeEventListener('DOMContentLoaded', onReady)
    }

    return () => {
      disposed = true
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (observer !== null) {
        observer.disconnect()
        observer = null
      }
      if (removeTheme !== null) {
        removeTheme()
        removeTheme = null
      }
      if (removeDomReady !== null) {
        removeDomReady()
        removeDomReady = null
      }
      if (manager !== null) {
        manager.destroy()
        manager = null
      }
      if (removeStyles !== null) {
        removeStyles()
        removeStyles = null
      }
    }
  })
}
