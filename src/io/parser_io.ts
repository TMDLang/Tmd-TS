import * as fs from "node:fs";

import { TmdParserCore } from "../syntax/parser_core.js";
import type { Sheet } from "../syntax/types.js";
import { FilePathNormalizer, TextEncodingDetector } from "../utils/index.js";

/** Adapts encoded bytes and filesystem locations to the pure syntax parser. */
export class TmdParserIO {
  public static parseData(data: Uint8Array): Sheet {
    const result = TextEncodingDetector.detectAndDecode(data);
    if (!result) throw new Error("Could not decode TMD input");
    return TmdParserCore.parseThrowing(result.content);
  }

  public static parseFile(filePathOrURL: string): Sheet {
    const location = FilePathNormalizer.parseLocation(filePathOrURL);
    return this.parseData(fs.readFileSync(location.filePath));
  }

  public static parseURL(fileURL: string): Sheet {
    return this.parseFile(fileURL);
  }
}
