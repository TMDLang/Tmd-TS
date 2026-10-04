import {
  Accidental,
  DEFAULT_INSTRUMENT,
  Note,
  PlaybackDirectiveEvent,
  PlaybackEvent,
  Sheet,
  SheetInstrumentHelper,
  TMDMacroEvaluator,
  TMDPlaybackRenderer,
} from "./core/index.js";

export class TmdAudioError extends Error {}

export interface TMDWAVRendererOptions {
  sampleRate?: number;
  targetParagraph?: string;
  targetInstrument?: string;
  soundfont?: string;
}

/** Portable fallback renderer. It produces deterministic stereo PCM WAV without platform audio APIs. */
export class TMDWAVRenderer {
  static renderWAV(
    rawSheet: Sheet,
    sampleRateOrOptions: number | TMDWAVRendererOptions = 44100,
    maybeOptions?: TMDWAVRendererOptions
  ): Uint8Array {
    let sampleRate = 44100;
    let options: TMDWAVRendererOptions | undefined;
    if (typeof sampleRateOrOptions === "object" && sampleRateOrOptions !== null) {
      options = sampleRateOrOptions;
      sampleRate = options.sampleRate ?? 44100;
    } else {
      sampleRate = sampleRateOrOptions;
      options = maybeOptions;
    }

    if (options?.soundfont) {
      throw new TmdAudioError(
        "External SoundFont/DLS rendering is not supported by the portable WAV renderer."
      );
    }

    let sheet = TMDMacroEvaluator.expandThrowing(rawSheet);
    if (options?.targetParagraph) {
      const filteredParagraphs = sheet.entries.filter(p => p.name === options.targetParagraph);
      sheet = {
        ...sheet,
        entries: filteredParagraphs,
        playback: [{ type: "name", name: options.targetParagraph }],
      };
    }

    if (!Number.isFinite(sampleRate) || sampleRate < 8000)
      throw new TmdAudioError("Sample rate must be at least 8000 Hz");

    const events: PlaybackEvent[] = [];
    const directives: PlaybackDirectiveEvent[] = [];

    let distinctInstruments = SheetInstrumentHelper.distinctInstruments(sheet, false);
    if (options?.targetInstrument) {
      const target = options.targetInstrument === "" ? DEFAULT_INSTRUMENT : options.targetInstrument;
      distinctInstruments = distinctInstruments.filter(inst => inst === target);
      if (distinctInstruments.length === 0 && (options.targetInstrument === DEFAULT_INSTRUMENT || options.targetInstrument === "")) {
        distinctInstruments = [DEFAULT_INSTRUMENT];
      }
    } else if (distinctInstruments.length === 0) {
      distinctInstruments = [DEFAULT_INSTRUMENT];
    }

    for (const assignment of distinctInstruments) {
      const timeline = TMDPlaybackRenderer.render(sheet, assignment);
      events.push(...timeline.events);
      directives.push(...timeline.directives);
    }
    const initialTempo = Math.max(1, sheet.speed || 120);
    const tempoChanges = directives
      .filter((directive) => directive.kind.type === "tempo" || directive.kind.type === "relativeTempo")
      .map((directive) => ({ position: directive.position, tempo: Math.max(1, directive.state.tempo) }))
      .sort((a, b) => a.position - b.position)
      .filter((change, index, changes) => index === 0 || change.position !== changes[index - 1].position || change.tempo !== changes[index - 1].tempo);
    const totalSeconds = Math.max(
      2,
      ...events.map((event) => this.beatsToSeconds(event.position + event.duration, initialTempo, tempoChanges) + 2.5)
    );
    const frames = Math.ceil(totalSeconds * sampleRate);
    const pcm = new Int16Array(frames * 2);
    for (const event of events) {
      const pitches = event.content.type === "note" ? [this.noteToMidi(event.content.note, event.state.keyOffset)] : event.content.type === "chord" ? this.chordToMidi(event.content.chord.root.semitoneOffset + event.state.keyOffset) : [];
      for (const pitch of pitches) {
        const start = Math.max(0, Math.floor(this.beatsToSeconds(event.position, initialTempo, tempoChanges) * sampleRate));
        const end = Math.min(frames, Math.ceil(this.beatsToSeconds(event.position + event.duration, initialTempo, tempoChanges) * sampleRate));
        const frequency = 440 * Math.pow(2, (pitch - 69) / 12);
        for (let i = start; i < end; i++) { const t = (i - start) / sampleRate; const env = Math.min(1, t * 80, (end - i) / sampleRate * 8); const sample = Math.sin(2 * Math.PI * frequency * t) * 0.12 * env * 32767; const left = i * 2; pcm[left] = Math.max(-32768, Math.min(32767, pcm[left] + sample)); pcm[left + 1] = Math.max(-32768, Math.min(32767, pcm[left + 1] + sample)); }
      }
      if (event.content.type === "percussion") {
        const pattern = event.content.pattern;
        for (let hitIndex = 0; hitIndex < pattern.length; hitIndex++) {
          const midi = this.percussionToMidi(pattern[hitIndex]);
          if (midi === undefined) continue;
          const hitBeat = event.position + event.duration * hitIndex / Math.max(1, pattern.length);
          const start = Math.max(0, Math.floor(this.beatsToSeconds(hitBeat, initialTempo, tempoChanges) * sampleRate));
          const hitEnd = Math.min(frames, start + Math.ceil(sampleRate * 0.18));
          const frequency = 440 * Math.pow(2, (midi - 69) / 12);
          for (let i = start; i < hitEnd; i++) {
            const t = (i - start) / sampleRate;
            const env = Math.exp(-t * 24);
            const noise = Math.sin(2 * Math.PI * frequency * t) * 0.65 + Math.sin(2 * Math.PI * frequency * 1.73 * t) * 0.35;
            const sample = noise * env * 0.18 * 32767;
            const left = i * 2;
            pcm[left] = Math.max(-32768, Math.min(32767, pcm[left] + sample));
            pcm[left + 1] = Math.max(-32768, Math.min(32767, pcm[left + 1] + sample));
          }
        }
      }
    }
    const data = new Uint8Array(44 + pcm.byteLength); const view = new DataView(data.buffer);
    const put = (offset: number, text: string) => [...text].forEach((c, i) => data[offset + i] = c.charCodeAt(0));
    put(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); put(8, "WAVE"); put(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); put(36, "data"); view.setUint32(40, pcm.byteLength, true); new Int16Array(data.buffer, 44).set(pcm);
    return data;
  }
  private static noteToMidi(note: Note, key: number): number { return 60 + key + [0, 2, 4, 5, 7, 9, 11][note.degree - 1] + (note.accidental === Accidental.Sharp ? 1 : note.accidental === Accidental.Flat ? -1 : 0) + note.octave * 12; }
  private static chordToMidi(offset: number): number[] { return [60 + offset, 64 + offset, 67 + offset]; }
  private static percussionToMidi(symbol: string): number | undefined {
    switch (symbol.toUpperCase()) {
      case "X": return 42;
      case "O": return 46;
      case "S": return 38;
      case "B":
      case "D": return 36;
      case "T": return 45;
      case "C": return 49;
      default: return undefined;
    }
  }
  private static beatsToSeconds(beat: number, initialTempo: number, changes: Array<{ position: number; tempo: number }>): number {
    if (beat <= 0) return beat * 60 / initialTempo;
    let previousBeat = 0;
    let seconds = 0;
    let tempo = initialTempo;
    for (const change of changes) {
      if (change.position <= 0) {
        tempo = change.tempo;
        continue;
      }
      if (change.position >= beat) break;
      seconds += (change.position - previousBeat) * 60 / tempo;
      previousBeat = change.position;
      tempo = change.tempo;
    }
    return seconds + (beat - previousBeat) * 60 / tempo;
  }
}
