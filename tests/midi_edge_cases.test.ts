import { describe, expect, it } from "vitest";

import { TmdMIDIEncoder } from "../src/exporters/midi_encoder.js";
import { MIDIInstrument } from "../src/exporters/midi_instrument.js";

describe("MIDI export edge cases", () => {
  it("serializes note-off before note-on when events share a tick", () => {
    const bytes = TmdMIDIEncoder.encodeTrack([
      { tick: 480, message: { type: "noteOn", channel: 0, note: 60, velocity: 80 } },
      { tick: 480, message: { type: "noteOff", channel: 0, note: 60 } },
    ]);

    const noteOffIndex = bytes.indexOf(0x80);
    const noteOnIndex = bytes.indexOf(0x90);
    expect(noteOffIndex).toBeGreaterThanOrEqual(0);
    expect(noteOnIndex).toBeGreaterThan(noteOffIndex);
  });

  it("rejects a non-positive or non-finite PPQ", () => {
    expect(() => TmdMIDIEncoder.encodeFile([], 0)).toThrow();
    expect(() => TmdMIDIEncoder.encodeFile([], -1)).toThrow();
    expect(() => TmdMIDIEncoder.encodeFile([], Number.NaN)).toThrow();
    expect(() => TmdMIDIEncoder.encodeFile([], 480.5)).toThrow();
  });

  it("rejects distinct melodic programs after all melodic channels are used", () => {
    const state = {
      nextMelodicChannel: 0,
      programToMelodyChannel: new Map<number, number>(),
    };
    const instruments = [
      MIDIInstrument.Piano,
      MIDIInstrument.BrightAcousticPiano,
      MIDIInstrument.ElectricGrandPiano,
      MIDIInstrument.HonkyTonkPiano,
      MIDIInstrument.ElectricPiano,
      MIDIInstrument.ElectricPiano2,
      MIDIInstrument.Harpsichord,
      MIDIInstrument.Clavinet,
      MIDIInstrument.Celesta,
      MIDIInstrument.Glockenspiel,
      MIDIInstrument.MusicBox,
      MIDIInstrument.Vibraphone,
      MIDIInstrument.Marimba,
      MIDIInstrument.Xylophone,
      MIDIInstrument.TubularBells,
      MIDIInstrument.Dulcimer,
    ];

    for (const instrument of instruments.slice(0, 15)) {
      MIDIInstrument.allocateChannel(instrument, state);
    }
    expect(() => MIDIInstrument.allocateChannel(instruments[15], state)).toThrow();
  });
});
