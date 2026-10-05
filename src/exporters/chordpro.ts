import { SheetInstrumentHelper, TMDMeasureRenderer } from "../domain/index.js";
import { TMDMacroEvaluator } from "../playback/index.js";
import { ChordSymbol, KeySignature, Playback, Sheet } from "../syntax/index.js";

export interface ChordProOptions {
  measuresPerLine?: number;
}

export class TMDChordProGenerator {
  public static generateChordPro(
    rawSheet: Sheet,
    options: ChordProOptions = {}
  ): string {
    const sheet = TMDMacroEvaluator.expandThrowing(rawSheet);
    const lines: string[] = [];

    // Title and Metadata directives
    if (sheet.name) {
      lines.push(`{title: ${sheet.name}}`);
    }
    if (sheet.metadata) {
      if (sheet.metadata['subtitle']) lines.push(`{subtitle: ${sheet.metadata['subtitle']}}`);
      if (sheet.metadata['artist']) lines.push(`{artist: ${sheet.metadata['artist']}}`);
      if (sheet.metadata['composer']) {
        const comp = sheet.metadata['composer'].replace(/^曲[：:]\s*/, '');
        lines.push(`{composer: ${comp}}`);
      }
      if (sheet.metadata['lyricist'] || sheet.metadata['lyrics']) {
        const lyr = (sheet.metadata['lyricist'] || sheet.metadata['lyrics']).replace(/^詞[：:]\s*/, '');
        lines.push(`{lyricist: ${lyr}}`);
      }
      if (sheet.metadata['arranger']) {
        const arr = sheet.metadata['arranger'].replace(/^編[：:]\s*/, '');
        lines.push(`{arranger: ${arr}}`);
      }
    }

    if (sheet.keySignature) {
      lines.push(`{key: ${sheet.keySignature.toString()}}`);
    }
    if (sheet.beat && sheet.beat.count > 0 && sheet.beat.noteValue > 0) {
      lines.push(`{time: ${sheet.beat.count}/${sheet.beat.noteValue}}`);
    }
    if (sheet.speed > 0) {
      lines.push(`{tempo: ${Math.round(sheet.speed)}}`);
    }

    // Determine target track: pick guitar/chords instrument or first instrument
    const distinctInstruments = SheetInstrumentHelper.distinctInstruments(sheet, false);

    const targetInstrument =
      distinctInstruments.find((inst) =>
        /guitar|chord|lead|piano/i.test(inst)
      ) ||
      distinctInstruments[0];

    // Group sections by order
    const orders: Playback[] =
      sheet.playback.length > 0
        ? sheet.playback
        : Array.from(new Set(sheet.entries.map((p) => p.name))).map((n) => ({
            type: 'name' as const,
            name: n,
          }));

    const measuresPerLine = options.measuresPerLine ?? 4;
    let currentKeyOffset = sheet.keySignature.semitoneOffset;
    let emittedKeyOffset = currentKeyOffset;

    for (const order of orders) {
      if (order.type === 'relative') {
        const delta = parseInt(order.value.replace('+', ''), 10);
        if (!Number.isNaN(delta)) currentKeyOffset += delta;
        continue;
      }
      if (order.type === 'absolute') {
        currentKeyOffset = KeySignature.parse(order.value).semitoneOffset;
        continue;
      }
      if (order.type === 'name') {
        const pName = order.name;
        const sectionSheet: Sheet = {
          ...sheet,
          entries: sheet.entries.filter((p) => p.name === pName),
          playback: [{ type: 'name', name: pName }],
          keySignature: keySignatureForOffset(currentKeyOffset),
        };

        const sectionMeasures = TMDMeasureRenderer.renderMeasures(
          sectionSheet,
          targetInstrument
        );

        if (sectionMeasures.length === 0) continue;

        lines.push('');
        if (currentKeyOffset !== emittedKeyOffset) {
          lines.push(`{key: ${keySignatureForOffset(currentKeyOffset).toString()}}`);
          emittedKeyOffset = currentKeyOffset;
        }
        lines.push(`{comment: ${pName}}`);

        const measureStrings: string[] = [];

        for (const m of sectionMeasures) {
          const chordsInMeasure: string[] = [];
          for (const ev of m.events) {
            if (ev.content.type === 'chord') {
              chordsInMeasure.push(`[${chordText(ev.content.chord, ev.state.keyOffset)}]`);
            }
          }

          if (chordsInMeasure.length > 0) {
            measureStrings.push(chordsInMeasure.join(' '));
          } else {
            measureStrings.push('');
          }
        }

        // Format into lines of measuresPerLine: | [C] | [F] |
        for (let i = 0; i < measureStrings.length; i += measuresPerLine) {
          const chunk = measureStrings.slice(i, i + measuresPerLine);
          const chunkFormatted = chunk.map((c) => (c ? ` [${c.slice(1, -1)}] ` : ' ')).join('|');
          // More cleanly: chunk.map(c => c ? ` ${c} ` : ' ').join('|')
          const body = chunk.map((c) => (c ? ` ${c} ` : ' ')).join('|');
          lines.push(`|${body}|`);
        }
      }
    }

    return lines.join('\n') + '\n';
  }
}

const chromaticNames = ['C', "C'", 'D', "D'", 'E', 'F', "F'", 'G', "G'", 'A', "A'", 'B'];

function keySignatureForOffset(offset: number): KeySignature {
  const normalized = ((offset % 12) + 12) % 12;
  return KeySignature.parse(chromaticNames[normalized]);
}

function chordText(chord: ChordSymbol, keyOffset: number): string {
  const root = chord.root.isScaleDegree
    ? chromaticNames[((keyOffset + chord.root.semitoneOffset) % 12 + 12) % 12]
    : chord.root.toString();
  const suffix = chord.toString().slice(chord.root.toString().length);
  if (!chord.bass) return root + suffix;
  const qualitySuffix = suffix.split('/', 1)[0];
  const bass = chord.bass.isScaleDegree
    ? chromaticNames[((keyOffset + chord.bass.semitoneOffset) % 12 + 12) % 12]
    : chord.bass.toString();
  return `${root}${qualitySuffix}/${bass}`;
}
