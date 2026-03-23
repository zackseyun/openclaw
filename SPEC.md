# OpenClaw Localization Extraction and Locale Plugin Specification

Status: Draft v3
Owners: OpenClaw core maintainers
Last updated: 2026-03-22

---

## 1. Executive Summary

OpenClaw should extract localization out of the core repository and into an external localization monorepo that publishes **one installable artifact per language**.

Those language artifacts should be treated as **locale plugins** for packaging, install, versioning, provenance, validation, and discovery. However, they must **not** be forced through a single browser-only or runtime-only plugin model.

There are two major localization problems in OpenClaw today:

1. **Docs localization**
   - build-time concern
   - Mintlify + docs-script integration concern
   - solved by **materializing locale docs into a generated local docs workspace before docs build/checks**

2. **Gateway runtime localization**
   - covers user-facing strings emitted by the gateway stack itself
   - includes the browser Control UI, CLI, TUI, pairing replies, gateway auth/disconnect guidance, and gateway-owned plugin replies
   - solved by a **gateway runtime locale service** with:
     - browser-facing locale payload delivery for the Control UI
     - server-side locale catalogs for Node runtime string formatting

The key decision is:

> Locale packages are plugin artifacts, but OpenClaw must consume them through two integration paths: docs materialization and a gateway runtime locale service.

The gateway runtime locale service then has two consumers:

- the browser Control UI
- server-side gateway string emitters such as CLI, TUI, pairing flows, and plugin-generated replies

This keeps the useful part of the “translations as plugins” idea while matching the current codebase instead of fighting it.

---

## 2. Problem Statement

OpenClaw currently mixes four different concerns inside the core repository:

1. canonical English docs and canonical English gateway-owned user-facing strings
2. translated docs content
3. translation assets such as glossary and translation memory
4. translation workflow implementation details

This creates the following problems.

### 2.1 Drift and quality problems

English is the canonical source, but localized outputs drift as English docs and gateway-owned runtime strings evolve.

### 2.2 Repository weight and churn

The core repository carries translated trees and translation support files that many contributors and most users do not need.

### 2.3 Ownership confusion

The repo boundary does not clearly distinguish:

- canonical source content
- localized downstream artifacts
- workflow/tooling used to produce those artifacts

### 2.4 Architectural mismatch

OpenClaw’s current plugin system is primarily aimed at runtime capability registration, while localization is mostly a resource packaging and consumption problem.

### 2.5 No clean path for future AI-assisted localization

The current layout makes it difficult to improve or replace the translation workflow without mixing those changes into the same repo that owns canonical product logic and docs.

### 2.6 Important boundary

This specification is about:

- where localization lives
- what shape locale artifacts have
- how OpenClaw discovers and consumes them
- how to phase the migration safely

This specification is **not** primarily about:

- which translation provider is used
- how prompts are written
- whether translations are human, AI-assisted, vendor-produced, or hybrid

---

## 3. Research Basis and Current Evidence

This spec is grounded in current repository behavior and issue history.

## 3.1 External issue history

### Issue #3460

GitHub URL: https://github.com/openclaw/openclaw/issues/3460

This is the canonical maintainers’ issue for i18n and localization support. It explicitly states that:

- translation support needs a real architecture first
- quality and review matter
- docs, error messages, and UI need coordinated treatment
- maintainers are not ready to accept ad-hoc translation PRs without that architecture

### Issue #6995

GitHub URL: https://github.com/openclaw/openclaw/issues/6995

This issue captures the current maintainers’ feedback loop for Chinese translations. It explicitly asks contributors to file translation problems in one place instead of submitting many small translation PRs, because improving the pipeline centrally is more effective.

That directly supports the design principle that **artifact format and consumption should be stable, while the translation workflow should be replaceable and improvable over time**.

### PR #51877

GitHub URL: https://github.com/openclaw/openclaw/pull/51877

Related local history already examined during research includes:

- commit `4f1e12a2b1` — `Docs: prototype generated plugin SDK reference (#51877)`

This matters because it reinforces a broader repo trend: docs generation and derived docs artifacts are already a normal concept in this codebase.

## 3.2 Current source evidence

The following repo surfaces are the primary evidence base for this specification.

### Plugin install and discovery

- `src/plugins/install.ts`
- `src/plugins/install.test.ts`
- `src/plugins/discovery.ts`
- `src/plugins/manifest.ts`
- `src/plugins/manifest-registry.ts`
- `docs/plugins/manifest.md`
- `docs/tools/plugin.md`
- `docs/plugins/architecture.md`

### Docs build and docs localization

- `docs/docs.json`
- `scripts/docs-list.js`
- `scripts/docs-link-audit.mjs`
- `scripts/check-docs-i18n-glossary.mjs`
- `docs/.i18n/README.md`
- `scripts/docs-i18n/main.go`
- `scripts/docs-i18n/doc_mode.go`
- `scripts/docs-i18n/process.go`
- `scripts/docs-i18n/prompt.go`
- `scripts/docs-i18n/tm.go`
- `scripts/docs-i18n/translator.go`
- `scripts/docs-i18n/pi_command.go`
- `scripts/docs-i18n/pi_rpc_client.go`
- `scripts/docs-i18n/util.go`
- `docs/zh-CN/AGENTS.md`

### Control UI localization

