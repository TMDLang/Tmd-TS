import { describe, expect, it } from "vitest";

import { TMDWAVRenderer } from "../src/audio.js";
import { TmdParser } from "../src/core/parser.js";

function wavDurationSeconds(wav: Uint8Array, sampleRate: number): number {
  const dataBytes = new DataView(wav.buffer).getUint32(40, true);
  return dataBytes / 4 / sampleRate;
}

function wavEnergy(wav: Uint8Array): number {
  const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.byteLength - 44) / 2);
  return pcm.reduce((sum, value) => sum + Math.abs(value), 0);
}

describe("TMDWAVRenderer timing and percussion", () => {
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

    const wav = TMDWAVRenderer.renderWAV(sheet, 8000);
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

    const wav = TMDWAVRenderer.renderWAV(sheet, 8000);
    expect(wavEnergy(wav)).toBeGreaterThan(0);
  });
});
