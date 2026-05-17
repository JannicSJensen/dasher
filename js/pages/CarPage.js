import { BaseComponent } from "../components/base/BaseComponent.js";
import { PageShell } from "../components/layout/PageShell.js";
import { CarCard } from "../components/cards/CarCard.js";
import { Loader } from "../components/ui/Loader.js";
import { allEntities, findEntity } from "../api/ha-selectors.js";
import { selectEntities, selectReady } from "../state/store.js";
import { t } from "../core/i18n.js";

/**
 * Bil-side. Forsøger at sammensætte et CarCard ud fra entiteter der
 * matcher typiske bilintegrationer (Tesla, Polestar, VW, BMW, etc.).
 */
export class CarPage extends BaseComponent {
  render() {
    const { store } = this.props;
    this._shell = new PageShell({ title: t("Car"), subtitle: t("Status of your car") });
    const root = document.createElement("div");
    this._shell.mount(root);
    this._content = document.createElement("div");
    this._shell.body.appendChild(this._content);
    this._renderContent(store.getState());
    return root.firstElementChild;
  }

  onMount() {
    const { store } = this.props;
    this.subscribe(store, selectEntities, () => this._renderContent(store.getState()));
    this.subscribe(store, selectReady, () => this._renderContent(store.getState()));
  }

  _renderContent(state) {
    this._content.replaceChildren();
    if (!state.ready && Object.keys(state.entities).length === 0) {
      this._content.appendChild(new Loader({ kind: "skeleton", lines: 3 }).render());
      return;
    }

    const data = inferCarData(state);
    if (!data) {
      this._content.appendChild(emptyState());
      return;
    }
    this._content.appendChild(new CarCard({ data }).render());
  }
}

function inferCarData(state) {
  const battery  = findEntity(state, /(car|vehicle|tesla|polestar|leaf|bmw|kona).*battery/);
  const range    = findEntity(state, /(car|vehicle|tesla|polestar|leaf|bmw|kona).*range/);
  const charging = findEntity(state, /(charging|charger_state|charging_state)/);
  const plugged  = findEntity(state, /(plugged|charging_cable)/);
  const lock     = findEntity(state, /(car|vehicle|tesla|polestar).*lock/);
  const tracker  = allEntities(state).find((e) =>
    e.entityId.startsWith("device_tracker.") && /(car|vehicle|tesla|polestar|leaf|bmw|kona)/i.test(e.entityId)
  );

  if (!battery && !range && !charging && !lock) return null;

  return {
    name: battery?.attributes?.friendly_name?.replace(/\s*battery\s*/i, "") || t("Car"),
    battery: battery ? Number(battery.state) : undefined,
    range:   range   ? Number(range.state)   : undefined,
    charging: charging ? /charging|on/i.test(charging.state) : false,
    plugged:  plugged  ? /on|plugged|connected/i.test(plugged.state)  : false,
    locked:   lock ? lock.state === "locked" : undefined,
    location: tracker?.state,
  };
}

function emptyState() {
  const wrap = document.createElement("div");
  wrap.className = "empty";
  const h = document.createElement("h3");
  h.textContent = t("No car found");
  h.style.marginBottom = "var(--space-2)";
  const p = document.createElement("p");
  p.style.color = "var(--color-text-2)";
  p.textContent = t("Add a car integration in Home Assistant (e.g. Tesla, Polestar, VW Connect) and status will appear here automatically.");
  wrap.append(h, p);
  return wrap;
}