- `ui/src/i18n/lib/types.ts`
- `ui/src/i18n/lib/registry.ts`
- `ui/src/i18n/lib/translate.ts`
- `ui/src/i18n/locales/en.ts`
- `ui/vite.config.ts`
- `src/gateway/control-ui.ts`
- `src/gateway/control-ui-contract.ts`
- `ui/src/ui/controllers/control-ui-bootstrap.ts`
- `ui/src/ui/views/overview.ts`

### Packaging and published surface

- `package.json`
- `docs/.generated/README.md`
- `src/infra/control-ui-assets.ts`

## 3.3 Verified current constraints

### Constraint A: native plugin install currently expects runtime entry metadata

Verified facts:

- `src/plugins/install.ts` rejects packages missing `package.json` `openclaw.extensions`
- `src/plugins/install.test.ts` explicitly tests that packages without `openclaw.extensions` are rejected
- `src/plugins/discovery.ts` discovers plugins from extension entries, bundle manifests, or fallback `index.*` patterns
- `docs/plugins/manifest.md` treats `openclaw.plugin.json` as manifest metadata, not package entrypoint metadata

Consequence:

- **true resource-only locale packages are not a first-class install shape today**
- v1 needs a **transitional package shape** if locale packages must install via the standard plugin install flow immediately

### Constraint B: docs build is repo-local and static today

Verified facts:

- docs live under `docs/**`
- translated docs currently live under `docs/zh-CN/**` and `docs/ja-JP/**`
- docs nav is hardcoded in `docs/docs.json`
- repo scripts such as `scripts/docs-list.js`, `scripts/docs-link-audit.mjs`, and `scripts/check-docs-i18n-glossary.mjs` operate on local `docs/**`

Consequence:

- Mintlify and current docs scripts do **not** directly consume locale resources from arbitrary plugin install roots
- docs localization needs a **materialization/sync step**

### Constraint C: Control UI localization is only partially localized and still structurally static today

Verified facts:

- `ui/src/i18n/lib/types.ts` uses a static `Locale` union today
- `ui/src/i18n/lib/registry.ts` hardcodes supported locales and lazy imports
- `ui/src/i18n/lib/translate.ts` loads translations from static local modules
- `ui/vite.config.ts` builds a fixed `dist/control-ui`
- `src/gateway/control-ui.ts` serves static built UI assets
- many Control UI surfaces still bypass the existing translation maps with direct English strings, including:
  - `ui/src/ui/views/nodes.ts`
  - `ui/src/ui/views/sessions.ts`
  - `ui/src/ui/views/channels.imessage.ts`
  - `ui/src/ui/views/agents-panels-status-files.ts`
  - `ui/src/ui/controllers/devices.ts`

Consequence:

- the browser cannot directly discover and import translation files from installed plugin directories
- Control UI localization is both a **delivery problem** and an **English-string migration problem**

### Constraint D: gateway runtime strings outside the browser do not have a localization system today

Verified facts:

- core gateway/user-facing Node strings are emitted directly from files such as:
  - `src/pairing/pairing-messages.ts`
  - `src/tui/tui.ts`
  - `src/tui/gateway-chat.ts`
  - `src/cli/nodes-cli/register.pairing.ts`
- plugin runtime messages also emit direct English strings today, for example:
  - `extensions/nostr/src/channel.ts`
  - `extensions/zalouser/src/channel.ts`
- there is no shared server-side locale catalog loader or formatter for CLI, TUI, pairing, or plugin reply strings

Consequence:

- focusing only on the browser would localize only one subset of user-facing gateway strings
- the runtime design must cover **server-side string formatting**, not just browser locale payload delivery

### Constraint E: docs and gateway runtime localization are not the same integration problem

Consequence:

- one artifact model is desirable
- one identical loading path is not

---

## 4. Goals

1. Move localization artifacts out of the core repository.
2. Use one external localization monorepo to coordinate all languages.
3. Publish one installable artifact per language, such as German only.
4. Preserve English as the canonical source for docs and for all gateway-owned user-facing strings.
5. Keep the locale artifact contract stable regardless of whether translation is human, vendor, AI-assisted, or hybrid.
6. Reuse the existing plugin ecosystem where practical for package install, validation, versioning, provenance, and discovery.
7. Avoid forcing docs and gateway runtime localization through the same incorrect loading path.
8. Cover **most user-facing gateway strings**, not only the Control UI.
9. Provide a path to localize at least these runtime surfaces:
   - Control UI
   - CLI and TUI
   - pairing and auth/disconnect guidance
   - gateway-generated plugin/channel reply strings
10. Make default development and CI workable without requiring every locale artifact.
11. Phase the migration so docs extraction can land before broad runtime localization if needed.
12. Produce a spec that is concrete enough for implementation handoff, not just architecture discussion.

---

## 5. Non-Goals

1. This spec does not define the full AI translation workflow.
2. This spec does not require a specific translation provider or vendor.
3. This spec does not require every locale to be complete.
4. This spec does not require direct browser loading from plugin install directories.
5. This spec does not require Mintlify or docs scripts to read locale resources directly from plugin roots.
6. This spec does not redesign the entire plugin system beyond what is necessary to support locale packages.
7. This spec does not require v1 to land first-class resource-only locale package installs.
8. This spec does not require translated docs to remain source-owned in the core repository.
9. This spec does not make locale packages the canonical owner of docs information architecture.
10. This spec does not cover native iOS, macOS, or Android app localization.

---

## 6. Terminology

### 6.1 Locale package

One installable artifact for one language, published from the external localization monorepo.

### 6.2 Locale plugin

The plugin-compatible shape used to install, discover, validate, and inspect a locale package within OpenClaw.

