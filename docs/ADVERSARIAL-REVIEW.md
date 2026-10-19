# 审查复核与核验后裁决

复核及修订日期：2026-10-19（Asia/Shanghai）。代码基线：`6b66a2a201a1f26733fd2919db1fa5b5169f2295`。

本文汇总原审查、对抗性复核和后续核验，替代此前 205 行复核报告中的未校准结论。原复核报告记载了三名独立复核者的结果；此次文档调整复用已有脚本、输出与核验记录，没有新增独立复核轮次。工作区共有三份未跟踪审查文件：`REVIEW.md`、`review-evidence.json` 和本文；“只有两份未提交文件”仅描述新增本文之前的历史状态。

本次已将最终裁决落实到三份文件。实现、已有测试和 bundle 未修改。原报告的固定行数不再适用于修订后的文档。

原审查的大部分机制与测量成立。需要降级 #2、限定 #1 的崩溃条件、修正 mutation 范围和字号输入，并补齐证据元数据。对抗性复核提出的“#3 当前影响近零”“188×64 不可复现”和“VERIFICATION §6 第 11 项与远程图片矛盾”则不能采纳。统一分级为 **1 项 P1 + 5 项 P2 + 1 项条件性 P3**，另有一项嵌套 DOM 的条件兼容性问题。分级是修复优先级判断，不是由复现唯一决定的事实。

| 条目 | 原级别 | 核验后结论 | 最终分级 |
| --- | --- | --- | --- |
| 1. 移走 React 的源码节点 | P1 | 陈旧图表已复现；结构切换异常有 boundary 和可达性限制 | P1 |
| 2. 清理回填旧源码 | P2 | 合成宿主替换缺陷成立，当前 dsh 触发路径尚未建立 | 条件性 P3 |
| 3. 字体刷新被扫描取消 | P2 | 竞争成立；提取的设置行可产生相关 DOM 变动，不能据 attribute-only 下发而降级 | P2 |
| 4. 默认允许远程图片 | P2 | SVG 保留 HTTP/HTTPS 引用；未观测真实网络请求 | P2 |
| 5. 每块定时器与全页扫描 | P2 | 80 个 timer / 81 次 scan / 6,480 次 banner clone 可复现 | P2 |
| 6. 尾沿 debounce 推迟清理 | P2 | 持续节点/文本更新可延迟释放；未证明永久内存泄漏 | P2 |
| 7. 字号重建但未传 Pele | P2 | 合法字号输入仍固定 16px；188×64 和 204×64 对应不同源码，均可复现 | P2 |
| 嵌套 pre 恢复 | 条件 | manager 级成立，当前 Mermaid plain 结构不触发 | 条件兼容性 |

**1. 保留 DOM 所有权问题，限定异常影响范围。**

`src/client/blocks.js:669–683` 移走 React 拥有的源码 pre，`src/client/index.js:120–121` 却只观察 body 的 `childList`/subtree/`characterData`。180 ms 静默窗口不能证明源码定稿。

真实 React 18.3.1、真实 bundle 和与安装版 CodeBlock plain 分支同构的组件复现了：挂载后原 pre 脱离文档；React 原地更新其 code；body 无相应 mutation；SVG 仍显示旧内容。无关 body 变动触发扫描后才销毁并重建 SVG。重建会丢失 zoom/pan，存在闪烁风险，但本次没有真实浏览器的可见闪烁测量。

模拟 plain pre 到高亮 div 的结构切换时，React 提交阶段抛出 NotFoundError；不加载插件的对照组不抛错。无 error boundary 的最小 root 被清空；有 boundary 的对照组捕获异常并显示 fallback。当前 Mermaid 不在 dsh 高亮语言表，未发现当前语言切换入口，因而不能把模拟结构切换写成已证实的完整 dsh 崩溃。完整应用的 boundary 配置及真实流式输出中仅更新脱离子树的频率仍未知。

现有 bundle 测试确实覆盖了观察器入口；缺口是挂载后无其他 mutation 的原地源码更新。原审查“单测掩盖了实际入口不会被调用”的概括已更正。P1 以当前源码更新失察与 DOM 所有权冲突为依据，而非以未证实的整个应用崩溃为依据。

