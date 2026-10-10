import {
  MeasureEvent,
  NotationDuration,
  NotationDurationAtom,
  TmdMacroEvaluator,
  TmdMeasureRenderer,
} from "../playback/index.js";
import {
  Beat,
  ChordQualityKind,
  ChordSymbol,
  Entry,
  Note,
  PitchMapping,
  Sheet,
  SpelledPitch,
} from "../syntax/index.js";

export type TmdBrailleEncoding = "unicode" | "ascii";
export type TmdBrailleLayout = "partByPart" | "barOverBar";

export interface TmdBrailleOptions {
  encoding?: TmdBrailleEncoding;
  layout?: TmdBrailleLayout;
  targetSection?: string;
  targetInstrument?: string;
}

export interface TmdBrailleMeasurePreview {
  measureNumber: number;
  unicode: string;
  ascii: string;
  sightedSummary: string;
  isFullMeasureRest: boolean;
}

export interface TmdBrailleTrackPreview {
  instrument: string;
  prefixUnicode: string;
  prefixAscii: string;
  measures: TmdBrailleMeasurePreview[];
}

export interface TmdBraillePreview {
  title: string;
  tempoBpm: number;
  keySignatureName: string;
  timeSignature: string;
  unicodeText: string;
  asciiText: string;
  tracks: TmdBrailleTrackPreview[];
}

interface RenderedBrailleMeasure {
  index: number;
  isFullMeasureRest: boolean;
  hasLeadingKeyOrMeterChange: boolean;
  preMeasureDirectivesAscii: string;
  ascii: string;
  sightedSummary: string;
  endsWithCrossBarTie: boolean;
  startsWithCrossBarTie: boolean;
}

interface RenderedBrailleTrack {
  instrument: string;
  measures: RenderedBrailleMeasure[];
}

const ASCII_TO_UNICODE_MAP: Record<string, string> = {
  "!": "⠮",
  "\"": "⠐",
  "#": "⠼",
  $: "⠫",
  "%": "⠩",
  "&": "⠯",
  "'": "⠄",
  "(": "⠷",
  ")": "⠾",
  "*": "⠡",
  "+": "⠬",
  ",": "⠠",
  "-": "⠤",
  ".": "⠨",
  "/": "⠌",
  "0": "⠴",
  "1": "⠂",
  "2": "⠆",
  "3": "⠒",
  "4": "⠲",
  "5": "⠢",
  "6": "⠖",
  "7": "⠶",
  "8": "⠦",
  "9": "⠔",
  ":": "⠱",
  ";": "⠰",
  "<": "⠣",
  "=": "⠿",
  ">": "⠜",
  "?": "⠹",
  "@": "⠈",
  A: "⠁",
  B: "⠃",
  C: "⠉",
  D: "⠙",
  E: "⠑",
  F: "⠋",
  G: "⠛",
  H: "⠓",
  I: "⠊",
  J: "⠚",
  K: "⠅",
  L: "⠇",
  M: "⠍",
  N: "⠝",
  O: "⠕",
  P: "⠏",
  Q: "⠟",
  R: "⠗",
  S: "⠎",
  T: "⠞",
  U: "⠥",
  V: "⠧",
  W: "⠺",
  X: "⠭",
  Y: "⠽",
  Z: "⠵",
  "[": "⠪",
  "\\": "⠳",
  "]": "⠻",
  "^": "⠘",
  _: "⠸",
};

const WHOLE_OR_16TH_CELLS = ["Y", "Z", "&", "=", "(", "!", ")"];
const HALF_OR_32ND_CELLS = ["N", "O", "P", "Q", "R", "S", "T"];
const QUARTER_OR_64TH_CELLS = ["?", ":", "$", "]", "\\", "[", "W"];
const EIGHTH_OR_128TH_CELLS = ["D", "E", "F", "G", "H", "I", "J"];
const DOTS_456_ONLY = new Set(["@", "^", "_", "\"", ".", ";", ",", " "]);

/**
 * International Music Braille Code (1996 New International Manual / BANA 2015) exporter for TMD Sheets.
 */
export class TmdBrailleGenerator {
  /**
   * Generates a Music Braille string (`.brl` Unicode or `.brf` North American Braille ASCII) from a `Sheet`.
   */
  public static generateBraille(rawSheet: Sheet, options: TmdBrailleOptions = {}): string {
    const encoding: TmdBrailleEncoding = options.encoding ?? "unicode";
    const preview = TmdBrailleGenerator.generateBraillePreview(rawSheet, options);
    return encoding === "unicode" ? preview.unicodeText : preview.asciiText;
  }