In this specification, “locale package” and “locale plugin” refer to the same artifact viewed from different sides:

- **package** = publication/install perspective
- **plugin** = OpenClaw discovery/validation perspective

### 6.3 Docs materialization

The build-time process that copies validated locale docs resources into the local docs workspace shape expected by Mintlify and existing docs scripts.

### 6.4 Control UI locale delivery

The runtime process where the gateway exposes locale metadata and translation payloads over HTTP and the browser fetches them on demand.

### 6.5 Gateway runtime locale service

The runtime process where the gateway loads server-side locale catalogs from installed locale packages and formats user-facing strings for CLI, TUI, pairing, auth/disconnect guidance, and gateway-generated replies.

---

## 7. Main Design Decisions

### Decision 1: one external localization monorepo

Use one external localization monorepo with one package per language.

Reason:

- shared tooling and validation can be centralized
- each language remains independently installable
- maintainers can update many locales together when needed

### Decision 2: one artifact model, two consumption paths

Use one locale package model, but consume it differently for docs and gateway runtime localization.

- docs → materialization
- gateway runtime → gateway runtime locale service

### Decision 3: English stays canonical in core

Core owns canonical English docs and canonical English gateway-owned user-facing strings.

### Decision 4: docs v1 uses a generated docs workspace

Docs localization should materialize generated locale files into a separate generated docs workspace before docs build and docs checks.

### Decision 5: gateway runtime v1 uses a shared gateway locale service

Control UI locale packs should be fetched from the gateway, not baked into the browser via static imports.

Server-side gateway strings should be formatted through the same installed locale packages via a server-side runtime locale catalog loader.

### Decision 6: v1 uses a transitional install shape if needed

Locale packages may need a minimal no-op runtime entry because current plugin install still requires `openclaw.extensions`.

---

## 8. System Overview

## 8.1 Components

### 8.1.1 Core Source Repository

Responsibilities:

- canonical English docs
- canonical English gateway-owned user-facing strings
- locale package contract definitions
- locale validation logic
- docs materialization logic
- gateway runtime locale service logic

### 8.1.2 External Localization Monorepo

Responsibilities:

- one package per language
- shared packaging and validation tooling
- glossary, translation memory, provenance, and optional authoring tooling

### 8.1.3 Locale Package

Responsibilities:

- declare locale identity and compatibility
- ship docs resources, browser Control UI resources, server-side runtime catalogs, or any valid combination of those
- pass validation

### 8.1.4 Docs Materializer

Responsibilities:

- discover installed locale packages
- validate docs resources
- generate a separate docs workspace such as `docs/.generated/locale-workspace/**`
- generate final docs nav configuration used by Mintlify and docs scripts inside that workspace

### 8.1.5 Gateway Runtime Locale Service

Responsibilities:

- discover installed locale packages with runtime resources
- validate Control UI payloads and server-side runtime catalogs independently
- expose browser locale resources to the Control UI
- provide server-side string formatting for CLI, TUI, pairing, auth/disconnect guidance, and other gateway-owned messages

### 8.1.6 Control UI Locale Client

Responsibilities:

- fetch locale metadata and payload URLs from the gateway
- fetch locale payload for the active locale
- fall back to English when locale or keys are missing

### 8.1.7 Server-Side Runtime String Consumers

Responsibilities:

- resolve the effective locale for one runtime surface
- format localized strings through the gateway runtime locale service
- fall back to English when locale packages or keys are missing

## 8.2 External dependencies

- npm or equivalent package distribution
- existing plugin installation and discovery paths
- Mintlify docs build and `docs/docs.json` consumption
- gateway HTTP serving for Control UI

Failure characteristics:

- package registry may be unavailable
- locale package may be missing or invalid
- docs builds may run without locale packages installed
- browser may request a locale that is not currently installed

---

## 9. Locale Artifact Contract

## 9.1 Identity

Each locale package has:

- `pluginId` (string)
- `locale` (string, exact identifier such as `de`, `zh-CN`, `ja-JP`)
- `version` (string)
- `resourceKinds` (string array)
- `compatibility` (object)
- optional provenance metadata
- optional docs resources
- optional browser Control UI resources
- optional server-side runtime catalogs

## 9.2 `openclaw.plugin.json`

Locale packages extend the native plugin manifest with a new optional `localization` block.

Illustrative example:

```json
{
  "id": "locale-de",
  "name": "German Locale Pack",
  "version": "1.0.0",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  },
  "localization": {
    "locale": "de",
    "resourceKinds": ["docs", "control-ui", "runtime", "meta"],
    "docsRoot": "./resources/docs/de",
    "docsNavPath": "./resources/docs-nav.de.json",
    "controlUiTranslationPath": "./resources/control-ui/de.json",
    "runtimeTranslationPath": "./resources/runtime/de.json",
    "provenancePath": "./resources/provenance.json",
    "sourceManifestPath": "./resources/source-manifest.json",
    "completeness": {
      "docsCoverage": "partial",
      "controlUiCoverage": "full",
      "runtimeCoverage": "partial"
    },
    "compatibility": {
      "minOpenClawVersion": ">=2026.3.0",
      "docsSchemaVersion": "1",
      "controlUiSchemaVersion": "1",
      "runtimeSchemaVersion": "1"
    }
  }
}
```

## 9.3 Manifest fields

### Required base plugin fields

- `id`
- `configSchema`

### Required localization fields when `localization` exists

- `localization.locale`
- `localization.resourceKinds`

