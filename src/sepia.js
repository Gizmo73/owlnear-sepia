/**
 * Shared definitions for the sepia filter.
 *
 * Owlbear Rodeo has no per-image colour filter, so the tint is produced with
 * Effect items: SkSL shaders that are composited over the map with a Skia
 * blend mode. Effect items can only live in the local scene
 * (`OBR.scene.local`), which means every client renders its own copy of the
 * filter from the settings shared in the scene metadata.
 */

export const ID = "com.github.gizmo73.owlnear-sepia";

/** Scene metadata key holding the shared, GM-editable settings. */
export const SETTINGS_KEY = `${ID}/settings`;

/** Metadata key stamped on every local Effect item this extension creates. */
export const EFFECT_KEY = `${ID}/effect`;

/**
 * How the tint is composited over the map.
 *
 * COLOR takes the hue and saturation from the shader and the luminosity from
 * the map underneath, which is the textbook definition of a sepia tone, so it
 * is the default. The others are offered because they age a map differently.
 */
export const BLEND_MODES = [
  { value: "COLOR", label: "Tone (classic sepia)" },
  { value: "MULTIPLY", label: "Wash (warm, darker)" },
  { value: "OVERLAY", label: "Overlay (high contrast)" },
  { value: "SOFT_LIGHT", label: "Soft light (subtle)" },
];

export const TONE_PRESETS = [
  { value: "#704214", label: "Classic sepia" },
  { value: "#8a6642", label: "Old photograph" },
  { value: "#c8a97e", label: "Parchment" },
  { value: "#5b4636", label: "Faded ink" },
];

export const DEFAULT_SETTINGS = {
  enabled: true,
  /** Level of sepia applied, 0-100. */
  strength: 75,
  /** The sepia colour itself, as a hex string. */
  tone: "#704214",
  /** Edge darkening, 0-100. */
  vignette: 25,
  blendMode: "COLOR",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function toNumber(value, fallback) {
  const number = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Coerce whatever is in the scene metadata into a complete, valid settings
 * object. Metadata is shared and persisted, so it can be stale, partial, or
 * written by an older version of this extension.
 */
export function normaliseSettings(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const tone = typeof value.tone === "string" && HEX.test(value.tone)
    ? value.tone.toLowerCase()
    : DEFAULT_SETTINGS.tone;
  const blendMode = BLEND_MODES.some((mode) => mode.value === value.blendMode)
    ? value.blendMode
    : DEFAULT_SETTINGS.blendMode;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    strength: clamp(Math.round(toNumber(value.strength, DEFAULT_SETTINGS.strength)), 0, 100),
    tone,
    vignette: clamp(Math.round(toNumber(value.vignette, DEFAULT_SETTINGS.vignette)), 0, 100),
    blendMode,
  };
}

/** "#704214" -> { x, y, z } in the 0-1 range the shader expects. */
export function hexToVector3(hex) {
  return {
    x: Number.parseInt(hex.slice(1, 3), 16) / 255,
    y: Number.parseInt(hex.slice(3, 5), 16) / 255,
    z: Number.parseInt(hex.slice(5, 7), 16) / 255,
  };
}

/**
 * The tint. A flat sheet of the sepia colour whose alpha is the requested
 * strength; the blend mode does the actual work of combining it with the map.
 * Output is premultiplied, as Skia runtime shaders expect.
 */
export const TINT_SKSL = `
uniform vec3 tone;
uniform float strength;

half4 main(float2 coord) {
  return half4(half3(tone) * half(strength), half(strength));
}
`;

/**
 * The vignette. Multiplied over the map so the corners fall away, which is
 * what sells the aged-photograph look.
 *
 * `size` is the effect's pixel size, supplied by Owlbear Rodeo as a default
 * uniform. It is guarded so that a zero value degrades to "no vignette"
 * instead of a divide by zero.
 */
export const VIGNETTE_SKSL = `
uniform vec2 size;
uniform float amount;

half4 main(float2 coord) {
  if (size.x <= 0.0 || size.y <= 0.0) {
    return half4(1.0, 1.0, 1.0, 1.0);
  }
  float2 uv = coord / size;
  // Distance from the centre, normalised so the corners sit at 1.0.
  float radius = length(uv - float2(0.5, 0.5)) * 1.4142136;
  float falloff = smoothstep(0.35, 1.0, radius);
  float darken = 1.0 - amount * falloff;
  return half4(half3(darken), 1.0);
}
`;
