import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TMDWAVRenderer } from "../src/audio.js";
import { main, printHelp } from "../src/cli.js";
import { TMDMIDIGenerator } from "../src/exporters/midi.js";
import { TmdMcpServer } from "../src/mcp/index.js";
import { TmdParser } from "../src/syntax/parser.js";

describe("CLI & Renderer --section and --instrument alignment (TDD)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tmd-cli-section-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const multiSectionTmd = `::SCORE::
** Multi Section Song **
!= 120
?= C
<4/4>

intro:Piano@|0|{
    <4*>
    1 2 3 4
}

intro:Bass@|0|{
    <4*>
    1_ - - -
}

verse:Piano@|0|{
    <4*>
    5 6 7 1^
}

-> intro -> verse ->#
`;

  it("printHelp documents --section and --instrument options", () => {
    let captured = "";
    const origLog = console.log;
    console.log = (msg: string) => {
      captured += msg + "\n";
    };
    try {
      printHelp();
      expect(captured).toContain("--section NAME");
      expect(captured).toContain("--instrument NAME");
    } finally {
      console.log = origLog;
    }
  });

  it("exports MIDI with --section and --instrument CLI flags", () => {
    const tmdPath = path.join(tmpDir, "score.tmd");
    fs.writeFileSync(tmdPath, multiSectionTmd, "utf-8");

    const fullMidiPath = path.join(tmpDir, "full.mid");
    const introMidiPath = path.join(tmpDir, "intro.mid");
    const introPianoMidiPath = path.join(tmpDir, "intro_piano.mid");

    // 1. Full MIDI export: 1 conductor track + Piano + Bass = 3 tracks
    expect(main([tmdPath, "-m", fullMidiPath])).toBe(0);
    expect(fs.existsSync(fullMidiPath)).toBe(true);
    const fullData = fs.readFileSync(fullMidiPath);
    const fullTracks = (fullData[10] << 8) | fullData[11];
    expect(fullTracks).toBe(3);

    // 2. Section-only MIDI export (--section intro): 1 conductor track + Piano + Bass = 3 tracks
    expect(main([tmdPath, "-m", introMidiPath, "--section", "intro"])).toBe(0);
    expect(fs.existsSync(introMidiPath)).toBe(true);
    const introData = fs.readFileSync(introMidiPath);
    const introTracks = (introData[10] << 8) | introData[11];
    expect(introTracks).toBe(3);

    // 3. Section + Instrument MIDI export (--section intro --instrument Piano): 1 conductor + Piano = 2 tracks
    expect(
      main([
        tmdPath,
        "-m",
        introPianoMidiPath,
        "--section",
        "intro",
        "--instrument",
        "Piano",
      ])
    ).toBe(0);
    expect(fs.existsSync(introPianoMidiPath)).toBe(true);
    const introPianoData = fs.readFileSync(introPianoMidiPath);
    const introPianoTracks = (introPianoData[10] << 8) | introPianoData[11];
    expect(introPianoTracks).toBe(2);
    // Should be smaller than introData because Bass track is excluded
    expect(introPianoData.length).toBeLessThan(introData.length);
  });

  it("renders WAV with --section and --instrument CLI flags and respects section duration", () => {
    const tmdPath = path.join(tmpDir, "score.tmd");
    fs.writeFileSync(tmdPath, multiSectionTmd, "utf-8");

    const fullWavPath = path.join(tmpDir, "full.wav");
    const introPianoWavPath = path.join(tmpDir, "intro_piano.wav");

    expect(main([tmdPath, "-w", fullWavPath])).toBe(0);
    expect(fs.existsSync(fullWavPath)).toBe(true);
    const fullWav = fs.readFileSync(fullWavPath);

    expect(
      main([
        tmdPath,
        "-w",
        introPianoWavPath,
        "--section",
        "intro",
        "--instrument",
        "Piano",
      ])
    ).toBe(0);
    expect(fs.existsSync(introPianoWavPath)).toBe(true);
    const introPianoWav = fs.readFileSync(introPianoWavPath);

    // RIFF WAVE header check
    expect(introPianoWav.subarray(0, 4).toString()).toBe("RIFF");
    expect(introPianoWav.subarray(8, 12).toString()).toBe("WAVE");

    // Intro section is 4 beats (2s at 120 BPM) + 2.5s release tail = 4.5s
    // Full song is 8 beats (4s at 120 BPM) + 2.5s release tail = 6.5s
    const fullDataBytes = fullWav.readUInt32LE(40);
    const fullSeconds = fullDataBytes / 4 / 44100;
    const introDataBytes = introPianoWav.readUInt32LE(40);
    const introSeconds = introDataBytes / 4 / 44100;

    expect(introSeconds).toBeCloseTo(4.5, 1);
    expect(fullSeconds).toBeCloseTo(6.5, 1);
    expect(introSeconds).toBeLessThan(fullSeconds);
  });

  it("TMDWAVRenderer supports targetParagraph and targetInstrument options directly", () => {
    const sheet = TmdParser.parse(multiSectionTmd);

    const fullWav = TMDWAVRenderer.renderWAV(sheet, 8000);
    const fullSeconds = new DataView(fullWav.buffer).getUint32(40, true) / 4 / 8000;

    const filteredWav = TMDWAVRenderer.renderWAV(sheet, 8000, {
      targetParagraph: "intro",
      targetInstrument: "Piano",
    });
    const filteredSeconds =
      new DataView(filteredWav.buffer).getUint32(40, true) / 4 / 8000;

    expect(filteredSeconds).toBeCloseTo(4.5, 1);
    expect(filteredSeconds).toBeLessThan(fullSeconds);
  });

  it("preserves macro expansions when filtering by targetParagraph in MIDI and WAV", () => {
    const macroTmd = `::SCORE::
** Macro Test **
!= 120
?= C
<4/4>

Theme {
    <4*>
    1 3 5 1^
}

verse:Piano@|0|{
    <4*>
    2 4 6 2^
}

-> (play Theme Piano) -> verse ->#
`;
    const sheet = TmdParser.parse(macroTmd);

    // When exporting MIDI for verse in a score with macros, macro expansion in sheet must not break
    const midi = TMDMIDIGenerator.generateMIDI(sheet, undefined, {
      targetParagraph: "verse",
    });
    expect(midi).toBeDefined();
    expect(midi.length).toBeGreaterThan(0);
    const tracks = (midi[10] << 8) | midi[11];
    expect(tracks).toBe(2); // conductor + Piano

    // When rendering WAV for verse, it should render 1 measure
    const wav = TMDWAVRenderer.renderWAV(sheet, 8000, {
      targetParagraph: "verse",
    });
    expect(wav).toBeDefined();
    const seconds = new DataView(wav.buffer).getUint32(40, true) / 4 / 8000;
    expect(seconds).toBeCloseTo(4.5, 1);
  });

  it("MCP tmd_convert supports section and instrument filtering for MIDI and WAV", async () => {
    // 1. MIDI with section & instrument
    const midiRes = await TmdMcpServer.handleConvertTmd({
      text: multiSectionTmd,
      format: "midi",
      section: "intro",
      instrument: "Piano",
    });
    expect(midiRes.content[0].type).toBe("text");
    const midiBuffer = Buffer.from(midiRes.content[0].text, "base64");
    const tracks = (midiBuffer[10] << 8) | midiBuffer[11];
    expect(tracks).toBe(2); // 1 conductor + Piano

    // 2. WAV with section & instrument
    const wavRes = await TmdMcpServer.handleConvertTmd({
      text: multiSectionTmd,
      format: "wav",
      section: "intro",
      instrument: "Piano",
    });
    expect(wavRes.content[0].type).toBe("text");
    const wavBuffer = Buffer.from(wavRes.content[0].text, "base64");
    expect(wavBuffer.subarray(0, 4).toString()).toBe("RIFF");
    const dataBytes = wavBuffer.readUInt32LE(40);
    const seconds = dataBytes / 4 / 44100;
    expect(seconds).toBeCloseTo(4.5, 1);
  });
});