### Conditionally required localization fields

If `resourceKinds` includes `docs`, require:

- `localization.docsRoot`
- `localization.docsNavPath`

If `resourceKinds` includes `control-ui`, require:

- `localization.controlUiTranslationPath`

If `resourceKinds` includes `runtime`, require:

- `localization.runtimeTranslationPath`

### Optional localization fields

- `localization.provenancePath`
- `localization.sourceManifestPath`
- `localization.completeness`
- `localization.compatibility`

## 9.4 Transitional `package.json` requirement

Because current install flow requires `package.json` `openclaw.extensions`, locale packages in v1 must also ship a plugin-install-compatible package shape.

Transitional rule:

- locale packages **must** declare `openclaw.extensions` in `package.json` for v1
- the referenced entry may be a minimal no-op runtime module

This is a rollout constraint, not the ideal final design.

## 9.5 Recommended package layout

Recommended v1 layout:

- `openclaw.plugin.json`
- `package.json`
- `dist/noop.js` or equivalent minimal runtime entry
- `resources/docs/<locale>/**`
- `resources/docs-nav.<locale>.json`
- `resources/control-ui/<locale>.json`
- `resources/provenance.json`
- `resources/source-manifest.json`
- optional `resources/glossary.<locale>.json`

## 9.6 Source manifest

`sourceManifestPath` is optional but recommended.

Purpose:

- preserve drift/provenance information without tying runtime loading to a specific translation workflow
- allow CI or locale diagnostics to report how stale a locale package is relative to English sources

Illustrative `source-manifest.json` shape:

```json
{
  "sourceRevision": "4f1e12a2b1",
  "docs": {
    "index": "sha256:...",
    "start/getting-started": "sha256:..."
  }
}
```

Loading rules:

- source manifest is **informational** in v1
- stale or absent source manifest must not block locale loading unless future policy explicitly opts in

---

## 10. Docs Localization Design

## 10.1 Why docs need a separate design

Current docs systems assume repo-local files and a repo-local nav file.

Therefore docs localization is a **materialization problem**, not a runtime plugin loading problem.

## 10.2 V1 docs source of truth and generated outputs

### Canonical source-owned files

English docs remain source-owned in core:

- `docs/**` English content
- current source docs configuration in `docs/docs.json`
- optional future canonical config in `docs/docs.source.json`

For the proof-of-concept and early rollout, the important boundary is not the file name split; it is the ownership split:

- source-owned docs stay under `docs/**`
- generated multilingual outputs must be written into a separate generated workspace

### Generated, non-source-owned outputs

Docs locale materialization generates a separate workspace, for example:

- `docs/.generated/locale-workspace/**`
- `docs/.generated/locale-workspace/docs.json`

Normative rule:

- generated locale docs and generated docs config must not overwrite source-owned docs paths during the proof-of-concept or migration phases

## 10.3 Docs materialization algorithm

Before multilingual docs build/checks, run docs locale sync/materialization.

Algorithm:

1. read canonical English docs from `docs/**`
2. read canonical docs config from `docs/docs.source.json` if present, otherwise derive an English-only canonical config from source-owned `docs/docs.json`
3. discover installed locale packages
4. filter locale packages with `resourceKinds` including `docs`
5. validate docs roots, locale ids, filesystem boundaries, and docs nav metadata
6. rebuild the generated docs workspace from scratch
7. copy canonical English docs into the generated workspace
8. copy locale pages into generated workspace locale paths such as `docs/.generated/locale-workspace/<locale>/**`
9. generate merged locale-aware docs config inside the generated workspace
10. run docs checks and Mintlify against the generated docs workspace

## 10.4 Docs materialization outputs are not committed

Normative rule:

- generated locale docs and generated docs config must not be treated as source-edited artifacts
- contributors should not hand-edit generated locale docs in the core repo
- the materializer must not delete or overwrite source-owned locale trees in place during the proof-of-concept or migration phases

## 10.5 Default developer workflow

### English-only docs workflow

Default clone and default docs work should remain English-only.

Expected behavior:

- English docs development works without installing any locale packages
- default docs CI should be able to run in English-only mode

### Multilingual docs workflow

A multilingual docs workflow should explicitly materialize locales first and run docs tools against the generated workspace.

Illustrative commands:

```bash
openclaw plugins install @openclaw/locale-zh-cn
openclaw locales sync-docs
pnpm docs:dev:locales
```

Other reproducible multilingual helper commands may include locale-aware `docs:list` and `docs:check-links` wrappers.

## 10.6 Docs CI workflow

Docs CI should support two profiles.

### Profile A: English-only docs CI

- no locale packages installed
- no locale materialization
- validates canonical English docs only

### Profile B: multilingual docs publish or validation CI

- install required locale packages
- run docs locale sync/materialization
- run docs helper commands against the generated workspace
- run Mintlify against the generated workspace

This split is required so locale extraction does not burden all normal CI paths.

## 10.7 Docs nav policy

### V1 policy

Locale packages may ship locale-specific nav fragments.

The materializer may merge those fragments into generated `docs/docs.json`.

### Long-term direction

English navigation structure should remain canonical.

Locale packages should eventually provide translated labels and coverage data more than independent information architecture.

### Important boundary

Locale nav fragments are a **v1 compatibility mechanism**, not the ideal permanent ownership model.

## 10.8 Missing page behavior

V1 rule:

- if a localized page is missing, it is **omitted from locale nav**
- **automatic route fallback to English is not required in v1**
- direct requests to missing localized routes may 404