**2. 将旧源码回填降为条件性 P3。**

`scanBlock()` 在语言/空源检查失败时先清理，再考虑新节点；`cleanupRecord()` 会恢复缓存的旧 pre。手工替换 `content.innerHTML` 的 manager 夹具确实得到两个 pre，按 DOM 顺序为旧 Mermaid 与新源码。该逻辑缺陷真实存在，但这个方法不是当前 dsh 的 React 更新。

真实 React plain 分支复用同一 pre：切到非高亮语言并修改源码后，恢复的是一个已更新节点；清空源码并触发扫描后只恢复一个空节点。模拟切到高亮分支会先遇到 #1 的异常。正确裁决是“合成场景缺陷成立，当前 dsh 可达性尚未建立”，而非断言代码不存在问题。证据 JSON 已标注手工替换方法、sources 的 DOM 顺序语义及 `preCount`。

**3. 保留字体刷新竞争的 P2，补足触发条件。**

`scheduleScan()` / `scheduleRefresh()` 共用 timer，`lastFontKey` 在刷新完成前推进。真实 bundle 的控制组、立即追加 aside、140 ms / 200 ms 变动和相同快照重试均支持这一竞争：窗口内节点/文本变动可取消刷新，相同快照不再重试。

观察器不监听 `attributes`，所以仅修改 `body.style` 不触发。对抗性复核据此推断“当前影响近零”缺少依据：后续从安装版提取 `FontFamilyRow` / `FontSizeRow`，真实 React 运行时，字体族变化会因 Input key 改变产生两条 `childList` 记录，字号文本产生 `characterData`，真实 bundle 的刷新均被取消。输出保存在 `/tmp/dsh-confirm-theme-race.json`。

该测试的 Input、图标为替身，store/事件由夹具驱动，ResizeObserver 不可用；证明的是设置行 DOM 行为与竞争组合，不是完整 dsh/Electron 的实际字体几何。#7 使字号刷新本身没有预期字号收益，但不消除字体族重测量需求。Pele ResizeObserver 可在 resize 时补救，字体变更却不保证容器 resize。故保留带明确触发条件的 P2；不将测试夸大成完整浏览器验收。

**4. 远程图片能力成立，网络结论限定为未实测。**

Pele 1.6.0 的源码在未禁用 images 时默认允许 http / https。真实 engine / bundle 会输出远程 image href，禁图对照组不输出。插件的 `DIAGRAM_OPTIONS` 未禁用图片。

静态检查未发现主聊天 GUI 适用的 CSP，但没有从运行页面取证，也没有记录浏览器/Electron 实际请求。证据只支持“具有外部请求能力”，不支持“已经请求”或“页面完全没有 CSP”。JSON 已区分生成结果、网络观测缺失和条件性浏览器行为推断。

应收窄 README 的全面离线保证，并指出 `docs/VERIFICATION.md:521` 验收表中的无 CDN / 无动态 import 检查不足以证明任意图表无外部请求。其第 506 行（§6 第 11 项）只说测试和 fixture 不使用外网；该范围陈述本身与远程图片能力不矛盾，原复核对此的批评撤回。

最初审查曾读取 Pele 官方文档；后续离线无法重新读取不能反证初次引用。修订后的核心证据采用已安装版本源码和 SVG 输出，无须依赖外部页面当前内容。

**5. 平方级扫描计数成立。**

N 个 pending record 各有 settle timer，回调都调用全量 scan；批量夹具结果为 timers=N、scans=N+1、bannerClones=N(N+1)。N=80 的结果为 80 / 81 / 6,480。

逐块追加、每块 settle 后再追加下一块的夹具得到 scans=2N、bannerClones=N(N+1)。这描述指定 manager 夹具，不应泛化成所有真实流式更新的精确公式。计数使用注入时钟和轻量渲染器，不能作为 Pele 绘图性能或浏览器耗时测量。销毁时未取消 pending timer 句柄、仅让回调检查 `destroyed` 的结构问题也成立。

**6. 清理可被持续推迟，不能由此断言永久泄漏。**

