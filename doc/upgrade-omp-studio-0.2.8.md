# OMP Studio 0.2.8 升级分析与执行方案

> 状态：**应用层已执行；Runtime 19.0.1 重定基待网络恢复**。
> 分析日期：2026-11-22；执行日期：2026-11-22。
> 上游输入：`G:\源码\omp-studio-0.2.8`（无 `.git`，按文件对比）。
> 基线：本仓库 `c08f52a3`（`upstream: projected omp-studio v0.2.4 (studio->harness, lf)`）。
> 升级前 HEAD：`4907841f`，产品版本 `1.0.1`；升级后目标版本 `1.1.0`。

## 执行状态（2026-11-22）

| 阶段 | 状态 | 说明 |
|---|---|---|
| Phase 0 冻结 | ✅ | 提交待处理改动；创建 `upgrade/0.2.8` 分支与 `pre-0.2.8-20261122` 回滚标签 |
| Phase 1 投影 | ✅ | `scripts/project-omp-studio.mjs` 固化；`upstream/omp-studio-0.2.8` 分支 |
| Phase 2 合并 | ✅ | 140 个重叠文件；82 个冲突已按域解决；核心/渲染/桌面/安装器测试通过 |
| Phase 3 Runtime | ⛔ | 本机无法从 GitHub 取得 `f40f335…`（多次 clone/fetch/codeload 均被重置或截断）；vendor 仍为 `7c49c11…` |
| Phase 4 i18n/预览/文档 | ✅ | 六语补齐 0.2.8 新增键；新页面 fixture 随上游合入；文档与版本号更新 |
| Phase 5 验证 | ⏳ | 核心包与渲染套件已通过；`--all` / `test:tooling` / Runtime 验证待收尾 |

**当前 Runtime 仍为 `18.20.2-harness.18`**。依赖 OMP 19 的入口按能力列表降级：
统一反汇编数据库、Plan 正文保存、会话本地目录、Advisor 原生投影、Daemon 单元等
在旧 Runtime 上显示为空态或隐藏；不依赖 Runtime 的功能（WSL、手机访问、会话引用、
已归档批量删除、表格/Office 预览、SSH 传输、活动图标）已可用。

恢复网络后继续执行 §5 Phase 3：取 `f40f335845f0b136453d12fec8d6057011082766`，
按 §4.1 重放 overlay/0005/0006 并 `omp:patches:regen`。

## 0. 结论

1. **你的源码不是 0.2.4，而是 1.0.1**。代码基线是上游 0.2.4，产品版本已经走到 `1.0.0/1.0.1`
   （`CHANGELOG.md` 的 `[1.0.0]` 明确写了「合入 OMP Studio 0.2.4」）。所以本次是
   **上游 0.2.4 → 0.2.8** 的升级，本地版本建议升到 **`1.1.0`**，不要改成 `0.2.8`
   （否则已发布的 1.0.1 用户会被更新通道判定为「降级」）。
2. **0.2.8 不是一次 UI 小更新。0.2.7 把内置 Runtime 从 OMP 18.20.2 提到了 OMP 19.0.1**，
   0.2.5–0.2.8 的功能分别依赖新的 Runtime 能力（反汇编、Plan 保存、Ask 折叠、Daemon、
   session purge）或纯桌面/渲染层能力（手机访问、WSL、表格预览）。
3. **可以升级，并且能完整保留现有改名与本地功能**，但要按仓库既有方式做：
   先把上游树投影成 Juling 身份，落到独立分支，再 `git merge` 回本地，
   最后重定基 Runtime overlay/接缝补丁。不要按文件覆盖，也不要逐文件手抄。
4. **规模**：
   - 上游 0.2.4→0.2.8：**516 个文件**（新增 93 / 删除 18 / 修改 405），约 **+21,314/−7,092 行**。
   - 本地相对 0.2.4 基线：已提交 **640 个文件（+33,882/−12,070）**，另有 2 个未提交文件。
   - 两边重叠 **140 个文件**，是需要人工判断的冲突面。
5. **最大风险不在合并，而在 Runtime**：OMP 19.0.1 改了目录和模块名
   （`ida`→`disasm`/`ghidra`、`launch`→`daemon`、`predict/daemon`→`daemon/modules/predict`、
   `crates/pi-natives`→`crates/natives`、`crates/pi-vcs`→`crates/vcs`），
   本地 6 个接缝补丁和 316 个 overlay 文件必须重新落位并 `regen`。
   其中 `0006-stats-dashboard.patch`（8,219 行/57 文件）对应的是被 OMP 19 重写过的统计前端，
   需要按新结构重做，不是简单 rebase。
6. 推荐**一次性升级到 0.2.8 + OMP 19.0.1**。如果只想先拿到部分能力，可分两段
   （0.2.6 → 0.2.8），但不建议长期停留在「0.2.8 应用 + 18.20.2 Runtime」的混合态，理由见 §6.1。

## 1. 事实核对

| 项 | 当前仓库 | 上游 0.2.8 | 结论 |
|---|---|---|---|
| 产品名 | `juling-harness` / Juling Harness | `omp-studio` / OMP Studio | 继续用本地投影规则 |
| 产品版本 | `1.0.1`（root + 14 个 workspace） | `0.2.8` | 本地建议升 `1.1.0` |
| 上游代码基线 | 0.2.4（提交 `c08f52a3`） | 0.2.8 | 本次合并目标 |
| Runtime pin | `7c49c11…`（OMP 18.20.2） | `f40f335…`（OMP 19.0.1 / tag `v19.0.1`） | **必须升级子模块** |
| patchset | `harness.18`（6 个补丁） | `studio.1`（投影后 `harness.1`，4 个补丁） | 新 pin 后重新生成，起 `19.0.1-harness.N` |
| overlay | 316 个文件 | 312 个文件（删 7、增 3） | 三方合并 |
| 接缝补丁 | 0001–0004 + 本地 0005/0006 | 0001–0004（已针对 OMP 19 重写） | 以上游 0.2.8 为底，重放本地 0005/0006 |
| 线协议 | `HARNESS_PROTOCOL_VERSION = 1` | 同为 `1` | 兼容，新增 query/command 为增量 |
| 渲染层语言 | 6 种（zh/en/ru/ja/ko/hi） | 2 种（zh/en） | 新增 35 个键需补 4 语言，删除 2 个键 |
| 桌面更新 | Windows/macOS/Linux（AppImage+deb） | 同 | 本地双签名域继续保留 |
| 入口名 | `juling.exe` / `juling` | `omp.exe` / `omp` | 投影后必须改回 `juling` |

工作区现状（升级前必须先处理）：

- 未提交：`apps/renderer/vite.config.ts`、`scripts/audit-linux.mjs`。
- 未跟踪：`.release-backup/`、`.release-work/`（不要提交）。
- 当前分支 `runtime/18.20.2`；已有 tag：`v1.0.0`、`local-0.2.0-snapshot`、`shell-0.2.2-verified`。

## 2. 上游 0.2.5 – 0.2.8 升级了什么

### 2.1 0.2.5（2026-11-20）