This is intentionally simple and avoids mixed-language docs pages being silently synthesized.

## 10.9 Filesystem safety rules for docs materialization

The docs materializer must enforce all of the following:

- locale id must be validated as a safe locale identifier before any filesystem path joins
- locale docs root and docs nav file must resolve inside the locale package root after realpath resolution
- docs resources must not contain symlinks that resolve outside the locale package root
- generated outputs may only be deleted inside the generated workspace root
- source-owned docs trees must never be removed as part of sync

## 10.10 Docs validation rules

Validate all of the following:

- docs root exists
- every materialized docs path stays inside the package root
- every nav page exists in the locale docs tree
- locale pages stay under the locale namespace
- generated docs config references only files that exist after materialization

## 10.11 Existing docs i18n asset migration

The following current core-repo assets should move out of core over time into the localization monorepo or be replaced by locale-package build tooling:

- `docs/zh-CN/**`
- `docs/ja-JP/**`
- `docs/.i18n/**`
- `scripts/docs-i18n/**`
- zh-CN-specific glossary checks that only make sense when zh-CN is repo-owned

Core may retain thin validation utilities, but the existing translation-production pipeline should no longer be a required core-repo responsibility.

---

## 11. Gateway Runtime Localization Design

## 11.1 Scope boundary

This section covers **gateway-owned runtime strings** only.

In scope:

- Control UI browser strings
- CLI output
- TUI output
- pairing and approval messages
- gateway auth and disconnect guidance
- gateway-generated plugin or channel reply strings

Out of scope:

- native iOS, macOS, and Android app localization
- docs build-time materialization details beyond how runtime locale packages are shared with docs packages

## 11.2 Current audited runtime surfaces

The repo currently has three different runtime string situations.

### 11.2.1 Control UI is partially localized but incomplete

The Control UI already has a translation mechanism under `ui/src/i18n/**`, but significant user-facing strings still bypass it.

Representative examples found during this audit:

- `ui/src/ui/views/nodes.ts`
- `ui/src/ui/views/sessions.ts`
- `ui/src/ui/views/channels.imessage.ts`
- `ui/src/ui/views/agents-panels-status-files.ts`
- `ui/src/ui/controllers/devices.ts`

These files currently emit direct English labels such as device approval actions, session table labels, status cards, and confirmation prompts.

### 11.2.2 Server-side gateway strings have no locale system

Representative examples found during this audit:

- `src/pairing/pairing-messages.ts`
- `src/tui/tui.ts`
- `src/tui/gateway-chat.ts`
- `src/cli/nodes-cli/register.pairing.ts`

These files emit direct English strings for pairing replies, disconnect hints, auth resolution errors, and CLI status/help output.

### 11.2.3 Gateway-owned plugin replies can still emit direct English strings

Representative examples found during this audit:

- `extensions/nostr/src/channel.ts`
- `extensions/zalouser/src/channel.ts`

This means a locale solution that only fixes core browser strings is insufficient. Gateway-owned plugin replies also need a migration path.

## 11.3 Pairing as the canonical cross-surface example

Pairing is the clearest example of why runtime localization must be broader than the Control UI.

Today pairing-related user-facing strings appear in all of these gateway-owned surfaces:

- Control UI device approval views and dialogs
- server-generated pairing reply text
- TUI disconnect and recovery hints
- CLI pairing status output
- plugin approval notifications

Normative conclusion:

- the runtime architecture must support one locale package being consumed by both browser and server-side runtime surfaces
- pairing should be used as an early migration slice because it exercises multiple surfaces at once

## 11.4 Runtime model

At startup, the gateway runtime locale service:

1. discovers installed locale packages
2. validates each package's runtime resources independently by resource kind
3. loads browser Control UI payload metadata for packages that declare `control-ui`
4. loads server-side runtime catalogs for packages that declare `runtime`
5. exposes browser locale resources to the Control UI
6. exposes a server-side string formatting API to gateway runtime code

English remains built into core as the canonical fallback for both browser and server-side runtime strings.

## 11.5 Locale package runtime resource contract

### 11.5.1 Resource kinds

Runtime-relevant locale packages may declare any of these resource kinds:

- `control-ui`
- `runtime`
- `meta`

A package may ship:

- only browser resources
- only server-side runtime catalogs
- both browser and server-side runtime resources

### 11.5.2 Required runtime fields

If `resourceKinds` includes `control-ui`, require:

- `localization.controlUiTranslationPath`

If `resourceKinds` includes `runtime`, require:

- `localization.runtimeTranslationPath`

### 11.5.3 Illustrative server-side runtime catalog shape

Illustrative example:

```json
{
  "schemaVersion": 1,
  "locale": "de",
  "translations": {
    "runtime": {
      "pairing": {
        "accessNotConfigured": "OpenClaw: Zugriff ist nicht eingerichtet.",
        "pairingCode": "Kopplungscode: {code}",
        "approveWith": "Bitte den Bot-Besitzer freigeben lassen mit:",
        "noPendingRequests": "Keine ausstehenden Kopplungsanfragen."
      },
      "gateway": {
        "disconnectPairingRequired": "Kopplung erforderlich. Führe `openclaw devices list` aus, genehmige deine Anfrage und verbinde dich dann erneut."
      },
      "cli": {
        "missingGatewayAuth": "Fehlende Gateway-Anmeldedaten."
      }
    }
  }
}
```

Normative rules:

