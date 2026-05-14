import { loadSettings, saveSettings } from "./settings-store.mjs";

const form = document.getElementById("settings-form");
const baseUrlInput = document.getElementById("base-url");
const accessTokenInput = document.getElementById("access-token");
const statusElement = document.getElementById("status");

function setStatus(message) {
  statusElement.textContent = message;
}

function populateForm() {
  const settings = loadSettings();
  baseUrlInput.value = settings.baseUrl;
  accessTokenInput.value = settings.token;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  saveSettings({
    baseUrl: baseUrlInput.value,
    token: accessTokenInput.value,
  });

  setStatus("Settings saved.");
});

populateForm();
