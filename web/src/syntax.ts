import type { StringStream } from "@codemirror/language";

export interface TmdParserState {
  inComment: boolean;
  inOrder: boolean;
  parenDepth: number;
}

export const tmdStreamParser = {
  languageData: {
    commentTokens: {
      block: { open: "/*", close: "*/" },
    },
  },
  startState(): TmdParserState {
    return { inComment: false, inOrder: false, parenDepth: 0 };
  },
  token(stream: StringStream, state: TmdParserState): string | null {
    if (state.inComment) {
      if (stream.match(/\*\//)) {
        state.inComment = false;
        return "comment";
      }
      stream.next();
      return "comment";
    }

    if (stream.match(/\/\*/)) {
      state.inComment = true;
      return "comment";
    }

    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Header root
    if (stream.match(/^::SCORE::/)) {
      return "keyword";
    }

    // Song Title
    if (stream.match(/^\*\*[^*]+\*\*/)) {
      return "heading";
    }

    // Order sequences (-> intro -> A ->#)
    if (stream.match(/^->#|^->\?|^->/)) {
      return "keyword";
    }

    // Directives
    if (stream.match(/^\{!=[\d.]+\}|^\{!\+[\d.]+\}/)) {
      return "operator";
    }
    if (stream.match(/^\{\?=[A-Ga-g0-9',#b]+\}|^\{\?[+-]\d+\}/)) {
      return "operator";
    }
    if (stream.match(/^\{(?:key|Key)\s*=\s*[A-Ga-g][',#b]*(?:m|min|minor)?\}/)) {
      return "operator";
    }
    if (stream.match(/^\{(?:ppp|pp|p|mp|mf|f|ff|fff)\}/)) {
      return "operator";
    }
    if (stream.match(/^\{<\d+\/\d+>\}/)) {
      return "operator";
    }
    if (stream.match(/^\{show\s+[^}]+\}/)) {
      return "meta";
    }

    // Global settings: tempo, key, meter
    if (stream.match(/^!\s*=\s*[\d.]+/)) {
      return "number";
    }
    if (stream.match(/^\?\s*=\s*[A-Ga-g][',#b]*/)) {
      return "atom";
    }
    if (stream.match(/^key\s*=\s*[A-Ga-g][',#b]*(?:m|min|minor)?/i)) {
      return "atom";
    }
    if (stream.match(/^<\d+\/\d+>|^<\d+\*>/)) {
      return "meta";
    }

    // Paragraph Header: concrete `section:Instrument@|offset|{` or abstract `Theme {`
    if (stream.match(/^[a-zA-Z0-9_\u4e00-\u9fa5-]+(:[a-zA-Z0-9_\u4e00-\u9fa5-]+(@\|?[+-]?\d+\|?)?)?\s*\{/)) {
      return "def";
    }
    if (stream.match(/^\}/)) {
      return "bracket";
    }

    // S-Expression macro forms: (canon Theme (V1 V2) 2)
    // Distinguish from Jianpu tuplet like (1 2 3)%(--)
    if (stream.match(/^\(/)) {
      // Check if this paren is followed eventually by )% (which is tuplet)
      const rest = stream.string.slice(stream.pos);
      if (/^[^\)]*\)%/.test(rest)) {
        // Tuplet prefix, fall through to tuplet matcher
        stream.backUp(1);
      } else {
        state.parenDepth++;
        return "bracket";
      }
    }
    if (state.parenDepth > 0) {
      if (stream.match(/^\)/)) {
        state.parenDepth = Math.max(0, state.parenDepth - 1);
        return "bracket";
      }
      // S-expression operators / macro combinators
      if (stream.match(/^(canon|layer|loop|play|transpose|retrograde|invert|augment|diminish)\b/)) {
        return "keyword";
      }
      // Numbers inside macro
      if (stream.match(/^[+-]?\d+(\.\d+)?/)) {
        return "number";
      }
      // Identifiers / Symbols inside macro
      if (stream.match(/^[a-zA-Z0-9_\u4e00-\u9fa5-]+/)) {
        return "variableName";
      }
    }

    // Chords: [1], [6m], [Cmaj7], [Am7], [2m7-5]
    if (stream.match(/^\[[^\]]+\]/)) {
      return "string";
    }

    // Tuplets: (1 2 3)%(--)
    if (stream.match(/^\([^)]+\)%[^ \t\r\n|]+/)) {
      return "special";
    }

    // Barlines
    if (stream.match(/^\|/)) {
      return "punctuation";
    }

    // Notes: Jianpu degree 0-7 with octave (^, _), accidentals (', ,, #, b), ties/rests (-)
    if (stream.match(/^[0-7]['#,^_\-.]+/)) {
      return "variableName";
    }
    if (stream.match(/^[0-7]/)) {
      return "variableName";
    }
    if (stream.match(/^-+/)) {
      return "punctuation";
    }

    // Metadata lines (~ "...")
    if (stream.match(/^~\s*"[^"]*"/)) {
      return "string";
    }

    stream.next();
    return null;
  },
};
