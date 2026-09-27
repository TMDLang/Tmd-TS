import { describe, expect,it } from "vitest";

import { MIDIEvent,TMDMIDIEncoder } from "../src/exporters/midi_encoder.js";
import {
  formatSoundfontLoadingStatus,
  getDrumSoundfontName,
  gmProgramToSoundfontName,
  scanMidiProgramsAndDrums,
} from "../web/src/audio/soundfont-mapping.js";

describe("Soundfont Instrument Mapping & MIDI Scanning (TDD)", () => {
  describe("gmProgramToSoundfontName", () => {
    it("maps standard piano program 0 to acoustic_grand_piano", () => {
      expect(gmProgramToSoundfontName(0)).toBe("acoustic_grand_piano");
    });

    it("maps acoustic and electric guitars", () => {
      expect(gmProgramToSoundfontName(24)).toBe("acoustic_guitar_nylon");
      expect(gmProgramToSoundfontName(25)).toBe("acoustic_guitar_steel");
      expect(gmProgramToSoundfontName(27)).toBe("electric_guitar_clean");
      expect(gmProgramToSoundfontName(29)).toBe("overdriven_guitar");
      expect(gmProgramToSoundfontName(30)).toBe("distortion_guitar");
    });

    it("maps bass instruments", () => {
      expect(gmProgramToSoundfontName(32)).toBe("acoustic_bass");
      expect(gmProgramToSoundfontName(33)).toBe("electric_bass_finger");
      expect(gmProgramToSoundfontName(34)).toBe("electric_bass_pick");
      expect(gmProgramToSoundfontName(38)).toBe("synth_bass_1");
    });

    it("maps strings, choir, and brass", () => {
      expect(gmProgramToSoundfontName(40)).toBe("violin");
      expect(gmProgramToSoundfontName(42)).toBe("cello");
      expect(gmProgramToSoundfontName(48)).toBe("string_ensemble_1");
      expect(gmProgramToSoundfontName(52)).toBe("choir_aahs");
      expect(gmProgramToSoundfontName(56)).toBe("trumpet");
      expect(gmProgramToSoundfontName(61)).toBe("brass_section");
    });

    it("maps woodwinds and synth leads", () => {
      expect(gmProgramToSoundfontName(65)).toBe("alto_sax");
      expect(gmProgramToSoundfontName(71)).toBe("clarinet");
      expect(gmProgramToSoundfontName(73)).toBe("flute");
      expect(gmProgramToSoundfontName(80)).toBe("lead_1_square");
      expect(gmProgramToSoundfontName(81)).toBe("lead_2_sawtooth");
    });

    it("falls back to acoustic_grand_piano for unknown or out-of-range program", () => {
      expect(gmProgramToSoundfontName(-1)).toBe("acoustic_grand_piano");
      expect(gmProgramToSoundfontName(200)).toBe("acoustic_grand_piano");
    });
  });

  describe("getDrumSoundfontName", () => {
    it("returns percussion or synth_drum for drum channel", () => {
      const drumName = getDrumSoundfontName();
      expect(["synth_drum", "percussion"]).toContain(drumName);
    });
  });

  describe("scanMidiProgramsAndDrums", () => {
    it("scans single track piano score without drums", () => {
      const trkEvents: MIDIEvent[] = [
        { tick: 0, message: { type: "programChange", channel: 0, program: 0 } },
        { tick: 0, message: { type: "noteOn", channel: 0, note: 60, velocity: 80 } },
        { tick: 480, message: { type: "noteOff", channel: 0, note: 60 } },
      ];
      const fileBytes = TMDMIDIEncoder.encodeFile([TMDMIDIEncoder.encodeTrack(trkEvents)], 480);

      const { programs, hasDrums, instrumentNames } = scanMidiProgramsAndDrums(fileBytes);
      expect(programs).toEqual([0]);
      expect(hasDrums).toBe(false);
      expect(instrumentNames).toContain("acoustic_grand_piano");
      expect(instrumentNames).toHaveLength(1);
    });

    it("scans multi-track arrangement with guitar, bass, and drums (Channel 10)", () => {
      // Track 1: Steel Guitar (Ch 0, Prog 25)
      const trk1: MIDIEvent[] = [
        { tick: 0, message: { type: "programChange", channel: 0, program: 25 } },
        { tick: 0, message: { type: "noteOn", channel: 0, note: 60, velocity: 80 } },
        { tick: 480, message: { type: "noteOff", channel: 0, note: 60 } },
      ];

      // Track 2: Electric Bass (Ch 1, Prog 33)
      const trk2: MIDIEvent[] = [
        { tick: 0, message: { type: "programChange", channel: 1, program: 33 } },
        { tick: 0, message: { type: "noteOn", channel: 1, note: 36, velocity: 80 } },
        { tick: 480, message: { type: "noteOff", channel: 1, note: 36 } },
      ];

      // Track 3: Drum Channel (Ch 9, Kick & Snare)
      const trk3: MIDIEvent[] = [
        { tick: 0, message: { type: "noteOn", channel: 9, note: 36, velocity: 100 } },
        { tick: 240, message: { type: "noteOn", channel: 9, note: 38, velocity: 100 } },
        { tick: 480, message: { type: "noteOff", channel: 9, note: 36 } },
      ];

      const fileBytes = TMDMIDIEncoder.encodeFile(
        [
          TMDMIDIEncoder.encodeTrack(trk1),
          TMDMIDIEncoder.encodeTrack(trk2),
          TMDMIDIEncoder.encodeTrack(trk3),
        ],
        480
      );

      const { programs, hasDrums, instrumentNames } = scanMidiProgramsAndDrums(fileBytes);
      expect(programs.sort((a, b) => a - b)).toEqual([25, 33]);
      expect(hasDrums).toBe(true);
      expect(instrumentNames).toContain("acoustic_guitar_steel");
      expect(instrumentNames).toContain("electric_bass_finger");
      expect(instrumentNames).toContain(getDrumSoundfontName());
    });
  });

  describe("channel and program soundfont resolution", () => {
    it("routes Channel 9 (MIDI Ch 10) to synth_drum regardless of program", () => {
      const channelPrograms = new Array(16).fill(0);
      channelPrograms[9] = 25; // Even if program was set, Ch 9 is percussion
      const drumSoundfont = getDrumSoundfontName();
      expect(drumSoundfont).toBe("synth_drum");
    });

    it("resolves channel instrument according to channelPrograms array", () => {
      const channelPrograms = new Array(16).fill(0);
      channelPrograms[0] = 25; // Steel Guitar
      channelPrograms[1] = 33; // Electric Bass Finger
      channelPrograms[2] = 56; // Trumpet

      expect(gmProgramToSoundfontName(channelPrograms[0])).toBe("acoustic_guitar_steel");
      expect(gmProgramToSoundfontName(channelPrograms[1])).toBe("electric_bass_finger");
      expect(gmProgramToSoundfontName(channelPrograms[2])).toBe("trumpet");
      expect(gmProgramToSoundfontName(channelPrograms[3])).toBe("acoustic_grand_piano");
    });
  });

  describe("TMDMIDIGenerator multi-track channel allocation", () => {
    it("shares channels among tracks with the same GM program without overflowing channels", async () => {
      const { TmdParser, TMDMIDIGenerator } = await import("../src/index.js");
      const tmd = `::SCORE::
** Multi-Track Channel Invariant **
!= 120
<4/4>

p1:Guitar-Clean@|0|{ <4*> 1 2 3 4 }
p2:Guitar-Delay@|0|{ <4*> 1 2 3 4 }
p3:Guitar-Pulse@|0|{ <4*> 1 2 3 4 }
p4:Bass@|0|{ <4*> 1 2 3 4 }
p5:Bass-Sub@|0|{ <4*> 1 2 3 4 }
p6:Drum@|0|{ <4*> 1 2 3 4 }
p7:Drum-Kick@|0|{ <4*> 1 2 3 4 }
p8:Clarinet@|0|{ <4*> 1 2 3 4 }
`;
      const sheet = TmdParser.parse(tmd);
      const midiBytes = TMDMIDIGenerator.generateMIDI(sheet);
      const { programs, hasDrums, instrumentNames } = scanMidiProgramsAndDrums(midiBytes);

      // Guitar (25), Bass (33), Clarinet (71)
      expect(programs.sort((a, b) => a - b)).toEqual([25, 33, 71]);
      expect(hasDrums).toBe(true);
      expect(instrumentNames).toContain("acoustic_guitar_steel");
      expect(instrumentNames).toContain("electric_bass_finger");
      expect(instrumentNames).toContain("clarinet");
      expect(instrumentNames).toContain("synth_drum");
    });
  });

  describe("formatSoundfontLoadingStatus", () => {
    it("formats loading progress with default template", () => {
      const msg = formatSoundfontLoadingStatus(1, 3, "electric_bass_finger");
      expect(msg).toBe("⏳ Loading SoundFont (1/3 electric_bass_finger)...");
    });

    it("formats loading progress with custom localized template", () => {
      const template = "⏳ 載入音色 ({current}/{total} {name})...";
      const msg = formatSoundfontLoadingStatus(2, 4, "synth_drum", template);
      expect(msg).toBe("⏳ 載入音色 (2/4 synth_drum)...");
    });
  });
});

