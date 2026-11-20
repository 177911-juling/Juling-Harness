# Architecture

Juling Harness is a desktop console in front of a **patched Juling Runtime**
(the `juling` binary built from the pinned `oh-my-pi` tree). The
GUI does not parse TUI text, ANSI, or key macros. Control goes through a
typed Harness Bridge.

```
Renderer (apps/renderer)
  → @juling-harness/client          HarnessClient + conversation reducer
  → transport-desktop           preload `window.julingHarness`
  → apps/desktop                ipc.ts
  → @juling-harness/host-client-api product facade
        ├─ Host-owned: session catalog, archive, models.yml,
        │              skills scan, git, workspace registry, system files
        └─ Runtime Bridge: harness-host
              → overlay packages/coding-agent/src/harness/**
```

## Packages

| Package | Responsibility |
|---|---|
| `@juling-harness/harness-protocol` | Bridge frames, command kinds, validators |
| `@juling-harness/client-contract` | Renderer-visible queries, commands, read models |
| `@juling-harness/client` | Client state machine, conversation reducer |
| `@juling-harness/host-client-api` | Facade: query/command → Host or Runtime |
| `@juling-harness/harness-host` | Runtime process, Bridge, ledger, catalog, telemetry |
| `@juling-harness/transport-desktop` | Fixed IPC channel names and validation |
| `@juling-harness/transport-web` | Optional local web transport |
| `@juling-harness/runtime-installer` | Signed artifact install / rollback |
| `@juling-harness/platform*` | Single-instance lock, Job Object, private endpoint |
| `@juling-harness/testkit` | Shared fixtures and contract suites |

Authoritative lists:

- Client operations: `packages/client-contract/src/operations.ts`
- Runtime command `kind`: `packages/harness-protocol/src/contracts/commands.ts`
- Facade dispatch: `packages/host-client-api/src/facade.ts`

## Invariants

- When prose and types disagree, **contracts win**.
- The renderer may call Host domain APIs only. It must never receive bridge
  tokens, process handles, or OMP session filesystem paths.
- Unknown mutations fail closed.
- `accepted` is not success. Only a terminal receipt commits a terminal
  outcome.
- Runtime loss fences the old epoch and maps unresolved accepted work to
  `outcome_unknown`.
- PTY bytes are not a control protocol.
- Workspace file operations resolve workspace-relative paths inside the Host
  and enforce containment. The file browser's `fs.*` operations explicitly
  accept user-selected absolute paths on the selected Host. `system-files.ts`
  is their execution and validation boundary; forwarding layers do not repeat
  validation. `workspace.openPath` registers an existing directory through
  the workspace service. Private Runtime paths are never exposed implicitly.
- Local and SSH Hosts share the same system-file service and file I/O. Only
  the local Electron composition injects a recycle-bin operation. Explicit
  `systemFile*` shell IPC actions are local-only, and Main resolves their
  paths before opening an application or the file manager.
- File documents and `omp-file:` resource leases carry their source and Host
  target. Files inside registered projects use workspace identities and
  share Explorer buffers; other files use the system backend with the same
  version conflicts, text formats, resource streaming and close confirmation.

## Runtime pin

`omp-patch/upstream.json` pins [oh-my-pi](https://github.com/can1357/oh-my-pi).
Harness-owned code lives in `omp-patch/overlay/`. Edits to upstream files are
five seam patches. See [`omp-patch/README.md`](../omp-patch/README.md).

`juling.exe` (`juling` on macOS/Linux) is the patched CLI/Runtime; the fifth
seam patch rebrands its app name, config directory (`.juling`, with `.omp` kept
readable for pre-rename installs) and user agent. `Juling Harness.exe` is the
Electron app.

## Historical notes

[`doc/BACKEND_FOUNDATION.md`](../doc/BACKEND_FOUNDATION.md) and
[`doc/FRONTEND_INTEGRATION.md`](../doc/FRONTEND_INTEGRATION.md) describe the
phase before the renderer landed. They are kept as archaeology. Prefer this
file and the TypeScript contracts.
