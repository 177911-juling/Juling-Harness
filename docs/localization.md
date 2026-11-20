# Localization

Juling Harness ships six interface locales — Chinese (`zh`), English (`en`),
Russian (`ru`), Japanese (`ja`), Korean (`ko`) and Hindi (`hi`) — plus a
`system` preference that resolves against the OS language. The React renderer
owns the locale dictionaries; Electron Main, Host-side descriptions and Runtime
processes receive the active language as a display preference so their generated
text does not stay in the previous locale.

This guide covers adding copy, reading the current locale, synchronizing it
across processes, invalidating localized caches, preserving drafts, and the
checks expected for a localization change. It is for contributors changing UI
copy or any surface that generates human-readable text outside the renderer.
[`development.md`](development.md) describes the normal development checks.

## Locales and fallback

`AppLanguage` is the stored preference: `system`, `zh`, `en`, `ru`, `ja`, `ko`
or `hi`. `resolvedLanguage` is the active dictionary key after `system` is
resolved. Detection checks the browser language prefix against those six codes
in that order and falls back to `en` when none matches.

Dictionary lookup uses this fallback chain:

| Selected locale | First lookup | Fallback | Last resort |
|---|---|---|---|
| `zh` | `zh` | `en` | key name |
| `en` | `en` | `zh` | key name |
| `ru`, `ja`, `ko`, `hi` | selected locale | `en` | key name |

Fallback keeps an incomplete interface usable; it does not make a locale
complete. A missing Russian string silently renders English, so review the
actual locale rather than assuming the page is translated.

The renderer's cross-process preference is currently binary at the process
boundary: Chinese selects the Chinese native and Runtime copy; every other
locale selects English. Native menus, tray items and Runtime-generated
descriptions therefore have `zh`/`en` variants even when the renderer is showing
Russian, Japanese, Korean or Hindi. Do not claim six-language coverage for those
surfaces until the helper types and variants are extended.

## Where copy lives

| Content | Treatment |
|---|---|
| Harness buttons, menus, headings, placeholders, tooltips and accessibility labels | Add the key to all six dictionaries in `apps/renderer/src/i18n/locales/` |
| Empty/loading states, status descriptions, validation messages, errors and disabled reasons | Localize at the layer that owns the message |
| Desktop dialogs, tray menus, notifications and Harness-owned Host/Runtime descriptions | Use that layer's existing locale helper |
| Preview labels and Harness-authored demo descriptions | Cover the preview path as well, including fixtures under `?preview=1&marks=off` |
| User text, model responses, file contents, terminal output and raw third-party errors or metadata | Keep the original content; localize only Harness's surrounding explanation |
| Paths, ids, command names, configuration keys and stored formats | Keep their stable values |

Reusable renderer copy belongs in the dictionaries. `zh.ts` defines the
`LocaleDictionary` shape; `en.ts`, `ru.ts`, `ja.ts`, `ko.ts` and `hi.ts` are
typed from it. Keep keys and interpolation names aligned across all six. The
current `i18n.test.ts` still pins key parity, placeholder parity and unexpected
Chinese characters for `zh`/`en` only; additions to the other four locales need
explicit review until that test is widened. The Chinese and Japanese autonyms
(`settings.general.langZh`, `settings.general.langJa`) are intentional exceptions
to the English dictionary's no-CJK check; the Korean autonym is Hangul.

An inline bilingual helper (`zh ? "…" : "…"`, `pickLocale()`, `isZh()`) may
remain in its owning surface, but it must evaluate the current locale during
render or call time. Do not compute translated module constants once. Inline
bilingual copy is also a boundary: non-Chinese locales see the English branch.
New shared copy should use `t()` and all six dictionaries rather than adding
another binary exception.

## Read the current language

Renderer components read the resolved locale through `useI18n()`:

```tsx
const { language, resolvedLanguage, t, setLanguage } = useI18n();
```

Pass `resolvedLanguage` (or the locale-dependent `t` function) into helpers that
build display values, menu entries, catalogs and search descriptions. Memo and
effect dependencies must include it whenever the result contains translated
text. A forced-language test or preview must stay consistent with its Provider
instead of silently reading global preferences.

For example:

```tsx
const { resolvedLanguage } = useI18n();
const catalog = useMemo(
  () => mergeSlashCatalogWithManifest(manifest, resolvedLanguage),
  [manifest, resolvedLanguage],
);
```

Non-React helpers use the existing layer-specific helpers: `desktopText` in
Electron Main services, `hostText` in Host adapters, and `runtimeText` in the
Runtime overlay. These helpers read `JULING_HARNESS_LOCALE` when called rather
than caching a module-level result. Use `isZh()` / `pickLocale()` only for
surfaces that genuinely have two variants; they cannot select Russian, Japanese,
Korean or Hindi copy.

## Cross-process synchronization

The renderer is the source of the user preference. Changing it updates display
labels immediately; the same preference is then propagated through the existing
path:

1. `I18nProvider` updates `document.documentElement.lang`, the window title and
   the desktop chrome language. Chrome currently receives `zh` or `en`; every
   other locale maps to `en`.
