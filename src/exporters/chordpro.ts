import { SheetInstrumentHelper } from "../domain/index.js";
import { TmdMeasureRenderer } from "../playback/index.js";
import { ChordSymbol, KeySignature, PitchMapping, Playback, Sheet, SpelledPitch } from "../syntax/index.js";

export interface ChordProOptions {
  measuresPerLine?: number;
}

export class TmdChordProGenerator {
  public static generateChordPro(
    rawSheet: Sheet,
    options: ChordProOptions = {}
  ): string {
    const { sheet, instruments: distinctInstruments } = SheetInstrumentHelper.preparedForExport(rawSheet);
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
      const initialKeyName =
        sheet.declaredKey ||
        PitchMapping.tonicScaleInfo(sheet.keySignature.semitoneOffset).name;
      lines.push(`{key: ${initialKeyName}}`);
    }
    if (sheet.beat && sheet.beat.count > 0 && sheet.beat.noteValue > 0) {
      lines.push(`{time: ${sheet.beat.count}/${sheet.beat.noteValue}}`);
    }
    if (sheet.speed > 0) {
      lines.push(`{tempo: ${Math.round(sheet.speed)}}`);
    }

    // Determine target track: pick guitar/chords instrument or first instrument
    const targetInstrument =
      distinctInstruments.find((inst) =>
        /guitar|chord|lead|piano/i.test(inst)
      ) ||
      distinctInstruments[0];

    // Group sections by order
    const orders = SheetInstrumentHelper.effectivePlaybackOrders(sheet);

    const measuresPerLine = Math.max(1, options.measuresPerLine ?? 4);
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
        const sectionEntries = sheet.entries.filter((p) => p.name === pName);
        const sectionSheet: Sheet = {
          ...sheet,
          entries: sectionEntries,
          playback: [
            {
              type: 'name',
              name: pName,
              ...(order.stanza !== undefined ? { stanza: order.stanza } : {}),
            },
          ],
          keySignature: keySignatureForOffset(currentKeyOffset),
        };

        const sectionInstruments = Array.from(
          new Set(
            sectionEntries
              .map((p) => p.assignment)
              .filter((inst): inst is string => Boolean(inst && inst.trim()))
          )
        );
        const sectionInstrument = sectionInstruments.includes(targetInstrument)
          ? targetInstrument
          : sectionInstruments.find((inst) => /guitar|chord|lead|piano/i.test(inst)) ||
            sectionInstruments[0] ||
            targetInstrument;

        const sectionMeasures = TmdMeasureRenderer.renderMeasures(
          sectionSheet,
          sectionInstrument
        );

        const vocalEntry = sectionEntries.find((entry) =>
          entry.sections.some((sec) => sec.lyrics && sec.lyrics.length > 0)
        );
        const vocalInstrument = vocalEntry?.assignment;
        const vocalMeasures = vocalInstrument
          ? vocalInstrument === sectionInstrument
            ? sectionMeasures
            : TmdMeasureRenderer.renderMeasures(sectionSheet, vocalInstrument)
          : [];
        const hasVocalLyrics = vocalMeasures.some((m) =>
          m.events.some((ev) => ev.lyric !== undefined)
        );

        if (sectionMeasures.length === 0 && vocalMeasures.length === 0) continue;

        lines.push('');
        if (currentKeyOffset !== emittedKeyOffset) {
          lines.push(`{key: ${PitchMapping.tonicScaleInfo(currentKeyOffset).name}}`);
          emittedKeyOffset = currentKeyOffset;
        }
        lines.push(`{comment: ${pName}}`);

        if (hasVocalLyrics) {
          const lyricMeasureStrings: string[] = [];
          const maxLen = Math.max(sectionMeasures.length, vocalMeasures.length);
          for (let mIdx = 0; mIdx < maxLen; mIdx++) {
            const cMeasure = sectionMeasures[mIdx];
            const vMeasure = vocalMeasures[mIdx];
            const chordEvents: Array<{ offset: number; text: string; consumed: boolean }> = [];
            if (cMeasure) {
              for (const ev of cMeasure.events) {
                if (ev.content.type === 'chord' && !ev.tieStop) {
                  chordEvents.push({
                    offset: ev.startOffset,
                    text: `[${chordText(ev.content.chord, ev.state.keyOffset)}]`,
                    consumed: false,
                  });
                }
              }
            }
            if (vMeasure && vMeasure !== cMeasure) {
              for (const ev of vMeasure.events) {
                if (ev.content.type === 'chord' && !ev.tieStop) {
                  chordEvents.push({
                    offset: ev.startOffset,
                    text: `[${chordText(ev.content.chord, ev.state.keyOffset)}]`,
                    consumed: false,
                  });
                }
              }
            }
            chordEvents.sort((a, b) => a.offset - b.offset);

            const tokens: string[] = [];
            if (vMeasure) {
              const vGroups = TmdMeasureRenderer.groupSimultaneousEvents(vMeasure.events);
              for (let gIdx = 0; gIdx < vGroups.length; gIdx++) {
                const group = vGroups[gIdx];
                const primary = group.find((e) => e.content.type === 'note') ?? group[0];
                if (!primary) continue;
                const nextOffset =
                  gIdx + 1 < vGroups.length
                    ? (vGroups[gIdx + 1][0]?.startOffset ?? vMeasure.nominalDuration)
                    : vMeasure.nominalDuration;
                const matchingChords = chordEvents.filter(
                  (ce) => !ce.consumed && ce.offset < nextOffset - 1e-4
                );
                for (const ce of matchingChords) {
                  ce.consumed = true;
                }
                const chordPrefix = matchingChords.map((ce) => ce.text).join('');
                const lyr = primary.lyric;
                if (lyr && lyr.kind === 'syllable') {
                  tokens.push(`${chordPrefix}${lyr.rawText}`);
                } else if (chordPrefix.length > 0) {
                  tokens.push(chordPrefix);
                }
              }
            }
            const unconsumed = chordEvents.filter((ce) => !ce.consumed);
            for (const ce of unconsumed) {
              tokens.push(ce.text);
            }
            if (tokens.length > 0) {
              lyricMeasureStrings.push(tokens.join(' '));
            }
          }
          for (let i = 0; i < lyricMeasureStrings.length; i += measuresPerLine) {
            const chunk = lyricMeasureStrings.slice(i, i + measuresPerLine);
            lines.push(chunk.join(' '));
          }
          continue;
        }

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
          const body = chunk.map((c) => (c ? ` ${c} ` : ' ')).join('|');
          lines.push(`|${body}|`);
        }
      }
    }

    return lines.join('\n') + '\n';
  }
}

function keySignatureForOffset(offset: number): KeySignature {
  return KeySignature.parse(PitchMapping.tonicScaleInfo(offset).name);
}

function formatSpelledRoot(spelled: SpelledPitch): string {
  let acc = '';
  if (spelled.alter === 1) acc = '#';
  else if (spelled.alter === -1) acc = 'b';
  else if (spelled.alter === 2) acc = '##';
  else if (spelled.alter === -2) acc = 'bb';
  return `${spelled.step}${acc}`;
}

function chordText(chord: ChordSymbol, keyOffset: number): string {
  const root = formatSpelledRoot(PitchMapping.spellChordRoot(chord.root, keyOffset));
  const suffix = chord.toString().slice(chord.root.toString().length);
  if (!chord.bass) return root + suffix;
  const qualitySuffix = suffix.split('/', 1)[0];
  const bass = formatSpelledRoot(PitchMapping.spellChordRoot(chord.bass, keyOffset));
  return `${root}${qualitySuffix}/${bass}`;
}

