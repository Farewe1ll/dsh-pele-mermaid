# dsh-pele-mermaid

用 [Pele](https://pele.run) 在 DeepSeek Harness（DSH）Web 对话中渲染 Mermaid 图表。Pele 是同步、零运行时依赖的 Mermaid 渲染器。

> **解耦保证。** 这是一个标准的 DSH **bundle 插件**，独立成包。它不修改、不 fork、不在运行时 import DSH 源码；渲染器随包提供，图表图片加载已关闭。插件行被禁用或未安装时，DSH 与出厂状态完全一致：无启动图条目、无样式、无观察器、无 DOM 改动。启用时，源码短暂稳定的 ` ```mermaid ` 代码块会尝试渲染为可交互的 Pele 图表。

## 为什么用 Pele

- **同步渲染、零运行时依赖** —— 整包打进一个浏览器脚本，无 CDN、无异步引擎、无 `mermaid` 全局变量；图表图片资源关闭，不会自动抓取图片。
- **CSS 变量主题** —— 图表读取 `--pele-*` 变量，本插件把它们映射到 DSH 的 `--dsw-*` token。明暗/主题切换只走 CSS，**不会重渲染图表**。
- **可交互** —— 开启 Pele `mount()` 的缩放、平移与键盘操作，窄栏里的宽图也能探索。
- **安全处理不可信图表** —— Pele 转义文本、过滤链接与样式、限制源/SVG/边数。图表作者无法传入 options，也无法注入图标。

## 安装

DSH 插件按 profile 安装。在本仓库目录执行：

```sh
# Web profile（首次使用会从出厂模板自动初始化）
dsh plugin --profile web add /path/to/dsh-pele-mermaid

# Desktop profile：使用 Desktop 安装的 dsh 命令（应用自带 runtime），
# 安装后重启应用，让 Host 重新扫描 loader 行。
dsh plugin --profile desktop add /path/to/dsh-pele-mermaid
```

打包 tarball、npm 或 git 源同理：

```sh
dsh plugin --profile web add ./dsh-pele-mermaid-0.1.1.tgz
dsh plugin --profile web add dsh-pele-mermaid
```

bundle 层只插入一行 Loader 行（`id: dsh-pele-mermaid`），包的 `dsh.client` 声明让 DSH 在 `/plugins/dsh-pele-mermaid/client.js` 提供浏览器半侧。安装、卸载或切换该行后请重启 profile / Desktop 应用：客户端启动图在 Host 启动时组装。

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

- 只处理明确标记为 `mermaid`（不区分大小写）的围栏代码块。源码稳定 180 ms 后尝试渲染，以减少流式输出的半成品；这不等于宿主已结束输出，较长停顿仍可能显示未完成图表或错误提示。
- 每张图带一个小工具栏：**图表 / 源码** 切换。DSH 代码块横幅与其复制按钮继续可用；原始 `<pre>` 保留在 React 原有位置，图表视图只临时隐藏它。
- Pele 无法绘制（语法/超限）时，保留原代码块并显示一行纯文本错误提示；源码变化后自动重试。
- 语言识别对齐真实聊天 DOM：Shiki 不能高亮的围栏，DSH 显示的是本地化通用标签（`代码块` / `Code`）而不是 `mermaid`，插件优先读取已提交 React Fiber 中的精确 `lang`/`code`；仅在这些 props 不可读时回退到非通用横幅。无法明确确认 `mermaid` 时保持原生代码块，不再用源码启发式猜测。
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

主题/明暗切换纯 CSS；源码变化、宿主节点替换及字体输入变化可能重建图表。Appearance 字号尚未传给 Pele：字号事件会请求重建，但不会改变 Pele 默认的 16 px。扫描与字体刷新之间仍有调度竞争，详见[已知限制](docs/KNOWN-LIMITATIONS.md)。想微调图表配色，在自己的样式表里覆盖 `.dsh-pele-mermaid-diagram` 上的 `--pele-*` 即可，无需改插件代码。

## 安全

- 图表源码来自不可信的助手输出。Pele 转义文本、过滤链接与样式；`javascript:`、`data:`、`vbscript:` 永远拦截；默认允许 `http`、`https`、`mailto`、`tel` 链接。
- 本插件不传任何作者可控 options、不注入图标、不注入 HTML；错误信息用 `textContent` 渲染。
- 限制使用 Pele 默认值：源码 50,000 字符、SVG 4,000,000 字符、5,000 条边。超限回退为源码。
- 无遥测、不下载外部渲染器。`images: false` 关闭远程、相对及根相对图片资源；过滤后的 `<a href>` 由用户点击激活。浏览器证据只覆盖 fixture 样例，不是对所有未来渲染功能的穷尽证明。

## 兼容性

- 目标宿主为 DSH `0.2.1-rc.2`、React/React DOM `18.3.1`。除公开的 `theme` 服务与 Markdown DOM 外，通用横幅识别依赖私有 React Fiber 字段；升级宿主前需重跑探针。语言不可读时保留原生代码块。当前验收包括隔离安装、组件与浏览器测试环境，未重新验证完整 Desktop 实时对话。
- 除 DOM 观察外，每秒检查一次纯 props 变化；后台计时器节流可能增加延迟。剩余风险见[已知限制](docs/KNOWN-LIMITATIONS.md)。
- 内置 Pele `1.6.0`（MIT）。Mermaid 语法覆盖跟随 Pele：Mermaid 12.1.0 内置的全部图表类型。
- 不要与其他 Mermaid 围栏渲染插件同时启用，两个插件会争抢同一批代码块。

## 已验证

完整证据见 `docs/VERIFICATION.md`，关键实测结果：

- **84 个自动化测试**（`npm test`）：引擎、主题 CSS、代码块管理器、真实 React 18.3.1 生命周期和构建产物冒烟；`npm run verify` 还会在 `lib/client.js` 过期时失败。
- **宿主探针**（`npm run verify:host`）：只读提取已安装 DSH 的 CodeBlock 函数，用真实 React 18.3.1 核对已提交 Fiber、Copy 换行行为及 plain/static/streaming 三种 `<pre>` 结构。样式、横幅和分词辅助函数使用 fixture 适配器，不代表完整运行中宿主的端到端验证。
- **真实 DSH 安装**（`scripts/verify-install.mjs`，隔离 `DSH_HOME`）：启动图包含
  `{"id":"dsh-pele-mermaid","url":"plugins/??dsh-pele-mermaid/client.js&rev=…","inject":["@deepseek-ai/dsh-client-ui-theme"]}`，
  且该路由返回已验证的工作目录 bundle。
- **「关闭 = 完全正常」**：禁用该行后，启动图中没有任何插件条目、index HTML 中零出现、旧 bundle 路由返回 404；禁用后的启动图与全新卸载后的 profile 结构完全一致。
- **真实浏览器**（Chrome headless fixture，截图见 `tests/fixtures/screenshots/`）：flowchart、sequence、pie、gantt 均正常渲染；明暗切换只翻转映射的 Pele token、**零重渲染**；字体变化重渲染；源码切换保留同一宿主 `<pre>` 节点，销毁只移除插件新增节点。

## 开发

```sh
npm install
npm run build      # 构建 lib/client.js（esbuild，内联 Pele）
npm test           # node:test 单测（引擎、主题 CSS、代码块管理器）
npm run verify     # build --check + bundle 冒烟测试
npm run verify:host # 安装包 CodeBlock 探针（需 macOS 应用）
npm run verify:visual # 隔离 Chrome 截图与配套 JSON
```

`docs/ARCH.md` 记录模块契约、Markdown DOM 结构、打包 wrapper 与禁用/清理保证；`docs/VERIFICATION.md` 记录真实 profile 安装与 boot graph 证据。

## License

MIT。Pele 亦为 MIT，详见其仓库。
