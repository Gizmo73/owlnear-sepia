import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// The extension is served from a GitHub Pages *project* page, which lives at
// https://<user>.github.io/<repo>/ rather than a domain root, so every built
// asset URL has to be prefixed with the repo name.
export default defineConfig({
  base: "/owlnear-sepia/",
  build: {
    rollupOptions: {
      input: {
        // The popover UI shown when the action icon is clicked.
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        // The always-on page that renders the filter for this client.
        background: fileURLToPath(new URL("./background.html", import.meta.url)),
      },
    },
  },
});
