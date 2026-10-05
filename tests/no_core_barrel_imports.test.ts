import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = join(import.meta.dirname, "..");

function sourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("core public surface", () => {
  it("does not use the compatibility core barrel from production consumers", () => {
    const files = [
      ...sourceFiles(join(projectRoot, "src")),
      ...sourceFiles(join(projectRoot, "web", "src")),
    ].filter((file) => !file.endsWith("src/core/index.ts"));

    const offenders = files.filter((file) =>
      readFileSync(file, "utf8").includes("core/index.js")
    );
    expect(offenders).toEqual([]);
  });
});
