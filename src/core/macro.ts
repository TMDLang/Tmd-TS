import { TMDPlaybackRenderer } from "./playback.js";
import {
  Accidental,
  accidentalToSemitone,
  Beat,
  Entry,
  Note,
  Playback,
  ScaleDegree,
  scaleDegreeSemitoneOffset,
  Section,
  SExpr,
  Sheet,
  Unit,
  UnitGroup,
} from "./types.js";

export interface MacroExpansionResult {
  paragraphs: Entry[];
  orders: Playback[];
}

/**
 * Maps pitch in semitones (0-11) to ScaleDegree and Accidental.
 */
function semitoneToDegreeAccidental(semi: number): { degree: ScaleDegree; accidental: Accidental } {
  // semi: 0 to 11
  switch (semi) {
    case 0: return { degree: ScaleDegree.C, accidental: Accidental.Natural };
    case 1: return { degree: ScaleDegree.C, accidental: Accidental.Sharp };
    case 2: return { degree: ScaleDegree.D, accidental: Accidental.Natural };
    case 3: return { degree: ScaleDegree.D, accidental: Accidental.Sharp };
    case 4: return { degree: ScaleDegree.E, accidental: Accidental.Natural };
    case 5: return { degree: ScaleDegree.F, accidental: Accidental.Natural };
    case 6: return { degree: ScaleDegree.F, accidental: Accidental.Sharp };
    case 7: return { degree: ScaleDegree.G, accidental: Accidental.Natural };
    case 8: return { degree: ScaleDegree.G, accidental: Accidental.Sharp };
    case 9: return { degree: ScaleDegree.A, accidental: Accidental.Natural };
    case 10: return { degree: ScaleDegree.A, accidental: Accidental.Sharp };
    case 11: return { degree: ScaleDegree.B, accidental: Accidental.Natural };
    default: return { degree: ScaleDegree.C, accidental: Accidental.Natural };
  }
}

function noteToTotalSemitones(note: Note): number {
  return scaleDegreeSemitoneOffset(note.degree) + accidentalToSemitone(note.accidental) + note.octave * 12;
}

function totalSemitonesToNote(totalSemitones: number): Note {
  let octave = Math.floor(totalSemitones / 12);
  let semiInOctave = totalSemitones % 12;
  if (semiInOctave < 0) {
    semiInOctave += 12;
  }
  const { degree, accidental } = semitoneToDegreeAccidental(semiInOctave);
  return {
    degree,
    accidental,
    octave,
  };
}

function transposeSections(sections: Section[], semitones: number): Section[] {
  if (semitones === 0) return JSON.parse(JSON.stringify(sections));
  const cloned: Section[] = JSON.parse(JSON.stringify(sections));
  for (const s of cloned) {
    for (const g of s.unitGroups) {
      for (const u of g.units) {
        if (u.type === "note") {
          const currentTotal = noteToTotalSemitones(u.note);
          u.note = totalSemitonesToNote(currentTotal + semitones);
        } else if (u.type === "multiNote") {
          u.notes = u.notes.map((note) => totalSemitonesToNote(noteToTotalSemitones(note) + semitones));
        }
      }
    }
  }
  return cloned;
}

function reverseSections(sections: Section[]): Section[] {
  const cloned: Section[] = JSON.parse(JSON.stringify(sections));
  // Collect all unit groups across all sections
  const allGroups: UnitGroup[] = [];
  for (const s of cloned) {
    for (const g of s.unitGroups) {
      allGroups.push(g);
    }
  }
  allGroups.reverse();

  // Distribute back matching the original section group counts
  let idx = 0;
  for (const s of cloned) {
    const count = s.unitGroups.length;
    s.unitGroups = allGroups.slice(idx, idx + count);
    idx += count;
  }
  return cloned;
}

