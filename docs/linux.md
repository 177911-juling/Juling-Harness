# Linux 客户端

Juling Harness 为 Linux x64 桌面提供原生客户端，包含 Electron 工作台、类型化 Harness Bridge、内置签名 OMP Runtime 与原生 PTY。发布格式为 deb 和 AppImage：Ubuntu、Debian 用户使用 deb 获得系统集成与 apt 管理的升级；需要便携运行时使用 AppImage。安装后不需要 Node、npm、Bun 或 Rust，项目本身用到的 Git、编译器和语言工具仍由用户安装。

当前 1.0.0 的 Linux 客户端以 Ubuntu 24.04、glibc 2.39 和 AVX2 x64 处理器为基线，支持应用内验签、差分下载与重启更新。deb 更新经 polkit 授权后由 apt 安装，失败时尝试恢复上一版本；AppImage 在原地替换文件，新版启动失败时换回旧文件。Runtime 更新与应用更新共用签名发现和兼容性检查。

## 系统要求

| 项目 | 要求 |
|---|---|
| 架构 | x64，x86-64-v3 / AVX2（Intel Haswell、AMD Zen 或更新的同等 CPU） |
| 构建与运行基线 | Ubuntu 24.04，glibc 2.39，libstdc++ 13.2 |
| 桌面依赖 | Electron 所需的 GTK、NSS、GBM、ALSA 等系统库；具体包名以发行版为准 |
| 密钥环 | GNOME Keyring / libsecret 或 KWallet，用于持久化 Hindsight 凭证和服务配置 |
| 字体 | CJK 字体（deb 推荐 `fonts-noto-cjk`） |
| Perl | 文件浏览器的独占重命名使用 `/usr/bin/perl`；deb 已声明 `perl-base` |
| AppImage 额外要求 | FUSE 2，以及可用的非特权用户命名空间 |

Runtime 有 `linux-x64` / `linux-arm64` 构建目标，但桌面打包目前只接受原生 Linux x64 构建机。不要用交叉编译或 Windows 的 `node_modules` 打包 Linux 原生模块。ARM64 桌面、RPM、Flatpak 与软件源不在当前发布范围内。Debian 13 等更新的系统可以使用，但仍需满足包内列明的桌面依赖；Ubuntu 22.04、Alpine / musl 不在构建目标内。

当前两种安装包都内置 Runtime，但安装包本身不使用发行版仓库的 GPG 签名。Runtime 工件和应用内更新清单使用 Ed25519 签名；deb 的摘要也写入独立签名的清单，更新时由安装器重新校验，而不是依赖 apt 仓库的信任链。

## 安装

### deb

下载 `Juling-Harness-<版本>-linux-x64.deb` 后，在该文件所在目录执行：

```bash
sudo apt install ./Juling-Harness-*-linux-x64.deb
juling-harness
```

也可以从应用菜单打开 **Juling Harness**。deb 安装到 `/opt/Juling Harness`，注册 `juling-harness.desktop`、图标和 `/usr/bin/juling-harness` 命令。应用以普通用户运行，不要用 root 启动。包的安装脚本沿用 electron-builder 的 Chromium sandbox 与 Ubuntu AppArmor 集成。

### AppImage

```bash
chmod +x ./Juling-Harness-*-linux-x64.AppImage
./Juling-Harness-*-linux-x64.AppImage
```

以上命令假定目录中只有本次下载的一份同格式安装包。AppImage 可以移到个人应用目录，再从文件管理器启动。应用内更新要求 AppImage 所在目录可由当前用户写入；无法写入时请先移到可写目录。

Ubuntu 24.04 和 Debian 13 安装 FUSE 2 使用：

```bash
sudo apt install libfuse2t64
```

其他发行版按包管理器安装 libfuse2。缺少 FUSE 时也可以解包运行：

```bash
./Juling-Harness-*-linux-x64.AppImage --appimage-extract
./squashfs-root/juling-harness
```

