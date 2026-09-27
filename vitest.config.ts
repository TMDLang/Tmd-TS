import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@codemirror\/(.*)$/, replacement: path.resolve(__dirname, "web/node_modules/@codemirror/$1") },
      { find: /^codemirror$/, replacement: path.resolve(__dirname, "web/node_modules/codemirror") },
      { find: /^jzz$/, replacement: path.resolve(__dirname, "web/node_modules/jzz") },
      { find: /^jzz-synth-tiny$/, replacement: path.resolve(__dirname, "web/node_modules/jzz-synth-tiny") },
      { find: /^jzz-midi-smf$/, replacement: path.resolve(__dirname, "web/node_modules/jzz-midi-smf") },
      { find: /^soundfont-player$/, replacement: path.resolve(__dirname, "web/node_modules/soundfont-player") },
    ],
  },
});