- server-side runtime catalogs must be JSON objects
- keys must be stable logical identifiers, not English source strings
- placeholder substitution syntax must be deterministic and documented by the runtime formatter
- missing keys must fall back to core English

## 11.6 Locale selection rules by surface

### 11.6.1 Control UI

Selection priority:

1. explicit user setting if still installed and valid
2. previously stored setting if still installed and valid
3. browser locale match if installed
4. English fallback

### 11.6.2 CLI and TUI

Selection priority:

1. explicit CLI flag if the command provides one
2. `OPENCLAW_LOCALE` environment variable, if present and valid
3. gateway or workspace-level configured default locale, if the product later adds one
4. system locale best match
5. English fallback

V1 note:

- the spec requires the runtime formatting API to support an explicit locale parameter
- adding user-facing CLI flags may be phased by command family rather than landed everywhere at once

### 11.6.3 Gateway-generated replies and notices

Selection priority:

1. explicit locale carried by the current runtime context, if available
2. channel, device, or account locale if available
3. gateway default locale if available
4. system locale best match
5. English fallback

Normative rule:

- if no trustworthy locale signal exists, the runtime must emit English rather than guessing aggressively

## 11.7 Server-side runtime API

The gateway runtime must gain a server-side localization API.

Minimum responsibilities:

- resolve an effective locale for one operation
- format a localized message by stable key
- substitute placeholders deterministically
- fall back to English when locale packages or keys are missing
- expose enough diagnostics to explain why a fallback occurred

Normative direction:

- all new or newly-migrated gateway-owned user-facing strings must go through this API
- the API must be usable from core runtime code and from gateway-owned plugins
- direct English string literals should be treated as migration debt once an equivalent key exists

## 11.8 Control UI delivery contract

The browser still cannot read plugin directories directly.

Therefore the gateway must expose browser locale resources over authenticated same-origin HTTP.

Normative direction:

- Control UI bootstrap data should include installed locale entries and payload URLs, or an equivalent same-origin discovery mechanism
- locale payload fetches must remain behind the same auth boundary as other Control UI support endpoints
- missing locale payloads or invalid payloads must not break UI startup; the UI must remain usable in English

## 11.9 Migration priorities for runtime strings

The runtime migration should not begin by trying to translate every string in one pass.

Priority order:

1. pairing, approval, and auth/disconnect guidance
2. Control UI screens that are already meant for operators and contain clear hardcoded English today
3. CLI and TUI status/help output
4. gateway-owned plugin reply strings
5. broader long-tail runtime strings

## 11.10 Initial migration targets found during this audit

Representative high-value migration targets include:

### Control UI

- `ui/src/ui/views/nodes.ts`
- `ui/src/ui/views/sessions.ts`
- `ui/src/ui/views/channels.imessage.ts`
- `ui/src/ui/views/agents-panels-status-files.ts`
- `ui/src/ui/controllers/devices.ts`

### Server-side gateway runtime

- `src/pairing/pairing-messages.ts`
- `src/tui/tui.ts`
- `src/tui/gateway-chat.ts`
- `src/cli/nodes-cli/register.pairing.ts`

### Gateway-owned plugins

- `extensions/nostr/src/channel.ts`
- `extensions/zalouser/src/channel.ts`

## 11.11 Validation and recovery

Normative rules:

- invalid browser locale payloads must not poison server-side runtime catalogs
- invalid server-side runtime catalogs must not prevent docs materialization for the same locale package if docs resources are valid
- invalid locale packages must surface diagnostics, but English fallback must keep the gateway usable
- the runtime locale registry must be rebuildable from installed locale packages at startup without persistent cache requirements

## 12. Compatibility and Install Model

## 12.1 Standard install UX

Locale packages should be installable independently through the normal plugin install workflow.

Illustrative examples:

```bash
openclaw plugins install @openclaw/locale-de
openclaw plugins install @openclaw/locale-zh-cn
```

## 12.2 Docs tooling UX

Docs builds may require an additional sync/materialization step.

Illustrative example:

```bash
openclaw locales sync-docs
```

This may be a new CLI namespace or a docs-specific subcommand. Exact naming is implementation-defined.

## 12.3 Compatibility rules

V1 compatibility is determined by:

- `minOpenClawVersion`, if present
- `docsSchemaVersion`, if docs resources are present
- `controlUiSchemaVersion`, if Control UI resources are present
- `runtimeSchemaVersion`, if server-side runtime catalogs are present

V1 does **not** require exact English-source commit match for locale loading.

If `sourceManifestPath` exists, it may be used for diagnostics and drift reporting only.

---

## 13. Migration Plan

## 13.1 Phase order

### Phase 1

- locale package manifest contract
- transitional install shape
- external localization monorepo
- docs materialization
- remove repo-owned translated docs from the canonical source path

### Phase 2

- gateway runtime locale service foundation
- browser locale delivery for the Control UI
- server-side locale catalog loading for gateway-owned strings
- migrate high-signal user-facing strings first, especially pairing and auth/disconnect guidance

### Phase 3

- broaden runtime coverage across more Control UI, CLI, TUI, and gateway-owned plugin reply surfaces
- add a plugin/runtime seam for localized gateway-generated reply strings
- optionally evaluate first-class resource-only locale packages
- optionally clean up the transitional no-op runtime entry requirement

### Phase 4

- AI-assisted and centralized regeneration workflows

## 13.2 Concrete v1 migration steps

