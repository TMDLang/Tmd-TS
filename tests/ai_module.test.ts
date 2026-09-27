import { describe, it, expect, vi } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, extractTmdCode } from '../web/src/ai/prompt.js';
import { MODEL_PRESETS, DEFAULT_MODELS } from '../web/src/ai/presets.js';
import { callAI } from '../web/src/ai/client.js';

describe('AI Module Prompt and Parsing', () => {
  it('builds system prompt containing TMD specification', () => {
    const sys = buildSystemPrompt();
    expect(sys).toContain('Timebase Mark Down');
    expect(sys).toContain('::SCORE::');
    expect(sys).toContain('```tmd');
    expect(sys).toContain("1'^");
    expect(sys).toContain('(1 2 3)%(--)');
    expect(sys).toContain('->#');
  });

  it('builds specialized user prompt for arrange mode', () => {
    const prompt = buildUserPrompt({
      prompt: 'Add rock guitar and drum tracks',
      currentTmd: '::SCORE::\n** Song **\n!= 120\n?= C\n<4/4>\n\nA:Piano@|0|{ 1 2 3 4 }\n-> A ->#',
      mode: 'arrange',
    });
    expect(prompt).toContain('arrange accompaniment');
    expect(prompt).toContain('Add rock guitar and drum tracks');
    expect(prompt).toContain('A:Piano@|0|{ 1 2 3 4 }');
  });

  it('extracts TMD score code block from LLM markdown response', () => {
    const llmOutput = `Here is your composed TMD song:
\`\`\`tmd
::SCORE::
** Morning Breeze **
!= 100
?= G
<4/4>

intro:AcousticGuitar@|0|{
    <4*>
    1 3 5 3
    2 4 6 4
}
-> intro ->#
\`\`\`
Hope you like this acoustic progression!`;

    const code = extractTmdCode(llmOutput);
    expect(code).not.toBeNull();
    expect(code).toContain('::SCORE::');
    expect(code).toContain('** Morning Breeze **');
    expect(code).not.toContain('```');
    expect(code).not.toContain('Hope you like this acoustic progression!');
  });

  it('provides default models for all 5 providers including latest presets', () => {
    expect(DEFAULT_MODELS.gemini).toBe('gemini-3.8-flash');
    expect(DEFAULT_MODELS.openai).toBe('gpt-6-astra');
    expect(DEFAULT_MODELS.anthropic).toBe('claude-fable-5-1');
    expect(DEFAULT_MODELS.custom).toBe('deepseek-v4-flash');
    expect(MODEL_PRESETS.openai.some((m) => m.id === 'gpt-6-astra')).toBe(true);
    expect(MODEL_PRESETS.openai.some((m) => m.id === 'gpt-5.6-sol')).toBe(true);
    expect(MODEL_PRESETS.anthropic.some((m) => m.id === 'claude-fable-5-1')).toBe(true);
    expect(MODEL_PRESETS.gemini.some((m) => m.id === 'gemini-3.8-flash')).toBe(true);
    expect(MODEL_PRESETS.custom.some((m) => m.id === 'deepseek-v4-flash')).toBe(true);
  });

  it('detects API keys and prevents them from being used as model names', async () => {
    const { looksLikeApiKey, loadAISettings } = await import('../web/src/ai/storage.js');
    const fakeGeminiKey = 'AIzaSy_FAKE_MOCK_KEY_FOR_TESTING_ONLY_12345';
    expect(looksLikeApiKey(fakeGeminiKey)).toBe(true);
    expect(looksLikeApiKey('sk-proj-FAKE_MOCK_KEY_FOR_TESTING_1234567890')).toBe(true);
    expect(looksLikeApiKey('gsk_FAKE_MOCK_KEY_FOR_TESTING_1234567890')).toBe(true);
    expect(looksLikeApiKey('gemini-3.8-flash')).toBe(false);
    expect(looksLikeApiKey('gpt-6-astra')).toBe(false);
    expect(looksLikeApiKey('deepseek-v4-flash')).toBe(false);

    // Mock localStorage containing an API key mistakenly stored in model
    const mockStorage: Record<string, string> = {
      tmd_ai_settings_v1: JSON.stringify({
        activeProvider: 'gemini',
        providers: {
          gemini: { apiKey: '', model: fakeGeminiKey },
        },
      }),
    };
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
    };

    const loaded = loadAISettings();
    expect(loaded.providers.gemini.model).toBe('gemini-3.8-flash');
    expect(loaded.providers.gemini.apiKey).toBe(fakeGeminiKey);
  });

  it('defines i18n keys for AI settings helper links and model-only applied message', async () => {
    const { zhTW } = await import('../web/src/locales/zh-TW.js');
    const { en } = await import('../web/src/locales/en.js');

    expect((zhTW as any).aiGetOfficialKey).toBeDefined();
    expect((en as any).aiGetOfficialKey).toBeDefined();
    expect((zhTW as any).aiAskAiHowToGet).toBeDefined();
    expect((en as any).aiAskAiHowToGet).toBeDefined();
    expect((zhTW as any).aiModelApplied).toContain('{model}');
    expect((en as any).aiModelApplied).toContain('{model}');
  });

  it('validates TMD score and extracts precise syntax error diagnostics', async () => {
    const { validateTmdCode } = await import('../web/src/ai/validator.js');

    const validTmd = `::SCORE::
** Valid Song **
!= 120
?= C
<4/4>

A:Piano@|0|{
  <4*>
  1 2 3 4
}
-> A ->#`;
    const validResult = validateTmdCode(validTmd);
    expect(validResult.valid).toBe(true);
    if (validResult.valid) {
      expect(validResult.sheet.name).toBe('Valid Song');
    }

    const invalidTmd = `::SCORE::
** Broken Song **
!= 120
?= C
<4/4>

A:Piano|0|{
  <4*>
  1 2 3 4
}
-> A ->#`;
    const invalidResult = validateTmdCode(invalidTmd);
    expect(invalidResult.valid).toBe(false);
    if (!invalidResult.valid) {
      expect(invalidResult.line).toBeGreaterThan(0);
      expect(invalidResult.message).toBeTruthy();
      expect(typeof invalidResult.snippet).toBe('string');
    }
  });

  it('builds diagnostic repair prompt containing line, error details, and snippet', async () => {
    const { buildRepairPrompt } = await import('../web/src/ai/prompt.js');

    const prompt = buildRepairPrompt({
      originalPrompt: 'Compose a pop chord progression',
      faultyTmd: `::SCORE::\n** Bad **\n!= 120\n?= C\n<4/4>\nA:Piano@|0|{ 1 2 3\n-> A ->#`,
      errorMessage: 'Unexpected token at 6:1 (expected closeBrace)',
      line: 6,
      column: 1,
      snippet: '-> A ->#',
      expectedTokens: ['closeBrace'],
    });

    expect(prompt).toContain('TMD syntax error');
    expect(prompt).toContain('Line 6');
    expect(prompt).toContain('Column 1');
    expect(prompt).toContain('Unexpected token at 6:1');
    expect(prompt).toContain('-> A ->#');
    expect(prompt).toContain('closeBrace');
    expect(prompt).toContain('```tmd');
  });

  it('defines i18n keys for auto-repair status and manual retry button', async () => {
    const { zhTW } = await import('../web/src/locales/zh-TW.js');
    const { en } = await import('../web/src/locales/en.js');

    expect((zhTW as any).aiStatusAutoRepairing).toContain('{line}');
    expect((en as any).aiStatusAutoRepairing).toContain('{line}');
    expect((zhTW as any).aiStatusRepaired).toBeDefined();
    expect((en as any).aiStatusRepaired).toBeDefined();
    expect((zhTW as any).aiValidationError).toBeDefined();
    expect((en as any).aiValidationError).toBeDefined();
    expect((zhTW as any).aiBtnRetryRepair).toBeDefined();
    expect((en as any).aiBtnRetryRepair).toBeDefined();
    expect((zhTW as any).problemsFixAllWithAi).toBeDefined();
    expect((en as any).problemsFixAllWithAi).toBeDefined();
    expect((zhTW as any).problemsFixWithAi).toBeDefined();
    expect((en as any).problemsFixWithAi).toBeDefined();
    expect((zhTW as any).aiPreviewProblemsWarning).toBeDefined();
    expect((en as any).aiPreviewProblemsWarning).toBeDefined();
  });

  it('builds diagnostic fix prompt for studio problems (both syntax errors and measure inconsistency issues)', async () => {
    const { buildProblemsFixPrompt } = await import('../web/src/ai/prompt.js');

    const promptWithMeasureIssues = buildProblemsFixPrompt({
      scoreContent: `::SCORE::\n** Test **\n!= 120\n?= C\n<4/4>\n\nverse:Piano@|0|{\n  <4*>\n  | 1 2 3 |\n}\n-> verse ->#`,
      issues: [
        {
          paragraphName: 'verse',
          instrument: 'Piano',
          lineNumber: 8,
          measureIndex: 1,
          expectedUnits: 4,
          actualUnits: 3,
          deltaUnits: -1,
          noteLength: 4,
          beat: { count: 4, unit: 4 },
          snippet: '| 1 2 3 |',
          description: 'verse:Piano (line 8, measure 1): Expected 4 units, found 3 units (-1 units)',
        },
      ],
    });

    expect(promptWithMeasureIssues).toContain('studio problem diagnostic');
    expect(promptWithMeasureIssues).toContain('verse:Piano (line 8, measure 1)');
    expect(promptWithMeasureIssues).toContain('Expected 4 units, found 3 units');
    expect(promptWithMeasureIssues).toContain('| 1 2 3 |');
    expect(promptWithMeasureIssues).toContain('```tmd');

    const promptWithSyntaxError = buildProblemsFixPrompt({
      scoreContent: `::SCORE::\n** Bad Syntax **\n!= 120\n?= C\n<4/4>\nverse:Piano@|0|{ <4*> 1 2 3 4\n-> verse ->#`,
      syntaxError: {
        message: 'Unexpected token at line 7',
        line: 7,
      },
    });

    expect(promptWithSyntaxError).toContain('Syntax Error');
    expect(promptWithSyntaxError).toContain('Line 7');
    expect(promptWithSyntaxError).toContain('Unexpected token at line 7');
  });

  it('validates TMD code with measure check issues in validateTmdCodeWithIssues', async () => {
    const { validateTmdCodeWithIssues } = await import('../web/src/ai/validator.js');

    // Score with correct syntax but measure mismatch
    const tmdMismatch = `::SCORE::
** Mismatch **
!= 120
?= C
<4/4>

verse:Piano@|0|{
  <4*>
  | 1 2 3 |
}
-> verse ->#`;

    const result = validateTmdCodeWithIssues(tmdMismatch);
    expect(result.syntaxValid).toBe(true);
    expect(result.measureIssues.length).toBeGreaterThan(0);
    expect(result.measureIssues[0].expectedUnits).toBe(4);
    expect(result.measureIssues[0].actualUnits).toBe(3);

    // Score fully valid
    const tmdValid = `::SCORE::
** Valid **
!= 120
?= C
<4/4>

verse:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> verse ->#`;

    const validResult = validateTmdCodeWithIssues(tmdValid);
    expect(validResult.syntaxValid).toBe(true);
    expect(validResult.measureIssues.length).toBe(0);
    expect(validResult.allValid).toBe(true);
  });

  it('builds tool declarations for Gemini and OpenAI providers from Web MCP tools', async () => {
    const { buildAiToolDeclarations, executeAiTool } = await import('../web/src/ai/tools.js');
    const mockContext = {
      getCurrentScore: () => '::SCORE::\n** Current **\n!= 120\n?= C\n<4/4>\nA:Piano@|0|{ 1 2 3 4 }\n-> A ->#',
      loadScoreToEditor: () => {},
    };

    const decls = buildAiToolDeclarations(mockContext);
    expect(decls.geminiTools).toBeDefined();
    expect(decls.geminiTools[0].function_declarations.length).toBeGreaterThanOrEqual(2);
    expect(decls.geminiTools[0].function_declarations.some((f: any) => f.name === 'checkTmd')).toBe(true);
    expect(decls.geminiTools[0].function_declarations.some((f: any) => f.name === 'getCurrentScore')).toBe(true);

    expect(decls.openAiTools).toBeDefined();
    expect(decls.openAiTools.length).toBeGreaterThanOrEqual(2);
    expect(decls.openAiTools.some((t: any) => t.function.name === 'checkTmd')).toBe(true);
    expect(decls.openAiTools.some((t: any) => t.function.name === 'getCurrentScore')).toBe(true);

    // Test execution of checkTmd
    const checkGood = await executeAiTool('checkTmd', {
      text: '::SCORE::\n** Good **\n!= 120\n?= C\n<4/4>\nA:Piano@|0|{ <4*> | 1 2 3 4 | }\n-> A ->#',
    }, mockContext);
    const parsedGood = JSON.parse(checkGood);
    expect(parsedGood.valid).toBe(true);
    expect(parsedGood.issueCount).toBe(0);

    const checkBad = await executeAiTool('checkTmd', {
      text: '::SCORE::\n** Bad **\n!= 120\n?= C\n<4/4>\nA:Piano@|0|{ <4*> | 1 2 3 | }\n-> A ->#',
    }, mockContext);
    const parsedBad = JSON.parse(checkBad);
    expect(parsedBad.valid).toBe(false);
    expect(parsedBad.issueCount).toBe(1);

    // Test execution of getCurrentScore
    const currentScore = await executeAiTool('getCurrentScore', {}, mockContext);
    expect(currentScore).toContain('** Current **');
  });

  it('uses a Gemini-supported role for function responses in the tool loop', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'checkTmd', args: { text: 'score' } } }],
          },
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: 'done' }] } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await callAI('gemini', { apiKey: 'test-key', model: 'gemini-test' }, {
      prompt: 'compose',
      toolContext: {
        getCurrentScore: () => 'score',
        loadScoreToEditor: vi.fn(),
      },
    });

    expect(result).toBe('done');
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.contents.map((content: any) => content.role)).toEqual(['user', 'model', 'user']);
    expect(secondBody.contents[2].parts[0].functionResponse.name).toBe('checkTmd');
    expect(secondBody.contents.some((content: any) => content.role === 'function')).toBe(false);
    vi.unstubAllGlobals();
  });
});
