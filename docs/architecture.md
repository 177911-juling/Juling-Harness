# Architecture

Juling Harness 1.1.0 is the desktop console for **Juling Runtime 19.0.1**, the
patched `juling` binary built from the pinned `oh-my-pi` tree. The renderer never parses
TUI text, ANSI sequences or synthetic key presses. Every interaction crosses a typed
boundary: the React UI calls a client contract, Electron Main owns the process and
file authority, and the Runtime answers over the local Harness Bridge.

This document describes the five runtime layers, their ownership boundaries, the
wire protocol, the two-layer Runtime maintenance model, session and archive
storage, and signed updates. It is intended for contributors changing the
desktop, the Host or the Runtime fork; the authoritative definitions remain the
TypeScript contracts listed at the end.

## Five layers

| Layer | Primary code | Owns | Never does |
|---|---|---|---|
| React Renderer | `apps/renderer` | Workbench UI, composer, conversation reducer, view state, preview fixtures | Node APIs, filesystem access, Bridge tokens, process handles |
| Electron Main | `apps/desktop` | App lifecycle, single-instance lock, windows and native chrome, fixed IPC validation, Host composition, Runtime process containment, updates | Business reads that belong to the Host; exposing secrets or arbitrary IPC |
| Harness Host | `packages/harness-host` | Runtime resolution and launch, Bridge connection, command ledger, state projection, session catalog and archive, telemetry, workspace registry | Rendering, model prompting, TUI emulation |
| Harness Bridge | `packages/harness-protocol`, Host bridge client, Runtime bridge server | Authentication, framing, request/receipt correlation, snapshots, events, epoch fencing | Carrying a second control protocol or PTY semantics |
| Juling Runtime | `juling --mode harness-host`, overlay in `packages/coding-agent/src/harness/**` | Agent sessions, provider calls, tools, queues, modes, worktrees, Runtime-side time travel and archive reads | Drawing the desktop UI or trusting renderer-supplied identity |

```text
React Renderer (apps/renderer)
  @juling-harness/client              HarnessClient + conversation reducer
  @juling-harness/transport-desktop   preload window.julingHarness
        │  fixed IPC channels
Electron Main (apps/desktop)
  ipc.ts                              sender-bound validation
  @juling-harness/host-client-api     product facade
        ├─ Host-owned reads/writes: session catalog, archive, models.yml,
        │                           skills, Git, workspace registry, system files
        └─ Harness Host runtime session
              │  Harness Bridge (private local socket)
Juling Runtime (juling --mode harness-host)
  overlay packages/coding-agent/src/harness/**
```

The ordering is deliberate. The renderer sees one frozen preload object and a
small set of typed operations. Main binds each IPC call to the calling
`WebContents`; the renderer never supplies a window id, authority id or runtime
identity. The facade decides whether an operation is answered by Host-owned state
or forwarded through the Harness Host to the Runtime. Only the Host knows the
Bridge endpoint, token, process handle and session file paths.

A desktop launch brings the stack up in this order: current-user profile and
state directory, authority lock, private endpoint, `HostBackend`, trusted Runtime
resolution, then the Host facade. If any step fails, the window still opens in
read-only state; operations fail closed instead of fabricating a ready Runtime.
A second instance cannot become a second owner.

The same Host and Bridge stack can run on an SSH target as a signed remote
environment. The desktop reaches that Host through its remote transport, but the
Host, Bridge and Runtime boundaries are unchanged; see
[SSH workspaces](ssh-workspaces.md).

## Wire protocol

### Endpoint and authentication

Windows uses a per-launch named pipe. macOS and Linux use a Unix domain socket in
a private directory; macOS keeps the path short because `sun_path` is limited to
104 bytes including the terminator. The Bootstrap hands over an endpoint and a
one-time token file. The Runtime atomically claims and deletes the token file, so
a stale listener cannot reuse it.

The client sends `harness.hello` at pre-epoch `0` with supported protocol
versions and a random challenge. The Runtime answers with
`harness.hello.result`, a `runtimeInstanceId`, a positive `runtimeEpoch`, the
selected protocol version, its capability and command manifests, and an HMAC
challenge proof bound to the process-stable runtime identity. Reconnect requires
the same identity; a different process or epoch is rejected and fenced.

### Framing

A frame is a length-prefixed binary envelope:

```text
uint32be payloadLength
uint32be headerLength
headerLength bytes  JSON FrameHeader
remaining bytes     JSON body
```

