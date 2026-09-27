import {
  Note,
  Unit,
  UnitGroup,
  Section,
  SectionDirective,
  Paragraph,
  Order,
  SExpr,
  Sheet,
  Accidental,
  Beat,
} from "./types";

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
  const unitsStr = group.units.map(formatUnit).join("");
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

export function formatSection(sec: Section, beat: Beat = { count: 4, noteValue: 4 }): string {
  let result = `\t<${sec.noteLength}*>`;
  let counter = 0;
  let dirIdx = 0;
  const sortedDirs = [...sec.directives].sort((a, b) => a.position - b.position);

  function appendDirs(pos: number) {
    while (dirIdx < sortedDirs.length && sortedDirs[dirIdx].position === pos) {
      result += `${formatSectionDirective(sortedDirs[dirIdx])} `;
      dirIdx++;
    }
  }

  let curPos = 0;
  appendDirs(curPos);

  const measureUnits = Math.max(1, Math.floor((beat.count * sec.noteLength) / beat.noteValue));
  let inMeasureCount = 0;
  result += "\n\t| ";

  for (const group of sec.unitGroups) {
    result += `${formatUnitGroup(group)} `;
    inMeasureCount += group.length;
    curPos += group.length;
    appendDirs(curPos);

    if (inMeasureCount >= measureUnits) {
      result += "| ";
      inMeasureCount = 0;
      counter++;
      if (counter >= 4) {
        result += "\n\t| ";
        counter = 0;
      }
    }
  }

  if (inMeasureCount > 0 && !result.trim().endsWith("|")) {
    result += "|";
  }

  while (dirIdx < sortedDirs.length) {
    result += `${formatSectionDirective(sortedDirs[dirIdx])} `;
    dirIdx++;
  }

  result += "\n\n";
  return result;
}

export function formatParagraph(p: Paragraph, beat?: Beat): string {
  if (p.showProgram) {
    const time = p.executionTime ?? "";
    return `${p.name}:${p.assignment ?? p.instrument}@${time}{\n"""${p.showProgram}"""\n}\n\n`;
  }

  let result = "";
  if (!(p.assignment ?? p.instrument)) {
    result = `${p.name} {\n`;
  } else {
    result = `${p.name}:${p.assignment ?? p.instrument}`;
    if (p.pitchMode === "fixed") result += "[pitchMode=fixed]";
    result += "@|";
    if (p.start > 0) result += `+${p.start}`;
    else result += `${p.start}`;
    result += "|{\n";
  }

  for (const sec of p.sections) {
    result += formatSection(sec, beat);
  }
  result += "}\n\n";
  return result;
}

export function formatSExpr(expr: SExpr): string {
  if (Array.isArray(expr)) {
    return `(${expr.map(formatSExpr).join(" ")})`;
  }
  return String(expr);
}

export function formatOrder(order: Order): string {
  switch (order.type) {
    case "name": return order.name;
    case "relative": return `{?${order.value}}`;
    case "absolute": return `{?=${order.value}}`;
    case "macro": return `(${order.expr.map(formatSExpr).join(" ")})`;
  }
}

export function formatSheet(sheet: Sheet): string {
  let result = "";
  result += "::SCORE::\n";
  result += `** ${sheet.name} **\n`;
  result += `!=${Number.isInteger(sheet.speed) ? sheet.speed : sheet.speed}\n`;
  result += `?=${sheet.keySignature.toString()}\n`;
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

  for (const p of sheet.paragraphs) {
    result += formatParagraph(p, sheet.beat);
  }

  let counter = 0;
  for (const order of sheet.orders) {
    result += `-> ${formatOrder(order)} `;
    counter++;
    if (counter % 4 === 0) result += "\n";
  }
  result += "->#\n";
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
  lines.push(`Entries:      ${sheet.paragraphs.length}`);

  sheet.paragraphs.forEach((p, idx) => {
    const secCount = p.sections.length;
    const totalUnits = p.sections.reduce((acc, s) => acc + s.unitGroups.length, 0);
    lines.push(`  [${idx + 1}] ${p.name} (Assignment: ${p.assignment ?? p.instrument}, Start: ${p.start}, Sections: ${secCount}, UnitGroups: ${totalUnits})`);
  });

  lines.push(`Playback:     ${sheet.orders.length}`);
  sheet.orders.forEach((order, idx) => {
    lines.push(`  [${idx + 1}] -> ${formatOrder(order)}`);
  });

  return lines.join("\n");
}
