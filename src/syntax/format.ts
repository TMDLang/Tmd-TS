import {
  Accidental,
  Beat,
  Entry,
  LyricElement,
  LyricLine,
  Note,
  Playback,
  Section,
  SectionDirective,
  SExpr,
  Sheet,
  Unit,
  UnitGroup,
} from "../syntax/types.js";

export function formatNote(note: Note): string {
  let str = `${note.degree}`;
  if (note.accidental === Accidental.Sharp) str += "'";
  else if (note.accidental === Accidental.Flat) str += ",";

  if (note.octave > 0) str += "^".repeat(note.octave);
  else if (note.octave < 0) str += "_".repeat(-note.octave);

  return str;
}

export function formatUnit(unit: Unit): string {
  switch (unit.type) {
    case "note":
      return formatNote(unit.note);
    case "multiNote":
      return unit.notes.map(formatNote).join("+");
    case "chord":
      return `[${unit.chord.toString()}]`;
    case "tie":
      return "-";
    case "rest":
      return "0";
    case "percussion":
      return unit.pattern;
  }
}

export function formatUnitGroup(group: UnitGroup): string {
  if (group.units.length === 1 && group.length === 1) {
    return formatUnit(group.units[0]);
  }
  const unitsStr = group.units.map(formatUnit).join(" ");
  const lenStr = "-".repeat(group.length);
  return `(${unitsStr})%(${lenStr})`;
}

export function formatSectionDirective(dir: SectionDirective): string {
  const k = dir.kind;
  switch (k.type) {
    case "tempo":
      return `{!=${Number.isInteger(k.bpm) ? k.bpm : k.bpm}}`;
    case "relativeTempo":
      return `{!+${k.deltaBpm}}`;
    case "absoluteKey":
      return `{?=${k.key}}`;
    case "relativeKey":
      return `{?${k.semitones >= 0 ? "+" + k.semitones : k.semitones}}`;
    case "explicitKey":
      return `{key= ${k.key}}`;
    case "dynamics":
      return `{${k.mark}}`;
    case "fixedPitch":
      return "{?=fixed}";
    case "timeSignature":
      return `{<${k.beat.count}/${k.beat.noteValue}>}`;
  }
}

export function formatLyricElement(el: LyricElement): string {
  switch (el.type) {
    case "transparent":
      return el.text;
    case "sounding":
      return el.text;
    case "group":
      return `(${el.elements.map(formatLyricElement).join(" ")})`;
  }
}

export function formatLyricLine(line: LyricLine): string {
  const prefix = line.stanza !== undefined ? `L${line.stanza}|` : "L|";
  const measureStrs = line.measures.map((m) => m.elements.map(formatLyricElement).join(" "));
  return `    ${prefix} ${measureStrs.join(" | ")} |`;
}

