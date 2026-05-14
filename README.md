# dasher

Minimal Home Assistant dashboard that connects through the Home Assistant WebSocket API.

## Usage

1. Open `settings.html` in a browser.
2. Enter your Home Assistant URL (for example `http://homeassistant.local:8123`).
3. Enter a long-lived access token and save.
4. Open `index.html` and click **Connect**.

The dashboard authenticates over `/api/websocket`, loads Home Assistant areas and entity assignments, and renders a classic room-based welcome view with room navigation.
