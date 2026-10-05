import { TMDRefactor } from "../../../../src/refactoring/refactor.js";
import { TmdParser } from "../../../../src/syntax/parser.js";
import { Sheet } from "../../../../src/syntax/types.js";
import type { TMDWebEditor } from "../../editor.js";
import { escapeHtml } from "../../html.js";
import { t } from "../../i18n.js";
import { extractTmdTitle, SavedScore,TmdStorage } from "../../storage/db.js";

export interface RefactorModalsElements {
  // Rename Instrument
  refactorInstrumentModal: HTMLDialogElement;
  refactorOldInst: HTMLSelectElement;
  refactorNewInst: HTMLInputElement;
  btnConfirmRenameInst: HTMLButtonElement;
  toolRenameInstrument?: HTMLButtonElement | null;
  ctxRenameInstrument?: HTMLElement | null;

  // Rename Section
  refactorSectionModal: HTMLDialogElement;
  refactorOldSec: HTMLSelectElement;
  refactorNewSec: HTMLInputElement;
  btnConfirmRenameSec: HTMLButtonElement;
  toolRenameSection?: HTMLButtonElement | null;
  ctxRenameSection?: HTMLElement | null;

  // Extract Instrument
  refactorExtractModal: HTMLDialogElement;
  refactorExtractInst: HTMLSelectElement;
  btnConfirmExtract: HTMLButtonElement;
  toolExtractInstrument?: HTMLButtonElement | null;
  ctxExtractInstrument?: HTMLElement | null;

  // Duplicate Track
  refactorDuplicateModal: HTMLDialogElement;
  refactorDupSource: HTMLSelectElement;
  refactorDupTarget: HTMLInputElement;
  refactorDupOctave: HTMLSelectElement;
  refactorDupScopeGroup: HTMLElement;
  refactorDupScopeSection: HTMLInputElement;
  refactorDupScopeGlobal: HTMLInputElement;
  refactorDupScopeSectionLabel: HTMLElement;
  btnConfirmDuplicate: HTMLButtonElement;
  toolDuplicateTrack?: HTMLButtonElement | null;
  ctxDuplicateTrack?: HTMLElement | null;

  // Generate Harmony
  refactorHarmonyModal: HTMLDialogElement;
  refactorHarmSource: HTMLSelectElement;
  refactorHarmTarget: HTMLInputElement;
  refactorHarmInterval: HTMLSelectElement;
  refactorHarmScopeGroup: HTMLElement;
  refactorHarmScopeSection: HTMLInputElement;
  refactorHarmScopeGlobal: HTMLInputElement;
  refactorHarmScopeSectionLabel: HTMLElement;
  btnConfirmHarmony: HTMLButtonElement;
  toolGenerateHarmony?: HTMLButtonElement | null;
  ctxGenerateHarmony?: HTMLElement | null;

  // Transpose
  refactorTransposeModal: HTMLDialogElement;
  refactorTransposeSemitones: HTMLSelectElement;
  refactorTransposeScopeGroup: HTMLElement;
  refactorTransposeSelectionOnly: HTMLInputElement;
  refactorTransposeUpdateKeyGroup: HTMLElement;
  refactorTransposeUpdateKey: HTMLInputElement;
  btnConfirmTranspose: HTMLButtonElement;
  toolTranspose?: HTMLButtonElement | null;
  ctxTranspose?: HTMLElement | null;

  // Inline Orders
  toolInlineOrders?: HTMLButtonElement | null;

  // Dropdown & Context Menu closing
  toolsDropdown?: HTMLElement | null;
  closeContextMenu: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
  onScoreUpdated: (newText: string) => void;
  loadScoreIntoEditor: (score: SavedScore) => void;
}

