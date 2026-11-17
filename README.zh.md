# dsh-pele-mermaid

用 [Pele](https://pele.run) 在 DeepSeek Harness（DSH）Web 对话中渲染 Mermaid 图表。Pele 是同步、零运行时依赖的 Mermaid 渲染器。

> **解耦保证。** 这是一个标准的 DSH **bundle 插件**，独立成包。它不修改、不 fork、不在运行时 import DSH 源码；渲染器随包提供，图表图片加载已关闭。插件行被禁用或未安装时，DSH 与出厂状态完全一致：无启动图条目、无样式、无观察器、无 DOM 改动。启用时，源码短暂稳定的 `mermaid`（以及显式的 `mermaidjs` / `mmd`）代码块会尝试渲染为可交互的 Pele 图表。

当前发布候选版本：**0.2.0**。当前 bundle 身份与检查结果见[验证记录](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/VERIFICATION.md)。

## 为什么用 Pele

- **同步渲染、零运行时依赖** —— 整包打进一个浏览器脚本，无 CDN、无异步引擎、无 `mermaid` 全局变量；图表图片资源关闭，不会自动抓取图片。
- **CSS 变量主题** —— 图表读取 `--pele-*` 变量，本插件把它们映射到 DSH 的 `--dsw-*` token。明暗/主题切换只走 CSS，**不会重渲染图表**。
- **Pele 1.9 的标签/布局修复** —— 中文标签在字符之间换行而不是把图表撑宽，收尾标点跟随前一行，类图分组在窄栏自动换行，`List<T>`/`Map<K,V>` 与富文本标签（`<sub>`、`<sup>`、`<code>`、`<kbd>`、`<samp>`）正常渲染。
- **可交互** —— 开启 Pele `mount()` 的缩放、平移与键盘操作，窄栏里的宽图也能探索；全屏查看器可让图表占满窗口。
- **可移植导出** —— 把整张图下载为独立的、经清理的 SVG，在 DSH 之外打开时保持相同的几何尺寸与配色。
- **安全处理不可信图表** —— Pele 转义文本、过滤链接与样式、限制源/SVG/边数。图表作者无法传入 options，也无法注入图标。

## 安装

DSH 插件按 profile 安装。`0.2.0` 已按 npm 分发准备，实际发布另行执行；发布前使用本地 tarball 或源码目录安装。

```sh
# 在仓库目录执行：安装锁定依赖，验证并生成 .tgz
npm ci
npm pack

# Web profile（首次使用会自动初始化）
dsh plugin --profile web add ./dsh-pele-mermaid-0.2.0.tgz

# Desktop：使用应用安装的 dsh 命令，安装后重启应用
dsh plugin --profile desktop add ./dsh-pele-mermaid-0.2.0.tgz
```

npm 发布后可按固定版本安装：

```sh
dsh plugin --profile web add dsh-pele-mermaid@0.2.0
dsh plugin --profile desktop add dsh-pele-mermaid@0.2.0
```

源码目录也可安装：`dsh plugin --profile web add /path/to/dsh-pele-mermaid`。
独立的 `@deepseek-ai/dsh` CLI 可管理 web profile；desktop profile 使用应用自带 CLI。

安装、卸载或切换该行后请重启 profile / Desktop 应用：客户端启动图在 Host 启动时组装，普通页面刷新不会重新读取已变化的 loader 行。

### CLI 无法管理 profile 时

- **提示 profile 未初始化（uninitialized）**：先打开一次 Desktop 应用让它创建 profile，完全退出后再重试命令。不要把这个方法用于锁（lock）错误。
- **提示锁（lock）**：关闭占用 profile 的应用/进程后重试。不要把未初始化的方法用于锁。
- 其他情况：安装后重启应用或刷新 profile 页面。

bundle 层只插入一行 Loader 行（`id: dsh-pele-mermaid`），包的 `dsh.client` 声明让 DSH 在 `/plugins/dsh-pele-mermaid/client.js` 提供浏览器半侧。

### 关闭 / 卸载

```yaml
# profile 的 cordis.patch.yml：保留包，禁用行
- id: dsh-pele-mermaid
  name: dsh-pele-mermaid
  disabled: true
```

或彻底移除：

```sh
dsh plugin --profile web remove dsh-pele-mermaid
```

两种方式都会让 DSH 回到未修改行为。本插件从不改写数据、会话内容或 Markdown 源码。

## 渲染行为

显式围栏语言（不区分大小写，仅取第一个词）：

| 围栏 info 字符串 | 行为 |
| --- | --- |
| `mermaid` | 用 Pele 渲染（工具栏、导出、全屏） |
| `mermaidjs` | 用 Pele 渲染 —— 显式别名 |
| `mmd` | 用 Pele 渲染 —— 显式别名 |
| 其他 | 保持宿主渲染结果不变 |

- 只处理源码稳定 180 ms 的上述显式围栏。该窗口用于减少流式输出的半成品；较长停顿仍可能显示未完成图表。没有任何源码启发式猜测，也不嗅探 `language-*` class；`mmdx`、`mermaid.js`、`mermaid-js`、`mermaidjsx` 等近似名称保持原生。
- 每张图带一个小工具栏：**图表 / 源码** 切换，外加两个本地化图标按钮 **下载 SVG** 与 **全屏**。DSH 代码块横幅与其复制按钮继续可用；原始 `<pre>` 保留在 React 原有位置，图表视图只临时隐藏它。
- **下载 SVG** 保存为 `pele-<type>-YYYYMMDD-HHmmss.svg`，基于 Pele 的原始渲染结果（不是被缩放/平移修改过的内联 SVG），因此总是整张图、自然尺寸（内联缩放/平移不会裁剪导出文件），并把解析后的 `--pele-*` 主题变量写到根元素上。导出文件最前面会插入一个覆盖整个自然画布的矩形背景，填充解析后的 `--pele-bg`，因此深色主题导出在白色独立页面上仍然可读，而不是透明背景上的浅色文字；文件保留保存时的配色。克隆会清理：脚本、事件属性、`foreignObject`、iframe/object/embed、媒体与 image 元素、`src`、不安全的 `style`/`url()` 都会被移除；保留 `https`/`mailto`/`tel`/`#` 链接。图表渲染出来之前按钮禁用。
- **全屏** 打开一个复用的浮层对话框，以当前内联缩放比例打开，提供缩小 / 放大 / 适应窗口 / 关闭。SVG 视口铺满查看区域的内容盒：适应窗口时完整居中显示图表，放大后使用整个视口而不拉伸图形；小于视口的轴保持居中，大于视口的轴允许在边界内平移。窗口变化时保留相对适应窗口的倍率，并在边界允许时保留图表坐标中的视口中心。普通滚轮忽略；Ctrl/Cmd + 滚轮在指针处缩放；拖拽平移并限制在图表范围内；Esc 关闭；Tab 焦点被限制在对话框内并在关闭后回到触发按钮；背景滚动被锁定并在关闭后恢复原位置；尊重 `prefers-reduced-motion`。查看器复用清理后的 SVG，从不重渲染 Pele。它保留 `var(--dsw-*)` token 表达式而不是固化颜色，因此打开着的查看器会在宿主主题切换时同步重绘图表背景与对话框外观。
- Pele 无法绘制（语法/超限）时，保留原代码块并显示一行纯文本错误提示；源码变化后自动重试，该块的导出与全屏保持禁用。
- 语言识别对齐真实聊天 DOM：Shiki 不能高亮的围栏，DSH 显示的是本地化通用标签（`代码块` / `Code`）而不是 `mermaid`，插件优先读取已提交 React Fiber 中的精确 `lang`/`code`；仅在这些 props 不可读时回退到非通用横幅。无法明确确认显式别名语言时保持原生代码块。
- 其他内容（非 Mermaid 围栏、行内代码）保持不动。Pele 过滤用户点击的链接，图表图片资源通过 `images: false` 关闭。

## 主题

插件样式表在每个图表容器上把 Pele 变量映射到 DSH 设计 token，例如：

| Pele 变量 | DSH token |
| --- | --- |
| `--pele-bg` | `--dsw-alias-markdown-code-block` |
| `--pele-fg` | `--dsw-alias-label-primary` |
| `--pele-line` | `--dsw-alias-label-secondary` |
| `--pele-border` | `--dsw-alias-border-l2` |
| `--pele-accent` | `--dsw-alias-brand-primary` |
| `--pele-error` | `--dsw-alias-state-error-primary` |
| `--pele-font` / `--pele-font-mono` | `--dsw-font-family` / DSH 代码字体栈 |
| `--pele-radius` | `--dsw-radius-md` |

主题/明暗切换纯 CSS；源码变化、宿主节点替换及字体输入变化可能重建图表。Appearance 字号尚未传给 Pele：字号事件会请求重建，但不会改变 Pele 默认的 16 px。扫描与字体刷新之间仍有调度竞争，详见[已知限制](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/KNOWN-LIMITATIONS.md)。想微调图表配色，在自己的样式表里覆盖 `.dsh-pele-mermaid-diagram` 上的 `--pele-*` 即可，无需改插件代码。导出的 SVG 在下载时固化已解析变量，因此保留当前主题，但不会跟随之后的主题切换；全屏查看器相反，它在打开期间保留 token 表达式并跟随实时主题切换。

## 安全

- 图表源码来自不可信的助手输出。Pele 转义文本、过滤链接与样式；`javascript:`、`data:`、`vbscript:` 永远拦截；默认允许 `http`、`https`、`mailto`、`tel` 链接。
- 本插件不传任何作者可控 options、不注入图标、不注入 HTML；错误信息用 `textContent` 渲染。
- 限制使用 Pele 默认值：源码 50,000 字符、SVG 4,000,000 字符、5,000 条边。超限回退为源码。
- 无遥测、不下载外部渲染器。`images: false` 关闭远程、相对及根相对图片资源；过滤后的 `<a href>` 由用户点击激活。浏览器证据只覆盖 fixture 样例，不是对所有未来渲染功能的穷尽证明。
- 导出的 SVG 采用保守白名单清理，按构造不含远程资源；但会保留 `https`/`mailto`/`tel` 链接，读者点击时仍可导航。

## 兼容性

- **已检查的集成范围**：DSH `0.2.2-rc.3` 已安装 CodeBlock 组件探针，以及隔离 web profile 的 tarball 安装、资源路由、禁用和卸载检查。React 生命周期测试使用 `18.3.1`。准确范围与产物身份见[验证记录](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/VERIFICATION.md)。
- 除公开的 `theme` 服务与 Markdown DOM 外，通用横幅识别依赖私有 React Fiber 字段；这些字段对版本敏感，语言不可读时保留原生代码块。宿主探针按已安装前端版本解析压缩后的绑定，未知版本给出可操作的错误；在声明新宿主兼容前需重跑探针。
- 除 DOM 观察外，每秒检查一次纯 props 变化；后台计时器节流可能增加延迟。剩余风险见[已知限制](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/KNOWN-LIMITATIONS.md)。
- 内置 Pele `1.9.0`（MIT），精确锁定版本。Mermaid 语法覆盖跟随 Pele：Mermaid 12.1.0 内置的全部图表类型。
- 不要与其他 Mermaid 围栏渲染插件同时启用，两个插件会争抢同一批代码块。

## 已验证

当前 bundle 为 **739,776 字节**，SHA-256：
`1862b3d0363c068f940fe660569cdafb23e5b608200477ab61f5215ef41379cb`。

- 自动化测试覆盖渲染、源码所有权、React 生命周期、导出、查看器、清理和发布保护。
- `npm run verify` 在内存中重建并比较已提交 bundle，再运行构建产物冒烟测试。
- `npm run verify:package` 实际打包并解包临时 tarball，检查十文件清单、完整第三方声明、文件字节一致性及 Host / Client 入口。
- 宿主探针用 fixture 适配器运行 DSH `0.2.2-rc.3` 的真实 CodeBlock；隔离 profile 检查安装、bundle 路由、禁用后 404，以及禁用与卸载后的启动图一致性。

[当前结果](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/VERIFICATION.md)与[历史测量](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/VERIFICATION-2026-11-17-BASELINE.md)分开维护；复现和发布步骤见[发布清单](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/RELEASING.md)。

## 开发

```sh
npm ci
npm run build      # 构建 lib/client.js（esbuild，内联 Pele 1.9.0）
npm test           # node:test 单测（引擎、主题 CSS、代码块、导出、查看器）
npm run verify     # build --check + bundle 冒烟测试
npm run verify:host # 安装包 CodeBlock 探针（需 macOS 应用）
npm run verify:visual # 隔离 Chrome 截图与配套 JSON
npm run verify:release # 全量测试 + 构建一致性 + 实际打包检查
```

在渲染器沙箱无法启动的受限环境中，用 `DSH_VISUAL_CHROME_NO_SANDBOX=1` 运行视觉验证（只添加 `--no-sandbox --disable-setuid-sandbox`）；正常运行保留 Chrome 沙箱。

`docs/ARCH.md` 记录模块契约、Markdown DOM 结构、打包 wrapper、导出/查看器内部实现、宿主探针版本映射与禁用/清理保证；`docs/VERIFICATION.md` 记录当前证据与复现步骤；[CHANGELOG.md](CHANGELOG.md) 列出 `0.2.0` 变更。

开发使用 mise 管理的最新 Node LTS（`mise use node@lts`），CI 跟随 `lts/*`；用户安装的是预构建 bundle，不需要开发依赖。
`npm pack` 与从目录执行的 `npm publish` 会通过 `prepack` 自动运行 `verify:release`。CI 执行相同检查，依赖 Desktop 安装的宿主探针在本地运行。

## License

MIT。[THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) 包含完整 Pele MIT 与内置 Lucide 图标 ISC 声明。
