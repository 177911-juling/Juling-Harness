# Getting started

Juling Harness is the desktop workbench for Juling Runtime (OMP 18.20.2). It keeps conversations, subagents, tool calls, files, terminals, a browser and model configuration in one window, and every capability travels over the typed Harness Bridge instead of terminal scraping or synthetic keystrokes. It is built for long-running, multi-task coding work where several agents and sessions need to stay visible at once.

Version 1.1.0 ships for Windows x64 and ARM64, macOS on Apple Silicon, and Linux x64. Every installer contains a signed Runtime and the native terminal, so end users do not need Node, Bun or Rust. You still need an OMP-compatible model provider: Harness reads the same `models.yml` and login flow as the OMP CLI and does not embed API keys.

## Install

Download the package for your platform from [GitHub Releases](https://github.com/177911-juling/Juling-Harness/releases).

| Platform | Artifact | Notes |
|---|---|---|
| Windows x64 / ARM64 | `Juling-Harness-Setup-<version>-windows-<arch>.exe` | Per-user install, defaulting to `%LOCALAPPDATA%\Programs\Juling Harness`; no Authenticode signature |
| macOS Apple Silicon | `Juling-Harness-<version>-macos-arm64.dmg` | macOS 13 or later; ad hoc signed, not notarized |
| Linux x64 | `Juling-Harness-<version>-linux-x64.deb` or `.AppImage` | Ubuntu 24.04 / glibc 2.39 baseline, AVX2 x64; see [Linux](linux.md) |

The Runtime ZIP, blockmap and `updates-*.json` assets in the same release are for in-app updates and offline Runtime import, not for first-time desktop installation.

### Windows

Run the Setup and follow the installer. It installs for the current user and does not require a machine-wide installation. The Setup has no Authenticode signature, so SmartScreen may warn on first launch: choose **More info**, then **Run anyway**. The update catalog and Runtime artifacts are independently Ed25519-signed; the missing Authenticode signature does not change how updates are verified.

### macOS

Open the DMG and drag **Juling Harness** to `/Applications`. The app is signed ad hoc and not notarized, so the first launch is blocked. Allow it in **System Settings → Privacy & Security → Open Anyway**, or remove the quarantine flag from a terminal:

```bash
xattr -dr com.apple.quarantine "/Applications/Juling Harness.app"
```

Each in-app update changes the ad hoc signature. macOS asks again for microphone, folder and local network access, and the Keychain may ask once more. A Developer ID signature with notarization would remove these prompts.

### Linux

Ubuntu and Debian users should install the deb; AppImage is the portable option and needs FUSE 2 plus working unprivileged user namespaces.

```bash
sudo apt install ./Juling-Harness-*-linux-x64.deb
```

Or run the AppImage:

```bash
chmod +x ./Juling-Harness-*-linux-x64.AppImage
./Juling-Harness-*-linux-x64.AppImage
```

Full requirements, sandbox notes and uninstall steps are in [Linux installation and development](linux.md). Neither the deb nor the AppImage is signed by a distribution repository; in-app updates verify the Ed25519 catalog and artifact digests instead.

## First launch

On first start Harness opens the workbench and automatically plays an interactive tutorial covering windows, edge snapping, docking, pinning and shortcuts. Finish all steps to close it, or reopen it later from **Help → Tutorial**.

Choose a project folder when prompted. Harness records the workspace and restores it on the next launch. If a recorded path has disappeared, the diagnostics view lets you choose another folder, start a new conversation or forget the stale record without deleting project files or session history.

The bundled Runtime is verified and activated on first launch, then connected over the Harness Bridge. Connection state, version checks and reconnect controls are covered in [Connect a Runtime and a model provider](#connect-a-runtime-and-a-model-provider).

## Connect a Runtime and a model provider

### Runtime

Packaged builds already contain a signed Runtime and connect it automatically. Source builds use the Runtime created by `npm run omp:build:host`; the desktop discovers it through the same signed handshake, verifies its version and protocol, and connects over the Harness Bridge. It does not scrape CLI output or send terminal keystrokes.

Open **Diagnostics** to see the Runtime version, whether it is managed or external, and the current connection state. Use **Reconnect** after a dropped connection, or restart a managed Runtime from the same view. A Runtime that requires a newer desktop is reported as blocked instead of being activated into an incompatible combination.

### Model provider

Harness does not ship credentials. Open **Model Configuration** from the navigation rail and either create a provider from a preset template or add one manually with its API endpoint and key. The provider list shows availability and model counts; the roles view assigns models to `@default`, `@plan`, `@task` and other roles.

Configuration is validated before it is written to the native `models.yml`. You can keep editing the YAML by hand, but external edits are read through the same native configuration path.

## Basic workflow

1. **Open a workspace.** A workspace is the project folder that sessions, files, Git and the terminal operate on.
2. **Start a conversation.** Type an instruction in the composer. Use `/` for commands and `@` to reference workspace files and skills.
3. **Respond to approvals.** Tool calls that need permission appear as approval cards. The default approval mode and per-tool policies live in **Settings → Permissions and security**; reads, writes and commands can be allowed, asked or denied separately.
4. **Arrange the workbench.** Drag a panel to a sidebar, the bottom dock or a floating window; drag it to an edge to snap it beside the conversation. The layout, drafts and scroll positions are restored per session.
5. **Track agents.** Agent Hub shows the main agent, child agents, task stages, messages and usage. Stop, resume, message and release follow the same confirmation and permission rules as the conversation.
6. **Use the built-in tools.** Files, Terminal, Git, Changes, Browser and the file viewer share the same workspace identity. SSH workspaces attach a remote Runtime and terminal instead of a local one.
7. **Go back in time.** Time Travel records checkpoints per turn; you can restore code, the conversation branch, or both.
8. **Keep the app current.** **Settings → Updates and maintenance** checks signed catalogs, prepares desktop and Runtime updates in the background, and installs them after a restart. See [In-app updates](updates.md).

Switching sessions preserves each session's draft, scroll position and expanded content. Streaming output stays interactive while you work in another session or open a tool window.

## Run from source

Source builds are intended for development and for platforms or machines where you want to control the Runtime build. For UI-only work you need Node.js 22 or newer, npm and Git. Building the real Runtime additionally needs Bun and Rust.

| Dependency | Requirement |
|---|---|
| Node.js | 22 or newer, with npm |
| Git | Clone with submodules |
| Bun | 1.4.4 for Runtime builds |
| Rust | Only when rebuilding the native Runtime |
| Windows | MSVC Build Tools and Rust, installed through `npm run omp:install-deps` |
| macOS | Xcode Command Line Tools, rustup target `aarch64-apple-darwin`, Bun and a native arm64 Node (not under Rosetta) |

Clone the repository with submodules:

```bash
git clone --recurse-submodules https://github.com/177911-juling/Juling-Harness.git
cd juling-harness
```

If you cloned without submodules:

```bash
git submodule update --init --recursive
```

### Quick preview

```bash
npm install
npm run omp:overlay:apply
npm run preview
```

On Windows you can also double-click `preview.cmd` at the repository root. The preview builds the Electron main process and renderer, then opens the desktop window; the first build can take several minutes. To compile every workspace without opening the window, run `npm run build`. This build hides the in-app preview switch (`PREVIEW_MODE_SWITCH_ENABLED=false`) and uses Host and desktop data. Composer, terminal, pause/resume and approvals talk to a real Runtime when one is connected. On macOS the preview is the stock Electron app, so the Dock shows "Electron" rather than Juling Harness.

To start the preview with demo data instead of a live Runtime:

```bash
OMP_PREVIEW_DATA=1 npm run preview
```

### Build and connect a real Runtime

```powershell
npm install
npm run omp:install-deps
npm run omp:overlay:apply
npm run omp:keys              # once per machine; writes keys under %APPDATA%\juling-harness\keys
                              # (macOS: ~/Library/Application Support/juling-harness/keys)
npm run omp:build:host
npm run preview
```

`omp:overlay:apply` copies Harness's overlay and seam patches into the vendored source tree. That **will** show as modified content inside `omp-patch/vendor/oh-my-pi`. Do not `git add` that dirty vendor tree; the source of truth is `omp-patch/overlay/` plus `omp-patch/patches/`.

Without a Rust toolchain, install the matching prebuilt native addon from npm (`@oh-my-pi/pi-natives-win32-x64@<upstream version>`), place `pi_natives.win32-x64-baseline.node` in `omp-patch/vendor/oh-my-pi/packages/natives/native/`, run `bun --cwd=packages/coding-agent run build` yourself, then generate the signed artifact with `scripts/runtime-artifact.mjs`. `omp:build:host` still compiles the addon from source when Rust is present.

On Windows, `bun build --compile` fails with `failed to copy bun executable into temporary file: ENOENT` when `bun.exe` itself lives under a non-ASCII path (for example `G:\源码\bun`). Copy it to an ASCII path such as `C:\omp-tools\bun\bun.exe` and set `BUN_EXE` to that copy.

The desktop discovers the built Runtime through the same signed handshake used by packaged builds. It does not drive the Runtime by scraping CLI text or sending terminal keystrokes. Host logs are written to `%APPDATA%\juling-harness\logs\host-YYYY-MM-DD.log` on Windows and `~/Library/Application Support/juling-harness/logs/host-YYYY-MM-DD.log` on macOS.

### Build installers

Each packager needs a machine that can already build the Runtime; use `--skip-host` to reuse an existing signed Runtime artifact.

```powershell
npm run pack:win                         # outputs/installer/Juling-Harness-Setup-<version>-windows-<arch>.exe
npm run pack:win -- --skip-host
```

```bash
npm run pack:mac                         # outputs/installer-mac/
npm run pack:linux                       # outputs/installer-linux/
```

Windows output is a per-user Setup. `pack:win` audits the unpacked tree so a Runtime **private** key cannot ship. macOS output contains `Juling Harness.app`, a first-install DMG and the signed ZIP used by in-app updates; the build fails closed if the bundle audit finds a problem (see [packaging/README.md](../packaging/README.md)). Linux output contains `linux-unpacked/`, the AppImage and the deb; see [Linux](linux.md) for the development signing environment.

## Data directories

| Platform | Configuration, logs and keys | Runtime and update staging | Installed application |
|---|---|---|---|
| Windows | `%APPDATA%\juling-harness` | `%LOCALAPPDATA%\juling-harness` | `%LOCALAPPDATA%\Programs\Juling Harness` |
| macOS | `~/Library/Application Support/juling-harness` | `~/Library/Application Support/juling-harness/runtimes`, `updates-v2` | `/Applications/Juling Harness.app` |
| Linux | `$XDG_CONFIG_HOME/juling-harness` (fallback `~/.config/juling-harness`) | `<state root>/runtimes`, `<state root>/updates-v2` | `/opt/Juling Harness` for deb, anywhere writable for AppImage |

Sessions, settings, workspace records and avatars stay in the user data directory. Installing, updating or uninstalling the desktop does not delete user projects.

## Common problems

**SmartScreen blocks the Windows Setup.** The Setup is not Authenticode-signed. Choose **More info → Run anyway**. Updates and Runtime artifacts are still verified against the signed Ed25519 catalog.

**macOS says the app is damaged or cannot be opened.** The build is ad hoc signed and not notarized. Use **Open Anyway** in Privacy & Security or the `xattr` command above. If the app was opened directly from the download location, move it to `/Applications` first; App Translocation prevents in-app updates.

**The Runtime will not connect.** Open **Diagnostics** and check the Runtime status. Reconnect, or restart the managed Runtime. If it still fails, read the Host log for the launch error. A missing or incompatible Runtime is not hidden as a fake connection.

**The model list is empty.** Confirm the provider is enabled, the endpoint and key are valid, and the roles reference models that the provider actually serves. The model configuration view distinguishes unverified providers from available ones.

**A source build cannot compile the Runtime.** Check that Bun and Rust are on `PATH`, that `npm run omp:install-deps` completed, and that Node is a native architecture binary. On macOS, a Node running under Rosetta builds the wrong native modules.

**Linux reports `No usable sandbox`, missing FUSE or `Operation not permitted`.** Follow [Linux](linux.md); do not work around it with `--no-sandbox` or by running the app as root.

**The preview window is titled "Electron".** That is expected for an unpackaged macOS preview. Packaged builds use the Juling Harness name and icon.

## Verify a source checkout

```powershell
npm run check                 # build + core regression tests
```

Full workspace tests (`npm test`), packaging tests (`npm run test:tooling`) and Runtime patch verification (`npm run omp:verify:patches`) are available when those areas change; they are not required just to run the app.

## Next

- [development.md](development.md) — inner loop, preview modes and patch regeneration
- [architecture.md](architecture.md) — what talks to what
- [linux.md](linux.md) — Linux requirements, sandbox, packaging and acceptance
- [updates.md](updates.md) — update verification, rollback and release channels
- [releasing.md](releasing.md) — tagging and Windows, macOS and Linux packages