| 功能 | 用户可见行为 | 关键实现 |
|---|---|---|
| WSL 2 工作区 | Windows 空白对话的「工作位置」可选 WSL 2 发行版和 Linux 项目目录；Agent、Git、终端都在发行版内运行；发行版重启后恢复连接并提示 Host 实例变化 | 新增 `apps/desktop/src/remote/{wsl,wsl-paths}.ts`、`platform/windows-volumes.ts`、`platform/path-probe.ts`；`workspace-shell-ipc` 增加 WSL 路径映射；`docs/wsl-workspaces.md` |
| 手机访问 | 设置 → 手机访问：选项目与局域网地址，导出 CA 证书并扫码配对；手机可读会话、继续对话、停止回合、处理单次工具审批；授权 8 小时 | 新增 `apps/desktop/src/mobile-{access,access-ipc,certificate,scope}.ts`、`apps/renderer/src/mobile/{entry.tsx,mobile.css}`、`mobile.html`、`settings/MobileAccessSettings.tsx`；`transport-web` 增加 mobile 模式与 `./browser` 导出；新依赖 `ws`、`qrcode`、`@peculiar/x509`、`asn1js`、`reflect-metadata`；`packaging/electron-builder.yml` 增加 `afterPack: audit-mobile-certificate.mjs` |
| Advisor 审阅意见 | 按发生顺序显示在桌面和手机对话中，带顾问名称与严重程度；重开会话仍可见；桌面复制带来源 | Runtime `18.20.2-studio.15`（本地是 `harness.18` 但基于 `studio.14`，需从 0.2.5 的 overlay 移植会话投影改动） |
| 原生 Ask 表单 | 恢复原生分页，支持拖动调整提问卡片高度 | `deck/{formPages,QuestionHeightHandle}.tsx` |
| 修复：会话行归属 | 切项目后会话不再被搬到新项目下；同一会话不再在两个项目各显示一行；重启前即消失 | `session-catalog.ts`、`sidebar/provisionalThread.ts` |
| 修复：文件路径链接 | 对话与 Markdown 预览中的路径链接可解析；缺失路径显示普通文字，目录在文件浏览器定位，网络路径点击可访问 | `files/pathResolution.ts`、`files/fileLinks.tsx` |
| 修复：OpenCode Go/Zen | 「原生登录与凭据」可配置 API Key，并可核对授权模型目录 | `models/NativeModelAccessPane.tsx` |

### 2.2 0.2.6（2026-11-20）

只修复 0.2.5 安装包缺少手机访问 HTTPS 证书依赖导致的启动崩溃（`ERR_MODULE_NOT_FOUND`）。
代码面是把证书相关依赖打进桌面包，无新功能。

### 2.3 0.2.7（2026-11-20）

| 功能 | 用户可见行为 | 关键实现 |
|---|---|---|
| **Runtime 升 OMP 19.0.1** | 内置 `19.0.1-studio.1`；同步原生 Plan、Ask、后台交接、Daemon 单元、Agent 等待关系、工作树状态；移除上游已删除的 Seance；IDA 面板迁到统一反汇编器 | `omp-patch/upstream.json` pin；`series.json` 重置 `studio.1`；删除 `ida*`、`seance-service` overlay；新增 `disassembler-*` overlay；`scripts/omp-seam.mjs` 路径重写 |
| Plan 编辑 | 计划卡片可切阅读/编辑；Markdown 源码与预览联动定位；调整编辑区高度；查找替换、章节批注、全文批注；收起/重开/切语言保留草稿、撤销历史、光标与批注；批准/请求修改/保存退出前先保存正文，失败保留现场并显示原因 | 新增 `deck/{PlanWorkspace,PlanSourceEditor,planDocument}.tsx` 与 `planEditor.css`；协议新增 `mode.plan.review.save`（`plan-review.ts`） |
| 会话本地文件与完整输出浮窗 | 可移动/停靠/缩放；`/local` 定位文件；Markdown 源码/预览/分栏；文本查找、跳转行、换行、字号；日志保留 ANSI 颜色、跨页样式与级别提示；完整工具输出在独立窗口打开；重开/切换文件先处理未保存草稿 | 新增 `files/{logDisplay,markdownView,pathResolution}.ts`、`conversation/{SpillLink,markdownSource,toolOutputTail}.tsx`、`capabilities/{LocalFilesPane,ResourcesPane,ResourceTextView,ResourceMarkdown}.tsx`；overlay `services/resource-service.ts` 与 `resource.local.ensureDir` |
| 统一反汇编工作台 | IDA Pro / Ghidra / 自动 / 仅头部元数据；快捷卡、数据库浏览、查询、带预览的编辑；编辑通过预览令牌、版本绑定与原生备份执行；Dock 迁移旧 IDA 布局 | 新增 `capabilities/Disassembler*`、`disassembler.css`；协议 `contracts/disassembler.ts`（11 个运行时操作）；overlay `disassembler-protocol.ts`、`services/disassembler-service.ts` |
| Ask 折叠 + BTW | Ask 连续折叠布局，选项附注可带图片；主输入框可随部分答案结算当前表单并继续发送；`?` 发起 BTW，回答在时间线便签与 BTW 面板共用状态 | `deck/{FormCard,FormFields,FormSession}`、`btw/InlineBtwNote.tsx`、`useBtwSession.ts`、`InteractionDeck.tsx` |
| 模型菜单/账号/用量 | 供应商筛选、`provider/model` 搜索与思考档位；Kiro 原生多账号与额度、Claude 订阅等级；Live 自定义端点/密钥来源/音色，TTS 使用 Phonon 模型目录；用量区分会话辅助调用与评判模型；模型参数新增压缩形态（`snapcompactShape`） | `ComposerModelPicker`、`models/{AccountStatusPane,NativeModelAccessPane,config/ModelParametersDialog}`、`usage/TokenUsagePanel`、`omp-usage-adapter` |
| 设置页 | 设置搜索、MCP（内置转换 / Eval 命名空间）、反汇编、子代理（预走查规则 / 跨实例 / 编辑后 LSP）、缓存预热策略、记忆召回与嵌入、压缩形态、Worktree 强制移除、Phonon 31M 语音速度 | `settings/FeatureSettingsPane.tsx`、`runtime18180Settings.ts`、`settings/catalog.ts`、`contracts/feature-settings.ts` |
| Agent / 工作树 / 队列 | 代理面板展示等待关系与跨实例发现；工作树视图显示 ovnfs 来源；队列条提供取消；会话生命周期按原生 `agent_pause` / `agent_end` 投影；后台交接改为同会话原生后台压缩；对话流承接后台匹配输出与仅界面可见的扩展消息；桌面动作显示原生键盘交还状态；服务面板采用统一 Daemon 的单元及启动代次 | `agents/*`、`history/ResumeScopePane.tsx`、`workspaces/SessionWorktreesPane.tsx`、`composer/RuntimeQueueBar.tsx`、`services/ServicesPane.tsx`、`overlay/services/{handoff,session-worktrees,runtime-queue,workbench}-service.ts`、`daemon/*`、`computer/ComputerActivity.tsx` |
| 性能 | 流式重复拷贝/代码块重绘、评测报告翻页、3D 法线/贴图、会话切换与空闲开销 | `conversation/*`、`graphics/indexed-normals.ts`、Host/overlay 多处 |
| 修复：交接与会话文件 | 后台交接结束不再误切会话；会话文件目录、完整输出链接与当前会话关联正确 | `handoff-service`、`conversation/*`、`capabilities/ResourcesPane` |
| 修复：资源浮窗 | 按会话区分焦点与内容宿主；重复打开文件保留未保存草稿并确认后再切换，避免跨会话互相抢焦点 | `dock/*`、`files/FileDockInstances.tsx` |
| 修复：文件编辑器 | 内容更新、只读状态变化、语言切换不再重建编辑状态；保留预览文件的本地修改 | `files/FilePane.tsx`、`FileTextEditor.tsx`、`files/*` |

### 2.4 0.2.8（2026-11-22）

