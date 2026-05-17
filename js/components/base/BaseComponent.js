/**
 * Foundation class for every component in the app.
 *
 * Lifecycle:
 *   render()   -> must return a single HTMLElement
 *   mount(parent) -> render + insert into parent + onMount?()
 *   update(nextProps) -> re-render in place
 *   unmount() -> onUnmount?() + auto-remove all subscriptions/listeners
 *
 * Auto-cleanup helpers:
 *   this.subscribe(store, selector, handler)
 *   this.on(eventBus, "event", handler)
 *   this.listen(target, "click", handler)
 */
export class BaseComponent {
  constructor(props = {}) {
    this.props = props;
    /** @type {HTMLElement | null} */
    this.el = null;
    /** @type {Array<() => void>} */
    this._unsubs = [];
  }

  render() {
    throw new Error(`${this.constructor.name}.render() must be implemented`);
  }

  mount(parent) {
    this.el = this.render();
    parent.appendChild(this.el);
    this.onMount?.();
    return this.el;
  }

  update(nextProps = {}) {
    this.props = { ...this.props, ...nextProps };
    if (!this.el) return;
    const next = this.render();
    this.el.replaceWith(next);
    this.el = next;
    this.onUpdate?.();
  }

  unmount() {
    this.onUnmount?.();
    for (const off of this._unsubs) {
      try { off(); } catch { /* ignore */ }
    }
    this._unsubs = [];
    this.el?.remove();
    this.el = null;
  }

  // ---- auto-cleaned helpers ----

  subscribe(store, selector, handler) {
    const off = store.subscribe(selector, handler);
    this._unsubs.push(off);
    return off;
  }

  on(bus, event, handler) {
    const off = bus.on(event, handler);
    this._unsubs.push(off);
    return off;
  }

  listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    this._unsubs.push(() => target.removeEventListener(event, handler, options));
  }
}