1. Add `localization` block support to plugin manifest handling.
2. Create one external locale package, preferably `zh-CN` first because it already has the most existing assets.
3. Move or recreate current zh-CN translation assets in the localization monorepo.
4. Implement docs locale materializer using a generated workspace such as `docs/.generated/locale-workspace`.
5. Update docs build/check flows to run against generated outputs when multilingual mode is requested.
6. Optionally introduce a canonical docs config split later if that becomes useful (`docs/docs.source.json` plus generated config inside the workspace).
7. Remove `docs/zh-CN/**` and `docs/ja-JP/**` from source ownership in core.
8. Later implement the broader gateway runtime locale service, including Control UI delivery and server-side runtime catalogs.

## 13.3 Current asset disposition

### Move out of core over time

- `docs/zh-CN/**`
- `docs/ja-JP/**`
- `docs/.i18n/**`
- `scripts/docs-i18n/**`

### Likely retained in core

- canonical English docs under `docs/**`
- docs validation scripts that are still English-core-specific
- locale discovery/validation and runtime consumption logic

---

## 14. Likely Implementation Touchpoints

This section is intentionally concrete so a developer can start from real files.

## 14.1 Core repo touchpoints for Phase 1

### Plugin manifest and discovery

- `src/plugins/manifest.ts`
- `src/plugins/manifest-registry.ts`
- `src/plugins/discovery.ts`
- `src/plugins/install.ts`
- `src/plugins/install.test.ts`
- `src/cli/plugins-install-command.ts`

### Docs materialization and docs config

- `docs/docs.json` source-owned input for early rollout
- optional future `docs/docs.source.json`
- generated workspace such as `docs/.generated/locale-workspace/**`
- `scripts/docs-list.js`
- `scripts/docs-link-audit.mjs`
- likely new scripts under `scripts/` for locale sync/materialization
- possible docs CI/workflow updates under `.github/workflows/`

## 14.2 Core repo touchpoints for Phase 2

### Gateway runtime locale service

- `src/gateway/control-ui.ts`
- `src/gateway/control-ui-contract.ts`
- likely new locale-loading and formatting helpers under `src/gateway/`, `src/plugins/`, or a dedicated runtime i18n module
- likely migration targets such as:
  - `src/pairing/pairing-messages.ts`
  - `src/tui/tui.ts`
  - `src/tui/gateway-chat.ts`
  - `src/cli/nodes-cli/register.pairing.ts`

### Control UI client

- `ui/src/i18n/lib/types.ts`
- `ui/src/i18n/lib/registry.ts`
- `ui/src/i18n/lib/translate.ts`
- `ui/src/ui/controllers/control-ui-bootstrap.ts`
- initial migration targets such as:
  - `ui/src/ui/views/nodes.ts`
  - `ui/src/ui/views/sessions.ts`
  - `ui/src/ui/views/channels.imessage.ts`
  - `ui/src/ui/views/agents-panels-status-files.ts`
  - `ui/src/ui/controllers/devices.ts`
- relevant i18n tests under `ui/src/i18n/` and `src/i18n/`

## 14.3 External localization monorepo touchpoints

For each locale package:

- `packages/<locale>/package.json`
- `packages/<locale>/openclaw.plugin.json`
- `packages/<locale>/resources/docs/<locale>/**`
- `packages/<locale>/resources/docs-nav.<locale>.json`
- `packages/<locale>/resources/control-ui/<locale>.json`
- `packages/<locale>/resources/runtime/<locale>.json`
- `packages/<locale>/resources/provenance.json`
- `packages/<locale>/resources/source-manifest.json`
- optional glossary/TM/tooling directories

---

## 15. Validation and Failure Model

## 15.1 Shared validation rules

All locale packages must satisfy:

- manifest must parse successfully
- locale ID must be non-empty and exact-match stable
- declared resource paths must stay inside the package root
- declared resource files must exist
- compatibility rules must pass when declared

## 15.2 Docs validation and recovery

Failure classes:

- `docs_locale_manifest_invalid`
- `docs_locale_resource_missing`
- `docs_locale_path_escape`
- `docs_locale_nav_invalid`
- `docs_locale_incompatible`

Recovery:

- optional locale → warn and skip
- required locale → fail docs sync/build

## 15.3 Gateway runtime validation and recovery

Failure classes:

- `control_ui_locale_manifest_invalid`
- `control_ui_locale_resource_missing`
- `control_ui_locale_payload_invalid`
- `control_ui_locale_incompatible`
- `runtime_locale_catalog_missing`
- `runtime_locale_catalog_invalid`
- `runtime_locale_catalog_incompatible`

Recovery:

- exclude invalid browser locale payloads from user-facing selection
- skip invalid server-side runtime catalogs for that locale
- expose diagnostics to operators
- fall back to English in both browser and server-side runtime formatting paths

## 15.4 Restart recovery

- docs sync is fully regenerable from English source + installed locale packages
- gateway runtime locale registry is fully rebuildable at startup from installed locale packages
- no mutable locale state is required to survive restart beyond persisted user locale preference

---

## 16. Observability and Diagnostics

Required structured log fields for locale operations:

- `pluginId`
- `locale`
- `resourceKind`
- `status`
- `path` when relevant
- `errorCode`

Diagnostics should surface in:

- `openclaw plugins list`
- `openclaw plugins inspect <id>`
- docs sync/materialization output
- runtime locale debug output when relevant

Recommended locale-specific diagnostic fields:

- `locale`
- `resourceKinds`
- `docsCoverage`
- `controlUiCoverage`
- `runtimeCoverage`
- `provenanceAvailable`
- `validationErrors`
- `sourceRevision` if available

