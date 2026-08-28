/**
 * Compiles the extension's SkSL against Skia and checks that the tint really
 * does behave like a sepia filter.
 *
 * A broken shader does not report an error inside Owlbear Rodeo, it just
 * renders nothing, so this runs in CI before the extension is deployed.
 */

import CanvasKitInit from "canvaskit-wasm";
import {
  DEFAULT_SETTINGS,
  TINT_SKSL,
  VIGNETTE_SKSL,
  hexToVector3,
} from "../src/sepia.js";

const CanvasKit = await CanvasKitInit();
const failures = [];

function check(description, condition, detail = "") {
  console.log(`${condition ? "  ok  " : " FAIL "} ${description}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(description);
}

// --- The shaders compile, and expose the uniforms the extension sets --------

function compile(name, sksl, expectedUniforms) {
  const errors = [];
  const effect = CanvasKit.RuntimeEffect.Make(sksl, (error) => errors.push(error));
  check(`${name} compiles`, Boolean(effect), errors.join(" "));
  if (!effect) return undefined;

  const names = [];
  for (let i = 0; i < effect.getUniformCount(); i++) names.push(effect.getUniformName(i));
  check(
    `${name} declares [${expectedUniforms}]`,
    expectedUniforms.every((uniform) => names.includes(uniform)),
    `found [${names}]`,
  );
  return effect;
}

const tint = compile("tint shader", TINT_SKSL, ["tone", "strength"]);
compile("vignette shader", VIGNETTE_SKSL, ["size", "amount"]);

// --- The tint, blended with COLOR, is a sepia tone --------------------------

if (tint) {
  // Grass green, sky blue, stone grey and parchment: typical map colours.
  const backdrop = [[70, 140, 60], [90, 130, 200], [150, 150, 145], [200, 180, 140]];
  const surface = CanvasKit.MakeSurface(backdrop.length, 1);
  const canvas = surface.getCanvas();
  const floats = tint.getUniformFloatCount();

  const render = (hex, strength) => {
    backdrop.forEach(([r, g, b], i) => {
      const paint = new CanvasKit.Paint();
      paint.setColor(CanvasKit.Color(r, g, b, 1));
      paint.setBlendMode(CanvasKit.BlendMode.Src);
      canvas.drawRect(CanvasKit.XYWHRect(i, 0, 1, 1), paint);
    });

    const tone = hexToVector3(hex);
    const uniforms = new Float32Array(floats);
    const [toneSlot, strengthSlot] = [tint.getUniform(0).slot, tint.getUniform(1).slot];
    uniforms[toneSlot] = tone.x;
    uniforms[toneSlot + 1] = tone.y;
    uniforms[toneSlot + 2] = tone.z;
    uniforms[strengthSlot] = strength;

    const paint = new CanvasKit.Paint();
    paint.setShader(tint.makeShader(uniforms));
    paint.setBlendMode(CanvasKit.BlendMode.Color);
    canvas.drawRect(CanvasKit.XYWHRect(0, 0, backdrop.length, 1), paint);

    const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
      width: backdrop.length,
      height: 1,
      colorType: CanvasKit.ColorType.RGBA_8888,
      alphaType: CanvasKit.AlphaType.Unpremul,
      colorSpace: CanvasKit.ColorSpace.SRGB,
    });
    return backdrop.map((_, i) => [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]);
  };

  const luminance = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
  const { tone, strength } = DEFAULT_SETTINGS;

  const untouched = render(tone, 0);
  check(
    "strength 0 leaves the map untouched",
    untouched.every((out, i) => out.every((channel, c) => Math.abs(channel - backdrop[i][c]) <= 1)),
    JSON.stringify(untouched),
  );

  const defaults = render(tone, strength / 100);
  check(
    `the default tone at ${strength}% turns every colour brown`,
    defaults.every(([r, g, b]) => r >= g && g >= b),
    JSON.stringify(defaults),
  );
  check(
    "the map's luminosity survives the tint",
    defaults.every((out, i) => Math.abs(luminance(out) - luminance(backdrop[i])) <= 2),
    defaults.map((out, i) => `${luminance(backdrop[i]).toFixed(0)}->${luminance(out).toFixed(0)}`).join(" "),
  );

  const full = render(tone, 1);
  check(
    "a higher strength tints further",
    full.every(([r, , b], i) => r - b >= defaults[i][0] - defaults[i][2]),
    JSON.stringify(full),
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll shader checks passed.");
