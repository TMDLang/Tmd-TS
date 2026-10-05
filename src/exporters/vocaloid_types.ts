/**
 * Options for configuring VOCALOID format exports.
 */
export interface VocaloidExportOptions {
  /** Name of singer to embed in the file (default: "Miku"). */
  singerName?: string;
  /** Pre-measure count in 4/4 bars (default: 4 measures = 7680 ticks at 480 PPQ). */
  preMeasure?: number;
  /** Default lyric to use if none is specified for a note. */
  defaultLyric?: string;
}
