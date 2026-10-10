import {
  TmdBrailleEncoding,
  TmdBrailleGenerator,
  TmdBrailleLayout,
  TmdBraillePreview,
} from "../../../../src/exporters/braille.js";
import { TmdParser } from "../../../../src/syntax/parser.js";
import type { TmdWebEditor } from "../../editor.js";
import { t } from "../../i18n.js";
import { downloadBlob, getSafeFilename } from "../exportMenu.js";

export interface BrailleModalElements {
  braillePreviewModal: HTMLDialogElement;
  btnCloseBrailleModal: HTMLButtonElement;
  btnDismissBrailleModal: HTMLButtonElement;
  brailleSelectLayout: HTMLSelectElement;
  brailleSelectEncoding: HTMLSelectElement;
  brailleSelectInstrument: HTMLSelectElement;
  brailleOutputTextarea: HTMLTextAreaElement;
  brailleSightedContainer: HTMLElement;
  btnBrailleCopy: HTMLButtonElement;
  btnBrailleCopyText: HTMLElement;
  btnBrailleDownloadBrl: HTMLButtonElement;
  btnBrailleDownloadBrf: HTMLButtonElement;
  showToast?: (message: string, type?: "success" | "error") => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSightedBreakdownHtml(preview: TmdBraillePreview): string {
  if (preview.tracks.length === 0) {
    return `<div style="color: var(--text-secondary); font-size: 13px;">No musical tracks found.</div>`;
  }

  const colMeasure = escapeHtml(t("brailleColMeasure"));
  const colUnicode = escapeHtml(t("brailleColUnicode"));
  const colAscii = escapeHtml(t("brailleColAscii"));
  const colSighted = escapeHtml(t("brailleColSighted"));

  const trackBlocks = preview.tracks.map((track) => {
    const rows = track.measures
      .map(
        (m) => `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 4px 8px; font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary);">m${m.measureNumber}</td>
          <td style="padding: 4px 8px; font-family: 'Apple Braille', 'Segoe UI Symbol', var(--font-mono); font-size: 15px;">${escapeHtml(m.unicode)}</td>
          <td style="padding: 4px 8px; font-family: var(--font-mono); font-size: 12.5px;"><code>${escapeHtml(m.ascii)}</code></td>
          <td style="padding: 4px 8px; font-size: 12.5px; color: var(--text-primary);">${escapeHtml(m.sightedSummary)}</td>
        </tr>`
      )
      .join("");

    return `
      <div style="margin-bottom: 12px;">
        <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
          <span>${escapeHtml(track.instrument)}</span>
          <span style="font-family: 'Apple Braille', var(--font-mono); font-weight: normal; color: var(--text-secondary);">(${escapeHtml(track.prefixUnicode)} / <code>${escapeHtml(track.prefixAscii)}</code>)</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); font-size: 11.5px; color: var(--text-secondary);">
              <th style="padding: 4px 8px; width: 64px;">${colMeasure}</th>
              <th style="padding: 4px 8px;">${colUnicode}</th>
              <th style="padding: 4px 8px;">${colAscii}</th>
              <th style="padding: 4px 8px;">${colSighted}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  });

  return trackBlocks.join("");
}

export function setupBrailleModal(
  elements: BrailleModalElements,
  getEditor: () => TmdWebEditor
): {
  openBrailleModal: () => void;
  refreshBraillePreview: () => TmdBraillePreview | null;
} {
  const {
    braillePreviewModal,
    btnCloseBrailleModal,
    btnDismissBrailleModal,
    brailleSelectLayout,
    brailleSelectEncoding,
    brailleSelectInstrument,
    brailleOutputTextarea,
    brailleSightedContainer,
    btnBrailleCopy,
    btnBrailleCopyText,
    btnBrailleDownloadBrl,
    btnBrailleDownloadBrf,
    showToast,
  } = elements;

  const populateInstruments = () => {
    const editor = getEditor();
    if (!editor) return;
    const sheet = TmdParser.parse(editor.getContent());
    if (!sheet) return;
    const fullPreview = TmdBrailleGenerator.generateBraillePreview(sheet);
    const prevValue = brailleSelectInstrument.value;
    brailleSelectInstrument.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = t("brailleAllInstruments");
    brailleSelectInstrument.appendChild(allOpt);

    for (const trk of fullPreview.tracks) {
      const opt = document.createElement("option");
      opt.value = trk.instrument;
      opt.textContent = `${trk.instrument} (${trk.prefixUnicode})`;
      brailleSelectInstrument.appendChild(opt);
    }

    if (
      prevValue &&
      fullPreview.tracks.some((trk) => trk.instrument === prevValue)
    ) {
      brailleSelectInstrument.value = prevValue;
    }
  };

  const refreshBraillePreview = (): TmdBraillePreview | null => {
    const editor = getEditor();
    if (!editor) return null;
    const sheet = TmdParser.parse(editor.getContent());
    if (!sheet) {
      brailleOutputTextarea.value = "";
      brailleSightedContainer.innerHTML = "";
      return null;
    }

    const layout: TmdBrailleLayout =
      brailleSelectLayout.value === "barOverBar" ? "barOverBar" : "partByPart";
    const encoding: TmdBrailleEncoding =
      brailleSelectEncoding.value === "ascii" ? "ascii" : "unicode";
    const targetInstrument = brailleSelectInstrument.value || undefined;

    const preview = TmdBrailleGenerator.generateBraillePreview(sheet, {
      layout,
      encoding,
      targetInstrument,
    });

    brailleOutputTextarea.value =
      encoding === "unicode" ? preview.unicodeText : preview.asciiText;
    brailleSightedContainer.innerHTML = renderSightedBreakdownHtml(preview);
    return preview;
  };

  const openBrailleModal = () => {
    const editor = getEditor();
    if (!editor) return;
    const sheet = TmdParser.parse(editor.getContent());
    if (!sheet) {
      alert(t("alertCannotExport"));
      return;
    }
    populateInstruments();
    refreshBraillePreview();
    if (typeof braillePreviewModal.showModal === "function") {
      braillePreviewModal.showModal();
    } else {
      braillePreviewModal.setAttribute("open", "true");
    }
  };

  const closeBrailleModal = () => {
    if (typeof braillePreviewModal.close === "function") {
      braillePreviewModal.close();
    } else {
      braillePreviewModal.removeAttribute("open");
    }
  };

  brailleSelectLayout.addEventListener("change", () => {
    refreshBraillePreview();
  });

  brailleSelectEncoding.addEventListener("change", () => {
    refreshBraillePreview();
  });

  brailleSelectInstrument.addEventListener("change", () => {
    refreshBraillePreview();
  });

  btnCloseBrailleModal.addEventListener("click", closeBrailleModal);
  btnDismissBrailleModal.addEventListener("click", closeBrailleModal);

  btnBrailleCopy.addEventListener("click", async () => {
    const content = brailleOutputTextarea.value;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      btnBrailleCopyText.textContent = t("brailleBtnCopied");
      showToast?.(t("brailleBtnCopied"), "success");
      setTimeout(() => {
        btnBrailleCopyText.textContent = t("brailleBtnCopy");
      }, 2000);
    } catch {
      brailleOutputTextarea.select();
    }
  });

  btnBrailleDownloadBrl.addEventListener("click", () => {
    const preview = refreshBraillePreview();
    if (!preview) return;
    downloadBlob(
      getSafeFilename(preview.title, "brl"),
      new Blob([preview.unicodeText], { type: "text/plain;charset=utf-8" })
    );
  });

  btnBrailleDownloadBrf.addEventListener("click", () => {
    const preview = refreshBraillePreview();
    if (!preview) return;
    downloadBlob(
      getSafeFilename(preview.title, "brf"),
      new Blob([preview.asciiText], { type: "text/plain;charset=utf-8" })
    );
  });

  return { openBrailleModal, refreshBraillePreview };
}
