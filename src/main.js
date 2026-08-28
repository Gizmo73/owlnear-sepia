/**
 * The popover UI. It writes the shared settings into the scene metadata; the
 * background page in each client turns those settings into the actual filter.
 */

import OBR from "@owlbear-rodeo/sdk";
import {
  BLEND_MODES,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  TONE_PRESETS,
  normaliseSettings,
} from "./sepia.js";
import "./style.css";

const status = document.getElementById("status");
const controls = document.getElementById("controls");
const enabledInput = document.getElementById("enabled");
const strengthInput = document.getElementById("strength");
const strengthValue = document.getElementById("strength-value");
const toneInput = document.getElementById("tone");
const presetsContainer = document.getElementById("presets");
const vignetteInput = document.getElementById("vignette");
const vignetteValue = document.getElementById("vignette-value");
const blendModeSelect = document.getElementById("blend-mode");
const resetButton = document.getElementById("reset");

let settings = { ...DEFAULT_SETTINGS };
let editable = false;
/** Set while the user is dragging, so echoed metadata does not fight them. */
let writing = false;

function applyTheme(theme) {
  const root = document.documentElement.style;
  root.setProperty("--text", theme.text.primary);
  root.setProperty("--text-secondary", theme.text.secondary);
  root.setProperty("--text-disabled", theme.text.disabled);
  root.setProperty("--background", theme.background.paper);
  root.setProperty("--accent", theme.primary.main);
  document.documentElement.dataset.mode = theme.mode.toLowerCase();
}

function renderPresets() {
  presetsContainer.replaceChildren(
    ...TONE_PRESETS.map((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset";
      button.style.background = preset.value;
      button.title = preset.label;
      button.setAttribute("aria-label", preset.label);
      button.dataset.tone = preset.value;
      button.addEventListener("click", () => update({ tone: preset.value }));
      return button;
    }),
  );
}

function renderBlendModes() {
  blendModeSelect.replaceChildren(
    ...BLEND_MODES.map((mode) => {
      const option = document.createElement("option");
      option.value = mode.value;
      option.textContent = mode.label;
      return option;
    }),
  );
}

function render() {
  enabledInput.checked = settings.enabled;
  strengthInput.value = String(settings.strength);
  strengthValue.textContent = `${settings.strength}%`;
  toneInput.value = settings.tone;
  vignetteInput.value = String(settings.vignette);
  vignetteValue.textContent = `${settings.vignette}%`;
  blendModeSelect.value = settings.blendMode;

  for (const button of presetsContainer.children) {
    button.classList.toggle("selected", button.dataset.tone === settings.tone);
  }

  // Everything except the on/off state is meaningless while the filter is off.
  const active = settings.enabled && editable;
  for (const input of [strengthInput, toneInput, vignetteInput, blendModeSelect]) {
    input.disabled = !active;
  }
  for (const button of presetsContainer.children) {
    button.disabled = !active;
  }
  enabledInput.disabled = !editable;
  resetButton.disabled = !editable;
  controls.classList.toggle("inactive", !settings.enabled);
}

async function update(patch) {
  if (!editable) return;
  settings = normaliseSettings({ ...settings, ...patch });
  render();
  writing = true;
  try {
    await OBR.scene.setMetadata({ [SETTINGS_KEY]: settings });
  } catch (error) {
    console.error("[Sepia Filter] could not save settings", error);
    setStatus("Could not save these settings.", true);
  } finally {
    writing = false;
  }
}

function setStatus(message, visible) {
  status.textContent = message ?? "";
  status.hidden = !visible;
}

function bindInputs() {
  enabledInput.addEventListener("change", () => update({ enabled: enabledInput.checked }));
  // "input" rather than "change" so dragging a slider previews live.
  strengthInput.addEventListener("input", () => update({ strength: Number(strengthInput.value) }));
  vignetteInput.addEventListener("input", () => update({ vignette: Number(vignetteInput.value) }));
  toneInput.addEventListener("input", () => update({ tone: toneInput.value }));
  blendModeSelect.addEventListener("change", () => update({ blendMode: blendModeSelect.value }));
  resetButton.addEventListener("click", () => update(DEFAULT_SETTINGS));
}

async function refreshSceneState() {
  const ready = await OBR.scene.isReady();
  if (!ready) {
    editable = false;
    controls.hidden = true;
    setStatus("Open a scene to use the sepia filter.", true);
    return;
  }

  const role = await OBR.player.getRole();
  const metadata = await OBR.scene.getMetadata();
  settings = normaliseSettings(metadata[SETTINGS_KEY]);
  editable = role === "GM";
  controls.hidden = false;
  setStatus(
    editable ? "" : "Only the GM can change the sepia filter.",
    !editable,
  );
  render();
}

OBR.onReady(async () => {
  renderPresets();
  renderBlendModes();
  bindInputs();

  applyTheme(await OBR.theme.getTheme());
  OBR.theme.onChange(applyTheme);

  OBR.scene.onReadyChange(() => refreshSceneState());
  OBR.scene.onMetadataChange((metadata) => {
    if (writing) return;
    settings = normaliseSettings(metadata[SETTINGS_KEY]);
    render();
  });

  await refreshSceneState();
});
