import { TmdMcpCore } from "../../../src/mcp/handlers.js";
import { TmdSkill } from "../../../src/skill.js";

export interface TmdWebMcpContext {
  getCurrentScore: () => string;
  loadScoreToEditor: (text: string) => void;
  startPlayback?: () => void;
}

export interface BuildTmdWebMcpOptions {
  autoLoadSkill?: boolean;
}

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
}

export interface WebMcpResource {
  name: string;
  description: string;
  options: {
    uri?: string;
    uriTemplate?: string;
    mimeType: string;
  };
  provide: (uri: string) => Promise<{
    contents: Array<{ uri: string; text: string; mimeType: string }>;
  }>;
}

export interface WebMcpPrompt {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required?: boolean }>;
  execute: (args: Record<string, any>) => Promise<{
    messages: Array<{
      role: "user" | "assistant";
      content: { type: "text"; text: string };
    }>;
  }>;
}

const textContent = (text: string, extraTexts: string[] = []) => ({
  content: [
    {
      type: "text" as const,
      text,
    },
    ...extraTexts.map((extra) => ({
      type: "text" as const,
      text: extra,
    })),
  ],
});

const TMD_PREREQUISITE_NOTE =
  "Prerequisite: You MUST call getTmdSkill first in this session if you have not loaded the TMD language specification yet.";

export const buildTmdWebMcpTools = (
  ctx: TmdWebMcpContext,
  options: BuildTmdWebMcpOptions = {}
): WebMcpTool[] => {
  const autoLoadSkill = options.autoLoadSkill ?? true;
  let skillLoaded = !autoLoadSkill;

  const consumeAutoSkillBlocks = (): string[] => {
    if (skillLoaded) {
      return [];
    }
    skillLoaded = true;
    return [
      `[Auto-loaded TMD Language Skill (getTmdSkill)]\n\n${TmdSkill.skillMarkdown}`,
    ];
  };

  return [
    {
      name: "getTmdSkill",
      description:
        "IMPORTANT — CALL THIS TOOL FIRST before writing, editing, parsing, checking, or loading any TMD score. Returns the complete TMD (Timebase Mark Down) language specification, syntax rules, and prompt engineering skill. Core structure: header (`::SCORE::`, `** Title **`, `!= 120`, `?= C`, `<4/4>`), sections (`intro:Piano@|0|{ <4*> | 1 2 3 4 | }`), and playback order (`-> intro ->#`).",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        skillLoaded = true;
        return textContent(TmdSkill.skillMarkdown);
      },
    },
    {
      name: "parseTmd",
      description: `Parse and validate TMD score text. Returns AST summary, metadata (title, BPM, key, time signature), tracks, or structured syntax errors with line/column/expectedTokens. ${TMD_PREREQUISITE_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "TMD score source code text",
          },
        },
        required: ["text"],
      },
      handler: async ({ text }) => {
        const extraBlocks = consumeAutoSkillBlocks();
        return textContent(JSON.stringify(TmdMcpCore.parseTmdText(text), null, 2), extraBlocks);
      },
    },
    {
      name: "checkTmd",
      description: `Check and validate TMD score syntax, measures, beat consistency, and section lengths. Identifies both syntax errors and measure-level rhythm discrepancies. ${TMD_PREREQUISITE_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "TMD score source code text",
          },
        },
        required: ["text"],
      },
      handler: async ({ text }) => {
        const extraBlocks = consumeAutoSkillBlocks();
        try {
          const result = TmdMcpCore.checkTmdText(text, { includeSyntaxCheck: true });
          return textContent(JSON.stringify(result, null, 2), extraBlocks);
        } catch (err: any) {
          return textContent(
            JSON.stringify({
              valid: false,
              syntaxValid: false,
              error: err.message || String(err),
            }),
            extraBlocks
          );
        }
      },
    },
    {
      name: "convertTmd",
      description: `Convert TMD score text to target music formats: midi (base64 encoded), reaper (.rpp), musicxml, lilypond, abc, chordpro (.cho), braille (.brl/.brf), vsq (base64), or vsqx. ${TMD_PREREQUISITE_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "TMD score source code text",
          },
          format: {
            type: "string",
            enum: [
              "midi",
              "musicxml",
              "lilypond",
              "abc",
              "reaper",
              "rpp",
              "chordpro",
              "cho",
              "braille",
              "brl",
              "brf",
              "vsq",
              "vsqx",
            ],
            description:
              "Target export format: midi (base64), reaper (rpp), musicxml, lilypond, abc, chordpro (cho), braille (brl/brf), vsq (base64), vsqx",
          },
          section: {
            type: "string",
            description: "Optional section/paragraph name filter",
          },
          instrument: {
            type: "string",
            description: "Optional instrument track filter",
          },
        },
        required: ["text", "format"],
      },
      handler: async ({ text, format, section, instrument }) => {
        const extraBlocks = consumeAutoSkillBlocks();
        const converted = TmdMcpCore.convertTmdText(text, {
          format,
          defaultFormat: "musicxml",
          section,
          instrument,
        });
        return textContent(
          converted.kind === "binary" ? converted.base64 : converted.text,
          extraBlocks
        );
      },
    },
    {
      name: "getCurrentScore",
      description: `Get the current TMD score text currently open in the TMD Studio browser editor. ${TMD_PREREQUISITE_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const extraBlocks = consumeAutoSkillBlocks();
        return textContent(ctx.getCurrentScore(), extraBlocks);
      },
    },
    {
      name: "loadScoreToEditor",
      description: `Push generated or edited TMD score text into the TMD Studio web editor, and optionally start playback. ${TMD_PREREQUISITE_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "TMD score text to load into the web editor",
          },
          play: {
            type: "boolean",
            description: "Whether to immediately start playback after loading",
          },
        },
        required: ["text"],
      },
      handler: async ({ text, play }) => {
        const extraBlocks = consumeAutoSkillBlocks();
        ctx.loadScoreToEditor(text);
        if (play && ctx.startPlayback) {
          ctx.startPlayback();
        }
        return textContent("TMD score loaded into editor successfully.", extraBlocks);
      },
    },
  ];
};

export const buildTmdWebMcpResources = (ctx: TmdWebMcpContext): WebMcpResource[] => [
  {
    name: "tmd-skill",
    description:
      "Complete TMD (Timebase Mark Down) language specification, syntax grammar, and arrangement best practices.",
    options: {
      uri: "tmd://skill",
      mimeType: "text/markdown",
    },
    provide: async (uri: string) => ({
      contents: [
        {
          uri: uri || "tmd://skill",
          text: TmdSkill.skillMarkdown,
          mimeType: "text/markdown",
        },
      ],
    }),
  },
  {
    name: "tmd-current-score",
    description: "Current TMD score source text open in the TMD Studio browser editor.",
    options: {
      uri: "tmd://score/current",
      mimeType: "text/plain",
    },
    provide: async (uri: string) => ({
      contents: [
        {
          uri: uri || "tmd://score/current",
          text: ctx.getCurrentScore(),
          mimeType: "text/plain",
        },
      ],
    }),
  },
];

export const buildTmdWebMcpPrompts = (ctx: TmdWebMcpContext): WebMcpPrompt[] => [
  {
    name: "tmd-composer",
    description:
      "Preload the full TMD language skill specification and the current editor score into the conversation.",
    arguments: [
      {
        name: "instruction",
        description: "Optional musical composition or editing task instruction",
        required: false,
      },
    ],
    execute: async (args: Record<string, any> = {}) => {
      const currentScore = ctx.getCurrentScore();
      const userTask = args?.instruction
        ? `\n\n## Requested Task\n${args.instruction}`
        : "";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${TmdSkill.skillMarkdown}\n\n## Current Score in TMD Studio Editor\n\`\`\`tmd\n${currentScore}\n\`\`\`${userTask}`,
            },
          },
        ],
      };
    },
  },
];