export function formatSection(sec: Section, beat: Beat = { count: 4, noteValue: 4 }): string {
  const lines: string[] = [];
  lines.push(`    <${sec.noteLength}*>`);
  let dirIdx = 0;
  const sortedDirs = [...sec.directives].sort((a, b) => a.position - b.position);

  let curPos = 0;
  const measureUnits = Math.max(1, Math.floor((beat.count * sec.noteLength) / beat.noteValue));

  if (sec.lyricBlocks && sec.lyricBlocks.length > 0) {
    let groupCursor = 0;

    const formatGroupRangeByBeat = (startIdx: number, endIdx: number) => {
      if (startIdx >= endIdx) return;
      let currentMeasureTokens: string[] = ["|"];
      let inMeasureCount = 0;
      let counter = 0;

      const appendDirs = (pos: number) => {
        while (dirIdx < sortedDirs.length && sortedDirs[dirIdx].position === pos) {
          currentMeasureTokens.push(formatSectionDirective(sortedDirs[dirIdx]));
          dirIdx++;
        }
      };

      appendDirs(curPos);
      for (let i = startIdx; i < endIdx; i++) {
        const group = sec.unitGroups[i];
        currentMeasureTokens.push(formatUnitGroup(group));
        inMeasureCount += group.length;
        curPos += group.length;
        appendDirs(curPos);

        if (inMeasureCount >= measureUnits) {
          currentMeasureTokens.push("|");
          inMeasureCount = 0;
          counter++;
          if (counter >= 4 && i + 1 < endIdx) {
            lines.push(`    ${currentMeasureTokens.join(" ")}`);
            currentMeasureTokens = ["|"];
            counter = 0;
          }
        }
      }
      if (currentMeasureTokens.length > 1) {
        if (currentMeasureTokens[currentMeasureTokens.length - 1] !== "|") {
          currentMeasureTokens.push("|");
        }
        lines.push(`    ${currentMeasureTokens.join(" ")}`);
      }
    };

    for (const block of sec.lyricBlocks) {
      if (block.melodicMeasures.length > 0) {
        const firstStart = block.melodicMeasures[0].startGroupIndex;
        if (groupCursor < firstStart) {
          formatGroupRangeByBeat(groupCursor, firstStart);
          groupCursor = firstStart;
        }

        const tokens: string[] = ["|"];
        const appendDirs = (pos: number) => {
          while (dirIdx < sortedDirs.length && sortedDirs[dirIdx].position === pos) {
            tokens.push(formatSectionDirective(sortedDirs[dirIdx]));
            dirIdx++;
          }
        };
        appendDirs(curPos);

        for (const mSpan of block.melodicMeasures) {
          for (let i = mSpan.startGroupIndex; i < mSpan.endGroupIndex; i++) {
            const group = sec.unitGroups[i];
            tokens.push(formatUnitGroup(group));
            curPos += group.length;
            appendDirs(curPos);
          }
          tokens.push("|");
          groupCursor = Math.max(groupCursor, mSpan.endGroupIndex);
        }
        lines.push(`    ${tokens.join(" ")}`);
      }

      const sortedLyrics = [...block.lyricLines].sort((a, b) => (a.stanza ?? 0) - (b.stanza ?? 0));
      for (const lLine of sortedLyrics) {
        lines.push(formatLyricLine(lLine));
      }
    }

    if (groupCursor < sec.unitGroups.length) {
      formatGroupRangeByBeat(groupCursor, sec.unitGroups.length);
    }

    return lines.join("\n") + "\n";
  }

  let counter = 0;
  let currentMeasureTokens: string[] = ["|"];

  function appendDirs(pos: number) {
    while (dirIdx < sortedDirs.length && sortedDirs[dirIdx].position === pos) {
      currentMeasureTokens.push(formatSectionDirective(sortedDirs[dirIdx]));
      dirIdx++;
    }
  }

  appendDirs(curPos);

  let inMeasureCount = 0;

  for (let i = 0; i < sec.unitGroups.length; i++) {
    const group = sec.unitGroups[i];
    currentMeasureTokens.push(formatUnitGroup(group));
    inMeasureCount += group.length;
    curPos += group.length;
    appendDirs(curPos);

    if (inMeasureCount >= measureUnits) {
      currentMeasureTokens.push("|");
      inMeasureCount = 0;
      counter++;
      if (counter >= 4 && i + 1 < sec.unitGroups.length) {
        lines.push(`    ${currentMeasureTokens.join(" ")}`);
        currentMeasureTokens = ["|"];
        counter = 0;
      }
    }
  }

  while (dirIdx < sortedDirs.length) {
    currentMeasureTokens.push(formatSectionDirective(sortedDirs[dirIdx]));
    dirIdx++;
  }

  if (currentMeasureTokens.length > 1) {
    if (currentMeasureTokens[currentMeasureTokens.length - 1] !== "|") {
      currentMeasureTokens.push("|");
    }
    lines.push(`    ${currentMeasureTokens.join(" ")}`);
  }

  return lines.join("\n") + "\n";
}