`FrameHeader` carries `protocol` (`juling-harness`), `version` (currently `1`),
`frameId`, `runtimeEpoch` and `bodyLength`. The default control-frame limit is
1 MiB, including the JSON header. Image attachments have a separate bound derived
from that limit; oversized frames fail before reaching a model. Decoding is
stateful and fails closed on malformed lengths, invalid JSON or a body-length
mismatch.

### Messages and command lifecycle

After authentication the Host requests a snapshot and then consumes events.
Bodies include:

- `harness.request` — a typed operation with `requestId`, `runtimeEpoch`,
  optional expected state version and idempotency key.
- `harness.receipt` — `accepted`, then exactly one terminal status:
  `completed`, `rejected`, `failed` or `outcome_unknown`.
- `harness.snapshot` — authoritative Host projection plus the terminal receipt
  tail needed for reconciliation.
- `harness.event` — ordered Runtime events with `eventSeq`, `stateVersion` and
  `occurredAt`.
- `computer.query` / `computer.result` / `computer.event` — receipt-free
  computer-workspace reads and changes.
- `harness.locale` — a private display preference; it creates no receipt and
  advances no conversation sequence.

`accepted` is not success. The Harness Host records accepted and terminal
receipts in its command ledger. A terminal receipt is the only thing that commits
a terminal outcome. When the Runtime is lost, the Host fences the old epoch and
maps unresolved accepted work to `outcome_unknown`; it never silently replays a
mutation whose result is unknown.

Events carry a monotonic `eventSeq` and a `stateVersion`. A gap, a stale epoch or
a mismatched state version returns the connection to snapshot-required state.
Reconnect always takes a fresh snapshot rather than resuming from an assumed
cursor. PTY bytes are a separate terminal data path and are never treated as a
control protocol.

## Sessions and archive

The Host owns session discovery and history. The session catalog scans the
Runtime agent directory (default `~/.juling/agent/sessions`) and the cold archive
(default `~/.juling/agent/archive/sessions`), reading only bounded headers and
never returning filesystem paths to the renderer. It recognizes Harness-created
sessions, CLI sessions and pre-rename `studio` sessions, and reports skipped
symlinks, oversized files, corrupt entries and duplicate ids as diagnostics rather
than failing the whole list.

Single-session archive and unarchive are Host operations. Archive moves a
`.jsonl` session to the cold tree as level-9 `.jsonl.gz`, preserves the
sessions-relative layout and the artifacts directory, and stages the source under
an undiscoverable name before the destination lands. A session that is resident
in a Runtime, was written inside the write-grace window, belongs to another
workspace, exceeds the size limit or is blocked by `gc.lock` is refused. The OMP
Runtime is not involved in the move.

The archive reader serves transcripts from both live and compressed sessions. It
validates and trims crash tails, pages with opaque cursors, exposes branch and
time-travel projections, and bounds its read cache. Session deletion uses the
same Host ownership boundary: resident and cross-workspace sessions are refused,
the transcript and artifacts are removed together, and native cleanup runs only
after those checks.

For a live conversation, the Host keeps the session binding, Runtime epoch,
command ledger and conversation projection per thread. The renderer receives read
models and conversation events, not raw session files. A renderer reload rebinds
a client session over the same Host and Runtime; it does not stop the Runtime.

## Runtime pin: overlay and seam

`omp-patch/upstream.json` pins `can1357/oh-my-pi` at the commit for upstream
`19.0.1`. The current Harness patchset is recorded in
`omp-patch/patches/series.json`; this release line uses `19.0.1-harness.7`.
Harness changes to the pinned tree are split by file ownership, not by feature:

| Layer | Location | Contents |
|---|---|---|
| Overlay | `omp-patch/overlay/` | Files upstream does not have: `packages/coding-agent/src/harness/**` and the `harness-*` tests |
| Seam | `omp-patch/patches/*.patch` | The only edits to upstream-owned files, grouped by subsystem |

The overlay is ordinary tracked source. Editing it is an ordinary diff with no
patch number and no rebase conflict; an upstream bump cannot conflict with a path
upstream does not own. The seam is expressed as six patches:

| Patch | Upstream subsystem |
|---|---|
| `0001-harness-cli-entry.patch` | CLI entry, flags, configuration, launch help, package exports |
| `0002-harness-session-runtime.patch` | Session/queue persistence and control, registry, tasks/worktrees, archive, prediction |
| `0003-harness-modes-and-pause.patch` | Interactive/RPC modes, slash controls, pause, jobs, shared chart types |
| `0004-harness-extensibility.patch` | Extension/SDK hooks, tools/browser, service broker, media, stats and evaluation |
| `0005-juling-identity.patch` | Product identity: app name, config directory, user agent, CLI copy, native discovery roots |
| `0006-stats-dashboard.patch` | Statistics dashboard |

