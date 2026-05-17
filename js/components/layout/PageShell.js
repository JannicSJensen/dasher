import { BaseComponent } from "../base/BaseComponent.js";

/**
 * Page header + content container. Use from page classes:
 *
 *   const shell = new PageShell({ title, subtitle, actions: [btn1, btn2] });
 *   shell.mount(parent);
 *   shell.body.append(...);
 */
export class PageShell extends BaseComponent {
  /** @type {HTMLElement} */
  body;

  render() {
    const { title, subtitle, actions = [] } = this.props;

    const page = document.createElement("section");
    page.className = "page";

    const header = document.createElement("header");
    header.className = "page__header";

    const text = document.createElement("div");
    if (title) {
      const h = document.createElement("h2");
      h.className = "page__title";
      h.textContent = title;
      text.appendChild(h);
    }
    if (subtitle) {
      const p = document.createElement("p");
      p.className = "page__subtitle";
      p.textContent = subtitle;
      text.appendChild(p);
    }
    header.appendChild(text);

    if (actions.length) {
      const wrap = document.createElement("div");
      wrap.className = "page__actions";
      for (const a of actions) wrap.appendChild(a);
      header.appendChild(wrap);
    }

    page.appendChild(header);

    this.body = document.createElement("div");
    this.body.className = "page__body";
    page.appendChild(this.body);

    return page;
  }
}
