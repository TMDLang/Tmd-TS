import type { PitchRangeDifficulty, TMDNotePitchInfo, TMDPitchRangeProfile, TMDTimingProfile, VocalClassification } from "../analysis/inspector.js";
import { PlaybackDirectiveEvent,TMDPlaybackRenderer } from "../playback/playback.js";
import { noteToMIDIPitch, Sheet } from "../syntax/types.js";

/** Computes instrument pitch ranges independently from the Inspector facade. */
export class TMDSongPitchRangeAnalyzer {
  public static analyze(
    instrument: string,
    sheet: Sheet,
    timingProfile: TMDTimingProfile,
    timelineDirectives: PlaybackDirectiveEvent[]
  ): TMDPitchRangeProfile | null {
    const timeline = TMDPlaybackRenderer.render(sheet, instrument);
    type NoteHit = { midi: number; name: string; pos: number; sectionName: string; sectionOccurrence: number; measure: number; timeSeconds: number };
    const hits: NoteHit[] = [];

    for (const event of timeline.events) {
      if (event.content.type !== "note") continue;
      const pitch = noteToMIDIPitch(event.content.note, event.state.keyOffset);
      const section = timingProfile.sections.find((candidate) =>
        event.position >= candidate.startPositionQuarterNotes &&
        event.position < candidate.startPositionQuarterNotes + candidate.durationQuarterNotes + 0.001);
      const sectionName = section?.name ?? "";
      const occurrence = section?.occurrenceIndex ?? 1;
      let measure: number;
      let timeSeconds: number;
      if (section) {
        const position = Math.max(section.startPositionQuarterNotes, event.position);
        let cursor = section.startPositionQuarterNotes;
        let tempo = section.tempo;
        let meter = event.state.timeSignature;
        let elapsedSeconds = 0;
        let elapsedMeasures = 0;
        for (const directive of timelineDirectives) {
          if (directive.position <= cursor || directive.position >= position) continue;
          const segment = directive.position - cursor;
          elapsedSeconds += segment * 60 / tempo;
          elapsedMeasures += segment / this.measureDuration(meter);
          cursor = directive.position;
          tempo = directive.state.tempo;
          meter = directive.state.timeSignature;
        }
        if (position > cursor) {
          const segment = position - cursor;
          elapsedSeconds += segment * 60 / tempo;
          elapsedMeasures += segment / this.measureDuration(meter);
        }
        measure = section.startMeasure + Math.floor(elapsedMeasures + 1e-9);
        timeSeconds = section.startSeconds + elapsedSeconds;
      } else {
        const nominalMeasureDuration = this.measureDuration(event.state.timeSignature);
        measure = 1 + Math.floor(event.position / nominalMeasureDuration);
        timeSeconds = event.position / (event.state.tempo / 60);
      }
      hits.push({
        midi: pitch,
        name: this.noteName(pitch),
        pos: event.position,
        sectionName,
        sectionOccurrence: occurrence,
        measure,
        timeSeconds,
      });
    }

    if (hits.length === 0) return null;
    const lowest = hits.reduce((value, hit) => hit.midi < value.midi ? hit : value);
    const highest = hits.reduce((value, hit) => hit.midi > value.midi ? hit : value);
    const spanSemitones = highest.midi - lowest.midi;
    return {
      assignment: instrument,
      lowestNote: this.noteInfo(lowest),
      highestNote: this.noteInfo(highest),
      spanSemitones,
      spanOctaves: spanSemitones / 12,
      totalNotes: hits.length,
      averageMidiPitch: hits.reduce((sum, hit) => sum + hit.midi, 0) / hits.length,
      difficulty: this.evaluateDifficulty(spanSemitones),
      suitableVoiceTypes: this.evaluateSuitableVoiceTypes(lowest.midi, highest.midi),
    };
  }

  public static evaluateDifficulty(spanSemitones: number): PitchRangeDifficulty {
    if (spanSemitones <= 12) return "easy";
    if (spanSemitones <= 16) return "moderate";
    if (spanSemitones <= 20) return "challenging";
    return "difficult";
  }

  public static evaluateSuitableVoiceTypes(lowestMidi: number, highestMidi: number): VocalClassification[] {
    const ranges: { type: VocalClassification; min: number; max: number }[] = [
      { type: "soprano", min: 57, max: 86 }, { type: "mezzo-soprano", min: 53, max: 81 },
      { type: "contralto", min: 50, max: 77 }, { type: "tenor", min: 45, max: 74 },
      { type: "baritone", min: 41, max: 69 }, { type: "bass", min: 38, max: 65 },
    ];
    const suitable = ranges.filter((range) => lowestMidi >= range.min && highestMidi <= range.max).map((range) => range.type);
    for (const range of ranges) {
      if (["tenor", "baritone", "bass"].includes(range.type) && !suitable.includes(range.type) && lowestMidi - 12 >= range.min && highestMidi - 12 <= range.max) {
        suitable.push(range.type);
      }
    }
    return suitable;
  }

  private static noteInfo(hit: { midi: number; name: string; sectionName: string; pos: number; sectionOccurrence: number; measure: number; timeSeconds: number }): TMDNotePitchInfo {
    return { midiPitch: hit.midi, noteName: hit.name, sectionName: hit.sectionName, timelinePosition: hit.pos, sectionOccurrence: hit.sectionOccurrence, measure: hit.measure, timeSeconds: hit.timeSeconds };
  }

  private static noteName(midiPitch: number): string {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return `${names[((midiPitch % 12) + 12) % 12]}${Math.floor(midiPitch / 12) - 1}`;
  }

  private static measureDuration(beat: { count: number; noteValue: number }): number {
    return Math.max(1, beat.count) * 4 / Math.max(1, beat.noteValue);
  }
}
