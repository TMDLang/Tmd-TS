import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
export interface McpServerConfigEntry {
  command: string;
  args: string[];
}

export class TmdMCPInstaller {
  public static defaultConfigPaths(): string[] {
    const home = os.homedir();
    const isMac = process.platform === "darwin";

    const paths: string[] = [];

    // Claude Desktop
    if (isMac) {
      paths.push(
        path.join(
          home,
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json"
        )
      );
    } else if (process.platform === "win32") {
      const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
      paths.push(path.join(appData, "Claude", "claude_desktop_config.json"));
    } else {
      paths.push(
        path.join(home, ".config", "claude", "claude_desktop_config.json")
      );
    }

    // Cursor
    paths.push(path.join(home, ".cursor", "mcp.json"));

    // Gemini / Antigravity
    paths.push(path.join(home, ".gemini", "config", "mcp_config.json"));
    paths.push(path.join(home, ".gemini", "antigravity-cli", "mcp_config.json"));

    // Windsurf / VSCode
    paths.push(path.join(home, ".codeium", "windsurf", "mcp_config.json"));

    return paths;
  }

  public static installToConfigPath(
    configPath: string,
    serverEntry: McpServerConfigEntry = { command: "tmd", args: ["--mcp"] }
  ): { path: string; installed: boolean; error?: string } {
    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let config: any = {};
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, "utf-8");
          config = JSON.parse(raw);
        } catch {
          config = {};
        }
      }

      if (!config.mcpServers || typeof config.mcpServers !== "object") {
        config.mcpServers = {};
      }

      config.mcpServers.tmd = serverEntry;

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      return { path: configPath, installed: true };
    } catch (err: any) {
      return { path: configPath, installed: false, error: err.message || String(err) };
    }
  }

  public static installAll(
    paths: string[] = TmdMCPInstaller.defaultConfigPaths(),
    serverEntry?: McpServerConfigEntry
  ): { path: string; installed: boolean; error?: string }[] {
    return paths.map((p) => TmdMCPInstaller.installToConfigPath(p, serverEntry));
  }
}
