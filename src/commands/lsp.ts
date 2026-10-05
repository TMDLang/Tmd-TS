import { TmdJSONRPCCodec, TmdLSPServer } from "../lsp/index.js";

export function handleLSPCommand(argv: string[]): number {
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      console.log(`USAGE: tmd lsp

Run the TMD Language Server Protocol (LSP) daemon communicating over standard I/O (JSON-RPC).
`);
      return 0;
    }
  }
  return runLSPServer();
}

export function runLSPServer(): number {
  const server = new TmdLSPServer((data) => process.stdout.write(data));
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { frames, remaining } = TmdJSONRPCCodec.decodeBuffer(buffer);
    buffer = Buffer.from(remaining);
    for (const frame of frames) server.handle(frame);
    if (!server.isRunning) process.exit(0);
  });
  process.stdin.on("end", () => process.exit(0));
  return 0;
}
