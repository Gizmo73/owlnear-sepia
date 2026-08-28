# Sepia Filter — an Owlbear Rodeo extension

Applies an adjustable sepia tone to every map in the current scene, so a
battle map can be aged like an old photograph without editing the image.

**Install URL**

```
https://gizmo73.github.io/owlnear-sepia/manifest.json
```

Paste that into Owlbear Rodeo under *Profile → Extensions → Add Custom
Extension*.

## Controls

Open the scene, then click the **Sepia Filter** action in the toolbar.

| Control      | What it does                                                        |
| ------------ | ------------------------------------------------------------------- |
| **Sepia filter** | Turns the whole effect on and off.                              |
| **Strength** | How much of the map's own colour is replaced by the sepia tone, 0–100%. |
| **Tone**     | The sepia colour itself. Four presets, or any colour you like.       |
| **Vignette** | Darkens the edges of each map, 0–100%.                              |
| **Blend**    | How the tone is combined with the map — see below.                  |

The blend modes age a map differently:

- **Tone (classic sepia)** — replaces the map's hue and saturation, keeping its
  brightness. This is the textbook sepia tone and the default.
- **Wash (warm, darker)** — multiplies the tone into the map, which tints and
  darkens together.
- **Overlay (high contrast)** — pushes shadows and highlights apart.
- **Soft light (subtle)** — a gentler wash.

Settings are stored on the scene, so they are saved with it and shared with
the table. Only the GM can change them.

## How it works

Owlbear Rodeo images have no colour filter property, so the tint is not a
change to the map image. Instead the extension adds
[Effect items](https://docs.owlbear.rodeo/extensions/reference/items/effect/) —
SkSL shaders composited over the map with a Skia blend mode:

- `effectType: "ATTACHMENT"` means each effect fills the bounds of the map it
  is attached to, so it follows the map as it is moved, scaled or deleted, with
  no geometry maths in the extension.
- The effects sit on the `MAP` layer above the maps, so the grid, tokens, notes
  and fog above them are left alone. Only the maps are tinted.
- The map image itself is never modified, so removing the extension — or just
  switching the filter off — restores the scene exactly.

Effect items can only be added to the *local* scene, meaning each client has to
draw its own copy of the filter. That is what `background.html` is for: it runs
in every connected client for as long as the extension is installed, watches
the shared settings in the scene metadata, and reconciles the local effects to
match. The popover only ever writes settings.

**Because effects are local, every player who wants to see the sepia tone needs
the extension installed.** Players without it see the scene untinted.

## Development

```bash
npm install
npm run dev      # vite dev server
npm run verify   # compile the shaders and check the sepia maths
npm run build    # runs verify, then builds to dist/
```

`npm run verify` compiles both shaders with CanvasKit — the same Skia engine
Owlbear Rodeo renders with — and asserts that the tint preserves the map's
luminosity while turning every colour brown. A broken shader renders nothing in
Owlbear Rodeo rather than reporting an error, so this check runs before every
build and in CI.

### Hosting

The extension is served from GitHub Pages by `.github/workflows/deploy.yml` on
every push to `main`. Two details matter for a *project* page, which is served
from a subpath rather than a domain root:

1. `vite.config.js` sets `base: "/owlnear-sepia/"` so built asset URLs resolve.
2. `public/manifest.json` uses absolute URLs for `icon`, `popover` and
   `background_url`, which sidesteps relative-path resolution against that
   subpath entirely.

If you fork this, change both to match your own user and repository name.

Note that submitting an extension to the Owlbear Rodeo store requires the
manifest to be hosted on a custom domain the developer controls; GitHub Pages
is fine for private use.
