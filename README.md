# dasher

Minimal Home Assistant dashboard that connects through the Home Assistant WebSocket API.

## Usage

1. Open `/home/runner/work/dasher/dasher/index.html` in a browser.
2. Enter your Home Assistant URL (for example `http://homeassistant.local:8123`).
3. Enter a long-lived access token.
4. Click **Connect**.

The dashboard authenticates over `/api/websocket`, fetches entity states, and renders them in a simple list.