`scripts/omp-seam.mjs` holds the authoritative path list for each group.
Regeneration is the only supported producer of a `.patch`: `npm run
omp:overlay:apply` applies the overlay and seams, `npm run omp:patches:regen`
captures the result, and `npm run omp:verify:patches` proves the overlay does not
modify upstream-tracked files and that every patch applies cleanly.

Product identity belongs to seam `0005`: the executable is `juling.exe` on
Windows and `juling` on macOS and Linux, the config directory is `.juling`, and
the user agent is Juling-branded. Pre-rename installs remain readable: `~/.omp`,
project `.omp/` directories, `OMP_*`/`PI_*` environment variables and already
installed `omp.exe` artifacts still work, and nothing writes to them. The desktop
application is `Juling Harness.exe` (or the platform equivalent).

The root `@juling-harness/harness-protocol` package is the canonical wire
contract. Because the vendored Runtime is an independently installable Bun
workspace, the overlay mirrors only the minimal frame and hello subset it needs;
root fixtures and bidirectional tests remain the compatibility authority.

See [`omp-patch/README.md`](../omp-patch/README.md) for the maintenance
workflow. The feature-to-file map lives in the private development tree.

## Updates and signing

Desktop and Runtime versions are independent, but compatibility is checked
before activation. The Runtime artifact carries a signed installation manifest
covering platform, architecture, entrypoint, file checksums and protocol range.
Installation verifies the signature, checksums and entrypoint digest before
staging; activation records the version in `current.json`, and a failed start can
roll back to the previous verified Runtime. Packaged desktop builds verify the
bundled Runtime seed at packaging time and again on first activation.

Update manifests use Ed25519 signatures over the `juling-harness-update-v2`
domain. They name component, version, channel, architecture, sequence, compatible
protocol, artifact and blockmap digests. The updater verifies the manifest and
complete artifact after download and re-verifies before execution; mirrors change
only transport, never trust. Runtime discovery is per component, channel and
architecture, with an anti-rollback watermark. Canary is explicit, and the same
Runtime version cannot be published with different bytes or channels.

Differential downloads fall back to one full download when a baseline is missing,
corrupt or unsupported. Prepared artifacts live in a transaction file until the
user restarts. Startup failure restores a compatible previous Runtime when one
exists; otherwise diagnostics remain available. Desktop replacement is not an
atomic transaction on every platform, so the previous signed desktop remains
available for recovery.

User-facing update behavior, platform paths and recovery rules are documented in
[updates.md](updates.md) and
[updates-verification.md](updates-verification.md). Release production is in
[releasing.md](releasing.md). Release assets use the `Juling-Harness-*` naming
scheme.

## Contracts and invariants

- When prose and types disagree, **contracts win**.
- The renderer may call Host domain APIs only. It must never receive Bridge
  tokens, process handles, endpoints, PIDs or OMP session filesystem paths.
- Unknown mutations fail closed.
- `accepted` is not success. Only a terminal receipt commits a terminal outcome.
- Runtime loss fences the old epoch and maps unresolved accepted work to
  `outcome_unknown`.
- PTY bytes are not a control protocol.
- Workspace file operations resolve workspace-relative paths inside the Host and
  enforce containment. The file browser's `fs.*` operations explicitly accept
  user-selected absolute paths on the selected Host. `system-files.ts` is their
  execution and validation boundary; forwarding layers do not repeat validation.
  `workspace.openPath` registers an existing directory through the workspace
  service. Private Runtime paths are never exposed implicitly.
- Local and SSH Hosts share the same system-file service and file I/O. Only the
  local Electron composition injects a recycle-bin operation. Explicit
  `systemFile*` shell IPC actions are local-only, and Main resolves their paths
  before opening an application or the file manager.
- File documents and `omp-file:` resource leases carry their source and Host
  target. Files inside registered projects use workspace identities and share
  Explorer buffers; other files use the system backend with the same version
  conflicts, text formats, resource streaming and close confirmation.

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
| `@juling-harness/platform*` | Single-instance lock, process containment, private endpoint |
| `@juling-harness/testkit` | Shared fixtures and contract suites |

Authoritative lists:

- Client operations: `packages/client-contract/src/operations.ts`
- Runtime command `kind`: `packages/harness-protocol/src/contracts/commands.ts`
- Facade dispatch: `packages/host-client-api/src/facade.ts`

## Historical notes

Earlier phase notes are kept in the private development tree. Prefer this file, the
TypeScript contracts and [development.md](development.md) for current work.
