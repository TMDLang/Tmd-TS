// web/src/ui/dom.ts
// Typed DOM element lookups to keep main.ts clean and maintainable

export function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    // Return a dummy/stub or cast to avoid crashing in headless test environments if unmounted
    return document.createElement("div") as unknown as T;
  }
  return el as T;
}

export function queryElement<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector(selector) as T | null;
}

export interface AppDOMElements {
  // Toolbar / Navigation
  btnToggleLibrary: HTMLButtonElement;
  libraryDrawer: HTMLElement;
  btnCloseLibrary: HTMLButtonElement;
  btnLibraryNew: HTMLButtonElement;
  btnBackupZip: HTMLButtonElement;
  inputImportTmd: HTMLInputElement;
  btnImportGist: HTMLButtonElement;
  importGistModal: HTMLDialogElement;
  inputGistUrl: HTMLInputElement;
  btnConfirmImportGist: HTMLButtonElement;
  libraryScoresList: HTMLElement;
  librarySamplesList: HTMLElement;
  libraryScoresCount: HTMLElement;
  btnOpenCanonModal?: HTMLButtonElement | null;
  canonGeneratorModal?: HTMLDialogElement | null;
  inputCanonTitle?: HTMLInputElement | null;
  selectCanonKey?: HTMLSelectElement | null;
  inputCanonTempo?: HTMLInputElement | null;
  selectCanonMode?: HTMLSelectElement | null;
  selectCanonType?: HTMLSelectElement | null;
  inputCanonVoices?: HTMLInputElement | null;
  inputCanonOffset?: HTMLInputElement | null;
  inputCanonVariations?: HTMLInputElement | null;
  selectCanonOutput?: HTMLSelectElement | null;
  btnConfirmGenerateCanon?: HTMLButtonElement | null;
  btnCloseCanonModal?: HTMLButtonElement | null;
  btnCancelCanonModal?: HTMLButtonElement | null;

  btnNewSong: HTMLButtonElement;
  btnPlay: HTMLButtonElement;
  exportDropdown: HTMLElement;
  btnExportMenu: HTMLButtonElement;
  btnLangToggle: HTMLButtonElement;
  btnThemeToggle: HTMLButtonElement;
  themeToggleIcon: HTMLElement;
  btnToggleAi: HTMLButtonElement;
  btnShare: HTMLButtonElement;

  // Export Buttons
  btnExportTmd: HTMLButtonElement;
  btnExportLibraryZip: HTMLButtonElement;
  btnExportMidi: HTMLButtonElement;
  btnExportReaper: HTMLButtonElement;
  btnExportMusicXML: HTMLButtonElement;
  btnExportLilyPond: HTMLButtonElement;
  btnExportABC: HTMLButtonElement;
  btnExportChordPro: HTMLButtonElement;
  btnExportBraille: HTMLButtonElement;
  btnPreviewBraille: HTMLButtonElement;
  btnExportVsq: HTMLButtonElement;
  btnExportVsqx: HTMLButtonElement;
  btnExportWAV: HTMLButtonElement;
  btnExportSkill: HTMLButtonElement;

  // Inspector
  inspectorPanel: HTMLElement;
  btnToggleInspector: HTMLButtonElement;
  btnCloseInspector: HTMLButtonElement;
  inspectorStatus: HTMLElement;
  statTitle: HTMLElement;
  statTempo: HTMLElement;
  statKey: HTMLElement;
  statMeter: HTMLElement;
  statDuration: HTMLElement;
  statMeasures: HTMLElement;
  statDensity: HTMLElement;
  statVocalRange: HTMLElement;
  statVocalSpan: HTMLElement;
  inspectorPitchInstSelect: HTMLSelectElement;
  inspectorVocalDetails: HTMLElement;
  inspectorHarmony: HTMLElement;
  inspectorModulations: HTMLElement;
  inspectorTonalityCard?: HTMLElement;
  inspectorTonalitySummary?: HTMLElement;
  inspectorTonalityViz?: HTMLElement;
  btnInspectorDownloadSvg?: HTMLButtonElement;
  btnInspectorOpenHtml?: HTMLButtonElement;
  inspectorOrders: HTMLElement;
  btnJumpOrders: HTMLButtonElement;
  inspectorTracks: HTMLElement;