export const registerNativeWebMcp = (globalScope: any, tools: WebMcpTool[]): boolean => {
  const modelContext = globalScope.navigator?.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return false;
  }

  tools.forEach((tool) => {
    modelContext.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: tool.handler,
    });
  });
  return true;
};

export const registerBridgeWebMcp = (
  globalScope: any,
  tools: WebMcpTool[],
  resources: WebMcpResource[] = [],
  prompts: WebMcpPrompt[] = []
): boolean => {
  if (typeof globalScope.WebMCP !== "function") {
    return false;
  }

  const mcp =
    globalScope.tmdWebMcp ||
    new globalScope.WebMCP({
      color: "#58a6ff",
      position: "bottom-right",
    });

  tools.forEach((tool) => {
    mcp.registerTool(tool.name, tool.description, tool.inputSchema, tool.handler);
  });

  if (typeof mcp.registerResource === "function") {
    resources.forEach((res) => {
      mcp.registerResource(res.name, res.description, res.options, res.provide);
    });
  }

  if (typeof mcp.registerPrompt === "function") {
    prompts.forEach((prompt) => {
      mcp.registerPrompt(prompt.name, prompt.description, prompt.arguments, prompt.execute);
    });
  }

  globalScope.tmdWebMcp = mcp;
  return true;
};

export const initTmdWebMcp = (globalScope: any, ctx: TmdWebMcpContext) => {
  const tools = buildTmdWebMcpTools(ctx, { autoLoadSkill: true });
  const resources = buildTmdWebMcpResources(ctx);
  const prompts = buildTmdWebMcpPrompts(ctx);
  return {
    nativeRegistered: registerNativeWebMcp(globalScope, tools),
    bridgeRegistered: registerBridgeWebMcp(globalScope, tools, resources, prompts),
    toolCount: tools.length,
    tools,
    resources,
    prompts,
  };
};