export function setupRefactorModals(
  elements: RefactorModalsElements,
  editor: TMDWebEditor
): {
  openDuplicateModal: (initialSection?: string, initialInstrument?: string) => void;
  openHarmonyModal: (initialSection?: string, initialInstrument?: string) => void;
  openTransposeModal: () => void;
} {
  const {
    refactorInstrumentModal,
    refactorOldInst,
    refactorNewInst,
    btnConfirmRenameInst,
    toolRenameInstrument,
    ctxRenameInstrument,

    refactorSectionModal,
    refactorOldSec,
    refactorNewSec,
    btnConfirmRenameSec,
    toolRenameSection,
    ctxRenameSection,

    refactorExtractModal,
    refactorExtractInst,
    btnConfirmExtract,
    toolExtractInstrument,
    ctxExtractInstrument,

    refactorDuplicateModal,
    refactorDupSource,
    refactorDupTarget,
    refactorDupOctave,
    refactorDupScopeGroup,
    refactorDupScopeSection,
    refactorDupScopeGlobal,
    refactorDupScopeSectionLabel,
    btnConfirmDuplicate,
    toolDuplicateTrack,
    ctxDuplicateTrack,

    refactorHarmonyModal,
    refactorHarmSource,
    refactorHarmTarget,
    refactorHarmInterval,
    refactorHarmScopeGroup,
    refactorHarmScopeSection,
    refactorHarmScopeGlobal,
    refactorHarmScopeSectionLabel,
    btnConfirmHarmony,
    toolGenerateHarmony,
    ctxGenerateHarmony,

    refactorTransposeModal,
    refactorTransposeSemitones,
    refactorTransposeScopeGroup,
    refactorTransposeSelectionOnly,
    refactorTransposeUpdateKeyGroup,
    refactorTransposeUpdateKey,
    btnConfirmTranspose,
    toolTranspose,
    ctxTranspose,

    toolInlineOrders,
    toolsDropdown,
    closeContextMenu,
    showToast,
    onScoreUpdated,
    loadScoreIntoEditor,
  } = elements;

  // Rename Instrument Modal
  toolRenameInstrument?.addEventListener("click", () => {
    toolsDropdown?.classList.remove("open");
    const text = editor.getContent();
    let sheet: Sheet | null = null;
    try {
      sheet = TmdParser.parse(text);
    } catch {
      // ignore
    }
    const instruments = Array.from(new Set(sheet?.entries.map((p) => p.assignment).filter((p): p is string => Boolean(p)) || []));
    refactorOldInst.innerHTML = instruments
      .map((inst) => `<option value="${escapeHtml(inst)}">${escapeHtml(inst)}</option>`)
      .join("");
    refactorNewInst.value = "";
    refactorInstrumentModal.showModal();
  });

  ctxRenameInstrument?.addEventListener("click", () => {
    closeContextMenu();
    toolRenameInstrument?.click();
  });

  btnConfirmRenameInst?.addEventListener("click", () => {
    const oldInst = refactorOldInst.value;
    const newInst = refactorNewInst.value.trim();
    if (!oldInst || !newInst) return;
    try {
      const text = editor.getContent();
      const refactored = TMDRefactor.renameInstrument(text, oldInst, newInst);
      editor.setContent(refactored);
      onScoreUpdated(refactored);
      refactorInstrumentModal.close();
      showToast(t("toastRenamedInstrument"));
    } catch (err: any) {
      showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  });

  // Rename Section Modal
  toolRenameSection?.addEventListener("click", () => {
    toolsDropdown?.classList.remove("open");
    const text = editor.getContent();
    let sheet: Sheet | null = null;
    try {
      sheet = TmdParser.parse(text);
    } catch {
      // ignore
    }
    const sections = Array.from(new Set(sheet?.entries.map((p) => p.name) || []));
    refactorOldSec.innerHTML = sections
      .map((sec) => `<option value="${escapeHtml(sec)}">${escapeHtml(sec)}</option>`)
      .join("");
    refactorNewSec.value = "";
    refactorSectionModal.showModal();
  });

  ctxRenameSection?.addEventListener("click", () => {
    closeContextMenu();
    toolRenameSection?.click();
  });

  btnConfirmRenameSec?.addEventListener("click", () => {
    const oldSec = refactorOldSec.value;
    const newSec = refactorNewSec.value.trim();
    if (!oldSec || !newSec) return;
    try {
      const text = editor.getContent();
      const refactored = TMDRefactor.renameSection(text, oldSec, newSec);
      editor.setContent(refactored);
      onScoreUpdated(refactored);
      refactorSectionModal.close();
      showToast(t("toastRenamedSection"));
    } catch (err: any) {
      showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  });

  // Extract Instrument Modal
  toolExtractInstrument?.addEventListener("click", () => {
    toolsDropdown?.classList.remove("open");
    const text = editor.getContent();
    let sheet: Sheet | null = null;
    try {
      sheet = TmdParser.parse(text);
    } catch {
      // ignore
    }
    const instruments = Array.from(new Set(sheet?.entries.map((p) => p.assignment).filter((p): p is string => Boolean(p)) || []));
    refactorExtractInst.innerHTML = instruments
      .map((inst) => `<option value="${escapeHtml(inst)}">${escapeHtml(inst)}</option>`)
      .join("");
    refactorExtractModal.showModal();
  });

  ctxExtractInstrument?.addEventListener("click", () => {
    closeContextMenu();
    toolExtractInstrument?.click();
  });

  btnConfirmExtract?.addEventListener("click", async () => {
    const inst = refactorExtractInst.value;
    if (!inst) return;
    try {
      const text = editor.getContent();
      const extractedTmd = TMDRefactor.extractInstrument(text, inst);
      const title = extractTmdTitle(extractedTmd) || `${inst}_score`;
      const newScore = await TmdStorage.saveScore({
        title,
        content: extractedTmd,
      });
      loadScoreIntoEditor(newScore);
      refactorExtractModal.close();
      showToast(t("toastExtracted"));
    } catch (err: any) {
      showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  });

  // Context-aware modal openers
  let activeContextSection: string | undefined;

  const openDuplicateModal = (initialSection?: string, initialInstrument?: string) => {
    toolsDropdown?.classList.remove("open");
    closeContextMenu();
    const text = editor.getContent();
    let sheet: Sheet | null = null;
    try {
      sheet = TmdParser.parse(text);
    } catch {
      // ignore
    }
    const instruments = Array.from(new Set(sheet?.entries.map((p) => p.assignment).filter((p): p is string => Boolean(p)) || []));
    refactorDupSource.innerHTML = instruments
      .map((inst) => `<option value="${escapeHtml(inst)}" ${inst === initialInstrument ? "selected" : ""}>${escapeHtml(inst)}</option>`)
      .join("");
    refactorDupTarget.value = "";
    refactorDupOctave.value = "0";

    activeContextSection = initialSection;
    if (initialSection) {
      refactorDupScopeGroup.style.display = "block";
      refactorDupScopeSection.checked = true;
      refactorDupScopeSectionLabel.textContent = t("scopeSectionOnly").replace("{section}", initialSection);
    } else {
      refactorDupScopeGroup.style.display = "none";
      refactorDupScopeGlobal.checked = true;
    }

    refactorDuplicateModal.showModal();
  };

  const openHarmonyModal = (initialSection?: string, initialInstrument?: string) => {
    toolsDropdown?.classList.remove("open");
    closeContextMenu();
    const text = editor.getContent();
    let sheet: Sheet | null = null;
    try {
      sheet = TmdParser.parse(text);
    } catch {
      // ignore
    }
    const instruments = Array.from(new Set(sheet?.entries.map((p) => p.assignment).filter((p): p is string => Boolean(p)) || []));
    refactorHarmSource.innerHTML = instruments
      .map((inst) => `<option value="${escapeHtml(inst)}" ${inst === initialInstrument ? "selected" : ""}>${escapeHtml(inst)}</option>`)
      .join("");
    refactorHarmTarget.value = "";
    refactorHarmInterval.value = "2";

    activeContextSection = initialSection;
    if (initialSection) {
      refactorHarmScopeGroup.style.display = "block";
      refactorHarmScopeSection.checked = true;
      refactorHarmScopeSectionLabel.textContent = t("scopeSectionOnly").replace("{section}", initialSection);
    } else {
      refactorHarmScopeGroup.style.display = "none";
      refactorHarmScopeGlobal.checked = true;
    }

    refactorHarmonyModal.showModal();
  };

  toolDuplicateTrack?.addEventListener("click", () => {
    openDuplicateModal();
  });

  ctxDuplicateTrack?.addEventListener("click", () => {
    const ctx = editor.getCursorContext();
    openDuplicateModal(ctx.section, ctx.instrument);
  });

  btnConfirmDuplicate?.addEventListener("click", () => {
    const source = refactorDupSource.value;
    const target = refactorDupTarget.value.trim();
    const octaveShift = parseInt(refactorDupOctave.value, 10) || 0;
    const isSectionOnly = refactorDupScopeSection.checked && activeContextSection;
    const section = isSectionOnly ? activeContextSection : undefined;

    if (!source || !target) return;
    try {
      const text = editor.getContent();
      const refactored = TMDRefactor.duplicateTrack(text, source, target, { section, octaveShift });
      editor.setContent(refactored);
      onScoreUpdated(refactored);
      refactorDuplicateModal.close();
      showToast(t("toastDuplicatedTrack"));
    } catch (err: any) {
      showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  });

  toolGenerateHarmony?.addEventListener("click", () => {
    openHarmonyModal();
  });

  ctxGenerateHarmony?.addEventListener("click", () => {
    const ctx = editor.getCursorContext();
    openHarmonyModal(ctx.section, ctx.instrument);
  });

  btnConfirmHarmony?.addEventListener("click", () => {
    const source = refactorHarmSource.value;
    const target = refactorHarmTarget.value.trim();
    const intervalSteps = parseInt(refactorHarmInterval.value, 10) || 0;
    const isSectionOnly = refactorHarmScopeSection.checked && activeContextSection;
    const section = isSectionOnly ? activeContextSection : undefined;

    if (!source || !target) return;
    try {
      const text = editor.getContent();
      const refactored = TMDRefactor.generateHarmony(text, source, target, { section, intervalSteps });
      editor.setContent(refactored);
      onScoreUpdated(refactored);
      refactorHarmonyModal.close();
      showToast(t("toastGeneratedHarmony"));
    } catch (err: any) {
      showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  });

  const openTransposeModal = () => {
    toolsDropdown?.classList.remove("open");
    closeContextMenu();
    const ctx = editor.getCursorContext();
    if (ctx.hasSelection) {
      refactorTransposeScopeGroup.style.display = "block";
      refactorTransposeSelectionOnly.checked = true;
      refactorTransposeUpdateKeyGroup.style.display = "none";
    } else {
      refactorTransposeScopeGroup.style.display = "none";
      refactorTransposeSelectionOnly.checked = false;
      refactorTransposeUpdateKeyGroup.style.display = "block";
      refactorTransposeUpdateKey.checked = true;
    }
    refactorTransposeModal.showModal();
  };

  toolTranspose?.addEventListener("click", () => {
    openTransposeModal();
  });

  ctxTranspose?.addEventListener("click", () => {
    openTransposeModal();
  });

  btnConfirmTranspose?.addEventListener("click", () => {
    const semitones = parseInt(refactorTransposeSemitones.value, 10) || 0;
    const ctx = editor.getCursorContext();
    const applyToSelection = ctx.hasSelection && refactorTransposeSelectionOnly.checked;
    const updateKeySignature = !applyToSelection && refactorTransposeUpdateKey.checked;

    try {
      if (applyToSelection) {
        const selectionText = editor.getSelection();
        const transposed = TMDRefactor.transpose(selectionText, { semitones });
        editor.replaceSelection(transposed);
      } else {
        const full = editor.getContent();
        const transposed = TMDRefactor.transpose(full, { semitones, updateKeySignature });
        editor.setContent(transposed);
      }
      const updated = editor.getContent();
      onScoreUpdated(updated);
      refactorTransposeModal.close();
      showToast(t("toastTransposed"));
    } catch (err: any) {
      showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  });

  // Inline Orders
  toolInlineOrders?.addEventListener("click", () => {
    toolsDropdown?.classList.remove("open");
    if (!confirm(t("confirmInlineOrders"))) return;
    try {
      const text = editor.getContent();
      const inlined = TMDRefactor.inlineOrders(text);
      editor.setContent(inlined);
      onScoreUpdated(inlined);
      showToast(t("toastInlinedOrders"));
    } catch (err: any) {
      showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
    }
  });

  return {
    openDuplicateModal,
    openHarmonyModal,
    openTransposeModal,
  };
}
