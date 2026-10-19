# 项目审查记录

审查及修订日期：2026-10-19（Asia/Shanghai）。审查基线：`6b66a2a201a1f26733fd2919db1fa5b5169f2295`。本文已合并复核与后续核验结论；本次只调整三份审查文档，未修改实现、构建产物或已有测试。

总体判断：独立 npm 包、空 Host 插件、客户端 bundle、Pele 适配器和 CSS 主题层的方向正确，满足“不修改、不 fork、不 import dsh 本体”的包级解耦要求。但运行时直接挪动 React 拥有的 DOM，仍存在明显的生命周期耦合。目前不宜按 README 中“定稿后渲染、卸载完整还原、完全离线”的全部保证验收。

修订后的分级为 **1 项 P1（#1）、5 项 P2（#3–#7）、1 项条件性 P3（#2）**，另记录嵌套源码节点的条件兼容性问题。严重性是修复优先级判断；#1 保留 P1 的依据是源码更新失察与 DOM 所有权冲突，并非已证实整个 dsh 崩溃。各项的合成场景、当前宿主可达性和验证边界分别列明。

**1. [P1] 不应移走 React 拥有的源码节点。**

位置：[blocks.js:669](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:669)、[index.js:120](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/index.js:120)。

`mountRecord()` 将 `<pre>` 从原父节点移除，观察器却只观察 `document.body`。180 ms 源码静默只是启发式判断，无法证明流式输出已经完成。图表挂载后，React 若更新原 `<code>`，更新发生在脱离文档的子树里，不会触发 body 观察器。除非发生其他页面变动，图表会一直显示旧内容。

复现：运行真实 `lib/client.js`，等待挂载和页面安静，再将保存的原始 `<code>` 从 `Original` 改为 `Updated`。600 ms 后源码已改变，但 SVG 节点仍相同，图中没有 `Updated`。后续用真实 React 18.3.1 和与安装版 CodeBlock plain 分支同构的组件复现了相同行为：React 更新脱离的 `<code>`，body 没有相应 mutation；追加无关节点后才触发扫描并重建 SVG。重建会丢失原有 zoom/pan 状态，也存在闪烁风险；本次未在真实浏览器中测量可见闪烁。现有 bundle 测试覆盖了观察器初次挂载入口，但未覆盖挂载后、无其他页面 mutation 的脱离子树源码更新。

另用安装版 dsh 随附的 React/ReactDOM 18.3.1，在 jsdom 中模拟 CodeBlock 的 `<pre>` → 高亮 `<div>` 结构切换：React 抛出 `NotFoundError: The node to be removed is not a child of this node.`。无插件的对照组不抛错；有插件、无 error boundary 时最小 React root 被清空，有 boundary 时异常被捕获并渲染 fallback。异常来自 React 提交阶段，插件中的 `try/catch` 无法捕获。安装版 dsh 有这两种结构，但 Mermaid 不在其高亮语言表中，且未发现当前语言切换入口；该崩溃触发条件在完整 dsh 中尚未证实。真实 dsh 的 boundary 配置、流式输出中仅更新脱离子树的频率和整个应用崩溃均未验证。

建议：保留原始 `<pre>` 的位置和父子关系，只以可还原的属性/CSS 控制显示，在插件拥有的独立兄弟容器中渲染。持续观察原源码变化，并将“静默窗口”与“已完成”区分开。宿主 DOM 契约集中在一个适配层，Pele 层不参与源码节点所有权。

**2. [条件性 P3] 宿主替换源码节点后，清理可能回填旧节点。**

位置：[blocks.js:910](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:910)、[blocks.js:921](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:921)、[blocks.js:477](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:477)。

当宿主替换源码节点并将语言改为非 Mermaid，或换入一个空 `<pre>` 时，代码在接纳新节点之前就调用 `cleanupRecord()`。后者无条件恢复缓存的旧 `record.pre`，使旧图表源码重新进入宿主的新内容。这是已复现的逻辑缺陷，但其在当前 dsh 中的触发路径尚未建立。

合成复现：使用 manager、替身渲染器并手工替换 `content.innerHTML`；图表挂载后将 banner 改成 `javascript`，content 换成 `const answer = 42` 的新 `<pre>`，扫描后存在两个 `<pre>`，按 DOM 顺序是旧 Mermaid 和新 JavaScript。换入空 `<pre>` 也会产生旧 Mermaid 加空节点。此结果不能直接当作当前 dsh 的语言切换行为。

