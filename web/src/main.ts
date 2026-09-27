import { TmdParser } from "../../src/core/parser.js";
import { TMDRefactor } from "../../src/core/refactor.js";
import { Sheet } from "../../src/core/types.js";
import { AIProviderType } from "./ai/index.js";
import { createTmdEditor, TMDWebEditor } from "./editor.js";
import {
  applyI18n,
  detectLanguage,
  getCurrentLocale,
  Locale,
  onLanguageChange,
} from "./i18n.js";
import { initTmdWebMcp } from "./mcp/webmcpIntegration.js";
import { SAMPLES } from "./samples.js";
import { TMDScoreService } from "./services/scoreService.js";
import { SavedScore,TmdStorage } from "./storage/db.js";
import { TMDAIDrawerController } from "./ui/aiDrawer.js";
// Extracted UI Controllers, Services & DOM
import { AppDOMElements,initAppDOMElements } from "./ui/dom.js";
import { setupExportMenu } from "./ui/exportMenu.js";
import { renderInspectorView, setupInspectorPanelEvents } from "./ui/inspector.js";
import { TMDLibraryDrawerController } from "./ui/libraryDrawer.js";
import { setupHumModal } from "./ui/modals/humModal.js";
import { setupInsertSectionModal } from "./ui/modals/insertSectionModal.js";
import { setupRefactorModals } from "./ui/modals/refactorModals.js";
import { applyPanelsState,savePanelsState } from "./ui/panelState.js";
import { TMDPlayerController } from "./ui/playerBar.js";
import { setupProblemsPanelEvents,updateProblemsPanel } from "./ui/problemsPanel.js";
import { getTheme,initTheme, toggleTheme } from "./ui/theme.js";
import { TMDToolsAndContextMenuController } from "./ui/toolsMenu.js";
import { VirtualKeyboardController } from "./ui/virtualKeyboard.js";

let editor: TMDWebEditor;
let currentSheet: Sheet | null = null;
let parseDebounceTimer: any = null;

// Controller and Service instances
let dom: AppDOMElements;
let scoreService: TMDScoreService;
let playerController: TMDPlayerController;
let libraryController: TMDLibraryDrawerController;
let aiDrawerController: TMDAIDrawerController;
let toolsAndContextController: TMDToolsAndContextMenuController;
let keyboardController: VirtualKeyboardController;

