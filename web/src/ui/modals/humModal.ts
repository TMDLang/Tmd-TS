import { Sheet } from "../../../../src/syntax/types.js";
import {
  detectTonicAndScale,
  quantizeNoteEventsToTmdSection,
  resampleAudioBuffer,
} from "../../audio/quantizer.js";
import type { TmdWebEditor } from "../../editor.js";
import { t } from "../../i18n.js";

export const CHUNK_RELOAD_STORAGE_KEY = "tmd_chunk_reload_ts";
export const CHUNK_RELOAD_DEBOUNCE_MS = 10_000;

export interface ChunkReloadOptions {
  storage?: Pick<Storage, "getItem" | "setItem">;
  reload?: () => void;
  now?: number;
}

export function isDynamicImportError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk [\w-]+ failed/i.test(
    message
  );
}

export function tryReloadOnChunkError(options: ChunkReloadOptions = {}): boolean {
  const now = options.now ?? Date.now();
  const storage =
    options.storage ??
    (typeof window !== "undefined" ? window.sessionStorage : undefined);
  const reload =
    options.reload ??
    (() => {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    });

  try {
    const rawLastReload = storage?.getItem(CHUNK_RELOAD_STORAGE_KEY);
    if (rawLastReload) {
      const lastReload = Number(rawLastReload);
      if (Number.isFinite(lastReload) && now - lastReload < CHUNK_RELOAD_DEBOUNCE_MS) {
        return false;
      }
    }
    storage?.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  } catch {
    // Proceed with reload even if sessionStorage is restricted
  }

  reload();
  return true;
}

export async function importWithChunkErrorRecovery<T>(
  importer: () => Promise<T>,
  options: ChunkReloadOptions = {}
): Promise<T> {
  try {
    return await importer();
  } catch (firstError) {
    if (!isDynamicImportError(firstError)) {
      throw firstError;
    }
    try {
      return await importer();
    } catch (retryError) {
      if (isDynamicImportError(retryError)) {
        tryReloadOnChunkError(options);
      }
      throw retryError;
    }
  }
}

export interface HumModalElements {
  humModal: HTMLDialogElement;
  toolHumRecording?: HTMLButtonElement | null;
  ctxHumRecording?: HTMLElement | null;
  humBtnRecord: HTMLButtonElement;
  humRecordIcon?: HTMLElement | null;
  humRecordText?: HTMLElement | null;
  humStatusIndicator?: HTMLElement | null;
  humBpm?: HTMLInputElement | null;
  humKey?: HTMLSelectElement | null;
  humGrid?: HTMLSelectElement | null;
  humSnapScale?: HTMLInputElement | null;
  humEnableMetronome?: HTMLInputElement | null;
  humEnableCountIn?: HTMLInputElement | null;
  humSectionName?: HTMLInputElement | null;
  humInstrument?: HTMLInputElement | null;
  humResultCode?: HTMLTextAreaElement | null;
  humBtnPlayPreview?: HTMLButtonElement | null;
  humBtnApply?: HTMLButtonElement | null;
  getCurrentSheet: () => Sheet | null;
  closeContextMenu: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
  onScoreUpdated: (newText: string) => void;
  startPlayback: (customText?: string) => Promise<void>;
}