| 功能 | 用户可见行为 | 关键实现 |
|---|---|---|
| 会话引用 | 从对话菜单/侧栏/历史复制会话 ID，粘贴到输入框生成引用；同 ID 对应多个项目或连接时选来源；打开引用可查看来源与最近保存的消息，最多选 6 条摘录随消息发送；也可只发送会话 ID；未匹配的 UUID 保持普通文本，跨工作区读取，断线后可恢复，选中后才序列化摘录 | 新增 `composer/{SessionReferenceDialog,SessionReferences,sessionReference}.tsx`；Host 查询 `history.locate`；`history.list` 增加 `offset`/`sessionId` |
| 批量清理已归档 | 「已归档」分批加载、多选、批量删除，显示逐条处理结果；保留产物库中的托管产物；跳过已取消归档的会话；单条删除可选同时清理托管产物 | 新增 `history/{DeleteSessionDialog,useArchivedHistory,sessionDeletion}`；Host `session.deleteArchived`；`session-delete-service` 增加 `archivedOnly` 与残留上报 |
| 活动图标 / Advisor 批次 | 桌面与 Web 对话（含手机页复用的渲染层）为等待、思考、回复、重试和工具执行显示专用活动图标，遵循减弱动效；Advisor 多条意见按批折叠，含阻断问题的批次默认展开，可复制整批；手动展开态在新消息、语言切换和虚拟滚动时保持 | 新增 `conversation/{ActivityGlyph,activityGlyphDrawing}.ts`、`advisorTranscript` 合并逻辑；`mobile/entry.tsx` 复用；`preview` 同步 |
| 表格与 Office 预览 | `.xlsm`、`.xlsb`、`.ods` 内置预览，方向键/Home/End/PageUp/Down 导航、Shift 扩选复制、支持 Excel 行列上限内的稀疏数据；可选 Office 组件增加 `.docm`、`.pptm`，转换时禁用宏 | 新增 `files/{SpreadsheetPane,spreadsheet.worker}`、`fileTypes` 扩展；桌面 `office-component.ts`、`file-resources.ts`、`file-io.ts` |
| SSH/WSL 准备流程 | 连接、认证与准备对话框展示目标、安装目录、网络选项及准备阶段，确认/上传阶段保持键盘焦点；SSH 文件传输显示远端实际接收进度，校验大小与 SHA-256，按目标系统选择传输方式，可重试失败后回退；演示连接与实际表单共用配置（端口/网络策略/安装目录） | 新增 `apps/desktop/src/remote/{file-transfer,channel}.ts`、`workspaces/{SshPasswordDialog,SshPreparationDialog,sshParts}`、`ssh.css` |
| 模型目录 | 随 OMP 19 更新内置目录（6,392 → 6,402 条），收录 Kiro、Modal、Bifrost 供应商定义；账号模型由 Runtime 连接后发现 | `catalog/model-catalog-v1.json`、`packages/host-client-api/src/model-catalog.generated.ts`、`scripts/model-catalog.mjs` |
| 修复：删除与清理 | 批量删除跳过已取消归档；原生统计或产物清理只完成一部分时，界面报告残留 | `session-delete-service.ts`、`session-purge-maintenance.ts` |
| 修复：SSH / 预览 | SSH 密码认证在 SFTP 批量传输中失效；预览连接未沿用所选端口、网络策略和安装目录 | `remote/{file-transfer,manager,terminal}.ts` |
| 修复：表格 / Office | 超大选区复制可能卡住预览；CSV 更新后跳失选区；Office 更新期间收尾的转换可能清掉新组件；Office 缓存清理保留仍被文件窗口使用的 PDF | `files/SpreadsheetPane`、`spreadsheet.worker`、`office-component.ts` |
| 修复：演示语言切换 | 演示对话实时切换语言时，已展开的 Advisor 批次不再重新折叠 | `preview/conversationFixtures.ts`、`conversation/*` |

### 2.9 逐条对照上游 CHANGELOG（漏项核对）

0.2.4 已在当前仓库中，本表覆盖 0.2.5–0.2.8 的每一条上游变更；“位置”指本文对应小节。

| 版本 | 上游条目（摘要） | 本文位置 |
|---|---|---|
| 0.2.5 | WSL 2 工作区（发行版/目录、资源管理器与 VS Code、重启恢复、Host 实例变化） | 2.1 |
| 0.2.5 | 手机访问（局域网证书、扫码配对、已有会话、继续/停止/单次审批） | 2.1 |
| 0.2.5 | Runtime `18.20.2-studio.15`，显示 Advisor 审阅意见 | 2.1 |
| 0.2.5 | 修复会话行被搬到新项目/双项目重复/重启前不消失 | 2.1 |
| 0.2.5 | 修复对话与 Markdown 路径链接（缺失/目录/网络路径） | 2.1 |
| 0.2.5 | 修复 Advisor 顺序、名称、严重程度、手机显示、复制来源 | 2.1 |
| 0.2.5 | 恢复原生提问表单分页与拖动高度 | 2.1 |
| 0.2.5 | OpenCode Go/Zen API Key 与授权模型目录 | 2.1 |
| 0.2.6 | 补齐安装包 HTTPS 证书依赖，修 `ERR_MODULE_NOT_FOUND` | 2.2 |
| 0.2.7 | Plan 源码/预览编辑、查找替换、章节/全文批注、草稿与撤销保留、保存失败保留现场 | 2.3 |
| 0.2.7 | 会话本地文件与完整工具输出浮窗（`/local`、Markdown 三视图、日志 ANSI/级别） | 2.3 |
| 0.2.7 | 统一反汇编工作台（IDA/Ghidra/自动/仅元数据、快捷卡、数据库、查询、编辑预览） | 2.3 |
| 0.2.7 | Runtime OMP 19.0.1；同步原生 Plan/Ask/后台交接/Daemon/Agent 等待关系/工作树；移除 Seance | 2.3 |
| 0.2.7 | Ask 连续折叠、选项附注图片、主输入框 `?` BTW | 2.3 |
| 0.2.7 | 模型菜单筛选/搜索、Kiro 多账号、Claude 订阅、Live 端点与音色、辅助/评判用量 | 2.3 |
| 0.2.7 | 性能：流式拷贝/代码块、评测报告、3D、会话切换、空闲开销 | 2.3 |
| 0.2.7 | 修复后台交接误切会话、会话文件目录与完整输出链接归属 | 2.3 |
| 0.2.7 | 修复资源浮窗跨会话焦点、重复打开文件保留草稿 | 2.3 |
| 0.2.7 | 修复文件编辑器在更新/只读/语言切换时重建状态 | 2.3 |
| 0.2.7* | 设置页搜索、MCP、反汇编、子代理、缓存预热、记忆与压缩形态（OMP 19 迁移报告，非 CHANGELOG 条目） | 2.3 |
| 0.2.7* | Agent 等待关系/跨实例、工作树 ovnfs、队列取消、后台匹配输出、原生键盘交还 | 2.3 |
| 0.2.8 | 会话 ID 复制→引用、来源选择、查看近期消息、最多 6 条摘录、仅发送 ID | 2.4 |
| 0.2.8 | 已归档分批加载/多选/批量删除、逐条结果、保留托管产物、跳过已取消归档、单条清理产物 | 2.4 |
| 0.2.8 | 桌面与 Web 活动图标、减弱动效、Advisor 批次折叠/阻断/整批复制/展开态保持 | 2.4 |
| 0.2.8 | `.xlsm/.xlsb/.ods` 预览、键盘导航与扩选、稀疏数据；`.docm/.pptm` 禁宏 | 2.4 |
| 0.2.8 | SSH/WSL 连接/认证/准备对话框与传输进度、大小/SHA-256 校验、传输方式与回退 | 2.4 |
| 0.2.8 | 修复批量删除跳过已取消归档、统计/产物残留上报 | 2.4 |
| 0.2.8 | 修复 SSH 密码 SFTP、预览连接端口/网络策略/安装目录 | 2.4 |
| 0.2.8 | 修复超大选区复制卡顿、CSV 跳选区、Office 转换竞态、Office 缓存保留 PDF | 2.4 |
| 0.2.8 | 修复演示对话切语言时 Advisor 批次重新折叠 | 2.4 |
| 0.2.7* | 模型目录随 OMP 19 更新（Kiro/Modal/Bifrost，6,402 条） | 2.4 |

带 `*` 的条目来自 `docs/migrations/omp-19.0.1.md`，是对 CHANGELOG 的补充；其余逐条对应上游 `CHANGELOG.md`。

### 2.5 变更量化（投影后，0.2.4 → 0.2.8）