function showToast(message: string, type: "success" | "error" = "success") {
  let container = document.querySelector(".toast-container") as HTMLElement | null;
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function triggerSavePanelsState() {
  savePanelsState({
    libraryDrawer: dom.libraryDrawer,
    aiDrawer: dom.aiDrawer,
    inspectorPanel: dom.inspectorPanel,
    problemsPanel: dom.problemsPanel,
    btnToggleProblems: dom.btnToggleProblems,
    virtualKeyboard: dom.virtualKeyboard,
    btnToggleKeyboard: dom.btnToggleKeyboard,
  });
}

function updateProblems(text: string) {
  const issues = updateProblemsPanel(text, {
    problemsPanel: dom.problemsPanel,
    btnToggleProblems: dom.btnToggleProblems,
    btnFixProblemsAi: dom.btnFixProblemsAi,
    problemsCountBadge: dom.problemsCountBadge,
    problemsList: dom.problemsList,
  });
  if (editor) {
    editor.setMeasureIssues(issues);
  }
}

let selectedPitchInstrument: string | undefined = undefined;

function updateInspector(text: string) {
  currentSheet = renderInspectorView(
    text,
    {
      inspectorStatus: dom.inspectorStatus,
      statTitle: dom.statTitle,
      statTempo: dom.statTempo,
      statKey: dom.statKey,
      statMeter: dom.statMeter,
      statDuration: dom.statDuration,
      statMeasures: dom.statMeasures,
      statDensity: dom.statDensity,
      statVocalRange: dom.statVocalRange,
      statVocalSpan: dom.statVocalSpan,
      inspectorPitchInstSelect: dom.inspectorPitchInstSelect,
      inspectorVocalDetails: dom.inspectorVocalDetails,
      inspectorHarmony: dom.inspectorHarmony,
      inspectorModulations: dom.inspectorModulations,
      inspectorTonalityCard: dom.inspectorTonalityCard,
      inspectorTonalitySummary: dom.inspectorTonalitySummary,
      inspectorTonalityViz: dom.inspectorTonalityViz,
      btnInspectorDownloadSvg: dom.btnInspectorDownloadSvg,
      btnInspectorOpenHtml: dom.btnInspectorOpenHtml,
      inspectorOrders: dom.inspectorOrders,
      inspectorTracks: dom.inspectorTracks,
      sbStatus: dom.sbStatus,
      sbSummary: dom.sbSummary,
      selectedPitchInstrument,
      onSelectPitchInstrument: (inst) => {
        selectedPitchInstrument = inst;
      },
    },
    (code) => TmdParser.parse(code)
  );

  if (keyboardController) {
    const keyStr = dom.statKey?.textContent || (currentSheet?.keySignature ? currentSheet.keySignature.toString() : "C");
    keyboardController.setKeySignature(keyStr);
    if (dom.virtualKeyboardKeyBadge) {
      dom.virtualKeyboardKeyBadge.textContent = `Key: ${keyStr}`;
    }
  }
}

function handleScoreUpdated(newText: string) {
  updateInspector(newText);
  updateProblems(newText);
}

function handleEditorChange(text: string) {
  clearTimeout(parseDebounceTimer);
  parseDebounceTimer = setTimeout(() => {
    updateInspector(text);
    updateProblems(text);
  }, 200);

  // Auto-save to IndexedDB (Debounced 500ms via scoreService)
  scoreService?.scheduleAutoSave(text, 500);
}

function initEvents() {
  // 1. Player Controller
  playerController = new TMDPlayerController(
    {
      tmdPlayerBar: dom.tmdPlayerBar,
      playerTitle: dom.playerTitle,
      playerTime: dom.playerTime,
      playerProgress: dom.playerProgress,
      synthSelect: dom.synthSelect,
      playerBtnPause: dom.playerBtnPause,
      playerBtnClose: dom.playerBtnClose,
      btnPlay: dom.btnPlay,
    },
    () => editor
  );
  playerController.init();

  // 2. Library Drawer Controller
  libraryController = new TMDLibraryDrawerController(
    {
      libraryDrawer: dom.libraryDrawer,
      btnToggleLibrary: dom.btnToggleLibrary,
      btnCloseLibrary: dom.btnCloseLibrary,
      btnLibraryNew: dom.btnLibraryNew,
      inputImportTmd: dom.inputImportTmd,
      btnImportGist: dom.btnImportGist,
      importGistModal: dom.importGistModal,
      inputGistUrl: dom.inputGistUrl,
      btnConfirmImportGist: dom.btnConfirmImportGist,
      libraryScoresList: dom.libraryScoresList,
      librarySamplesList: dom.librarySamplesList,
      libraryScoresCount: dom.libraryScoresCount,
      btnOpenCanonModal: dom.btnOpenCanonModal,
      canonGeneratorModal: dom.canonGeneratorModal,
      inputCanonTitle: dom.inputCanonTitle,
      selectCanonKey: dom.selectCanonKey,
      inputCanonTempo: dom.inputCanonTempo,
      selectCanonMode: dom.selectCanonMode,
      selectCanonType: dom.selectCanonType,
      inputCanonVoices: dom.inputCanonVoices,
      inputCanonOffset: dom.inputCanonOffset,
      inputCanonVariations: dom.inputCanonVariations,
      selectCanonOutput: dom.selectCanonOutput,
      btnConfirmGenerateCanon: dom.btnConfirmGenerateCanon,
      btnCloseCanonModal: dom.btnCloseCanonModal,
      btnCancelCanonModal: dom.btnCancelCanonModal,
    },
    () => editor,
    (text: string) => handleScoreUpdated(text),
    () => triggerSavePanelsState(),
    (msg, type) => showToast(msg, type)
  );
  libraryController.init();

  // 3. Score Service for auto-save & share
  scoreService = new TMDScoreService({
    getIsTemplateScore: () => libraryController.getIsTemplateScore(),
    getCurrentScoreId: () => libraryController.getCurrentScoreId(),
    loadScoreIntoEditor: (score) => libraryController.loadScoreIntoEditor(score),
    refreshLibraryScores: () => libraryController.refreshLibraryScores(),
    onAutoSaveFeedback: (notice) => {
      if (dom.sbStatus) {
        const prevText = dom.sbStatus.textContent;
        dom.sbStatus.textContent = notice;
        setTimeout(() => {
          if (dom.sbStatus && dom.sbStatus.textContent === notice) {
            dom.sbStatus.textContent = prevText;
          }
        }, 1500);
      }
    },
  });

  // 4. Tools and Context Menu Controller
  toolsAndContextController = new TMDToolsAndContextMenuController(
    {
      editorContextMenu: dom.editorContextMenu,
      ctxHeaderInfo: dom.ctxHeaderInfo,
      ctxFormat: dom.ctxFormat,
      ctxFormatLabel: dom.ctxFormatLabel,
      ctxComment: dom.ctxComment,
      ctxTranspose: dom.ctxTranspose,
      ctxTransposeLabel: dom.ctxTransposeLabel,
      ctxInsertSection: dom.ctxInsertSection,
      ctxDoubleGrid: dom.ctxDoubleGrid,
      ctxHalveGrid: dom.ctxHalveGrid,
      ctxOptimizeGrid: dom.ctxOptimizeGrid,
      ctxDuplicateTrack: dom.ctxDuplicateTrack,
      ctxGenerateHarmony: dom.ctxGenerateHarmony,
      ctxExtractInstrument: dom.ctxExtractInstrument,
      ctxRenameInstrument: dom.ctxRenameInstrument,
      ctxRenameSection: dom.ctxRenameSection,
      ctxHumRecording: dom.ctxHumRecording,
    },
    {
      toolsDropdown: dom.toolsDropdown,
      btnToolsMenu: dom.btnToolsMenu,
      toolFormatDocument: dom.toolFormatDocument,
      toolDoubleGrid: dom.toolDoubleGrid,
      toolHalveGrid: dom.toolHalveGrid,
      toolOptimizeGrid: dom.toolOptimizeGrid,
      toolTranspose: dom.toolTranspose,
      exportDropdown: dom.exportDropdown,
    },
    () => editor,
    (text: string) => handleScoreUpdated(text),
    showToast
  );
  toolsAndContextController.init();

  // 5. Inspector Panel Events
  setupInspectorPanelEvents(
    {
      inspectorPanel: dom.inspectorPanel,
      btnToggleInspector: dom.btnToggleInspector,
      btnCloseInspector: dom.btnCloseInspector,
      inspectorTracks: dom.inspectorTracks,
      inspectorOrders: dom.inspectorOrders,
      inspectorHarmony: dom.inspectorHarmony,
      inspectorTonalityViz: dom.inspectorTonalityViz,
      btnJumpOrders: dom.btnJumpOrders,
      inspectorPitchInstSelect: dom.inspectorPitchInstSelect,
      btnInspectorDownloadSvg: dom.btnInspectorDownloadSvg,
      btnInspectorOpenHtml: dom.btnInspectorOpenHtml,
    },
    editor,
    () => triggerSavePanelsState(),
    (sec, inst) => playerController.playSectionOrTrack(sec, inst),
    (idx) => playerController.playFromOrderIndex(idx),
    (selectedInst) => {
      selectedPitchInstrument = selectedInst;
      if (editor) {
        updateInspector(editor.getContent());
      }
    }
  );

  // 6. Export Menu
  setupExportMenu(
    {
      exportDropdown: dom.exportDropdown,
      btnExportMenu: dom.btnExportMenu,
      btnExportTmd: dom.btnExportTmd,
      btnExportMidi: dom.btnExportMidi,
      btnExportReaper: dom.btnExportReaper,
      btnExportMusicXML: dom.btnExportMusicXML,
      btnExportLilyPond: dom.btnExportLilyPond,
      btnExportABC: dom.btnExportABC,
      btnExportChordPro: dom.btnExportChordPro,
      btnExportVsq: dom.btnExportVsq,
      btnExportVsqx: dom.btnExportVsqx,
      btnExportWAV: dom.btnExportWAV,
      btnExportSkill: dom.btnExportSkill,
      btnExportLibraryZip: dom.btnExportLibraryZip,
      btnBackupZip: dom.btnBackupZip,
      btnShare: dom.btnShare,
      toolsDropdown: dom.toolsDropdown,
    },
    () => editor
  );

  // 7. Refactor Modals
  const { openDuplicateModal, openHarmonyModal } = setupRefactorModals(
    {
      refactorInstrumentModal: dom.refactorInstrumentModal,
      refactorOldInst: dom.refactorOldInst,
      refactorNewInst: dom.refactorNewInst,
      btnConfirmRenameInst: dom.btnConfirmRenameInst,
      toolRenameInstrument: dom.toolRenameInstrument,
      ctxRenameInstrument: dom.ctxRenameInstrument,

      refactorSectionModal: dom.refactorSectionModal,
      refactorOldSec: dom.refactorOldSec,
      refactorNewSec: dom.refactorNewSec,
      btnConfirmRenameSec: dom.btnConfirmRenameSec,
      toolRenameSection: dom.toolRenameSection,
      ctxRenameSection: dom.ctxRenameSection,

      refactorExtractModal: dom.refactorExtractModal,
      refactorExtractInst: dom.refactorExtractInst,
      btnConfirmExtract: dom.btnConfirmExtract,
      toolExtractInstrument: dom.toolExtractInstrument,
      ctxExtractInstrument: dom.ctxExtractInstrument,

      refactorDuplicateModal: dom.refactorDuplicateModal,
      refactorDupSource: dom.refactorDupSource,
      refactorDupTarget: dom.refactorDupTarget,
      refactorDupOctave: dom.refactorDupOctave,
      refactorDupScopeGroup: dom.refactorDupScopeGroup,
      refactorDupScopeSection: dom.refactorDupScopeSection,
      refactorDupScopeGlobal: dom.refactorDupScopeGlobal,
      refactorDupScopeSectionLabel: dom.refactorDupScopeSectionLabel,
      btnConfirmDuplicate: dom.btnConfirmDuplicate,
      toolDuplicateTrack: dom.toolDuplicateTrack,
      ctxDuplicateTrack: dom.ctxDuplicateTrack,

      refactorHarmonyModal: dom.refactorHarmonyModal,
      refactorHarmSource: dom.refactorHarmSource,
      refactorHarmTarget: dom.refactorHarmTarget,
      refactorHarmInterval: dom.refactorHarmInterval,
      refactorHarmScopeGroup: dom.refactorHarmScopeGroup,
      refactorHarmScopeSection: dom.refactorHarmScopeSection,
      refactorHarmScopeGlobal: dom.refactorHarmScopeGlobal,
      refactorHarmScopeSectionLabel: dom.refactorHarmScopeSectionLabel,
      btnConfirmHarmony: dom.btnConfirmHarmony,
      toolGenerateHarmony: dom.toolGenerateHarmony,
      ctxGenerateHarmony: dom.ctxGenerateHarmony,

      refactorTransposeModal: dom.refactorTransposeModal,
      refactorTransposeSemitones: dom.refactorTransposeSemitones,
      refactorTransposeScopeGroup: dom.refactorTransposeScopeGroup,
      refactorTransposeSelectionOnly: dom.refactorTransposeSelectionOnly,
      refactorTransposeUpdateKeyGroup: dom.refactorTransposeUpdateKeyGroup,
      refactorTransposeUpdateKey: dom.refactorTransposeUpdateKey,
      btnConfirmTranspose: dom.btnConfirmTranspose,
      toolTranspose: dom.toolTranspose,
      ctxTranspose: dom.ctxTranspose,

      toolInlineOrders: dom.toolInlineOrders,
      toolsDropdown: dom.toolsDropdown,
      closeContextMenu: () => toolsAndContextController.closeContextMenu(),
      showToast,
      onScoreUpdated: (text) => handleScoreUpdated(text),
      loadScoreIntoEditor: (score) => libraryController.loadScoreIntoEditor(score),
    },
    editor
  );

  // 8. Insert Section Modal
  setupInsertSectionModal(
    {
      insertSectionModal: dom.insertSectionModal,
      insertSecName: dom.insertSecName,
      insertSecInst: dom.insertSecInst,
      insertSecTemplate: dom.insertSecTemplate,
      insertSecMeasures: dom.insertSecMeasures,
      btnConfirmInsertSec: dom.btnConfirmInsertSec,
      toolInsertSection: dom.toolInsertSection,
      ctxInsertSection: dom.ctxInsertSection,
      toolsDropdown: dom.toolsDropdown,
      closeContextMenu: () => toolsAndContextController.closeContextMenu(),
      showToast,
      onScoreUpdated: (text) => handleScoreUpdated(text),
    },
    editor
  );

  // 9. Hum to TMD Modal
  setupHumModal(
    {
      humModal: dom.humModal,
      toolHumRecording: dom.toolHumRecording,
      ctxHumRecording: dom.ctxHumRecording,
      humBtnRecord: dom.humBtnRecord,
      humRecordIcon: dom.humRecordIcon,
      humRecordText: dom.humRecordText,
      humStatusIndicator: dom.humStatusIndicator,
      humBpm: dom.humBpm,
      humKey: dom.humKey,
      humGrid: dom.humGrid,
      humSnapScale: dom.humSnapScale,
      humEnableMetronome: dom.humEnableMetronome,
      humEnableCountIn: dom.humEnableCountIn,
      humSectionName: dom.humSectionName,
      humInstrument: dom.humInstrument,
      humResultCode: dom.humResultCode,
      humBtnPlayPreview: dom.humBtnPlayPreview,
      humBtnApply: dom.humBtnApply,
      getCurrentSheet: () => currentSheet,
      closeContextMenu: () => toolsAndContextController.closeContextMenu(),
      showToast,
      onScoreUpdated: (text) => handleScoreUpdated(text),
      startPlayback: (code) => playerController.startPlayback(code),
    },
    editor
  );

  // 10. AI Drawer Controller
  aiDrawerController = new TMDAIDrawerController(
    {
      aiDrawer: dom.aiDrawer,
      btnToggleAi: dom.btnToggleAi,
      btnCloseAiDrawer: dom.btnCloseAiDrawer,
      btnOpenAiSettings: dom.btnOpenAiSettings,
      btnCloseAiSettings: dom.btnCloseAiSettings,
      btnDismissAiSettings: dom.btnDismissAiSettings,
      btnSaveAiSettings: dom.btnSaveAiSettings,
      aiPromptInput: dom.aiPromptInput,
      btnAiGenerate: dom.btnAiGenerate,
      btnAiStop: dom.btnAiStop,
      btnAiRetryRepair: dom.btnAiRetryRepair,
      btnAiPreviewPlay: dom.btnAiPreviewPlay,
      aiPreviewProblemsBadge: dom.aiPreviewProblemsBadge,
      aiPreviewProblemsList: dom.aiPreviewProblemsList,
      btnAiCopyCode: dom.btnAiCopyCode,
      btnAiApplyReplace: dom.btnAiApplyReplace,
      btnAiApplyInsert: dom.btnAiApplyInsert,
      aiStatusText: dom.aiStatusText,
      aiResultContainer: dom.aiResultContainer,
      aiResultOutput: dom.aiResultOutput,
      aiValidationBanner: dom.aiValidationBanner,
      aiValidationMsg: dom.aiValidationMsg,
      aiSettingsModal: dom.aiSettingsModal,
      aiSettingsProvider: dom.aiSettingsProvider,
      aiSettingsModelPreset: dom.aiSettingsModelPreset,
      aiSettingsModelCustom: dom.aiSettingsModelCustom,
      aiSettingsKey: dom.aiSettingsKey,
      aiKeyOfficialLink: dom.aiKeyOfficialLink,
      aiKeyAskAiLink: dom.aiKeyAskAiLink,
      aiSettingsBaseUrl: dom.aiSettingsBaseUrl,
      aiSettingsBaseUrlGroup: dom.aiSettingsBaseUrlGroup,
      aiBtnDownload: dom.aiBtnDownload,
      aiBtnCopySkill: dom.aiBtnCopySkill,
      inspectorPanel: dom.inspectorPanel,
    },
    () => editor,
    (text) => handleScoreUpdated(text),
    () => triggerSavePanelsState(),
    () => {
      dom.btnExportSkill.click();
    },
    (code) => playerController.startPlayback(code)
  );
  aiDrawerController.init();

  // 11. Virtual Keyboard Controller
  keyboardController = new VirtualKeyboardController(
    {
      virtualKeyboard: dom.virtualKeyboard,
      btnToggleKeyboard: dom.btnToggleKeyboard,
      keyboardKeysContainer: dom.virtualKeyboardKeys,
      keyboardModeAudition: dom.btnKeyboardModeAudition,
      keyboardModeInsert: dom.btnKeyboardModeInsert,
      keyboardOctaveDown: dom.btnKeyboardOctaveDown,
      keyboardOctaveUp: dom.btnKeyboardOctaveUp,
      keyboardOctaveDisplay: dom.virtualKeyboardOctaveDisplay,
      keyboardKeySigDisplay: dom.virtualKeyboardKeyBadge,
    },
    editor,
    () => triggerSavePanelsState()
  );

  // 12. Problems Panel Events & Quick Fix with AI
  setupProblemsPanelEvents(
    {
      problemsPanel: dom.problemsPanel,
      btnToggleProblems: dom.btnToggleProblems,
      btnFixProblemsAi: dom.btnFixProblemsAi,
      problemsCountBadge: dom.problemsCountBadge,
      problemsList: dom.problemsList,
    },
    editor,
    () => triggerSavePanelsState(),
    (target) => {
      aiDrawerController.launchProblemFix(target);
    }
  );

  // 13. Language switcher
  dom.btnLangToggle.addEventListener("click", () => {
    const nextLocale: Locale = getCurrentLocale() === "zh-TW" ? "en" : "zh-TW";
    applyI18n(nextLocale);
  });

  // 14. Theme switcher (Dark / Light)
  const updateThemeToggleIcon = () => {
    const currentTheme = getTheme();
    if (dom.themeToggleIcon) {
      dom.themeToggleIcon.textContent = currentTheme === "light" ? "🌙" : "☀️";
    }
  };

  dom.btnThemeToggle.addEventListener("click", () => {
    const nextTheme = toggleTheme();
    updateThemeToggleIcon();
    if (editor) {
      editor.setTheme(nextTheme);
    }
  });

  const updateWebMcpAskLink = () => {
    const link = document.getElementById("ai-webmcp-ask-link") as HTMLAnchorElement | null;
    if (!link) return;
    const isZh = getCurrentLocale() === "zh-TW";
    const q = isZh
      ? encodeURIComponent("怎樣設定 Web MCP 連線教學")
      : encodeURIComponent("How to setup and connect to Web MCP tutorial");
    const hl = isZh ? "zh-TW" : "en";
    link.href = `https://www.google.com/search?q=${q}&hl=${hl}`;
  };

  onLanguageChange(() => {
    if (editor) {
      handleScoreUpdated(editor.getContent());
    }
    const selectedProvider = (dom.aiSettingsProvider?.value as AIProviderType) || "gemini";
    aiDrawerController.populateModelPresets(selectedProvider);
    updateWebMcpAskLink();
  });

  // 13. General Action Buttons & Modals
  dom.btnNewSong.addEventListener("click", () => {
    libraryController.createNewSong();
  });

  dom.btnHelp.addEventListener("click", () => {
    dom.helpModal.showModal();
  });

  dom.btnCloseHelp.addEventListener("click", () => {
    dom.helpModal.close();
  });

  dom.btnDismissHelp.addEventListener("click", () => {
    dom.helpModal.close();
  });

  // Close modals on cancel button click
  document.querySelectorAll(".btn-close-modal").forEach((btn) => {
    btn.addEventListener("click", () => {
      dom.importGistModal?.close();
      dom.refactorInstrumentModal?.close();
      dom.refactorSectionModal?.close();
      dom.refactorExtractModal?.close();
      dom.refactorDuplicateModal?.close();
      dom.refactorHarmonyModal?.close();
      dom.insertSectionModal?.close();
      dom.humModal?.close();
    });
  });

  // Hash-based shared score URL change
  window.addEventListener("hashchange", () => {
    TMDScoreService.importSharedScore()
      .then((score) => score && libraryController.loadScoreIntoEditor(score))
      .catch((err) => console.error("Failed to import shared score:", err));
  });
}

async function init() {
  dom = initAppDOMElements();
  const container = document.getElementById("editor-container")!;
  const defaultSample = SAMPLES[0]; // 《三天三夜》
  let initialContent = defaultSample.content;

  applyI18n(detectLanguage());

  let initialScoreId: string | null = null;
  let initialIsTemplate = true;
  let initialTemplateId: string | null = defaultSample.id;

  try {
    const shared = await TMDScoreService.importSharedScore();
    if (shared) TmdStorage.setActiveScoreId(shared.id);
    const activeId = TmdStorage.getActiveScoreId();
    if (activeId) {
      const saved = shared ?? (await TmdStorage.getScore(activeId));
      if (saved) {
        initialContent = saved.content;
        initialScoreId = saved.id;
        initialIsTemplate = false;
        initialTemplateId = null;
      }
    }
  } catch (e) {
    console.warn("Could not restore active score from storage:", e);
  }

  editor = createTmdEditor(
    container,
    initialContent,
    handleEditorChange,
    (line, col) => {
      if (dom.sbCursor) {
        dom.sbCursor.textContent = `Ln ${line}, Col ${col}`;
      }
    },
    () => {
      toolsAndContextController?.handleFormatDocument();
    },
    (section, instrument) => {
      playerController?.playSectionOrTrack(section, instrument);
    }
  );

  const initialTheme = initTheme();
  editor.setTheme(initialTheme);
  if (dom.themeToggleIcon) {
    dom.themeToggleIcon.textContent = initialTheme === "light" ? "🌙" : "☀️";
  }

  initEvents();
  applyPanelsState({
    libraryDrawer: dom.libraryDrawer,
    aiDrawer: dom.aiDrawer,
    inspectorPanel: dom.inspectorPanel,
    problemsPanel: dom.problemsPanel,
    btnToggleProblems: dom.btnToggleProblems,
    virtualKeyboard: dom.virtualKeyboard,
    btnToggleKeyboard: dom.btnToggleKeyboard,
  });

  libraryController.setActiveScore(initialScoreId, initialIsTemplate, initialTemplateId);
  if (!dom.libraryDrawer.classList.contains("hidden")) {
    libraryController.refreshLibraryScores();
  }

  updateInspector(initialContent);
  updateProblems(initialContent);

  // Initialize Web MCP service
  try {
    initTmdWebMcp(window, {
      getCurrentScore: () => editor.getContent(),
      loadScoreToEditor: (text: string) => {
        editor.setContent(text);
        updateInspector(text);
      },
      startPlayback: () => {
        playerController?.startPlayback(editor.getContent());
      },
    });
  } catch (err) {
    console.warn("Failed to initialize Web MCP:", err);
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  init().catch((err) => console.error("Initialization failed:", err));
});