真实 bundle 中每 40 ms 更新无关文本，移除 block 后 1 秒、3 秒仍保留一个 diagram / SVG / 活跃 ResizeObserver。停止 churn 后约 143 ms 清理；安静移除控制组约 155 ms；单独属性变化不阻止清理，主动 dispose 可释放。这些时间是一次运行的记录，机制是无最大等待时间的尾沿 debounce。

ResizeObserver 是计数替身；这证明资源滞留与清理调用，未验证浏览器 GC / heap。原审查对永久泄漏的保留措辞正确；“任意 body 变化”已改为观察器能看到的 `childList` / `characterData`。

**7. 修正字号输入，保留可复现的两组尺寸。**

当前 dsh 正文/代码/终端字号范围分别为 10–22 / 10–16 / 10–20。原 14→24 超出正文范围，须标为合成输入。合法正文 14→22、代码 11→16 的复测均确认：SVG 重建，但 style / viewBox 不随请求字号变化，仍为 `font: 16px sans-serif`。

后续 `/tmp/dsh-confirm-font.json` 明确记录了两组合法正文输入：

| Mermaid 源码（`\n` 表示换行） | 请求字号 | 前后 viewBox | style |
| --- | --- | --- | --- |
| `flowchart LR\nA[Label]-->B` | 14→22 | `0 0 188 64` | 相同，16px |
| `flowchart LR\nA[Original]-->B` | 14→22 | `0 0 204 64` | 相同，16px |

此前两轮使用了不同标签。188×64 可复现，不能以 204×64 替换或删除；应同时记录输入与输出，并限定为本次 jsdom 环境。原始字号脚本未完整保留仍是证据保管缺口，后续输出不能将其追溯成已保留脚本。

`refreshAll()` 销毁重挂而不调用 `handle.refresh()`，因此在刷新实际执行时重置 zoom/pan；仅终端字号变化也可触发重建。不能写成“任何字体事件都会重置”，因为 #3 可能取消任务。视图重置是代码路径与 Pele 状态生命周期的判断，本次未做真实浏览器 zoom/pan 操作验收。

**结构评论与证据完整性。**

- 嵌套 `content > div > pre` 恢复成 `content > div + pre` 的 manager 级缺陷成立，当前 Mermaid plain 分支不触发，保持条件兼容性定位。
- `blocks.js` 的 1,040 行、生产未调用 `readFenceSource()` / `engine refresh()`、重复辅助函数和静默 catch 等评论成立。行数不是独立缺陷，应以职责交叉与状态复杂性解释维护成本。
- “避免 Pele 清空工具栏”不是代码原注释。准确引用是 `engine.js:143–146` 的 overlay 重加说明，以及 `blocks.js:685–686` 的兄弟 toolbar 结构。当前工具栏不能据此要求重挂，原审查已更正。
- JSON 增补完整 commit、版本、bundle hash、build check / smoke 计数、方法和输入、条件性分级、控制组、字段解释及临时文件来源。原始观测与新复测分开；没有把未测值补成已测值。

**验证基线与剩余边界。**

上轮 `npm test` 67/67，`npm run verify` 的 build check 与 6/6 bundle smoke 均通过。bundle 为 693,967 bytes，SHA-256 为 `f93c8feda14e3988296a0a6d636146a4d3d9610fcff4eef46479d11a1c6f7a08`。此次仅修订文档，复用上轮测试结果并重新核对产物哈希。

dsh 0.2.1-rc.2、React/ReactDOM 18.3.1、Pele 1.6.0、包 0.1.0、Node 24.22.0、jsdom 29.1.1。完整 dsh 交互、运行页面 CSP/外部请求、真实字体几何、Moli 验收和 heap/GC 观测仍未完成。12 次正常挂载/销毁后计数归零不能证明没有内存泄漏。

一次性脚本及输出仅在本机 /tmp，并非仓库可复用测试入口；已知缺失的原始字号/远程图片生成脚本没有被补称为存在。可用文件、依赖、输出和来源区分见 `review-evidence.json` 的 provenance。Moli 未运行及历史审批失败沿用原执行记录，此次没有启动浏览器或服务。
