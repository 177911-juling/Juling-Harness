# OMP Studio 0.2.4 升级分析与执行方案

> 状态：**分析完成，等待确认后执行**。本文只描述改动与步骤，尚未修改任何源码。
> 分析日期：2026-11-19。上游输入：`G:\源码\omp-studio-0.2.4`（无 `.git`，按文件对比）；
> 基线：本仓库 `90249eae`（`upstream: projected omp-studio v0.2.2 (studio->harness, lf)`）。

## 0. 结论

1. **可以直接升级，不需要动 Runtime pin。** 上游 0.2.2 与 0.2.4 的 `omp-patch/upstream.json` 都是
   `can1357/oh-my-pi` @ `7c49c11aa5bbaf3f418406583096168ad5b8c6dc`（OMP 18.20.2）。0.2.3/0.2.4 只推进了
   patchset：`studio.5` → `studio.14`。本仓库已提交为 `harness.11`，工作区（未提交）已到 `harness.16`；
   升级后由 `omp:patches:regen` 自动递增。
2. **线协议没有破坏性变更。** `HARNESS_PROTOCOL_VERSION` 仍为 `1`；新增 1 个查询
   `agent.messages.list`、1 个命令 `workspace.forgetUnavailable`、读模型字段
   `WorkspaceRecord.unavailable`，其余是语义修复与性能改动。
3. **上游规模**：投影后 ≈ 573 个文件、+27,348/−10,085；新增 63 个文件、删除 9 个（多为官网静态资产）。
   主要增量在 `apps/renderer`（302 个文件）与 `apps/desktop`（58 个文件）。
4. **本地改动规模**：相对 0.2.2 基线，已提交 444 个文件（+9,181/−4,748），未提交 66 个文件
   （+1,039/−707）另有 5 个未跟踪项（`i18n/locales/{hi,ja,ko,ru}.ts`、`0006-stats-dashboard.patch`）。
   与上游变更重叠的冲突面为 **128 个文件**（已提交 121 + 未提交 26，去重后 128）。
5. **风险评估**：中高，但可控。最危险的是 Runtime 接缝补丁再生（`0002/0004` 双向重写 + 本地
   `0005/0006`）、六语 i18n 键合并、更新链路（Linux deb 更新 × 本地自建更新通道）。

## 1. 版本与事实核对

| 项 | 当前仓库 | 上游 0.2.4 | 结论 |
|---|---|---|---|
| 产品名 | `juling-harness` / Juling Harness | `omp-studio` / OMP Studio | 继续用本地投影规则 |
| 版本 | `0.2.2` | `0.2.4` | 统一升到 `0.2.4`（见 §6 决策） |
| Runtime pin | `7c49c11…`（18.20.2） | 同左 | 不换子模块 |
| patchset | `harness.11`（已提交）/ `harness.16`（工作区，6 个补丁） | `studio.14`（4 个补丁） | 合并上游 4 个补丁内容后 regen，版本号自动递增 |
| 线协议 | `harness.1` 帧、`HARNESS_PROTOCOL_VERSION=1` | 未变 | 兼容 |
| Linux 桌面更新 | `UPDATE_PLATFORMS` **已移除** `linux-x64`（仅手动下载） | 0.2.3 起支持 AppImage/deb 应用内更新 | 需要决策（§6.1） |

已核对的具体位置：

- `packages/harness-protocol/src/contracts/protocol.ts`：`HARNESS_PROTOCOL_VERSION = 1`，两侧一致。
- `packages/harness-protocol/src/contracts/runtime-views.ts`（投影后 0.2.4）：新增
  `HarnessAgentMessage` / `HarnessAgentMessages` 与 `agent.messages.list`。
- `packages/client-contract/src/operations.ts`（投影后 0.2.4）：新增 `workspace.forgetUnavailable`。
- `omp-patch/overlay/.../harness/bridge-server.ts`：投影后 0.2.4 为 `PATCHSET_VERSION = "harness.14"`，
  本仓库工作区为 `harness.16`（已提交 `harness.11`）；`series.json` 与常量由 `scripts/architecture.test.mjs` 锁死一致性。

## 2. 上游新增功能（0.2.3 / 0.2.4）

### 2.1 0.2.3 新增

