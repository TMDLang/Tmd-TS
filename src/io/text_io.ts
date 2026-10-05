import * as fs from "node:fs";

/** Shared UTF-8 text input/output used by command-line subcommands. */
export function readUTF8(path: string): string {
  return fs.readFileSync(path, "utf-8");
}

export function writeUTF8(path: string, content: string): void {
  fs.writeFileSync(path, content, "utf-8");
}
