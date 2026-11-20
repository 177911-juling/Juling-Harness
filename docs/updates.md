# 应用内更新

Juling Harness 在应用内检查、验签、准备并安装桌面与 Runtime 更新，覆盖 Windows、macOS 和 Linux。桌面更新包括 Electron、Main、Renderer、preload 与原生模块；Runtime 可以独立更新，保留 Stable / Canary 通道。两者共用签名发现、差分下载和持久化事务，桌面更新在用户主动重启后安装，Runtime 更新则在校验通过后激活。

更新器只信任签名清单和工件摘要。镜像、CDN 和 GitHub Release 都只是传输位置，不能改变信任来源。下载失败的版本不会覆盖当前安装，缺少可验证旧版本时也不会伪造回滚入口。当前 1.0.0 的 Windows、macOS 与 Linux 客户端使用同一套 v2 更新协议。

## 更新范围与通道

| 组件 | 内容 | 通道 |
|---|---|---|
| 桌面 | Electron、Main、Renderer、preload、原生模块 | Stable |
| Runtime | OMP Runtime、原生模块与随包工具 | Stable / Canary |

桌面更新从已签名的 Stable 清单发布。Runtime 的 Canary 必须显式选择，不会因为检测到较新版本就自动切换；同一个 Runtime 版本不能发布不同字节或不同通道。桌面与 Runtime 的版本不必同步增长，但 Runtime 的最低桌面版本和 Bridge 协议范围必须满足。

如果桌面包已经包含目标 Stable Runtime，更新器复用内置工件，而不是重复下载。Runtime 的独立发现不使用 GitHub Latest。

## 检查更新

「设置 → 更新与维护 → 软件更新」提供「自动检查更新」与「自动下载更新」，两项默认开启。启动约 15 秒后首次检查，此后每 4 小时检查一次。关闭自动下载后，后台仍会检查并提示可用版本，由用户手动下载；关闭自动检查后，仍可手动检查和下载。

检查过程中关闭任一自动开关，会在检查结束后阻止此次后台下载；已经开始的下载使用更新弹窗的取消按钮停止。偏好保存在用户设置目录的 `update-prefs.json`。旧设置缺少 `autoDownload` 时按开启处理，已保存的关闭状态保留。镜像、Runtime 通道和版本恢复也位于「更新与维护」。

检查使用按来源隔离的 Releases ETag 与已验签清单缓存；清单缓存随 GitHub 资产身份或更新时间变化而失效。无法取得完整目录时明确显示检查失败，已经准备好的更新仍可应用。

## 验签与来源

v2 清单采用 Ed25519 签名，包含组件、版本、通道、架构、序号、兼容协议、工件和 blockmap 的 SHA-256 / SHA-512。签名域为 `juling-harness-update-v2`。下载与重建后的文件会校验完整摘要，执行前再次校验。

发现更新时按组件、通道与架构分别选择最大签名序号，并保存防回退水位。清单序号低于本地水位会被拒绝，不能通过重放旧清单降级。镜像只改变传输位置，不改变签名校验。

