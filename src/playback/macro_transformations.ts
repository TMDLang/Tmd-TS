import {
  Accidental,
  Note,
  noteToTotalSemitones,
  PitchMapping,
  ScaleDegree,
  Section,
  UnitGroup,
} from "../syntax/types.js";

export function semitoneToDegreeAccidental(semi: number): { degree: ScaleDegree; accidental: Accidental } {
  return PitchMapping.semitoneToDegreeAccidental(semi);
}

export function totalSemitonesToNote(totalSemitones: number): Note {
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

export function transposeSections(sections: Section[], semitones: number): Section[] {
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

export function reverseSections(sections: Section[]): Section[] {
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

export function invertSections(sections: Section[], axisPitchSemitones?: number): Section[] {
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

export function toMinorSections(sections: Section[]): Section[] {
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

export function toMajorSections(sections: Section[]): Section[] {
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
