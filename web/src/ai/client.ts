import { AIProviderConfig, AIProviderType, GenerateOptions } from "./types.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { buildAiToolDeclarations, executeAiTool } from "./tools.js";

export async function callAI(
  provider: AIProviderType,
  config: AIProviderConfig,
  options: GenerateOptions
): Promise<string> {
  const apiKey = config.apiKey.trim();
  if (!apiKey && provider !== "custom") {
    throw new Error(`Please provide an API Key for ${provider} in AI Settings.`);
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(options);

  options.onStatus?.("正在連線模型並發送創作提示詞...");

  switch (provider) {
    case "gemini":
      return callGemini(apiKey, config.model, systemPrompt, userPrompt, options);
    case "anthropic":
      return callAnthropic(apiKey, config.model, systemPrompt, userPrompt, options);
    case "groq":
    case "openai":
    case "custom":
      return callOpenAICompatible(provider, config, systemPrompt, userPrompt, options);
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions
): Promise<string> {
  const toolDeclarations = options.toolContext
    ? buildAiToolDeclarations(options.toolContext)
    : null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${apiKey}`;

  const contents: any[] = [
    {
      role: "user",
      parts: [{ text: userPrompt }],
    },
  ];

  let turn = 0;
  const maxTurns = 4;

  while (turn < maxTurns) {
    turn++;
    const body: any = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
      },
    };

    if (toolDeclarations && toolDeclarations.geminiTools.length > 0) {
      body.tools = toolDeclarations.geminiTools;
    }

    options.onStatus?.(turn === 1 ? "正在等待模型創作回應..." : "模型正在消化工具驗證結果並修正樂譜...");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Check if there are function calls
    const functionCallPart = parts.find((p: any) => p.functionCall);
    if (functionCallPart && options.toolContext) {
      const fn = functionCallPart.functionCall;
      options.onStatus?.(`🔧 AI 正在調用 Web MCP 工具 [${fn.name}] 檢驗小節...`);

      const toolResult = await executeAiTool(fn.name, fn.args || {}, options.toolContext);

      // Gemini represents a function response as a user turn containing a functionResponse part.
      contents.push(candidate.content);
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: fn.name,
              response: { result: toolResult },
            },
          },
        ],
      });
      continue;
    }

    // Normal text output
    const textPart = parts.find((p: any) => p.text);
    const finalContent = textPart?.text || "";
    if (finalContent && options.onChunk) {
      options.onChunk(finalContent);
    }
    return finalContent;
  }

  return "";
}

async function callOpenAICompatible(
  provider: AIProviderType,
  config: AIProviderConfig,
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions
): Promise<string> {
  let endpoint = "https://api.openai.com/v1/chat/completions";
  if (provider === "groq") {
    endpoint = "https://api.groq.com/openai/v1/chat/completions";
  } else if (provider === "custom") {
    const base = (config.baseUrl || "https://api.deepseek.com/v1").replace(/\/+$/, "");
    endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey.trim()) {
    headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
  }

  const toolDeclarations = options.toolContext
    ? buildAiToolDeclarations(options.toolContext)
    : null;

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let turn = 0;
  const maxTurns = 4;

  while (turn < maxTurns) {
    turn++;
    options.onStatus?.(turn === 1 ? "正在等待模型創作回應..." : "模型正在消化工具驗證結果並修正樂譜...");

    const body: any = {
      model: config.model,
      messages,
      temperature: 0.7,
      stream: false,
    };

    if (toolDeclarations && toolDeclarations.openAiTools.length > 0) {
      body.tools = toolDeclarations.openAiTools;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider.toUpperCase()} API error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    const choice = json.choices?.[0];
    const message = choice?.message;

    if (message?.tool_calls && message.tool_calls.length > 0 && options.toolContext) {
      messages.push(message);
      for (const call of message.tool_calls) {
        const fnName = call.function.name;
        let fnArgs = {};
        try {
          fnArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          fnArgs = {};
        }

        options.onStatus?.(`🔧 AI 正在調用 Web MCP 工具 [${fnName}] 檢驗小節...`);
        const toolRes = await executeAiTool(fnName, fnArgs, options.toolContext);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: toolRes,
        });
      }
      continue;
    }

    const finalContent = message?.content || "";
    if (finalContent && options.onChunk) {
      options.onChunk(finalContent);
    }
    return finalContent;
  }

  return "";
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions
): Promise<string> {
  const endpoint = "https://api.anthropic.com/v1/messages";

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "dangerously-allow-browser": "true",
  };

  const body = {
    model,
    max_tokens: 4096,
    system: systemPrompt,
    stream: true,
    messages: [{ role: "user", content: userPrompt }],
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  return readSSEStream(response, options.onChunk, (json) => {
    if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
      return json.delta.text || "";
    }
    return "";
  });
}

async function readSSEStream(
  response: Response,
  onChunk: ((chunk: string) => void) | undefined,
  extractText: (json: any) => string
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder("utf-8");
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":") || trimmed === "data: [DONE]") continue;

      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(dataStr);
          const chunk = extractText(parsed);
          if (chunk) {
            fullText += chunk;
            onChunk?.(chunk);
          }
        } catch {
          // ignore parse errors for non-JSON lines
        }
      }
    }
  }

  if (buffer.trim().startsWith("data: ")) {
    try {
      const dataStr = buffer.trim().slice(6);
      if (dataStr !== "[DONE]") {
        const parsed = JSON.parse(dataStr);
        const chunk = extractText(parsed);
        if (chunk) {
          fullText += chunk;
          onChunk?.(chunk);
        }
      }
    } catch {
      // ignore
    }
  }

  return fullText;
}