  /**
   * Generates a complete Music Braille preview containing both full formatted `.brl`/`.brf` strings
   * and per-track / per-measure sighted breakdowns for interactive GUI inspection.
   */
  public static generateBraillePreview(
    rawSheet: Sheet,
    options: TmdBrailleOptions = {}
  ): TmdBraillePreview {
    const layout: TmdBrailleLayout = options.layout ?? "partByPart";
    let workingSheet = TmdMacroEvaluator.expandThrowing(rawSheet);

    if (options.targetSection && options.targetSection.trim().length > 0) {
      const targetSec = options.targetSection.trim().toLowerCase();
      workingSheet = {
        ...workingSheet,
        entries: workingSheet.entries.filter((e) => e.name.toLowerCase() === targetSec),
        playback: [{ type: "name", name: options.targetSection.trim() }],
      };
    }

    let instruments = TmdBrailleGenerator.distinctMusicalInstruments(workingSheet);
    if (options.targetInstrument && options.targetInstrument.trim().length > 0) {
      const targetInst = options.targetInstrument.trim().toLowerCase();
      instruments = instruments.filter((inst) => inst.toLowerCase() === targetInst);
    }

    const asciiLines: string[] = [];
    const title = (workingSheet.name || "").trim();
    if (title.length > 0) {
      asciiLines.push(TmdBrailleGenerator.encodeLiteraryText(title));
    }

    const bpm = Math.round(workingSheet.speed > 0 ? workingSheet.speed : 120);
    const metronomeAscii = `?7#${TmdBrailleGenerator.encodeUpperDigits(bpm)}`;
    const initialKey =
      workingSheet.declaredKey ??
      PitchMapping.tonicScaleInfo(workingSheet.keySignature.semitoneOffset).name;
    const keySigAscii = TmdBrailleGenerator.encodeKeySignature(initialKey);
    const timeSigAscii = TmdBrailleGenerator.encodeTimeSignature(workingSheet.beat);
    asciiLines.push(`${metronomeAscii} ${keySigAscii}${timeSigAscii}`);

    const renderedTracks = instruments.map((inst) =>
      TmdBrailleGenerator.renderTrackMeasures(inst, workingSheet)
    );

    if (instruments.length > 0) {
      if (layout === "partByPart") {
        for (const track of renderedTracks) {
          const prefix = TmdBrailleGenerator.partPrefixAscii(track.instrument);
          const body = TmdBrailleGenerator.joinTrackMeasuresAscii(track.measures);
          asciiLines.push(`${prefix} ${body}<K`);
        }
      } else {
        for (const track of renderedTracks) {
          const heading = TmdBrailleGenerator.encodeLiteraryText(track.instrument);
          const prefix = TmdBrailleGenerator.partPrefixAscii(track.instrument);
          asciiLines.push(`${heading} ${prefix}`);
        }
        const maxMeasures = renderedTracks.reduce(
          (max, t) => Math.max(max, t.measures.length),
          0
        );
        for (let mIdx = 0; mIdx < maxMeasures; mIdx++) {
          asciiLines.push(`#${TmdBrailleGenerator.encodeUpperDigits(mIdx + 1)}`);
          const isLastMeasure = mIdx === maxMeasures - 1;
          for (const track of renderedTracks) {
            const prefix = TmdBrailleGenerator.partPrefixAscii(track.instrument);
            const mAscii =
              mIdx < track.measures.length ? track.measures[mIdx].ascii : "M";
            const suffix = isLastMeasure ? "<K" : "";
            asciiLines.push(`  ${prefix} ${mAscii}${suffix}`);
          }
        }
      }
    }

    const asciiText = asciiLines.join("\n") + "\n";
    const unicodeText = TmdBrailleGenerator.asciiToUnicodeBraille(asciiText);

    const trackPreviews: TmdBrailleTrackPreview[] = renderedTracks.map((track) => {
      const prefixAscii = TmdBrailleGenerator.partPrefixAscii(track.instrument);
      const prefixUnicode = TmdBrailleGenerator.asciiToUnicodeBraille(prefixAscii);
      return {
        instrument: track.instrument,
        prefixAscii,
        prefixUnicode,
        measures: track.measures.map((m) => {
          const fullAscii = m.preMeasureDirectivesAscii
            ? `${m.preMeasureDirectivesAscii} ${m.ascii}`
            : m.ascii;
          return {
            measureNumber: m.index + 1,
            ascii: fullAscii,
            unicode: TmdBrailleGenerator.asciiToUnicodeBraille(fullAscii),
            sightedSummary: m.sightedSummary,
            isFullMeasureRest: m.isFullMeasureRest,
          };
        }),
      };
    });

    return {
      title: title || "Untitled",
      tempoBpm: bpm,
      keySignatureName: initialKey,
      timeSignature: `${workingSheet.beat.count}/${workingSheet.beat.noteValue}`,
      unicodeText,
      asciiText,
      tracks: trackPreviews,
    };
  }

  /**
   * Converts North American Braille ASCII (`0x21`–`0x5F`) to Unicode Braille (`U+2800`–`U+28FF`).
   */
  public static asciiToUnicodeBraille(ascii: string): string {
    let out = "";
    for (let i = 0; i < ascii.length; i++) {
      const ch = ascii[i];
      const upper = ch.toUpperCase();
      out += ASCII_TO_UNICODE_MAP[upper] ?? ch;
    }
    return out;
  }

