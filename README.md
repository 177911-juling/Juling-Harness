<div align="center">
  <img src="icon.png" width="92" alt="Juling Harness" />
  <h1>Juling Harness</h1>
  <p><b>为长时间、多任务的编码 Agent 打造的原生桌面工作台。</b></p>
  <p>一个窗口管理全部会话、子 Agent、模型、工具与文件。<br />所有能力走类型化 Harness Bridge，不解析终端输出，不模拟按键。</p>
</div>

<p align="center">
  <img src="docs/readme/app-workbench.png" width="100%" alt="Juling Harness 工作台：对话、工具卡、子 Agent 与右侧上下文面板同屏" />
  <br />
  <sub>工作台：对话、工具调用、子 Agent 与上下文面板在同一张可停靠画布上</sub>
</p>

| 版本 | 内置运行时 | 平台 | 许可 |
|:--:|:--:|:--:|:--:|
| **1.0.0** | OMP **18.20.2** · `harness.18` | Windows · macOS · Linux | MIT |

---

## 为什么是 Juling Harness

命令行 Agent 很强，但长期使用会暴露三个问题：**上下文散落在终端里**、**并行任务难以追踪**、**模型与工具配置缺少统一入口**。

Juling Harness 把这些问题收进一个桌面应用：

- **会话是工作区，不是日志**：每个对话拥有独立窗口、草稿、滚动位置与工具状态，可并排、可吸附、可钉到副屏。
- **Agent 是可见的协作者**：主 Agent、子 Agent、任务链、消息与用量统一呈现，停止、恢复、追问都有明确入口。
- **配置是产品的一部分**：供应商、模型、角色、子代理、搜索与权限，在同一套界面内完成，并写回经过校验的原生配置。

---

## 01 · 一张可以重新排列的工作台

对话与工具共用同一套窗口系统。拖出侧栏即成浮窗，拖到边缘即预览吸附；Git、Terminal、Changes、Agents、Browser 等工具可以在左栏、右栏、底栏、对话工具区与浮窗之间迁移或合并为标签组。

- 多显示器独立窗口、置顶、最小化胶囊与布局恢复
- 深色 / 浅色双主题，统一的「静默精确」视觉系统
- 六语界面：简体中文、English、Русский、日本語、한국어、हिन्दी
- 会话切换保留草稿、滚动与展开状态，流式输出期间保持交互流畅

---

## 02 · Agent Hub：把并行代理看清楚

<p align="center">
  <img src="docs/readme/app-agent-hub.png" width="100%" alt="Agent Hub 指挥台：编队、实时用量、Agent 档案与任务阶段" />
  <br />
  <sub>指挥台：编队 / 时间线 / 星图 / 通讯，右侧是 Agent 档案与任务阶段</sub>
</p>

Agent Hub 默认进入指挥台视图，左侧是编队、时间线、星图与通讯，右侧是所选 Agent 的档案。两侧共享选中项，停止、恢复、发消息与 BTW 沿用同一套确认与权限。

- **真实 Agent 间消息**：读取已送达的 `@`、回复与进度记录，广播合并为一条，停驻与历史会话同样可查
- **统一像素头像**：指挥台、Agent Hub、选择性提交与对话中是同一张脸，主代理带皇冠，运行中睁眼
- **档案即操作台**：父代理入口、状态、运行时长、模型、上下文与用量集中在一个面板
- **任务阶段可追踪**：每组子任务的分工、完成度与执行者可直接展开

---

## 03 · 模型配置：从供应商到角色

<table>
<tr>
<td width="50%">
<img src="docs/readme/app-model-config.png" width="100%" alt="模型配置：供应商状态、原生目录、凭据与启用开关" />
<br /><sub>供应商：状态、凭据、模型数与启用开关</sub>
</td>
<td width="50%">
<img src="docs/readme/app-provider-presets.png" width="100%" alt="新建供应商：预设模板默认展开，Gateway / 聚合 排在第一位" />
<br /><sub>预设模板：默认展开，Gateway / 聚合 优先</sub>
</td>
</tr>
</table>

- **预设模板默认展开**：新建供应商时直接看到可用模板，选中即预填 API、端点、官网与认证方式
- **聚灵网关优先**：Gateway / 聚合 分组内置主站、美国、香港、印度、巴西、德国六个节点
- **从供应商到角色**：`@default`、`@plan`、`@task` 等角色可分别指定模型与思考强度
- **原生配置可审计**：所有写入经过校验，既支持界面编辑，也保留 YAML 与原生目录的可见性

---

## 04 · 能力中心、文件、终端与浏览器

<table>
<tr>
<td width="50%">
<img src="docs/readme/app-capabilities.png" width="100%" alt="能力中心：MCP、工具、技能与运行时能力的统一状态" />
<br /><sub>能力中心：MCP、工具、技能与运行时能力</sub>
</td>
<td width="50%">
<img src="docs/readme/app-settings.png" width="100%" alt="设置：界面、外观、输入与会话行为的统一入口" />
<br /><sub>设置：界面、外观、输入与会话行为</sub>
</td>
</tr>
</table>

