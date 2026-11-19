# Documentation

Public documentation for **Juling Harness 1.0.1** (Runtime 18.20.2, patchset `18.20.2-harness.18`).

Start with the [English overview](../README.md), [Chinese overview](../README.zh.md) or [Hindi overview](../README.hi.md), then pick the guide that matches what you are doing. All documents below describe the current product; the private development notes and feature-to-file map are not part of this repository.

## Install and operate

| Document | Contents |
|---|---|
| [Getting started](getting-started.md) | Install on Windows, macOS or Linux, connect the Runtime, and run the basic workflow |
| [Linux client](linux.md) | deb / AppImage, distribution baseline, sandbox requirements, in-app updates and uninstall |
| [Updates and verification](updates.md) | Update checks, Ed25519 manifests, differential downloads, restart install and rollback |
| [Releasing](releasing.md) | Versioning, changelog, tags, platform packaging and release checks |
| [Release operations](release-operations.md) | Signing keys, update catalogs, mirrors and artifact verification |

## Product guides

| Document | Contents |
|---|---|
| [Architecture](architecture.md) | Renderer, Main, Host, Harness Bridge and Runtime layers; overlay and seam maintenance |
| [Workbench docking](workbench-docking.md) | Dock regions, drag snapping, window controls, tab groups, pinning and layout restore |
| [File browser](file-browser.md) | Files outside the project, pinned folders, filters and local/SSH differences |
| [File viewer](file-viewer.md) | Editing, saving, diffs, find, multi-format preview and external-change conflicts |
| [Built-in browser](browser.md) | Native tabs, agent/human handoff, element selection, Console, Network and downloads |
| [SSH workspaces](ssh-workspaces.md) | Remote Runtime, directories, files, Git, terminal, reconnect and security boundaries |
| [tmux](tmux.md) | Attaching remote tmux sessions, windows, panes, layout and detach |
| [Computer use](computer-use.md) | Screen observation, action steps, stop controls and privacy boundaries |
| [Time Travel](time-travel.md) | Turn checkpoints, code/conversation restore, backups, storage and limits |
| [Dictation](dictation.md) | Native voice input, microphone access and session recovery |
| [BTW](btw.md) | Side-channel questions, topic history, images and subagents |
| [Settings](settings.md) | Settings groups, search and the scope each value is saved to |
| [Fonts](fonts.md) | Interface, terminal and output font preferences |
| [Model adaptation](model-adaptation.md) | Model parameter recommendations, provenance and catalog maintenance |
| [Evaluation](evaluation.md) | Benchmarks, instruction following, judgments, Ratchet and export |
| [Conversation width](conversation-width.md) | Reading-width rules for long conversations |

## Engineering

| Document | Contents |
|---|---|
| [Development](development.md) | Inner loop, build layout, tests and Runtime overlay workflow |
| [Localization](localization.md) | Six languages, dictionary and inline copy, cross-process sync, fallback and checks |
| [Performance](performance.md) | Streaming budgets, local counters, rollback and repeatable benchmarks |

## History

| Document | Contents |
|---|---|
| [Changelog](../CHANGELOG.md) | User-facing release history |
| [Contributing](../CONTRIBUTING.md) | How to send a change |
| [Security](../SECURITY.md) | Vulnerability reports |
| [Releases](releases/v0.2.2.md) | 0.1.10 – 0.2.2 release notes |
| [Runtime migrations](migrations/omp-18.20.2.md) | OMP 18.x migration reports and acceptance records |
| [GUI 18.4.4](gui-18.4.4.md) | Historical GUI scope for OMP 18.4.4 |
| [macOS integration 18.4.4](integration-18.4.4-macos.md) | Historical macOS integration and acceptance |
