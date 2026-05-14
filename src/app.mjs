import { connectToHomeAssistant } from "./ha-client.mjs";

const form = document.getElementById("connection-form");
const baseUrlInput = document.getElementById("base-url");
const accessTokenInput = document.getElementById("access-token");
const statusElement = document.getElementById("status");
const entitiesElement = document.getElementById("entities");

let session;

function renderEntities(entities) {
  entitiesElement.innerHTML = "";
  for (const entity of entities) {
    const item = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = entity.label;

    const value = document.createElement("strong");
    value.textContent = entity.state;

    item.append(label, value);
    entitiesElement.append(item);
  }
}

function setStatus(message) {
  statusElement.textContent = message;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (session) {
    session.disconnect();
    session = undefined;
  }

  setStatus("Connecting...");
  entitiesElement.innerHTML = "";

  try {
    session = connectToHomeAssistant({
      baseUrl: baseUrlInput.value,
      token: accessTokenInput.value,
      onStatus: setStatus,
      onEntities: renderEntities,
      onError: (message) => setStatus(`Error: ${message}`),
    });
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
});
