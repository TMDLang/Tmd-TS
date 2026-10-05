import { Sheet } from "../../../src/core/types.js";
import { TMDMIDIGenerator } from "../../../src/exporters/midi.js";
import { formatOrder } from "../../../src/formatting/format.js";
import { TmdParser } from "../../../src/syntax/parser.js";
import type { TMDWebEditor } from "../editor.js";
import { t } from "../i18n.js";
import { TMDMidiSynthType,tmdPlayer } from "../midi-player.js";
import { makeDraggable } from "./draggable.js";

export interface PlayerBarElements {
  tmdPlayerBar: HTMLElement;
  playerTitle: HTMLElement;
  playerTime: HTMLElement;
  playerProgress: HTMLInputElement;
  synthSelect: HTMLSelectElement;
  playerBtnPause: HTMLButtonElement;
  playerBtnClose: HTMLButtonElement;
  btnPlay: HTMLButtonElement;
}

export function formatPlaybackTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export class TMDPlayerController {
  private isSeeking = false;

  constructor(
    private elements: PlayerBarElements,
    private getEditor: () => TMDWebEditor
  ) {}

  public init(): void {
    const {
      tmdPlayerBar,
      playerBtnPause,
      playerBtnClose,
      playerProgress,
      playerTime,
      synthSelect,
      btnPlay,
    } = this.elements;

    if (tmdPlayerBar) {
      makeDraggable(tmdPlayerBar);
    }

    btnPlay.addEventListener("click", () => {
      this.startPlayback();
    });

    playerBtnPause.addEventListener("click", () => {
      tmdPlayer.togglePause();
    });

    playerBtnClose.addEventListener("click", () => {
      tmdPlayer.stop();
      tmdPlayerBar.style.display = "none";
    });

    playerProgress.addEventListener("mousedown", () => {
      this.isSeeking = true;
    });
    playerProgress.addEventListener("touchstart", () => {
      this.isSeeking = true;
    }, { passive: true });

    playerProgress.addEventListener("input", () => {
      const targetSec = parseFloat(playerProgress.value);
      const totalSec = tmdPlayer.getDuration();
      if (playerTime) {
        playerTime.textContent = `${formatPlaybackTime(targetSec)} / ${formatPlaybackTime(totalSec)}`;
      }
    });

    const commitSeek = () => {
      if (this.isSeeking) {
        const targetSec = parseFloat(playerProgress.value);
        tmdPlayer.seek(targetSec);
        this.isSeeking = false;
      }
    };

    playerProgress.addEventListener("change", commitSeek);
    playerProgress.addEventListener("mouseup", commitSeek);
    playerProgress.addEventListener("touchend", commitSeek);

    synthSelect.value = tmdPlayer.getSynthType();
    synthSelect.addEventListener("change", async () => {
      const selected = synthSelect.value as TMDMidiSynthType;
      await tmdPlayer.setSynthType(selected);
    });
  }

  public async startPlayback(customText?: string): Promise<void> {
    const editor = this.getEditor();
    const text = customText !== undefined ? customText : editor.getContent();
    let sheet: Sheet | null = null;
    try {
      sheet = TmdParser.parse(text);
    } catch (err: any) {
      alert(`${t("alertCannotPlaySyntax")}\n${err.message}`);
      return;
    }

    if (!sheet) {
      alert(t("alertCannotPlayMissingHeader"));
      return;
    }

    const title = sheet.name || "score.mid";
    let midiBytes: Uint8Array;
    try {
      midiBytes = TMDMIDIGenerator.generateMIDI(sheet);
    } catch (err: any) {
      alert(`${t("alertMidiFailed")}: ${err.message}`);
      return;
    }

    await this.runPlayer(midiBytes, title);
  }

  public async playSectionOrTrack(sectionName: string, instrumentName?: string): Promise<void> {
    const editor = this.getEditor();
    const text = editor.getContent();
    let sheet: Sheet | null = null;
    try {
      sheet = TmdParser.parse(text);
    } catch (err: any) {
      alert(`${t("alertCannotPlaySyntax")}\n${err.message}`);
      return;
    }

    if (!sheet) {
      alert(t("alertCannotPlayMissingHeader"));
      return;
    }

    const title = instrumentName
      ? `${sheet.name || "score"} - ${sectionName} (${instrumentName})`
      : `${sheet.name || "score"} - ${sectionName}`;

    let midiBytes: Uint8Array;
    try {
      midiBytes = TMDMIDIGenerator.generateMIDI(sheet, undefined, {
        targetParagraph: sectionName,
        targetInstrument: instrumentName,
      });
    } catch (err: any) {
      alert(`${t("alertMidiFailed")}: ${err.message}`);
      return;
    }

    await this.runPlayer(midiBytes, title);
  }

  public async playFromOrderIndex(orderIndex: number): Promise<void> {
    const editor = this.getEditor();
    const text = editor.getContent();
    let sheet: Sheet | null = null;
    try {
      sheet = TmdParser.parse(text);
    } catch (err: any) {
      alert(`${t("alertCannotPlaySyntax")}\n${err.message}`);
      return;
    }

    if (!sheet) {
      alert(t("alertCannotPlayMissingHeader"));
      return;
    }

    const targetOrder = sheet.playback[orderIndex];
    const orderLabel = targetOrder ? formatOrder(targetOrder) : `#${orderIndex + 1}`;
    const title = `${sheet.name || "score"} [➔ ${orderLabel}]`;

    let midiBytes: Uint8Array;
    try {
      midiBytes = TMDMIDIGenerator.generateMIDI(sheet, undefined, {
        startOrderIndex: orderIndex,
      });
    } catch (err: any) {
      alert(`${t("alertMidiFailed")}: ${err.message}`);
      return;
    }

    await this.runPlayer(midiBytes, title);
  }

  private async runPlayer(midiBytes: Uint8Array, title: string): Promise<void> {
    const {
      tmdPlayerBar,
      playerTitle,
      playerTime,
      playerProgress,
      playerBtnPause,
    } = this.elements;

    if (playerTitle) playerTitle.textContent = title;
    if (playerTime) playerTime.textContent = "00:00 / 00:00";
    if (playerProgress) {
      playerProgress.value = "0";
      playerProgress.max = "100";
      playerProgress.classList.remove("loading");
      playerProgress.disabled = false;
    }
    if (tmdPlayerBar) tmdPlayerBar.style.display = "flex";
    if (playerBtnPause) {
      playerBtnPause.textContent = "⏸";
      playerBtnPause.disabled = false;
    }

    await tmdPlayer.play(midiBytes, title, {
      onStart: (_title, durationSec) => {
        if (playerProgress) {
          playerProgress.classList.remove("loading");
          playerProgress.disabled = false;
          playerProgress.max = Math.max(1, durationSec).toString();
          playerProgress.value = "0";
        }
        if (playerBtnPause) {
          playerBtnPause.disabled = false;
          playerBtnPause.textContent = "⏸";
        }
        if (playerTime) {
          playerTime.textContent = `00:00 / ${formatPlaybackTime(durationSec)}`;
        }
      },
      onProgress: (currentSec, totalSec) => {
        if (playerTime) {
          playerTime.textContent = `${formatPlaybackTime(currentSec)} / ${formatPlaybackTime(totalSec)}`;
        }
        if (playerProgress && !this.isSeeking) {
          playerProgress.classList.remove("loading");
          playerProgress.disabled = false;
          if (playerProgress.max !== totalSec.toString()) {
            playerProgress.max = Math.max(1, totalSec).toString();
          }
          playerProgress.value = currentSec.toString();
        }
      },
      onPause: () => {
        if (playerBtnPause) playerBtnPause.textContent = "▶";
      },
      onResume: () => {
        if (playerBtnPause) playerBtnPause.textContent = "⏸";
      },
      onLoadingStatus: (status, progress) => {
        if (status && progress) {
          // Entering or progressing in loading state
          if (playerProgress) {
            playerProgress.classList.add("loading");
            playerProgress.disabled = true;
          }
          if (playerBtnPause) {
            playerBtnPause.disabled = true;
          }
          if (playerTime) {
            const template = t("loadingSoundfontProgress");
            const text = template && template !== "loadingSoundfontProgress"
              ? template
                  .replace("{current}", progress.current.toString())
                  .replace("{total}", progress.total.toString())
                  .replace("{name}", progress.instrumentName)
              : status;
            playerTime.textContent = text;
          }
        } else if (!status) {
          // Loading completed or reset
          if (playerProgress) {
            playerProgress.classList.remove("loading");
            playerProgress.disabled = false;
          }
          if (playerBtnPause) {
            playerBtnPause.disabled = false;
          }
        }
      },
      onStop: () => {
        if (tmdPlayerBar) tmdPlayerBar.style.display = "none";
        if (playerBtnPause) {
          playerBtnPause.textContent = "▶";
          playerBtnPause.disabled = false;
        }
        if (playerProgress) {
          playerProgress.classList.remove("loading");
          playerProgress.disabled = false;
          playerProgress.value = "0";
        }
      },
      onEnd: () => {
        // Keep tmdPlayerBar visible so user can see it ended and hit play to replay from start
        if (playerBtnPause) {
          playerBtnPause.textContent = "▶";
          playerBtnPause.disabled = false;
        }
        if (playerProgress) {
          playerProgress.classList.remove("loading");
          playerProgress.disabled = false;
          playerProgress.value = playerProgress.max;
        }
        if (playerTime) {
          const totalSec = tmdPlayer.getDuration();
          playerTime.textContent = `${formatPlaybackTime(totalSec)} / ${formatPlaybackTime(totalSec)}`;
        }
      },
    });
  }
}