export function formatParagraph(p: Entry, beat?: Beat): string {
  if (p.showProgram !== undefined) {
    const time = p.executionTime ?? "";
    const head = p.assignment ? `${p.name}:${p.assignment}` : p.name;
    return `${head}@${time}{\n"""${p.showProgram}"""\n}\n\n`;
  }

  let result = "";
  if (!p.assignment) {
    result = `${p.name} {\n`;
  } else {
    result = `${p.name}:${p.assignment}`;
    if (p.pitchMode === "fixed") result += "[pitchMode=fixed]";
    result += "@|";
    if (p.start > 0) result += `+${p.start}`;
    else result += `${p.start}`;
    result += "|{\n";
  }

  result += p.sections.map((sec) => formatSection(sec, beat)).join("\n");
  result += "}\n\n";
  return result;
}

export function formatSExpr(expr: SExpr): string {
  if (Array.isArray(expr)) {
    return `(${expr.map(formatSExpr).join(" ")})`;
  }
  return String(expr);
}

export function formatOrder(order: Playback): string {
  switch (order.type) {
    case "name":
      if (order.stanza !== undefined) return `${order.name}[L${order.stanza}]`;
      if (order.rawStanzaTag) return `${order.name}[${order.rawStanzaTag}]`;
      return order.name;
    case "relative": return `{?${order.value}}`;
    case "absolute": return `{?=${order.value}}`;
    case "macro": return `(${order.expr.map(formatSExpr).join(" ")})`;
  }
}

export function formatSheet(sheet: Sheet): string {
  let result = "";
  result += "::SCORE::\n";
  result += `** ${sheet.name} **\n`;
  result += `!= ${Number.isInteger(sheet.speed) ? sheet.speed : sheet.speed}\n`;
  result += `?= ${sheet.keySignature.toString()}\n`;
  if (sheet.declaredKey) result += `key= ${sheet.declaredKey}\n`;
  result += `<${sheet.beat.count}/${sheet.beat.noteValue}>\n\n`;

  const metaKeys = Object.keys(sheet.metadata).sort();
  for (const k of metaKeys) {
    const val = sheet.metadata[k];
    if (["lyrics", "composer", "arranger"].includes(k.toLowerCase())) {
      result += `~ "${val}"\n`;
    } else {
      result += `=~:__${k.toUpperCase()}__= "${val}"\n`;
    }
  }
  if (metaKeys.length > 0) result += "\n";

  for (const p of sheet.entries) {
    result += formatParagraph(p, sheet.beat);
  }

  if (sheet.playback.length === 0) {
    result += "->#\n";
  } else {
    const chunks: string[] = [];
    for (let i = 0; i < sheet.playback.length; i += 4) {
      const slice = sheet.playback.slice(i, i + 4);
      const linePrefix = i === 0 ? "" : "    ";
      const suffix = i + 4 >= sheet.playback.length ? " ->#" : "";
      chunks.push(`${linePrefix}${slice.map((o) => `-> ${formatOrder(o)}`).join(" ")}${suffix}`);
    }
    result += chunks.join("\n") + "\n";
  }
  return result;
}

export function formatSummary(sheet: Sheet): string {
  const lines: string[] = [];
  lines.push(`Name:         ${sheet.name}`);
  lines.push(`Speed:        ${sheet.speed} BPM`);
  lines.push(`KeySignature: ${sheet.keySignature.toString()}`);
  if (sheet.declaredKey) {
    lines.push(`DeclaredKey:  ${sheet.declaredKey}`);
  }
  lines.push(`Beat:         ${sheet.beat.count}/${sheet.beat.noteValue}`);
  const entries = sheet.entries;
  const playback = sheet.playback;
  lines.push(`Entries:      ${entries.length}`);

  entries.forEach((p, idx) => {
    const secCount = p.sections.length;
    const totalUnits = p.sections.reduce((acc, s) => acc + s.unitGroups.length, 0);
    lines.push(`  [${idx + 1}] ${p.name} (Assignment: ${p.assignment ?? "(prototype)"}, Start: ${p.start}, Sections: ${secCount}, UnitGroups: ${totalUnits})`);
  });

  lines.push(`Playback:     ${playback.length}`);
  playback.forEach((order, idx) => {
    lines.push(`  [${idx + 1}] -> ${formatOrder(order)}`);
  });

  return lines.join("\n");
}
