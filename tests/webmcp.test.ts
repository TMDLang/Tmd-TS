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
});
