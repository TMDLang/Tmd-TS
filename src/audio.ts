import { SheetInstrumentHelper } from "./domain/index.js";
import { PlaybackDirectiveEvent, PlaybackEvent, TmdPlaybackRenderer } from "./playback/index.js";
import { chordToMIDIPitches, noteToMIDIPitch, PercussionStroke, Sheet } from "./syntax/index.js";

export class TmdAudioError extends Error {}

export interface TmdWAVRendererOptions {
  sampleRate?: number;
  targetParagraph?: string;
  targetInstrument?: string;
  soundfont?: string;
}

/** Portable fallback renderer. It produces deterministic stereo PCM WAV without platform audio APIs. */
export class TmdWAVRenderer {
  static renderWAV(
    rawSheet: Sheet,
    sampleRateOrOptions: number | TmdWAVRendererOptions = 44100,
    maybeOptions?: TmdWAVRendererOptions
  ): Uint8Array {
    let sampleRate = 44100;
    let options: TmdWAVRendererOptions | undefined;
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

    if (!Number.isFinite(sampleRate) || sampleRate < 8000)
      throw new TmdAudioError("Sample rate must be at least 8000 Hz");

    const { sheet, instruments: distinctInstruments } = SheetInstrumentHelper.preparedForExport(
      rawSheet,
      true,
      options
    );

    const events: PlaybackEvent[] = [];
    const directives: PlaybackDirectiveEvent[] = [];

    for (const assignment of distinctInstruments) {
      const timeline = TmdPlaybackRenderer.render(sheet, assignment);
      events.push(...timeline.events);
      directives.push(...timeline.directives);
    }

    const tempoSegments = TmdPlaybackRenderer.buildTempoSegments(
      sheet.speed || 120,
      sheet.beat,
      directives
    );
    const totalSeconds = Math.max(
      2,
      ...events.map(
        (event) =>
          TmdPlaybackRenderer.quarterToSeconds(event.position + event.duration, tempoSegments) + 2.5
      )
    );
    const frames = Math.ceil(totalSeconds * sampleRate);
    const pcm = new Int16Array(frames * 2);
    for (const event of events) {
      const pitches =
        event.content.type === "note"
          ? [noteToMIDIPitch(event.content.note, event.state.keyOffset)]
          : event.content.type === "chord"
          ? chordToMIDIPitches(event.content.chord, event.state.keyOffset)
          : [];
      for (const pitch of pitches) {
        const start = Math.max(
          0,
          Math.floor(TmdPlaybackRenderer.quarterToSeconds(event.position, tempoSegments) * sampleRate)
        );
        const end = Math.min(
          frames,
          Math.ceil(
            TmdPlaybackRenderer.quarterToSeconds(event.position + event.duration, tempoSegments) *
              sampleRate
          )
        );
        const frequency = 440 * Math.pow(2, (pitch - 69) / 12);
        for (let i = start; i < end; i++) {
          const t = (i - start) / sampleRate;
          const env = Math.min(1, t * 80, ((end - i) / sampleRate) * 8);
          const sample = Math.sin(2 * Math.PI * frequency * t) * 0.12 * env * 32767;
          const left = i * 2;
          pcm[left] = Math.max(-32768, Math.min(32767, pcm[left] + sample));
          pcm[left + 1] = Math.max(-32768, Math.min(32767, pcm[left + 1] + sample));
        }
      }
      if (event.content.type === "percussion") {
        const pattern = event.content.pattern;
        for (let hitIndex = 0; hitIndex < pattern.length; hitIndex++) {
          const midi = PercussionStroke.fromCharacter(pattern[hitIndex])?.midiPitch;
          if (midi === undefined) continue;
          const hitBeat = event.position + (event.duration * hitIndex) / Math.max(1, pattern.length);
          const start = Math.max(
            0,
            Math.floor(TmdPlaybackRenderer.quarterToSeconds(hitBeat, tempoSegments) * sampleRate)
          );
          const hitEnd = Math.min(frames, start + Math.ceil(sampleRate * 0.18));
          const frequency = 440 * Math.pow(2, (midi - 69) / 12);
          for (let i = start; i < hitEnd; i++) {
            const t = (i - start) / sampleRate;
            const env = Math.exp(-t * 24);
            const noise =
              Math.sin(2 * Math.PI * frequency * t) * 0.65 +
              Math.sin(2 * Math.PI * frequency * 1.73 * t) * 0.35;
            const sample = noise * env * 0.18 * 32767;
            const left = i * 2;
            pcm[left] = Math.max(-32768, Math.min(32767, pcm[left] + sample));
            pcm[left + 1] = Math.max(-32768, Math.min(32767, pcm[left + 1] + sample));
          }
        }
      }
    }
    const data = new Uint8Array(44 + pcm.byteLength);
    const view = new DataView(data.buffer);
    const put = (offset: number, text: string) =>
      [...text].forEach((c, i) => (data[offset + i] = c.charCodeAt(0)));
    put(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    put(8, "WAVE");
    put(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    put(36, "data");
    view.setUint32(40, pcm.byteLength, true);
    new Int16Array(data.buffer, 44).set(pcm);
    return data;
  }
}
