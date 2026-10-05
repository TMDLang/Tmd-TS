import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TmdAudioError } from "../src/audio.js";
import { TmdMCPInstaller, TmdMCPServer } from "../src/mcp/index.js";
import { TmdSkill } from "../src/skill.js";
import { TmdParser } from "../src/syntax/index.js";
import { TmdVersion } from "../src/version.js";

describe("canonical Tmd public names", () => {
  it("exposes acronym-consistent names across modules", () => {
    expect(TmdParser).toBeDefined();
    expect(TmdSkill.skillName).toBe("tmd");
    expect(TmdVersion.current).toBe("0.2.3");
    expect(new TmdAudioError("audio")).toBeInstanceOf(Error);
    expect(TmdMCPServer).toBeDefined();
    expect(TmdMCPInstaller).toBeDefined();
  });

  it("does not export legacy TMD-prefixed implementation declarations", () => {
    const sourceRoot = join(import.meta.dirname, "..", "src");
    const sourceFiles = readdirSync(sourceRoot, { recursive: true })
      .filter((file): file is string => file.endsWith(".ts"))
      .map((file) => join(sourceRoot, file));
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/export (class|interface|type|enum|function|const) TMD[A-Z]/);
    }
  });
});