| 功能 | 用户可见行为 | 关键实现 |
|---|---|---|
| Linux 应用内差分更新 | AppImage 可后台准备更新、重启替换、启动失败回滚；deb 通过 polkit 授权后由 `apt` 安装，失败回滚上一版 | 新增 `apps/desktop/src/linux-appimage-installer.ts`、`linux-deb-installer.ts`、`linux-deb-swap.ts`、`packaging/linux/omp-deb-update`、`scripts/linux-deb-update-integration.py` |
| Agent Hub「指挥台」名册视图 | 进入 Agent Hub 默认指挥台（编队 / 时间线 / 星图 / 通讯），右侧详情联动同一选中项；可切回平铺 / 按父代理 | 新增 `apps/renderer/src/agents/deck/swarmScope.ts`、`AgentHub.tsx` 视图组重排 |
| Agent 间真实消息 | Hub「消息」标签、指挥台「通讯」、星图连线读同一份已送达记录；广播合并为一条；停驻/已结束/重启后历史可读 | 新增 overlay `services/agent-messages-service.ts`（读 `irc:incoming` 与 `parentIrc` steer，最多 500 条、16 KiB 截断）、`packages/harness-protocol` 新查询、`apps/renderer/src/agents/deck/comms.ts` 4s 轮询 |
| 统一像素头像 | 指挥台、Agent Hub、选择性提交、对话、命令面板同一张脸；主代理带皇冠、运行中睁眼、停驻闭眼 | 新增 `apps/renderer/src/agents/AgentAvatar.tsx`、`agents/deck/sigil.css`（色相派生自 agentId） |
| Agent 档案重做 | 头部：父代理入口、头像、状态、时长、模型（回退模型琥珀色）、按状态出现的操作；下划线标签 + 数量角标；概览分区、BTW 铺满面板 | 新增 `apps/renderer/src/agents/hub/HubDossier.tsx`，`AgentHub.tsx` 大幅改写 |
| 拉取模型筛选 | 从供应商接口拉取后按名称/ID 搜索，「全部 / 新增 / 待匹配 / 已选」筛选、批量勾选、多目录匹配切换补全推荐参数 | 新增 `apps/renderer/src/models/config/FetchedModelsPanel.tsx`、`models/fetchedModels.ts` |
| 官网实时演示 | `website-embed.html`（不进桌面安装包）通过 postMessage 嵌入真实界面；Storage 沙箱避免写入真实偏好 | 新增 `apps/renderer/src/website-embed-entry.tsx`、`src/embed/websiteEmbed.ts`、`website/src/**`、`website/tools/build-live.mjs` |
| 工作区失效恢复 | 启动识别失效工作区回退有效项目；诊断页可重选目录、新建对话、清除失效记录（保留文件与历史、先留副本） | 新增 `apps/renderer/src/diagnostics/WorkspaceRecoveryPane.tsx`；`packages/harness-host/src/workspace-registry.ts` 的 `#unavailable` / `refreshAvailability` / `forgetUnavailable` |
| 空白新对话收敛 | 未发首条消息保持欢迎页，右侧工具栏默认收起 | `conversation/welcomeGate.ts`、`dock/DockRegions.tsx` 的 `railHiddenByDefault` |

### 2.2 0.2.4 变更

| 改动 | 技术要点 |
|---|---|
| 会话切换更快 | `conversation/conversationSwitchPhase.ts` 增加 warm 路径（1 帧 settle，热缓存直切）；`conversationWorkspace/projectReads.ts` 首屏缓存 4→12 页 / 8→16 MiB / TTL 60→300s；空闲预热预算 2→5，调用 `session.transcript.prefetch`；切回保留草稿、滚动、展开状态 |
| 流式渲染降载 | 新增 `highlight/`（Worker 队列 + IntersectionObserver 可见性 + 128 项缓存）接入 `conversation/ToolBody.tsx`；`ConvoTranscript` 绑定签名缓存；`state-projector` 16 ms 合并；`useSessionTitles` 32/批、5 s TTL；`shellModelLoader` 同 tick 合并 |
| 生产预览构建缓存 | `scripts/production-preview-cache.mjs` / `production-preview-runtime.mjs`：源码与依赖指纹、产物字节校验、成功快照；Runtime 仍校验签名与源身份；`OMP_PRODUCTION_PREVIEW_STATE` 隔离 runtimes/updates 目录 |
| 更新流程加固 | 自研差分下载器（Range 必须 206 + `content-range` 精确匹配）、差分临时文件验签后原子改名、`.meta` checkpoint 降频、`reconcileDesktopPending`、deb 恢复包与 `requiresSystemAuthorization` |
| Runtime patchset | `studio.14`：Agent 间消息服务、host-mode 复活重绑、state projector 合并、会话标题原地写 256 B、transcript 回合边界分页、BTW 注入上限 64 等 |

### 2.3 上游修复（按发布说明 + diff 实证）

