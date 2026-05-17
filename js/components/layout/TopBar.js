import { BaseComponent } from "../base/BaseComponent.js";
import { Icon } from "../ui/Icon.js";
import { selectConnection, selectTheme } from "../../state/store.js";
import { t } from "../../core/i18n.js";

/**
 * Top bar: page title (left), connection badge + theme toggle (right).
 *
 *   new TopBar({ store, eventBus }).mount(document.getElementById("app-topbar"));
 *
 * Subscribes to connection status and current route to render the right
 * title; pages may override the title via the "topbar:title" event bus
 * signal.
 */
const ROUTE_TITLE_KEYS = {
  "/oversigt": "Overview",
  "/musik":    "Music",
  "/bil":      "Car",
  "/indstillinger": "Settings",
  "/fest":     "Party",
};

const STATUS_KEY = {
  idle:         "Idle",
  connecting:   "Connecting",
  connected:    "Connected",
  reconnecting: "Reconnecting",
  error:        "Error",
  offline:      "Offline",
};

export class TopBar extends BaseComponent {
  render() {
    const { store } = this.props;

    const bar = document.createElement("div");
    bar.className = "topbar";

    // Left: title
    this._titleEl = document.createElement("h1");
    this._titleEl.className = "topbar__title";
    this._titleEl.textContent = this._titleFor(currentPath());
    bar.appendChild(this._titleEl);

    // Right: actions
    const actions = document.createElement("div");
    actions.className = "topbar__actions";

    // Connection badge
    this._badgeEl = document.createElement("span");
    this._badgeEl.className = "conn-badge";
    this._applyConnection(store.getState().connection);
    actions.appendChild(this._badgeEl);

    // Theme toggle button
    this._themeBtn = document.createElement("button");
    this._themeBtn.type = "button";
    this._themeBtn.className = "btn btn--ghost btn--icon";
    this._themeBtn.setAttribute("aria-label", t("Switch theme"));
    this._renderThemeIcon(store.getState().theme);
    this.listen(this._themeBtn, "click", () => this._cycleTheme());
    actions.appendChild(this._themeBtn);

    bar.appendChild(actions);
    return bar;
  }

  onMount() {
    const { store, eventBus } = this.props;

    this.subscribe(store, selectConnection, (c) => this._applyConnection(c));
    this.subscribe(store, selectTheme, (t) => this._renderThemeIcon(t));

    this.on(eventBus, "router:navigated", ({ path }) => {
      this._titleEl.textContent = this._titleFor(path);
    });
    this.on(eventBus, "topbar:title", (title) => {
      if (title) this._titleEl.textContent = title;
    });
  }

  _titleFor(path) { return ROUTE_TITLE_KEYS[path] ? t(ROUTE_TITLE_KEYS[path]) : "Dasher"; }

  _applyConnection({ status, message }) {
    this._badgeEl.dataset.state = status;
    this._badgeEl.textContent = "";
    const dot = document.createElement("span");
    dot.className = "conn-badge__dot";
    const label = document.createElement("span");
    label.textContent = STATUS_KEY[status] ? t(STATUS_KEY[status]) : status;
    this._badgeEl.append(dot, label);
    this._badgeEl.title = message || "";
  }

  _renderThemeIcon(theme) {
    this._themeBtn.replaceChildren();
    const iconName = theme === "light" ? "moon" : theme === "party" ? "sun" : "party";
    this._themeBtn.appendChild(Icon.render(iconName, { size: 18 }));
  }

  _cycleTheme() {
    const { store, eventBus } = this.props;
    const order = ["dark", "light", "warm", "party"];
    const i = order.indexOf(store.getState().theme);
    const next = order[(i + 1) % order.length];
    eventBus.emit("theme:set", next);
  }
}

function currentPath() {
  return window.location.hash.replace(/^#/, "") || "/oversigt";
}
