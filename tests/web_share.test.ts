import { describe, expect,it } from "vitest";

import { escapeHtml } from "../web/src/html.js";
import { decodeShareHash, encodeShareHash, MAX_SHARED_CHARS } from "../web/src/share.js";

// Builds a share hash without the size check of encodeShareHash, to test the decoder.
async function deflateHash(input: string | Uint8Array): Promise<string> {
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return "#tmd=" + Buffer.from(await new Response(stream).arrayBuffer()).toString("base64url");
}

const ZELDA = `::SCORE::
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

describe("Share by URL hash", () => {
  it("round-trips a score, including CJK text, through a URL-safe hash", async () => {
    for (const text of [ZELDA, "::SCORE::\n** 三天三夜 **\n", ""]) {
      const hash = await encodeShareHash(text);
      expect(hash).toMatch(/^#tmd=[A-Za-z0-9_-]*$/);
      expect(await decodeShareHash(hash)).toBe(text);
    }
  });

  it("returns null when the hash is not a share link", async () => {
    expect(await decodeShareHash("")).toBeNull();
    expect(await decodeShareHash("#")).toBeNull();
    expect(await decodeShareHash("#section-2")).toBeNull();
  });

  it("rejects a damaged payload", async () => {
    await expect(decodeShareHash("#tmd=bm90LWRlZmxhdGU")).rejects.toThrow();
    await expect(decodeShareHash("#tmd=***")).rejects.toThrow();
  });

  it("rejects a payload that is not valid UTF-8, also when it ends inside a character", async () => {
    await expect(decodeShareHash(await deflateHash(Uint8Array.from([0x61, 0xff, 0x62])))).rejects.toThrow();
    await expect(decodeShareHash(await deflateHash(Uint8Array.from([0x61, 0xe3, 0x81])))).rejects.toThrow();
  });

  it("does not encode a score that is longer than the size limit", async () => {
    await expect(encodeShareHash("a".repeat(MAX_SHARED_CHARS + 1))).rejects.toThrow(/too large/);
    const atLimit = "a".repeat(MAX_SHARED_CHARS);
    expect(await decodeShareHash(await encodeShareHash(atLimit))).toBe(atLimit);
  });

  it("rejects a payload that expands past the size limit", async () => {
    const hash = await deflateHash("a".repeat(MAX_SHARED_CHARS + 1));
    await expect(decodeShareHash(hash)).rejects.toThrow(/too large/);
  });

  it("stops reading the stream soon after the text passes the size limit", async () => {
    const hash = await deflateHash("a".repeat(MAX_SHARED_CHARS * 10));
    const RealDecompressionStream = globalThis.DecompressionStream;
    let bytesRead = 0;
    // Counts the decompressed bytes that the decoder reads. Each "a" is one byte.
    class CountingDecompressionStream {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<BufferSource>;
      constructor(format: CompressionFormat) {
        const real = new RealDecompressionStream(format);
        this.writable = real.writable;
        this.readable = real.readable.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              bytesRead += chunk.length;
              controller.enqueue(chunk);
            },
          })
        );
      }
    }
    globalThis.DecompressionStream = CountingDecompressionStream as unknown as typeof DecompressionStream;
    try {
      await expect(decodeShareHash(hash)).rejects.toThrow(/too large/);
    } finally {
      globalThis.DecompressionStream = RealDecompressionStream;
    }
    // A decoder that inflates the whole payload first reads MAX_SHARED_CHARS * 10 bytes.
    expect(bytesRead).toBeLessThan(MAX_SHARED_CHARS * 2);
  });
});

describe("escapeHtml", () => {
  it("escapes characters that can start markup or leave an attribute", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;"
    );
    expect(escapeHtml(42)).toBe("42");
  });
});
