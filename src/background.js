/**
 * Runs in every connected client for as long as the extension is installed,
 * whether or not the popover is open. It mirrors the settings held in the
 * scene metadata into local Effect items, one pair per map.
 */

import OBR, { buildEffect, isImage } from "@owlbear-rodeo/sdk";
import {
  EFFECT_KEY,
  SETTINGS_KEY,
  TINT_SKSL,
  VIGNETTE_SKSL,
  hexToVector3,
  normaliseSettings,
} from "./sepia.js";

/**
 * A map is an image on the MAP layer. Sitting the effects on that same layer
 * keeps the tint below the grid, tokens and fog, so only the map is aged.
 */
function isMap(item) {
  return item.layer === "MAP" && isImage(item);
}

function isOurEffect(item) {
  return Boolean(item.metadata && item.metadata[EFFECT_KEY]);
}

function effectKeyOf(item) {
  const tag = item.metadata[EFFECT_KEY];
  return tag && typeof tag === "object" ? `${tag.role}:${tag.mapId}` : undefined;
}

/**
 * Build the list of effects the current settings call for. Each entry is
 * attached to a map, so Owlbear Rodeo sizes it to that map's bounds and keeps
 * it in step as the map is moved, scaled or removed.
 */
function planEffects(maps, settings, baseZIndex) {
  const plan = [];
  const strength = settings.strength / 100;
  const vignette = settings.vignette / 100;

  for (const map of maps) {
    if (strength > 0) {
      plan.push({
        key: `tint:${map.id}`,
        role: "tint",
        mapId: map.id,
        name: `Sepia tint (${map.name})`,
        sksl: TINT_SKSL,
        blendMode: settings.blendMode,
        zIndex: baseZIndex + 1,
        uniforms: [
          { name: "tone", value: hexToVector3(settings.tone) },
          { name: "strength", value: strength },
        ],
      });
    }
    if (vignette > 0) {
      plan.push({
        key: `vignette:${map.id}`,
        role: "vignette",
        mapId: map.id,
        name: `Sepia vignette (${map.name})`,
        sksl: VIGNETTE_SKSL,
        blendMode: "MULTIPLY",
        zIndex: baseZIndex + 2,
        uniforms: [{ name: "amount", value: vignette }],
      });
    }
  }
  return plan;
}

function buildItem(spec) {
  return buildEffect()
    .effectType("ATTACHMENT")
    .attachedTo(spec.mapId)
    .sksl(spec.sksl)
    .uniforms(spec.uniforms)
    .blendMode(spec.blendMode)
    .layer("MAP")
    .zIndex(spec.zIndex)
    .disableAutoZIndex(true)
    .disableHit(true)
    .locked(true)
    // A copied map should not drag a stale local effect along with it; the
    // next reconcile creates a fresh one for the copy instead. The effect stays
    // locked regardless of whether the map itself is.
    .disableAttachmentBehavior(["COPY", "LOCKED"])
    .name(spec.name)
    .metadata({ [EFFECT_KEY]: { role: spec.role, mapId: spec.mapId } })
    .build();
}

let running = false;
let queued = false;

async function reconcile() {
  // Coalesce overlapping runs: item and metadata changes can arrive in bursts.
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    do {
      queued = false;
      await reconcileOnce();
    } while (queued);
  } catch (error) {
    console.error("[Sepia Filter] failed to update the filter", error);
  } finally {
    running = false;
  }
}

async function reconcileOnce() {
  const existing = await OBR.scene.local.getItems(isOurEffect);

  if (!(await OBR.scene.isReady())) {
    // Local items are cleared with the scene, but drop any stragglers.
    if (existing.length > 0) {
      await OBR.scene.local.deleteItems(existing.map((item) => item.id));
    }
    return;
  }

  const metadata = await OBR.scene.getMetadata();
  const settings = normaliseSettings(metadata[SETTINGS_KEY]);
  const maps = settings.enabled ? await OBR.scene.items.getItems(isMap) : [];
  const baseZIndex = maps.reduce((max, map) => Math.max(max, map.zIndex), 0);
  const plan = planEffects(maps, settings, baseZIndex);

  const wanted = new Map(plan.map((spec) => [spec.key, spec]));
  const present = new Map();
  const stale = [];
  for (const item of existing) {
    const key = effectKeyOf(item);
    // Also drops duplicates, keeping the first item seen for a given key.
    if (key && wanted.has(key) && !present.has(key)) {
      present.set(key, item);
    } else {
      stale.push(item.id);
    }
  }

  if (stale.length > 0) {
    await OBR.scene.local.deleteItems(stale);
  }

  const toAdd = plan.filter((spec) => !present.has(spec.key));
  if (toAdd.length > 0) {
    await OBR.scene.local.addItems(toAdd.map(buildItem));
  }

  // Update in place rather than recreating, so changing a slider does not
  // make the map flicker.
  const toUpdate = [...present.values()];
  if (toUpdate.length > 0) {
    await OBR.scene.local.updateItems(toUpdate, (draft) => {
      for (const item of draft) {
        const spec = wanted.get(effectKeyOf(item));
        if (!spec) continue;
        item.uniforms = spec.uniforms;
        item.blendMode = spec.blendMode;
        item.zIndex = spec.zIndex;
        item.name = spec.name;
      }
    });
  }
}

/**
 * Maps changing (added, removed, restacked) is what we care about; a token
 * being dragged is not. Attachment keeps the effects aligned on its own, so
 * only re-run when the set of maps or their stacking actually differs.
 */
let lastMapSignature = "";

function onSceneItemsChanged(items) {
  const signature = items
    .filter(isMap)
    .map((item) => `${item.id}:${item.zIndex}`)
    .sort()
    .join("|");
  if (signature === lastMapSignature) return;
  lastMapSignature = signature;
  reconcile();
}

OBR.onReady(() => {
  OBR.scene.onReadyChange((ready) => {
    lastMapSignature = "";
    if (ready) reconcile();
  });
  OBR.scene.onMetadataChange(() => reconcile());
  OBR.scene.items.onChange(onSceneItemsChanged);
  reconcile();
});
