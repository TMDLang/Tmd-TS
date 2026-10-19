import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";

import { describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";
import { TmdStudioShare, TmdStudioShareError } from "../src/index.js";

const zeldaSample = `::SCORE::
** Zelda's Lullaby **
!= 100
?= C
<4/4>

lullaby:ocarina@|0|{
    <4*>
    7_ - 2 6_ - (5_6_)%(-) 7_ - 2 6_ - 0
    2^ - (1^ 7 1^ 7)%(--) 5 -
}

-> lullaby -> lullaby ->#
`;

describe("TmdStudioShare and tmd studio-url subcommand (Issue #78)", () => {
  it("round-trips scores including CJK text through a URL-safe hash", () => {
    for (const text of [zeldaSample, "::SCORE::\n** 三天三夜 **\n", ""]) {
      const hash = TmdStudioShare.encodeShareHash(text);
      expect(hash.startsWith("#tmd=")).toBe(true);
      const payload = hash.slice("#tmd=".length);
      expect(payload).toMatch(/^[A-Za-z0-9_-]*$/);
      const decoded = TmdStudioShare.decodeShareHash(hash);
      expect(decoded).toBe(text);
    }
  });

  it("decodes reference deflate-raw share hashes produced by Tmd-TS Web Studio and TmdSwift", () => {
    expect(TmdStudioShare.decodeShareHash("#tmd=AwA")).toBe("");
    expect(
      TmdStudioShare.decodeShareHash("#tmd=s7IKdvYPcrWy4tLSUniyo_PpkpVgco6ClhYXAA")
    ).toBe("::SCORE::\n** 三天三夜 **\n");
    expect(
      TmdStudioShare.decodeShareHash(
        "#tmd=s7IKdvYPcrWy4tLSUohKzUlJVC9W8CnNyUlMqlTQ0uJStFUwNDDgsrdVcOayMdE3sePiyoHIWuUnJxZl5iU61BjUVHMpAIGNiZYdmGEer6CrYKRgBqI0TOPN4jVVNXQ1UYQNwAqN4kAqDOMUzBVABEgZUJ2pgi5XLReXrp0C1CoFFKYyFwA"
      )
    ).toBe(zeldaSample);
  });

  it("returns null when the hash is not a TMD share link", () => {
    expect(TmdStudioShare.decodeShareHash("")).toBeNull();
    expect(TmdStudioShare.decodeShareHash("#")).toBeNull();
    expect(TmdStudioShare.decodeShareHash("#section-2")).toBeNull();
  });

  it("rejects damaged deflate-raw or base64url payloads", () => {
    expect(() => TmdStudioShare.decodeShareHash("#tmd=bm90LWRlZmxhdGU")).toThrow(
      TmdStudioShareError
    );
    expect(() => TmdStudioShare.decodeShareHash("#tmd=***")).toThrow(TmdStudioShareError);
    expect(() => TmdStudioShare.decodeShareHash("#tmd=A")).toThrow(TmdStudioShareError);
  });

  it("rejects a payload that is not valid UTF-8", () => {
    const invalidUTF8A = zlib.deflateRawSync(Buffer.from([0x61, 0xff, 0x62]));
    const hashA = "#tmd=" + TmdStudioShare.base64URLEncode(invalidUTF8A);
    expect(() => TmdStudioShare.decodeShareHash(hashA)).toThrow(
      /Decoded share payload is not valid UTF-8/
    );

    const truncatedUTF8 = zlib.deflateRawSync(Buffer.from([0x61, 0xe3, 0x81]));
    const hashB = "#tmd=" + TmdStudioShare.base64URLEncode(truncatedUTF8);
    expect(() => TmdStudioShare.decodeShareHash(hashB)).toThrow(
      /Decoded share payload is not valid UTF-8/
    );
  });

  it("enforces maxSharedChars limit on encode and decode", () => {
    const overLimit = "a".repeat(TmdStudioShare.maxSharedChars + 1);
    expect(() => TmdStudioShare.encodeShareHash(overLimit)).toThrow(
      /Shared score is too large/
    );

    const atLimit = "a".repeat(TmdStudioShare.maxSharedChars);
    const encodedAtLimit = TmdStudioShare.encodeShareHash(atLimit);
    expect(TmdStudioShare.decodeShareHash(encodedAtLimit)).toBe(atLimit);

    const compressedOverLimit = zlib.deflateRawSync(Buffer.from(overLimit, "utf-8"));
    const overLimitHash = "#tmd=" + TmdStudioShare.base64URLEncode(compressedOverLimit);
    expect(() => TmdStudioShare.decodeShareHash(overLimitHash)).toThrow(
      /Shared score is too large/
    );
  });

  it("generates full TMD Studio URL with default and custom base URLs", () => {
    const text = "::SCORE::\n** 三天三夜 **\n";
    const defaultURL = TmdStudioShare.generateStudioURL(text);
    expect(defaultURL.startsWith("https://tmdlang.github.io/Tmd-TS/#tmd=")).toBe(true);
    const hashPart = defaultURL.slice("https://tmdlang.github.io/Tmd-TS/".length);
    expect(TmdStudioShare.decodeShareHash(hashPart)).toBe(text);

    const customURL = TmdStudioShare.generateStudioURL(text, "https://example.com/studio");
    expect(customURL.startsWith("https://example.com/studio/#tmd=")).toBe(true);

    const htmlURL = TmdStudioShare.generateStudioURL(
      text,
      "https://example.com/studio/index.html#old"
    );
    expect(htmlURL.startsWith("https://example.com/studio/index.html#tmd=")).toBe(true);
  });

  it("supports CLI studio-url subcommand with default and custom --base-url", () => {
    const source = `::SCORE::
** CLI Studio URL Test **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4 |
}

-> intro ->#
`;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-studio-url-test-"));
    const tmdPath = path.join(tempDir, "score.tmd");
    fs.writeFileSync(tmdPath, source, "utf-8");

    try {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const code1 = main(["studio-url", tmdPath]);
        expect(code1).toBe(0);
        const output1 = String(logSpy.mock.calls.at(-1)?.[0] ?? "").trim();
        expect(output1.startsWith("https://tmdlang.github.io/Tmd-TS/#tmd=")).toBe(true);
        const hashPart = output1.slice("https://tmdlang.github.io/Tmd-TS/".length);
        expect(TmdStudioShare.decodeShareHash(hashPart)).toBe(source);

        logSpy.mockClear();
        const code2 = main([
          "studio-url",
          "--base-url",
          "https://studio.example.org/app",
          tmdPath,
        ]);
        expect(code2).toBe(0);
        const output2 = String(logSpy.mock.calls.at(-1)?.[0] ?? "").trim();
        expect(output2.startsWith("https://studio.example.org/app/#tmd=")).toBe(true);

        const missingCode = main(["studio-url", path.join(tempDir, "missing.tmd")]);
        expect(missingCode).not.toBe(0);
      } finally {
        logSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
