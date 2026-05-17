import { BaseComponent } from "../base/BaseComponent.js";
import { Icon } from "../ui/Icon.js";
import { t } from "../../core/i18n.js";
import { storage, STORAGE_KEYS } from "../../core/storage.js";

/**
 * Desktop sidebar navigation.
 *
 *   new SideBar({ eventBus, items }).mount(document.getElementById("app-sidebar"));
 *
 * `items` defaults to the standard route set. Items: { path, label, icon }.
 */
const DEFAULT_ITEMS = [
  { path: "/oversigt",      labelKey: "Overview", icon: "home" },
  { path: "/musik",         labelKey: "Music",    icon: "music" },
  { path: "/bil",           labelKey: "Car",      icon: "car" },
  { path: "/fest",          labelKey: "Party",    icon: "party" },
  { path: "/indstillinger", labelKey: "Settings", icon: "settings" },
];

/** Read user-defined label overrides keyed by route path. */
export function loadSidebarLabels() {
  const v = storage.get(STORAGE_KEYS.SIDEBAR_LABELS, {});
  return v && typeof v === "object" ? v : {};
}
export function saveSidebarLabels(map) {
  storage.set(STORAGE_KEYS.SIDEBAR_LABELS, map || {});
}
/** The default items, exported so Settings can build its rename UI. */
export function getDefaultSidebarItems() { return DEFAULT_ITEMS.slice(); }

/** Resolve the label for an item, honoring user override → labelKey → label. */
function resolveLabel(item, overrides) {
  const override = overrides?.[item.path];
  if (typeof override === "string" && override.trim()) return override;
  return item.labelKey ? t(item.labelKey) : item.label;
}

export class SideBar extends BaseComponent {
  render() {
    const { items = DEFAULT_ITEMS } = this.props;
    this._items = items;

    const nav = document.createElement("nav");
    nav.className = "sidebar";
    nav.setAttribute("aria-label", t("Main navigation"));

    const brand = document.createElement("div");
    brand.className = "sidebar__brand";
    brand.appendChild(Icon.render("bolt", { size: 22 }));
    const brandText = document.createElement("span");
    brandText.textContent = "Dasher";
    brand.appendChild(brandText);
    nav.appendChild(brand);

    const list = document.createElement("ul");
    list.className = "sidebar__nav";
    this._links = new Map();
    this._labels = new Map();
    const overrides = loadSidebarLabels();

    for (const item of items) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "sidebar__link";
      a.href = `#${item.path}`;
      a.appendChild(Icon.render(item.icon, { size: 20 }));
      const span = document.createElement("span");
      span.textContent = resolveLabel(item, overrides);
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
    for (const item of this._items || []) {
      const span = this._labels?.get(item.path);
      if (span) span.textContent = resolveLabel(item, overrides);
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