  // TMD tablet input palette
  tmdPalette: HTMLElement;

  // Status Bar
  sbStatus: HTMLElement;
  sbSummary: HTMLElement;
  sbCursor: HTMLElement;

  // Help Modal
  helpModal: HTMLDialogElement;
  btnHelp: HTMLButtonElement;
  btnCloseHelp: HTMLButtonElement;
  btnDismissHelp: HTMLButtonElement;

  // AI Drawer
  aiDrawer: HTMLElement;
  btnCloseAiDrawer: HTMLButtonElement;
  btnOpenAiSettings: HTMLButtonElement;
  aiBtnDownload: HTMLButtonElement;
  aiBtnCopySkill: HTMLButtonElement;
  aiPromptInput: HTMLTextAreaElement;
  btnAiGenerate: HTMLButtonElement;
  btnAiStop: HTMLButtonElement;
  aiStatusText: HTMLElement;
  aiResultContainer: HTMLElement;
  aiResultOutput: HTMLElement;
  btnAiPreviewPlay: HTMLButtonElement;
  aiPreviewProblemsBadge: HTMLElement;
  aiPreviewProblemsList: HTMLElement;
  btnAiCopyCode: HTMLButtonElement;
  btnAiApplyReplace: HTMLButtonElement;
  btnAiApplyInsert: HTMLButtonElement;
  aiValidationBanner: HTMLElement;
  aiValidationMsg: HTMLElement;
  btnAiRetryRepair: HTMLButtonElement;

  // AI Settings Modal
  aiSettingsModal: HTMLDialogElement;
  btnCloseAiSettings: HTMLButtonElement;
  btnDismissAiSettings: HTMLButtonElement;
  btnSaveAiSettings: HTMLButtonElement;
  aiSettingsProvider: HTMLSelectElement;
  aiSettingsModelPreset: HTMLSelectElement;
  aiSettingsModelCustom: HTMLInputElement;
  aiSettingsKey: HTMLInputElement;
  aiKeyOfficialLink: HTMLAnchorElement;
  aiKeyAskAiLink: HTMLAnchorElement;
  aiSettingsBaseUrl: HTMLInputElement;
  aiSettingsBaseUrlGroup: HTMLElement;

  // Tools Menu
  toolsDropdown: HTMLElement;
  btnToolsMenu: HTMLButtonElement;
  toolFormatDocument: HTMLButtonElement;
  toolDoubleGrid: HTMLButtonElement;
  toolHalveGrid: HTMLButtonElement;
  toolOptimizeGrid: HTMLButtonElement;
  toolTranspose: HTMLButtonElement;
  toolDuplicateTrack: HTMLButtonElement;
  toolGenerateHarmony: HTMLButtonElement;
  toolInlineOrders: HTMLButtonElement;
  toolRenameInstrument: HTMLButtonElement;
  toolRenameSection: HTMLButtonElement;
  toolExtractInstrument: HTMLButtonElement;
  toolInsertSection: HTMLButtonElement;

  // Virtual Keyboard
  virtualKeyboard: HTMLElement;
  btnToggleKeyboard: HTMLButtonElement;
  virtualKeyboardKeys: HTMLElement;
  btnKeyboardModeAudition: HTMLButtonElement;
  btnKeyboardModeInsert: HTMLButtonElement;
  btnKeyboardOctaveDown: HTMLButtonElement;
  btnKeyboardOctaveUp: HTMLButtonElement;
  virtualKeyboardOctaveDisplay: HTMLElement;
  virtualKeyboardKeyBadge: HTMLElement;

  // Problems Panel
  problemsPanel: HTMLElement;
  btnToggleProblems: HTMLButtonElement;
  btnFixProblemsAi: HTMLButtonElement;
  problemsCountBadge: HTMLElement;
  problemsList: HTMLElement;