function invertSections(sections: Section[], axisPitchSemitones?: number): Section[] {
  const cloned: Section[] = JSON.parse(JSON.stringify(sections));
  let axis = axisPitchSemitones;
  if (axis === undefined) {
    // Find the first note as axis
    for (const s of cloned) {
      for (const g of s.unitGroups) {
        for (const u of g.units) {
          if (u.type === "note") {
            axis = noteToTotalSemitones(u.note);
            break;
          } else if (u.type === "multiNote" && u.notes.length > 0) {
            axis = noteToTotalSemitones(u.notes[0]);
            break;
          }
        }
        if (axis !== undefined) break;
      }
      if (axis !== undefined) break;
    }
  }

  if (axis === undefined) {
    return cloned;
  }

  for (const s of cloned) {
    for (const g of s.unitGroups) {
      for (const u of g.units) {
        if (u.type === "note") {
          const origSemitones = noteToTotalSemitones(u.note);
          const diff = origSemitones - axis;
          u.note = totalSemitonesToNote(axis - diff);
        } else if (u.type === "multiNote") {
          u.notes = u.notes.map((note) => {
            const diff = noteToTotalSemitones(note) - axis;
            return totalSemitonesToNote(axis - diff);
          });
        }
      }
    }
  }
  return cloned;
}

function toMinorSections(sections: Section[]): Section[] {
  const cloned: Section[] = JSON.parse(JSON.stringify(sections));
  for (const s of cloned) {
    for (const g of s.unitGroups) {
      for (const u of g.units) {
        if (u.type === "note") {
          // Flatten 3, 6, 7 degrees:
          // E (degree 3) -> Eb (degree 3, flat)
          // A (degree 6) -> Ab (degree 6, flat)
          // B (degree 7) -> Bb (degree 7, flat)
          if (u.note.degree === ScaleDegree.E && u.note.accidental === Accidental.Natural) {
            u.note.accidental = Accidental.Flat;
          } else if (u.note.degree === ScaleDegree.A && u.note.accidental === Accidental.Natural) {
            u.note.accidental = Accidental.Flat;
          } else if (u.note.degree === ScaleDegree.B && u.note.accidental === Accidental.Natural) {
            u.note.accidental = Accidental.Flat;
          }
        } else if (u.type === "multiNote") {
          u.notes = u.notes.map((note) => {
            if ((note.degree === ScaleDegree.E || note.degree === ScaleDegree.A || note.degree === ScaleDegree.B) && note.accidental === Accidental.Natural) {
              return { ...note, accidental: Accidental.Flat };
            }
            return note;
          });
        }
      }
    }
  }
  return cloned;
}

function toMajorSections(sections: Section[]): Section[] {
  const cloned: Section[] = JSON.parse(JSON.stringify(sections));
  for (const s of cloned) {
    for (const g of s.unitGroups) {
      for (const u of g.units) {
        if (u.type === "note") {
          // Raise flat 3, 6, 7 degrees back to natural:
          if (u.note.degree === ScaleDegree.E && u.note.accidental === Accidental.Flat) {
            u.note.accidental = Accidental.Natural;
          } else if (u.note.degree === ScaleDegree.A && u.note.accidental === Accidental.Flat) {
            u.note.accidental = Accidental.Natural;
          } else if (u.note.degree === ScaleDegree.B && u.note.accidental === Accidental.Flat) {
            u.note.accidental = Accidental.Natural;
          }
        } else if (u.type === "multiNote") {
          u.notes = u.notes.map((note) => {
            if ((note.degree === ScaleDegree.E || note.degree === ScaleDegree.A || note.degree === ScaleDegree.B) && note.accidental === Accidental.Flat) {
              return { ...note, accidental: Accidental.Natural };
            }
            return note;
          });
        }
      }
    }
  }
  return cloned;
}

export class TMDMacroError extends Error {
  public line?: number;
  public column?: number;

  constructor(message: string, line?: number, column?: number) {
    const loc = line !== undefined && column !== undefined ? ` at line ${line}, col ${column}` : "";
    super(`Macro error${loc}: ${message}`);
    this.name = "TMDMacroError";
    this.line = line;
    this.column = column;
  }
}

export class TMDMacroEvaluator {
  /**
   * Expands any S-expression macro orders (`Order.macro`) in a Sheet into concrete
   * paragraphs and concrete order sequences.
   * If the sheet contains no macro orders, it returns the paragraphs and orders as-is.
   */
  public static expand(sheet: Sheet): Sheet {
  const hasMacro = sheet.playback.some((o) => o.type === "macro");
    if (!hasMacro) {
      return sheet;
    }

    const abstractMap = new Map<string, Entry>();
    for (const p of sheet.entries) {
      if (!p.assignment) {
        abstractMap.set(p.name, p);
      }
    }

    const concreteParagraphs: Entry[] = sheet.entries.filter((p) => Boolean(p.assignment));
    const newOrders: Playback[] = [];
    let genCounter = 0;
    let currentOrderLoc: { line?: number; column?: number } = {};

    const macroError = (msg: string) => {
      return new TMDMacroError(msg, currentOrderLoc.line, currentOrderLoc.column);
    };

    const integer = (value: SExpr, label: string): number => {
      const number = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(number)) throw macroError(`${label} must be an integer`);
      return number;
    };