解包运行仍须满足系统的 Chromium 沙箱要求，且后续桌面升级需要手动处理。

### 中文与系统依赖

中文界面需要 CJK 字体。deb 默认推荐安装 `fonts-noto-cjk`；使用 AppImage 或精简桌面时，请安装发行版提供的 Noto CJK 字体，避免中文显示成方框：

```bash
sudo apt install fonts-noto-cjk
```

文件浏览器的独占重命名需要 Perl；AppImage 在精简系统上运行时需自行提供 `/usr/bin/perl`。

## 沙箱与 AppArmor

客户端始终启用 Chromium 沙箱。Ubuntu 的 AppArmor 可能限制从任意下载位置启动的 AppImage 创建用户命名空间；这是与安装到固定位置的 deb 不同的系统策略。遇到 `No usable sandbox` 或 `Operation not permitted` 时，Ubuntu / Debian 用户应改用 deb。管理员为 AppImage 自定义策略时，只应授权可信应用的固定路径。

安装器和启动脚本不会添加 `--no-sandbox`，也不会修改全局 userns 或 AppArmor 开关。不要以 root 运行客户端。`--no-sandbox` 会关闭所有 Chromium 子进程的沙箱，包括内置浏览器打开的网页；参见 [Electron 沙箱说明](https://www.electronjs.org/docs/latest/tutorial/sandbox#disabling-chromiums-sandbox-testing-only)。

源码预览保持沙箱开启。如果 Electron 报 `chrome-sandbox` 的所有者或权限不正确，在允许 setuid helper 的开发机上可按发行版策略配置：

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
npm run preview
```

重新安装 Electron 后可能需要重新配置 helper。启动器不会自动添加 `--no-sandbox`。

## 首次启动

第一次启动会打开工作台并播放交互式教程，介绍窗口、吸附、停靠、固定和快捷键；可在 **帮助 → 使用教程** 中重新打开。选择项目文件夹后，客户端会记录工作区并在下次启动时恢复。若记录的路径已失效，诊断视图可以重新选择项目、新建对话或清除失效记录，不会删除项目文件和历史会话。

内置 Runtime 在首次启动时验签、自检并激活，随后通过 Harness Bridge 连接。诊断视图显示 Runtime 版本、连接状态以及当前是托管还是外部 Runtime；连接断开时可以重新连接，托管 Runtime 还可以直接重启。

### 路径与桌面行为

| 项目 | Linux 行为 |
|---|---|
| Host 状态根 | `$XDG_CONFIG_HOME/juling-harness`；变量未设、为空或为相对路径时使用 `~/.config/juling-harness` |
| Host 日志 | `<状态根>/logs/host-YYYY-MM-DD.log` |
| 本地签名密钥 | `<状态根>/keys`；构建与启动应使用同一份 XDG 环境 |
| Host 存活证明 / socket | 固定 `/tmp` 下的私有短目录；authority 按 uid 区分，目录权限仍由 socket 服务检查 |
| Runtime、更新暂存 | `<状态根>/runtimes`、`updates-v2` |
| 文件与链接 | 使用 `xdg-open`；界面使用「文件管理器」名称 |
| 终端 | `$SHELL` → 账户 Shell → `/bin/bash`；没有项目时从家目录打开，PTY 失败后的管道模式仍为交互 Shell |
| 关窗 | 主窗口单独存在时走保存／退出确认；有浮窗时可隐藏主窗口，最后一个浮窗关闭后重新显示工作台 |
| 托盘 | 提供菜单，但不把 Tray 对象创建成功当作图标可见；Linux 不自动关闭到托盘 |
| 开发者工具 | 源码预览支持 F12 / Ctrl+Shift+I |
| 凭证与服务配置 | 使用系统密钥环；不接受 Electron 的 `basic_text` 固定密码回退，也不清空已有加密文件 |
| 更新提示 | AppImage 与 deb 使用签名 Linux 清单后台差分下载并重启安装；deb 更新时请求系统授权；Runtime 可在线更新 |

## 应用内更新

当前 AppImage 和 deb 都支持应用内检查、验签、后台差分下载与重启更新。下载不会中断正在运行的任务；忙碌会话、待处理审批、计划审阅、排队消息和后台代理工作会延后重启，界面会说明等待原因并保留已验证的工件，之后手动重试即可，不会重新下载。普通退出不会自动安装。完整机制见 [应用内更新](updates.md)。

### AppImage

AppImage 在同目录暂存并校验目标文件，旧进程退出后替换原文件；新版启动失败时换回原文件。AppImage 所在目录必须可写。恢复到没有启动确认功能的旧版时，以进程持续运行 10 秒作为完成条件。

### deb

deb 在后台准备目标包和可恢复的当前版本；首次准备可能需要先完整下载当前版本，之后使用缓存进行差分。点击「重启更新」时系统会显示管理员授权，授权成功且应用退出后才通过 apt 安装。取消授权不会安装；安装或新版本启动失败时会尝试通过 apt 恢复上一版本。

受保护的 helper 由包管理器安装，会把目标和上一版本复制到 root 所有目录，再独立验证签名、摘要、包名、版本和架构，旧进程退出后才调用 apt。需要图形化 polkit 授权代理和可用的 apt。新进程健康确认前异常退出或 apt 安装失败时，helper 尝试恢复上一 deb；正常退出但尚未确认时，下次启动继续确认。

使用尚未支持应用内更新的旧 Linux 版本时，需要先手动安装一次当前版本，之后才能使用上述流程。解包运行的非 AppImage 安装仍从发布页手动安装；其「全部准备」只下载兼容的 Runtime，不会下载不兼容组合。

Runtime 更新按平台、通道、最低桌面版本和 Bridge 协议匹配。如果 Runtime 需要新版桌面，会先提示升级桌面，不下载不兼容组合。全新安装和桌面升级都可从包内验签、复制并激活 Runtime，安装过程不需要联网下载运行时。

## 卸载

卸载 deb：

```bash
sudo apt remove juling-harness
```

AppImage 退出后删除该文件即可。两种方式都保留用户配置、会话、日志和活跃 Runtime，不删除用户项目。完成一次应用内更新后，可在设置中准备并重启恢复上一桌面版本；deb 恢复也需要系统授权。

## 从源码运行

在有图形会话的 Linux 桌面上准备：

- Node.js 22+ 和 npm（CI 使用 Node 24）、Git。
- Python 3、make、C/C++ 编译器，供 `node-pty` 构建原生终端模块。
- Electron 所需的 GTK、NSS、GBM、ALSA 等系统库；具体包名以发行版为准。
- `xdg-utils`，用于在系统浏览器、文件管理器中打开链接和文件位置。
- GNOME Keyring / libsecret 或 KWallet；没有系统密钥环时，持久化 Hindsight 凭证等操作会报告安全存储不可用。

克隆并启动开发预览：

```bash
git clone --recurse-submodules https://github.com/177911-juling/Juling-Harness.git
cd juling-harness
npm ci
npm run omp:overlay:apply
npm run preview
```

启动器使用 npm 安装的 `node_modules/electron/dist/electron`，构建沙箱 preload 并启动 Vite。真实 Runtime 尚未准备好时，界面会显示实际连接状态。使用演示数据启动：

```bash
OMP_PREVIEW_DATA=1 npm run preview
```

`OMP_PREVIEW_MODE=production` 在 Linux 上只用于加载已构建的页面，仍使用未打包的 Electron；它不等同于 Linux 安装包验收。

### 连接本机 Runtime

另需 Bun 和 Rust 工具链；版本以 `omp-patch/upstream.json`、vendor 的 `rust-toolchain.toml` 及 [Runtime 开发说明](../omp-patch/README.md) 为准。当前 OMP 18.20.2 使用 Bun 1.4.4。请在与目标架构一致的 Linux 机器上构建：

```bash
npm run omp:install-deps
npm run omp:keys
npm run omp:build:host
npm run preview
```

`omp:keys` 只需在开发机首次运行，会复用已有密钥。`omp:build:host` 生成带签名的本机构建产物，桌面按既有 Runtime 发现、验签和握手链路连接，不以 CLI 文本或终端按键控制 Runtime。

## 构建安装包

先按上文准备原生 Runtime 构建工具，并安装 `desktop-file-utils` 与 FUSE 2。开发打包使用本机临时签名身份：

```bash
npm ci
npm run omp:overlay:apply
npm run omp:keys
keys="${XDG_CONFIG_HOME:-$HOME/.config}/juling-harness/keys"
export OMP_RUNTIME_TRUSTED_PUBLIC_KEY="$keys/trusted-public.pem"
export OMP_RUNTIME_SIGNING_KEY_ID="$(tr -d '[:space:]' < "$keys/key-id.txt")"
npm run pack:linux
```

产物在 `outputs/installer-linux/`：`linux-unpacked/`、`Juling-Harness-<版本>-linux-x64.AppImage` 与 `Juling-Harness-<版本>-linux-x64.deb`。`--skip-host --skip-build` 可以复用已准备的 Runtime 和工作区产物；`npm run pack:linux:audit` 单独审计。正式 Release 使用仓库已有的发布密钥，不使用上述开发密钥。

审计分别解开 AppImage 和 deb，检查 ELF 架构、glibc 要求、桌面入口、沙箱、Renderer / preload、原生 PTY，以及包内 Runtime 的执行权限、签名与摘要。Runtime 和公钥放在 `resources/runtime/versions` 与 `resources/runtime-keys`，不放进 ASAR。

## 验证与发布

普通 CI 执行 Windows / Linux 源码检查。手动 CI 的 `linux-package` 额外构建、审计两种安装包，并运行 X11 AppImage / deb、Wayland deb、真实 Runtime 握手、原生终端、会话重启与安装 / 卸载数据保留验收。对话使用本机 OpenAI 兼容测试端点驱动真实 Runtime 和文件读取工具，不使用外部模型账户或假 Host。产物使用测试密钥，不能作为正式 Release 附件。

该验收还在隔离的 Ubuntu 容器中使用真实 polkit、apt 和 dpkg 测试签名 deb 更新、授权拒绝、安装失败与恢复，以及篡改文件的拒绝。容器中的授权规则仅供测试，真实桌面的授权弹窗仍须在目标系统上检查。

构建与安装验收是独立任务。只调整验收脚本时，可以给 `linux_package_run` 填入已有测试包的 CI run ID，复测该包而不用重编 Runtime；报告会记录安装包的来源 run。修改产品或打包代码后，应留空此项生成新包。

Ubuntu CI 对 AppImage 使用仅匹配该测试包固定路径的 AppArmor `userns` 规则，验证其命名空间前提已满足时的运行；规则写入验收附件。deb 使用安装器注册的规则。两者都保持 Chromium 沙箱与系统全局策略开启，这不代表任意下载位置的 AppImage 在 Ubuntu 默认策略下无需配置即可启动。

自动化中的中文输入检查覆盖 Chromium composition 事件；实体 IBus / Fcitx、GNOME / KDE 的窗口策略、屏幕共享 portal / PipeWire、麦克风与系统密钥环仍按目标桌面实机验证。能力是否可用由真实 Runtime 探测报告，不因安装包生成成功而伪造能力。

Release 默认包含 Linux x64，任一选中平台的构建或包审计失败都会阻止整次发布。版本号须晚于已发布版本，不能重用历史 tag。详细流程见 [发布指南](releasing.md)。

开发检查沿用[唯一检查入口](development.md#everyday-commands)：`npm run check -- --production`。Linux 客户端的审查与分发缺口见 [审查记录](reviews/pr22-linux-client-2026-11-14.md)。