| 区域 | 变更文件 | 新增 | 删除 | 行变化 |
|---|---:|---:|---:|---:|
| `apps/renderer` | 251 | 54 | 9 | +12,153 / −2,337 |
| `apps/desktop` | 50 | 14 | 0 | +2,052 / −285 |
| `omp-patch`（overlay + patches） | 90 | 3 | 7 | +3,994 / −3,817 |
| `packages/harness-protocol` | 32 | 1 | 2 | +293 / −171 |
| `packages/harness-host` | 12 | 1 | 0 | +351 / −44 |
| `packages/client-contract` | 9 | 0 | 0 | +56 / −8 |
| `packages/host-client-api` | 9 | 0 | 0 | +119 / −28 |
| `packages/transport-web` | 4 | 0 | 0 | +186 / −26 |
| `scripts` | 8 | 1 | 0 | +90 / −36 |
| `docs` / `doc` | 24 | 18 | 0 | +793 / −16 |
| `catalog` | 1 | 0 | 0 | +471 / −176 |
| `packaging` | 5 | 0 | 0 | +39 / −38 |
| 根目录 | 7 | 0 | 0 | +648 / −76 |

新增文件中，渲染层 54 个、桌面 14 个；删除的 18 个里，渲染层 9 个是 IDA/Seance，协议 2 个是 `ida*.ts`，overlay 7 个是 IDA/Seance 服务与测试。

### 2.6 协议与数据模型（增量，不破坏 v1）

- 新增 client 操作：`history.locate`（查询）、`session.deleteArchived`（命令）、`workspace.paths.resolve`（查询）。
- `history.list` 增加 `offset`、`sessionId`；`SessionHistoryMatch` 仅用于 `history.locate`。
- 新增 `contracts/disassembler.ts`，提供 11 个运行时操作；删除 `contracts/ida.ts`、`ida-details.ts`。
- `local-resources.ts` 新增 `resource.local.ensureDir`，`resource.local.list` 增加 `localRootPath`。
- `plan-review.ts` 新增 `mode.plan.review.save`，`PlanExecutionTier` 增加 `contextWindow`，`NativePlanReview` 增加 `options`/`contextRatio`。
- `TokenUsageReadModel` 增加 `offTranscript`、`decisionModels`；`HarnessAgentMessage` 增加 `peer`、`peerInstance`。
- `FEATURE_SETTING_KEYS` 新增 21 个键（`disassembler.*`、`live.*`、`mcp.*`、`mnemopi.*`、`providers.cacheWarming*`、`task.crossInstance` 等）。
- `GUI_SETTING_DEFINITIONS` 中 `ida.*` 更名为 `disassembler.*`（4 个键合并为 3 个）。
- `HARNESS_PROTOCOL_VERSION` 仍为 `1`；线标识 `juling-harness` / `harness.host` / `harnessOrigin` 不变。

### 2.7 依赖与打包

- 桌面新增依赖：`qrcode`、`ws`、`@peculiar/x509`、`@peculiar/asn1-schema`、`asn1js`、`reflect-metadata`
  （手机访问的证书、扫码与 WebSocket）。新增 devDeps：`@types/qrcode`、`@types/ws`。
- 渲染层新增依赖：`@juling-harness/transport-web`（手机页复用 browser transport）。
- `packages/transport-web` 新增 `./browser` 子路径导出；本地目前只有 `browser-client.ts`，未声明导出。
- `packaging/electron-builder.yml` 增加 `afterPack: ./scripts/audit-mobile-certificate.mjs`，
  并新增该脚本与证书打包检查。
- 新增入口：`apps/renderer/mobile.html`、`mobile-access-harness.html`、`runtime-migration-harness.html`；
  Vite `input` 增加 `mobile`。

### 2.8 新增文档（建议吸收）

`docs/mobile-access.md`、`docs/wsl-workspaces.md`、`docs/migrations/omp-19.0.1.md`、
`docs/migrations/omp-19.0.1-migration-plan.md`、`docs/releases/v0.2.5|6|7|8.md`、
`docs/reviews/{runtime-performance-2026-11-19,v0.2.7-release-review,v0.2.8-release-review}.md`。

## 3. 你现在的源码改了什么（必须保留）

相对 0.2.4 基线（`c08f52a3..HEAD`，不含 2 个未提交文件）：

| 区域 | 变更文件 | 行变化 | 内容 |
|---|---:|---:|---|
| `apps/renderer` | 233 | +16,523 / −2,264 | 六语 i18n、导航 rail/壳、Quiet Precision 主题、统计页、预览 fixture、壳交互修复 |
| `omp-patch/patches` | 7 | +9,573 / −92 | 0005 身份补丁（22 文件）、0006 统计面板中文化（57 文件） |
| `docs` | 99 | +1,975 / −3,131 | 文档重写、1.0.0/1.0.1 发布说明、README 多语、截图替换 |
| `website` | 30 | +1,475 / −4,200 | 本地官网 `b/`、`c/`，删除上游旧站点素材 |
| `packages/host-client-api` | 21 | +1,022 / −469 | Juling 文案、模型/用量适配、facade 本地改动 |
| `apps/desktop` | 71 | +642 / −299 | 产品名、窗口背景、agent-home 迁移、远程栈、更新器 |
| `scripts` | 34 | +460 / −186 | 打包/签名/更新/预览脚本本地化，omp-seam 扩展 0005/0006 |
| `packages/harness-host` | 21 | +407 / −60 | `agent-home.ts`（`~/.omp`→`~/.juling` 迁移）、旧 `studioOrigin` 兼容、runtime-resolver |
| `packages/runtime-installer` | 10 | +187 / −55 | 双签名域、Linux 更新、平台表 |
| `omp-patch/overlay` | 31 | +146 / −72 | `PATCHSET_VERSION`、stats-worker、benchmarks `cancelled` 状态、格式化 |
| 其余 | — | — | `packaging`、`catalog`、`.github`、`ui_reference` 等 |

必须保留的本地能力清单：

1. **身份**：`juling-harness` / `Juling Harness` / `juling.exe`（macOS/Linux `juling`）/
   `~/.juling` / `JULING_*` 环境变量 / `julingHarness*` 全局对象 /
   `juling-harness-update-v2` + `omp-studio-update-v2` 双验签域 / 本地更新源与签名 key。
2. **六语界面**：`zh/en/ru/ja/ko/hi`；`Locale` 类型、回退链、`t()` 字典、桌面 `desktopText`。
3. **预览模式**：`PreviewContext` + `fixtures.ts` / `surfaces.tsx` / 各页 fixture；
   `PREVIEW_MODE_SWITCH_ENABLED = false`（保持关闭）。
4. **统计页**：`StatisticsPage.tsx` iframe + `stats.dashboard` + overlay `stats-worker.ts` +
   `0006-stats-dashboard.patch`（中文化/换标/`?lang=`）。
5. **壳与主题**：`NavRail`、`AppShell`、`AppTopbar`、`WorkbenchCanvas`、`tokens.css`/`workbench.css`、
   四档光效背景、头像飞行动画、启动通知。
6. **产品行为**：模型供应商预设（Juling 网关）、Agent Hub 最大化、更新入口即时检查、
   `agent-home` 迁移、旧 `studioOrigin` 会话可见、`LEGACY_RUNTIME_ENTRYPOINTS` 兼容。
7. **构建/发布**：`启动预览版.cmd`、`preview.mjs` 本地模式、`omp-seam.mjs` 的 0005/0006 分组、
   packing/installer/网站本地改动。
8. **Runtime 身份补丁**：`0005-juling-identity.patch`（app 名、`.juling`、UA、CLI 文案）。

## 4. 冲突面（140 个重叠文件）

完整清单见附录 A。按风险分组：