  // Refactor Modals
  refactorInstrumentModal: HTMLDialogElement;
  refactorOldInst: HTMLSelectElement;
  refactorNewInst: HTMLInputElement;
  btnConfirmRenameInst: HTMLButtonElement;

  refactorSectionModal: HTMLDialogElement;
  refactorOldSec: HTMLSelectElement;
  refactorNewSec: HTMLInputElement;
  btnConfirmRenameSec: HTMLButtonElement;

  refactorExtractModal: HTMLDialogElement;
  refactorExtractInst: HTMLSelectElement;
  btnConfirmExtract: HTMLButtonElement;

  refactorDuplicateModal: HTMLDialogElement;
  refactorDupSource: HTMLSelectElement;
  refactorDupTarget: HTMLInputElement;
  refactorDupOctave: HTMLSelectElement;
  refactorDupScopeGroup: HTMLElement;
  refactorDupScopeSection: HTMLInputElement;
  refactorDupScopeGlobal: HTMLInputElement;
  refactorDupScopeSectionLabel: HTMLElement;
  btnConfirmDuplicate: HTMLButtonElement;

  refactorHarmonyModal: HTMLDialogElement;
  refactorHarmSource: HTMLSelectElement;
  refactorHarmTarget: HTMLInputElement;
  refactorHarmInterval: HTMLSelectElement;
  refactorHarmScopeGroup: HTMLElement;
  refactorHarmScopeSection: HTMLInputElement;
  refactorHarmScopeGlobal: HTMLInputElement;
  refactorHarmScopeSectionLabel: HTMLElement;
  btnConfirmHarmony: HTMLButtonElement;

  refactorTransposeModal: HTMLDialogElement;
  refactorTransposeSemitones: HTMLSelectElement;
  refactorTransposeScopeGroup: HTMLElement;
  refactorTransposeSelectionOnly: HTMLInputElement;
  refactorTransposeUpdateKeyGroup: HTMLElement;
  refactorTransposeUpdateKey: HTMLInputElement;
  btnConfirmTranspose: HTMLButtonElement;

  // Insert Section Modal
  insertSectionModal: HTMLDialogElement;
  insertSecName: HTMLInputElement;
  insertSecInst: HTMLInputElement;
  insertSecTemplate: HTMLSelectElement;
  insertSecMeasures: HTMLSelectElement;
  btnConfirmInsertSec: HTMLButtonElement;

  // Context Menu
  editorContextMenu: HTMLElement;
  ctxHeaderInfo: HTMLElement;
  ctxFormat: HTMLButtonElement;
  ctxFormatLabel: HTMLElement;
  ctxComment: HTMLButtonElement;
  ctxTranspose: HTMLButtonElement;
  ctxTransposeLabel: HTMLElement;
  ctxInsertSection: HTMLButtonElement;
  ctxDoubleGrid: HTMLButtonElement;
  ctxHalveGrid: HTMLButtonElement;
  ctxOptimizeGrid: HTMLButtonElement;
  ctxDuplicateTrack: HTMLButtonElement;
  ctxGenerateHarmony: HTMLButtonElement;
  ctxExtractInstrument: HTMLButtonElement;
  ctxRenameInstrument: HTMLButtonElement;
  ctxRenameSection: HTMLButtonElement;
  ctxHumRecording: HTMLButtonElement;

  // Hum to TMD Modal
  toolHumRecording: HTMLButtonElement;
  humModal: HTMLDialogElement;
  humBtnRecord: HTMLButtonElement;
  humRecordIcon: HTMLElement;
  humRecordText: HTMLElement;
  humStatusIndicator: HTMLElement;
  humSectionName: HTMLInputElement;
  humInstrument: HTMLInputElement;
  humKey: HTMLSelectElement;
  humBpm: HTMLInputElement;
  humGrid: HTMLSelectElement;
  humSnapScale: HTMLInputElement;
  humEnableMetronome: HTMLInputElement;
  humEnableCountIn: HTMLInputElement;
  humResultCode: HTMLTextAreaElement;
  humBtnPlayPreview: HTMLButtonElement;
  humBtnApply: HTMLButtonElement;

