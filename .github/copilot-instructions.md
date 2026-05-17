# Copilot Instructions

## Project Overview

Dasher is a custom Home Assistant dashboard built as a Single Page Application in **vanilla JavaScript**. No frameworks, no bundler, no transpilation. The browser loads ES modules directly via `<script type="module">`. The only file in `package.json` is `{"type": "module"}` so Node's built-in test runner can import the same `.js` files.

Serve locally with `python3 -m http.server 8000`.

## Architecture

Strict layering — never bypass:

- **`js/core/`** — framework-agnostic primitives:
  - `BaseComponent` (mount/render/update/unmount lifecycle, auto-cleaning `subscribe`/`on`/`listen` helpers)
  - `Store` (selector-based reactive state; subscribers fire only on reference change)
  - `Router` (hash routing, `routes` map of `"/path"` → page class, mounts/unmounts pages into an outlet)
  - `EventBus` (pub/sub for transient signals like `toast:show`, `party:toggle`)
- **`js/services/`** — all I/O. UI must never touch `WebSocket` or `localStorage` directly.
  - `HAClient` owns the HA WebSocket lifecycle, dispatches into the store via `state/actions.js`, exposes `call(message)` for ad hoc commands, and emits transient signals on the event bus.
  - `HACommands` is a typed convenience wrapper over `HAClient.call()` (`lightTurnOn`, `mediaPlay`, etc.).
- **`js/state/`** — `initialState`, pure `actions` (state transformers), and pure `selectors` (e.g. `selectLights`, `selectRooms`, `selectLightsInArea`).
- **`js/pages/`** — top-level screens bound to routes. Compose feature components, subscribe to selectors, dispatch actions or call services.
- **`js/components/`**:
  - `ui/` — generic primitives (`Button`, `Card`, `Toggle`, `Slider`). Must not import services or state.
  - `layout/` — `Header`, `Sidebar`, `PageContainer`.
  - `features/` — domain-aware (`EntityCard`, `LightCard`, `SensorCard`, `MediaPlayer`, `CarCard`).
- **`js/utils/`** — small pure helpers (`dom`, `format`, `icons`, `throttle`).

## Key Conventions

- **ES modules everywhere.** All files are `.js` with `import`/`export`. Tests use `.mjs`.
- **No build tooling.** Do not introduce bundlers, transpilers, or runtime npm dependencies.
- **WebSocket request IDs** are centralized in [js/config.js](../js/config.js) (`WS_IDS`). Ad hoc calls auto-increment from `WS_DYNAMIC_ID_START`. Never invent magic IDs in feature code.
- **State flow:** services dispatch via `store.setState(actions.foo(payload))`; components read via selectors. Components never mutate the store directly.
- **Selectors are pure** and should return stable references when nothing changed (drives efficient re-render).
- **Cleanup is automatic** — use `BaseComponent`'s `subscribe`/`on`/`listen`. Never add raw listeners.
- **Styles** live in `styles/*.css` and use design tokens from `styles/tokens.css`. No CSS-in-JS.
- **Routing** is dumb: `Router` only maps path → page class. Auth/guards are page concerns.

## Testing

Use Node's built-in test runner with `node:assert/strict`:

```sh
node --test                          # all tests
node --test tests/store.test.mjs     # one file
```

Integration tests for `HAClient` should stub `globalThis.WebSocket` with a fake class and restore it in `t.after()`.