Windows Setup 没有 Authenticode 签名，macOS 应用使用 ad hoc 签名且未公证，Linux 安装包也不依赖发行版仓库的 GPG 签名；这些平台都依赖上述签名清单和工件摘要完成更新验证。首次安装仍受各平台系统提示约束，详见[各平台差异](#各平台差异)。

## 差分下载

更新器优先复用本地相同数据块，通过 HTTP Range 下载变化部分。缓存缺失、损坏、服务器不支持 Range 或差分失败时回退一次完整下载。完整下载仍使用静默安装，界面显示实际下载方式和字节数。

检查清单和完整下载共用 Electron 网络栈。配置镜像后优先连接镜像，镜像拒绝请求或传输失败时回退 GitHub 官方源；每个请求最多尝试三次（包含切源），瞬时故障按 1 秒、3 秒退避。普通官方 403 会明确报错，限流遵循服务端重试时间，超过 60 秒的等待交给用户稍后重试。首响应超时为 15 秒，下载连续 30 秒没有进展时重试，取消立即停止。

下载断点按签名摘要与大小识别，切换来源后继续已有字节，但不复用另一来源的 ETag。请求始终从原始 Release URL 开始，不保存 CDN 临时签名链接。

## 准备与重启安装

更新器在后台检查并准备更新，完成后提示「重启更新」。下载不会中断任务；运行中的任务、压缩、待处理交互、计划审阅、排队消息和后台代理工作会延后重启。界面会说明等待原因并保留已验证工件，处理完成后手动重试，不会重新下载。普通退出不会自动安装。

准备完成的工件和签名清单写入事务文件。用户点击重启后，Main 保存居民会话 ID 与原工作区，阻止新的生命周期操作，关闭 Runtime，然后启动安装或重启流程。新 Main 启动后验证并激活 Runtime，恢复会话；启动失败时尝试验证和激活兼容的上一 Runtime。没有兼容旧版本时保留诊断界面。

应用更新在最终退出前重新检查待应用桌面和 Runtime 的协议及最低桌面版本，避免分次准备形成不兼容组合。启动、检查、准备和应用时，也会以已验签的安装状态协调待处理 Runtime。目标版本、通道、平台与协议已经满足时清除残留事务，不再提示同版本更新；损坏安装仍可执行同版本修复，已有试运行的回滚目标保持有效。

## 回滚与恢复

桌面回滚需要保留可验证的上一签名安装包。通过「设置 → 更新与维护 → 恢复上一桌面版本」查看恢复目标并准备上一版本，再单独点击「重启恢复」。准备工作跨启动保留，不会被后台下载替换。缺少可验证旧版本时入口禁用并说明使用历史安装包。

Runtime 启动失败时会尝试验证并激活兼容的上一版本。激活后的中断恢复保留原试运行的回滚目标，即使 `current.json` 已切换也不会覆盖它。镜像下载失败、摘要不匹配或签名无效都不会进入激活步骤。

## 各平台差异

| 平台 / 格式 | 安装或替换方式 | 失败恢复 | 用户可见注意 |
|---|---|---|---|
| Windows Setup | NSIS 按当前用户静默安装 | 保留上一签名安装包，手动或设置中恢复 | 无 Authenticode 签名；新桌面无法启动时需手动运行历史 Setup |
| macOS dmg / ZIP | helper 解包、校验后两次 rename 交换 `.app` | 未确认健康前自动换回旧版本 | ad hoc 签名；权限与钥匙串可能重新询问；App Translocation 无法更新 |
| Linux deb | polkit 授权，受保护 helper 调用 apt | helper 在失败时用 apt 恢复上一 deb | 需要图形化 polkit 代理与 apt；取消授权不会安装 |
| Linux AppImage | 同目录暂存并校验后替换文件 | 新版本启动失败时换回原文件 | 所在目录必须可写；AppArmor / userns 策略可能要求改用 deb |

### Windows

- 当前用户默认安装目录为 `%LOCALAPPDATA%\Programs\Juling Harness`，程序以普通用户权限启动。
- 准备完成后点击重启，Main 使用 NSIS 静默安装（`--updated /S --force-run`），等待进程启动结果；失败不回退到交互打开安装包。
- 桌面静默安装不是原子事务，Windows 也不会像 macOS helper 那样自动确认并换回失败的新桌面。新桌面完全无法启动时，需要手动运行历史 Setup。
- 旧的全机安装需要一次迁移安装。安装器先完成当前用户安装，再请求授权卸载旧全机版本；迁移前复制旧 Runtime，启动时重新验签。授权取消、旧版仍在运行或旧卸载失败时保留旧版本，并提示重新运行 Setup 完成迁移；新旧安装可能暂时并存。旧卸载器按名称处理进程，因此迁移要求所有 OMP 进程退出；新安装器不按名称全局杀进程。

### macOS

- Runtime 在 `~/Library/Application Support/juling-harness/runtimes`；更新缓存与事务在 `~/Library/Application Support/juling-harness/updates-v2`。两者都在签名的 `.app` 之外，应用包本身只读，不使用界面热载荷。
- 桌面更新载荷是 `Juling-Harness-<ver>-macos-arm64.zip`，即 `ditto` 打包的已签名 `.app`，同样按 blockmap 差分；dmg 只用于首次安装。从 dmg 安装后本地没有基线，第一次桌面更新是全量下载，之后可以差分；「恢复上一桌面版本」也从第一次更新之后可用。
- 点击重启后，Main 用 `ditto --noqtn` 把新版本解到 `.app` 同级的隐藏目录，校验 `codesign --verify --deep --strict`、bundle id、版本和 arm64 主程序。校验通过后启动一个脱离的 helper（旧版 Electron 以 Node 模式运行）并退出；helper 等旧进程退出后，用同一目录内的两次 rename 交换应用，从不原地覆盖已签名文件，再打开新版本。
- 新版本一启动就写 `started`；Renderer 就绪后写 `healthy`，事务在这时才提交；正常退出写 `clean-exit`。迟迟没有 `started`，或进程在 `healthy`、`clean-exit` 之前结束，helper 就换回旧版本并重新打开。该版本的同一文件不再推送；如果新桌面已经激活了旧桌面不兼容的 Runtime，也会回到上一 Runtime。用户在确认前自行退出不算失败，下次启动时完成确认。
- 以下情况无法自动更新，界面会说明原因并建议从发布页下载 dmg 手动安装：应用处于 App Translocation（从下载位置直接打开）；所在目录不可写或磁盘空间不足；macOS 的「App 管理」拒绝替换应用。
- Runtime 独立更新流程同 Windows，解压时保留执行位，激活前先执行 `codesign --verify`。从应用包播种的 Runtime 副本会清除继承的 quarantine 标记，随后照常验签。
- ad hoc 签名的代价是每次更新签名身份都会变，麦克风、文件夹、本地网络等授权会重新询问，钥匙串也可能再次请求授权。换成 Developer ID 签名并公证后解决。

### Linux

- 状态在 `$XDG_CONFIG_HOME/juling-harness`（未设、为空或相对路径时用 `~/.config/juling-harness`）；活跃 Runtime 与更新暂存在其 `runtimes` 和 `updates-v2` 子目录。
- `updates-linux-x64.json` 的应用附件是 AppImage，`firstInstall` 是 deb；两个文件的摘要都纳入同一 Ed25519 签名。`updates-linux-deb-x64.json` 对 deb 和对应 blockmap 单独签名，旧清单不增加字段。deb 客户端仍从原清单发现独立 Runtime，并核对两个桌面清单；缺少新版 deb 清单时明确报错。
- AppImage 在同目录暂存并校验目标文件，旧进程退出后替换；新版本启动失败时换回原文件。恢复到没有启动确认功能的旧版时，以进程持续运行 10 秒作为完成条件。AppImage 所在目录必须可由当前用户写入。
- deb 在用户确认重启时通过 polkit 获取授权。由包管理器安装的受保护 helper 将目标和上一版本复制到 root 所有目录，再独立验证签名、摘要、包名、版本和架构，旧进程退出后才调用 apt。新进程健康确认前异常退出或 apt 安装失败时，helper 尝试恢复上一 deb；正常退出但尚未确认时下次启动继续确认。授权取消时应用重新启动并保留待更新状态。
- 首次 deb 更新需要下载已安装版本的完整 deb，作为恢复包与差分基线；之后复用已验证缓存。找不到已安装版本的签名 deb 清单时需要手动安装新版，避免无法恢复的自动替换。
- 解包运行的非 AppImage 安装仍手动升级；其「全部准备」只下载兼容的 Runtime，不会下载不兼容组合。
- deb 升级、重装与卸载均保留用户状态。沙箱、最低系统版本与安装说明见 [Linux 客户端](linux.md)。

## 跨版本更新

| 起点 | 更新路径 |
|---|---|
| Windows v2 客户端 | 从各 Release 的已验签清单按组件选择最高序号，直接准备当前版本，不要求逐版安装。差分直接比较本地基线和目标工件；没有可用基线则全量下载。 |
| Windows v1 客户端 | 通过保留的签名 `update-index.json` 先运行迁移安装包，再由 v2 更新器升级到当前版本。迁移索引固定指向首次 v2 安装包，历史附件须保留。 |
| macOS v2 客户端 | 支持跳版本；首次从 dmg 安装没有 ZIP 基线时，全量下载目标 ZIP，之后可直接跨版差分。 |
| Linux AppImage 客户端 | 当前 AppImage 与签名清单匹配时可作为差分基线，缺失基线则全量下载。使用尚未支持应用内更新的旧版本时，需要先手动安装一次当前版本。 |
| Linux deb 客户端 | 新版客户端读取独立签名的 deb 清单。首次更新先下载可恢复的当前版本并用它作为差分基线，后续复用缓存；旧版本同样需要先手动安装一次当前版本。 |

桌面和 Runtime 的版本不必同步增长，但 Runtime 的最低桌面版本与协议范围必须满足。准备「全部更新」时先准备桌面，再用目标桌面的版本和协议检查 Runtime；重启应用前还会再次检查最终组合。如果某个 Runtime 要求更高的最低桌面版本，旧桌面必须同时更新桌面，不能单独激活该 Runtime。

桌面启动时也会比较当前与随包 Runtime：没有安装或当前版本更旧时，自动验签、自检并激活随包版本；同版或较新的独立更新保持原样。当前是 Canary，或回滚记录表明用户已从该随包版本（或更新版本）回退时，不自动覆盖选择。较新的随包版本仍可用于后续桌面升级。启动接受与功能可用性继续由协议握手、能力协商和实际探测决定；候选自检失败不会切换当前版本。

## 存储与迁移

- 当前用户默认安装目录：`%LOCALAPPDATA%\Programs\Juling Harness`，程序以普通用户权限启动。
- 活跃 Runtime：`%LOCALAPPDATA%\juling-harness\runtimes`。
- 更新缓存与事务：`%LOCALAPPDATA%\juling-harness\updates-v2`。
- 原有会话、设置、工作区记录和头像位置保持不变；不迁移用户项目。
- 安装器保留签名 Runtime seed，用于初装离线启动；日常桌面更新不删除活跃 Runtime。
- 发布打包会在复制 Runtime 后立即使用 `packaging/keys/trusted-keys.json` 验证 Runtime manifest、checksums、signature 和 EXE 摘要；开发密钥或错误发行密钥会让打包失败。

macOS 与 Linux 的路径见上一节。桌面安装目录、Runtime 数据和用户配置彼此分离，重装桌面不会替换 Runtime 数据和用户配置。

## 发布通道与工件

| 平台 | 桌面安装 / 更新工件 | 清单 |
|---|---|---|
| Windows | `Juling-Harness-Setup-<ver>-windows-<arch>.exe` 与 blockmap；Runtime ZIP 与 blockmap | `updates-win32-<arch>.json` |
| macOS arm64 | 首次安装 `Juling-Harness-<ver>-macos-arm64.dmg`；更新 ZIP 与 blockmap；Runtime ZIP 与 blockmap | `updates-darwin-arm64.json` |
| Linux x64 | AppImage 与 blockmap、deb；Runtime ZIP 与 blockmap | `updates-linux-x64.json`、`updates-linux-deb-x64.json` |

blockmap 是增量下载索引，不是可执行安装包。Runtime ZIP 用于在线更新或离线导入。`updates-*.json` 是签名版本清单，普通用户不需要手动下载。发布资产名保持 `Juling-Harness-*`。

发布流程在打包审计后只运行一次 `npm run updates:verify`，不重复源码测试或 P5 门禁。涉及 Windows 安装迁移、UAC、静默重启、安装失败恢复和 ARM64 的改动，在对应环境按需验收。

## 用户可见的限制

- Windows Setup 没有 Authenticode 签名，SmartScreen 会告警；更新清单和 Runtime 仍有 Ed25519 验签。桌面静默安装不是原子事务，新桌面完全无法启动时需手动运行历史 Setup。
- macOS 应用使用 ad hoc 签名且未公证。首次启动需要「仍要打开」；每次更新后权限与钥匙串可能重新询问。App Translocation、目录不可写、磁盘空间不足或「App 管理」拒绝替换时无法自动更新。
- Linux deb 更新需要图形化 polkit 授权代理和可用的 apt；取消授权不会安装。AppImage 要求所在目录可写，Ubuntu 的 AppArmor / 用户命名空间策略可能要求改用 deb。解包运行的非 AppImage 安装仍需手动升级。
- 首次 deb 更新、首次 macOS 更新和旧 Linux 客户端升级可能需要一次完整下载或一次手动安装，之后才能使用差分。
- 「跳过此版本」仅用于桌面更新。Runtime 独立更新不显示此按钮，避免把 Runtime 版本写入桌面的跳过配置；Runtime 更新仍可关闭自动下载或稍后处理。
- 没有可验证的旧桌面安装包时，恢复入口禁用；不会用未签名目录覆盖活跃版本。
- 镜像只改变传输位置，不能改变信任来源；镜像拒绝或传输失败时回退官方源。

## 工程边界

- `update-coordinator.ts` 管理 Main 中的后台任务、事务、准备与重启。
- `update-request.ts` 负责镜像回退、请求重试、首响应与流停滞超时；更新阶段、来源主机、HTTP 状态、重试和差分回退原因写入现有 Host 日志。界面分别展示检查、下载、应用与恢复错误，任务延期作为等待状态显示。
- `differential-artifact.ts` 负责工件缓存、摘要验证、差分和全量回退。
- `electron-update-adapter.ts` 使用固定版本 electron-updater 的分块计划，并通过 Electron 网络栈检查每个 Range 响应和响应取消；不支持 Range 时立即回退全量下载。NSIS 使用 `--updated /S --force-run` 启动，等待进程启动结果，失败不回退到交互打开安装包。
- Linux：`linux-appimage-installer.ts` 暂存校验后的文件并启动同目录替换 helper；`linux-deb-installer.ts` / `linux-deb-swap.ts` 管理授权、启动确认与恢复，`packaging/linux/omp-deb-update` 在管理员权限下重新验签并调用 apt。
- macOS：`mac-app-installer.ts` 负责 preflight、解包与校验，并启动 helper；`mac-app-swap.ts` 负责交换、启动标记与换回；`update-coordinator.ts` 的 `desktopCommit: "confirmed"` 要等新版本健康后才提交。
- IPC 固定为 snapshot / prepare / check / apply / cancel；共用 v2 类型来自 runtime-installer。旧在线 startApp / startRuntime 在新打包应用中禁用；旧代码仅用于兼容测试和未打包开发环境。
- ZIP 工件离线导入仍使用内部 Runtime 签名验证和现有维护事务；不能用未签名目录覆盖活跃版本。

## 发布前验收

更新实现改动时运行 `npm run check` 和 `npm run test:tooling`。macOS 的首次打开、麦克风与文件夹授权、整包交换、新版本启动失败后的换回和 Runtime 试运行回滚，须在干净的 Apple Silicon 机器上实测；单元测试和 CI 打包审计都不能替代真机验收。Windows 的 UAC 同意与拒绝、静默重启、安装中断恢复和旧全机迁移同样需要在对应环境验证。Linux 的 polkit 授权、apt 安装失败恢复与篡改拒绝见 [Linux 客户端](linux.md)。