真实 React 对照：与当前 CodeBlock plain 分支同构的组件会复用同一 `<pre>`。切到非高亮语言并更新源码，恢复的是同一已更新节点，只有一个 `<pre>`；清空源码后，在扫描发生时也只恢复一个空节点。模拟切到高亮结构则先触发 #1 的异常。该项保留为第三方宿主或未来结构变更下的防御性问题，不计入当前 P2。

建议：区分“插件主动恢复自己的隐藏节点”和“宿主已替换/废弃源码”。后者只销毁插件资源，不能回填历史节点；优先核对当前宿主父节点和节点身份。

**3. [P2] 字体刷新会被 DOM 扫描取消。**

位置：[index.js:57](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/index.js:57)、[index.js:66](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/index.js:66)。

`scheduleScan()` 和 `scheduleRefresh()` 共用一个 `timer`，两者都会清除已有任务。字体事件发生后，150 ms 内 body 子树出现被观察到的 `childList` 或 `characterData` 变动，会把刷新替换为普通扫描。观察器未监听 `attributes`，单独写入 `body.style` 不会触发这一竞争。`lastFontKey` 已经提前更新，后续相同快照不会重试。

复现：已挂载图表，发送字体变更，马上追加一个与图表无关的 `<aside>`，仍是旧 SVG；相同快照不重试，不同快照可重新触发刷新。无 mutation 的控制组正常换节点；140 ms 时的 mutation 取消刷新，200 ms 时的 mutation 则发生在刷新之后。

后续提取安装版 dsh 的 `FontFamilyRow` / `FontSizeRow` 函数，用真实 React 18.3.1 和真实 bundle 验证：字体族变化因 Input 的 key 改变产生 `childList`，字号显示文本变化产生 `characterData`，两者均可取消刷新。Input 和图标组件为替身，主题 store/事件为测试驱动；这验证了设置行的相关 DOM 行为，不是完整 dsh/Electron 验收。#7 限制了当前字号刷新收益，但不排除字体族重测量被取消；Pele 的 ResizeObserver 只有在发生相应 resize 时才可能补救，不能假定换字体必然触发容器 resize。因此保留 P2，并明确上述触发条件；真实浏览器字体测量效果仍未验证。

建议：分别保存扫描/刷新需求，或用独立计时器；合并调度时保留刷新标志，不能让低优先级扫描覆盖刷新。

**4. [P2] 默认允许远程图片，不符合“完全离线、无网络请求”的承诺。**

位置：[engine.js:41](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/engine.js:41)。

固定 options 不等于禁止图表指定图片。以下源码在本项目安装的 Pele 1.6.0 中，会生成保留远程 URL 的 `<image href="https://example.invalid/probe.svg" ...>`：

```mermaid
flowchart LR
  A@{ img: "https://example.invalid/probe.svg", label: "remote" }
```

本次仅检查生成的 SVG，未做浏览器网络请求观测。已安装 Pele 1.6.0 的实现确认：未设 `images: false` 时，`imageSchemes` 默认允许 `http` / `https`；关闭图片的对照组不生成该 `<image>`。生成远程引用说明图表内容可以引入外部资源请求能力，但是否实际发起请求仍受浏览器和页面策略影响。静态检查未发现安装版主聊天 GUI 的适用 CSP；这不是运行中页面取证，也不等于已实测请求。

README 的全面离线保证需要收窄或由代码落实。`docs/VERIFICATION.md:521` 验收表以“无 CDN / 无动态 import”支持无网络依赖，不能证明任意图表不加载远程资源；其中 §6 第 11 项（第 506 行）只陈述测试与 fixture 没有使用外网，不能将该测试范围陈述本身判为矛盾。

建议：若保留现有离线承诺，在引擎固定 options 中设置 `images: false`，并检查生成的 SVG；只搜索 bundle 中的 CDN 字符串无法验证这一点。

**5. [P2] 每块一个定时器、每次扫描全页，造成平方级工作量。**

位置：[blocks.js:793](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:793)、[blocks.js:805](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:805)、[blocks.js:957](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:957)。

N 个 pending 块分别注册定时器，但每个回调都调用全量 `scan()`。第一个回调已挂载其余块，剩余定时器仍继续扫描。每轮又对所有代码块克隆 banner、遍历 `<pre>`。

