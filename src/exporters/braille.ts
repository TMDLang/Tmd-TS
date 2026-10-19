import { SheetInstrumentHelper } from "../domain/index.js";
import {
  MeasureEvent,
  NotationDurationAtom,
  TmdMeasureRenderer,
} from "../playback/index.js";
import {
  Beat,
  ChordQualityKind,
  ChordSymbol,
  Entry,
  Note,
  PercussionStroke,
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
  /**
   * Maximum cells per line (`40` by default per standard Braille page width).
   * Pass `null` or `0` to disable line wrapping.
   */
  lineWidth?: number | null;
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
  groupTokens: string[];
  sightedSummary: string;
  endsWithCrossBarTie: boolean;
  startsWithCrossBarTie: boolean;
}

interface RenderedBrailleTrack {
  instrument: string;
  measures: RenderedBrailleMeasure[];
}

interface PreparedMeasure {
  measure: ReturnType<typeof TmdMeasureRenderer.renderMeasures>[number];
  preDirectives: string[];
  preSighted: string[];
  inlineDirectivesByOffset: Array<{
    offset: number;
    kind: "dynamics" | "tempo";
    ascii: string;
    label: string;
  }>;
  defaultKeyStepAlters: number[];
  activeBeat: Beat;
  isFullMeasureRest: boolean;
  groups: MeasureEvent[][];
  startsWithTie: boolean;
  endsWithTie: boolean;
}

interface BrailleDurationSpec {
  atoms: NotationDurationAtom[];
  tuplet: { id?: number; actual: number; normal: number } | null;
}

interface MeasureRhythmicItem {
  groupIndex: number;
  atomIndex: number;
  baseDenominator: number;
  isDotted: boolean;
  quarterValue: number;
  startOffset: number;
  isRest: boolean;
  tuplet: { id?: number; actual: number; normal: number } | null;
  tieStart: boolean;
  tieStop: boolean;
  hasInlineDirective: boolean;
}

type ValueDistinctionHint = "^<1" | ",<1";

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

