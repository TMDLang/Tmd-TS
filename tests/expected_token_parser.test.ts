import { describe, expect,it } from 'vitest';

import { TMDParseError,TmdParser } from '../src/core/parser.js';

describe('Expected tokens on TMD parse syntax errors', () => {
  it('reports expected tokens when ::SCORE:: is missing', () => {
    expect.assertions(6);
    try {
      TmdParser.parseThrowing('not-a-score');
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.text).toBe('not-a-score');
      expect(err.range.start.line).toBe(1);
      expect(err.range.start.column).toBe(1);
      expect(err.expectedTokens).toContain('::SCORE::');
      expect(err.message).toContain('expected ::SCORE::');
    }
  });

  it('reports expected token for malformed paragraph missing colon', () => {
    expect.assertions(5);
    try {
      TmdParser.parseThrowing('::SCORE::\nintro');
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.text).toBe('intro');
      expect(err.range.start.line).toBe(2);
      expect(err.expectedTokens).toContain(':');
      expect(err.message).toContain('expected :');
    }
  });

  it('reports expected tokens for missing @ in paragraph header', () => {
    expect.assertions(4);
    try {
      TmdParser.parseThrowing('::SCORE::\nintro:Piano|0|{\n<4*>\n1 2 3 4\n}');
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.expectedTokens).toContain('@');
      expect(err.message).toContain('expected @');
      expect(err.description).toContain('expected @');
    }
  });

  it('reports expected tokens for missing { in paragraph header', () => {
    expect.assertions(4);
    try {
      TmdParser.parseThrowing('::SCORE::\nintro:Piano@|0|\n<4*>\n1 2 3 4\n}');
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.expectedTokens).toContain('{');
      expect(err.message).toContain('expected {');
      expect(err.description).toContain('expected {');
    }
  });

  it('reports expected tokens for missing < inside paragraph section', () => {
    expect.assertions(4);
    try {
      TmdParser.parseThrowing('::SCORE::\nintro:Piano@|0|{\n4*>\n1 2 3 4\n}');
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.expectedTokens).toContain('<');
      expect(err.message).toContain('expected <');
      expect(err.description).toContain('expected <');
    }
  });

  it('TmdParser.parse throws syntax error with line:column, offending token and expected tokens', () => {
    expect(() => TmdParser.parse('not a score')).toThrowError(
      /Unexpected token at 1:1: `not` \(expected ::SCORE::\)/
    );
    expect(() => TmdParser.parse('::SCORE::\nintro')).toThrowError(
      /Unexpected token at 2:1: `intro` \(expected :\)/
    );
    expect(() => TmdParser.parse('::SCORE::\nintro:Piano@|0|{\n4*>\n1 2 3 4\n}')).toThrowError(
      /Unexpected token at 3:1: `4` \(expected <\)/
    );
  });

  it('rejects invalid token in paragraph body with expected unit tokens', () => {
    expect(() =>
      TmdParser.parse('::SCORE::\nintro:Piano@|0|{\n<4*>\n1 2 Foo 4\n}')
    ).toThrowError(/expected note, chord, tie, rest, percussion, tuplet, directive, }/);
  });

  it('includes drum/percussion hint when encountering unknown alphabetic token in measure body', () => {
    expect.assertions(3);
    try {
      TmdParser.parse('::SCORE::\nintro:Drums@|0|{\n<4*>\n1 2 A 4\n}');
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.message).toContain('Unexpected token at 4:5: `A` (expected note, chord, tie, rest, percussion, tuplet, directive, })');
      expect(err.message).toMatch(/Hint: If writing percussion\/drums, valid symbols are: X\/x \(Hi-Hat\), S\/s \(Snare\), B\/b\/D\/d \(Bass Drum\), T\/t \(Tom\), C\/c \(Crash\), O\/o \(Open Hi-Hat\)/);
    }
  });

  it('does not append drum hint when expectedTokens does not include percussion', () => {
    expect.assertions(3);
    try {
      TmdParser.parse('::SCORE::\nintro:Piano@|0|\n<4*>\n1 2 3 4\n}');
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.message).not.toContain('Hint: If writing percussion');
      expect(err.expectedTokens).toContain('{');
    }
  });
  it('formats code frame with line number, context lines, and caret pointer', () => {
    const input = `::SCORE::\nintro:Piano@|0|{\n<4*>\n1 2 Foo 4\n}`;
    try {
      TmdParser.parse(input);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      const frame = err.formatCodeFrame(input, { color: false });
      expect(frame).toContain('3 | <4*>');
      expect(frame).toContain('4 | 1 2 Foo 4');
      expect(frame).toMatch(/\|\s+\^/);
    }
  });

  it('diagnoses fullwidth punctuation typo and suggests ASCII replacement', () => {
    const fullwidthCases = [
      { text: '（', expected: '(' },
      { text: '）', expected: ')' },
      { text: '｛', expected: '{' },
      { text: '｝', expected: '}' },
      { text: '【', expected: '[' },
      { text: '】', expected: ']' },
      { text: '：', expected: ':' },
      { text: '｜', expected: '|' },
      { text: '－', expected: '-' },
    ];

    for (const { text, expected } of fullwidthCases) {
      try {
        TmdParser.parse(`::SCORE::\nintro:Piano@|0|{\n<4*>\n1 2 ${text} 4\n}`);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(TMDParseError);
        const err = error as TMDParseError;
        expect(err.message).toContain(`Fullwidth punctuation detected: \`${text}\` -> replace with halfwidth \`${expected}\``);
      }
    }
  });

  it('diagnoses accidental typos like 1# or 4# and suggests TMD accidental syntax', () => {
    try {
      TmdParser.parse('::SCORE::\nintro:Piano@|0|{\n<4*>\n1# 2 3 4\n}');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.message).toContain("Hint: For sharp/flat accidentals in TMD, use `'` for sharp (e.g. `1'`) and `,` for flat (e.g. `7,`)");
    }

    try {
      TmdParser.parse('::SCORE::\nintro:Piano@|0|{\n<4*>\n1 4# 3 4\n}');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.message).toContain("Hint: For sharp/flat accidentals in TMD, use `'` for sharp (e.g. `1'`) and `,` for flat (e.g. `7,`)");
    }
  });

  it('diagnoses missing time grid when entering paragraph notes directly without <4*>', () => {
    try {
      TmdParser.parse('::SCORE::\nintro:Piano@|0|{\n1 2 3 4\n}');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TMDParseError);
      const err = error as TMDParseError;
      expect(err.message).toContain('Hint: Each section inside `{ ... }` must start with a time grid directive like `<4*>` or `<8*>` before note events');
    }
  });
});


