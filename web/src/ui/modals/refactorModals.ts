import { TmdRefactor } from "../../../../src/refactoring/refactor.js";
import { TmdParser } from "../../../../src/syntax/parser.js";
import { Sheet } from "../../../../src/syntax/types.js";
import type { TmdWebEditor } from "../../editor.js";
import { escapeHtml } from "../../html.js";
import { t } from "../../i18n.js";
import { extractTmdTitle, SavedScore, TmdStorage } from "../../storage/db.js";

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

function parseEditorSheet(editor: TmdWebEditor): Sheet | null {
  try {
    return TmdParser.parse(editor.getContent());
  } catch {
    return null;
  }
}

function populateSelectOptions(
  selectEl: HTMLSelectElement,
  values: string[],
  selectedValue?: string
): void {
  selectEl.innerHTML = values
    .map(
      (val) =>
        `<option value="${escapeHtml(val)}" ${val === selectedValue ? "selected" : ""}>${escapeHtml(val)}</option>`
    )
    .join("");
}

function getSheetInstruments(editor: TmdWebEditor): string[] {
  const sheet = parseEditorSheet(editor);
  return Array.from(
    new Set(sheet?.entries.map((p) => p.assignment).filter((p): p is string => Boolean(p)) || [])
  );
}

function getSheetSections(editor: TmdWebEditor): string[] {
  const sheet = parseEditorSheet(editor);
  return Array.from(new Set(sheet?.entries.map((p) => p.name) || []));
}

function configureSectionScopeControls(
  initialSection: string | undefined,
  scopeGroup: HTMLElement,
  scopeSection: HTMLInputElement,
  scopeGlobal: HTMLInputElement,
  scopeSectionLabel: HTMLElement
): void {
  if (initialSection) {
    scopeGroup.style.display = "block";
    scopeSection.checked = true;
    scopeSectionLabel.textContent = t("scopeSectionOnly").replace("{section}", initialSection);
  } else {
    scopeGroup.style.display = "none";
    scopeGlobal.checked = true;
  }
}

function applyEditorRefactor(
  editor: TmdWebEditor,
  onScoreUpdated: (newText: string) => void,
  showToast: (message: string, type?: "success" | "error") => void,
  toastMessage: string,
  modal: HTMLDialogElement | null,
  transform: (text: string) => string
): void {
  try {
    const refactored = transform(editor.getContent());
    editor.setContent(refactored);
    onScoreUpdated(refactored);
    modal?.close();
    showToast(toastMessage);
  } catch (err: any) {
    showToast(t("errorRefactor").replace("{error}", err.message || String(err)), "error");
  }
}

export function setupRefactorModals(
  elements: RefactorModalsElements,
  editor: TmdWebEditor
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
    populateSelectOptions(refactorOldInst, getSheetInstruments(editor));
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
    applyEditorRefactor(
      editor,
      onScoreUpdated,
      showToast,
      t("toastRenamedInstrument"),
      refactorInstrumentModal,
      (text) => TmdRefactor.renameInstrument(text, oldInst, newInst)
    );
  });

  // Rename Section Modal
  toolRenameSection?.addEventListener("click", () => {
    toolsDropdown?.classList.remove("open");
    populateSelectOptions(refactorOldSec, getSheetSections(editor));
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
    applyEditorRefactor(
      editor,
      onScoreUpdated,
      showToast,
      t("toastRenamedSection"),
      refactorSectionModal,
      (text) => TmdRefactor.renameSection(text, oldSec, newSec)
    );
  });

  // Extract Instrument Modal
  toolExtractInstrument?.addEventListener("click", () => {
    toolsDropdown?.classList.remove("open");
    populateSelectOptions(refactorExtractInst, getSheetInstruments(editor));
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
      const extractedTmd = TmdRefactor.extractInstrument(text, inst);
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
    populateSelectOptions(refactorDupSource, getSheetInstruments(editor), initialInstrument);
    refactorDupTarget.value = "";
    refactorDupOctave.value = "0";

    activeContextSection = initialSection;
    configureSectionScopeControls(
      initialSection,
      refactorDupScopeGroup,
      refactorDupScopeSection,
      refactorDupScopeGlobal,
      refactorDupScopeSectionLabel
    );
    refactorDuplicateModal.showModal();
  };

  const openHarmonyModal = (initialSection?: string, initialInstrument?: string) => {
    toolsDropdown?.classList.remove("open");
    closeContextMenu();
    populateSelectOptions(refactorHarmSource, getSheetInstruments(editor), initialInstrument);
    refactorHarmTarget.value = "";
    refactorHarmInterval.value = "2";

    activeContextSection = initialSection;
    configureSectionScopeControls(
      initialSection,
      refactorHarmScopeGroup,
      refactorHarmScopeSection,
      refactorHarmScopeGlobal,
      refactorHarmScopeSectionLabel
    );
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
    applyEditorRefactor(
      editor,
      onScoreUpdated,
      showToast,
      t("toastDuplicatedTrack"),
      refactorDuplicateModal,
      (text) => TmdRefactor.duplicateTrack(text, source, target, { section, octaveShift })
    );
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
    applyEditorRefactor(
      editor,
      onScoreUpdated,
      showToast,
      t("toastGeneratedHarmony"),
      refactorHarmonyModal,
      (text) => TmdRefactor.generateHarmony(text, source, target, { section, intervalSteps })
    );
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
        const transposed = TmdRefactor.transpose(selectionText, { semitones });
        editor.replaceSelection(transposed);
      } else {
        const full = editor.getContent();
        const transposed = TmdRefactor.transpose(full, { semitones, updateKeySignature });
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
    applyEditorRefactor(
      editor,
      onScoreUpdated,
      showToast,
      t("toastInlinedOrders"),
      null,
      (text) => TmdRefactor.inlineOrders(text)
    );
  });

  return {
    openDuplicateModal,
    openHarmonyModal,
    openTransposeModal,
  };
}