    const createSyntheticParagraph = (
      baseName: string,
      instrument: string,
      startOffset: number,
      sections: Section[]
    ): Entry => {
      genCounter++;
      const uniqueName = `__macro_${baseName}_${genCounter}`;
      const p: Entry = {
        name: uniqueName,
        assignment: instrument,
        start: startOffset,
        sections: JSON.parse(JSON.stringify(sections)),
      };
      concreteParagraphs.push(p);
      return p;
    };

    const getThemeSections = (themeArg: SExpr): { name: string; sections: Section[] } => {
      if (Array.isArray(themeArg)) {
        if (themeArg.length === 0) {
          throw macroError("Empty prototype expression");
        }

        const head = String(themeArg[0]).toLowerCase();

        // 1. (transpose <theme> <semitones>) or (transpose <semitones> <theme>)
        if (head === "transpose") {
          if (themeArg.length !== 3 || themeArg[1] === undefined || themeArg[2] === undefined) {
            throw macroError(`'transpose' requires theme and semitones offset, e.g. (transpose Theme 7)`);
          }
          let target = themeArg[1];
          let semitones = integer(themeArg[2], "Transpose offset");
          if (typeof target === "number" || (!isNaN(Number(target)) && typeof themeArg[2] === "string")) {
            semitones = integer(target, "Transpose offset");
            target = themeArg[2];
          }
          const sub = getThemeSections(target);
          return {
            name: `${sub.name}_tr${semitones >= 0 ? "+" + semitones : semitones}`,
            sections: transposeSections(sub.sections, semitones),
          };
        }

        // 2. (reverse <theme>)
        if (head === "reverse") {
          if (themeArg.length !== 2 || themeArg[1] === undefined) {
            throw macroError(`'reverse' requires a target theme, e.g. (reverse Theme)`);
          }
          const target = themeArg[1];
          const sub = getThemeSections(target);
          return {
            name: `${sub.name}_rev`,
            sections: reverseSections(sub.sections),
          };
        }

        // 3. (flip <theme> [axis])
        if (head === "flip") {
          if ((themeArg.length !== 2 && themeArg.length !== 3) || themeArg[1] === undefined) {
            throw macroError(`'flip' requires a target theme, e.g. (flip Theme)`);
          }
          const target = themeArg[1];
          const axisArg = themeArg.length === 3 ? integer(themeArg[2]!, "Flip axis") : undefined;
          const sub = getThemeSections(target);
          return {
            name: `${sub.name}_flip`,
            sections: invertSections(sub.sections, axisArg),
          };
        }

        // 4. (minor <theme>)
        if (head === "minor") {
          if (themeArg.length !== 2 || themeArg[1] === undefined) {
            throw macroError(`'minor' requires a target theme, e.g. (minor Theme)`);
          }
          const target = themeArg[1];
          const sub = getThemeSections(target);
          return {
            name: `${sub.name}_minor`,
            sections: toMinorSections(sub.sections),
          };
        }

        // 5. (major <theme>)
        if (head === "major") {
          if (themeArg.length !== 2 || themeArg[1] === undefined) {
            throw macroError(`'major' requires a target theme, e.g. (major Theme)`);
          }
          const target = themeArg[1];
          const sub = getThemeSections(target);
          return {
            name: `${sub.name}_major`,
            sections: toMajorSections(sub.sections),
          };
        }

        // 6. (vary <theme> <modifier1> <modifier2> ...)
        // Supports flat modifiers: (vary Theme +7 flip reverse minor)
        // as well as sublists: (vary Theme (transpose 7) (flip))
        if (head === "vary") {
          if (themeArg.length < 2 || themeArg[1] === undefined) {
            throw macroError(`'vary' requires a target theme, e.g. (vary Theme +7 reverse)`);
          }
          const target = themeArg[1];
          let current = getThemeSections(target);
          for (let i = 2; i < themeArg.length; i++) {
            const transform = themeArg[i];
            if (Array.isArray(transform)) {
              if (transform.length === 0) continue;
              const tOp = String(transform[0]).toLowerCase();
              if (tOp === "transpose") {
                const semitones = Number(transform[1]) || 0;
                current = {
                  name: `${current.name}_tr${semitones >= 0 ? "+" + semitones : semitones}`,
                  sections: transposeSections(current.sections, semitones),
                };
              } else if (tOp === "reverse") {
                current = {
                  name: `${current.name}_rev`,
                  sections: reverseSections(current.sections),
                };
              } else if (tOp === "flip") {
                const axisArg = transform.length >= 2 ? Number(transform[1]) : undefined;
                current = {
                  name: `${current.name}_flip`,
                  sections: invertSections(current.sections, axisArg),
                };
              } else if (tOp === "minor") {
                current = {
                  name: `${current.name}_minor`,
                  sections: toMinorSections(current.sections),
                };
              } else if (tOp === "major") {
                current = {
                  name: `${current.name}_major`,
                  sections: toMajorSections(current.sections),
                };
              }
            } else {
              // Flat modifier token (e.g. +7, -5, "flip", "reverse", "minor", "major")
              const rawStr = String(transform).trim();
              const lowerStr = rawStr.toLowerCase();
              if (lowerStr === "reverse") {
                current = {
                  name: `${current.name}_rev`,
                  sections: reverseSections(current.sections),
                };
              } else if (lowerStr === "flip") {
                current = {
                  name: `${current.name}_flip`,
                  sections: invertSections(current.sections),
                };
              } else if (lowerStr === "minor") {
                current = {
                  name: `${current.name}_minor`,
                  sections: toMinorSections(current.sections),
                };
              } else if (lowerStr === "major") {
                current = {
                  name: `${current.name}_major`,
                  sections: toMajorSections(current.sections),
                };
              } else if (/^[+-]?\d+$/.test(rawStr)) {
                // Pitch transposition in semitones (e.g. +7, -12, 5)
                const semitones = Number(rawStr) || 0;
                current = {
                  name: `${current.name}_tr${semitones >= 0 ? "+" + semitones : semitones}`,
                  sections: transposeSections(current.sections, semitones),
                };
              }
            }
          }
          return current;
        }

        // Sequential multi-theme: (ThemeA ThemeB)
        const combinedSections: Section[] = [];
        const names: string[] = [];
        for (const item of themeArg) {
          const sub = getThemeSections(item);
          names.push(sub.name);
          for (const s of sub.sections) {
            combinedSections.push(JSON.parse(JSON.stringify(s)));
          }
        }
        return { name: names.join("_"), sections: combinedSections };
      }

      const themeName = String(themeArg);
      const p = abstractMap.get(themeName);
      if (!p) {
        throw macroError(`Theme '${themeName}' is not a prototype`);
      }
      return { name: themeName, sections: p.sections };
    };

