import * as zlib from "node:zlib";

export type TmdStudioShareErrorCode =
  | "scoreTooLarge"
  | "invalidShareHash"
  | "invalidUTF8Payload";

export class TmdStudioShareError extends Error {
  public readonly code: TmdStudioShareErrorCode;

  constructor(message: string, code: TmdStudioShareErrorCode) {
    super(message);
    this.name = "TmdStudioShareError";
    this.code = code;
  }
}

/**
 * Encodes and decodes TMD Studio share links (`#tmd=<base64url(deflate-raw(utf8))>`).
 */
export class TmdStudioShare {
  public static readonly hashPrefix = "#tmd=";
  public static readonly defaultBaseURL = "https://tmdlang.github.io/Tmd-TS/";
  public static readonly maxSharedChars = 1_000_000;

  /**
   * Encodes a TMD score string into a URL hash (`#tmd=...`) compatible with TMD Studio.
   */
  public static encodeShareHash(text: string): string {
    if (text.length > TmdStudioShare.maxSharedChars) {
      throw new TmdStudioShareError("Shared score is too large", "scoreTooLarge");
    }
    const utf8Bytes = Buffer.from(text, "utf-8");
    const compressed = zlib.deflateRawSync(utf8Bytes);
    return TmdStudioShare.hashPrefix + TmdStudioShare.base64URLEncode(compressed);
  }

  /**
   * Decodes a TMD Studio URL hash (`#tmd=...`) back into the original TMD score string.
   * Returns `null` when `hash` does not start with `#tmd=`.
   */
  public static decodeShareHash(hash: string): string | null {
    if (!hash.startsWith(TmdStudioShare.hashPrefix)) {
      return null;
    }
    const encoded = hash.slice(TmdStudioShare.hashPrefix.length);
    const compressed = TmdStudioShare.base64URLDecode(encoded);
    if (!compressed) {
      throw new TmdStudioShareError(
        "Invalid or damaged TMD Studio share link",
        "invalidShareHash"
      );
    }

    let decompressed: Buffer;
    try {
      decompressed = zlib.inflateRawSync(compressed, {
        maxOutputLength: TmdStudioShare.maxSharedChars * 4 + 4,
      });
    } catch (error: any) {
      if (error && error.code === "ERR_BUFFER_TOO_LARGE") {
        throw new TmdStudioShareError("Shared score is too large", "scoreTooLarge");
      }
      throw new TmdStudioShareError(
        "Invalid or damaged TMD Studio share link",
        "invalidShareHash"
      );
    }

    let text: string;
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      text = decoder.decode(decompressed);
    } catch {
      throw new TmdStudioShareError(
        "Decoded share payload is not valid UTF-8",
        "invalidUTF8Payload"
      );
    }

    if (text.length > TmdStudioShare.maxSharedChars) {
      throw new TmdStudioShareError("Shared score is too large", "scoreTooLarge");
    }
    return text;
  }

  /**
   * Generates a complete TMD Studio share URL for the given TMD score text.
   */
  public static generateStudioURL(
    text: string,
    baseURL: string = TmdStudioShare.defaultBaseURL
  ): string {
    const hash = TmdStudioShare.encodeShareHash(text);
    const normalizedBase = TmdStudioShare.normalizeBaseURL(baseURL);
    return normalizedBase + hash;
  }

  public static base64URLEncode(data: Uint8Array): string {
    return Buffer.from(data)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  public static base64URLDecode(encoded: string): Buffer | null {
    if (!/^[A-Za-z0-9_-]*$/.test(encoded)) {
      return null;
    }
    const remainder = encoded.length % 4;
    if (remainder === 1) {
      return null;
    }
    let padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    if (remainder > 0) {
      padded += "=".repeat(4 - remainder);
    }
    return Buffer.from(padded, "base64");
  }

  private static normalizeBaseURL(rawBaseURL: string): string {
    const trimmed = rawBaseURL.trim();
    const hashIndex = trimmed.indexOf("#");
    const withoutFragment = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
    if (withoutFragment.length === 0) {
      return TmdStudioShare.defaultBaseURL;
    }
    const lower = withoutFragment.toLowerCase();
    if (
      withoutFragment.endsWith("/") ||
      withoutFragment.includes("?") ||
      lower.endsWith(".html") ||
      lower.endsWith(".htm")
    ) {
      return withoutFragment;
    }
    return `${withoutFragment}/`;
  }
}
