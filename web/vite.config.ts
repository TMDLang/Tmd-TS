import path from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "node:fs": path.resolve(__dirname, "src/shims/node-shim.ts"),
      "node:path": path.resolve(__dirname, "src/shims/node-shim.ts"),
      "node:os": path.resolve(__dirname, "src/shims/node-shim.ts"),
    },
  },
  worker: {
    format: "es",
  },
});
