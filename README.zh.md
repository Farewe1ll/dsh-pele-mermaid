# dsh-pele-mermaid

用 [Pele](https://pele.run) 在 DeepSeek Harness（DSH）Web 对话中渲染 Mermaid 图表。Pele 是同步、零运行时依赖的 Mermaid 渲染器。

> **解耦保证。** 这是一个标准的 DSH **bundle 插件**，独立成包。它不修改、不 fork、不在运行时 import DSH 源码；渲染器随包提供，图表图片加载已关闭。插件行被禁用或未安装时，DSH 与出厂状态完全一致：无启动图条目、无样式、无观察器、无 DOM 改动。启用时，源码短暂稳定的 `mermaid`（以及显式的 `mermaidjs` / `mmd`）代码块会尝试渲染为可交互的 Pele 图表。

未发布的查看器画布调整另有[验证记录](docs/VERIFICATION.md#0-current-viewer-stage-update--2026-11-17)：147 项测试通过，并通过桌面及矮窗口浏览器检查。下方此前记录的 bundle 大小与测试数量保留为历史数据。

## 为什么用 Pele

- **同步渲染、零运行时依赖** —— 整包打进一个浏览器脚本，无 CDN、无异步引擎、无 `mermaid` 全局变量；图表图片资源关闭，不会自动抓取图片。
- **CSS 变量主题** —— 图表读取 `--pele-*` 变量，本插件把它们映射到 DSH 的 `--dsw-*` token。明暗/主题切换只走 CSS，**不会重渲染图表**。
- **Pele 1.9 的标签/布局修复** —— 中文标签在字符之间换行而不是把图表撑宽，收尾标点跟随前一行，类图分组在窄栏自动换行，`List<T>`/`Map<K,V>` 与富文本标签（`<sub>`、`<sup>`、`<code>`、`<kbd>`、`<samp>`）正常渲染。
- **可交互** —— 开启 Pele `mount()` 的缩放、平移与键盘操作，窄栏里的宽图也能探索；全屏查看器可让图表占满窗口。
- **可移植导出** —— 把整张图下载为独立的、经清理的 SVG，在 DSH 之外打开时保持相同的几何尺寸与配色。
- **安全处理不可信图表** —— Pele 转义文本、过滤链接与样式、限制源/SVG/边数。图表作者无法传入 options，也无法注入图标。

## 安装

DSH 插件按 profile 安装。本版本是 `0.2.0` 工作构建；从本仓库检出安装（GitHub Release tarball 属于尚未完成的发布步骤）。

```sh
# Web profile（首次使用会从出厂模板自动初始化）
dsh plugin --profile web add /path/to/dsh-pele-mermaid

# Desktop profile：使用 Desktop 应用安装的 dsh 命令（应用自带 runtime）。
# 独立的 @deepseek-ai/dsh CLI 不能管理 desktop profile（仍可管理 web）。
dsh plugin --profile desktop add /path/to/dsh-pele-mermaid
```

打包 tarball、npm 或 git 源同理：

```sh
dsh plugin --profile web add ./dsh-pele-mermaid-0.2.0.tgz
dsh plugin --profile web add dsh-pele-mermaid
```

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

主题/明暗切换纯 CSS；源码变化、宿主节点替换及字体输入变化可能重建图表。Appearance 字号尚未传给 Pele：字号事件会请求重建，但不会改变 Pele 默认的 16 px。扫描与字体刷新之间仍有调度竞争，详见[已知限制](docs/KNOWN-LIMITATIONS.md)。想微调图表配色，在自己的样式表里覆盖 `.dsh-pele-mermaid-diagram` 上的 `--pele-*` 即可，无需改插件代码。导出的 SVG 在下载时固化已解析变量，因此保留当前主题，但不会跟随之后的主题切换；全屏查看器相反，它在打开期间保留 token 表达式并跟随实时主题切换。

## 安全

- 图表源码来自不可信的助手输出。Pele 转义文本、过滤链接与样式；`javascript:`、`data:`、`vbscript:` 永远拦截；默认允许 `http`、`https`、`mailto`、`tel` 链接。
- 本插件不传任何作者可控 options、不注入图标、不注入 HTML；错误信息用 `textContent` 渲染。
- 限制使用 Pele 默认值：源码 50,000 字符、SVG 4,000,000 字符、5,000 条边。超限回退为源码。
- 无遥测、不下载外部渲染器。`images: false` 关闭远程、相对及根相对图片资源；过滤后的 `<a href>` 由用户点击激活。浏览器证据只覆盖 fixture 样例，不是对所有未来渲染功能的穷尽证明。
- 导出的 SVG 采用保守白名单清理，按构造不含远程资源；但会保留 `https`/`mailto`/`tel` 链接，读者点击时仍可导航。

## 兼容性

- **已验证目标**：DSH `0.2.1-rc.2`、React/React DOM `18.3.1`（即 `0.1.1` / `0.2.1-rc.2` 行）。安装包宿主组件探针也在 DSH `0.2.2-rc.3` 上运行并通过，但它是对已安装 CodeBlock 的 fixture 适配器探针，不是实时聊天会话。**DSH `0.2.2` 仍待验证**：不要假定端到端可用，目前不声明 `0.2.2` 兼容行。已安装的 Desktop profile 仍运行插件 `0.1.1`，本次 `0.2.0` 迭代没有替换它。
- 除公开的 `theme` 服务与 Markdown DOM 外，通用横幅识别依赖私有 React Fiber 字段；这些字段对版本敏感，语言不可读时保留原生代码块。宿主探针按已安装前端版本解析压缩后的绑定，未知版本给出可操作的错误；在声明新宿主兼容前需重跑探针。
- 除 DOM 观察外，每秒检查一次纯 props 变化；后台计时器节流可能增加延迟。剩余风险见[已知限制](docs/KNOWN-LIMITATIONS.md)。
- 内置 Pele `1.9.0`（MIT），精确锁定版本。Mermaid 语法覆盖跟随 Pele：Mermaid 12.1.0 内置的全部图表类型。
- 不要与其他 Mermaid 围栏渲染插件同时启用，两个插件会争抢同一批代码块。

## 已验证

完整证据见 `docs/VERIFICATION.md`；`0.2.0` 的实测要点（`lib/client.js` 739,526 字节，SHA-256
`906b1cc2f77c99a41e8453d85bd1554e60ff36b7a9d12558b3e998a56f1ea4af`）：

- **123 个自动化测试**（`npm test`）：123 通过、0 失败、0 跳过 —— 引擎、主题 CSS、代码块管理器、导出、查看器、宿主绑定、真实 React 18.3.1 生命周期和构建产物冒烟。`npm run verify` 还会在 `lib/client.js` 过期时失败。
- **宿主探针**（`npm run verify:host`）：在 DSH `0.2.2-rc.3` 上 PASS（前端资源 `index-Ciz7DZxv.js`，1,093,870 字节，SHA-256 `65411dab…92d308b`），六项检查：已提交 props、仅挂载 mermaid、卸载后 props 消失、卡片横幅 + 宿主 Copy、plain/static/streaming 三种源码结构与 Copy 一致性。样式、工具栏与分词辅助函数使用 fixture 适配器，不代表完整运行中宿主的端到端验证。
- **真实浏览器**（`DSH_VISUAL_CHROME_NO_SANDBOX=1 npm run verify:visual`，headless Chrome 157.0.8103.79）：八个图表（含 Pele 1.9 的中文换行、类图分组、泛型标签、富文本标签用例）、四按钮工具栏、明暗切换**零重渲染**、源码切换保留同一宿主 `<pre>`、全屏查看器（打开/缩放/适应/Esc/焦点）、720×2200 窄栏截图、十张留档截图，以及只移除插件新增节点的销毁验证。浏览器运行还会在明暗主题下捕获真实的下载 SVG 字节（背景矩形等于解析后的 `--pele-bg`：`#f9fafb` / `#1b1b1c`），把深色导出渲染到白色替代页面上，并在查看器打开时切换主题，确认图表与对话框同步重绘。
- **P6 决策：`0.2.0` 不采用懒加载** —— Pele 继续内联打包。raw / gzip / brotli 分别为 739,526 / 276,084 / 223,848 字节；本地路由下 bundle 请求+求值约 34 ms 内完成，首个图表冷启动约 395 ms、热加载约 370 ms（主要来自 150 ms 扫描去抖 + 180 ms 稳定窗口）。未测得已安装路由的编码/缓存指标，也没有构建拆分原型来测量首图回归，因此路线图的采纳条件无法满足。证据：`docs/evidence/2026-11-17/p6-measurement.json`。
- **「关闭 = 完全正常」**（`0.1.1` 历史安装记录）：禁用该行后启动图零插件条目、index HTML 零出现、旧 bundle 路由 404；禁用后的启动图与全新卸载的 profile 结构完全一致。
- **未验证**：DSH `0.2.2` 的实时对话（P0）—— 曾向运行中的会话发送样例，但未获得桌面截图授权，因此没有留存证据。打包/安装路径（tarball、served route、禁用/卸载）已在隔离 profile 中验证；发布步骤会重新打包最终 bundle，针对该 tarball 的实时回归仍待完成，见兼容性一节。

## 开发

```sh
npm install
npm run build      # 构建 lib/client.js（esbuild，内联 Pele 1.9.0）
npm test           # node:test 单测（引擎、主题 CSS、代码块、导出、查看器）
npm run verify     # build --check + bundle 冒烟测试
npm run verify:host # 安装包 CodeBlock 探针（需 macOS 应用）
npm run verify:visual # 隔离 Chrome 截图与配套 JSON
```

在渲染器沙箱无法启动的受限环境中，用 `DSH_VISUAL_CHROME_NO_SANDBOX=1` 运行视觉验证（只添加 `--no-sandbox --disable-setuid-sandbox`）；正常运行保留 Chrome 沙箱。

`docs/ARCH.md` 记录模块契约、Markdown DOM 结构、打包 wrapper、导出/查看器内部实现、宿主探针版本映射与禁用/清理保证；`docs/VERIFICATION.md` 记录当前证据与复现步骤；[CHANGELOG.md](CHANGELOG.md) 列出 `0.2.0` 变更。

## License

MIT。Pele 亦为 MIT，详见其仓库。
