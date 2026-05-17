# dasher

Custom Home Assistant dashboard som Single Page Application i vanilla JavaScript.
Ingen frameworks, ingen bundler, ingen npm dependencies.

## Brug

1. Start en statisk webserver i projektroden:
   ```sh
   python3 -m http.server 8000
   ```
2. Åbn http://localhost:8000 i en browser.
3. Gå til **Indstillinger** og indtast Home Assistant URL og long-lived access token.
4. Tryk **Gem og forbind**.

## Struktur

```
index.html          SPA shell
styles/             tokens, base, layout, components
js/
  main.js           bootstrap
  config.js         konstanter (ruter, WS request IDs, feature flags)
  core/             BaseComponent, Store, Router, EventBus, html helper
  services/         HAClient, HACommands, SettingsService, EntityService, MediaService
  state/            initialState, actions, selectors
  pages/            Oversigt, Musik, Bil, Fest, Indstillinger
  components/
    ui/             Button, Card, Toggle, Slider
    layout/         Header, Sidebar, PageContainer
    features/       EntityCard, LightCard, SensorCard, MediaPlayer, CarCard
  utils/            dom, format, icons, throttle
tests/              node:test unit tests
```

## Test

```sh
node --test
```
