import {
  Accidental,
  mapSectionsNotes,
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
  const octave = Math.floor(totalSemitones / 12);
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
  return mapSectionsNotes(sections, (note) =>
    totalSemitonesToNote(noteToTotalSemitones(note) + semitones)
  );
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
  let axis = axisPitchSemitones;
  if (axis === undefined) {
    // Find the first note as axis
    for (const s of sections) {
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
    return JSON.parse(JSON.stringify(sections));
  }

  const resolvedAxis = axis;
  return mapSectionsNotes(sections, (note) => {
    const diff = noteToTotalSemitones(note) - resolvedAxis;
    return totalSemitonesToNote(resolvedAxis - diff);
  });
}

export function toMinorSections(sections: Section[]): Section[] {
  return mapSectionsNotes(sections, (note) => {
    if (
      (note.degree === ScaleDegree.E || note.degree === ScaleDegree.A || note.degree === ScaleDegree.B) &&
      note.accidental === Accidental.Natural
    ) {
      return { ...note, accidental: Accidental.Flat };
    }
    return { ...note };
  });
}

export function toMajorSections(sections: Section[]): Section[] {
  return mapSectionsNotes(sections, (note) => {
    if (
      (note.degree === ScaleDegree.E || note.degree === ScaleDegree.A || note.degree === ScaleDegree.B) &&
      note.accidental === Accidental.Flat
    ) {
      return { ...note, accidental: Accidental.Natural };
    }
    return { ...note };
  });
}