| 修复 | 位置 |
|---|---|
| 自定义模型凭据被改写（数字、引号、特殊字符、`1e4`）[#42/#43] | `packages/host-client-api/src/models-yml.ts` 改用 `yaml` 库；`omp-models-adapter.ts` 全量 `escapeRegExp` |
| 用户消息 Markdown 链接在深色主题不可见 | `apps/renderer/src/styles/workbench.css`（`.ev-user .ev-body a` 常显下划线） |
| 配置审批「允许一次/本会话」批准后超时 [#32/#33] | `apps/desktop/src/interaction-host.ts` 按 value 预签确认 token |
| 工作区模型一直「未验证」/对话模型目录为空或串会话 [#33/#38/#40] | `facade.ts` 的 `#ensureModelRuntime`；`conversationWorkspace/projectReads.ts` 从会话 Runtime 读 `models.get` |
| 首次改配置已生效却一直等待 [#36/#37] | `packages/client/src/harness-client.ts` 首命令前 `bootstrap()`，initial 阶段事件不入 reducer |
| 失效工作区阻断启动 [#31/#39] | `workspace-registry.ts` 回退 + `.recovery-*.json` 副本；诊断页恢复面板 |
| 会话标题重复 emoji/短码 [#34/#35] | `session-catalog.ts` 的 `buildParsedHeader` 统一标题解析；`session-titles-service` 缓存命中要求标题存在 |
| 归档失败回滚可能丢失会话 | `session-archive-service.ts` 回滚改为 `#gzipMove(dest→source)` |
| 空闲会话无法回收 / 更新启动被误判失败 | `idle-maintenance-service`、`update-coordinator.ts` 的 `reconcileDesktopPending` |
| 二级页审批、提问、表单不可见 | `apps/renderer/src/deck/secondaryInteractions.css`（fixed → static） |
| 多窗口重复快捷键 | `AgentHub.tsx` 键盘守卫（`[hidden]`/`inert`/`document.hidden`）、`FileCloseDialog` portal |
| 切语言丢失草稿/连接 | `App.tsx` modelScope 带 `resolvedLanguage`，各缓存键加 locale 后缀；`zhRef` 化 |
| 预览数据写入真实偏好 | `website-embed-entry.tsx` 内存 Storage 沙箱；预览 notice 受 `marks` 控制 |
| 关闭未保存文件对话框卡住 | `files/FileCloseDialog.tsx`：60 s 超时、Esc、失败重排 |
| 中文输入补全斜杠命令清掉已附加图片 | `composer/ChipComposer.tsx` 拆分 `replaceSlashCommand` / `clearCommandDraft` |
| 评测图片导入目录逃逸 | `apps/desktop/src/evaluation-workspace.ts`（`isInside` + realpath + 非符号链接） |
| Git/GitHub 过期响应覆盖当前目标 | `git/GitHubPanel.tsx`、`GitPatch.tsx` 携带目标状态 |
| 会话历史分页在回合中段截断 | `session-archive-reader.ts` / `session-transcript-service.ts` 的 `selectTranscriptPageStart` |
| Time Travel 删除会话残留快照 | `time-travel-store.ts` 新增 `removeSession` + blob sweep |

## 3. 本地自定义现状（必须保留）

| 类别 | 内容 | 代表文件 |
|---|---|---|
| 产品身份 | 全库 `omp-studio → juling-harness`、`Studio → Harness`、文案 OMP → Juling、图标/favicon/安装向导 | `scripts/architecture.test.mjs` 的 wire identifiers、`packaging/**`、`apps/*/resources/**` |
| 预览模式 | `usePreviewMode()` / `marks` / fixtures / surfaces 全套演示数据，预览开时才用 fixture | `apps/renderer/src/preview/**`（12+ 文件） |
| 六语界面（未提交） | `zh/en/ru/ja/ko/hi`、`Locale = Exclude<AppLanguage,"system">`、回退链英文→中文、标题按语言 | `i18n/I18nContext.tsx`、`i18n/types.ts`、`locales/{hi,ja,ko,ru}.ts` |
| 统计页 | iframe 嵌入本机 `juling stats` 面板 + 预览演示 + 失败兜底；依赖 runtime 侧 `stats.dashboard` 与 `0006-stats-dashboard.patch` | `StatisticsPage.tsx`、overlay `stats-worker.ts`、`patches/0006-*.patch` |
| 导航 / 首页 / 壳 | rail 胶囊、二级页去页头、`useIdentityFlight` 头像飞行动画、`shellState`/`AppTopbar`、启动通知 | `NavRail.tsx`、`SecondaryPage.tsx`、`workbench/AppShell.tsx`、`workbench/AppTopbar.tsx` |
| 主题 | Quiet Precision tokens、四档光效背景、六套样式表本地化 | `styles/{tokens,base,light,pages,sidebar,components,workbench}.css`、`background/**` |
| 更新通道 | 自建更新源、发布标识、`publish-update-release`、`build-update-assets-v2`、双签名域 `juling-harness-update-v2` + `omp-studio-update-v2` | `packages/runtime-installer/src/update-manifest.ts`、`scripts/*update*` |
| 远程 | remote 认证/vault/provisioning、远端 IPC 回收 | `apps/desktop/src/remote/**` |
| Runtime 身份补丁 | `0005-juling-identity.patch`（app 名、`~/.juling`、UA、CLI 文案） | `omp-patch/patches/0005-*.patch` |
| 构建/预览脚本 | `启动预览版.cmd` 采集会话切换、`preview.mjs` 本地模式、`omp-seam.mjs` 分组扩展 | `scripts/preview.mjs`、`scripts/omp-seam.mjs`、`采集会话切换.cmd` |

## 4. 冲突面

### 4.1 统计

| 分类 | 数量 | 说明 |
|---|---|---|
| A 纯改名 / 文档 | 5 | `AGENTS.md`、`CHANGELOG.md`、`README*.md`、`docs/workbench-docking.md`：取上游 + 重跑投影改名 |
| B 双方功能叠加 | 107 | 需逐域手工合并 |
| C 一方删除 / 替换 | 1+ | `website/shared/media/icon-512.webp`，以及 `website/{a,b,c}`、`website/shots/*.webp`（本地改过、上游删除） |
| D 测试 | 15 | 按新实现重写断言，不保留旧文案 |
| 合计（去重） | **128** | 已提交 121 + 未提交 26，交集 19 |

### 4.2 高风险（必须人工决策）

1. **Runtime 接缝补丁**
   `omp-patch/patches/{0002,0004,series.json}`、`overlay/{bridge-server,harness-host-mode,btw-service}.ts`。
   上游把 `0002` 的 `agent-session`/`session-manager` 大段改写（预留消息 ID、`onPromptStarted`、
   `resolveSessionLeafId`），`0004` 新增 `bazel/toolchains/darwin/sdk.bzl` 并调整 ax.rs 等 hunk。
   本地另有 `0005/0006` 与未提交的 `benchmarks`/`bridge-server` 改动。**禁止手改 `.patch`**，
   以 vendor 树为准重生成。
2. **i18n**
   `locales/en.ts`、`zh.ts` 各 +32/−3 行（约 28–30 个新键：`workspaceRecovery` 13、`agentDeck.comms` 3、
   `modelConfig.fetchFilter*` 10、`appUpdate` 2）。上游 `en` 类型派生自 `zh`，本地四个新语言包必须补键。
   组件内联 `t("中","En")` 改了 40+ 文件（`zhRef` 化），冲突在文本层，语义简单但量大。
3. **更新链路**
   `packages/runtime-installer/src/{update-manifest,runtime-platform}.ts`、`apps/desktop/src/{main,update-coordinator,update-discovery}.ts`、
   `scripts/{build-update-assets-v2,publish-update-release}.mjs`、`apps/desktop/test/update-v2.test.ts`。
   上游新增 `appFormat:"deb"`、`requiresSystemAuthorization`、deb catalog 互证、Linux 双安装器；
   本地有双签名域、`juling` entrypoints、删掉 `linux-x64` 更新平台。合并错一处就会破坏已发布用户的自动更新。
4. **协议宿主层**
   `packages/harness-host/src/session-catalog.ts`（上游整体重写 `readSessionHeader`，本地嵌入
   `studioOrigin` 兼容）、`packages/transport-web/src/server.ts`（上游 `pruneSessions` × 本地
   `closeSession`）、`packages/host-client-api/src/omp-models-adapter.ts`（上游 `terminate`/`escapeRegExp`
   × 本地 `juling` 文案）、`models-yml.ts`（整体换 yaml 库，本地未改，直接接受）。
5. **渲染层壳**
   `App.tsx`、`workbench/AppShell.tsx`、`NavRail.tsx`、`HomePage.tsx`、`StatisticsPage.tsx`、
   `styles/{components,workbench}.css`、`preview/{fixtures,surfaces}.tsx`。上游的 locale scope、
   `railPresented`、dossier 样式、预览 fixture 新字段与本地六语/壳/预览面叠加。
6. **投影脚本已知缺陷（重要）**
   上次升级用的临时投影脚本（`%TEMP%\omp-up\project.mjs`，可能已被系统清理）只处理固定扩展名。0.2.4 新增的
   `packaging/linux/omp-deb-update`（无扩展名）与 `scripts/linux-deb-update-integration.py`（`.py` 不在表里）
   会保留上游身份：`REPO = "the-snowpear/omp-studio"`、`Package: omp-studio`、
   签名域 `omp-studio-update-v2`。而 `publish-update-release.mjs` 已投影为
   `juling-harness-update-v2` —— **不修就会导致 deb 更新全链路验签失败**。
   同类历史遗留：`packaging/linux/AppRun`、`packaging/nsis/custom.nsh`、`packaging/installer-host/InstallerHost.cs`、
   `NOTICE`（这些在 0.2.2 投影时也漏了，靠本地提交手工修过）。
   升级时先把投影脚本补上 `.py`、`.cs`、`.nsh` 与“无扩展名文本文件”，再投影。

## 5. 执行步骤（确认后执行）

### Phase 0：清理工作区（当天第一步）

当前 66 个修改 + 5 个未跟踪项是正在进行的六语 / 统计 / 壳工作，**先提交再合并**：

```bash
git status --short
# 建议按域拆 4 个提交，避免一个巨型提交：
#   1) i18n：I18nContext/types/i18n.test/locales/*（含 hi/ja/ko/ru）
#   2) 壳与导航：NavRail/SecondaryPage/HomePage/AppShell/AppTopbar/shellState/useIdentityFlight/styles
#   3) 统计与 Runtime：StatisticsPage/doc/stats-analysis/benchmarks-*/bridge-server/0006 补丁/series.json
#   4) 图标与素材：resources/public/website/packaging ui/启动预览相关
```

验收：`git status --short` 为空；`npm run check -- --fast` 绿。

### Phase 1：生成并落库 0.2.4 投影

1. 复制并扩展投影脚本（不提交）：在 `project.mjs` 的 `TEXT_EXT` 增加 `.py`、`.cs`、`.nsh`，
   并把无扩展名文件按“非二进制”处理（`Buffer.includes(0)` 检测足够），这样
   `packaging/linux/omp-deb-update` 与 `packaging/linux/AppRun` 会被改名；
   `.bin` 测试夹具继续按二进制跳过。
2. 生成投影树到仓库外，例如 `G:\源码\omp-upgrade-scratch\proj24b`，逐项核对：
   - `grep -rIl "studio" proj24b` 只应剩下 `.bin` 测试夹具；
   - `packaging/linux/omp-deb-update` 内 `REPO/Package/签名域` 已成本地身份；
   - 与旧投影 `proj24` 的差异只应出现在本次修补的文件。
3. 建上游分支并落库（保留 vendor 子模块，不复制 `node_modules`/`dist`/`outputs`）：

```bash
git switch -c upstream/omp-studio-0.2.4 90249eae
# 用 robocopy /MIR 或 rsync 把 proj24b 覆盖到工作区，排除 .git、node_modules、dist、outputs、omp-patch/vendor
# 再按 up-removed.txt 删除上游已移除的 website/{a,b,c}、shots/*.webp、icon-512.webp（若选择跟随上游，见 §6.3）
git add -A
git commit -m "upstream: projected omp-studio v0.2.4 (studio->harness, lf)"
```

4. 合并回主分支：

```bash
git switch main            # 或当前工作分支
git merge --no-ff upstream/omp-studio-0.2.4
```

### Phase 2：按域解冲突（建议顺序）

1. `packages/*`（先协议、后宿主）：`harness-protocol` → `client-contract` → `client` →
   `host-client-api` → `harness-host` → `runtime-installer` → `transport-*` → `testkit`。
   - `session-catalog.ts`：以新的 `buildParsedHeader` 为骨架，把本地 `studioOrigin`/`studio-host`
     回退嵌进解析结果。
   - `transport-web/server.ts`：以本地 `closeSession()` 为唯一清理路径，补上上游 `pruneSessions`
     的惰性清理入口（两者合一，不并行两套）。
   - `update-manifest.ts` / `runtime-platform.ts`：保留本地双签名域与 `juling` entrypoints，
     叠加 `appFormat:"deb"`、`requiresSystemAuthorization`；`UPDATE_PLATFORMS` 是否加回
     `linux-x64` 见 §6.1。
2. `omp-patch`：见 Phase 3。
3. `apps/desktop` + `scripts`：更新链路、`main.ts` 启动形态（macOS bundle / AppImage / deb）、
   `preview.mjs`（上游重写缓存与 Runtime 准备，本地采集会话切换逻辑需迁到新结构）、
   `omp-seam.mjs`（只加 `bazel/toolchains/darwin/sdk.bzl` 一行到 0004 组）。
4. `apps/renderer` 功能页：`AgentHub` 取上游 dossier + 本地 i18n；`StatisticsPage` 保留本地
   iframe/预览兜底 + 上游 epoch 防过期；`preview/*` 以本地扩展面为底、吸收上游新 fixture 字段；
   `NavRail/AppShell/App` 保留本地壳，吸收上游 `railPresented`、locale scope、键盘守卫。
5. `i18n`：先合 `en/zh`，再补 `hi/ja/ko/ru` 的新键（见 Phase 4）。
6. `styles/*.css`：以本地主题为准，吸收上游新增 selector（用户气泡链接、`agent-hub.css` dossier、
   `sigil.css` 纯新增）。
7. 文档/站点：`doc/feature-index.md` 补新模块；`README/AGENTS/CHANGELOG` 按本地措辞合并。

### Phase 3：Runtime overlay 与接缝补丁

原则：`overlay/` 是普通源码，`patches/*.patch` 只能由 `omp:patches:regen` 生成。

1. **overlay 三方合并**（上游改动 15 个源码文件 + 4 个测试，另新增 `services/agent-messages-service.ts` 与其测试）：
   对每个文件用 `git merge-file -p <本地> <0.2.2 投影> <0.2.4 投影>`，
   冲突集中在 `PATCHSET_VERSION`、`harness-host-mode`、`state-projector`、`btw-service`、
   `session-control/transcript/titles`、`owned-sessions`、`runtime-views-protocol`。
   新增 `services/agent-messages-service.ts` 与 `test/harness-agent-messages.test.ts` 直接纳入；
   `runtime-view-service.ts` 接 `agent.messages.list`。
2. **接缝补丁**：
   - 0001/0003：上游无变化，保留本地版本。
   - 0002/0004：先取上游 0.2.4 版本（含新 hunk），再按
     `git diff 90249ea HEAD -- omp-patch/patches/0002-harness-session-runtime.patch`（约 15 行）
     与 `0004`（+43/−21）把本地改动重放进 vendor。
   - 0005/0006：保持原文件，预期因 0002 上下文变化需要 `git apply -3` 或人工落 vendor。
3. **重生成与校验**：

```bash
# vendor 复位到 pin（保留子模块 .git；按需先确认没有要保留的本地 vendor 改动）
git -C omp-patch/vendor/oh-my-pi reset --hard 7c49c11aa5bbaf3f418406583096168ad5b8c6dc
git -C omp-patch/vendor/oh-my-pi clean -fd
npm run omp:overlay:apply      # 幂等；0002/0004 reject 时在 vendor 内修，不在 .patch 里改
npm run omp:patches:regen      # 回捕 overlay、重写 0001–0006、更新 series.json/digest/版本
npm run omp:verify:patches
npm run runtime:verify-source
```

预期：`series.json` 从 `harness.16` 递增到 `harness.17`（或更高，由 digest 决定），
`PATCHSET_VERSION` 同步写入 overlay 与 vendor 两处；`scripts/architecture.test.mjs` 通过。

### Phase 4：i18n 六语补齐

1. `en/zh` 冲突按 git 三方结果逐 hunk 合；确保 `zh` 键集是 `en` 的超集/相等（现有 `i18n.test.ts` 断言）。
2. 把新增键翻译进 `hi/ja/ko/ru`：`workspaceRecovery.*`、`agentDeck.comms.{loading,emptyAgent,older}`、
   `modelConfig.fetchFilter*`、`appUpdate.{systemAuthorization,waitingAuthorization}`。
3. 新增一致性断言（建议）：六份字典键集完全一致、`en` 不含 CJK（保留既有白名单）。
4. 组件内联文案：上游 40+ 文件改为 `zhRef`/locale 缓存键，合并时以本地 `t("中","En")` 结构为准，
   逐文件核对语言切换后不串缓存（`shellModelLoader` 缓存键含 locale）。

### Phase 5：版本、文案与文档

1. 版本：根 `package.json` 与 14 个 workspace `package.json` 从 `0.2.2` → `0.2.4`，
   `package-lock.json` 对应 52 行改版本（上游无依赖变更）；`npm install --package-lock-only` 复核。
2. 运行时版本展示：`18.20.2-harness.<新 patchset>`，更新 `omp-patch/README.md` 与
   `docs/migrations/omp-18.20.2.md` 的 patchset 描述。
3. `CHANGELOG.md`：新增 `[0.2.4]` 段，摘取 0.2.3/0.2.4 的用户可见功能与修复，按本地措辞；
   保留 `[Unreleased]` 的本地六语/统计/壳条目。
4. `doc/feature-index.md`：补 `agents/AgentAvatar`、`agents/hub/HubDossier`、`agents/deck/{swarmScope,comms}`、
   `diagnostics/WorkspaceRecoveryPane`、`highlight/*`、`models/config/FetchedModelsPanel`、`embed/*`、
   新增命令/查询（`agent.messages.list`、`workspace.forgetUnavailable`）。
5. 可选吸收：`docs/linux.md` 应用内更新章节、`docs/development.md` 生产预览缓存、
   `docs/releasing.md` 单平台流水线；`docs/releases/v0.2.3|v0.2.4.md` 仅作发布文案参考。

### Phase 6：验证

按改动范围跑切片，最后再做一次完整验收：

```bash
npm run check -- --fast                     # arch / selects / motion / types
npm run check -- --only harness-protocol    # 协议包
npm run check -- --only harness-host        # 宿主包
npm run check -- --only renderer            # 渲染层核心测试
npm run check -- --all                      # 全包测试（合并收尾时跑一次）
npm run build                               # 生产构建
npm run test:tooling                        # 打包/签名/更新脚本改动必须跑
```

手工验收（`启动预览版.cmd` + 真实 Host 各一次）：

- Agent Hub：默认指挥台、编队/时间线/星图/通讯、消息标签（有 Runtime 时显示真实消息，无则提示读不到）、
  详情操作按钮随状态变化、切换标签过渡、列表滚动时详情列固定。
- 选择性提交：参与 Agent 头像与改动归属。
- 模型配置：拉取模型搜索/筛选/批量勾选/目录匹配；自定义提供商保存后重开模型列表仍在（#42）。
- 工作区恢复：删除项目目录后启动回退；诊断页重选/新建对话/清除记录。
- 会话：切换保留草稿/滚动/展开；流式输出流畅；折叠/展开、语法高亮可见性；标题不重复 emoji。
- Composer：中文输入法补全斜杠命令不清图片；粘贴图片顺序；富文本 SVG/嵌套表格。
- 审批/表单：二级页可见可操作；多窗口只有当前窗口响应快捷键。
- 语言：六语切换不丢草稿/连接；窗口标题、`html lang`、缓存刷新正确。
- 统计页：中英文切换、iframe 面板加载、失败兜底。
- 更新：设置 → 更新与维护 检查更新、验签失败提示、Windows 安装/更新流程；
  若接入 Linux（§6.1），在 Ubuntu 24.04 验证 deb polkit 授权与回滚、AppImage 替换与回滚。
- Runtime：`npm run omp:verify:patches`、`runtime:verify-source`、`omp:build:host` 至少 `--help` 级冒烟；
  统计/agent messages 等新查询端到端可用。

## 6. 需要你确认的决策

### 6.1 Linux 桌面应用内更新

- **A. 接入（推荐）**：把 `linux-x64` 加回 `UPDATE_PLATFORMS`，采用上游 AppImage/deb 安装器、
  `packaging/linux/omp-deb-update`（改为本地 repo / `Package: juling-harness` / 签名域
  `juling-harness-update-v2`）、`updates-linux-deb-x64.json` catalog、CI 隔离测试。
  代价：更多合并面与 Linux 手工验收；收益：与上游一致，Linux 用户可应用内升级。
- **B. 暂不接入**：保留本地「Linux 仅手动下载安装包」策略，删除/不落 `linux-*.ts` 与 deb helper，
  `UPDATE_PLATFORMS` 继续保持 Windows/macOS。代价：后续再补时冲突面更大。

### 6.2 版本号

- **A. 直接 `0.2.4`（推荐）**：与上游对齐，便于比较与发布；现有更新源按版本比较可正常升级。
- **B. `0.2.4-juling.1`**：需要改 `publish/release` 的 SemVer 处理，且预发布后缀排序低于 `0.2.4`，
  不推荐。

### 6.3 官网与静态资产

- **A. 跟随上游**：删除 `website/{a,b,c}`、旧截图、`icon-512.webp`，接入 `website/src` 新站与
  `website-embed.html` 实时演示（不进安装包）。本地站点若要保留，需要把旧内容移植进新结构。
- **B. 保留本地站点**：不落上游 website 改动，仅吸收 `embed/` 渲染层代码（需要 `website-embed.html`）。
  代价：上游删除的文件在每次升级都会再冲突。

### 6.4 文档

- 是否吸收 `docs/readme/*-en-*.svg`、`docs/releases/v0.2.3|v0.2.4.md`、`docs/release-review.md`
  （上游发布叙事），还是只保留与代码相关的手册（`linux.md`/`development.md`/`releasing.md`）。

## 7. 验收定义（DoD）

- 工作区干净；`npm run check -- --all`、`npm run build`、`npm run test:tooling` 全绿。
- `npm run omp:verify:patches` 与 `npm run runtime:verify-source` 通过；`series.json`、
  `PATCHSET_VERSION`、`architecture.test.mjs` 三处一致。
- 六语字典键集一致；语言切换手测通过。
- 预览模式：真实数据与演示数据互斥；预览开不写偏好；预览关不留演示目录/假数据。
- 更新链路：Windows/macOS 检查更新与验签手测；若接入 Linux，deb/AppImage 授权、替换、回滚手测。
- 统计页、Agent 间消息、工作区恢复三处新能力端到端可用（真实 Runtime）。
- 保留本地纯品牌/UI 决策：Quiet Precision 主题、nav rail、六语、预览演示、Juling 身份与更新通道。

## 附录 A：冲突文件清单（128）

### A.1 已提交且与上游重叠（121）

```
AGENTS.md
CHANGELOG.md
README.en.md
README.md
apps/desktop/src/host-factory.ts
apps/desktop/src/main.ts
apps/desktop/src/remote/ipc.ts
apps/desktop/src/remote/local-vault.ts
apps/desktop/src/runtime-session.ts
apps/desktop/src/update-coordinator.ts
apps/desktop/test/preload.test.ts
apps/desktop/test/update-v2.test.ts
apps/renderer/package.json
apps/renderer/src/AgentHub.tsx
apps/renderer/src/App.contextStrip.test.tsx
apps/renderer/src/App.tsx
apps/renderer/src/AppUpdateDialog.tsx
apps/renderer/src/CapabilitiesPage.tsx
apps/renderer/src/DiagnosticsPage.test.tsx
apps/renderer/src/DiagnosticsPage.tsx
apps/renderer/src/HomePage.tsx
apps/renderer/src/ModelConfigPage.tsx
apps/renderer/src/ProcessMemoryPanel.tsx
apps/renderer/src/SidebarFooter.tsx
apps/renderer/src/SkillsDrawer.tsx
apps/renderer/src/StatisticsPage.tsx
apps/renderer/src/SubagentsPanel.tsx
apps/renderer/src/TerminalPane.test.tsx
apps/renderer/src/TerminalPane.tsx
apps/renderer/src/background/AppBackgroundLayer.tsx
apps/renderer/src/browser/BrowserDockInstances.tsx
apps/renderer/src/browser/BrowserPane.tsx
apps/renderer/src/browser/browserSessions.ts
apps/renderer/src/capabilities/McpRuntimePane.tsx
apps/renderer/src/capabilities/PromptTemplatesPane.tsx
apps/renderer/src/commandPaletteCatalog.ts
apps/renderer/src/commit/SelectiveCommitPane.tsx
apps/renderer/src/composer/ChipComposer.tsx
apps/renderer/src/composer/DictationControl.tsx
apps/renderer/src/composer/useDictation.ts
apps/renderer/src/composer/useWordPrediction.test.tsx
apps/renderer/src/composer/useWordPrediction.ts
apps/renderer/src/conversation/ConversationItemView.tsx
apps/renderer/src/conversation/ToolBody.test.tsx
apps/renderer/src/conversation/ToolBody.tsx
apps/renderer/src/conversation/conversationStore.test.ts
apps/renderer/src/conversation/conversationViews.ts
apps/renderer/src/conversationWorkspace/Workspace.tsx
apps/renderer/src/conversationWorkspace/residency.test.tsx
apps/renderer/src/conversationWorkspace/workspace.test.tsx
apps/renderer/src/dock/DockLauncher.tsx
apps/renderer/src/dock/DockRegions.tsx
apps/renderer/src/evaluation/EvaluationConfig.tsx
apps/renderer/src/evaluation/EvaluationWorkspace.tsx
apps/renderer/src/fileBrowser/FileBrowserDock.tsx
apps/renderer/src/fileBrowser/fileBrowserSource.ts
apps/renderer/src/files/FileCloseDialog.tsx
apps/renderer/src/files/FilePane.test.tsx
apps/renderer/src/files/FilePane.tsx
apps/renderer/src/files/fileLinks.tsx
apps/renderer/src/git/GitQuickCard.tsx
apps/renderer/src/git/GitWorkbench.tsx
apps/renderer/src/history/useSessionTitles.test.tsx
apps/renderer/src/i18n/locales/en.ts
apps/renderer/src/i18n/locales/zh.ts
apps/renderer/src/media/ArtifactLibraryPane.tsx
apps/renderer/src/media/LiveAudioPane.tsx
apps/renderer/src/media/MediaWorkbench.tsx
apps/renderer/src/models/WebSearchPanel.tsx
apps/renderer/src/preview/conversationFixtures.ts
apps/renderer/src/preview/fixtures.ts
apps/renderer/src/preview/surfaces.tsx
apps/renderer/src/recordings/TerminalRecordingControls.tsx
apps/renderer/src/services/ServicesPane.tsx
apps/renderer/src/settings/DesktopUpdateRecovery.tsx
apps/renderer/src/settings/appUpdate.ts
apps/renderer/src/settings/catalog.ts
apps/renderer/src/settings/operatorProfile.ts
apps/renderer/src/settings/tabs.tsx
apps/renderer/src/sidebar/AppSidebar.tsx
apps/renderer/src/styles/agent-hub.css
apps/renderer/src/styles/components.css
apps/renderer/src/styles/models-roles.css
apps/renderer/src/styles/workbench.css
apps/renderer/src/terminalSessions.tsx
apps/renderer/src/vite-env.d.ts
apps/renderer/src/workbench/AppShell.tsx
apps/renderer/src/workbench/WorkbenchCanvas.tsx
apps/renderer/src/workspaces/ExecutionTargets.tsx
doc/feature-index.md
docs/workbench-docking.md
omp-patch/overlay/packages/coding-agent/src/harness/bridge-server.ts
omp-patch/overlay/packages/coding-agent/src/harness/harness-host-mode.ts
omp-patch/overlay/packages/coding-agent/src/harness/services/btw-service.ts
omp-patch/patches/0002-harness-session-runtime.patch
omp-patch/patches/0004-harness-extensibility.patch
omp-patch/patches/series.json
package-lock.json
package.json
packages/harness-host/src/bridge-client.ts
packages/harness-host/src/session-archive-reader.ts
packages/harness-host/src/session-archive-service.ts
packages/harness-host/src/session-catalog.ts
packages/harness-host/src/time-travel-store.ts
packages/harness-host/test/session-catalog.test.ts
packages/harness-protocol/src/frame-codec.ts
packages/host-client-api/src/facade.ts
packages/host-client-api/src/omp-models-adapter.ts
packages/host-client-api/src/services.ts
packages/runtime-installer/src/runtime-platform.ts
packages/runtime-installer/src/update-manifest.ts
packages/testkit/src/fixtures.ts
packages/transport-web/src/server.ts
packages/transport-web/src/web-transport.ts
scripts/build-omp-host.mjs
scripts/build-update-assets-v2.mjs
scripts/build-update-assets-v2.test.mjs
scripts/omp-seam.mjs
scripts/preview.mjs
scripts/publish-update-release.mjs
scripts/runtime-artifact.mjs
```

### A.2 未提交且与上游重叠（26）

```
CHANGELOG.md
apps/desktop/src/main.ts
apps/desktop/src/titlebar-overlay.ts
apps/renderer/src/HomePage.tsx
apps/renderer/src/NavRail.test.tsx
apps/renderer/src/NavRail.tsx
apps/renderer/src/StatisticsPage.tsx
apps/renderer/src/background/background.css
apps/renderer/src/conversation/ConversationItemView.tsx
apps/renderer/src/fileBrowser/FileBrowserViews.tsx
apps/renderer/src/fileBrowser/fileBrowserSource.ts
apps/renderer/src/i18n/locales/en.ts
apps/renderer/src/i18n/locales/zh.ts
apps/renderer/src/settings/catalog.ts
apps/renderer/src/styles/components.css
apps/renderer/src/styles/light.css
apps/renderer/src/styles/workbench.css
apps/renderer/src/workbench/AppShell.tsx
doc/feature-index.md
omp-patch/overlay/packages/coding-agent/src/harness/bridge-server.ts
omp-patch/patches/0002-harness-session-runtime.patch
omp-patch/patches/0004-harness-extensibility.patch
omp-patch/patches/series.json
scripts/omp-seam.mjs
scripts/preview.mjs
website/shared/media/icon-512.webp
```

> 附录基于 `git diff 90249ea HEAD` 与 `git status` 的路径交集；实际合并时以 git 报出的冲突为准，
> 未报冲突但双方都改的文件（如 `frame-codec.ts` 的 encode/decode 不同区域）需要 `git diff` 复核。

## 执行记录（2026-11-19）

- 已按确认执行：Linux 应用内更新接入（`UPDATE_PLATFORMS` 加回 `linux-x64`）、版本统一 `0.2.4`、
  官网保留本地站点（未引入上游 `website/src` 与发布叙事文档）、只吸收手册类 docs。
- 合并提交：`77410a6`；并在其上完成补丁再生（`harness.18`）、六语补全（六份字典各 3276 键）、
  模型目录按 `7c49c11` 重新生成、平台表与更新测试对齐。
- 未提交的 vendor 工作区是 overlay + 接缝补丁的预期形态，`.gitmodules` 已标记 `ignore = dirty`。
- 验证：`npm run check -- --all`（含 305 个渲染测试文件与全部 Desktop/Host/协议测试）、
  `npm run build`、`npm run test:tooling`（Bun 1.4.4 + Python 3.12）均通过；
  `npm run omp:verify:patches` 从干净 vendor 全链通过，`runtime:verify-source` 通过。
- 签名 Runtime 已构建：`packages/runtime-installer/dist/artifacts/win32-x64/18.20.2-harness.18/`
  （`juling.exe`、manifest、checksums、signature；`--version` 报 `juling/18.20.2`，`--smoke-test` 通过）。
  构建注意：`BUN_EXE` 不能位于含中文的路径（仓库在 `G:\源码`，Bun 的 `--compile` 复制自身会 ENOENT）；
  本次使用 ASCII 路径下的 Bun 1.4.4 副本。
- 仍需人工 GUI 验收：Agent Hub 指挥台 / 消息、模型拉取筛选、工作区恢复、六语切换、统计面板、
  Windows/macOS/Linux 更新流程（见 §5 Phase 6 清单）。
