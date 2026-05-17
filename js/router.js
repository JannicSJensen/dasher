import { logger } from "./core/logger.js";

/**
 * Hash-based SPA router.
 *
 *   const router = new Router({
 *     outlet: document.getElementById("app-outlet"),
 *     routes: { "/oversigt": OversigtPage, "/musik": MusikPage, ... },
 *     notFound: OversigtPage,
 *     context: { store, ws, commands, eventBus },
 *   });
 *   router.start();
 *
 * Routes is a record of "/path" → Page class. Pages are instantiated with
 * `new PageClass({ path, ...context })` and must implement `mount(parent)`
 * and `unmount()` (BaseComponent provides both).
 */
export class Router {
  constructor({ outlet, routes, notFound, context = {}, defaultPath = "/oversigt" }) {
    this.outlet = outlet;
    this.routes = routes;
    this.notFound = notFound;
    this.context = context;
    this.defaultPath = defaultPath;
    this.current = null;

    this._onHashChange = () => this._resolve();
  }

  start() {
    window.addEventListener("hashchange", this._onHashChange);

    // If no hash present, normalize to default path.
    if (!window.location.hash) {
      window.location.replace(`#${this.defaultPath}`);
    }
    this._resolve();
  }

  stop() {
    window.removeEventListener("hashchange", this._onHashChange);
    this.current?.unmount();
    this.current = null;
  }

  /** Programmatic navigation. */
  navigate(path) {
    if (window.location.hash === `#${path}`) {
      this._resolve();
    } else {
      window.location.hash = path;
    }
  }

  /** Current path (without leading "#"). */
  currentPath() {
    return window.location.hash.replace(/^#/, "") || this.defaultPath;
  }

  // -------- internals --------------------------------------------------

  _resolve() {
    const path = this.currentPath();
    let PageClass = this.routes[path];
    let params = {};
    if (!PageClass) {
      // Pattern routes (e.g. "/rum/:areaId") fall back to a regex match.
      for (const [pattern, Cls] of Object.entries(this.routes)) {
        if (!pattern.includes(":")) continue;
        const keys = [...pattern.matchAll(/:([^/]+)/g)].map((m) => m[1]);
        const re = new RegExp("^" + pattern.replace(/:[^/]+/g, "([^/]+)") + "$");
        const m = path.match(re);
        if (m) {
          PageClass = Cls;
          params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
          break;
        }
      }
    }
    PageClass = PageClass ?? this.notFound;
    if (!PageClass) {
      logger.warn("[router] no route for", path);
      return;
    }

    logger.debug("[router] navigate ->", path);

    this.current?.unmount();
    while (this.outlet.firstChild) this.outlet.removeChild(this.outlet.firstChild);

    this.current = new PageClass({ path, params, ...this.context });
    this.current.mount(this.outlet);

    // Let listeners (e.g. nav components) react to navigation.
    this.context.eventBus?.emit("router:navigated", { path, params });
  }
}
