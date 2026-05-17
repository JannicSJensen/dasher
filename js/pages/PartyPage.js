import { BaseComponent } from "../components/base/BaseComponent.js";
import { PageShell } from "../components/layout/PageShell.js";
import { Button } from "../components/ui/Button.js";
import { Toggle } from "../components/ui/Toggle.js";
import { Card } from "../components/ui/Card.js";
import { getScenes } from "../api/ha-selectors.js";
import { selectEntities, selectTheme } from "../state/store.js";
import { t } from "../core/i18n.js";

/**
 * Fest-side: store knapper til scener + party-mode toggle (glow tema).
 */
export class PartyPage extends BaseComponent {
  render() {
    const { store, eventBus } = this.props;

    const partyToggle = new Toggle({
      label: t("Party mode (visual)"),
      checked: store.getState().theme === "party",
      onChange: (next) => eventBus.emit("theme:set", next ? "party" : "dark"),
    }).render();

    this._shell = new PageShell({
      title: t("Party"),
      subtitle: t("Set the mood"),
      actions: [partyToggle],
    });
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
    this.subscribe(store, selectTheme, () => { /* re-render via toggle */ });
  }

  _renderContent(state) {
    this._content.replaceChildren();
    const scenes = getScenes(state);
    if (!scenes.length) {
      const c = new Card({
        title: t("No scenes"),
        body: t("Create scenes in Home Assistant to get buttons here."),
      }).render();
      this._content.appendChild(c);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "grid grid--cards";
    for (const scene of scenes) {
      const btn = new Button({
        label: scene.label,
        variant: "primary",
        icon: "party",
        onClick: async () => {
          try { await this.props.commands.sceneActivate(scene.entityId); }
          catch (e) { this.props.eventBus.emit("toast:show", { message: e.message, tone: "error" }); }
        },
      }).render();
      btn.style.padding = "var(--space-5)";
      btn.style.fontSize = "var(--fs-lg)";
      grid.appendChild(btn);
    }
    this._content.appendChild(grid);
  }
}