| 等级 | 文件数 | 代表 |
|---|---:|---|
| 高（Runtime/协议/更新链路） | 17 | `omp-patch/patches/*`、`overlay/{bridge-server,agent-hub-service,live-audio-service,media-service,runtime-settings-service}.ts`、`harness-host/src/session-catalog.ts`、`transport-web/src/server.ts`、`runtime-installer/*` |
| 中高（壳/页面/主题/i18n） | ~55 | `workbench/{AppShell,WorkbenchCanvas,AppTopbar}.tsx`、`styles/workbench.css`、`i18n/locales/{en,zh}.ts`、`preview/{fixtures,modelConfigFixtures,resourcesPreview,...}.ts`、`HistoryPage`、`files/FilePane.tsx`、`capabilities/McpRuntimePane.tsx`、`settings/catalog.ts` |
| 中（桌面/打包/文档） | ~30 | `apps/desktop/src/{main,preload,host-factory,remote/*,session-commands,runtime-session}.ts`、`packaging/{electron-builder.yml,nsis/custom.nsh,installer-host/InstallerHost.cs,linux/AppRun}`、`docs/*`、`README*.md`、`CHANGELOG.md` |
| 低（测试/生成物/根） | ~38 | `*.test.*`、`package.json`/`package-lock.json`、`catalog/model-catalog-v1.json`、`doc/feature-index.md`、`LICENSE`/`NOTICE` |

### 4.1 高风险点（必须有明确决策）

1. **Runtime pin 与 overlay/接缝**
   - 上游 0.2.8 的 overlay 已按 OMP 19 写：删除 `ida*`/`seance-service`，新增
     `disassembler-protocol.ts`、`services/disassembler-service.ts`。
   - 本地 overlay 仍有 3 个文件 import `../../ida`（`ida-service`、`ida-details-service`、
     `runtime-settings-service`），OMP 19 已无该目录；必须改到 `../../disasm`/`../../ghidra`
     或直接采用上游新文件。
   - 本地接缝清单 239 条，其中 **15 条在 OMP 19 已不存在**：
     `crates/pi-natives/*`（4）、`crates/pi-vcs/*`（2）、`crates/pi-natives/src/vcs.rs`、
     `src/ida/{protocol,supervisor}.ts`、`src/launch/{broker,protocol}.ts`、
     `src/predict/daemon.ts`、`tui/src/html-form/model.ts`、`stats/src/client/{brand,i18n}.ts`。
     上游 0.2.8 的 `omp-seam.mjs` 已给出新路径（`crates/natives/*`、`crates/vcs/*`、
     `daemon/{protocol,units}.ts`、`daemon/modules/predict.ts`、`disasm/*`、`ghidra/worker.py`、
     `irc/mesh.ts` 等）。
2. **`0006-stats-dashboard.patch`**
   - 57 个目标文件里，55 个在 OMP 19 仍存在；`packages/stats/src/client/brand.ts` 与
     `i18n.ts` 已被上游删除。
   - OMP 19 的统计前端从 95 个文件变成 102 个，新增 `App.tsx`、`app/keys.ts`、
     `charts/*`、`data/*`、`routes/index.ts`、`traces/*`、`ui/*`，旧的 `brand/i18n` 入口消失。
   - 结论：0006 **不能直接 `git apply`**，需要在新的 stats client 上重新落中文化与换标，
     然后由 `omp:patches:regen` 重新生成。
3. **`0005-juling-identity.patch`**：22 个目标文件在 OMP 19 全部存在（已核对），
   但上下文有变化；在 vendor 里重放后由 regen 生成，不手改 `.patch`。
4. **Seance 移除 / IDA 更名**：本地渲染层的 `IdaPane*`、`SeanceDialog`、`preview/ida*`
   以及协议 `contracts/ida*` 必须随上游删除；`CapabilitiesPage` 的 `ida` 标签改为
   `disassembler`。这是「功能替换」，不是冲突合并。
5. **`session-catalog.ts`**：本地保留旧 `studioOrigin` 兼容与 `agent-home` 解析；
   上游重写了 `history.locate` 的会话头读取。合并时以上游新解析器为骨架，
   把本地兼容分支嵌进去。
6. **`transport-web/server.ts`**：上游新增 mobile 模式（pairing 轮换、session 过期、
   context 串行打开、Secure cookie、`/api/v1/session`），本地有
   `closeSession`/`pruneSessions` 改造。保留本地清理路径，吸收上游 mobile 分支。
7. **更新器**：本地双签名域 + Linux 安装器 + `juling` entrypoints；
   上游 0.2.8 对 `runtime-installer` 只改了 2 行，冲突小，但 `package-lock.json` 与
   桌面依赖要整体重装。
8. **桌面新 API**：`ompHarnessMobileAccess`（本地应为 `julingHarnessMobileAccess`）、
   `openProjectInEditor/openProjectDirectory` 增加可选 `targetId`、WSL 路径映射。
   本地已把窗口桥全部改名为 `julingHarness*`，新代码必须同步改名。
9. **打包/安装器**：`InstallerHost.cs` 里本地把迁移参数改成了 `--juling-migrate-runtime`
   （`main.ts` 同步解析）；上游 0.2.8 仍写 `--omp-migrate-runtime`。合并时必须保持成对一致，
   否则升级安装的运行时迁移会静默失效。
10. **`AppRun` 已知本地缺陷**：本地 `packaging/linux/AppRun` 仍执行 `$APPDIR/omp-studio`，
    而 `scripts/linux-bundle.mjs` 的 `LINUX_EXECUTABLE = "juling-harness"`。
    本次投影会把它改成 `juling-harness`，应顺手收下并加一次 AppImage 启动验证。

### 4.2 不冲突但必须补的改名面

上游 0.2.8 新增/改写的代码重新引入了旧身份：

| 上游写法 | 本地写法 | 说明 |
|---|---|---|
| `ompHarnessChrome/Remote/Terminal/Perf/Picker`（88 文件） | `julingHarness*`（87 文件） | 投影脚本不处理 `omp` 前缀，需身份补一次 |
| `ompHarnessMobileAccess`（新增 3 处） | `julingHarnessMobileAccess` | 新增全局桥 |
| `omp.exe` / `omp`（45 文件） | `juling.exe` / `juling` | 仅产物/脚本；`LEGACY_RUNTIME_ENTRYPOINTS` 保留 `omp` 读取 |
| `OMP_AGENT_DIR`（12 文件） | `JULING_AGENT_DIR` 优先、`OMP_*` 回退 | 新代码不得只写 `OMP_*` |
| `.omp`（151 文件） | `.juling`（126 文件） | 兼容读取可保留，主路径必须 `.juling` |
| `OMP-Studio-Mobile-CA.cer` | `Juling-Harness-Mobile-CA.cer` | 投影规则可覆盖 |
| `omp.mobileAccess.trustedFingerprint` | `juling.mobileAccess.trustedFingerprint` | 新增 localStorage 键 |
| CSS `@keyframes omp-*` | **保持 `omp-*`** | 本地 `styles/motion.css` 的动画名就是 `omp-*`，不要改 |

## 5. 升级步骤（确认后执行）

### Phase 0：冻结与基线（当天）

```bash
git status --short                 # 先把 2 个未提交文件按域提交或暂存
git switch -c upgrade/0.2.8
git tag pre-0.2.8-$(date +%Y%m%d)
npm run check -- --fast            # 确认基线绿
```

建议把 `apps/renderer/vite.config.ts` 与 `scripts/audit-linux.mjs` 单独提交（不要塞进合并提交），
`.release-backup/`、`.release-work/` 保持未跟踪、不提交。

### Phase 1：生成 0.2.8 投影分支

1. 把投影脚本固化到仓库 `scripts/project-omp-studio.mjs`（不再放临时目录），并修正已知缺陷：
   - 文本扩展名补齐 `.py`、`.cs`、`.nsh`、`.ps1`、`.sh`、`.cmd`、`.jsonc`；
   - 无扩展名但无 NUL 的文件按文本处理（`packaging/linux/omp-deb-update`、`AppRun`）；
   - 统一 LF；
   - 追加 **OMP→Juling 身份规则**（与 `studio→harness` 分开，避免误改）：
     `ompHarness*`→`julingHarness*`、`omp.exe`→`juling.exe`、
     `OMP_AGENT_DIR`→`JULING_AGENT_DIR`（保留回退逻辑的文件手工处理）、
     `.omp`→`.juling`（仅主路径与用户可见文案；兼容读取保留）、
     `Juling` 产品名、`@juling-harness/` 作用域。
   - **不要**把 CSS keyframes（`omp-spin`、`omp-pulse`、`omp-pop-in`…）、
     `omp-patch/` 目录名、`oh-my-pi` 包名做替换。