用注入时钟和轻量渲染器隔离测量：80 块 → 80 个定时器 → 81 次全页扫描 → 6,480 次 banner 克隆。逐块追加、每块完成 settle 后再追加下一块的 manager 夹具也得到 `scans = 2N`、`bannerClones = N(N+1)`。这些是指定夹具下的调度/DOM 计数，不是完整 dsh 流式输出的普遍公式，也不是 Pele 绘图性能测量。长会话、历史加载和大量代码块场景会放大成本。

建议：单一 manager 定时器处理最近的截止时间，或仅推进到期 record；按 mutation 收集需要处理的块。保存计时器句柄并在销毁时取消，而不只是让回调读 `destroyed` 后返回。

**6. [P2] 全页尾沿 debounce 会推迟已移除图表的资源释放。**

位置：[index.js:57](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/index.js:57)、[blocks.js:973](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:973)。

记录清理依赖扫描，而扫描每遇到 body 子树中被观察到的 `childList` / `characterData` 变动就重新等待 150 ms，没有最大等待时间。持续流式输出时，已移除代码块仍被 `records` 强引用，Pele handle 和观察器也继续保留。仅属性变化不会重置该计时器。

复现：图表挂载后移除整个 block，同时每 40 ms 更新无关 `<aside>` 文本。1 秒和 3 秒后，脱离文档的图表容器仍存在，Pele ResizeObserver 的计数仍为 1。停止无关更新后约 143 ms 清理；安静移除控制组约 155 ms 清理；主动 dispose 可释放，单独属性变动不会阻止清理。时间是该次运行的观测值，不是保证值。ResizeObserver 使用计数替身，验证的是注册/断开调用，不是浏览器 heap。

建议：移除节点的清理不应依赖全页安静；对 removal 及时清理，其他更新采用有最大等待时间的节流/批处理。该问题应描述为可持续推迟的资源滞留，尚不能据此断言永久内存泄漏。

**7. [P2] 字号变化触发重建，但字号没有传给 Pele。**

位置：[engine.js:41](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/engine.js:41)、[index.js:85](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/index.js:85)。

入口跟踪全部 `fontSizes`，但引擎只传 `zoom/autoDirection/responsive`，没有 `fontSize`；CSS 只映射字体族。已安装 Pele 1.6.0 的 `mount()` 读取字体族，基础字号仍来自 render options，默认 16。

复现：向真实 bundle 发送正文 `fontSizes.text` 从 14 到 22 的主题快照，SVG 换了新节点，但前后 style 相同，均为 `font: 16px sans-serif`。源码 `flowchart LR\nA[Label]-->B` 前后 viewBox 均为 `0 0 188 64`；源码 `flowchart LR\nA[Original]-->B` 则均为 `0 0 204 64`。两组结果都已复现，差异来自不同标签夹具，不能用后一组否定前一组。精确尺寸只代表本次 jsdom 环境，不代表真实浏览器测量。代码字号 11→16 的独立对照也得到 style/viewBox 不变。

原审查的 14→24 是超出当前 dsh 正文上限的合成快照；现改用合法的 14→22。当前 dsh 的正文/代码/终端字号范围分别为 10–22 / 10–16 / 10–20。原始字号输出保留在证据中，并与合法输入复测分开记录。现有字体测试只检查是否换节点，没有检查字号与尺寸。

`refreshAll()` 调用 `mountRecord()` 销毁重挂，而不是 `handle.refresh()`。**当刷新实际执行时**，重建会重置图表的 zoom/pan；仅终端字号变化也可触发不必要的重建。若刷新被 #3 取消，则不能声称这次事件已经重置视图。

建议：明确图表跟随正文还是代码字号，将对应值传入引擎；如果产品决定固定 16，则移除无效的字号重建及相关文档承诺。同时无需因终端等不相关字体角色变化重建全部图表。

**额外的兼容性问题：嵌套 `<pre>` 无法原位恢复。**

[blocks.js:321](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:321) 只记录 `<pre>` 在 content 中的直接 child index；[blocks.js:383](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:383) 总恢复到 content。输入 `content > div > pre`，销毁后会变成 `content > div + pre`。dsh 的高亮代码分支确实有中间 div，但当前版本 Mermaid 不在高亮语言表，所以此项不作为当前默认 Mermaid 路径的 P2 故障。若声称支持嵌套高亮结构或任意宿主改版，应保存真正的父节点和相邻节点，或根本不移动源码。

**结构与冗余评价。**

