# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Toolchain is managed by [mise](https://mise.jdx.dev) (pins Node 24 LTS via `mise.toml`).

```sh
mise install          # install Node 24
npm install           # install dependencies

npm run dev           # launch the TUI (via tsx, no build needed)
npm run typecheck     # tsc --noEmit
npm run build         # compile to dist/ (tsc only; not the bundle)
npm run build:bundle  # build self-contained dist/k8shh.mjs (esbuild, for releases)
npm run test          # run all *.test.ts files via Node's built-in test runner
npm run fmt           # prettier
```

Run a single test file:
```sh
node --import tsx --test src/k8s/secrets.test.ts
```

Release workflow (creates and pushes a version tag, then CI handles the rest):
```sh
mise run release:patch   # or release:minor / release:major
git push --follow-tags
```

## Architecture

This is an [Ink](https://github.com/vadimdemedes/ink) TUI (React + Yoga flexbox, runs in the terminal). The app is a thin React tree driven by a single `useReducer` store — no external state library.

**Data flow:**
1. `src/cli.tsx` — entry point. Handles `--version`/`--help`, switches to the alternate screen buffer, renders `<App />`.
2. `src/app.tsx` — root component. Owns the `useReducer(reducer, initialState)` instance and all async side effects (cluster API calls). Dispatches actions into the store; never mutates state directly.
3. `src/state/store.ts` — pure reducer + `AppState` type. All UI state lives here: cluster selection, the `Mode` state machine (which overlay is active), the entry working copy vs. pristine snapshot, selection, filters, viewport size.
4. `src/k8s/client.ts` — `K8sClient` class wrapping `@kubernetes/client-node`. The UI never calls the SDK directly. Loads kubeconfig the same way `kubectl` does.
5. `src/k8s/secrets.ts` — pure functions for decoding/encoding secret data, diff/change computation, and building the JSON merge patch. Only changed keys are patched.
6. `src/k8s/types.ts` — shared types (`Entry`, `LoadedSecret`, `EntryChange`, `MergePatchBody`).

**Mode state machine (`Mode` in `store.ts`):**
The `mode` field drives which overlay consumes keyboard input. `browse` is the default; other modes (`select`, `editName`, `editValue`, `valueModal`, `confirmSave`, `confirmDiscard`, `filter`) each have exclusive input control — only one is active at a time.

**Entry identity:**
`Entry.id` is a stable process-unique id (not the key) used for React keys and selection. `Entry.originalKey` tracks the key as loaded from the cluster (`null` = newly added). This lets the diff and merge-patch logic distinguish renames from add+delete.

**Persistence (`src/state/`):**
- `config.ts` — loads `~/.config/k8shh/config.toml` (TOML via `smol-toml`). Seeds a commented default on first run. Controls which secret name suffixes are hidden.
- `persistence.ts` — saves/restores the last context + namespace + secret selection to `~/.config/k8shh/last-selection.json`.

**Components (`src/components/`):** Each is a focused Ink component. `SecretList` renders the key/value table with inline editing via `TextField`/`MultilineEditor`. `ValueEditorModal` is the fullscreen per-entry editor. `DiffConfirmModal` shows the diff before write. `SelectList` handles context/namespace/secret picking. `FilterBar` handles the `/`-triggered search.

**Build:** `tsc` compiles to `dist/`. For distribution, `scripts/bundle.mjs` uses esbuild to produce a single self-contained ESM bundle (`dist/k8shh.mjs`) with all dependencies inlined, including Yoga WASM.