- **内置浏览器**：原生标签、持久登录空间、Console / Network / 下载，以及「Agent | 我」控制权交接
- **文件查看器**：代码编辑、Diff、Markdown、PDF、图片、音视频与表格，本地与 SSH 共用同一读写链路
- **SSH 工作区**：远端 Runtime、终端与 tmux 会话附加，断线后可重新连接
- **能力中心**：MCP、Skills、工具与运行时能力的状态、来源与权限集中管理
- **统计与诊断**：Token 用量、会话时间线、Runtime 状态、日志与更新检查

---

## 05 · 为长期使用而设计

- **Time Travel**：按回合记录工作区检查点，可只恢复代码、只恢复对话分支，或两者一起恢复
- **会话恢复**：历史会话可携带模型恢复，原目录失效时可选择工作区继续
- **工作区恢复**：启动时识别失效项目并回退，诊断页可重选目录、新建对话或清除失效记录
- **应用内更新**：Windows、macOS 与 Linux 均支持验签、差分下载、重启安装与失败回滚
- **运行时隔离**：桌面端只启动签名且版本匹配的 Runtime，不依赖全局 CLI，也不替换系统里的 `omp`

---

## 架构

```text
┌──────────────────────────────┐
│ Electron Main                │  窗口、终端、文件、更新、远程
├──────────────────────────────┤
│ React Renderer               │  工作台、Agent Hub、模型、设置
├──────────────────────────────┤
│ Harness Host                 │  会话、归档、Time Travel、账本
├──────────── Harness Bridge ──┤  类型化帧协议 · 请求 / 回执 / 事件 / 快照
│ Juling Runtime（OMP 18.20.2）│  模型、工具、Agent、压缩、预测
└──────────────────────────────┘
```

Runtime 侧采用两层维护模型：

- **Overlay**：Harness 自有文件（`packages/coding-agent/src/harness/**`），普通源码，普通 diff
- **Seam**：只修改上游已有文件的接缝补丁，按子系统分组，可重复生成与校验

固定上游提交、补丁集版本与工件签名由构建脚本互相校验；任何一侧漂移都会在打包前失败。

---

## 快速开始

| 依赖 | 要求 |
|---|---|
| Node.js | 22 或更新 |
| npm | 随 Node.js 安装 |
| Bun | 1.4.4（构建 Runtime 时） |
| Rust | 仅在本地重建原生运行时需要 |

```bash
npm install
npm run build          # 编译全部 workspace、渲染层与桌面端
npm run preview        # 启动开发预览（真实 Host 数据）
npm run check          # 架构约束、选择器 / 动效规则、类型与核心测试
```

Windows 也可以直接运行 `启动预览版.cmd`（演示数据）或 `启动生产版.cmd`（安装形态）。

安装包与更新产物发布在 [Releases](https://github.com/177911-juling/Juling-Harness/releases)。Linux 提供 `.deb` 与 `AppImage`，从 1.0.0 起支持应用内差分更新。

---

## 文档

| 文档 | 内容 |
|---|---|
| [快速开始](docs/getting-started.md) | 安装、首次启动、连接 Runtime 与基础工作流 |
| [架构说明](docs/architecture.md) | 分层、Harness Bridge、Runtime overlay 与接缝补丁 |
| [工作台停靠](docs/workbench-docking.md) | 停靠区域、拖拽吸附、标签组与布局恢复 |
| [文件浏览器](docs/file-browser.md) | 项目外文件、固定目录与 SSH 浏览 |
| [文件查看器](docs/file-viewer.md) | 编辑、Diff、查找与多格式预览 |
| [内置浏览器](docs/browser.md) | 原生网页、人机交接与 Console / Network |
| [SSH 工作区](docs/ssh-workspaces.md) | 远端 Runtime、文件、Git 与终端 |
| [Time Travel](docs/time-travel.md) | 回合检查点、代码与对话恢复 |
| [更新与验签](docs/updates.md) | 差分下载、签名校验、重启安装与回滚 |
| [Linux 客户端](docs/linux.md) | deb / AppImage 安装与应用内更新 |
| [本地化](docs/localization.md) | 六语界面、跨进程同步与回退链 |

---

## 平台

| 平台 | 架构 | 形态 |
|---|---|---|
| Windows | x64 / arm64 | NSIS 安装包 |
| macOS | Apple Silicon | DMG / 应用更新 ZIP |
| Linux | x64 | deb / AppImage |

---

## 许可

Juling Harness 以 [MIT](LICENSE) 许可发布。

运行时基于 [oh-my-pi](https://github.com/can1357/oh-my-pi)。Electron、React、Bun 及其余第三方组件遵循各自许可，随包分发的第三方声明见 [NOTICE](NOTICE)。