- Host 与客户端分离、主题 CSS 独立、引擎适配器隔离是合理的；不需要为修复上述问题引入 dsh 私有源码依赖。
- `blocks.js` 达 1,040 行，集中承担宿主选择器、源码节点管理、状态迁移、调度、工具栏和恢复。可以收敛为宿主适配、record 状态迁移、视图三部分；统一调度放在单一位置。代码行数本身不是问题，多个函数交叉改写同一 record 才是主要维护负担。
- `readFenceSource()` 只有测试调用，生产路径另走 `findExternalPre()/observedSource()`。测试一个生产流程不使用的读取函数，不能保证真实读取正确。
- `engine` 的 `refresh()` 没有生产调用者，`refreshAll()` 一律销毁重挂。[engine.js:143](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/engine.js:143) 说明 Pele 会重写内部 DOM、调用方的 overlay 需重新添加，并提及 block 刷新采用重挂；[blocks.js:685](/Users/farewe1ll/Objects/dsh-pele-mermaid/src/client/blocks.js:685) 明确 toolbar 是 Pele host 的兄弟节点。overlay 说明不适用于当前工具栏，不能作为其必须重挂的理由；应统一刷新策略和契约，并考虑视图状态保留。
- locale 解析、element 检查、错误消息转换存在重复实现；测试专用的 class 名自定义扩展了生产状态空间。可在明确边界后删减，避免为了防御不可能输入而层层吞异常。
- 多处静默或仅含注释的 `catch` 让异常后状态难以诊断。图表语法错误应局部处理；DOM 所有权错误和编程错误不应全部静默。对开发模式保留轻量诊断即可。
- 文档中旧的多人 ownership 表、定稿判断和“逐字节还原”等强断言，需要与真实契约和证据范围一致。

**验证结果与边界。**

- 上轮核验的 `npm test`：67/67 通过；此次文档修订复用该结果，未重新运行实现测试。
- 上轮 `npm run verify`：bundle 字节一致性检查通过，6/6 构建产物冒烟测试通过；bundle 693,967 bytes，SHA-256 为 `f93c8feda14e3988296a0a6d636146a4d3d9610fcff4eef46479d11a1c6f7a08`。本次重新核对该哈希，产物未变。
- 前几轮审查已对真实 bundle 增补源码更新、字体事件/DOM 竞争、宿主替换和资源清理复现；对 manager 用注入时钟测量扫描次数。此次调整整理这些既有结果。
- 12 次挂载/销毁循环中，MutationObserver 和 ResizeObserver 计数均回到 0，插件节点数量也回到 0。ResizeObserver 为计数替身；没有执行 GC 后 heap snapshot，因此不声称已证明无内存泄漏。
- 只读核对安装版 dsh `0.2.1-rc.2` 的 CodeBlock 与主题服务、Pele `1.6.0` 的 mount/zoom 清理代码。包版本 `0.1.0`，Node `24.22.0`，jsdom `29.1.1`。React 最小复现使用 dsh 随附的 React/ReactDOM `18.3.1`；设置行复现提取了宿主函数，但替换了 Input/图标和 store 驱动。未重新完成整个 dsh profile 的安装/禁用验收，未验证真实浏览器字体几何或远程请求。
- Moli 本地页面测试未执行：沙箱拒绝 loopback 监听，随后的自动审批因上游连接中断而未完成。这是审批流程失败，不是判定测试不安全。没有绕过该限制，也没有留下 Moli 或测试 HTTP 服务。

机器可读结果保存在 [review-evidence.json](/Users/farewe1ll/Objects/dsh-pele-mermaid/docs/review-evidence.json)，复核裁决见 [ADVERSARIAL-REVIEW.md](/Users/farewe1ll/Objects/dsh-pele-mermaid/docs/ADVERSARIAL-REVIEW.md)。证据已补充方法、输入、版本、字段含义、控制组及证据来源。可用的一次性脚本和依赖列在 JSON 的 `provenance` 中，包括 `dsh-review-browser-eval.js`、设置行竞争脚本和字体复测输出。原始字号/远程图片生成脚本未完整保留，不能声称所有项目均可从仓库独立重跑；`/tmp` 路径仅供本机此次追溯，不是项目测试入口，也不保证长期存在。

建议修复顺序：先恢复 React 的 DOM 所有权边界，再统一任务调度和清理，最后修正图像策略、字号传递和冗余接口。回归测试优先覆盖真实 React 更新及事件组合，而不是继续增加静态 DOM 快照。