const BRAILLE_STANDARD_VALUES: NotationDurationAtom[] = [
  { baseDenominator: 1, isDotted: false, quarterValue: 4.0 },
  { baseDenominator: 2, isDotted: true, quarterValue: 3.0 },
  { baseDenominator: 2, isDotted: false, quarterValue: 2.0 },
  { baseDenominator: 4, isDotted: true, quarterValue: 1.5 },
  { baseDenominator: 4, isDotted: false, quarterValue: 1.0 },
  { baseDenominator: 8, isDotted: true, quarterValue: 0.75 },
  { baseDenominator: 8, isDotted: false, quarterValue: 0.5 },
  { baseDenominator: 16, isDotted: true, quarterValue: 0.375 },
  { baseDenominator: 16, isDotted: false, quarterValue: 0.25 },
  { baseDenominator: 32, isDotted: true, quarterValue: 0.1875 },
  { baseDenominator: 32, isDotted: false, quarterValue: 0.125 },
  { baseDenominator: 64, isDotted: true, quarterValue: 0.09375 },
  { baseDenominator: 64, isDotted: false, quarterValue: 0.0625 },
  { baseDenominator: 128, isDotted: false, quarterValue: 0.03125 },
];

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
    const effectiveLineWidth: number | null =
      options.lineWidth === undefined
        ? 40
        : options.lineWidth !== null && options.lineWidth > 0
          ? options.lineWidth
          : null;

    const { sheet: workingSheet } = SheetInstrumentHelper.preparedForExport(rawSheet, false, {
      targetParagraph: options.targetSection?.trim() || undefined,
    });

    let instruments = TmdBrailleGenerator.distinctMusicalInstruments(workingSheet);
    if (options.targetInstrument && options.targetInstrument.trim().length > 0) {
      const targetInst = options.targetInstrument.trim().toLowerCase();
      instruments = instruments.filter((inst) => inst.toLowerCase() === targetInst);
    }

    const isSoloExport = layout === "partByPart" && instruments.length === 1;

    const asciiLines: string[] = [];
    const title = (workingSheet.name || "").trim();
    if (title.length > 0) {
      const titleAscii = TmdBrailleGenerator.encodeLiteraryText(title);
      if (isSoloExport && effectiveLineWidth !== null) {
        asciiLines.push(TmdBrailleGenerator.centerBrailleHeader(titleAscii, effectiveLineWidth));
        asciiLines.push("");
      } else {
        asciiLines.push(titleAscii);
      }
    }

    const bpm = Math.round(workingSheet.speed > 0 ? workingSheet.speed : 120);
    const metronomeAscii = `?7#${TmdBrailleGenerator.encodeUpperDigits(bpm)}`;
    const initialKey =
      workingSheet.declaredKey ??
      PitchMapping.tonicScaleInfo(workingSheet.keySignature.semitoneOffset).name;
    const keySigAscii = TmdBrailleGenerator.encodeKeySignature(initialKey);
    const timeSigAscii = TmdBrailleGenerator.encodeTimeSignature(workingSheet.beat);
    const headerLine = `${metronomeAscii} ${keySigAscii}${timeSigAscii}`;
    if (isSoloExport && effectiveLineWidth !== null) {
      asciiLines.push(TmdBrailleGenerator.centerBrailleHeader(headerLine, effectiveLineWidth));
    } else {
      asciiLines.push(headerLine);
    }

    const renderedTracks = instruments.map((inst) =>
      TmdBrailleGenerator.renderTrackMeasures(inst, workingSheet, isSoloExport)
    );

    if (instruments.length > 0) {
      if (layout === "partByPart") {
        for (const inst of instruments) {
          const initialPrefix = isSoloExport
            ? "#A"
            : TmdBrailleGenerator.partPrefixAscii(inst);
          const wrappedLines = TmdBrailleGenerator.renderPartByPartTrackLines(
            inst,
            workingSheet,
            isSoloExport,
            initialPrefix,
            effectiveLineWidth
          );
          asciiLines.push(...wrappedLines);
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
      const prefixAscii = isSoloExport
        ? "#A"
        : TmdBrailleGenerator.partPrefixAscii(track.instrument);
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

  private static centerBrailleHeader(line: string, width: number): string {
    if (line.length >= width) return line;
    const pad = Math.max(3, Math.floor((width - line.length) / 2));
    return " ".repeat(pad) + line;
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

  private static isBassClefInstrument(assignment: string): boolean {
    const lower = assignment.trim().toLowerCase();
    const bassInstruments = new Set([
      "pianolh",
      "lefthand",
      "organpedal",
      "cello",
      "violoncello",
      "contrabass",
      "doublebass",
      "bass",
      "electricbass",
      "acousticbass",
      "fretlessbass",
      "slapbass",
      "synthbass",
      "bassoon",
      "contrabassoon",
      "trombone",
      "basstrombone",
      "tuba",
      "euphonium",
      "baritone",
      "timpani",
    ]);
    return bassInstruments.has(lower);
  }

  private static coalesceSub128thGroups(
    rawGroups: MeasureEvent[][]
  ): MeasureEvent[][] {
    const minAtomDur = 0.03125;
    const epsilon = 1e-6;
    const out: MeasureEvent[][] = [];
    let i = 0;
    while (i < rawGroups.length) {
      const grp = rawGroups[i];
      const primary = grp[0];
      if (!primary || primary.duration >= minAtomDur - epsilon) {
        out.push(grp);
        i++;
        continue;
      }
      let accDur = primary.duration;
      let lastTieStart = grp.some((e) => e.tieStart);
      let j = i + 1;
      while (
        j < rawGroups.length &&
        accDur < minAtomDur - epsilon &&
        (rawGroups[j][0]?.duration ?? 0) < minAtomDur - epsilon
      ) {
        accDur += rawGroups[j][0].duration;
        lastTieStart = rawGroups[j].some((e) => e.tieStart);
        j++;
      }
      out.push(
        grp.map((ev) => ({
          ...ev,
          duration: accDur,
          tieStart: lastTieStart,
        }))
      );
      i = j;
    }
    return out;
  }

  private static prepareTrackMeasures(
    instrument: string,
    sheet: Sheet
  ): {
    measures: PreparedMeasure[];
    isChordTrack: boolean;
    isPercussion: boolean;
  } {
    const measures = TmdMeasureRenderer.renderMeasures(sheet, instrument);
    const isFixedPitchTrack = sheet.entries.some(
      (e) =>
        e.assignment?.toLowerCase() === instrument.toLowerCase() &&
        e.pitchMode === "fixed"
    );
    const isChordTrack = SheetInstrumentHelper.isChordSymbolTrack(instrument);
    const isPercussion = SheetInstrumentHelper.isPercussionTrack(
      sheet,
      instrument
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

    const prepared: PreparedMeasure[] = [];

    for (const measure of measures) {
      const preDirectives: string[] = [];
      const preSighted: string[] = [];
      const inlineDirectivesByOffset: Array<{
        offset: number;
        kind: "dynamics" | "tempo";
        ascii: string;
        label: string;
      }> = [];

      for (const directive of measure.directives) {
        const k = directive.kind;
        switch (k.type) {
          case "explicitKey":
          case "absoluteKey":
            if (!isFixedPitchTrack && k.key !== activeWrittenKey) {
              const ks = TmdBrailleGenerator.encodeKeySignatureChange(
                activeWrittenKey,
                k.key
              );
              activeWrittenKey = k.key;
              defaultKeyStepAlters = PitchMapping.keySignatureStepAlters(k.key);
              if (ks.length > 0) {
                preDirectives.push(ks);
              }
              preSighted.push(`Key: ${k.key}`);
            }
            break;
          case "relativeKey":
            if (!isFixedPitchTrack && !sheet.declaredKey) {
              const newKey = PitchMapping.tonicScaleInfo(
                directive.state.keyOffset
              ).name;
              if (newKey !== activeWrittenKey) {
                const ks = TmdBrailleGenerator.encodeKeySignatureChange(
                  activeWrittenKey,
                  newKey
                );
                activeWrittenKey = newKey;
                activeKeyOffset = directive.state.keyOffset;
                defaultKeyStepAlters =
                  PitchMapping.keySignatureStepAlters(newKey);
                if (ks.length > 0) {
                  preDirectives.push(ks);
                }
                preSighted.push(`Key: ${newKey}`);
              }
            }
            break;
          case "fixedPitch":
            activeWrittenKey = "C";
            defaultKeyStepAlters = [0, 0, 0, 0, 0, 0, 0];
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
            }
            break;
          case "tempo":
          case "relativeTempo": {
            const bpm = Math.round(directive.state.tempo);
            const relOffset = Math.max(
              0,
              directive.position - measure.startTime
            );
            const tempoAscii = `?7#${TmdBrailleGenerator.encodeUpperDigits(bpm)}`;
            if (relOffset <= 1e-4) {
              preDirectives.push(tempoAscii);
              preSighted.push(`♩=${bpm}`);
            } else {
              inlineDirectivesByOffset.push({
                offset: relOffset,
                kind: "tempo",
                ascii: ` " ${tempoAscii} `,
                label: `♩=${bpm}`,
              });
            }
            break;
          }
          case "dynamics": {
            const relOffset = Math.max(0, directive.position - measure.startTime);
            inlineDirectivesByOffset.push({
              offset: relOffset,
              kind: "dynamics",
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
          const ks = TmdBrailleGenerator.encodeKeySignatureChange(
            activeWrittenKey,
            newKey
          );
          activeWrittenKey = newKey;
          defaultKeyStepAlters = PitchMapping.keySignatureStepAlters(newKey);
          if (ks.length > 0) {
            preDirectives.push(ks);
          }
          preSighted.push(`Key: ${newKey}`);
        }
      }

      const isFullRest =
        nonRestEvents.length === 0 && inlineDirectivesByOffset.length === 0;
      const rawGroups = isFullRest
        ? []
        : TmdMeasureRenderer.groupSimultaneousEvents(measure.events);
      const groups = TmdBrailleGenerator.coalesceSub128thGroups(rawGroups);
      const startsWithTie = groups[0]?.some((e) => e.tieStop) ?? false;
      const endsWithTie =
        groups[groups.length - 1]?.some((e) => e.tieStart) ?? false;

      prepared.push({
        measure,
        preDirectives,
        preSighted,
        inlineDirectivesByOffset,
        defaultKeyStepAlters: [...defaultKeyStepAlters],
        activeBeat: { ...activeBeat },
        isFullMeasureRest: isFullRest,
        groups,
        startsWithTie,
        endsWithTie,
      });
    }

    return { measures: prepared, isChordTrack, isPercussion };
  }

  private static renderSinglePreparedMeasure(
    prep: PreparedMeasure,
    isChordTrack: boolean,
    isPercussion: boolean,
    useTopDownIntervals: boolean,
    pitchState: {
      lastPitch: { octave: number; stepIndex: number } | null;
      forceOctave: boolean;
    }
  ): RenderedBrailleMeasure {
    if (prep.preDirectives.length > 0) {
      pitchState.forceOctave = true;
    }

    if (prep.isFullMeasureRest) {
      return {
        index: prep.measure.index,
        isFullMeasureRest: true,
        hasLeadingKeyOrMeterChange: prep.preDirectives.length > 0,
        preMeasureDirectivesAscii: prep.preDirectives.join(" "),
        ascii: "M",
        groupTokens: ["M"],
        sightedSummary:
          prep.preSighted.length > 0
            ? `${prep.preSighted.join(", ")} · Full-measure rest`
            : "Full-measure rest",
        endsWithCrossBarTie: false,
        startsWithCrossBarTie: false,
      };
    }

    const groupSpecs = prep.groups.map((g) =>
      TmdBrailleGenerator.resolveBrailleDuration(
        g[0]?.duration ?? 0,
        g[0]?.tuplet
      )
    );

    const flatItems: MeasureRhythmicItem[] = [];
    const flatIndexByGroupAtom = new Map<string, number>();
    for (let gIdx = 0; gIdx < prep.groups.length; gIdx++) {
      const group = prep.groups[gIdx];
      const primary = group[0];
      if (!primary) continue;
      const isRest = primary.content.type === "rest";
      const spec = groupSpecs[gIdx];
      let subOffset = primary.startOffset;
      const hasInlineDir = prep.inlineDirectivesByOffset.some(
        (d) => Math.abs(d.offset - primary.startOffset) < 1e-4
      );
      for (let aIdx = 0; aIdx < spec.atoms.length; aIdx++) {
        const atom = spec.atoms[aIdx];
        const fIdx = flatItems.length;
        flatIndexByGroupAtom.set(`${gIdx}:${aIdx}`, fIdx);
        flatItems.push({
          groupIndex: gIdx,
          atomIndex: aIdx,
          baseDenominator: atom.baseDenominator,
          isDotted: atom.isDotted,
          quarterValue: atom.quarterValue,
          startOffset: subOffset,
          isRest,
          tuplet: spec.tuplet,
          tieStop: aIdx === 0 ? group.some((e) => e.tieStop) : true,
          tieStart:
            aIdx === spec.atoms.length - 1
              ? group.some((e) => e.tieStart)
              : true,
          hasInlineDirective: aIdx === 0 && hasInlineDir,
        });
        subOffset += atom.quarterValue;
      }
    }

    const groupedFlatIndices =
      isChordTrack || isPercussion
        ? new Set<number>()
        : TmdBrailleGenerator.computeGroupedFlatIndices(flatItems, prep.activeBeat);
    const distinctionHints =
      isChordTrack || isPercussion
        ? new Map<number, ValueDistinctionHint>()
        : TmdBrailleGenerator.computeValueDistinctionHints(flatItems, prep.activeBeat);

    const groupTupletPrefixes = new Array<string>(prep.groups.length).fill("");
    if (!isChordTrack && !isPercussion) {
      const tupletRuns: Array<{ start: number; end: number; actual: number }> = [];
      let idx = 0;
      while (idx < prep.groups.length) {
        const tup = groupSpecs[idx].tuplet;
        if (tup) {
          let j = idx + 1;
          if (tup.id !== undefined) {
            while (
              j < prep.groups.length &&
              groupSpecs[j].tuplet?.id === tup.id
            ) {
              j++;
            }
          } else {
            const targetSpan =
              (4.0 / (groupSpecs[idx].atoms[0]?.baseDenominator ?? 4)) *
              tup.normal;
            let accSpan = groupSpecs[idx].atoms.reduce(
              (s, a) => s + a.quarterValue,
              0
            );
            while (j < prep.groups.length) {
              const nextTup = groupSpecs[j].tuplet;
              if (
                nextTup &&
                nextTup.actual === tup.actual &&
                nextTup.normal === tup.normal &&
                accSpan < targetSpan - 1e-3
              ) {
                accSpan += groupSpecs[j].atoms.reduce(
                  (s, a) => s + a.quarterValue,
                  0
                );
                j++;
              } else {
                break;
              }
            }
          }
          tupletRuns.push({ start: idx, end: j, actual: tup.actual });
          idx = j;
        } else {
          idx++;
        }
      }

      for (let rIdx = 0; rIdx < tupletRuns.length; rIdx++) {
        const run = tupletRuns[rIdx];
        if (run.actual === 3) {
          const prevRun = rIdx > 0 ? tupletRuns[rIdx - 1] : null;
          const nextRun =
            rIdx + 1 < tupletRuns.length ? tupletRuns[rIdx + 1] : null;
          const adjacentToNon3 =
            (prevRun !== null &&
              prevRun.end === run.start &&
              prevRun.actual !== 3) ||
            (nextRun !== null &&
              nextRun.start === run.end &&
              nextRun.actual !== 3);
          groupTupletPrefixes[run.start] = adjacentToNon3 ? "_3'" : "2";
        } else {
          groupTupletPrefixes[run.start] =
            `_${TmdBrailleGenerator.encodeLowerDigits(run.actual)}'`;
        }
      }
    }

    const measureStepAlters = new Map<number, number[]>();
    const consumedDirectives = new Set<number>();
    const groupTokens: string[] = [];
    const sightedTokens: string[] = [...prep.preSighted];

    for (let gIdx = 0; gIdx < prep.groups.length; gIdx++) {
      const group = prep.groups[gIdx];
      const primary = group[0];
      if (!primary) continue;

      let pendingTempoInterruptAscii = "";
      let pendingDynamicAscii = "";
      for (let dIdx = 0; dIdx < prep.inlineDirectivesByOffset.length; dIdx++) {
        const item = prep.inlineDirectivesByOffset[dIdx];
        if (
          !consumedDirectives.has(dIdx) &&
          item.offset <= primary.startOffset + 1e-4
        ) {
          consumedDirectives.add(dIdx);
          if (item.kind === "tempo") {
            pendingTempoInterruptAscii += item.ascii;
          } else {
            pendingDynamicAscii += item.ascii;
          }
          sightedTokens.push(item.label);
          pitchState.forceOctave = true;
        }
      }

      const { ascii: groupAscii, sighted } =
        TmdBrailleGenerator.renderEventGroup(
          group,
          gIdx,
          groupSpecs[gIdx],
          flatIndexByGroupAtom,
          groupedFlatIndices,
          distinctionHints,
          groupTupletPrefixes[gIdx],
          pendingDynamicAscii,
          isChordTrack,
          isPercussion,
          useTopDownIntervals,
          prep.defaultKeyStepAlters,
          measureStepAlters,
          pitchState
        );
      if (sighted) {
        sightedTokens.push(sighted);
      }
      groupTokens.push(`${pendingTempoInterruptAscii}${groupAscii}`);
    }

    return {
      index: prep.measure.index,
      isFullMeasureRest: false,
      hasLeadingKeyOrMeterChange: prep.preDirectives.length > 0,
      preMeasureDirectivesAscii: prep.preDirectives.join(" "),
      ascii: groupTokens.join(""),
      groupTokens,
      sightedSummary: sightedTokens.join(" "),
      endsWithCrossBarTie: prep.endsWithTie,
      startsWithCrossBarTie: prep.startsWithTie,
    };
  }

  private static renderTrackMeasures(
    instrument: string,
    sheet: Sheet,
    isSolo: boolean
  ): RenderedBrailleTrack {
    const { measures: preparations, isChordTrack, isPercussion } =
      TmdBrailleGenerator.prepareTrackMeasures(instrument, sheet);
    const useTopDownIntervals =
      isSolo &&
      !isPercussion &&
      !TmdBrailleGenerator.isBassClefInstrument(instrument);
    const pitchState = {
      lastPitch: null as { octave: number; stepIndex: number } | null,
      forceOctave: true,
    };
    const outMeasures = preparations.map((prep) =>
      TmdBrailleGenerator.renderSinglePreparedMeasure(
        prep,
        isChordTrack,
        isPercussion,
        useTopDownIntervals,
        pitchState
      )
    );
    return { instrument, measures: outMeasures };
  }

  private static renderPartByPartTrackLines(
    instrument: string,
    sheet: Sheet,
    isSolo: boolean,
    initialPrefix: string,
    lineWidth: number | null
  ): string[] {
    if (lineWidth === null || lineWidth <= 0) {
      const rendered = TmdBrailleGenerator.renderTrackMeasures(
        instrument,
        sheet,
        isSolo
      );
      const body = TmdBrailleGenerator.joinTrackMeasuresAscii(rendered.measures);
      return [`${initialPrefix} ${body}<K`];
    }

    const maxW = lineWidth;
    const { measures: preparations, isChordTrack, isPercussion } =
      TmdBrailleGenerator.prepareTrackMeasures(instrument, sheet);
    const useTopDownIntervals =
      isSolo &&
      !isPercussion &&
      !TmdBrailleGenerator.isBassClefInstrument(instrument);

    type TrackBlock =
      | { type: "restRun"; preDirectives: string; count: number }
      | { type: "measureChain"; indices: number[] };

    const blocks: TrackBlock[] = [];
    let i = 0;
    while (i < preparations.length) {
      const p = preparations[i];
      if (p.isFullMeasureRest) {
        let restCount = 1;
        let j = i + 1;
        while (
          j < preparations.length &&
          preparations[j].isFullMeasureRest &&
          preparations[j].preDirectives.length === 0
        ) {
          restCount++;
          j++;
        }
        blocks.push({
          type: "restRun",
          preDirectives: p.preDirectives.join(" "),
          count: restCount,
        });
        i = j;
      } else {
        const chain = [i];
        let cur = p;
        let j = i + 1;
        while (
          j < preparations.length &&
          cur.endsWithTie &&
          preparations[j].startsWithTie &&
          preparations[j].preDirectives.length === 0 &&
          !preparations[j].isFullMeasureRest
        ) {
          chain.push(j);
          cur = preparations[j];
          j++;
        }
        blocks.push({ type: "measureChain", indices: chain });
        i = j;
      }
    }

    const lines: string[] = [];
    let currentLine = initialPrefix;
    const pitchState = {
      lastPitch: null as { octave: number; stepIndex: number } | null,
      forceOctave: true,
    };

    const appendSimpleToken = (token: string) => {
      if (!token) return;
      const sep = currentLine.endsWith(" ") ? "" : " ";
      if (currentLine.trim().length === 0) {
        currentLine += token;
      } else if (currentLine.length + sep.length + token.length <= maxW) {
        currentLine += sep + token;
      } else {
        lines.push(currentLine);
        currentLine = "  " + token;
        pitchState.forceOctave = true;
      }
    };

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const block = blocks[bIdx];
      const isLastBlock = bIdx === blocks.length - 1;
      const suffix = isLastBlock ? "<K" : "";

      if (block.type === "restRun") {
        if (block.preDirectives.length > 0) {
          appendSimpleToken(block.preDirectives);
        }
        const restToken =
          TmdBrailleGenerator.encodeFullMeasureRests(block.count) + suffix;
        appendSimpleToken(restToken);
      } else {
        const firstPrep = preparations[block.indices[0]];
        const preDir = firstPrep.preDirectives.join(" ");
        if (preDir.length > 0) {
          appendSimpleToken(preDir);
        }

        const savedPitch = pitchState.lastPitch
          ? { ...pitchState.lastPitch }
          : null;
        const savedForce = pitchState.forceOctave;
        const trialState = {
          lastPitch: savedPitch ? { ...savedPitch } : null,
          forceOctave: savedForce,
        };
        const trialMeasures = block.indices.map((idx) =>
          TmdBrailleGenerator.renderSinglePreparedMeasure(
            preparations[idx],
            isChordTrack,
            isPercussion,
            useTopDownIntervals,
            trialState
          )
        );
        const combinedAscii =
          trialMeasures.map((m) => m.ascii).join("") + suffix;
        const sep = currentLine.endsWith(" ") ? "" : " ";
        const lineHasMusicContent = currentLine.trim().length > 0;

        if (
          !lineHasMusicContent &&
          currentLine.length + combinedAscii.length <= maxW
        ) {
          currentLine += combinedAscii;
          pitchState.lastPitch = trialState.lastPitch;
          pitchState.forceOctave = trialState.forceOctave;
        } else if (
          lineHasMusicContent &&
          currentLine.length + sep.length + combinedAscii.length <= maxW
        ) {
          currentLine += sep + combinedAscii;
          pitchState.lastPitch = trialState.lastPitch;
          pitchState.forceOctave = trialState.forceOctave;
        } else {
          // Wrap to a new continuation line (`  `) and force octave mark on first pitched note (Par. CN-4)
          if (lineHasMusicContent) {
            lines.push(currentLine);
            currentLine = "  ";
          }
          const newLineState = {
            lastPitch: savedPitch ? { ...savedPitch } : null,
            forceOctave: true,
          };
          const newLineMeasures = block.indices.map((idx) =>
            TmdBrailleGenerator.renderSinglePreparedMeasure(
              preparations[idx],
              isChordTrack,
              isPercussion,
              useTopDownIntervals,
              newLineState
            )
          );
          const newCombined =
            newLineMeasures.map((m) => m.ascii).join("") + suffix;
          const newSep =
            currentLine === "  " || currentLine.endsWith(" ") ? "" : " ";
          if (
            currentLine.length + newSep.length + newCombined.length <= maxW
          ) {
            currentLine += newSep + newCombined;
            pitchState.lastPitch = newLineState.lastPitch;
            pitchState.forceOctave = newLineState.forceOctave;
          } else {
            if (newSep.length > 0) {
              currentLine += newSep;
            }
            const allGroups = newLineMeasures.flatMap((m) => m.groupTokens);
            for (let gIdx = 0; gIdx < allGroups.length; gIdx++) {
              const gToken = allGroups[gIdx];
              const isLastGroup = gIdx === allGroups.length - 1;
              const tokWithSuffix = isLastGroup ? gToken + suffix : gToken;
              const reserve = isLastGroup ? 0 : 1;
              if (
                currentLine.length + tokWithSuffix.length + reserve > maxW &&
                currentLine.trim().length > 0
              ) {
                lines.push(currentLine + "\"");
                currentLine = "  " + tokWithSuffix;
              } else {
                currentLine += tokWithSuffix;
              }
            }
            pitchState.lastPitch = newLineState.lastPitch;
            pitchState.forceOctave = newLineState.forceOctave;
          }
        }
      }
    }

    if (currentLine.trim().length > 0) {
      lines.push(currentLine);
    }
    return lines;
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

  private static resolveBrailleDuration(
    quarterNotes: number,
    explicitTuplet?: {
      id: number;
      actual: number;
      normal: number;
      writtenDuration: number;
    }
  ): BrailleDurationSpec {
    const epsilon = 1e-4;
    if (explicitTuplet && explicitTuplet.writtenDuration > epsilon) {
      const scale = quarterNotes / explicitTuplet.writtenDuration;
      let rem = explicitTuplet.writtenDuration;
      const atoms: NotationDurationAtom[] = [];
      while (rem > epsilon) {
        let matched = false;
        for (const std of BRAILLE_STANDARD_VALUES) {
          if (rem >= std.quarterValue - epsilon) {
            atoms.push({
              baseDenominator: std.baseDenominator,
              isDotted: std.isDotted,
              quarterValue: std.quarterValue * scale,
            });
            rem -= std.quarterValue;
            matched = true;
            break;
          }
        }
        if (!matched) {
          if (rem > 1e-6) {
            atoms.push({
              baseDenominator: 128,
              isDotted: false,
              quarterValue: rem * scale,
            });
          }
          break;
        }
      }
      if (atoms.length > 0) {
        return {
          atoms,
          tuplet: {
            id: explicitTuplet.id,
            actual: explicitTuplet.actual,
            normal: explicitTuplet.normal,
          },
        };
      }
    }

    for (const std of BRAILLE_STANDARD_VALUES) {
      if (Math.abs(quarterNotes - std.quarterValue) < epsilon) {
        return { atoms: [{ ...std }], tuplet: null };
      }
    }

    const tupletRatios: Array<{ actual: number; normal: number }> = [
      { actual: 3, normal: 2 },
      { actual: 5, normal: 4 },
      { actual: 5, normal: 3 },
      { actual: 7, normal: 4 },
      { actual: 7, normal: 5 },
      { actual: 7, normal: 6 },
      { actual: 9, normal: 8 },
      { actual: 11, normal: 8 },
      { actual: 11, normal: 7 },
      { actual: 13, normal: 8 },
      { actual: 2, normal: 3 },
      { actual: 4, normal: 3 },
      { actual: 6, normal: 4 },
    ];
    const baseDenominators = [1, 2, 4, 8, 16, 32, 64, 128];
    for (const ratio of tupletRatios) {
      for (const baseDen of baseDenominators) {
        const faceQ = 4.0 / baseDen;
        const tupQ = (faceQ * ratio.normal) / ratio.actual;
        if (Math.abs(quarterNotes - tupQ) < epsilon) {
          return {
            atoms: [
              {
                baseDenominator: baseDen,
                isDotted: false,
                quarterValue: quarterNotes,
              },
            ],
            tuplet: ratio,
          };
        }
      }
    }

    let remaining = quarterNotes;
    const result: NotationDurationAtom[] = [];
    while (remaining > epsilon) {
      let matched = false;
      for (const std of BRAILLE_STANDARD_VALUES) {
        if (remaining >= std.quarterValue - epsilon) {
          result.push({ ...std });
          remaining -= std.quarterValue;
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (remaining > 1e-6) {
          result.push({
            baseDenominator: 128,
            isDotted: false,
            quarterValue: remaining,
          });
        }
        break;
      }
    }
    if (result.length === 0) {
      result.push({ baseDenominator: 4, isDotted: false, quarterValue: 1.0 });
    }
    return { atoms: result, tuplet: null };
  }

  private static computeGroupedFlatIndices(
    items: MeasureRhythmicItem[],
    beat: Beat
  ): Set<number> {
    if (items.length < 3) return new Set<number>();

    const expectedQ = beat.count * (4.0 / Math.max(1, beat.noteValue));
    const totalQ = items.reduce((s, a) => s + a.quarterValue, 0);
    if (Math.abs(totalQ - expectedQ) > 1e-3) {
      return new Set<number>();
    }

    const isCompound =
      beat.count >= 6 &&
      beat.count % 3 === 0 &&
      (beat.noteValue === 8 || beat.noteValue === 16);
    const beatQ = isCompound
      ? 3.0 * (4.0 / Math.max(1, beat.noteValue))
      : 4.0 / Math.max(1, beat.noteValue);
    const halfBeatQ = isCompound ? beatQ / 3.0 : beatQ / 2.0;

    const grouped = new Set<number>();
    let i = 0;
    while (i < items.length) {
      const first = items[i];
      if (
        (first.baseDenominator !== 16 &&
          first.baseDenominator !== 32 &&
          first.baseDenominator !== 64) ||
        first.isDotted ||
        first.tuplet !== null
      ) {
        i++;
        continue;
      }

      const noteQ = 4.0 / first.baseDenominator;
      let matchedLen = 0;

      const beatsFromStart = first.startOffset / beatQ;
      if (Math.abs(beatsFromStart - Math.round(beatsFromStart)) < 1e-3) {
        const nBeat = Math.round(beatQ / noteQ);
        if (
          nBeat >= 3 &&
          i + nBeat <= items.length &&
          TmdBrailleGenerator.canFormGroup(items, i, nBeat)
        ) {
          matchedLen = nBeat;
        }
      }

      if (matchedLen === 0 && !isCompound) {
        const halfBeatsFromStart = first.startOffset / halfBeatQ;
        if (
          Math.abs(halfBeatsFromStart - Math.round(halfBeatsFromStart)) < 1e-3
        ) {
          const nHalf = Math.round(halfBeatQ / noteQ);
          if (
            nHalf >= 4 &&
            i + nHalf <= items.length &&
            TmdBrailleGenerator.canFormGroup(items, i, nHalf)
          ) {
            matchedLen = nHalf;
          }
        }
      }

      if (matchedLen > 0) {
        for (let k = i + 1; k < i + matchedLen; k++) {
          grouped.add(k);
        }
        i += matchedLen;
      } else {
        i++;
      }
    }
    return grouped;
  }

  private static canFormGroup(
    items: MeasureRhythmicItem[],
    start: number,
    length: number
  ): boolean {
    const targetDen = items[start].baseDenominator;
    if (items[start].tieStop || items[start + length - 1].tieStart) {
      return false;
    }
    for (let k = start; k < start + length; k++) {
      const it = items[k];
      if (
        it.baseDenominator !== targetDen ||
        it.isDotted ||
        it.tuplet !== null
      ) {
        return false;
      }
      if (k > start && (it.isRest || it.tieStop || it.hasInlineDirective)) {
        return false;
      }
      if (k < start + length - 1 && it.tieStart) {
        return false;
      }
    }
    for (let afterIdx = start + length; afterIdx < items.length; afterIdx++) {
      const nextItem = items[afterIdx];
      if (nextItem.baseDenominator === 8 && nextItem.tuplet === null) {
        return false;
      }
    }
    return true;
  }

  private static computeValueDistinctionHints(
    items: MeasureRhythmicItem[],
    beat: Beat
  ): Map<number, ValueDistinctionHint> {
    if (items.length === 0) return new Map();
    const hints = new Map<number, ValueDistinctionHint>();

    const expectedQ = beat.count * (4.0 / Math.max(1, beat.noteValue));
    const totalQ = items.reduce((s, a) => s + a.quarterValue, 0);

    if (
      items.length === 1 &&
      items[0].isRest &&
      items[0].baseDenominator === 16
    ) {
      hints.set(0, ",<1");
      return hints;
    }

    const hasLarge = items.some((a) => a.baseDenominator <= 8);
    const hasSmall = items.some((a) => a.baseDenominator >= 16);

    const classOf = (den: number): number => {
      switch (den) {
        case 1:
        case 16:
          return 0;
        case 2:
        case 32:
          return 1;
        case 4:
        case 64:
          return 2;
        default:
          return 3;
      }
    };

    if (hasLarge && hasSmall) {
      const largeClasses = new Set(
        items
          .filter((a) => a.baseDenominator <= 8)
          .map((a) => classOf(a.baseDenominator))
      );
      const smallClasses = new Set(
        items
          .filter((a) => a.baseDenominator >= 16)
          .map((a) => classOf(a.baseDenominator))
      );
      const sharesAmbiguousClass = Array.from(largeClasses).some((c) =>
        smallClasses.has(c)
      );
      const isPickupOrIncomplete = Math.abs(totalQ - expectedQ) > 1e-3;

      if (sharesAmbiguousClass || isPickupOrIncomplete) {
        for (let idx = 1; idx < items.length; idx++) {
          const prevSmall = items[idx - 1].baseDenominator >= 16;
          const currSmall = items[idx].baseDenominator >= 16;
          if (prevSmall !== currSmall) {
            hints.set(idx, currSmall ? ",<1" : "^<1");
          }
        }
      }
    } else if (hasSmall && !hasLarge && Math.abs(totalQ - expectedQ) > 1e-3) {
      if (Math.abs(totalQ * 16.0 - expectedQ) < 1e-3) {
        hints.set(0, ",<1");
      }
    }

    return hints;
  }

  private static renderEventGroup(
    group: MeasureEvent[],
    groupIndex: number,
    spec: BrailleDurationSpec,
    flatIndexByGroupAtom: Map<string, number>,
    groupedFlatIndices: Set<number>,
    distinctionHints: Map<number, ValueDistinctionHint>,
    tupletPrefixAscii: string,
    pendingDynamicAscii: string,
    isChordTrack: boolean,
    isPercussion: boolean,
    useTopDownIntervals: boolean,
    defaultKeyStepAlters: number[],
    measureStepAlters: Map<number, number[]>,
    pitchState: {
      lastPitch: { octave: number; stepIndex: number } | null;
      forceOctave: boolean;
    }
  ): { ascii: string; sighted: string } {
    const first = group[0];
    if (!first) return { ascii: "", sighted: "" };
    const atoms = spec.atoms;

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
      if (useTopDownIntervals) {
        notes.sort((a, b) => {
          const d0 = a.spelled.octave * 7 + a.spelled.stepIndex;
          const d1 = b.spelled.octave * 7 + b.spelled.stepIndex;
          if (d0 !== d1) return d1 - d0;
          return b.spelled.midiPitch - a.spelled.midiPitch;
        });
      } else {
        notes.sort((a, b) => {
          const d0 = a.spelled.octave * 7 + a.spelled.stepIndex;
          const d1 = b.spelled.octave * 7 + b.spelled.stepIndex;
          if (d0 !== d1) return d0 - d1;
          return a.spelled.midiPitch - b.spelled.midiPitch;
        });
      }

      let out = "";
      for (let atomIdx = 0; atomIdx < atoms.length; atomIdx++) {
        const atom = atoms[atomIdx];
        const flatIdx = flatIndexByGroupAtom.get(`${groupIndex}:${atomIdx}`) ?? -1;
        const hintStr = distinctionHints.get(flatIdx) ?? "";
        const forcedAtStart = pitchState.forceOctave;
        if (hintStr.length > 0) {
          pitchState.forceOctave = true;
        }
        const effectiveAtom: NotationDurationAtom = groupedFlatIndices.has(flatIdx)
          ? {
              baseDenominator: 8,
              isDotted: false,
              quarterValue: atom.quarterValue,
            }
          : atom;

        const base = notes[0];
        const isContinuationAtom =
          atomIdx > 0 || (base.event.tieStop && !forcedAtStart);
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
          effectiveAtom.baseDenominator,
          effectiveAtom.isDotted
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
          const deltaFromBase = useTopDownIntervals
            ? Math.max(0, baseDiatonic - memDiatonic)
            : Math.max(0, memDiatonic - baseDiatonic);
          const deltaFromPrev = useTopDownIntervals
            ? Math.max(0, prevDiatonic - memDiatonic)
            : Math.max(0, memDiatonic - prevDiatonic);
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

        const tieStr = needsInternalTie ? (notes.length > 1 ? ".C" : "@C") : "";
        const tupStr = atomIdx === 0 ? tupletPrefixAscii : "";
        const coreAtomAscii = `${tupStr}${accStr}${octStr}${noteCell}${intervalsStr}${tieStr}`;
        const dynWrappedAscii =
          atomIdx === 0
            ? TmdBrailleGenerator.prependDynamic(
                pendingDynamicAscii,
                coreAtomAscii
              )
            : coreAtomAscii;
        out += `${hintStr}${dynWrappedAscii}`;
      }

      const pitchNames = [...notes]
        .sort((a, b) => {
          const d0 = a.spelled.octave * 7 + a.spelled.stepIndex;
          const d1 = b.spelled.octave * 7 + b.spelled.stepIndex;
          if (d0 !== d1) return d0 - d1;
          return a.spelled.midiPitch - b.spelled.midiPitch;
        })
        .map((n) => TmdBrailleGenerator.formatSpelledPitchName(n.spelled));
      const durLabel = TmdBrailleGenerator.formatDurationLabel(atoms);
      const tieSuffix = notes[0].event.tieStart ? "~" : "";
      const chordName =
        pitchNames.length > 1 ? pitchNames.join("+") : pitchNames[0];
      return {
        ascii: out,
        sighted: `${chordName}(${durLabel})${tieSuffix}`,
      };
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
          ascii: TmdBrailleGenerator.prependDynamic(
            pendingDynamicAscii,
            `${sym}${stem}`
          ),
          sighted: `[${chord.toString()}](${durLabel})`,
        };
      } else {
        const rawVoiced = PitchMapping.spellChordVoicing(
          chord,
          first.state.keyOffset
        );
        const voiced = useTopDownIntervals
          ? [...rawVoiced].reverse()
          : rawVoiced;
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
            const memDiatonic = member.octave * 7 + member.stepIndex;
            const delta = useTopDownIntervals
              ? Math.max(1, baseDiatonic - memDiatonic)
              : Math.max(1, memDiatonic - baseDiatonic);
            const intIdx = ((delta - 1) % 7) + 1;
            const intOct =
              delta > 7
                ? TmdBrailleGenerator.encodeOctaveMark(member.octave)
                : "";
            intervalsStr += `${memAcc}${intOct}${TmdBrailleGenerator.encodeIntervalSign(intIdx)}`;
          }
          const tieStr = atomIdx < atoms.length - 1 ? ".C" : "";
          const tupStr = atomIdx === 0 ? tupletPrefixAscii : "";
          out += `${tupStr}${accStr}${octStr}${noteCell}${intervalsStr}${tieStr}`;
        }
        return {
          ascii: TmdBrailleGenerator.prependDynamic(pendingDynamicAscii, out),
          sighted: `[${chord.toString()}](${durLabel})`,
        };
      }
    }

    // 3. Percussion event(s)
    const percEvents = group.filter((ev) => ev.content.type === "percussion");
    if (percEvents.length > 0) {
      const patterns = percEvents.map((ev) =>
        Array.from(
          ev.content.type === "percussion" ? ev.content.pattern : ""
        ).filter((c) => c.trim().length > 0 && c !== "(" && c !== ")")
      );
      const maxSlots = Math.max(0, ...patterns.map((p) => p.length));
      if (maxSlots === 0) {
        return {
          ascii: TmdBrailleGenerator.prependDynamic(
            pendingDynamicAscii,
            atoms.map((a) => TmdBrailleGenerator.encodeRestCell(a)).join("")
          ),
          sighted: `Rest(${TmdBrailleGenerator.formatDurationLabel(atoms)})`,
        };
      }
      const subDur = first.duration / maxSlots;
      const subSpec = TmdBrailleGenerator.resolveBrailleDuration(subDur);
      const subAtom = subSpec.atoms[0] ?? {
        baseDenominator: 4,
        isDotted: false,
        quarterValue: 1.0,
      };
      let out = "";
      const sightedSlots: string[] = [];
      for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
        const slotChars = patterns
          .map((p) => p[slotIdx])
          .filter((ch): ch is string => Boolean(ch && ch !== "-" && ch !== "."));
        if (slotChars.length === 0) {
          out += TmdBrailleGenerator.encodeRestCell(subAtom);
          sightedSlots.push("-");
          continue;
        }
        sightedSlots.push(slotChars.join("+"));
        const positions = slotChars
          .map(
            (ch) =>
              PercussionStroke.fromCharacter(ch)?.unpitchedDisplayPosition ??
              PercussionStroke.snare.unpitchedDisplayPosition
          )
          .sort(
            (a, b) =>
              a.octave * 7 + a.stepIndex - (b.octave * 7 + b.stepIndex)
          );
        const basePos = positions[0];
        const octStr = TmdBrailleGenerator.shouldEmitOctave(
          basePos.octave,
          basePos.stepIndex,
          pitchState.lastPitch,
          pitchState.forceOctave
        )
          ? TmdBrailleGenerator.encodeOctaveMark(basePos.octave)
          : "";
        pitchState.lastPitch = {
          octave: basePos.octave,
          stepIndex: basePos.stepIndex,
        };
        pitchState.forceOctave = false;
        let intervalsStr = "";
        const baseDiatonic = basePos.octave * 7 + basePos.stepIndex;
        let prevDiatonic = baseDiatonic;
        for (let mIdx = 1; mIdx < positions.length; mIdx++) {
          const memPos = positions[mIdx];
          const memDiatonic = memPos.octave * 7 + memPos.stepIndex;
          const deltaFromBase = Math.max(0, memDiatonic - baseDiatonic);
          const deltaFromPrev = Math.max(0, memDiatonic - prevDiatonic);
          prevDiatonic = memDiatonic;
          if (deltaFromBase === 0) {
            intervalsStr += `${TmdBrailleGenerator.encodeOctaveMark(memPos.octave)}-`;
          } else {
            const intIdx = ((deltaFromBase - 1) % 7) + 1;
            const needOct = deltaFromBase > 7 || deltaFromPrev >= 7;
            const intOct = needOct
              ? TmdBrailleGenerator.encodeOctaveMark(memPos.octave)
              : "";
            intervalsStr += `${intOct}${TmdBrailleGenerator.encodeIntervalSign(intIdx)}`;
          }
        }
        out += `${octStr}${TmdBrailleGenerator.encodeNoteCell(
          basePos.stepIndex,
          subAtom.baseDenominator,
          subAtom.isDotted
        )}${intervalsStr}`;
      }
      return {
        ascii: TmdBrailleGenerator.prependDynamic(pendingDynamicAscii, out),
        sighted: `Perc(${sightedSlots.join("")})`,
      };
    }

    // 4. Rest event
    const prefix = isChordTrack ? "\"" : "";
    let restOut = "";
    for (let atomIdx = 0; atomIdx < atoms.length; atomIdx++) {
      const atom = atoms[atomIdx];
      const flatIdx = flatIndexByGroupAtom.get(`${groupIndex}:${atomIdx}`) ?? -1;
      const hintStr = distinctionHints.get(flatIdx) ?? "";
      if (hintStr.length > 0) {
        pitchState.forceOctave = true;
      }
      const tupStr = atomIdx === 0 ? tupletPrefixAscii : "";
      const coreRestAscii = `${tupStr}${prefix}${TmdBrailleGenerator.encodeRestCell(atom)}`;
      const dynWrappedRestAscii =
        atomIdx === 0
          ? TmdBrailleGenerator.prependDynamic(
              pendingDynamicAscii,
              coreRestAscii
            )
          : coreRestAscii;
      restOut += `${hintStr}${dynWrappedRestAscii}`;
    }
    return {
      ascii: restOut,
      sighted: `Rest(${TmdBrailleGenerator.formatDurationLabel(atoms)})`,
    };
  }

  private static prependDynamic(
    pendingDynamicAscii: string,
    groupAscii: string
  ): string {
    if (!pendingDynamicAscii) return groupAscii;
    const firstChar = groupAscii[0];
    if (firstChar && TmdBrailleGenerator.cellUsesDots123(firstChar)) {
      return `${pendingDynamicAscii}'${groupAscii}`;
    }
    return `${pendingDynamicAscii}${groupAscii}`;
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

  private static encodeAccidentalRun(count: number, sign: string): string {
    if (count <= 0) return "";
    if (count <= 3) return sign.repeat(count);
    return `#${TmdBrailleGenerator.encodeUpperDigits(count)}${sign}`;
  }

  private static encodeKeySignature(key: string): string {
    const { fifths } = PitchMapping.parseKeyModeAndFifths(key);
    if (fifths === 0) return "";
    const count = Math.abs(fifths);
    const sign = fifths > 0 ? "%" : "<";
    return TmdBrailleGenerator.encodeAccidentalRun(count, sign);
  }

  private static encodeKeySignatureChange(
    fromKey: string,
    toKey: string
  ): string {
    const { fifths: oldFifths } = PitchMapping.parseKeyModeAndFifths(fromKey);
    const { fifths: newFifths } = PitchMapping.parseKeyModeAndFifths(toKey);
    let cancelCount = 0;
    if (oldFifths !== 0) {
      if (newFifths === 0 || oldFifths * newFifths < 0) {
        cancelCount = Math.abs(oldFifths);
      } else if (Math.abs(newFifths) < Math.abs(oldFifths)) {
        cancelCount = Math.abs(oldFifths) - Math.abs(newFifths);
      }
    }
    const cancelAscii = TmdBrailleGenerator.encodeAccidentalRun(
      cancelCount,
      "*"
    );
    const newAscii = TmdBrailleGenerator.encodeKeySignature(toKey);
    return cancelAscii + newAscii;
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
        } else if (ch === "+") {
          out += "+";
        } else if (ch === "(" || ch === ")") {
          out += "7";
        } else if (ch === "/") {
          out += "/";
        } else if (ch === "#" || ch === "'") {
          out += "%";
        } else if (ch === "°") {
          out += "4";
        } else if (ch === "ø") {
          out += "4'";
        } else if (ch === "Δ") {
          out += "0";
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

  private static cellUsesDots123(asciiChar: string): boolean {
    return !DOTS_456_ONLY.has(asciiChar);
  }
}
