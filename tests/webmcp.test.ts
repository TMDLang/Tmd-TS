import { describe, expect, it, vi } from 'vitest';

import { buildTmdWebMcpTools, initTmdWebMcp } from '../web/src/mcp/webmcpIntegration.js';

describe('TMD Web MCP Tools (TDD)', () => {
  const sampleTmd = `::SCORE::
** MCP Test **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4
}
-> intro ->#
`;

  it('builds full list of TMD Web MCP tools', () => {
    const mockContext = {
      getCurrentScore: () => sampleTmd,
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    expect(tools.length).toBe(6);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('getTmdSkill');
    expect(toolNames).toContain('parseTmd');
    expect(toolNames).toContain('checkTmd');
    expect(toolNames).toContain('convertTmd');
    expect(toolNames).toContain('loadScoreToEditor');
    expect(toolNames).toContain('getCurrentScore');
  });

  it('checkTmd validates measures and rhythm conformance', async () => {
    const mockContext = {
      getCurrentScore: () => '',
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const checkTool = tools.find((t) => t.name === 'checkTmd');
    expect(checkTool).toBeDefined();

    const goodRes = await checkTool!.handler({ text: sampleTmd });
    const goodParsed = JSON.parse(goodRes.content[0].text);
    expect(goodParsed.valid).toBe(true);
    expect(goodParsed.issueCount).toBe(0);

    const badTmd = `::SCORE::
** Bad Test **
!= 120
?= C
<4/4>

verse:Piano@|0|{
<4*>
| 1 2 3 |
}
-> verse ->#
`;
    const badRes = await checkTool!.handler({ text: badTmd });
    const badParsed = JSON.parse(badRes.content[0].text);
    expect(badParsed.valid).toBe(false);
    expect(badParsed.issueCount).toBe(1);
    expect(badParsed.issues[0].expectedUnits).toBe(4);
  });

  it('getTmdSkill returns comprehensive TMD language skill documentation', async () => {
    const mockContext = {
      getCurrentScore: () => sampleTmd,
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const skillTool = tools.find((t) => t.name === 'getTmdSkill');
    expect(skillTool).toBeDefined();

    const res = await skillTool!.handler({});
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text).toContain('Timebase Mark Down');
    expect(res.content[0].text).toContain('::SCORE::');
  });

  it('parseTmd analyzes valid TMD score and returns AST summary', async () => {
    const mockContext = {
      getCurrentScore: () => '',
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const parseTool = tools.find((t) => t.name === 'parseTmd');
    expect(parseTool).toBeDefined();

    const res = await parseTool!.handler({ text: sampleTmd });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.valid).toBe(true);
    expect(parsed.name).toBe('MCP Test');
    expect(parsed.speed).toBe(120);
    expect(parsed.tonic).toBe('C');
    expect(parsed.entryCount).toBe(1);
  });

  it('parseTmd exposes explicit tonality separately from movable-do', async () => {
    const mockContext = {
      getCurrentScore: () => '',
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };
    const tools = buildTmdWebMcpTools(mockContext);
    const parseTool = tools.find((t) => t.name === 'parseTmd');
    const text = sampleTmd.replace('?= C', '?= D\nkey= Bm');

    const res = await parseTool!.handler({ text });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.tonic).toBe('D');
    expect(parsed.declaredKey).toBe('Bm');
  });

  it('parseTmd returns error details for invalid syntax', async () => {
    const mockContext = {
      getCurrentScore: () => '',
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const parseTool = tools.find((t) => t.name === 'parseTmd');

    const res = await parseTool!.handler({ text: 'INVALID CONTENT WITHOUT HEADER' });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.valid).toBe(false);
    expect(parsed.error).toBeDefined();
  });

  it('convertTmd converts TMD score to midi (base64) and musicxml', async () => {
    const mockContext = {
      getCurrentScore: () => '',
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const convertTool = tools.find((t) => t.name === 'convertTmd');
    expect(convertTool).toBeDefined();

    // Convert to MusicXML
    const xmlRes = await convertTool!.handler({ text: sampleTmd, format: 'musicxml' });
    expect(xmlRes.content[0].text).toContain('<?xml');
    expect(xmlRes.content[0].text).toContain('<score-partwise');

    // Convert to MIDI (base64 encoded)
    const midiRes = await convertTool!.handler({ text: sampleTmd, format: 'midi' });
    expect(midiRes.content[0].text.length).toBeGreaterThan(0);
    expect(() => Buffer.from(midiRes.content[0].text, 'base64')).not.toThrow();

    // Convert to REAPER (.rpp)
    const rppRes = await convertTool!.handler({ text: sampleTmd, format: 'reaper' });
    expect(rppRes.content[0].text).toContain('<REAPER_PROJECT');
    expect(rppRes.content[0].text).toContain('NAME "Piano"');
    expect(rppRes.content[0].text).toContain('<TEMPOENVEX');

    // Convert to ChordPro (.cho)
    const choRes = await convertTool!.handler({ text: sampleTmd, format: 'chordpro' });
    expect(choRes.content[0].text).toContain('{title: MCP Test}');
  });

  it('loadScoreToEditor pushes score to editor and can trigger playback', async () => {
    const mockContext = {
      getCurrentScore: () => '',
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const loadTool = tools.find((t) => t.name === 'loadScoreToEditor');
    expect(loadTool).toBeDefined();

    const res = await loadTool!.handler({ text: sampleTmd, play: true });
    expect(mockContext.loadScoreToEditor).toHaveBeenCalledWith(sampleTmd);
    expect(mockContext.startPlayback).toHaveBeenCalled();
    expect(res.content[0].text).toContain('successfully');
  });

  it('initTmdWebMcp registers with native navigator.modelContext or WebMCP widget', () => {
    const mockContext = {
      getCurrentScore: () => sampleTmd,
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const registerToolMock = vi.fn();
    const fakeScope: any = {
      navigator: {
        modelContext: {
          registerTool: registerToolMock,
        },
      },
    };

    const res = initTmdWebMcp(fakeScope, mockContext);
    expect(res.nativeRegistered).toBe(true);
    expect(registerToolMock).toHaveBeenCalledTimes(6);
  });

  it('embeds mandatory getTmdSkill prerequisite and core syntax summary in tool descriptions', () => {
    const mockContext = {
      getCurrentScore: () => sampleTmd,
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const skillTool = tools.find((t) => t.name === 'getTmdSkill')!;
    expect(skillTool.description).toMatch(/FIRST|IMPORTANT/i);
    expect(skillTool.description).toContain('::SCORE::');

    const otherTools = tools.filter((t) => t.name !== 'getTmdSkill');
    for (const tool of otherTools) {
      expect(tool.description).toContain('getTmdSkill');
    }
  });

  it('auto-piggybacks TMD skill on the first tool invocation if getTmdSkill was not called first', async () => {
    const mockContext = {
      getCurrentScore: () => sampleTmd,
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const getScoreTool = tools.find((t) => t.name === 'getCurrentScore')!;
    const checkTool = tools.find((t) => t.name === 'checkTmd')!;

    // First call without calling getTmdSkill -> should piggyback skill in content[1]
    const firstRes = await getScoreTool.handler({});
    expect(firstRes.content.length).toBe(2);
    expect(firstRes.content[0].text).toBe(sampleTmd);
    expect(firstRes.content[1].text).toContain('Timebase Mark Down');
    expect(firstRes.content[1].text).toContain('::SCORE::');

    // Second call in same session -> skill already loaded, only 1 content block
    const secondRes = await checkTool.handler({ text: sampleTmd });
    expect(secondRes.content.length).toBe(1);
    const parsed = JSON.parse(secondRes.content[0].text);
    expect(parsed.valid).toBe(true);
  });

  it('does not piggyback duplicate TMD skill if getTmdSkill was already called first', async () => {
    const mockContext = {
      getCurrentScore: () => sampleTmd,
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const skillTool = tools.find((t) => t.name === 'getTmdSkill')!;
    const getScoreTool = tools.find((t) => t.name === 'getCurrentScore')!;

    const skillRes = await skillTool.handler({});
    expect(skillRes.content.length).toBe(1);

    const scoreRes = await getScoreTool.handler({});
    expect(scoreRes.content.length).toBe(1);
    expect(scoreRes.content[0].text).toBe(sampleTmd);
  });

  it('checkTmd reports syntaxError and valid=false when syntax fails even if measure lexer has no beat mismatch', async () => {
    const mockContext = {
      getCurrentScore: () => '',
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const checkTool = tools.find((t) => t.name === 'checkTmd')!;

    // Missing ::SCORE:: header, though measure beat count and order exist
    const headerlessTmd = `** No Header **
!= 120
?= C
<4/4>
verse:Piano@|0|{
  <4*>
  | 1 2 3 4 |
}
-> verse ->#
`;
    const res = await checkTool.handler({ text: headerlessTmd });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.valid).toBe(false);
    expect(parsed.syntaxValid).toBe(false);
    expect(parsed.syntaxError).toBeDefined();
    expect(parsed.syntaxError.line).toBeGreaterThanOrEqual(1);
  });

  it('parseTmd includes structured line, column, snippet, and expectedTokens on syntax error', async () => {
    const mockContext = {
      getCurrentScore: () => '',
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const tools = buildTmdWebMcpTools(mockContext);
    const parseTool = tools.find((t) => t.name === 'parseTmd')!;

    const brokenTmd = `::SCORE::
** Broken **
!= 120
?= C
<4/4>
verse:Piano@|0|{
  <4*>
  | 1 2 ??? 4 |
}
-> verse ->#`;

    const res = await parseTool.handler({ text: brokenTmd });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.valid).toBe(false);
    expect(parsed.line).toBe(8);
    expect(parsed.column).toBeGreaterThanOrEqual(1);
    expect(parsed.snippet).toContain('???');
    expect(Array.isArray(parsed.expectedTokens)).toBe(true);
  });

  it('registers full inputSchema, MCP resources (tmd://skill, tmd://score/current), and prompts on Bridge WebMCP', async () => {
    const mockContext = {
      getCurrentScore: () => sampleTmd,
      loadScoreToEditor: vi.fn(),
      startPlayback: vi.fn(),
    };

    const registerTool = vi.fn();
    const registerResource = vi.fn();
    const registerPrompt = vi.fn();

    class FakeWebMCP {
      registerTool = registerTool;
      registerResource = registerResource;
      registerPrompt = registerPrompt;
    }

    const fakeScope: any = {
      WebMCP: FakeWebMCP,
    };

    const res = initTmdWebMcp(fakeScope, mockContext);
    expect(res.bridgeRegistered).toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(6);

    // Verify full inputSchema (including type: "object" and required) is passed to registerTool
    const parseCall = registerTool.mock.calls.find((c: any[]) => c[0] === 'parseTmd')!;
    expect(parseCall[2]).toEqual({
      type: 'object',
      properties: expect.any(Object),
      required: ['text'],
    });

    // Verify resources and prompts are registered so connecting clients can load skill & current score
    expect(registerResource).toHaveBeenCalledTimes(2);
    const skillResourceCall = registerResource.mock.calls.find((c: any[]) => c[0] === 'tmd-skill')!;
    expect(skillResourceCall[2].uri).toBe('tmd://skill');
    const providedSkill = await skillResourceCall[3]('tmd://skill');
    expect(providedSkill.contents[0].text).toContain('Timebase Mark Down');

    const scoreResourceCall = registerResource.mock.calls.find((c: any[]) => c[0] === 'tmd-current-score')!;
    expect(scoreResourceCall[2].uri).toBe('tmd://score/current');
    const providedScore = await scoreResourceCall[3]('tmd://score/current');
    expect(providedScore.contents[0].text).toBe(sampleTmd);

    expect(registerPrompt).toHaveBeenCalledTimes(1);
    const promptCall = registerPrompt.mock.calls[0];
    expect(promptCall[0]).toBe('tmd-composer');
    const promptResult = await promptCall[3]({});
    expect(promptResult.messages[0].content.text).toContain('Timebase Mark Down');
    expect(promptResult.messages[0].content.text).toContain('MCP Test');
  });
});