export function setupHumModal(
  elements: HumModalElements,
  editor: TmdWebEditor
): {
  openHumModal: () => void;
} {
  const {
    humModal,
    toolHumRecording,
    ctxHumRecording,
    humBtnRecord,
    humRecordIcon,
    humRecordText,
    humStatusIndicator,
    humBpm,
    humKey,
    humGrid,
    humSnapScale,
    humEnableMetronome,
    humEnableCountIn,
    humSectionName,
    humInstrument,
    humResultCode,
    humBtnPlayPreview,
    humBtnApply,
    getCurrentSheet,
    closeContextMenu,
    showToast,
    onScoreUpdated,
    startPlayback,
  } = elements;

  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let isHumRecording = false;
  let isCountIn = false;
  let countInTimer: any = null;
  let metronomeTimer: any = null;
  let humAudioCtx: AudioContext | null = null;
  let humTranscribedSnippet = "";
  let lastTranscribedKey = "C";

  const playClickSound = (isFirstBeat: boolean) => {
    try {
      if (!humAudioCtx) {
        humAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (humAudioCtx.state === "suspended") {
        humAudioCtx.resume();
      }
      const osc = humAudioCtx.createOscillator();
      const gain = humAudioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = isFirstBeat ? 880 : 440;
      gain.gain.setValueAtTime(0.3, humAudioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, humAudioCtx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(humAudioCtx.destination);
      osc.start();
      osc.stop(humAudioCtx.currentTime + 0.05);
    } catch {
      // Ignore audio synthesis error if user interaction is restricted
    }
  };

  const stopMetronome = () => {
    if (metronomeTimer) {
      clearInterval(metronomeTimer);
      metronomeTimer = null;
    }
    if (countInTimer) {
      clearTimeout(countInTimer);
      countInTimer = null;
    }
    isCountIn = false;
  };

  const startMetronomeClicks = (bpm: number, beatsPerMeasure: number = 4) => {
    stopMetronome();
    const intervalMs = (60.0 / bpm) * 1000;
    let currentBeat = 0;
    playClickSound(true); // First beat immediately
    currentBeat = 1;
    metronomeTimer = setInterval(() => {
      const isFirst = currentBeat % beatsPerMeasure === 0;
      playClickSound(isFirst);
      currentBeat = (currentBeat + 1) % beatsPerMeasure;
    }, intervalMs);
  };

  const openHumModal = () => {
    const currentSheet = getCurrentSheet();
    if (currentSheet) {
      if (humBpm) humBpm.value = currentSheet.speed > 0 ? String(currentSheet.speed) : "120";
      if (humKey) humKey.value = currentSheet.keySignature ? currentSheet.keySignature.toString().replace("'", "#") : "C";
    }
    if (humResultCode) humResultCode.value = "";
    if (humBtnApply) humBtnApply.disabled = true;
    if (humBtnPlayPreview) humBtnPlayPreview.style.display = "none";
    if (humStatusIndicator) humStatusIndicator.textContent = t("humStatusIdle");
    humModal?.showModal();
  };

  toolHumRecording?.addEventListener("click", openHumModal);
  ctxHumRecording?.addEventListener("click", () => {
    closeContextMenu();
    openHumModal();
  });

  humModal?.addEventListener("close", () => {
    stopMetronome();
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    isHumRecording = false;
  });

  humBtnRecord?.addEventListener("click", async () => {
    if (isCountIn) {
      // Cancel count in
      stopMetronome();
      if (humRecordIcon) humRecordIcon.textContent = "🔴";
      if (humRecordText) humRecordText.textContent = t("humBtnRecord");
      if (humStatusIndicator) humStatusIndicator.textContent = t("humStatusIdle");
      return;
    }

    if (!isHumRecording) {
      // Start Recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunks.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          // Stop metronome if running
          stopMetronome();
          // Stop stream tracks
          stream.getTracks().forEach((track) => track.stop());

          if (humStatusIndicator) humStatusIndicator.textContent = t("humStatusProcessing");
          if (humRecordIcon) humRecordIcon.textContent = "⏳";
          if (humRecordText) humRecordText.textContent = t("humStatusProcessing");
          humBtnRecord.disabled = true;

          try {
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const rawBuffer = await audioContext.decodeAudioData(arrayBuffer);
            // Basic Pitch expects 22050 Hz mono audioBuffer
            const audioBuffer = await resampleAudioBuffer(rawBuffer, 22050);

            // Dynamically import @spotify/basic-pitch to avoid loading tensorflow at startup
            const { BasicPitch, noteFramesToTime, outputToNotesPoly } =
              await importWithChunkErrorRecovery(() => import("@spotify/basic-pitch"));
            const basicPitch = new BasicPitch("https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json");

            const frames: number[][] = [];
            const onsets: number[][] = [];
            const contours: number[][] = [];

            await basicPitch.evaluateModel(
              audioBuffer,
              (f: number[][], o: number[][], c: number[][]) => {
                frames.push(...f);
                onsets.push(...o);
                contours.push(...c);
              },
              (_pct: number) => {}
            );

            const notes = outputToNotesPoly(frames, onsets, 0.5, 0.35, 11);
            const rawEvents = noteFramesToTime(notes);

            // Monophonic Vocal Filter
            const sortedEvents = [...rawEvents].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
            const monophonicEvents: typeof rawEvents = [];

            for (const ev of sortedEvents) {
              if (monophonicEvents.length === 0) {
                monophonicEvents.push(ev);
                continue;
              }
              const prev = monophonicEvents[monophonicEvents.length - 1];
              const prevEnd = prev.startTimeSeconds + prev.durationSeconds;

              if (ev.startTimeSeconds < prevEnd - 0.08) {
                if (ev.amplitude > prev.amplitude) {
                  if (ev.startTimeSeconds <= prev.startTimeSeconds + 0.08) {
                    monophonicEvents[monophonicEvents.length - 1] = ev;
                  } else {
                    prev.durationSeconds = Math.max(0.08, ev.startTimeSeconds - prev.startTimeSeconds);
                    monophonicEvents.push(ev);
                  }
                }
              } else {
                monophonicEvents.push(ev);
              }
            }

            const currentSheet = getCurrentSheet();
            const bpm = parseInt(humBpm?.value || "120", 10) || 120;
            const grid = parseInt(humGrid?.value || "8", 10) || 8;
            let key = humKey?.value || "AUTO";
            if (key === "AUTO") {
              key = detectTonicAndScale(monophonicEvents);
            }
            lastTranscribedKey = key;
            const snapToScale = humSnapScale ? humSnapScale.checked : true;
            const secName = humSectionName?.value.trim() || "hummed";
            const instName = humInstrument?.value.trim() || "Vocal";

            const tmdSnippet = quantizeNoteEventsToTmdSection(monophonicEvents, {
              sectionName: secName,
              instrument: instName,
              bpm,
              grid,
              key,
              snapToScale,
              beatsPerMeasure: currentSheet?.beat?.count || 4,
            });

            humTranscribedSnippet = tmdSnippet;
            if (humResultCode) humResultCode.value = tmdSnippet;
            if (humStatusIndicator) {
              humStatusIndicator.textContent = `${t("humStatusSuccess")} (Key: ${key})`;
            }
            if (humBtnApply) humBtnApply.disabled = false;
            if (humBtnPlayPreview) humBtnPlayPreview.style.display = "inline-flex";
          } catch (err: any) {
            console.error("Basic Pitch error:", err);
            if (humStatusIndicator) {
              humStatusIndicator.textContent = t("humStatusError").replace("{error}", err.message || String(err));
            }
          } finally {
            humBtnRecord.disabled = false;
            if (humRecordIcon) humRecordIcon.textContent = "🔴";
            if (humRecordText) humRecordText.textContent = t("humBtnRecord");
          }
        };

        const currentSheet = getCurrentSheet();
        const bpm = parseInt(humBpm?.value || "120", 10) || 120;
        const enableMetronome = humEnableMetronome ? humEnableMetronome.checked : true;
        const enableCountIn = humEnableCountIn ? humEnableCountIn.checked : true;

        const actuallyStartRecording = () => {
          mediaRecorder?.start();
          isHumRecording = true;
          isCountIn = false;
          if (humRecordIcon) humRecordIcon.textContent = "⏹️";
          if (humRecordText) humRecordText.textContent = t("humBtnStop");
          if (humStatusIndicator) humStatusIndicator.textContent = t("humStatusRecording");
          if (enableMetronome) {
            startMetronomeClicks(bpm, currentSheet?.beat?.count || 4);
          }
        };

        if (enableCountIn) {
          isCountIn = true;
          if (humRecordIcon) humRecordIcon.textContent = "⏳";
          if (humRecordText) humRecordText.textContent = t("btnCancel");
          let count = 1;
          const countInBeatInterval = (60.0 / bpm) * 1000;

          const runCount = () => {
            if (!isCountIn) return;
            playClickSound(count === 1);
            if (humStatusIndicator) {
              humStatusIndicator.textContent = t("humStatusCountIn").replace("{count}", String(count));
            }
            if (count >= 4) {
              countInTimer = setTimeout(() => {
                if (isCountIn) {
                  actuallyStartRecording();
                }
              }, countInBeatInterval);
            } else {
              count++;
              countInTimer = setTimeout(runCount, countInBeatInterval);
            }
          };
          runCount();
        } else {
          actuallyStartRecording();
        }
      } catch (err: any) {
        alert(`無法存取麥克風: ${err.message}`);
      }
    } else {
      // Stop Recording
      stopMetronome();
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      isHumRecording = false;
    }
  });

  humBtnPlayPreview?.addEventListener("click", () => {
    const code = humResultCode?.value || humTranscribedSnippet;
    if (!code) return;
    const secName = humSectionName?.value.trim() || "hummed";
    let key = humKey?.value || "C";
    if (key === "AUTO") {
      key = lastTranscribedKey || "C";
    }
    const bpm = humBpm?.value || "120";

    const previewTmd = `::SCORE::\n** Hummed Preview **\n!= ${bpm}\n?= ${key}\n<4/4>\n\n${code}\n\n-> ${secName} ->#\n`;
    startPlayback(previewTmd);
  });

  humBtnApply?.addEventListener("click", () => {
    const code = humResultCode?.value || humTranscribedSnippet;
    if (!code) return;
    editor.insertAtCursor(`\n${code}\n`);
    const updated = editor.getContent();
    onScoreUpdated(updated);
    humModal.close();
    showToast(t("toastInsertedSection"));
  });

  return {
    openHumModal,
  };
}
