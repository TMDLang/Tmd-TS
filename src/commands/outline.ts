import { readUTF8 } from "../io/text_io.js";
import { TMDOutlineGenerator, TMDOutlineNode } from "../presentation/index.js";

export function handleOutlineCommand(argv: string[]): number {
  let inputPath: string | undefined;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(`USAGE: tmd outline [--json] <input-path>

Generate a document symbol outline of a TMD score.

OPTIONS:
  --json                  Output outline as JSON.
`);
      return 0;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (!arg.startsWith("-")) {
      inputPath = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      return 2;
    }
  }

  if (!inputPath) {
    console.error("Error: Missing expected argument '<input-path>' for outline");
    return 2;
  }

  let content: string;
  try {
    content = readUTF8(inputPath);
  } catch (error: any) {
    console.error(`Error reading ${inputPath}: ${error.message || String(error)}`);
    return 1;
  }

  const nodes = TMDOutlineGenerator.generate(content);
  if (json) {
    console.log(JSON.stringify(nodes, null, 2));
  } else {
    function printNode(node: TMDOutlineNode, indent: number) {
      const pad = "  ".repeat(indent);
      let line = `${pad}- [${node.kind}] ${node.name}`;
      if (node.detail) line += ` (${node.detail})`;
      line += ` [L${node.range.startLine}:C${node.range.startColumn} - L${node.range.endLine}:C${node.range.endColumn}]`;
      console.log(line);
      if (node.children) node.children.forEach((child) => printNode(child, indent + 1));
    }
    nodes.forEach((node) => printNode(node, 0));
  }
  return 0;
}
