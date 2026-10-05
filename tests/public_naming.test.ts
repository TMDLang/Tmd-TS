import { describe, expect, it } from "vitest";

import { TMDAudioError } from "../src/audio.js";
import { TMDSkill } from "../src/skill.js";
import { TMDParser } from "../src/syntax/index.js";
import { TMDVersion } from "../src/version.js";

describe("canonical TMD public names", () => {
  it("exposes acronym-consistent names across modules", () => {
    expect(TMDParser).toBeDefined();
    expect(TMDSkill.skillName).toBe("tmd");
    expect(TMDVersion.current).toBe("0.2.2");
    expect(new TMDAudioError("audio")).toBeInstanceOf(Error);
  });
});