---

## 17. Rejected or Counterproductive Designs

## 17.1 Rejected: Mintlify reading locale resources directly from plugin roots

Reason:

- current docs tooling expects local `docs/**` and `docs/docs.json`
- this would add unnecessary complexity before extraction even succeeds

Preferred alternative:

- docs materialization into generated local docs paths

## 17.2 Rejected: browser loading locale files directly from plugin directories

Reason:

- browser cannot inspect server-side plugin roots
- current Control UI is static browser code served by the gateway

Preferred alternative:

- gateway HTTP endpoints for locale metadata and payloads

## 17.3 Rejected: one identical loading model for docs and gateway runtime localization

Reason:

- docs, browser UI, and server-side runtime strings have different consumers and different constraints

Preferred alternative:

- one artifact model, two consumption paths, with the gateway runtime locale service serving both browser and server-side runtime consumers

## 17.4 Rejected: treating locale packages exactly like capability plugins

Reason:

- locale packages are primarily resource artifacts
- capability registration is not the main architectural fit

Preferred alternative:

- plugin-compatible resource packages

## 17.5 Rejected: locale nav fragments as permanent canonical nav ownership

Reason:

- English docs structure should remain canonical

Preferred alternative:

- use nav fragments as a practical v1 bridge only

---

## 18. Acceptance Criteria

## 18.1 Phase 1 acceptance

- at least one language package is published from an external localization monorepo
- it installs through the current plugin workflow
- docs locale sync/materialization works for that package
- generated locale docs are no longer treated as source-owned in core
- multilingual docs CI can install required locale packages and build using generated outputs
- English-only docs CI continues to work without locale packages installed

## 18.2 Phase 2 acceptance

- gateway runtime locale service can load one installed locale package with runtime resources
- gateway exposes browser locale metadata and at least one Control UI locale payload over HTTP
- Control UI locale list is no longer hardcoded
- Control UI can switch to one installed locale dynamically without rebuilding UI assets
- server-side pairing or auth/disconnect guidance can be formatted through the same locale package
- English fallback works for missing locale packages and missing keys in both browser and server-side runtime paths

## 18.3 Phase 3 acceptance

- more than one gateway runtime surface is migrated beyond the initial pairing/auth slice
- the localization approach can cover most user-facing gateway strings, not only browser UI strings
- locale packages may install without the transitional no-op runtime entry if the project chooses to land that improvement

---

## 19. Implementation Checklist

This section is intentionally redundant with the acceptance criteria so an implementing developer or agent can track completion directly.

## 19.1 Phase 1

- [ ] Add `localization` block support to plugin manifest handling
- [ ] Validate locale package manifest and resource paths
- [ ] Create external localization monorepo
- [ ] Publish one working locale package
- [ ] Support transitional `openclaw.extensions` install shape
- [ ] Implement docs locale materializer using a generated workspace
- [ ] Optionally add a canonical docs config split later if needed
- [ ] Implement docs nav generation/merge
- [ ] Update multilingual docs workflow to materialize locale outputs before docs checks/build
- [ ] Remove source ownership of translated docs from core when migration is ready

## 19.2 Phase 2

- [ ] Add a gateway runtime locale service
- [ ] Load browser locale payloads and server-side runtime catalogs from locale packages
- [ ] Expose browser locale metadata and payload URLs to the Control UI
- [ ] Replace the hardcoded locale registry in the Control UI
- [ ] Add a server-side runtime formatting API for gateway-owned strings
- [ ] Migrate pairing and auth/disconnect guidance to the runtime locale service
- [ ] Preserve English fallback behavior
- [ ] Add runtime diagnostics for invalid locale packages

## 19.3 Phase 3

- [ ] Migrate more Control UI files that still emit hardcoded English strings
- [ ] Migrate selected CLI and TUI output paths to the runtime locale service
- [ ] Add a plugin/runtime seam for gateway-generated localized reply strings
- [ ] Evaluate first-class resource-only locale package support
- [ ] Remove transitional no-op runtime entry requirement if feasible

## 19.4 Phase 4

- [ ] Standardize provenance and source manifest metadata
- [ ] Move or rebuild translation workflow tooling in the localization monorepo
- [ ] Add optional AI-assisted translation and review flows

---

## 20. Final Summary for Developers

If you are implementing this spec, keep these rules in mind:

1. **There are two systems here, not one.**
   - Docs localization is build-time materialization.
   - Gateway runtime localization is a gateway locale service with both browser and server-side consumers.

2. **Do not try to make Mintlify read plugin directories directly.**
   Generate local docs outputs first.

3. **Do not try to make the browser read plugin files directly.**
   Serve locale resources from the gateway.

4. **Do not stop at the browser.**
   Pairing replies, CLI/TUI guidance, auth/disconnect help, and gateway-generated plugin replies are also part of runtime localization scope.

5. **Keep English canonical in core.**

6. **Treat locale packages as plugin-compatible resource artifacts.**
   Use the plugin ecosystem pragmatically, but do not confuse locale packages with capability-registration plugins.

7. **The translation workflow is intentionally decoupled.**
   The artifact format must remain stable whether translations come from humans, AI, vendors, or hybrids.

This is the intended end state:

- one external localization monorepo
- one package per language
- plugin-compatible locale artifacts
- generated docs localization at build time
- gateway runtime localization for browser and server-side strings
- English canonical in core

That is the most grounded path supported by the current repository architecture.