  // Music Braille Preview Modal
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

  // Player Bar
  tmdPlayerBar: HTMLElement;
  playerTitle: HTMLElement;
  playerTime: HTMLElement;
  playerProgress: HTMLInputElement;
  synthSelect: HTMLSelectElement;
  playerBtnPause: HTMLButtonElement;
  playerBtnClose: HTMLButtonElement;
}

export function initAppDOMElements(): AppDOMElements {
  return {
    btnToggleLibrary: getElement("btn-toggle-library"),
    libraryDrawer: getElement("library-drawer"),
    btnCloseLibrary: getElement("btn-close-library"),
    btnLibraryNew: getElement("btn-library-new"),
    btnBackupZip: getElement("btn-backup-zip"),
    inputImportTmd: getElement("input-import-tmd"),
    btnImportGist: getElement("btn-import-gist"),
    importGistModal: getElement("import-gist-modal"),
    inputGistUrl: getElement("input-gist-url"),
    btnConfirmImportGist: getElement("btn-confirm-import-gist"),
    libraryScoresList: getElement("library-scores-list"),
    librarySamplesList: getElement("library-samples-list"),
    libraryScoresCount: getElement("library-scores-count"),
    btnOpenCanonModal: getElement<HTMLButtonElement>("btn-open-canon-modal"),
    canonGeneratorModal: getElement<HTMLDialogElement>("canon-generator-modal"),
    inputCanonTitle: getElement<HTMLInputElement>("canon-param-title"),
    selectCanonKey: getElement<HTMLSelectElement>("canon-param-key"),
    inputCanonTempo: getElement<HTMLInputElement>("canon-param-tempo"),
    selectCanonMode: getElement<HTMLSelectElement>("canon-param-mode"),
    selectCanonType: getElement<HTMLSelectElement>("canon-param-type"),
    inputCanonVoices: getElement<HTMLInputElement>("canon-param-voices"),
    inputCanonOffset: getElement<HTMLInputElement>("canon-param-offset"),
    inputCanonVariations: getElement<HTMLInputElement>("canon-param-variations"),
    selectCanonOutput: getElement<HTMLSelectElement>("canon-param-output"),
    btnConfirmGenerateCanon: getElement<HTMLButtonElement>("btn-confirm-generate-canon"),
    btnCloseCanonModal: getElement<HTMLButtonElement>("btn-close-canon-modal"),
    btnCancelCanonModal: getElement<HTMLButtonElement>("btn-cancel-canon-modal"),

    btnNewSong: getElement("btn-new-song"),
    btnPlay: getElement("btn-play"),
    exportDropdown: getElement("export-dropdown"),
    btnExportMenu: getElement("btn-export-menu"),
    btnLangToggle: getElement("btn-lang-toggle"),
    btnThemeToggle: getElement("btn-theme-toggle"),
    themeToggleIcon: getElement("theme-toggle-icon"),
    btnToggleAi: getElement("btn-toggle-ai"),
    btnShare: getElement("btn-share"),

    btnExportTmd: getElement("export-tmd"),
    btnExportLibraryZip: getElement("export-library-zip"),
    btnExportMidi: getElement("export-midi"),
    btnExportReaper: getElement("export-reaper"),
    btnExportMusicXML: getElement("export-musicxml"),
    btnExportLilyPond: getElement("export-lilypond"),
    btnExportABC: getElement("export-abc"),
    btnExportChordPro: getElement("export-chordpro"),
    btnExportBraille: getElement("export-braille"),
    btnPreviewBraille: getElement("preview-braille"),
    btnExportVsq: getElement("export-vsq"),
    btnExportVsqx: getElement("export-vsqx"),
    btnExportWAV: getElement("export-wav"),
    btnExportSkill: getElement("export-skill"),

    inspectorPanel: getElement("inspector-panel"),
    btnToggleInspector: getElement("btn-toggle-inspector"),
    btnCloseInspector: getElement("btn-close-inspector"),
    inspectorStatus: getElement("inspector-status"),
    statTitle: getElement("stat-title"),
    statTempo: getElement("stat-tempo"),
    statKey: getElement("stat-key"),
    statMeter: getElement("stat-meter"),
    statDuration: getElement("stat-duration"),
    statMeasures: getElement("stat-measures"),
    statDensity: getElement("stat-density"),
    statVocalRange: getElement("stat-vocal-range"),
    statVocalSpan: getElement("stat-vocal-span"),
    inspectorPitchInstSelect: getElement("inspector-pitch-inst-select"),
    inspectorVocalDetails: getElement("inspector-vocal-details"),
    inspectorHarmony: getElement("inspector-harmony"),
    inspectorModulations: getElement("inspector-modulations"),
    inspectorTonalityCard: getElement("inspector-tonality-card"),
    inspectorTonalitySummary: getElement("inspector-tonality-summary"),
    inspectorTonalityViz: getElement("inspector-tonality-viz"),
    btnInspectorDownloadSvg: getElement<HTMLButtonElement>("btn-inspector-download-svg"),
    btnInspectorOpenHtml: getElement<HTMLButtonElement>("btn-inspector-open-html"),
    inspectorOrders: getElement("inspector-orders"),
    btnJumpOrders: getElement("btn-jump-orders"),
    inspectorTracks: getElement("inspector-tracks"),

    tmdPalette: getElement("tmd-palette"),

    sbStatus: getElement("sb-status"),
    sbSummary: getElement("sb-summary"),
    sbCursor: getElement("sb-cursor"),

    helpModal: getElement("help-modal"),
    btnHelp: getElement("btn-help"),
    btnCloseHelp: getElement("btn-close-help"),
    btnDismissHelp: getElement("btn-dismiss-help"),

    aiDrawer: getElement("ai-drawer"),
    btnCloseAiDrawer: getElement("btn-close-ai-drawer"),
    btnOpenAiSettings: getElement("btn-open-ai-settings"),
    aiBtnDownload: getElement("ai-btn-download"),
    aiBtnCopySkill: getElement("ai-btn-copy-skill"),
    aiPromptInput: getElement("ai-prompt-input"),
    btnAiGenerate: getElement("btn-ai-generate"),
    btnAiStop: getElement("btn-ai-stop"),
    aiStatusText: getElement("ai-status-text"),
    aiResultContainer: getElement("ai-result-container"),
    aiResultOutput: getElement("ai-result-output"),
    btnAiPreviewPlay: getElement("btn-ai-preview-play"),
    aiPreviewProblemsBadge: getElement("ai-preview-problems-badge"),
    aiPreviewProblemsList: getElement("ai-preview-problems-list"),
    btnAiCopyCode: getElement("btn-ai-copy-code"),
    btnAiApplyReplace: getElement("btn-ai-apply-replace"),
    btnAiApplyInsert: getElement("btn-ai-apply-insert"),
    aiValidationBanner: getElement("ai-validation-banner"),
    aiValidationMsg: getElement("ai-validation-msg"),
    btnAiRetryRepair: getElement("btn-ai-retry-repair"),

    aiSettingsModal: getElement("ai-settings-modal"),
    btnCloseAiSettings: getElement("btn-close-ai-settings"),
    btnDismissAiSettings: getElement("btn-dismiss-ai-settings"),
    btnSaveAiSettings: getElement("btn-save-ai-settings"),
    aiSettingsProvider: getElement("ai-settings-provider"),
    aiSettingsModelPreset: getElement("ai-settings-model-preset"),
    aiSettingsModelCustom: getElement("ai-settings-model-custom"),
    aiSettingsKey: getElement("ai-settings-key"),
    aiKeyOfficialLink: getElement("ai-key-official-link"),
    aiKeyAskAiLink: getElement("ai-key-ask-ai-link"),
    aiSettingsBaseUrl: getElement("ai-settings-baseurl"),
    aiSettingsBaseUrlGroup: getElement("ai-settings-baseurl-group"),

    toolsDropdown: getElement("tools-dropdown"),
    btnToolsMenu: getElement("btn-tools-menu"),
    toolFormatDocument: getElement("tool-format-document"),
    toolDoubleGrid: getElement("tool-double-grid"),
    toolHalveGrid: getElement("tool-halve-grid"),
    toolOptimizeGrid: getElement("tool-optimize-grid"),
    toolTranspose: getElement("tool-transpose"),
    toolDuplicateTrack: getElement("tool-duplicate-track"),
    toolGenerateHarmony: getElement("tool-generate-harmony"),
    toolInlineOrders: getElement("tool-inline-orders"),
    toolRenameInstrument: getElement("tool-rename-instrument"),
    toolRenameSection: getElement("tool-rename-section"),
    toolExtractInstrument: getElement("tool-extract-instrument"),
    toolInsertSection: getElement("tool-insert-section"),

    virtualKeyboard: getElement("virtual-keyboard"),
    btnToggleKeyboard: getElement("btn-toggle-keyboard"),
    virtualKeyboardKeys: getElement("virtual-keyboard-keys"),
    btnKeyboardModeAudition: getElement("btn-keyboard-mode-audition"),
    btnKeyboardModeInsert: getElement("btn-keyboard-mode-insert"),
    btnKeyboardOctaveDown: getElement("btn-keyboard-octave-down"),
    btnKeyboardOctaveUp: getElement("btn-keyboard-octave-up"),
    virtualKeyboardOctaveDisplay: getElement("virtual-keyboard-octave-display"),
    virtualKeyboardKeyBadge: getElement("virtual-keyboard-key-badge"),

    problemsPanel: getElement("problems-panel"),
    btnToggleProblems: getElement("btn-toggle-problems"),
    btnFixProblemsAi: getElement("btn-fix-problems-ai"),
    problemsCountBadge: getElement("problems-count-badge"),
    problemsList: getElement("problems-list"),

    refactorInstrumentModal: getElement("refactor-instrument-modal"),
    refactorOldInst: getElement("refactor-old-inst"),
    refactorNewInst: getElement("refactor-new-inst"),
    btnConfirmRenameInst: getElement("btn-confirm-rename-inst"),

    refactorSectionModal: getElement("refactor-section-modal"),
    refactorOldSec: getElement("refactor-old-sec"),
    refactorNewSec: getElement("refactor-new-sec"),
    btnConfirmRenameSec: getElement("btn-confirm-rename-sec"),

    refactorExtractModal: getElement("refactor-extract-modal"),
    refactorExtractInst: getElement("refactor-extract-inst"),
    btnConfirmExtract: getElement("btn-confirm-extract"),

    refactorDuplicateModal: getElement("refactor-duplicate-modal"),
    refactorDupSource: getElement("refactor-dup-source"),
    refactorDupTarget: getElement("refactor-dup-target"),
    refactorDupOctave: getElement("refactor-dup-octave"),
    refactorDupScopeGroup: getElement("refactor-dup-scope-group"),
    refactorDupScopeSection: getElement("refactor-dup-scope-section"),
    refactorDupScopeGlobal: getElement("refactor-dup-scope-global"),
    refactorDupScopeSectionLabel: getElement("refactor-dup-scope-section-label"),
    btnConfirmDuplicate: getElement("btn-confirm-duplicate"),

    refactorHarmonyModal: getElement("refactor-harmony-modal"),
    refactorHarmSource: getElement("refactor-harm-source"),
    refactorHarmTarget: getElement("refactor-harm-target"),
    refactorHarmInterval: getElement("refactor-harm-interval"),
    refactorHarmScopeGroup: getElement("refactor-harm-scope-group"),
    refactorHarmScopeSection: getElement("refactor-harm-scope-section"),
    refactorHarmScopeGlobal: getElement("refactor-harm-scope-global"),
    refactorHarmScopeSectionLabel: getElement("refactor-harm-scope-section-label"),
    btnConfirmHarmony: getElement("btn-confirm-harmony"),

    refactorTransposeModal: getElement("refactor-transpose-modal"),
    refactorTransposeSemitones: getElement("refactor-transpose-semitones"),
    refactorTransposeScopeGroup: getElement("refactor-transpose-scope-group"),
    refactorTransposeSelectionOnly: getElement("refactor-transpose-selection-only"),
    refactorTransposeUpdateKeyGroup: getElement("refactor-transpose-updatekey-group"),
    refactorTransposeUpdateKey: getElement("refactor-transpose-update-key"),
    btnConfirmTranspose: getElement("btn-confirm-transpose"),

    insertSectionModal: getElement("insert-section-modal"),
    insertSecName: getElement("insert-sec-name"),
    insertSecInst: getElement("insert-sec-inst"),
    insertSecTemplate: getElement("insert-sec-template"),
    insertSecMeasures: getElement("insert-sec-measures"),
    btnConfirmInsertSec: getElement("btn-confirm-insert-sec"),

    editorContextMenu: getElement("editor-context-menu"),
    ctxHeaderInfo: getElement("ctx-header-info"),
    ctxFormat: getElement("ctx-format"),
    ctxFormatLabel: getElement("ctx-format-label"),
    ctxComment: getElement("ctx-comment"),
    ctxTranspose: getElement("ctx-transpose"),
    ctxTransposeLabel: getElement("ctx-transpose-label"),
    ctxInsertSection: getElement("ctx-insert-section"),
    ctxDoubleGrid: getElement("ctx-double-grid"),
    ctxHalveGrid: getElement("ctx-halve-grid"),
    ctxOptimizeGrid: getElement("ctx-optimize-grid"),
    ctxDuplicateTrack: getElement("ctx-duplicate-track"),
    ctxGenerateHarmony: getElement("ctx-generate-harmony"),
    ctxExtractInstrument: getElement("ctx-extract-instrument"),
    ctxRenameInstrument: getElement("ctx-rename-instrument"),
    ctxRenameSection: getElement("ctx-rename-section"),
    ctxHumRecording: getElement("ctx-hum-recording"),

    toolHumRecording: getElement("tool-hum-recording"),
    humModal: getElement("hum-modal"),
    humBtnRecord: getElement("hum-btn-record"),
    humRecordIcon: getElement("hum-record-icon"),
    humRecordText: getElement("hum-record-text"),
    humStatusIndicator: getElement("hum-status-indicator"),
    humSectionName: getElement("hum-section-name"),
    humInstrument: getElement("hum-instrument"),
    humKey: getElement("hum-key"),
    humBpm: getElement("hum-bpm"),
    humGrid: getElement("hum-grid"),
    humSnapScale: getElement("hum-snap-scale"),
    humEnableMetronome: getElement("hum-enable-metronome"),
    humEnableCountIn: getElement("hum-enable-countin"),
    humResultCode: getElement("hum-result-code"),
    humBtnPlayPreview: getElement("hum-btn-play-preview"),
    humBtnApply: getElement("hum-btn-apply"),

    braillePreviewModal: getElement("braille-preview-modal"),
    btnCloseBrailleModal: getElement("btn-close-braille-modal"),
    btnDismissBrailleModal: getElement("btn-dismiss-braille-modal"),
    brailleSelectLayout: getElement("braille-select-layout"),
    brailleSelectEncoding: getElement("braille-select-encoding"),
    brailleSelectInstrument: getElement("braille-select-instrument"),
    brailleOutputTextarea: getElement("braille-output-textarea"),
    brailleSightedContainer: getElement("braille-sighted-container"),
    btnBrailleCopy: getElement("btn-braille-copy"),
    btnBrailleCopyText: getElement("btn-braille-copy-text"),
    btnBrailleDownloadBrl: getElement("btn-braille-download-brl"),
    btnBrailleDownloadBrf: getElement("btn-braille-download-brf"),

    tmdPlayerBar: getElement("tmd-player-bar"),
    playerTitle: getElement("player-title"),
    playerTime: getElement("player-time"),
    playerProgress: getElement("player-progress"),
    synthSelect: getElement("synth-select"),
    playerBtnPause: getElement("player-btn-pause"),
    playerBtnClose: getElement("player-btn-close"),
  };
}