  private static distinctMusicalInstruments(sheet: Sheet): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    const appendIfMusical = (entry: Entry) => {
      if (entry.showProgram !== undefined || entry.executionTime !== undefined) {
        return;
      }
      const assignment = entry.assignment?.trim();
      if (!assignment) return;
      const key = assignment.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(assignment);
      }
    };

    if (sheet.playback.length > 0) {
      for (const item of sheet.playback) {
        if (item.type === "name") {
          for (const entry of sheet.entries) {
            if (entry.name === item.name) {
              appendIfMusical(entry);
            }
          }
        }
      }
    } else {
      for (const entry of sheet.entries) {
        appendIfMusical(entry);
      }
    }

    return result;
  }

  private static renderTrackMeasures(
    instrument: string,
    sheet: Sheet
  ): RenderedBrailleTrack {
    const measures = TmdMeasureRenderer.renderMeasures(sheet, instrument);
    const isFixedPitchTrack = sheet.entries.some(
      (e) =>
        e.assignment?.toLowerCase() === instrument.toLowerCase() &&
        e.pitchMode === "fixed"
    );
    const isChordTrack = TmdBrailleGenerator.isChordSymbolAssignment(instrument);
    const isPercussion = TmdBrailleGenerator.isPercussionAssignment(
      instrument,
      sheet.entries
    );

    let activeWrittenKey = isFixedPitchTrack
      ? "C"
      : sheet.declaredKey ??
        PitchMapping.tonicScaleInfo(sheet.keySignature.semitoneOffset).name;
    let activeKeyOffset = isFixedPitchTrack
      ? 0
      : sheet.keySignature.semitoneOffset;
    let defaultKeyStepAlters =
      PitchMapping.keySignatureStepAlters(activeWrittenKey);
    let activeBeat: Beat = { ...sheet.beat };

    const pitchState: {
      lastPitch: { octave: number; stepIndex: number } | null;
      forceOctave: boolean;
    } = {
      lastPitch: null,
      forceOctave: true,
    };

    const outMeasures: RenderedBrailleMeasure[] = [];

    for (const measure of measures) {
      const measureStepAlters = new Map<number, number[]>();
      const preDirectives: string[] = [];
      const preSighted: string[] = [];
      const inlineDirectivesByOffset: Array<{
        offset: number;
        ascii: string;
        label: string;
      }> = [];

      for (const directive of measure.directives) {
        const k = directive.kind;
        switch (k.type) {
          case "explicitKey":
          case "absoluteKey":
            if (!isFixedPitchTrack && k.key !== activeWrittenKey) {
              activeWrittenKey = k.key;
              defaultKeyStepAlters = PitchMapping.keySignatureStepAlters(k.key);
              measureStepAlters.clear();
              const ks = TmdBrailleGenerator.encodeKeySignature(k.key);
              if (ks.length > 0) {
                preDirectives.push(ks);
              }
              preSighted.push(`Key: ${k.key}`);
              pitchState.forceOctave = true;
            }
            break;
          case "relativeKey":
            if (!isFixedPitchTrack && !sheet.declaredKey) {
              const newKey = PitchMapping.tonicScaleInfo(
                directive.state.keyOffset
              ).name;
              if (newKey !== activeWrittenKey) {
                activeWrittenKey = newKey;
                activeKeyOffset = directive.state.keyOffset;
                defaultKeyStepAlters =
                  PitchMapping.keySignatureStepAlters(newKey);
                measureStepAlters.clear();
                const ks = TmdBrailleGenerator.encodeKeySignature(newKey);
                if (ks.length > 0) {
                  preDirectives.push(ks);
                }
                preSighted.push(`Key: ${newKey}`);
                pitchState.forceOctave = true;
              }
            }
            break;
          case "fixedPitch":
            activeWrittenKey = "C";
            defaultKeyStepAlters = [0, 0, 0, 0, 0, 0, 0];
            measureStepAlters.clear();
            break;
          case "timeSignature":
            if (
              k.beat.count !== activeBeat.count ||
              k.beat.noteValue !== activeBeat.noteValue
            ) {
              activeBeat = { ...k.beat };
              preDirectives.push(
                TmdBrailleGenerator.encodeTimeSignature(k.beat)
              );
              preSighted.push(`${k.beat.count}/${k.beat.noteValue}`);
              pitchState.forceOctave = true;
            }
            break;
          case "tempo":
          case "relativeTempo": {
            const bpm = Math.round(directive.state.tempo);
            preDirectives.push(`?7#${TmdBrailleGenerator.encodeUpperDigits(bpm)}`);
            preSighted.push(`♩=${bpm}`);
            pitchState.forceOctave = true;
            break;
          }
          case "dynamics": {
            const relOffset = Math.max(0, directive.position - measure.startTime);
            inlineDirectivesByOffset.push({
              offset: relOffset,
              ascii: `>${k.mark.toUpperCase()}`,
              label: `{${k.mark}}`,
            });
            break;
          }
        }
      }

      const nonRestEvents = measure.events.filter(
        (e) => e.content.type !== "rest"
      );
      if (
        !isFixedPitchTrack &&
        !isChordTrack &&
        !isPercussion &&
        !sheet.declaredKey &&
        nonRestEvents.length > 0 &&
        nonRestEvents[0].state.keyOffset !== activeKeyOffset
      ) {
        activeKeyOffset = nonRestEvents[0].state.keyOffset;
        const newKey = PitchMapping.tonicScaleInfo(activeKeyOffset).name;
        if (newKey !== activeWrittenKey) {
          activeWrittenKey = newKey;
          defaultKeyStepAlters = PitchMapping.keySignatureStepAlters(newKey);
          measureStepAlters.clear();
          const ks = TmdBrailleGenerator.encodeKeySignature(newKey);
          if (ks.length > 0) {
            preDirectives.push(ks);
          }
          preSighted.push(`Key: ${newKey}`);
          pitchState.forceOctave = true;
        }
      }

      if (nonRestEvents.length === 0 && inlineDirectivesByOffset.length === 0) {
        outMeasures.push({
          index: measure.index,
          isFullMeasureRest: true,
          hasLeadingKeyOrMeterChange: preDirectives.length > 0,
          preMeasureDirectivesAscii: preDirectives.join(" "),
          ascii: "M",
          sightedSummary:
            preSighted.length > 0
              ? `${preSighted.join(", ")} · Full-measure rest`
              : "Full-measure rest",
          endsWithCrossBarTie: false,
          startsWithCrossBarTie: false,
        });
        continue;
      }

      const groups: MeasureEvent[][] = [];
      for (const ev of measure.events) {
        if (
          groups.length > 0 &&
          Math.abs(ev.startOffset - groups[groups.length - 1][0].startOffset) <
            1e-4
        ) {
          groups[groups.length - 1].push(ev);
        } else {
          groups.push([ev]);
        }
      }

      let measureCells = "";
      const sightedTokens: string[] = [...preSighted];
      const consumedDirectives = new Set<number>();
      const startsWithTie = groups[0]?.some((e) => e.tieStop) ?? false;
      const endsWithTie =
        groups[groups.length - 1]?.some((e) => e.tieStart) ?? false;

      for (const group of groups) {
        const primary = group[0];
        if (!primary) continue;

        let pendingDynamicAscii = "";
        for (let dIdx = 0; dIdx < inlineDirectivesByOffset.length; dIdx++) {
          const item = inlineDirectivesByOffset[dIdx];
          if (
            !consumedDirectives.has(dIdx) &&
            item.offset <= primary.startOffset + 1e-4
          ) {
            consumedDirectives.add(dIdx);
            pendingDynamicAscii += item.ascii;
            sightedTokens.push(item.label);
            pitchState.forceOctave = true;
          }
        }

        const { ascii: groupAscii, sighted } =
          TmdBrailleGenerator.renderEventGroup(
            group,
            isChordTrack,
            defaultKeyStepAlters,
            measureStepAlters,
            pitchState
          );
        if (sighted) {
          sightedTokens.push(sighted);
        }

        if (pendingDynamicAscii.length > 0) {
          const firstChar = groupAscii[0];
          if (firstChar && TmdBrailleGenerator.cellUsesDots123(firstChar)) {
            measureCells += `${pendingDynamicAscii}'${groupAscii}`;
          } else {
            measureCells += `${pendingDynamicAscii}${groupAscii}`;
          }
        } else {
          measureCells += groupAscii;
        }
      }

      outMeasures.push({
        index: measure.index,
        isFullMeasureRest: false,
        hasLeadingKeyOrMeterChange: preDirectives.length > 0,
        preMeasureDirectivesAscii: preDirectives.join(" "),
        ascii: measureCells,
        sightedSummary: sightedTokens.join(" "),
        endsWithCrossBarTie: endsWithTie,
        startsWithCrossBarTie: startsWithTie,
      });
    }

    return { instrument, measures: outMeasures };
  }

  private static joinTrackMeasuresAscii(
    measures: RenderedBrailleMeasure[]
  ): string {
    const tokens: string[] = [];
    let i = 0;
    while (i < measures.length) {
      const m = measures[i];
      if (m.preMeasureDirectivesAscii.length > 0) {
        tokens.push(m.preMeasureDirectivesAscii);
      }
      if (m.isFullMeasureRest) {
        let restCount = 1;
        let j = i + 1;
        while (
          j < measures.length &&
          measures[j].isFullMeasureRest &&
          measures[j].preMeasureDirectivesAscii.length === 0
        ) {
          restCount++;
          j++;
        }
        tokens.push(TmdBrailleGenerator.encodeFullMeasureRests(restCount));
        i = j;
      } else {
        let combined = m.ascii;
        let cur = m;
        let j = i + 1;
        while (
          j < measures.length &&
          cur.endsWithCrossBarTie &&
          measures[j].startsWithCrossBarTie &&
          measures[j].preMeasureDirectivesAscii.length === 0
        ) {
          combined += measures[j].ascii;
          cur = measures[j];
          j++;
        }
        tokens.push(combined);
        i = j;
      }
    }
    return tokens.join(" ");
  }

  private static renderEventGroup(
    group: MeasureEvent[],
    isChordTrack: boolean,
    defaultKeyStepAlters: number[],
    measureStepAlters: Map<number, number[]>,
    pitchState: {
      lastPitch: { octave: number; stepIndex: number } | null;
      forceOctave: boolean;
    }
  ): { ascii: string; sighted: string } {
    const first = group[0];
    if (!first) return { ascii: "", sighted: "" };
    const atoms = NotationDuration.decompose(first.duration);

    // 1. Simultaneous pitched notes
    const notes: Array<{
      note: Note;
      event: MeasureEvent;
      spelled: SpelledPitch;
    }> = [];
    for (const ev of group) {
      if (ev.content.type === "note") {
        const spelled = PitchMapping.spellNote(
          ev.content.note,
          ev.state.keyOffset
        );
        notes.push({ note: ev.content.note, event: ev, spelled });
      }
    }

    if (notes.length > 0) {
      notes.sort((a, b) => {
        const d0 = a.spelled.octave * 7 + a.spelled.stepIndex;
        const d1 = b.spelled.octave * 7 + b.spelled.stepIndex;
        if (d0 !== d1) return d0 - d1;
        return a.spelled.midiPitch - b.spelled.midiPitch;
      });

      let out = "";
      for (let atomIdx = 0; atomIdx < atoms.length; atomIdx++) {
        const atom = atoms[atomIdx];
        const base = notes[0];
        const isContinuationAtom = atomIdx > 0 || base.event.tieStop;
        const needsInternalTie =
          atomIdx < atoms.length - 1 || base.event.tieStart;

        const baseOctAlters = [
          ...(measureStepAlters.get(base.spelled.octave) ??
            defaultKeyStepAlters),
        ];
        const expectedBaseAlter = baseOctAlters[base.spelled.stepIndex];
        let accStr = "";
        if (base.spelled.alter !== expectedBaseAlter && !isContinuationAtom) {
          baseOctAlters[base.spelled.stepIndex] = base.spelled.alter;
          measureStepAlters.set(base.spelled.octave, baseOctAlters);
          accStr = TmdBrailleGenerator.encodeAccidental(base.spelled.alter);
        }

        let octStr = "";
        if (
          !(
            base.event.tieStop &&
            atomIdx === 0 &&
            notes.length === 1 &&
            !pitchState.forceOctave
          )
        ) {
          if (
            TmdBrailleGenerator.shouldEmitOctave(
              base.spelled.octave,
              base.spelled.stepIndex,
              pitchState.lastPitch,
              pitchState.forceOctave
            )
          ) {
            octStr = TmdBrailleGenerator.encodeOctaveMark(base.spelled.octave);
          }
        }
        pitchState.lastPitch = {
          octave: base.spelled.octave,
          stepIndex: base.spelled.stepIndex,
        };
        pitchState.forceOctave = false;

        const noteCell = TmdBrailleGenerator.encodeNoteCell(
          base.spelled.stepIndex,
          atom.baseDenominator,
          atom.isDotted
        );

        let intervalsStr = "";
        const baseDiatonic = base.spelled.octave * 7 + base.spelled.stepIndex;
        let prevDiatonic = baseDiatonic;
        for (let mIdx = 1; mIdx < notes.length; mIdx++) {
          const member = notes[mIdx];
          const memOctAlters = [
            ...(measureStepAlters.get(member.spelled.octave) ??
              defaultKeyStepAlters),
          ];
          const expectedMemAlter = memOctAlters[member.spelled.stepIndex];
          let memAcc = "";
          if (
            member.spelled.alter !== expectedMemAlter &&
            !isContinuationAtom
          ) {
            memOctAlters[member.spelled.stepIndex] = member.spelled.alter;
            measureStepAlters.set(member.spelled.octave, memOctAlters);
            memAcc = TmdBrailleGenerator.encodeAccidental(member.spelled.alter);
          }

          const memDiatonic =
            member.spelled.octave * 7 + member.spelled.stepIndex;
          const deltaFromBase = Math.max(0, memDiatonic - baseDiatonic);
          const deltaFromPrev = Math.max(0, memDiatonic - prevDiatonic);
          prevDiatonic = memDiatonic;

          if (deltaFromBase === 0) {
            intervalsStr += `${memAcc}${TmdBrailleGenerator.encodeOctaveMark(member.spelled.octave)}-`;
          } else {
            const intervalIdx = ((deltaFromBase - 1) % 7) + 1;
            const needOct = deltaFromBase > 7 || deltaFromPrev >= 7;
            const intOct = needOct
              ? TmdBrailleGenerator.encodeOctaveMark(member.spelled.octave)
              : "";
            intervalsStr += `${memAcc}${intOct}${TmdBrailleGenerator.encodeIntervalSign(intervalIdx)}`;
          }
        }

        const tieStr = needsInternalTie ? (notes.length > 1 ? ".C.C" : "@C") : "";
        out += `${accStr}${octStr}${noteCell}${intervalsStr}${tieStr}`;
      }

      const pitchNames = notes.map((n) =>
        TmdBrailleGenerator.formatSpelledPitchName(n.spelled)
      );
      const durLabel = TmdBrailleGenerator.formatDurationLabel(atoms);
      const tieSuffix = notes[0].event.tieStart ? "~" : "";
      const chordName =
        pitchNames.length > 1 ? pitchNames.join("+") : pitchNames[0];
      return { ascii: out, sighted: `${chordName}(${durLabel})${tieSuffix}` };
    }

    // 2. Chord symbol event
    if (first.content.type === "chord") {
      const chord = first.content.chord;
      const durLabel = TmdBrailleGenerator.formatDurationLabel(atoms);
      if (isChordTrack) {
        const sym = TmdBrailleGenerator.encodeChordSymbolLiterary(
          chord,
          first.state.keyOffset
        );
        const stem = atoms[0]
          ? TmdBrailleGenerator.encodeChordStemSign(atoms[0])
          : "_'";
        return {
          ascii: `${sym}${stem}`,
          sighted: `[${chord.toString()}](${durLabel})`,
        };
      } else {
        const voiced = PitchMapping.spellChordVoicing(
          chord,
          first.state.keyOffset
        );
        const base = voiced[0];
        if (!base) return { ascii: "", sighted: "" };
        let out = "";
        for (let atomIdx = 0; atomIdx < atoms.length; atomIdx++) {
          const atom = atoms[atomIdx];
          const isContinuation = atomIdx > 0;
          const baseOctAlters = [
            ...(measureStepAlters.get(base.octave) ?? defaultKeyStepAlters),
          ];
          let accStr = "";
          if (base.alter !== baseOctAlters[base.stepIndex] && !isContinuation) {
            baseOctAlters[base.stepIndex] = base.alter;
            measureStepAlters.set(base.octave, baseOctAlters);
            accStr = TmdBrailleGenerator.encodeAccidental(base.alter);
          }
          const octStr = TmdBrailleGenerator.shouldEmitOctave(
            base.octave,
            base.stepIndex,
            pitchState.lastPitch,
            pitchState.forceOctave
          )
            ? TmdBrailleGenerator.encodeOctaveMark(base.octave)
            : "";
          pitchState.lastPitch = {
            octave: base.octave,
            stepIndex: base.stepIndex,
          };
          pitchState.forceOctave = false;

          const noteCell = TmdBrailleGenerator.encodeNoteCell(
            base.stepIndex,
            atom.baseDenominator,
            atom.isDotted
          );
          const baseDiatonic = base.octave * 7 + base.stepIndex;
          let intervalsStr = "";
          for (let mIdx = 1; mIdx < voiced.length; mIdx++) {
            const member = voiced[mIdx];
            const memOctAlters = [
              ...(measureStepAlters.get(member.octave) ?? defaultKeyStepAlters),
            ];
            let memAcc = "";
            if (
              member.alter !== memOctAlters[member.stepIndex] &&
              !isContinuation
            ) {
              memOctAlters[member.stepIndex] = member.alter;
              measureStepAlters.set(member.octave, memOctAlters);
              memAcc = TmdBrailleGenerator.encodeAccidental(member.alter);
            }
            const delta = Math.max(
              1,
              member.octave * 7 + member.stepIndex - baseDiatonic
            );
            const intIdx = ((delta - 1) % 7) + 1;
            const intOct =
              delta > 7
                ? TmdBrailleGenerator.encodeOctaveMark(member.octave)
                : "";
            intervalsStr += `${memAcc}${intOct}${TmdBrailleGenerator.encodeIntervalSign(intIdx)}`;
          }
          const tieStr = atomIdx < atoms.length - 1 ? ".C.C" : "";
          out += `${accStr}${octStr}${noteCell}${intervalsStr}${tieStr}`;
        }
        return {
          ascii: out,
          sighted: `[${chord.toString()}](${durLabel})`,
        };
      }
    }

    // 3. Percussion event
    if (first.content.type === "percussion") {
      const clean = Array.from(first.content.pattern).filter(
        (c) => c.trim().length > 0 && c !== "(" && c !== ")"
      );
      if (clean.length === 0) {
        return {
          ascii: atoms.map((a) => TmdBrailleGenerator.encodeRestCell(a)).join(""),
          sighted: `Rest(${TmdBrailleGenerator.formatDurationLabel(atoms)})`,
        };
      }
      const subDur = first.duration / clean.length;
      const subAtom = NotationDuration.decompose(subDur)[0] ?? {
        baseDenominator: 4,
        isDotted: false,
        quarterValue: 1.0,
      };
      let out = "";
      for (const ch of clean) {
        if (ch === "-" || ch === ".") {
          out += TmdBrailleGenerator.encodeRestCell(subAtom);
          continue;
        }
        const { stepIndex, octave } =
          TmdBrailleGenerator.percussionStepAndOctave(ch);
        const octStr = TmdBrailleGenerator.shouldEmitOctave(
          octave,
          stepIndex,
          pitchState.lastPitch,
          pitchState.forceOctave
        )
          ? TmdBrailleGenerator.encodeOctaveMark(octave)
          : "";
        pitchState.lastPitch = { octave, stepIndex };
        pitchState.forceOctave = false;
        out += `${octStr}${TmdBrailleGenerator.encodeNoteCell(
          stepIndex,
          subAtom.baseDenominator,
          subAtom.isDotted
        )}`;
      }
      return { ascii: out, sighted: `Perc(${clean.join("")})` };
    }

    // 4. Rest event
    const prefix = isChordTrack ? "\"" : "";
    return {
      ascii: atoms
        .map((a) => `${prefix}${TmdBrailleGenerator.encodeRestCell(a)}`)
        .join(""),
      sighted: `Rest(${TmdBrailleGenerator.formatDurationLabel(atoms)})`,
    };
  }

  private static formatSpelledPitchName(spelled: SpelledPitch): string {
    const acc =
      spelled.alter === 1
        ? "♯"
        : spelled.alter >= 2
          ? "𝄪"
          : spelled.alter === -1
            ? "♭"
            : spelled.alter <= -2
              ? "𝄫"
              : "";
    return `${spelled.step}${acc}${spelled.octave}`;
  }

  private static formatDurationLabel(atoms: NotationDurationAtom[]): string {
    return atoms
      .map((a) => `1/${a.baseDenominator}${a.isDotted ? "." : ""}`)
      .join("+");
  }

  private static encodeNoteCell(
    stepIndex: number,
    baseDenominator: number,
    isDotted: boolean
  ): string {
    const idx = Math.max(0, Math.min(6, stepIndex));
    let cell: string;
    switch (baseDenominator) {
      case 1:
      case 16:
        cell = WHOLE_OR_16TH_CELLS[idx];
        break;
      case 2:
      case 32:
        cell = HALF_OR_32ND_CELLS[idx];
        break;
      case 4:
      case 64:
        cell = QUARTER_OR_64TH_CELLS[idx];
        break;
      default:
        cell = EIGHTH_OR_128TH_CELLS[idx];
        break;
    }
    return isDotted ? `${cell}'` : cell;
  }

  private static encodeRestCell(atom: NotationDurationAtom): string {
    let cell: string;
    switch (atom.baseDenominator) {
      case 1:
      case 16:
        cell = "M";
        break;
      case 2:
      case 32:
        cell = "U";
        break;
      case 4:
      case 64:
        cell = "V";
        break;
      default:
        cell = "X";
        break;
    }
    return atom.isDotted ? `${cell}'` : cell;
  }

  private static encodeFullMeasureRests(count: number): string {
    if (count <= 0) return "";
    if (count <= 3) return "M".repeat(count);
    return `#${TmdBrailleGenerator.encodeUpperDigits(count)}M`;
  }

  private static encodeOctaveMark(octave: number): string {
    if (octave < 1) return "@@";
    switch (octave) {
      case 1:
        return "@";
      case 2:
        return "^";
      case 3:
        return "_";
      case 4:
        return "\"";
      case 5:
        return ".";
      case 6:
        return ";";
      case 7:
        return ",";
      default:
        return ",,";
    }
  }

  private static shouldEmitOctave(
    currOctave: number,
    currStep: number,
    lastPitch: { octave: number; stepIndex: number } | null,
    forceOctave: boolean
  ): boolean {
    if (forceOctave || !lastPitch) return true;
    const dCurr = currOctave * 7 + currStep;
    const dPrev = lastPitch.octave * 7 + lastPitch.stepIndex;
    const delta = Math.abs(dCurr - dPrev);
    if (delta <= 2) return false;
    if (delta === 3 || delta === 4) return currOctave !== lastPitch.octave;
    return true;
  }

  private static encodeAccidental(alter: number): string {
    if (alter <= -2) return "<<";
    if (alter === -1) return "<";
    if (alter === 0) return "*";
    if (alter === 1) return "%";
    return "%%";
  }

  private static encodeIntervalSign(interval1To7: number): string {
    switch (interval1To7) {
      case 1:
        return "/";
      case 2:
        return "+";
      case 3:
        return "#";
      case 4:
        return "9";
      case 5:
        return "0";
      case 6:
        return "3";
      default:
        return "-";
    }
  }

  private static encodeKeySignature(key: string): string {
    const { fifths } = PitchMapping.parseKeyModeAndFifths(key);
    if (fifths === 0) return "";
    const count = Math.abs(fifths);
    const sign = fifths > 0 ? "%" : "<";
    if (count <= 3) return sign.repeat(count);
    return `#${TmdBrailleGenerator.encodeUpperDigits(count)}${sign}`;
  }

  private static encodeTimeSignature(beat: Beat): string {
    const c = Math.max(1, beat.count);
    const n = Math.max(1, beat.noteValue);
    return `#${TmdBrailleGenerator.encodeUpperDigits(c)}${TmdBrailleGenerator.encodeLowerDigits(n)}`;
  }

  private static encodeUpperDigits(num: number): string {
    const map: Record<string, string> = {
      "1": "A",
      "2": "B",
      "3": "C",
      "4": "D",
      "5": "E",
      "6": "F",
      "7": "G",
      "8": "H",
      "9": "I",
      "0": "J",
    };
    return Array.from(String(Math.max(0, Math.floor(num))))
      .map((d) => map[d] ?? "")
      .join("");
  }

  private static encodeLowerDigits(num: number): string {
    return String(Math.max(0, Math.floor(num)));
  }

  private static encodeLiteraryText(text: string): string {
    let out = "";
    let inNumber = false;
    for (const ch of text) {
      if (ch >= "0" && ch <= "9") {
        if (!inNumber) {
          out += "#";
          inNumber = true;
        }
        out += TmdBrailleGenerator.encodeUpperDigits(Number(ch));
      } else {
        inNumber = false;
        if (ch >= "A" && ch <= "Z") {
          out += `,${ch}`;
        } else if (ch >= "a" && ch <= "z") {
          out += ch.toUpperCase();
        } else if (ch === " ") {
          out += " ";
        } else if (ch === "-" || ch === "_") {
          out += "-";
        }
      }
    }
    return out;
  }

  private static encodeChordSymbolLiterary(
    chord: ChordSymbol,
    keyOffset: number
  ): string {
    const rootPitch = PitchMapping.spellChordRoot(chord.root, keyOffset);
    let out = `,${rootPitch.step.toUpperCase()}`;
    if (rootPitch.alter !== 0) {
      out += TmdBrailleGenerator.encodeAccidental(rootPitch.alter);
    }
    const q: ChordQualityKind = chord.quality;
    switch (q) {
      case "major":
        break;
      case "minor":
        out += "M";
        break;
      case "dominant7":
        out += "#G";
        break;
      case "major7":
        out += "MAJ#G";
        break;
      case "minor7":
        out += "M#G";
        break;
      case "diminished":
        out += "DIM";
        break;
      case "halfDiminished":
        out += "M#G-#E";
        break;
      case "augmented":
        out += "AUG";
        break;
      case "suspended":
        out += "SUS#D";
        break;
      case "power":
        out += "#E";
        break;
      default:
        if (q) {
          out += TmdBrailleGenerator.encodeLiteraryText(q);
        }
        break;
    }
    if (chord.bass) {
      const bassPitch = PitchMapping.spellChordRoot(chord.bass, keyOffset);
      out += `/,${bassPitch.step.toUpperCase()}`;
      if (bassPitch.alter !== 0) {
        out += TmdBrailleGenerator.encodeAccidental(bassPitch.alter);
      }
    }
    return out;
  }

  private static encodeChordStemSign(atom: NotationDurationAtom): string {
    let base: string;
    switch (atom.baseDenominator) {
      case 1:
        base = "_'";
        break;
      case 2:
        base = "_K";
        break;
      case 4:
        base = "_A";
        break;
      case 8:
        base = "_B";
        break;
      case 16:
        base = "_L";
        break;
      default:
        base = "_1";
        break;
    }
    return atom.isDotted ? `${base}'` : base;
  }

  private static partPrefixAscii(assignment: string): string {
    const trimmed = assignment.trim();
    const lower = trimmed.toLowerCase();
    switch (lower) {
      case "piano":
        return ">PN'";
      case "pianorh":
      case "righthand":
        return ".>";
      case "pianolh":
      case "lefthand":
        return "_>";
      case "organpedal":
        return "^>";
      case "violin":
        return ">VL'";
      case "violin1":
      case "v1":
        return ">VL1'";
      case "violin2":
      case "v2":
        return ">VL2'";
      case "violin3":
      case "v3":
        return ">VL3'";
      case "viola":
        return ">VLA'";
      case "cello":
      case "violoncello":
        return ">VC'";
      case "contrabass":
      case "doublebass":
        return ">CB'";
      case "bass":
        return ">BS'";
      case "guitar":
        return ">GT'";
      case "flute":
        return ">FL'";
      case "oboe":
        return ">OB'";
      case "clarinet":
        return ">CL'";
      case "bassoon":
        return ">BSN'";
      case "horn":
        return ">HN'";
      case "trumpet":
        return ">TR'";
      case "trombone":
        return ">TBN'";
      case "tuba":
        return ">TBA'";
      case "timpani":
        return ">TIM'";
      case "drums":
      case "percussion":
        return ">DR'";
      case "soprano":
        return ">S'";
      case "alto":
        return ">A'";
      case "tenor":
        return ">T'";
      case "vocal":
      case "solo":
        return "\">";
      case "chord":
      case "chords":
        return "3>";
      default: {
        const letters = lower.replace(/[^a-z]/g, "");
        const digits = lower.replace(/[^0-9]/g, "");
        let abbr: string;
        if (letters.length <= 3) {
          abbr = letters.length === 0 ? "PN" : letters.toUpperCase();
        } else {
          const first = letters[0].toUpperCase();
          const consonants = letters.slice(1).replace(/[aeiou]/g, "");
          if (consonants.length >= 2) {
            abbr = first + consonants.slice(0, 2).toUpperCase();
          } else {
            abbr = letters.slice(0, 3).toUpperCase();
          }
        }
        return `>${abbr}${digits}'`;
      }
    }
  }

  private static isChordSymbolAssignment(instrument: string): boolean {
    const lower = instrument.trim().toLowerCase();
    return lower === "chord" || lower === "chords";
  }

  private static isPercussionAssignment(
    instrument: string,
    entries: Entry[]
  ): boolean {
    const lower = instrument.toLowerCase();
    if (
      lower.includes("drum") ||
      lower.includes("perc") ||
      lower.includes("kit")
    ) {
      return true;
    }
    return entries.some(
      (entry) =>
        entry.assignment?.toLowerCase() === lower &&
        entry.sections.some((sec) =>
          sec.unitGroups.some((grp) =>
            grp.units.some((u) => u.type === "percussion")
          )
        )
    );
  }

  private static percussionStepAndOctave(token: string): {
    stepIndex: number;
    octave: number;
  } {
    switch (token) {
      case "D":
      case "d":
      case "B":
      case "b":
        return { stepIndex: 3, octave: 4 }; // F4
      case "T":
      case "t":
        return { stepIndex: 5, octave: 4 }; // A4
      case "S":
      case "s":
        return { stepIndex: 1, octave: 5 }; // D5
      case "X":
      case "x":
        return { stepIndex: 3, octave: 5 }; // F5
      case "O":
      case "o":
        return { stepIndex: 4, octave: 5 }; // G5
      case "C":
      case "c":
        return { stepIndex: 5, octave: 5 }; // A5
      default:
        return { stepIndex: 1, octave: 5 };
    }
  }

  private static cellUsesDots123(asciiChar: string): boolean {
    return !DOTS_456_ONLY.has(asciiChar);
  }
}
