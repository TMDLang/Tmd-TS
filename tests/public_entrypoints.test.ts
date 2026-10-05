import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = join(import.meta.dirname, "..", "src");

describe("public architecture entrypoints", () => {
  it("exposes one explicit entrypoint per responsibility boundary", () => {
    for (const boundary of [
      "syntax",
      "validation",
      "analysis",
      "playback",
      "presentation",
      "io",
      "refactoring",
      "domain",
    ]) {
      expect(existsSync(join(sourceRoot, boundary, "index.ts"))).toBe(true);
    }
  });
});
