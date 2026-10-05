import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readUTF8, writeUTF8 } from "../src/io/text_io.js";

describe("shared CLI text I/O", () => {
  it("round-trips UTF-8 content", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-text-io-"));
    const filePath = path.join(directory, "score.tmd");
    try {
      const content = "中文 🎵\n";
      writeUTF8(filePath, content);
      expect(readUTF8(filePath)).toBe(content);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
