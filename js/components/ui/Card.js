import { BaseComponent } from "../base/BaseComponent.js";

/**
 * Generic surface card.
 *
 *   new Card({
 *     title: "Sensor",
 *     subtitle: "Living room",
 *     body: someElement,         // string or Node
 *     footer: someActions,       // optional
 *     variant: "default",        // CSS modifier suffix → .card--default
 *   }).render();
 */
export class Card extends BaseComponent {
  render() {
    const { title, subtitle, body, footer, variant = "default" } = this.props;

    const card = document.createElement("section");
    card.className = `card card--${variant}`;

    if (title || subtitle) {
      const header = document.createElement("header");
      header.className = "card__header";
      if (title) {
        const h = document.createElement("h2");
        h.className = "card__title";
        h.textContent = title;
        header.appendChild(h);
      }
      if (subtitle) {
        const p = document.createElement("p");
        p.className = "card__subtitle";
        p.textContent = subtitle;
        header.appendChild(p);
      }
      card.appendChild(header);
    }

    if (body != null) {
      const bodyEl = document.createElement("div");
      bodyEl.className = "card__body";
      bodyEl.appendChild(body instanceof Node ? body : document.createTextNode(String(body)));
      card.appendChild(bodyEl);
    }

    if (footer != null) {
      const footerEl = document.createElement("footer");
      footerEl.className = "card__footer";
      footerEl.appendChild(footer instanceof Node ? footer : document.createTextNode(String(footer)));
      card.appendChild(footerEl);
    }

    return card;
  }
}
