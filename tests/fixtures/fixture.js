/*
 * Standalone visual fixture for dsh-pele-mermaid.
 *
 * It mimics the parts of the real DSH Web client that the plugin touches:
 *
 *  - the rendered Markdown code-block DOM contract from docs/ARCH.md
 *    (.md-code-block > [data-code-block-banner] + [data-code-block-content] > pre)
 *  - the DSH design-token stylesheet (theme-tokens.css is a verbatim extraction
 *    of DSH 0.2.1-rc.2 light + dark token layers)
 *  - the two browser-half boot contract points: a `window.__ModuleLoader__`
 *    that receives `{ id, factory }`, and a fake Cordis `ctx` exposing the
 *    public `theme` service plus `effect()` / `on()`.
 *
 * It is served by scripts/serve-fixture.mjs (repo root is the document root, so
 * `../../lib/client.js` resolves to the BUILT bundle).
 *
 * Query parameters:
 *   ?theme=dark   start in dark mode (body[data-ds-dark-theme])
 *
 * Everything the verification pass needs is exposed on `window.__fixture` and
 * rendered in the sidebar "evidence panel" so a screenshot alone is evidence.
 */
(() => {
  'use strict'

  const DIAGRAMS = [
    {
      kind: 'flowchart',
      source: [
        'flowchart LR',
        '  Prompt[User prompt] --> Detect{Settled fence?}',
        '  Detect -- yes --> Mount[Mount Pele diagram]',
        '  Detect -- no --> Wait[Wait for stream]',
        '  Wait --> Detect',
        '  Mount --> Theme[CSS token theming]',
      ].join('\n'),
    },
    {
      kind: 'sequenceDiagram',
      source: [
        'sequenceDiagram',
        '  participant U as User',
        '  participant D as DSH',
        '  participant P as Pele',
        '  U->>D: render markdown',
        '  D->>D: scan settled mermaid fences',
        '  D->>P: mount(source)  (synchronous, offline)',
        '  P-->>D: svg.pele',
        '  D-->>U: interactive diagram',
      ].join('\n'),
    },
    {
      kind: 'pie',
      source: [
        'pie title Mermaid fences rendered by Pele',
        '  "flowchart" : 46',
        '  "sequence" : 22',
        '  "pie" : 14',
        '  "other" : 18',
      ].join('\n'),
    },
    {
      kind: 'gantt',
      source: [
        'gantt',
        '  title dsh-pele-mermaid verification',
        '  dateFormat YYYY-MM-DD',
        '  axisFormat %b %d',
        '  section Build',
        '  esbuild bundle :a1, 2026-10-19, 1d',
        '  section Verify',
        '  jsdom bundle smoke :a2, after a1, 1d',
        '  real profile boot :a3, after a2, 1d',
        '  visual fixture :a4, after a3, 1d',
      ].join('\n'),
    },
    {
      // P1 (Pele 1.9): CJK labels wrap between characters instead of
      // stretching the diagram, and a label that ends in closing punctuation
      // keeps the punctuation attached to its preceding character. One label
      // mixes a Latin token + code identifier into the CJK run.
      kind: 'flowchart (CJK wrapping)',
      source: [
        'flowchart TD',
        '  Submit[用户提交一条较长的中文需求描述，其中包含 English token 和 code 标识符，需要在中文字符之间换行而不是把图表撑宽。] --> Settled{是否已经完成流式输出？}',
        '  Settled -- 是 --> Mount[等待 fence 稳定后再挂载图表。]',
        '  Settled -- 否 --> Stream[继续读取 stream 内容，保留原始 source 文本。]',
        '  Mount --> Punct[检查长标签的收尾标点（含句号）。]',
        '  Stream --> Punct',
      ].join('\n'),
    },
    {
      // P1: a class diagram asks for a left-to-right row. In the wide fixture
      // column the three class groups share one row; in the narrow column
      // Pele's autoDirection wraps each separate group onto its own row.
      kind: 'classDiagram (group wrapping)',
      source: [
        'classDiagram',
        '  direction LR',
        '  class RenderPipeline {',
        '    +scanMermaidFences()',
        '    +mountDiagram(source)',
        '  }',
        '  class ToolbarState {',
        '    +diagramVisible: boolean',
        '    +sourceVisible: boolean',
        '  }',
        '  class ViewerState {',
        '    +open(svg: string)',
        '    +close()',
        '  }',
        '  RenderPipeline --> ToolbarState : mounts',
        '  ToolbarState --> ViewerState : opens',
      ].join('\n'),
    },
    {
      // P1: generic/angle-bracket label text must survive as literal text.
      kind: 'flowchart (generic labels)',
      source: [
        'flowchart LR',
        '  List[List<Diagram>] --> Map[Map<String, Diagram>]',
        '  Map --> Set[Set<Diagram>]',
      ].join('\n'),
    },
    {
      // P1: Pele 1.9 rich label markup: <sub>, <sup>, <code>, <kbd>, <samp>.
      // Labels are quoted so parentheses in the method name cannot be mistaken
      // for edge syntax; no scripts or event handlers are involved.
      kind: 'flowchart (rich labels)',
      source: [
        'flowchart TD',
        '  Water["H<sub>2</sub>O"] --> Energy["E = mc<sup>2</sup>"]',
        '  Energy --> Call["<code>mountDiagram()</code>"]',
        '  Call --> Escape["Press <kbd>Esc</kbd>"]',
        '  Escape --> Sample["<samp>svg.pele</samp>"]',
      ].join('\n'),
    },
    {
      kind: 'mermaid (invalid)',
      invalid: true,
      source: 'definitely not a mermaid diagram -> should fall back to source',
    },
  ]

  const JS_SOURCE = [
    '// non-mermaid fence: the plugin must never touch it',
    'const answer = 42',
    "console.log('plain code block stays plain')",
  ].join('\n')

  const GLOBAL = /** @type {any} */ (window)

  const state = {
    fixture: 'dsh-pele-mermaid visual harness',
    theme: 'light',
    registration: null,
    registrationId: null,
    factoryType: null,
    exportsFace: null,
    requireCalls: 0,
    applyCalls: 0,
    effectCalls: 0,
    themeHandlers: 0,
    applied: false,
    ready: false,
    remounts: 0,
    mountEvents: [],
    themeEvents: [],
    copyClicks: 0,
    // Fullscreen trigger for the viewer focus-restore check (set by openViewer).
    viewerTrigger: null,
    errors: [],
    expectedDiagrams: 8,
    fontSnapshot: {
      fontSizes: { code: 13, ui: 14 },
      fontFamilies: { code: 'monospace', ui: 'system-ui' },
    },
    themeHandlersList: [],
    effectDisposer: null,
  }

  const $ = (sel, root = document) => root.querySelector(sel)
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))

  /* ------------------------------------------------------------------ *
   * Theme control (query param + button). Tokens flip under body attr. *
   * ------------------------------------------------------------------ */

  const query = new URLSearchParams(location.search)

  // Deterministic locale for screenshots/tests: navigator.language drives the
  // plugin's toolbar labels (zh -> 图表/源码, otherwise Diagram/Source).
  const localeParam = query.get('locale')
  if (localeParam === 'en' || localeParam === 'zh') {
    try {
      Object.defineProperty(window.navigator, 'language', {
        value: localeParam === 'zh' ? 'zh-CN' : 'en-US',
        configurable: true,
      })
    } catch (error) {
      state.errors.push('could not override navigator.language: ' + (error && error.message))
    }
  }

  function applyTheme(theme) {
    const dark = theme === 'dark'
    if (dark) document.body.setAttribute('data-ds-dark-theme', '')
    else document.body.removeAttribute('data-ds-dark-theme')
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    state.theme = theme
    const button = $('#theme-toggle')
    if (button) button.textContent = dark ? 'Switch to light' : 'Switch to dark'
    state.themeEvents.push({ theme, at: Math.round(performance.now()) })
    scheduleReport()
  }

  /* ------------------------------------------------------------------ *
   * Fixture Markdown DOM: exactly the ARCH.md CodeBlock shape.          *
   * ------------------------------------------------------------------ */

  function makeCodeBlock({ lang, source, fiberLang }) {
    const block = document.createElement('div')
    // Real chat shape: card/toolbar variant, not the plain banner variant.
    block.className = 'md-code-block fixture-card'
    block.setAttribute('data-code-wrap', 'true')

    const banner = document.createElement('div')
    banner.className = 'md-code-block-banner'
    banner.setAttribute('data-code-block-banner', '')

    const info = document.createElement('span')
    info.className = 'md-code-block-infostring'
    // Shiki has no Mermaid grammar, so the real card header shows DSH's
    // localized generic code label; Mermaid is identified from explicit props.
    info.textContent = lang === 'mermaid' ? '代码块' : lang

    const action = document.createElement('span')
    action.className = 'md-code-block-action'
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'md-code-block-copy'
    copy.textContent = 'Copy'
    copy.addEventListener('click', () => {
      state.copyClicks += 1
      const displayCode = source.endsWith('\n') ? source.slice(0, -1) : source
      state.copiedText = block.querySelector('pre')?.textContent ?? displayCode
      copy.textContent = 'Copied'
      setTimeout(() => {
        copy.textContent = 'Copy'
      }, 900)
    })
    action.appendChild(copy)
    banner.append(info, action)

    const content = document.createElement('div')
    content.className = 'md-code-block-content'
    content.setAttribute('data-code-block-content', '')

    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = source.endsWith('\n') ? source.slice(0, -1) : source
    pre.appendChild(code)
    content.appendChild(pre)

    block.append(banner, content)
    if (fiberLang !== undefined) {
      // Simulate the React fiber chain the real chat DOM carries (exact `code`
      // and `lang` props) so the explicit-language path is exercised too.
      const root = { tag: 3, return: null, stateNode: {} }
      root.stateNode.current = root
      const component = { memoizedProps: { code: source, lang: fiberLang }, return: root }
      const host = { memoizedProps: { className: 'md-code-block' }, stateNode: block, return: component }
      root.child = component
      component.child = host
      block.__reactFiber$fixture = host
    }
    return block
  }

  function buildThread() {
    const markdown = $('#thread-markdown')
    if (!markdown) throw new Error('fixture page is missing #thread-markdown')

    const intro = document.createElement('p')
    intro.textContent =
      'Assistant reply from a real DSH session (fixture). Settled ```mermaid fences below are ' +
      'post-processed into Pele diagrams by the built client bundle; the non-mermaid fence is untouched.'
    markdown.appendChild(intro)

    for (const [index, diagram] of DIAGRAMS.entries()) {
      const heading = document.createElement('h3')
      heading.textContent = `Fence ${index + 1}: ${diagram.kind}` + (diagram.invalid ? ' (invalid source → source fallback)' : '')
      markdown.appendChild(heading)
      markdown.appendChild(
        makeCodeBlock({
          lang: 'mermaid',
          source: diagram.source,
          // Explicit language only for the invalid-source fallback; the other
          // fences exercise the source-detection path of the real card shape.
          fiberLang: 'mermaid',
        }),
      )
    }

    const heading = document.createElement('h3')
    heading.textContent = `Fence ${DIAGRAMS.length + 1}: javascript (must stay untouched)`
    markdown.appendChild(heading)
    markdown.appendChild(makeCodeBlock({ lang: 'javascript', source: JS_SOURCE }))
  }

  /* ------------------------------------------------------------------ *
   * Remount counter: counts svg.pele nodes added to the thread.        *
   * Initial mount => expectedDiagrams. A theme toggle must add ZERO.   *
   * ------------------------------------------------------------------ */

  function installRemountCounter() {
    const thread = $('#thread')
    if (!thread) return
    const observer = new MutationObserver((records) => {
      let added = 0
      for (const record of records) {
        for (const node of record.addedNodes) {
          // Count the diagram <svg> nodes themselves. Containers are appended
          // before Pele writes the SVG, so counting descendants here would
          // double-count a single mount.
          if (node instanceof Element && node.matches && node.matches('svg.pele')) added += 1
        }
      }
      if (added > 0) {
        state.remounts += added
        state.mountEvents.push({ count: added, remounts: state.remounts, at: Math.round(performance.now()) })
        scheduleReport()
      }
    })
    // Wait for the thread to exist, then observe it.
    observer.observe(thread, { childList: true, subtree: true })
    // Keep a strong reference: an unreferenced observer may be garbage
    // collected, which would silently stop the remount counter.
    state.remountObserver = observer
  }

  /* ------------------------------------------------------------------ *
   * Evidence report (sidebar + window.__fixture.report()).             *
   * ------------------------------------------------------------------ */

  const PELE_VARS = [
    '--pele-bg',
    '--pele-fg',
    '--pele-muted',
    '--pele-line',
    '--pele-surface',
    '--pele-surface-alt',
    '--pele-border',
    '--pele-accent',
    '--pele-radius',
    '--pele-font',
    '--pele-font-mono',
  ]

  function readPeleVars() {
    const container = $('.dsh-pele-mermaid-diagram')
    if (!container) return null
    const styles = getComputedStyle(container)
    /** @type {Record<string, string>} */
    const vars = {}
    for (const name of PELE_VARS) vars[name] = styles.getPropertyValue(name).trim()
    return {
      target: 'first .dsh-pele-mermaid-diagram',
      backgroundColor: styles.backgroundColor,
      vars,
    }
  }

  /** Number attribute, or null when absent/not finite. */
  function numberAttribute(node, name) {
    if (!node) return null
    const value = Number(node.getAttribute(name))
    return Number.isFinite(value) ? value : null
  }

  function collectReport() {
    const blocks = $$('.md-code-block')
    const containers = $$('.dsh-pele-mermaid-diagram')
    const hosts = $$('[data-dsh-pele-mermaid-host]')
    const diagramSvgs = $$('[data-dsh-pele-mermaid-host] svg.pele')
    const zoomIconSvgs = $$('[data-dsh-pele-mermaid-host] .pele-zoom svg')
    const toolbars = $$('.dsh-pele-mermaid-toolbar')
    const buttons = $$('.dsh-pele-mermaid-toolbar button')
    const errors = $$('.dsh-pele-mermaid-error')
    const styles = $$('style[data-dsh-pele-mermaid]')
    const sourceView = $$('.dsh-pele-mermaid-source')
    const viewerRoots = $$('[data-dsh-pele-mermaid-viewer]')
    const viewerDialogs = $$('.dsh-pele-mermaid-viewer-dialog[role="dialog"][aria-modal="true"]')
    const viewerToolbarButtons = $$('.dsh-pele-mermaid-viewer-toolbar button')
    const viewerSvg = $('.dsh-pele-mermaid-viewer-svg')
    const perDiagramButtons = containers.map((container) => $$('.dsh-pele-mermaid-toolbar button', container))

    const svgClasses = diagramSvgs.map((svg) => svg.getAttribute('class') || '')
    const types = svgClasses.map((cls) => {
      const match = /\bpele-([a-z]+)\b/.exec(cls)
      return match ? match[1] : 'unknown'
    })

    return {
      theme: state.theme,
      darkAttribute: document.body.hasAttribute('data-ds-dark-theme'),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      registrationId: state.registrationId,
      factoryType: state.factoryType,
      exportsFace: state.exportsFace,
      applied: state.applied,
      ready: state.ready,
      requireCalls: state.requireCalls,
      applyCalls: state.applyCalls,
      effectCalls: state.effectCalls,
      themeHandlers: state.themeHandlers,
      dom: {
        blocks: blocks.length,
        mountedContainers: containers.length,
        hosts: hosts.length,
        diagramSvgs: diagramSvgs.length,
        svgTypes: types,
        zoomIconSvgs: zoomIconSvgs.length,
        toolbars: toolbars.length,
        toolbarButtons: buttons.length,
        ariaPressed: buttons.map((button) => button.getAttribute('aria-pressed')),
        toolbarLabels: buttons.map((button) => button.textContent),
        toolbarButtonsPerDiagram: perDiagramButtons.map((list) => list.length),
        iconButtons: buttons.filter((button) => button.hasAttribute('aria-label')).length,
        downloadButtons: perDiagramButtons.filter((list) => list[2] && list[2].hasAttribute('aria-label')).length,
        fullscreenButtons: perDiagramButtons.filter((list) => list[3] && list[3].hasAttribute('aria-label')).length,
        disabledToolbarButtons: buttons.filter((button) => button.disabled === true).length,
        diagramWidths: diagramSvgs.map((svg) => numberAttribute(svg, 'width')),
        diagramHeights: diagramSvgs.map((svg) => numberAttribute(svg, 'height')),
        hostWidths: hosts.map((host) => host.clientWidth),
        viewerOpen: viewerRoots.length > 0,
        viewerOverlays: viewerRoots.length,
        viewerDialogs: viewerDialogs.length,
        viewerToolbarButtons: viewerToolbarButtons.length,
        viewerViewBox: viewerSvg ? viewerSvg.getAttribute('viewBox') : null,
        viewerFocusRestored: state.viewerTrigger ? document.activeElement === state.viewerTrigger : null,
        errorNotes: errors.length,
        errorTexts: errors.map((node) => node.textContent),
        styleElements: styles.length,
        sourceViews: sourceView.length,
        nonMermaidPre: $('.md-code-block:last-of-type pre') ? true : false,
        bannerTexts: $$('.md-code-block-infostring').map((node) => node.textContent),
      },
      expectedDiagrams: state.expectedDiagrams,
      diagramKinds: DIAGRAMS.map((diagram) => diagram.kind),
      invalidSources: DIAGRAMS.filter((diagram) => diagram.invalid === true).length,
      remounts: state.remounts,
      teardown: {
        tornDown: state.tornDown === true,
        restored: state.teardownRestored === undefined ? null : state.teardownRestored,
      },
      mountEvents: state.mountEvents.slice(-8),
      themeEvents: state.themeEvents.slice(-8),
      errors: state.errors.slice(-8),
      pele: readPeleVars(),
    }
  }

  /**
   * P1 visual facts, measured from the live rendered SVG (not from the source
   * text): these are what the screenshots must be able to prove.
   *
   * Index mapping follows DIAGRAMS order: 4 = CJK flowchart, 5 = classDiagram,
   * 6 = generic labels, 7 = rich labels.
   */
  function diagramFacts() {
    const containers = $$('.dsh-pele-mermaid-diagram')
    const svgAt = (index) => (containers[index] ? $('svg.pele', containers[index]) : null)
    const textsOf = (svg) => (svg ? $$('text', svg).map((node) => node.textContent) : [])
    const hostWidth = (index) => {
      const hosts = containers[index] ? $$('[data-dsh-pele-mermaid-host]', containers[index]) : []
      return hosts[0] ? hosts[0].clientWidth : null
    }

    const cjkSvg = svgAt(4)
    const cjkLabels = cjkSvg
      ? $$('text', cjkSvg).map((text) => {
          const lines = $$('tspan', text)
          return {
            text: text.textContent,
            lines: lines.length,
            lastLine: lines.length ? lines[lines.length - 1].textContent : text.textContent,
          }
        })
      : []
    const cjkWrapped = cjkLabels.filter((entry) => entry.lines > 1)
    const cjkPunctuation = cjkWrapped.find((entry) => /。$/.test(entry.text)) || null

    const classSvg = svgAt(5)
    const classNodes = classSvg ? $$('g.pele-node', classSvg) : []
    const classRowTops = new Set(
      classNodes.map((node) => {
        const match = /translate\(\s*[-\d.]+[, ]+([-\d.]+)/.exec(node.getAttribute('transform') || '')
        return match ? Math.round(Number(match[1])) : 0
      }),
    )

    const genericSvg = svgAt(6)
    const genericTexts = textsOf(genericSvg)

    const richSvg = svgAt(7)
    const richSpans = richSvg ? $$('tspan', richSvg) : []
    const richMono = richSvg
      ? $$('text, tspan', richSvg).filter((node) =>
          String(node.getAttribute('font-family') || '').includes('--_fm'),
        )
      : []

    return {
      cjk: {
        width: numberAttribute(cjkSvg, 'width'),
        height: numberAttribute(cjkSvg, 'height'),
        hostWidth: hostWidth(4),
        wrappedLabels: cjkWrapped.length,
        maxLines: cjkLabels.reduce((max, entry) => Math.max(max, entry.lines), 0),
        punctuationKept: cjkPunctuation ? /。[\s]*$/.test(cjkPunctuation.lastLine) : null,
        labels: cjkLabels.map((entry) => entry.text),
      },
      class: {
        width: numberAttribute(classSvg, 'width'),
        height: numberAttribute(classSvg, 'height'),
        hostWidth: hostWidth(5),
        classNodes: classNodes.length,
        rows: classRowTops.size,
      },
      generic: {
        width: numberAttribute(genericSvg, 'width'),
        height: numberAttribute(genericSvg, 'height'),
        hostWidth: hostWidth(6),
        labels: genericTexts.filter((text) => text.trim() !== ''),
        angleBracketsIntact:
          genericTexts.some((text) => text.includes('List<Diagram>')) &&
          genericTexts.some((text) => text.includes('Map<String, Diagram>')),
      },
      rich: {
        width: numberAttribute(richSvg, 'width'),
        height: numberAttribute(richSvg, 'height'),
        hostWidth: hostWidth(7),
        sub: richSpans.filter((span) => span.getAttribute('baseline-shift') === 'sub').length,
        sup: richSpans.filter((span) => span.getAttribute('baseline-shift') === 'super').length,
        mono: richMono.length,
        labels: textsOf(richSvg).filter((text) => text.trim() !== ''),
      },
    }
  }

  function reportText(report) {
    const lines = [
      `fixture       ${state.fixture}`,
      `page theme    ${report.theme} (body[data-ds-dark-theme]=${report.darkAttribute})`,
      `body bg/color ${report.bodyBackground} / ${report.bodyColor}`,
      `registration  id=${JSON.stringify(report.registrationId)} factory=${report.factoryType}`,
      `exports       ${JSON.stringify(report.exportsFace)}`,
      `apply         applied=${report.applied} effectCalls=${report.effectCalls} ready=${report.ready}`,
      `require calls ${report.requireCalls} (must be 0: Pele is bundled)`,
      `dom           blocks=${report.dom.blocks} diagrams=${report.dom.mountedContainers} svg.pele=${report.dom.diagramSvgs}`,
      `              types=[${report.dom.svgTypes.join(', ')}] zoomIcons=${report.dom.zoomIconSvgs} toolbars=${report.dom.toolbars} buttons=${report.dom.toolbarButtons}`,
      `              aria-pressed=[${report.dom.ariaPressed.join(', ')}] labels=[${report.dom.toolbarLabels.join(', ')}]`,
      `              perDiagramButtons=[${report.dom.toolbarButtonsPerDiagram.join(', ')}] icons=${report.dom.iconButtons} download=${report.dom.downloadButtons} fullscreen=${report.dom.fullscreenButtons} disabled=${report.dom.disabledToolbarButtons}`,
      `              widths=[${report.dom.diagramWidths.join(', ')}] hosts=[${report.dom.hostWidths.join(', ')}]`,
      `              viewer open=${report.dom.viewerOpen} overlays=${report.dom.viewerOverlays} dialogs=${report.dom.viewerDialogs} viewerButtons=${report.dom.viewerToolbarButtons} viewBox=${report.dom.viewerViewBox} focusRestored=${report.dom.viewerFocusRestored}`,
      `              errorNotes=${report.dom.errorNotes} styleElements=${report.dom.styleElements}`,
      `remounts      ${report.remounts} total svg.pele additions (${report.expectedDiagrams} expected initially; a font change re-adds that many)`,
      `theme changes ${report.themeEvents.length}`,
      `mount events  ${JSON.stringify(report.mountEvents.map((event) => event.count))}`,
      `teardown      tornDown=${report.teardown.tornDown} restoredThreadByteIdentical=${report.teardown.restored}`,
    ]
    if (report.pele) {
      const { vars } = report.pele
      lines.push(
        `--pele-bg     ${vars['--pele-bg']}`,
        `--pele-fg     ${vars['--pele-fg']}`,
        `--pele-line   ${vars['--pele-line']}`,
        `--pele-border ${vars['--pele-border']}`,
        `--pele-accent ${vars['--pele-accent']}`,
        `--pele-radius ${vars['--pele-radius']}`,
        `--pele-font    ${vars['--pele-font']}`,
        `--pele-font-mono ${vars['--pele-font-mono']}`,
        `container bg  ${report.pele.backgroundColor}`,
      )
    }
    if (report.dom.errorTexts.length) lines.push(`error text    ${JSON.stringify(report.dom.errorTexts[0])}`)
    if (report.errors.length) lines.push(`fixture errors ${JSON.stringify(report.errors)}`)
    return lines.join('\n')
  }

  let reportQueued = false
  function updateReport() {
    const report = collectReport()
    state.lastReport = report
    const node = $('#report')
    if (node) node.textContent = reportText(report)
    const status = $('#status')
    if (status) {
      status.textContent = state.ready
        ? `ready · ${report.dom.diagramSvgs} diagrams · ${report.dom.errorNotes} source fallback`
        : state.applied
          ? 'settling…'
          : 'booting…'
    }
    return report
  }

  function scheduleReport() {
    if (reportQueued) return
    reportQueued = true
    setTimeout(() => {
      reportQueued = false
      updateReport()
    }, 50)
  }

  /* ------------------------------------------------------------------ *
   * Fake Cordis context: the plugin injects only the public `theme`    *
   * service and uses ctx.effect() / ctx.on() for lifecycle ownership.  *
   * ------------------------------------------------------------------ */

  function makeContext() {
    const ctx = {
      effect(fn) {
        state.effectCalls += 1
        const disposer = fn()
        if (typeof disposer === 'function') state.effectDisposer = disposer
        return () => {
          if (typeof disposer === 'function') disposer()
        }
      },
      on(event, callback) {
        if (event === 'theme/change') {
          state.themeHandlers += 1
          state.themeHandlersList.push(callback)
        }
        const off = () => {
          state.themeHandlersList = state.themeHandlersList.filter((entry) => entry !== callback)
        }
        return off
      },
      get(name) {
        if (name === 'theme') {
          return {
            getTheme: () => JSON.parse(JSON.stringify(state.fontSnapshot)),
          }
        }
        return undefined
      },
    }
    return ctx
  }

  /* ------------------------------------------------------------------ *
   * Boot: fake module loader -> eval built bundle -> factory -> apply. *
   * ------------------------------------------------------------------ */

  GLOBAL.__ModuleLoader__ = {
    load(registration) {
      state.registration = registration
      state.registrationId = registration && registration.id
    },
  }

  function bootBundle() {
    const registration = state.registration
    if (!registration || typeof registration.factory !== 'function') {
      state.errors.push('__ModuleLoader__.load never received a factory')
      updateReport()
      return
    }
    state.factoryType = typeof registration.factory

    let exportsObject
    try {
      exportsObject = registration.factory((specifier) => {
        state.requireCalls += 1
        throw new Error('bundled client called require(' + specifier + '); it must be dependency-free')
      })
    } catch (error) {
      state.errors.push('factory threw: ' + (error && error.message))
      updateReport()
      return
    }

    state.exportsFace = {
      apply: typeof exportsObject.apply,
      inject: Array.isArray(exportsObject.inject) ? exportsObject.inject : null,
    }
    if (typeof exportsObject.apply !== 'function') {
      state.errors.push('factory did not return an apply() function')
      updateReport()
      return
    }

    try {
      state.applyCalls += 1
      exportsObject.apply(makeContext())
      state.applied = true
    } catch (error) {
      state.errors.push('apply threw: ' + (error && error.message))
    }
    state.bundleLoaded = true
    updateReport()

    const startedAt = Date.now()
    const poll = setInterval(() => {
      const count = $$('[data-dsh-pele-mermaid-host] svg.pele').length
      if (count >= state.expectedDiagrams) {
        state.ready = true
        clearInterval(poll)
        updateReport()
        return
      }
      if (Date.now() - startedAt > 8000) {
        state.errors.push('timed out waiting for ' + state.expectedDiagrams + ' svg.pele (saw ' + count + ')')
        clearInterval(poll)
        updateReport()
      }
    }, 100)
  }

  function loadBundleScript() {
    const script = document.createElement('script')
    script.src = '../../lib/client.js'
    script.async = true
    script.onload = () => {
      try {
        bootBundle()
      } catch (error) {
        state.errors.push('boot threw: ' + (error && error.message))
        updateReport()
      }
    }
    script.onerror = () => {
      state.errors.push('failed to load ../../lib/client.js — run `npm run build` first')
      updateReport()
    }
    document.head.appendChild(script)
  }

  /* ------------------------------------------------------------------ *
   * Public harness API used by the verification commands.              *
   * ------------------------------------------------------------------ */

  GLOBAL.__fixture = {
    state,
    report: collectReport,
    reportText: () => reportText(collectReport()),
    updateReport,
    applyTheme,
    toggleTheme() {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark')
    },
    clickSource(index = 0) {
      const container = $$('.dsh-pele-mermaid-diagram')[index]
      const buttons = container ? $$('.dsh-pele-mermaid-toolbar button', container) : []
      if (buttons[1]) buttons[1].click()
      updateReport()
    },
    clickDiagram(index = 0) {
      const container = $$('.dsh-pele-mermaid-diagram')[index]
      const buttons = container ? $$('.dsh-pele-mermaid-toolbar button', container) : []
      if (buttons[0]) buttons[0].click()
      updateReport()
    },
    /**
     * Open the fullscreen viewer for one diagram through its toolbar button.
     * Focus is moved to the trigger first so the viewer's saved-focus and
     * focus-restore path is exercised even when the click is synthetic.
     */
    openViewer(index = 0) {
      const container = $$('.dsh-pele-mermaid-diagram')[index]
      const buttons = container ? $$('.dsh-pele-mermaid-toolbar button', container) : []
      const trigger = buttons[3]
      if (!trigger) return false
      trigger.focus()
      trigger.click()
      state.viewerTrigger = trigger
      updateReport()
      return true
    },
    /** Close the overlay through its own close control (Escape is tested separately). */
    closeViewer() {
      const buttons = $$('.dsh-pele-mermaid-viewer-toolbar button')
      const close = buttons[3]
      if (!close) return false
      close.click()
      updateReport()
      return true
    },
    /** Scroll one diagram card into view (used for the narrow-column capture). */
    scrollToDiagram(index = 0) {
      const container = $$('.dsh-pele-mermaid-diagram')[index]
      if (!container) return false
      const top = container.getBoundingClientRect().top + (window.scrollY || 0) - 72
      window.scrollTo(0, Math.max(0, top))
      return true
    },
    diagramFacts,
    /** Anchors for assertions in scripts/verify-visual.mjs. */
    EXPECTED_DIAGRAMS: state.expectedDiagrams,
    emitTheme(change) {
      const snapshot = JSON.parse(JSON.stringify(state.fontSnapshot))
      if (change === 'font') {
        snapshot.fontSizes = Object.assign({}, snapshot.fontSizes, { code: 15 })
        snapshot.fontFamilies = Object.assign({}, snapshot.fontFamilies, { code: 'ui-monospace' })
        state.fontSnapshot = snapshot
      }
      for (const handler of state.themeHandlersList.slice()) {
        try {
          handler(snapshot)
        } catch (error) {
          state.errors.push('theme handler threw: ' + (error && error.message))
        }
      }
      state.themeEvents.push({ emit: change || 'same-fonts', at: Math.round(performance.now()) })
      setTimeout(updateReport, 500)
      return snapshot
    },
    teardown() {
      const disposer = state.effectDisposer
      if (typeof disposer !== 'function') {
        state.errors.push('no ctx.effect() disposer was captured')
        return false
      }
      disposer()
      state.tornDown = true
      state.teardownRestored = $('#thread').innerHTML === state.prePluginThreadHtml
      updateReport()
      return state.teardownRestored
    },
  }

  /* ------------------------------------------------------------------ *
   * Start.                                                             *
   * ------------------------------------------------------------------ */

  try {
    const themeButton = $('#theme-toggle')
    if (themeButton) {
      themeButton.addEventListener('click', () => {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark')
      })
    }
    applyTheme(query.get('theme') === 'dark' ? 'dark' : 'light')
    buildThread()
    installRemountCounter()
    updateReport()
    // Byte-identical pre-plugin snapshot of the plugin-owned region: teardown
    // must restore exactly this. (The fixture's own status/report panel keeps
    // updating, so body.innerHTML would legitimately differ.)
    state.prePluginThreadHtml = $('#thread').innerHTML
    loadBundleScript()
  } catch (error) {
    state.errors.push('fixture init failed: ' + (error && error.message))
    updateReport()
  }
})()
