# OMP 18.19.0：Runtime 与 Harness 适配

本次从 **OMP 18.18.0-harness.2** 升级到 **OMP 18.19.0-harness.16**。上游固定为 **v18.19.0**、提交 `04cd1a7549a02d62ad1d24826198d52507595683`；四组 seam patch 均由 `npm run omp:patches:regen` 生成，Harness 自有实现回收为 281 个 overlay 文件。Bun 仍为 1.4.4，Rust natives 工具链升级为 `nightly-2026-11-08`。

## 破坏性接口迁移

| 上游变化 | Harness / GUI 处理 |
| --- | --- |
| 删除 `task.file/taskFile` 与 `task/file-approval.ts` | Agent Hub 统一提交 inline `assignment`。Harness protocol、client operation、validation、Runtime bridge/host 一并删除旧字段和文件审批路径，不保留私有兼容 shim。 |
| Browser `ignore_https_errors` 改为 `insecure`，删除 `allow_file_access` | 参数映射使用新名称；普通 relay 继续拒绝 `insecure`，只有 Harness managed browser 走受控豁免。 |
| `app` 改为字符串/CDP endpoint/executable path，`app.args` 改为 `argv`，`app.target` 改为顶层 `target` | managed browser 先于普通 relay 分派，保留页面绑定、人工 lease、可见性、下载与释放语义；文档同步新参数。 |
| 默认优先 ABKit WebKit，Chromium 可显式选择 | WebKit/Tern 纳入人工控制 lease guard，freeze 与 idle-close 不只保护 worker backend。 |
| Ask 输入改为 HTML form | Tree 重答通过 `reopenAsk: { toolCallId, html }` 调用共享 `reanswerAskForm`，复用 select/input/editor fallback 和统一结果格式；取消不伪造旧 `QuestionResult`。 |
| reset auto-redeem 总开关删除 | Codex 使用 `autoRedeem5h/autoRedeemWeekly`；Claude 另有 `autoRedeemFable`。Runtime settings 与 GUI schema 同步分窗口设置，reset consent 只写本次窗口且不覆盖用户显式选择。 |
| Context 新增 `instruction-files` | Runtime 线协议、Host contract、Renderer 色板、双语文案和 preview fixture 同步接收新分类。 |

## Runtime 接缝重接

- Agent 的上游 `onPauseChange` 与 Harness `subscribePause` 共用同一个 pause listener 集合，不保留重复字段或无用 emitter。
- 扩展 command handler 返回 `ran | failed | undefined`，恢复上游 ran/failed/not-found 三态；headless reset 没有 UI 或 consent handler 时只通知并返回空动作。
- 登录/登出继续通过 `AgentSession.refreshScopedModels()` 重建 scoped models；search credential 注销也走同一 session 刷新路径。
- interactive main 的 loop/mode 服务放回各自真实参数位置；runtime view 在 Shell visualization 不可恢复时按上游行为回退到普通输出。
- GC 在持有 session tree lease 后通过 transcript header 识别 live session，保留跳过保护；native collector 使用完整 `GcCommandArgs`。
- 手动 compaction 的 queued 请求等待正在执行的原生 compaction 完成后重新核验，并保留 instructions/options。
- Runtime 的 prompt/steer/followUp/agent.send 与 Host/Composer 共用图片帧预算；保留 1 MiB 线协议上限，超限明确返回 `INVALID_ARGUMENT`。

## 同期缺陷修复

B01–B16 与 R01 覆盖幂等命令保留、Worker 退出清理、永久删除可重入、rollback 验证、工作位置与草稿竞态、远端 Context owner、queued compaction、删除遥测串行化、session pin 锁内 RMW、Web session TTL 主动释放、Home 活动目标、通知最新 active ref 和偏好存储容错。T01 删除过时 404 文案绑定，T02 用可控 deferred query 固定 MCP readiness 顺序。

## 验证记录

| 检查 | 结果 |
| --- | --- |
| Runtime 源身份 | `npm run runtime:verify-source` 通过，确认上述 18.19.0 commit。 |
| Harness 默认检查 | `npm run check` 通过：架构、selector、motion、全部编译和核心测试，117.1 秒。 |
| 生产与全量 | `npm run check -- --production --all` 通过架构、selector、motion、全部编译、1943 项 Renderer 测试及其余 workspace 全量测试，以及 Vite、preload、remote-host bundles，212.0 秒。 |
| Runtime 干净重放 | 在独立 `04cd1a7` checkout 上通过 `npm run omp:verify:patches -- --source …`：281 个 overlay 文件与四组 seam patch 完整重放，`smoke-test: ok`，186.38 秒。 |
| 本机 Runtime 构建 | `npm run omp:build:host` 通过；win32-x64 modern native 由隔离 Rust `nightly-2026-11-08` 编译，baseline 使用官方 18.19.0 二进制；Runtime 身份探测确认 `18.19.0-harness.16`，生成带本地开发签名的 manifest、checksums 和 signature。 |
| 真实 Electron GUI | `node scripts/full-gui-e2e.mjs` 通过 30 项检查，`modelCalls: 0`，确认签名 managed Runtime 握手为 `18.19.0-harness.16`，覆盖真实/预览页面、Ask 附件与导航、Worktree、归档迁移和退出清理。 |
| 六平台正式发布 | 必须由 GitHub `release` environment 的 `OMP_RUNTIME_SIGNING_KEY` 在六个原生 runner 上重建、签名和校验。当前快照没有根 `.git`、`gh` 或 GitHub token，不能派发当前源码到该环境。 |

真实账号、付费模型、macOS 真机和其余五平台不伪造验收结论；本次 30 项 Electron GUI 结果已由 `18.19.0-harness.16` 实测取得。