2. 投影到仓库外，逐项核对：
   ```bash
   grep -rIl "omp-studio\|OMP Studio\|@omp-studio/" proj028   # 只应剩 .bin/.webp 等二进制
   grep -rIl "ompHarness" proj028                             # 应为 0
   grep -rIn "omp\.exe" proj028 | wc -l                        # 只允许兼容读取/测试
   ```
3. 落库到独立分支：
   ```bash
   git switch -c upstream/omp-studio-0.2.8 c08f52a3
   # 用 rsync/robocopy 把投影树覆盖到工作区，排除 .git、node_modules、dist、outputs、
   # .release-*、omp-patch/vendor
   git add -A
   git commit -m "upstream: projected omp-studio v0.2.8 (studio->harness, juling identity, lf)"
   ```

### Phase 2：合并与按域解冲突

```bash
git switch upgrade/0.2.8
git merge --no-ff upstream/omp-studio-0.2.8
```

按以下顺序处理（先底层后 UI）：

1. `packages/*`：`harness-protocol` → `client-contract` → `client` → `host-client-api` →
   `harness-host` → `transport-*` → `runtime-installer` → `testkit`。
2. `apps/desktop`：`main/preload/host-factory`、`remote/*`、`session-commands`、`runtime-session`。
3. `omp-patch`：见 Phase 3（不要在合并提交里手改 `.patch`）。
4. `apps/renderer`：先协议驱动页（`CapabilitiesPage` 反汇编、`HistoryPage`、`AppShell`、
   `WorkbenchCanvas`、`files/*`、`composer/*`），再样式与预览。
5. `i18n`：先合 `en/zh`，再补 4 语言。
6. `docs` / `README` / `CHANGELOG`：按本地措辞合并，不照抄上游。

关键规则：

- 冲突文件一律「本地行为 + 上游新能力」，不允许用 `--theirs`/`--ours` 整文件覆盖。
- 上游删除的 `IdaPane*`、`SeanceDialog`、`ida.css`、`preview/ida*`、
  `contracts/ida*.ts` 保持删除；本地引用同步迁移到 `disassembler`。
- `session-catalog.ts`、`transport-web/server.ts`、`facade.ts` 以新骨架 + 本地兼容分支合并。
- `styles/*.css` 以本地主题为准，只吸收上游新增选择器（mobile、disassembler、spreadsheet、
  advisor batch、activity glyph）。
- 每个域解完先跑对应切片（见 Phase 7），不要攒到最后。

### Phase 3：Runtime 19.0.1 重定基

前置：`omp-patch/vendor/oh-my-pi` 当前是 `blob:none` 部分克隆，**本地没有**
`f40f335845f0b136453d12fec8d6057011082766`；本次分析中两次 `git fetch` 都被网络重置，
拉取是升级的第一道实际门槛。

1. 同步上游子树：
   ```bash
   git -C omp-patch/vendor/oh-my-pi fetch --depth 1 origin f40f335845f0b136453d12fec8d6057011082766
   git -C omp-patch/vendor/oh-my-pi checkout --detach f40f335845f0b136453d12fec8d6057011082766
   ```
   失败时：换网络重试；或 `git clone --filter=blob:none` 重新克隆后替换 vendor；
   或下载 `codeload.github.com/can1357/oh-my-pi/tar.gz/f40f335…` 解压进 vendor（保留 `.git` 以便
   regen 比对，否则 `omp:patches:regen` 无法工作）。
2. 更新 `omp-patch/upstream.json`（commit、entrypoint 仍写 `juling.exe/juling`）。
3. 把投影后的 overlay 铺进 vendor，并按上游 0.2.8 的 4 个接缝补丁为底：
   ```bash
   npm run omp:overlay:apply
   ```
   预期 `0001–0004` 干净落位；本地 `0005/0006` 需要重放：
   - 0005：22 个文件全部存在，按 hunk 落 vendor（`git apply -3` 可用时优先三方合并）；
   - 0006：先按 OMP 19 的新 stats client 结构重做中文化与换标
     （`brand.ts`/`i18n.ts` 已删，需把品牌与 `t()` 迁到新入口/新组件），再在 vendor 里修改；
   - 本地 overlay 里 `ida-service.ts`、`ida-details-service.ts`、`runtime-settings-service.ts`
     改为上游 `disassembler-service.ts` / `disasm/settings` 版本；
     `benchmarks-protocol.ts` 的 `cancelled` 状态、`stats-worker.ts` 的本地改动保留。
4. 更新 `scripts/omp-seam.mjs`：以上游 0.2.8 的分组路径为底（166 条），
   再追加本地 `0005`（22 条）与 `0006`（57 条，删掉已不存在的 2 条），
   并保留 `packages/coding-agent/src/export/html/viewer.generated.json`。
5. 重生成与校验：
   ```bash
   npm run omp:patches:regen
   npm run omp:verify:patches
   npm run runtime:verify-source
   npm run omp:build:host          # 需要 Bun 1.4.4 + Rust nightly-2026-11-08
   ```
   预期新 patchset 为 `19.0.1-harness.1`（digest 变化后由脚本递增为 `.2` 或更高）；
   `bridge-server.ts` 的 `PATCHSET_VERSION`、`series.json`、`upstream.json` 三处一致。
6. 更新 `omp-patch/README.md` 与 `docs/migrations/omp-19.0.1.md`（本地版）里的 pin、工具链、
   入口名与验证记录。

### Phase 4：i18n、预览与本地功能补齐

1. `en/zh` 合入上游 35 个新键、删除 `handoffToNewSession`、`idaTab`（改用 `disassemblerTab`）；
   本地 6 个本地键（`langHi/Ja/Ko/Ru`、`language`、`theme` 等）保留。
2. 把 35 个键翻译进 `ru/ja/ko/hi`（约 140 条），并保持 `i18n.test.ts` 的键集/占位符断言。
3. 新页面的预览 fixture 必须按 `AGENTS.md` 补齐：
   - 手机访问（`PREVIEW_MOBILE_ACCESS`）、WSL 目标选择、SSH 准备与传输；
   - 反汇编器（`disassemblerPreview.ts`、`disassemblerDatabaseToolsPreview.ts`）；
   - 会话引用（`SessionReferenceDialog`）、批量删除（`DeleteSessionDialog`）、
     表格预览、Plan 编辑、活动图标、Advisor 批次。
   上游已带一部分 fixture，直接接入本地 `PreviewContext`；预览关时保持诚实空态。
4. `doc/feature-index.md` 增加 OMP 19 入口与反汇编/手机/WSL/会话引用/批量删除映射。
5. 版本：root 与 14 个 workspace 统一升 `1.1.0`，`npm install --package-lock-only`
   （新增桌面依赖会改 `package-lock.json`），并确认 `PREVIEW_MODE_SWITCH_ENABLED = false`。

### Phase 5：验证

```bash
npm run check -- --fast
npm run check -- --only harness-protocol
npm run check -- --only harness-host
npm run check -- --only host-client-api
npm run check -- --only transport-web
npm run check -- --only renderer
npm run check -- --only desktop
npm run check -- --all
npm run build
npm run test:tooling
npm run omp:verify:patches
npm run runtime:verify-source
```

手工验收（`启动预览版.cmd` + 真实 Host 各一次）：

- 手机访问：证书导出/信任、扫码配对、只读项目范围、继续对话、停止回合、单次审批、撤销授权。
- WSL：选择发行版、安装位置、文件/Git/终端、重启恢复、VS Code/资源管理器打开。
- 会话引用：复制 ID、粘贴、多来源选择、6 条摘录、发送后恢复。
- 已归档批量删除：分批加载、多选、结果逐条、保留产物、跳过已取消归档、单条清理产物。
- 表格/Office：`.xlsm/.xlsb/.ods` 导航与复制、`.docm/.pptm` 转换、宏禁用、缓存清理。
- 反汇编器：IDA/Ghidra/自动/仅元数据、数据库查询、编辑预览与原生备份。
- Plan：源码/预览联动、查找替换、批注、切语言/收起保留、批准前保存。
- 会话文件浮窗：`/local`、Markdown 分栏、日志 ANSI 与级别、未保存草稿确认。
- Advisor：批次折叠、阻断默认展开、复制整批、语言切换保持。
- 壳与本地能力：六语切换、rail 导航、统计页、预览开关（关时无演示数据）、更新检查、图标/名称。
- Runtime：`juling --mode harness-host` Hello 版本为 `19.0.1-harness.N`，能力列表哈希与打包一致。