2. Main normalizes that value to a `DesktopLocale`, writes
   `process.env.JULING_HARNESS_LOCALE`, and notifies menu, tray and in-process
   consumers. A change affects future children and helpers that evaluate the
   variable per call.
3. The Host sends the Runtime-private `harness.locale` frame after
   authentication and negotiation, and only when the Runtime advertises the
   `harness.locale` capability. The frame is a display preference: it creates no
   receipt and advances no conversation event sequence.
4. An SSH Host receives `desktop.language.set` only when it advertises
   `desktop.language`. Only the attached desktop may change it; observers and
   the network side channel do not.
5. Initial connection, live switching and reconnect all use the latest locale.
   Synchronize it before localized reads that depend on it.

A legacy endpoint without the capability stays connected and receives no
unknown frame or method; record that limitation in the validation result rather
than dropping the connection. Changing `process.env.JULING_HARNESS_LOCALE` in
Main does not retroactively update an already-running Runtime unless the locale
frame or SSH method is sent through this path. Never restart a Runtime merely to
apply a display language.

Keep the single validation boundary used by the facade and transport.
Localization does not require another result/event validator or a duplicate
preload/facade input check. Runtime source edits follow the existing
[overlay and seam workflow](../omp-patch/README.md).

## Caches and localized values

Any cache that stores translated values needs a locale-aware key or explicit
invalidation when the language changes:

- Include `resolvedLanguage` in renderer memo keys, catalog keys and read-cache
  keys whose values contain labels or descriptions.
- A read started under the previous locale must not repopulate the current
  locale's cache. Keep the existing generation or epoch check around late
  completions.
- Raw-data caches need no language dimension when translation happens at render
  time. Do not add a locale key to data that contains no localized strings.
- Host model reads currently key on the `zh`/`en` choice because Host-generated
  copy has only those two variants. Switching between `en`, `ru`, `ja`, `ko` and
  `hi` therefore produces the same Host copy; switching between `zh` and any
  other locale must invalidate.
- Release language subscriptions with their owning view, service or Worker.

The same rule applies to derived search results, slash catalogs and menu entries:
they must be rebuilt when the locale changes, not only when their source data
changes.

## Preserve drafts and stored content

A language switch updates display labels without rewriting user content,
attachment identity or stored documents. The image convention illustrates the
boundary:

- Chinese displays `图N`; English displays `ImgN`.
- The canonical serialization marker stays `[图N]` so stored drafts and wire
  payloads do not change with the UI language.
- Readers accept both `[图N]` and `[ImgN]` when resolving references.
- Thumbnails keep their existing identity; changing labels must not remap disk
  or clipboard images.

Stored Composer documents need localized display labels too, not only plain-text
messages. Keep the same draft, selected images and user operation state while
updating the view. Do not remount a whole workspace, clear an editor or restart a
Runtime as a way to apply a language. UI language also does not select the
language of user prompts or model responses.

## Review and validation

Review the changed surface with **preview and real data paths**. Include menus,
empty/error/disabled states, tooltips and ARIA labels. Fixture-only screenshots
cannot establish real Host or Runtime coverage. For each locale you claim,
switch language on the **same mounted view** with relevant state present: an open
menu, a populated cache, a draft with images, a saved message or a connected
Runtime.

| Changed behavior | Acceptance evidence |
|---|---|
| Dictionary or UI copy | All six keys and placeholders present; the reviewed locale renders real copy, not English fallback; English layout remains usable at supported window sizes |
| Derived catalogs, fixtures or menus | Current copy after live switching; no page reload required |
| Localized read cache | A previously read surface changes language; a late old-locale read cannot restore stale copy |
| Composer or message image labels | Draft and saved labels change both ways; text, ids, bytes and reference mapping stay intact |
| Runtime/SSH synchronization | Initial, live and reconnect language on a capable endpoint; legacy endpoints stay connected without new messages |

Use the existing check entry point and select suites for the changed behavior.
These are scoped alternatives, not a checklist to run for every copy edit:

```powershell
# Dictionary changes: parity and existing Provider behavior.
npm run check -- --only renderer --suite i18n.test

# Draft/saved image display changes.
npm run check -- --only renderer --suite ChipComposer.test --suite UserMessageBody.test

# Localized shared reads or Bridge synchronization changes.
npm run check -- --only host-client-api --suite shared-reads.test
npm run check -- --only harness-host --suite host-foundation.test

# SSH control language changes.
npm run check -- --only desktop --suite remote-host.test --suite remote-transport.test
```

The default core list lives in `scripts/core-suites.mjs`; it does not include
`i18n.test.ts`, so run that suite explicitly for dictionary changes. Follow the
normal `npm run check -- --production` PR gate and the relevant Runtime checks
when applicable. Documentation-only changes need no source tests.

For new regressions, test observable language switching, cache freshness,
connection compatibility or preserved draft/image state. Reuse existing suites;
do not add a test per label, source-text greps or a global Chinese-character ban
over user or Host content.

In the PR, record the changed surface, preview/real coverage, switching scenario,
commands and results. State which platforms and real Runtime/SSH connections were
exercised; socket fixtures or test doubles alone do not establish macOS device or
real SSH acceptance. Document an unverified locale or path explicitly rather than
claiming complete coverage from dictionary tests.
