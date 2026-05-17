import { BaseComponent } from "../base/BaseComponent.js";
import { Icon } from "../ui/Icon.js";
import { t } from "../../core/i18n.js";
import { loadSidebarLabels } from "./SideBar.js";

/**
 * Mobile bottom navigation. Mirrors the sidebar's routes.
 * Visibility is controlled by CSS (only shown < 880px).
 */
const ITEMS = [
  { path: "/oversigt",      labelKey: "Home",             icon: "home" },
  { path: "/musik",         labelKey: "Music",            icon: "music" },
  { path: "/bil",           labelKey: "Car",              icon: "car" },
  { path: "/fest",          labelKey: "Party",            icon: "party" },
  { path: "/indstillinger", labelKey: "Settings (short)", icon: "settings" },
];

export class BottomNav extends BaseComponent {
  render() {
    const nav = document.createElement("nav");
    nav.className = "bottomnav";
    nav.setAttribute("aria-label", t("Mobile navigation"));

    const list = document.createElement("ul");
    list.className = "bottomnav__list";
    this._links = new Map();
    this._labels = new Map();
    const overrides = loadSidebarLabels();

    for (const item of ITEMS) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "bottomnav__link";
      a.href = `#${item.path}`;
      a.appendChild(Icon.render(item.icon, { size: 20 }));
      const span = document.createElement("span");
      span.textContent = overrides[item.path]?.trim() || t(item.labelKey);
      a.appendChild(span);
      li.appendChild(a);
      list.appendChild(li);
      this._links.set(item.path, a);
      this._labels.set(item.path, span);
    }

    nav.appendChild(list);
    this._applyActive(currentPath());
    return nav;
  }

  onMount() {
    this.on(this.props.eventBus, "router:navigated", ({ path }) => this._applyActive(path));
    this.on(this.props.eventBus, "sidebar:labels-changed", () => this._applyLabels());
  }

  _applyLabels() {
    const overrides = loadSidebarLabels();
    for (const item of ITEMS) {
      const span = this._labels.get(item.path);
      if (span) span.textContent = overrides[item.path]?.trim() || t(item.labelKey);
    }
  }

  _applyActive(path) {
    for (const [p, a] of this._links) {
      a.classList.toggle("is-active", p === path);
      if (p === path) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  }
}

function currentPath() {
  return window.location.hash.replace(/^#/, "") || "/oversigt";
}