## 6. 需要你确认的决策

### 6.1 升级范围

- **A. 一次性升级到 0.2.8 + OMP 19.0.1（推荐）**
  优点：与上游一致，0.2.7/0.2.8 功能完整；后续升级基线简单。
  代价：Runtime 重定基、重建签名产物、重新验收。
- **B. 分两段：0.2.6（仍 18.20.2）→ 0.2.8（19.0.1）**
  上游 tag 可下载（`v0.2.5`…`v0.2.8` 均返回 200）。适合先拿 WSL/手机访问，
  但最终仍要跨 OMP 19，总工作量更大。
- **C. 只合并应用层，保留 18.20.2 Runtime**
  0.2.8 的 overlay/接缝是按 OMP 19 写的，采用它就必须换 pin；若坚持旧 pin，
  需挑拣应用层文件并长期维护两套 Runtime 兼容分支，不推荐。

### 6.2 版本号

- **A. `1.1.0`（推荐）**：本地已是 1.0.1，1.1.0 是功能升级，更新通道语义正确。
- **B. `2.0.0`**：把 OMP 18→19 视为破坏性升级；需要确认发布说明与用户预期。
- **C. `0.2.8`**：不建议，会让 1.0.1 用户收到「降级」。

### 6.3 反汇编器替换 IDA

- **A. 跟随上游（推荐）**：删除本地 IDA 面板/设置/协议，统一反汇编器；
  IDA 仍作为可选后端（`disassembler.backend=ida`）。
- **B. 保留旧 IDA 面板**：需要同时维护 `ida.*` 与 `disassembler.*` 两套协议，
  且 OMP 19 已无 `src/ida`，不可行。

### 6.4 手机访问 / WSL

- **A. 全量接入（推荐）**：Windows 桌面启用手机访问与 WSL；接受新依赖、证书打包与审计脚本。
- **B. 仅渲染层保留入口、桌面不启用**：需要额外裁剪 IPC 与打包，后续再开成本更高。

### 6.5 统计面板

- **A. 按 OMP 19 新 stats client 重做中文化与换标（推荐）**：保留本地统计页体验。
- **B. 暂用上游英文面板**：先不重做 0006，统计页中文化能力回退；后续补。

### 6.6 官网 / 文档

- 上游 0.2.4→0.2.8 **没有改 website**，本地 `website/b`、`website/c` 不受影响；
  仅需吸收 `docs/*` 新说明（手机访问、WSL、OMP 19 迁移、0.2.5–0.2.8 发布说明）。
- 建议：保留本地 README 结构与品牌，新增文档按本地中文措辞收录。

### 6.7 是否把投影脚本入库

建议：**是**。本次分析用的投影脚本目前只在临时目录（上次升级也踩过）。固化到
`scripts/project-omp-studio.mjs` 并纳入检查，下一次升级不再重新造轮子。

### 6.8 Linux AppRun

建议：本次一并修正为 `exec "$APPDIR/juling-harness"`，并补一次 AppImage 启动验收。

## 7. 验收定义（DoD）

- 工作区干净；`npm run check -- --all`、`npm run build`、`npm run test:tooling` 全绿。
- `npm run omp:verify:patches`、`npm run runtime:verify-source` 通过；
  `series.json`、`PATCHSET_VERSION`、`upstream.json`、`architecture.test.mjs` 四处一致。
- Runtime 为 `19.0.1-harness.N`，已用本地 key 签名并通过 `omp:build:host` 冒烟。
- 六语字典键集一致；35 个新键四语齐全；语言切换不丢草稿/连接。
- 预览模式互斥：预览开只用 fixture，预览关不残留演示数据；`marks=off` 不显示演示标记。
- 名字与本地能力：`juling-harness` / `Juling Harness` / `juling.exe` / `.juling` /
  `julingHarness*` / 双签名域 / 六语 / 统计页 / rail 导航全部保留。
- 0.2.5–0.2.8 新功能按 §5 Phase 5 手工验收通过。
- 回滚：保留 `pre-0.2.8-*` tag 与旧签名 Runtime 产物；回滚只需切回 tag 并还原 vendor pin。

## 附录 A：重叠文件清单（140）