    const evalExpr = (expr: SExpr): { paragraphNames: string[] } => {
      // 1. Support bare string / atom referring to an existing concrete paragraph
      if (!Array.isArray(expr)) {
        const targetName = String(expr);
        throw macroError(`Target '${targetName}' is not a macro expression; use play/loop/canon with a prototype`);
      }

      if (expr.length === 0) {
        throw macroError("Empty macro expression");
      }

      const op = String(expr[0]).toLowerCase();

      switch (op) {
        case "play": {
          // (play <theme|themes> <instrument> [:at <measure_offset>])
          if (![3, 4, 5].includes(expr.length) || expr[1] === undefined || expr[2] === undefined) {
            throw macroError(`'play' requires theme and instrument, e.g. (play Theme Violin)`);
          }
          const themeTarget = expr[1];
          const instrument = String(expr[2]);
          let atOffset = 0;
          if (expr.length === 5 && String(expr[3]).toLowerCase() === ":at") {
            atOffset = integer(expr[4]!, "Play entry offset");
          } else if (expr.length === 4 && typeof expr[3] === "number") {
            atOffset = integer(expr[3], "Play entry offset");
          } else if (expr.length !== 3) {
            throw macroError("'play' accepts an optional :at integer offset");
          }

          const { name: themeName, sections } = getThemeSections(themeTarget);
          const p = createSyntheticParagraph(themeName, instrument, atOffset, sections);
          return { paragraphNames: [p.name] };
        }

        case "loop": {
          // (loop <theme> <times>) when target is already a concrete paragraph with an instrument!
          // Or (loop <theme|themes> <instrument> <times>)
          if (expr.length !== 4 || expr[1] === undefined || expr[2] === undefined || expr[3] === undefined) {
            throw macroError(`'loop' requires theme, instrument, and a positive integer count`);
          }

          const themeTarget = expr[1];
          const instrument = String(expr[2]);
          const times = integer(expr[3], "Loop count");
          if (times <= 0) throw macroError("Loop count must be positive");

          const { name: themeName, sections: baseSections } = getThemeSections(themeTarget);

          const loopedSections: Section[] = [];
          for (let t = 0; t < times; t++) {
            for (const s of baseSections) {
              loopedSections.push(JSON.parse(JSON.stringify(s)));
            }
          }

          const p = createSyntheticParagraph(themeName, instrument, 0, loopedSections);
          return { paragraphNames: [p.name] };
        }

        case "canon": {
          // (canon <theme|themes|canon_expr> (<instruments...>) <offset_bars>)
          if (expr.length !== 4 || expr[1] === undefined || expr[2] === undefined || expr[3] === undefined) {
            throw macroError(`'canon' requires theme and instruments, e.g. (canon Theme (Violin1 Violin2) 2)`);
          }
          const themeTarget = expr[1];
          const instrumentsRaw = expr[2];
          if (!Array.isArray(instrumentsRaw) || instrumentsRaw.length === 0 || instrumentsRaw.some((x) => typeof x !== "string")) {
            throw macroError("Canon requires a non-empty parenthesized instrument list");
          }
          const instruments: string[] = instrumentsRaw.map((x) => String(x));
          const offsetBars = integer(expr[3], "Canon offset");
          if (offsetBars < 0) throw macroError("Canon offset must be non-negative");

          // Check if themeTarget is a nested sub-expression like (canon ...), (layer ...), (reverse ...), etc.
          const nestedOps = ["canon", "layer", "play", "loop", "seq", "reverse", "flip", "minor", "major", "vary", "transpose"];
          if (
            Array.isArray(themeTarget) &&
            themeTarget.length > 0 &&
            typeof themeTarget[0] === "string" &&
            nestedOps.includes(String(themeTarget[0]).toLowerCase()) &&
            // Note: if it's (reverse Theme) without instruments/canon inside, it might be a theme variation.
            // But if it contains an inner canon/layer/play/loop or explicit instrument, it's a full sub-expression!
            // Let's check if the target has an inner nestedOp or if evaluating it as an expression produces concrete paragraphs
            (function isSubExpr(node: SExpr): boolean {
              if (!Array.isArray(node) || node.length === 0) return false;
              const h = String(node[0]).toLowerCase();
              if (["canon", "layer", "play", "loop", "seq"].includes(h)) return true;
              if (["reverse", "flip", "minor", "major", "vary", "transpose"].includes(h)) {
                return isSubExpr(node[1]) || (node.length >= 3 && isSubExpr(node[2]));
              }
              return false;
            })(themeTarget)
          ) {
            const innerResult = evalExpr(themeTarget);
            const innerParagraphs = concreteParagraphs.filter((cp) => innerResult.paragraphNames.includes(cp.name));

            // Extract the distinct instruments used in the inner expression in appearance order
            const innerDistinctInsts: string[] = [];
            for (const ip of innerParagraphs) {
              const innerAssignment = ip.assignment;
              if (innerAssignment && !innerDistinctInsts.includes(innerAssignment)) {
                innerDistinctInsts.push(innerAssignment);
              }
            }

            genCounter++;
            const outerCanonSectionName = `__nested_canon_${genCounter}`;

            // If instruments were provided for the outer voice, clone and remap
            if (instruments.length > 0) {
              for (let i = 0; i < innerParagraphs.length; i++) {
                const p = innerParagraphs[i];
                const assignment = p.assignment;
                if (!assignment) continue;
                const instIdx = innerDistinctInsts.indexOf(assignment);
                const mappedInst = (instIdx >= 0 && instIdx < instruments.length) ? instruments[instIdx] : assignment;

                // Clone outer voice with shifted start offset
                const outerP = createSyntheticParagraph(
                  p.name,
                  mappedInst,
                  p.start + offsetBars,
                  p.sections
                );
                outerP.name = outerCanonSectionName;
              }
            }

            // Merge inner voice paragraphs under the same unified playback section
            for (const ip of innerParagraphs) {
              ip.name = outerCanonSectionName;
            }

            return { paragraphNames: [outerCanonSectionName] };
          }

          const { name: themeName, sections } = getThemeSections(themeTarget);

          const durationQuarters = sections.reduce((total, section) => total + section.unitGroups.reduce((sum, group) => sum + group.length * (4 / Math.max(1, section.noteLength)), 0), 0);
          const durationBars = durationQuarters / TMDPlaybackRenderer.measureDuration(sheet.beat);
          if ((instruments.length - 1) * offsetBars > durationBars) {
            throw macroError("Canon voice enters after the combined prototype ends");
          }

          const createdNames: string[] = [];
          for (let i = 0; i < instruments.length; i++) {
            const inst = instruments[i];
            const startOffset = i * offsetBars;
            const p = createSyntheticParagraph(themeName, inst, startOffset, sections);
            createdNames.push(p.name);
          }

          // A canon executes all voices concurrently within the same block
          // In TMD playback order, multiple paragraphs playing concurrently share the same section name.
          // We can merge all voices of this canon under a single shared section name!
          genCounter++;
          const canonSectionName = `__canon_${themeName}_${genCounter}`;
          for (const name of createdNames) {
            const p = concreteParagraphs.find((cp) => cp.name === name);
            if (p) {
              p.name = canonSectionName;
            }
          }

          return { paragraphNames: [canonSectionName] };
        }

        case "layer": {
          // (layer <child1> <child2> ...)
          // Evaluates all child expressions concurrently.
          // All generated paragraphs will share the same unified section name so they start at the same time.
          if (expr.length < 2) throw macroError("'layer' requires at least one child");
          const childNames: string[] = [];
          for (let i = 1; i < expr.length; i++) {
            const res = evalExpr(expr[i]);
            childNames.push(...res.paragraphNames);
          }

          genCounter++;
          const layerSectionName = `__layer_${genCounter}`;
          for (const cName of childNames) {
            for (const cp of concreteParagraphs) {
              if (cp.name === cName) {
                cp.name = layerSectionName;
              }
            }
          }

          return { paragraphNames: [layerSectionName] };
        }

        case "seq": {
          // (seq <child1> <child2> ...)
          // Evaluates all child expressions sequentially, preserving chronological execution order.
          if (expr.length < 2) throw macroError("'seq' requires at least one child");
          const seqNames: string[] = [];
          for (let i = 1; i < expr.length; i++) {
            const res = evalExpr(expr[i]);
            seqNames.push(...res.paragraphNames);
          }
          return { paragraphNames: seqNames };
        }

        case "reverse": {
          // (reverse <child>)
          if (expr.length < 2 || expr[1] === undefined) {
            throw macroError(`'reverse' requires a target theme or expression, e.g. (reverse Theme)`);
          }
          const childExpr = expr[1];
          const innerRes = evalExpr(childExpr);
          const innerParagraphs = concreteParagraphs.filter((cp) => innerRes.paragraphNames.includes(cp.name));
          for (const ip of innerParagraphs) {
            ip.sections = reverseSections(ip.sections);
          }
          return innerRes;
        }

        case "flip": {
          // (flip <child> [axis])
          if (expr.length < 2 || expr[1] === undefined) {
            throw macroError(`'flip' requires a target theme or expression, e.g. (flip Theme)`);
          }
          const childExpr = expr[1];
          const axisArg = expr.length >= 3 ? Number(expr[2]) : undefined;
          const innerRes = evalExpr(childExpr);
          const innerParagraphs = concreteParagraphs.filter((cp) => innerRes.paragraphNames.includes(cp.name));
          for (const ip of innerParagraphs) {
            ip.sections = invertSections(ip.sections, axisArg);
          }
          return innerRes;
        }

        case "vary": {
          // (vary <child> <modifier1> <modifier2> ...)
          // Desugars/chains transformations onto child concrete paragraphs
          if (expr.length < 2 || expr[1] === undefined) {
            throw macroError(`'vary' requires a target theme or expression, e.g. (vary Theme +7 reverse)`);
          }
          const childExpr = expr[1];
          const innerRes = evalExpr(childExpr);
          const innerParagraphs = concreteParagraphs.filter((cp) => innerRes.paragraphNames.includes(cp.name));
          for (let i = 2; i < expr.length; i++) {
            const transform = expr[i];
            if (Array.isArray(transform)) {
              if (transform.length === 0) continue;
              const tOp = String(transform[0]).toLowerCase();
              if (tOp === "transpose") {
                const semitones = Number(transform[1]) || 0;
                for (const ip of innerParagraphs) ip.sections = transposeSections(ip.sections, semitones);
              } else if (tOp === "reverse") {
                for (const ip of innerParagraphs) ip.sections = reverseSections(ip.sections);
              } else if (tOp === "flip") {
                const axisArg = transform.length >= 2 ? Number(transform[1]) : undefined;
                for (const ip of innerParagraphs) ip.sections = invertSections(ip.sections, axisArg);
              } else if (tOp === "minor") {
                for (const ip of innerParagraphs) ip.sections = toMinorSections(ip.sections);
              } else if (tOp === "major") {
                for (const ip of innerParagraphs) ip.sections = toMajorSections(ip.sections);
              }
            } else {
              const rawStr = String(transform).trim();
              const lowerStr = rawStr.toLowerCase();
              if (lowerStr === "reverse") {
                for (const ip of innerParagraphs) ip.sections = reverseSections(ip.sections);
              } else if (lowerStr === "flip") {
                for (const ip of innerParagraphs) ip.sections = invertSections(ip.sections);
              } else if (lowerStr === "minor") {
                for (const ip of innerParagraphs) ip.sections = toMinorSections(ip.sections);
              } else if (lowerStr === "major") {
                for (const ip of innerParagraphs) ip.sections = toMajorSections(ip.sections);
              } else if (/^[+-]?\d+$/.test(rawStr)) {
                const semitones = Number(rawStr) || 0;
                for (const ip of innerParagraphs) ip.sections = transposeSections(ip.sections, semitones);
              }
            }
          }
          return innerRes;
        }

        case "minor": {
          // (minor <child>)
          if (expr.length < 2 || expr[1] === undefined) {
            throw macroError(`'minor' requires a target theme or expression, e.g. (minor Theme)`);
          }
          const childExpr = expr[1];
          const innerRes = evalExpr(childExpr);
          const innerParagraphs = concreteParagraphs.filter((cp) => innerRes.paragraphNames.includes(cp.name));
          for (const ip of innerParagraphs) {
            ip.sections = toMinorSections(ip.sections);
          }
          return innerRes;
        }

        case "major": {
          // (major <child>)
          if (expr.length < 2 || expr[1] === undefined) {
            throw macroError(`'major' requires a target theme or expression, e.g. (major Theme)`);
          }
          const childExpr = expr[1];
          const innerRes = evalExpr(childExpr);
          const innerParagraphs = concreteParagraphs.filter((cp) => innerRes.paragraphNames.includes(cp.name));
          for (const ip of innerParagraphs) {
            ip.sections = toMajorSections(ip.sections);
          }
          return innerRes;
        }

        case "transpose": {
          // (transpose <child> <semitones>) or (transpose <semitones> <child>)
          if (expr.length < 3 || expr[1] === undefined || expr[2] === undefined) {
            throw macroError(`'transpose' requires theme and semitones offset, e.g. (transpose Theme 7)`);
          }
          let target = expr[1];
          let semitones = Number(expr[2]) || 0;
          if (typeof target === "number" || (!isNaN(Number(target)) && typeof expr[2] !== "number")) {
            semitones = Number(target) || 0;
            target = expr[2];
          }
          const innerRes = evalExpr(target);
          const innerParagraphs = concreteParagraphs.filter((cp) => innerRes.paragraphNames.includes(cp.name));
          for (const ip of innerParagraphs) {
            ip.sections = transposeSections(ip.sections, semitones);
          }
          return innerRes;
        }

        default:
          throw macroError(`Unknown macro operation '${op}' in S-expression`);
      }
    };

    for (const order of sheet.playback) {
      if (order.type === "macro") {
        currentOrderLoc = { line: order.line, column: order.column };
        const res = evalExpr(order.expr);
        for (const name of Array.from(new Set(res.paragraphNames))) {
          newOrders.push({ type: "name", name });
        }
      } else {
        newOrders.push(order);
      }
    }

    return {
      ...sheet,
      entries: concreteParagraphs,
      playback: newOrders,
    };
  }
}
