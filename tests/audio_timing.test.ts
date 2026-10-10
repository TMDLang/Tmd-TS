import { describe, expect, it } from "vitest";

import { TmdWAVRenderer } from "../src/audio.js";
import { TmdParser } from "../src/syntax/parser.js";

function wavDurationSeconds(wav: Uint8Array, sampleRate: number): number {
  const dataBytes = new DataView(wav.buffer).getUint32(40, true);
  return dataBytes / 4 / sampleRate;
}

function wavEnergy(wav: Uint8Array): number {
  const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.byteLength - 44) / 2);
  return pcm.reduce((sum, value) => sum + Math.abs(value), 0);
}

describe("TmdWAVRenderer timing and percussion", () => {
  it("converts beat positions through tempo changes instead of using one global tempo", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Tempo map **
!= 60
?= C
<4/4>

A:Piano@|0|{
<4*>
1 1 1 1
{!=120}
1 1 1 1
}

-> A ->#
`);

    const wav = TmdWAVRenderer.renderWAV(sheet, 8000);
    expect(wavDurationSeconds(wav, 8000)).toBeCloseTo(8.5, 1);
  });

  it("renders percussion events into audible PCM", () => {
    const sheet = TmdParser.parse(`::SCORE::
** Drums **
!= 120
?= C
<4/4>

A:Drums@|0|{
<4*>
X S B C
}

-> A ->#
`);

    const wav = TmdWAVRenderer.renderWAV(sheet, 8000);
    expect(wavEnergy(wav)).toBeGreaterThan(0);
  });

  it("renders chord qualities and letter chord roots using canonical chordToMIDIPitches (#49)", () => {
    const majorSheet = TmdParser.parse(`::SCORE::
!= 120
?= C
<4/4>
A:Piano@|0|{
<4*>
[C] - - -
}
`);
    const minorSheet = TmdParser.parse(`::SCORE::
!= 120
?= C
<4/4>
A:Piano@|0|{
<4*>
[Cm] - - -
}
`);
    const letterInGKeySheet = TmdParser.parse(`::SCORE::
!= 120
?= G
<4/4>
A:Piano@|0|{
<4*>
[C] - - -
}
`);

    const majorWav = TmdWAVRenderer.renderWAV(majorSheet, 8000);
    const minorWav = TmdWAVRenderer.renderWAV(minorSheet, 8000);
    const letterInGKeyWav = TmdWAVRenderer.renderWAV(letterInGKeySheet, 8000);

    // [Cm] must produce a different waveform from [C]
    expect(Buffer.from(minorWav).equals(Buffer.from(majorWav))).toBe(false);
    // Explicit letter chord [C] in ?= G must produce the exact same pitches as [C] in ?= C
    expect(Buffer.from(letterInGKeyWav).equals(Buffer.from(majorWav))).toBe(true);
  });
});