```
CHANGELOG.md
LICENSE
NOTICE
README.en.md
README.md
apps/desktop/package.json
apps/desktop/src/chrome-api.ts
apps/desktop/src/external-editor.ts
apps/desktop/src/host-factory.ts
apps/desktop/src/main.ts
apps/desktop/src/preload.ts
apps/desktop/src/remote/host.ts
apps/desktop/src/remote/ipc.ts
apps/desktop/src/remote/transport.ts
apps/desktop/src/runtime-session.ts
apps/desktop/src/session-commands.ts
apps/desktop/test/office-component.test.ts
apps/desktop/test/remote-host.test.ts
apps/desktop/test/remote-recovery.test.ts
apps/desktop/test/session-commands.test.ts
apps/desktop/test/workspace-files.test.ts
apps/renderer/package.json
apps/renderer/src/CapabilitiesPage.tsx
apps/renderer/src/ModelConfigPage.test.tsx
apps/renderer/src/ModelConfigPage.tsx
apps/renderer/src/capabilities/McpRuntimePane.tsx
apps/renderer/src/capabilities/ResourcesWorkspace.test.tsx
apps/renderer/src/composer/ChipComposer.tsx
apps/renderer/src/composer/ingest.ts
apps/renderer/src/conversation/ActivityLine.test.tsx
apps/renderer/src/conversation/ConversationItemView.tsx
apps/renderer/src/conversation/ToolBody.tsx
apps/renderer/src/conversation/conversationStore.test.ts
apps/renderer/src/conversationWorkspace/Workspace.tsx
apps/renderer/src/conversationWorkspace/workspace.test.tsx
apps/renderer/src/deck/FormCard.test.tsx
apps/renderer/src/dock/DockLauncher.tsx
apps/renderer/src/dock/DockRegions.tsx
apps/renderer/src/dock/NativeFloat.tsx
apps/renderer/src/fileBrowser/FileBrowserDock.tsx
apps/renderer/src/files/FileDockInstances.test.tsx
apps/renderer/src/files/FilePane.test.tsx
apps/renderer/src/files/FilePane.tsx
apps/renderer/src/files/FileViewerSettings.tsx
apps/renderer/src/files/OfficePane.tsx
apps/renderer/src/files/fileLinks.test.tsx
apps/renderer/src/files/fileLinks.tsx
apps/renderer/src/files/filePreferences.ts
apps/renderer/src/files/useWorkspaceFileActions.ts
apps/renderer/src/history/ResumeScopePane.tsx
apps/renderer/src/i18n/locales/en.ts
apps/renderer/src/i18n/locales/zh.ts
apps/renderer/src/media/LiveAudioPane.tsx
apps/renderer/src/media/mediaWorkbench.css
apps/renderer/src/models/AccountStatusPane.tsx
apps/renderer/src/models/config/drafts.ts
apps/renderer/src/onboarding/onboarding.css
apps/renderer/src/panels/registry.ts
apps/renderer/src/preview/conversationFixtures.ts
apps/renderer/src/preview/fixtures.ts
apps/renderer/src/preview/modelConfigFixtures.ts
apps/renderer/src/preview/nativeToolGallery.ts
apps/renderer/src/preview/resourcesPreview.ts
apps/renderer/src/preview/runtimeCatalogPreview.ts
apps/renderer/src/services/ServicesPane.tsx
apps/renderer/src/services/services.css
apps/renderer/src/settings/LocalSettings.tsx
apps/renderer/src/settings/catalog.ts
apps/renderer/src/sidebar/AppSidebar.tsx
apps/renderer/src/styles/workbench.css
apps/renderer/src/test/form-18190-harness.tsx
apps/renderer/src/vite-env.d.ts
apps/renderer/src/workbench/AppShell.tsx
apps/renderer/src/workbench/AppTopbar.tsx
apps/renderer/src/workbench/WorkbenchCanvas.tsx
apps/renderer/src/workspaces/ExecutionTargets.test.tsx
apps/renderer/src/workspaces/ExecutionTargets.tsx
apps/renderer/vite.config.ts
catalog/model-catalog-v1.json
doc/feature-index.md
docs/README.md
docs/file-viewer.md
docs/ssh-workspaces.md
omp-patch/README.md
omp-patch/overlay/packages/coding-agent/src/harness/bridge-dispatcher.ts
omp-patch/overlay/packages/coding-agent/src/harness/bridge-server.ts
omp-patch/overlay/packages/coding-agent/src/harness/command-arbiter.ts
omp-patch/overlay/packages/coding-agent/src/harness/harness-host-mode.ts
omp-patch/overlay/packages/coding-agent/src/harness/services/agent-hub-service.ts
omp-patch/overlay/packages/coding-agent/src/harness/services/live-audio-service.ts
omp-patch/overlay/packages/coding-agent/src/harness/services/media-service.ts
omp-patch/overlay/packages/coding-agent/src/harness/services/runtime-settings-service.ts
omp-patch/overlay/packages/coding-agent/test/harness-ida-checkpoint.py
omp-patch/overlay/packages/coding-agent/test/harness-tree-service.test.ts
omp-patch/patches/0001-harness-cli-entry.patch
omp-patch/patches/0002-harness-session-runtime.patch
omp-patch/patches/0003-harness-modes-and-pause.patch
omp-patch/patches/0004-harness-extensibility.patch
omp-patch/patches/series.json
omp-patch/upstream.json
package-lock.json
package.json
packages/client-contract/package.json
packages/client-contract/src/read-models.ts
packages/client/package.json
packages/harness-host/package.json
packages/harness-host/src/evaluation-coordinator.ts
packages/harness-host/src/session-archive-reader.ts
packages/harness-host/src/session-catalog.ts
packages/harness-host/test/session-catalog.test.ts
packages/harness-protocol/package.json
packages/harness-protocol/src/contracts/gui-settings.ts
packages/harness-protocol/src/frame-codec.ts
packages/host-client-api/package.json
packages/host-client-api/src/facade.ts
packages/host-client-api/src/model-catalog.generated.ts
packages/host-client-api/src/omp-models-adapter.ts
packages/host-client-api/src/omp-usage-adapter.ts
packages/host-client-api/src/services.ts
packages/platform-darwin/package.json
packages/platform-win32/package.json
packages/platform/package.json
packages/runtime-installer/package.json
packages/testkit/package.json
packages/testkit/src/fixtures.ts
packages/transport-desktop/package.json
packages/transport-desktop/src/index.ts
packages/transport-web/package.json
packages/transport-web/src/server.ts
packages/transport-web/test/server.test.mjs
packaging/electron-builder.yml
packaging/installer-host/InstallerHost.cs
packaging/linux/AppRun
packaging/mac/entitlements.mac.plist
packaging/nsis/custom.nsh
scripts/full-gui-e2e.mjs
scripts/native-session-perf.mjs
scripts/omp-seam.mjs
scripts/runtime-artifact.mjs
scripts/runtime-artifact.test.mjs
```

## 附录 B：需要补的 i18n 键（上游新增 35，删除 2）

```
advisorBatch advisorCount advisorSeverity archiveLoadError archiveLoading
batchCleanupDetail batchCleanupPartial batchDeleteFailed batchDeleteNeedsUpdate
batchDeleted batchFailureDetail batchRetainArtifacts blockerOne clearSelection
concernOne deleteArchivedDesc deleteArchivedTitle deleteHistoryPending
deleteNeedsScopedHost deleteProgress deleteSelected deleteSessionFailed
deleteStopsTurn deletedSession disassemblerTab loadMoreArchived nitOne
noArchivedSessions noteOne openCode remoteWsl selectAllArchived selectSession
selectedCount stopAndDelete
```

删除：`handoffToNewSession`、`idaTab`（由 `disassemblerTab` 取代）。
本地独有的 `langHi`、`langJa`、`langKo`、`langRu`、`language`、`theme` 等键保留。

## 附录 C：OMP 18.20.2 → 19.0.1 模块重命名（接缝清单必须跟着改）

| 18.20.2 | 19.0.1 |
|---|---|
| `packages/coding-agent/src/ida/{protocol,supervisor}.ts`、`ida/worker.py` | `src/disasm/{protocol,supervisor}.ts`、`src/disasm/prelude.py`；Ghidra 在 `src/ghidra/*` |
| `packages/coding-agent/src/launch/{protocol,broker}.ts` | `src/daemon/{protocol,units}.ts`（`launch/services.ts` 仍在） |
| `packages/coding-agent/src/predict/daemon.ts` | `src/daemon/modules/predict.ts` |
| `crates/pi-natives/*` | `crates/natives/*` |
| `crates/pi-vcs/*` | `crates/vcs/*` |
| `packages/stats/src/client/{brand,i18n}.ts` | 已删除；统计前端重写为 `App.tsx` + `app/`/`charts/`/`data/`/`routes/`/`spotlight/`/`traces/`/`ui/` |
| `packages/tui/src/html-form/model.ts` | 不再存在；`parse.ts` 保留（本地 0004 会创建 `model.ts`，需重新核对） |

新增上游接缝路径：`src/irc/mesh.ts`、`src/daemon/modules/predict.ts`、
`src/modes/controllers/tan-command-controller.ts`、`src/ghidra/worker.py`、
`src/disasm/{protocol,supervisor}.ts`、`src/daemon/{protocol,units}.ts`、
`packages/tui/src/tools/daemon.ts`、`src/tools/browser/native-windows.ts`、
`src/mcp/eval-namespaces.ts`、`crates/natives/src/desktop/*`、`crates/natives/src/vcs.rs`、
`crates/vcs/src/{types.rs,git/mutate.rs}`。

## 附录 D：风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| vendor 拉取 OMP 19 失败（本次两次 fetch 被重置） | 无法 regen / 无法构建 Runtime | 换网络重试、shallow clone、或按 commit tarball 替换 vendor 工作树；先完成 Phase 1–2 应用层 |
| 0006 统计补丁需重写 | 统计页中文化/换标缺失 | 按 OMP 19 新 client 结构重做；实在来不及可选 6.5-B 暂缓 |
| overlay 仍引用 `../../ida` | Runtime 编译失败 | 采用上游 disassembler overlay；删除本地 IDA 服务 |
| 接缝 15 条路径失效 | regen 报错/漏捕获 | 按附录 C 映射并更新 `omp-seam.mjs` |
| i18n 35 键 × 4 语言 | 语言不一致 | 先合 en/zh 再加 4 语，跑 `i18n.test.ts` |
| 身份回潮（`ompHarness*`、`OMP_*`、`.omp`） | 名字被破坏、用户数据分裂 | 投影 + 身份审计命令 + `architecture.test.mjs` |
| 安装器迁移参数不一致 | 旧 Runtime 迁移失效 | `InstallerHost.cs` 与 `main.ts` 必须同为 `--juling-migrate-runtime` |
| 新增桌面依赖/证书 | 打包启动 `ERR_MODULE_NOT_FOUND`（0.2.5 的教训） | 跑 `audit-mobile-certificate.mjs` 与安装包冒烟 |
| 预览模式遗漏新页面 | 预览开/关行为不一致 | 每个新页补 fixture 与诚实空态；`check:renderer` |
| Linux AppRun 入口名错误 | AppImage 无法启动 | 修正为 `juling-harness` 并做 AppImage 冒烟 |
