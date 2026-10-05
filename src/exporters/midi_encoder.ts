import { Beat } from '../syntax/types.js';

export type MIDIMessage =
  | { type: 'trackName'; name: string }
  | { type: 'tempo'; bpm: number }
  | { type: 'timeSignature'; beat: Beat }
  | { type: 'endOfTrack' }
  | { type: 'text'; text: string }
  | { type: 'customMeta'; metaType: number; data: Uint8Array | number[] }
  | { type: 'noteOn'; channel: number; note: number; velocity: number }
  | { type: 'noteOff'; channel: number; note: number }
  | { type: 'programChange'; channel: number; program: number }
  | { type: 'controlChange'; channel: number; controller: number; value: number };

export interface MIDIEvent {
  tick: number;
  message: MIDIMessage;
}

export class TmdMIDIEncoder {
  public static encodeFile(tracks: Uint8Array[], ticksPerQuarter: number): Uint8Array {
    const headerChunks: number[] = [
      0x4d, 0x54, 0x68, 0x64, // 'MThd'
      0x00, 0x00, 0x00, 0x06, // length 6
      0x00, 0x01,             // format 1
      (tracks.length >> 8) & 0xff, tracks.length & 0xff, // tracks count
      (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff // ticks per quarter note
    ];

    const chunks: Uint8Array[] = [new Uint8Array(headerChunks)];
    for (const track of tracks) {
      const trackHeader = new Uint8Array([
        0x4d, 0x54, 0x72, 0x6b, // 'MTrk'
        (track.length >>> 24) & 0xff,
        (track.length >>> 16) & 0xff,
        (track.length >>> 8) & 0xff,
        track.length & 0xff,
      ]);
      chunks.push(trackHeader);
      chunks.push(track);
    }

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }

  public static encodeTrack(events: MIDIEvent[]): Uint8Array {
    const sorted = [...events].sort((a, b) => a.tick - b.tick);
    const lastTick = sorted.length > 0 ? sorted[sorted.length - 1].tick : 0;
    sorted.push({ tick: lastTick, message: { type: 'endOfTrack' } });

    const bytes: number[] = [];
    let currentLastTick = 0;

    for (const event of sorted) {
      const delta = event.tick >= currentLastTick ? event.tick - currentLastTick : 0;
      bytes.push(...this.variableLengthQuantity(delta));
      bytes.push(...this.encodeMessage(event.message));
      currentLastTick = event.tick;
    }

    return new Uint8Array(bytes);
  }

  private static encodeMessage(message: MIDIMessage): number[] {
    switch (message.type) {
      case 'trackName': {
        const encoder = new TextEncoder();
        const data = Array.from(encoder.encode(message.name));
        return this.metaEvent(0x03, data);
      }
      case 'tempo': {
        const mpqn = Math.min(0xffffffff, Math.max(0, Math.round(60_000_000.0 / Math.max(1, message.bpm))));
        const data = [(mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff];
        return this.metaEvent(0x51, data);
      }
      case 'timeSignature': {
        const denom = Math.round(Math.log2(Math.max(1, message.beat.noteValue)));
        return this.metaEvent(0x58, [
          Math.min(255, Math.max(1, message.beat.count)),
          denom & 0xff,
          24,
          8,
        ]);
      }
      case 'endOfTrack':
        return this.metaEvent(0x2f, []);
      case 'text': {
        const encoder = new TextEncoder();
        const data = Array.from(encoder.encode(message.text));
        return this.metaEvent(0x01, data);
      }
      case 'customMeta': {
        const data = Array.from(message.data);
        return this.metaEvent(message.metaType, data);
      }
      case 'noteOn':
        return [(0x90 | (message.channel & 0x0f)) & 0xff, message.note & 0x7f, message.velocity & 0x7f];
      case 'noteOff':
        return [(0x80 | (message.channel & 0x0f)) & 0xff, message.note & 0x7f, 0];
      case 'programChange':
        return [(0xc0 | (message.channel & 0x0f)) & 0xff, message.program & 0x7f];
      case 'controlChange':
        return [
          (0xb0 | (message.channel & 0x0f)) & 0xff,
          message.controller & 0x7f,
          message.value & 0x7f,
        ];
    }
  }

  private static metaEvent(type: number, data: number[]): number[] {
    return [0xff, type & 0xff, ...this.variableLengthQuantity(data.length), ...data];
  }

  private static variableLengthQuantity(val: number): number[] {
    let value = Math.max(0, Math.floor(val));
    const buffer: number[] = [value & 0x7f];
    value = Math.floor(value / 128);
    while (value > 0) {
      buffer.push((value & 0x7f) | 0x80);
      value = Math.floor(value / 128);
    }
    return buffer.reverse();
  }
}
