import type { TMDWebEditor } from "../../editor.js";
import { t } from "../../i18n.js";

export interface InsertSectionModalElements {
  insertSectionModal: HTMLDialogElement;
  insertSecName: HTMLInputElement;
  insertSecInst: HTMLInputElement;
  insertSecTemplate: HTMLSelectElement;
  insertSecMeasures: HTMLSelectElement | HTMLInputElement;
  btnConfirmInsertSec: HTMLButtonElement;
  toolInsertSection?: HTMLButtonElement | null;
  ctxInsertSection?: HTMLElement | null;
  toolsDropdown?: HTMLElement | null;
  closeContextMenu: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
  onScoreUpdated: (newText: string) => void;
}

export function setupInsertSectionModal(
  elements: InsertSectionModalElements,
  editor: TMDWebEditor
): {
  openInsertSectionModal: () => void;
} {
  const {
    insertSectionModal,
    insertSecName,
    insertSecInst,
    insertSecTemplate,
    insertSecMeasures,
    btnConfirmInsertSec,
    toolInsertSection,
    ctxInsertSection,
    toolsDropdown,
    closeContextMenu,
    showToast,
    onScoreUpdated,
  } = elements;

  const openInsertSectionModal = () => {
    toolsDropdown?.classList.remove("open");
    closeContextMenu();
    const ctx = editor.getCursorContext();
    if (ctx.section) {
      insertSecName.value = `${ctx.section}_new`;
    } else {
      insertSecName.value = "verse2";
    }
    if (ctx.instrument) {
      insertSecInst.value = ctx.instrument;
    } else {
      insertSecInst.value = "Lead";
    }
    insertSectionModal.showModal();
  };

  toolInsertSection?.addEventListener("click", () => {
    openInsertSectionModal();
  });

  ctxInsertSection?.addEventListener("click", () => {
    openInsertSectionModal();
  });

  btnConfirmInsertSec?.addEventListener("click", () => {
    const secName = insertSecName.value.trim() || "verse";
    const instName = insertSecInst.value.trim() || "Lead";
    const templateType = insertSecTemplate.value;
    const measures = parseInt(insertSecMeasures.value, 10) || 4;

    let bars = "";
    if (templateType === "melody") {
      const barPatterns = [
        "| 1 2 3 5 |",
        "| 6 5 3 - |",
        "| 2 3 2 1 |",
        "| 2 - - - |",
        "| 1 2 3 5 |",
        "| 6 1^ 6 5 |",
        "| 3 5 2 3 |",
        "| 1 - - - |",
      ];
      bars = Array.from({ length: measures }, (_, i) => barPatterns[i % barPatterns.length]).join("\n  ");
    } else if (templateType === "chords") {
      const chordPatterns = [
        "| [1] - - - |",
        "| [5] - - - |",
        "| [6m] - - - |",
        "| [4] - - - |",
        "| [1] - - - |",
        "| [4] - - - |",
        "| [5] - - - |",
        "| [1] - - - |",
      ];
      bars = Array.from({ length: measures }, (_, i) => chordPatterns[i % chordPatterns.length]).join("\n  ");
    } else if (templateType === "drums") {
      const drumPatterns = [
        "| D - S - |",
        "| D D S - |",
        "| D - S - |",
        "| D - (xxxx) - |",
      ];
      bars = Array.from({ length: measures }, (_, i) => drumPatterns[i % drumPatterns.length]).join("\n  ");
    } else if (templateType === "bass") {
      const bassPatterns = [
        "| 1_ - - - |",
        "| 5_ - - - |",
        "| 6_ - - - |",
        "| 4_ - - - |",
      ];
      bars = Array.from({ length: measures }, (_, i) => bassPatterns[i % bassPatterns.length]).join("\n  ");
    }

    const snippet = `\n${secName}:${instName}@|0|{\n  <4*>\n  ${bars}\n}\n`;

    editor.insertAtCursor(snippet);
    const updated = editor.getContent();
    onScoreUpdated(updated);
    insertSectionModal.close();
    showToast(t("toastInsertedSection"));
  });

  return {
    openInsertSectionModal,
  };
}
