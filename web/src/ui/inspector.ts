import { TMDSongInspector, TMDSongProfile } from "../../../src/analysis/inspector.js";
import { SheetInstrumentHelper } from "../../../src/core/instruments.js";
import { TMDOutlineGenerator } from "../../../src/presentation/outline.js";
import { TMDTonalityVisualizer } from "../../../src/presentation/tonality_visualizer.js";
import { TmdParser } from "../../../src/syntax/parser.js";
import { accidentalToSemitone, DEFAULT_INSTRUMENT,scaleDegreeLetter, Sheet } from "../../../src/syntax/types.js";
import { escapeHtml } from "../html.js";
import { getCurrentLocale,t } from "../i18n.js";
import { renderTonalityProfileHtml } from "./tonality.js";

export interface InspectorElements {
  inspectorStatus: HTMLElement;
  statTitle: HTMLElement;
  statTempo: HTMLElement;
  statKey: HTMLElement;
  statMeter: HTMLElement;
  statDuration?: HTMLElement;
  statMeasures?: HTMLElement;
  statDensity?: HTMLElement;
  statVocalRange?: HTMLElement;
  statVocalSpan?: HTMLElement;
  inspectorPitchInstSelect?: HTMLSelectElement;
  inspectorVocalDetails?: HTMLElement;
  inspectorHarmony?: HTMLElement;
  inspectorModulations?: HTMLElement;
  inspectorTonalityCard?: HTMLElement;
  inspectorTonalitySummary?: HTMLElement;
  inspectorTonalityViz?: HTMLElement;
  btnInspectorDownloadSvg?: HTMLButtonElement;
  btnInspectorOpenHtml?: HTMLButtonElement;
  inspectorOrders: HTMLElement;
  inspectorTracks: HTMLElement;
  sbStatus: HTMLElement;
  sbSummary: HTMLElement;
  selectedPitchInstrument?: string;
  onSelectPitchInstrument?: (instrument: string) => void;
}

export function renderInspectorView(
  text: string,
  elements: InspectorElements,
  parseSheet: (text: string) => Sheet | null
): Sheet | null {
  const {
    inspectorStatus,
    statTitle,
    statTempo,
    statKey,
    statMeter,
    statDuration,
    statMeasures,
    statDensity,
    statVocalRange,
    statVocalSpan,
    inspectorPitchInstSelect,
    inspectorVocalDetails,
    inspectorHarmony,
    inspectorModulations,
    inspectorTonalityCard,
    inspectorTonalitySummary,
    inspectorTonalityViz,
    btnInspectorDownloadSvg,
    btnInspectorOpenHtml,
    inspectorOrders,
    inspectorTracks,
    sbStatus,
    sbSummary,
  } = elements;

  let currentSheet: Sheet | null = null;
  try {
    currentSheet = parseSheet(text);
  } catch (err: any) {
    inspectorStatus.className = "status-badge error";
    inspectorStatus.textContent = `${t("statusError")}: ${err.message || ""}`;
    sbStatus.textContent = "Syntax Error";
    sbSummary.textContent = err.message || "";
    return null;
  }

  if (!currentSheet) {
    inspectorStatus.className = "status-badge error";
    inspectorStatus.textContent = t("missingScoreHeader");
    sbStatus.textContent = "Invalid TMD";
    sbSummary.textContent = "Missing ::SCORE:: root header";
    return null;
  }

  inspectorStatus.className = "status-badge success";
  inspectorStatus.textContent = t("statusValid");

  // Metadata
  statTitle.textContent = currentSheet.name || t("defaultTitle");
  statTempo.textContent = currentSheet.speed ? `${currentSheet.speed}` : t("defaultTempo");

  if (currentSheet.keySignature) {
    const letter = scaleDegreeLetter(currentSheet.keySignature.tonic);
    const semitone = accidentalToSemitone(currentSheet.keySignature.accidental);
    const acc = semitone === 1 ? "#" : semitone === -1 ? "b" : "";
    statKey.textContent = `${letter}${acc}`;
  } else {
    statKey.textContent = "C";
  }

  statMeter.textContent = currentSheet.beat ? `${currentSheet.beat.count}/${currentSheet.beat.noteValue}` : "4/4";

  // Song Inspector Analysis
  try {
    let currentInst = elements.selectedPitchInstrument;
    const profile = TMDSongInspector.inspect(currentSheet, currentInst);

    // Track list for pitch analysis from expanded instrument ranges
    const distinctInsts = profile.instrumentRanges.map((r) => r.assignment);
    if (!currentInst || !distinctInsts.includes(currentInst)) {
      currentInst = profile.vocalRange?.assignment
        || distinctInsts.find((inst) => /^(main_?vocal|lead_?vocal|vocal|voice|主唱|人聲|歌|vo)$/i.test(inst))
        || distinctInsts.find((inst) => /vocal|voice|miku|utau|teto|sing|melody|lead|主旋律/i.test(inst) && !/backing|harm|choir|guitar|synth|pad|bass|drum|beat/i.test(inst))
        || distinctInsts[0];
    }

    if (inspectorPitchInstSelect) {
      inspectorPitchInstSelect.innerHTML = distinctInsts
        .map((inst) => {
          const displayLabel = inst === "Pattern" ? (t("trackPattern") || "Pattern") : inst;
          return `<option value="${escapeHtml(inst)}"${inst === currentInst ? " selected" : ""}>${escapeHtml(displayLabel)}</option>`;
        })
        .join("");
      if (currentInst) {
        inspectorPitchInstSelect.value = currentInst;
      }
    }

    if (statDuration) {
      const totalSec = profile.timing.totalDurationSeconds;
      const mins = Math.floor(totalSec / 60);
      const secs = Math.floor(totalSec % 60);
      statDuration.textContent = `${mins}:${secs.toString().padStart(2, "0")} (${totalSec.toFixed(1)}s)`;
    }

    if (statMeasures) {
      statMeasures.textContent = `${profile.timing.totalMeasures}`;
    }

    if (statDensity) {
      const secCount = profile.density.sectionDensities.length;
      const avg = secCount > 0 ? (profile.density.sectionDensities.reduce((acc, s) => acc + s.trackCount, 0) / secCount) : 0;
      statDensity.textContent = `${profile.density.maxConcurrentTracks} tracks${avg > 0 ? ` (avg ${avg.toFixed(1)})` : ""}`;
    }

    // Pitch Profile (for the chosen instrument)
    if (profile.vocalRange) {
      const v = profile.vocalRange;
      if (statVocalRange) {
        statVocalRange.textContent = `${v.lowestNote.noteName} ～ ${v.highestNote.noteName}`;
        statVocalRange.title = `MIDI: ${v.lowestNote.midiPitch} – ${v.highestNote.midiPitch}`;
      }

      // Map difficulty to localized string
      const diffKey = v.difficulty === "easy"
        ? "difficultyEasy"
        : v.difficulty === "moderate"
        ? "difficultyModerate"
        : v.difficulty === "challenging"
        ? "difficultyChallenging"
        : "difficultyDifficult";
      const diffLabel = t(diffKey as any) || v.difficulty;

      if (statVocalSpan) {
        const octaves = (v.spanSemitones / 12).toFixed(1);
        const spanTmpl = t("vocalSpanFormat") || "{semitones} semitones ({octaves} octaves)";
        const spanFormatted = spanTmpl
          .replace("{semitones}", String(v.spanSemitones))
          .replace("{octaves}", octaves);
        statVocalSpan.textContent = `${spanFormatted} · ${diffLabel}`;
      }

      if (inspectorVocalDetails) {
        const detailTmpl = t("vocalDetailFormat") || "Track: {instrument} · Lowest in [{lowestSection}] · Highest in [{highestSection}]";
        const detailText = detailTmpl
        .replace("{instrument}", v.assignment)
          .replace("{lowestSection}", v.lowestNote.sectionName)
          .replace("{highestSection}", v.highestNote.sectionName);

        const voiceTypeMap: Record<string, string> = {
          soprano: t("voiceTypeSoprano") || "Soprano",
          "mezzo-soprano": t("voiceTypeMezzoSoprano") || "Mezzo-Soprano",
          contralto: t("voiceTypeContralto") || "Contralto",
          tenor: t("voiceTypeTenor") || "Tenor",
          baritone: t("voiceTypeBaritone") || "Baritone",
          bass: t("voiceTypeBass") || "Bass",
        };

        const voiceNames = v.suitableVoiceTypes.map((vt) => voiceTypeMap[vt] || vt);
        const voiceStr = voiceNames.length > 0 ? voiceNames.join(", ") : "-";
        const evalTmpl = t("vocalEvaluationFormat") || "Difficulty: {difficulty} · Recommended for: {voiceTypes}";
        const evalText = evalTmpl
          .replace("{difficulty}", diffLabel)
          .replace("{voiceTypes}", voiceStr);

        inspectorVocalDetails.innerHTML = `${escapeHtml(detailText)}<br><span style="color: var(--accent-blue); font-weight: 500;">${escapeHtml(evalText)}</span>`;
      }
    } else {
      if (statVocalRange) {
        statVocalRange.textContent = "-";
        statVocalRange.title = "";
      }
      if (statVocalSpan) statVocalSpan.textContent = "-";
      if (inspectorVocalDetails) {
        inspectorVocalDetails.textContent = t("noVocalTrack") || "No notes found on track";
      }
    }

    // Harmony & Chords
    if (inspectorHarmony) {
      if (profile.harmony.distinctChords.length > 0) {
        inspectorHarmony.innerHTML = profile.harmony.distinctChords
          .map((ch: string) => `<button type="button" class="order-tag harmony-search-tag" data-search-text="${escapeHtml(ch)}" title="${escapeHtml(t("tonalityFindChord", { chord: ch }))}">${escapeHtml(ch)}</button>`)
          .join(" ");
      } else {
        inspectorHarmony.innerHTML = `<span class="stat-label">${escapeHtml(t("noChords") || "None")}</span>`;
      }
    }

    // Modulations
    if (inspectorModulations) {
      if (profile.harmony.modulations.length > 0) {
        inspectorModulations.innerHTML = profile.harmony.modulations
          .map((mod: string) => `<span class="order-tag order-tag-directive">${escapeHtml(mod)}</span>`)
          .join(" ");
      } else {
        inspectorModulations.innerHTML = `<span class="stat-label">${escapeHtml(t("noModulations") || "No modulations")}</span>`;
      }
    }

    // Tonality & Visualizer
    if (inspectorTonalityViz) {
      if (profile.tonality) {
        const locale = getCurrentLocale() === "zh-TW" ? "zh-Hant" : "en";
        inspectorTonalityViz.innerHTML = renderTonalityProfileHtml(profile.tonality, locale, profile.timing.sections);
        if (inspectorTonalitySummary) inspectorTonalitySummary.innerHTML = "";
        if (inspectorTonalityCard) {
          inspectorTonalityCard.style.display = "";
        }
      } else {
        inspectorTonalityViz.innerHTML = `<div style="padding: 12px; color: var(--text-secondary); font-size: 11px; text-align: center;">${escapeHtml(t("tonalityNoData") || "No tonality data")}</div>`;
        if (inspectorTonalitySummary) inspectorTonalitySummary.innerHTML = "";
      }
    }
  } catch (inspectErr) {
    console.warn("Inspector analysis error:", inspectErr);
  }

  // Tracks & Orders / Outline Hierarchy
  const outlineNodes = TMDOutlineGenerator.generate(text);
  const ordersNode = outlineNodes.find((n) => n.name === "Orders");

  // Orders
  if (currentSheet.playback.length > 0) {
    inspectorOrders.innerHTML = currentSheet.playback
      .map((ord, idx) => {
        let orderLabel = "";
        let opName = "";
        let macroDetail = "";
        if (ord.type === "name") {
          orderLabel = ord.name;
        } else if (ord.type === "relative" || ord.type === "absolute") {
          orderLabel = `{${ord.value}}`;
        } else if (ord.type === "macro") {
          opName = Array.isArray(ord.expr) && ord.expr.length > 0 && typeof ord.expr[0] === "string"
            ? ord.expr[0]
            : "macro";
          orderLabel = `(${opName})`;
          macroDetail = ord.expr.map(e => (Array.isArray(e) ? `(${e.join(" ")})` : String(e))).join(" ");
        }

        const playTitle = (t("playOrderTitle") || "Play from here ({order})").replace("{order}", orderLabel);
        const playBtnHtml = `<button type="button" class="order-play-btn" data-play-order-index="${idx}" title="${escapeHtml(playTitle)}">▶</button>`;

        const childNode = ordersNode?.children?.[idx];
        let rangeAttrs = "";
        if (childNode) {
          rangeAttrs = `data-start-line="${childNode.range.startLine}" data-start-col="${childNode.range.startColumn}" data-end-line="${childNode.range.endLine}" data-end-col="${childNode.range.endColumn}"`;
        } else if (ord.type === "macro" && typeof ord.line === "number" && typeof ord.column === "number") {
          rangeAttrs = `data-start-line="${ord.line}" data-start-col="${ord.column}" data-end-line="${ord.line}" data-end-col="${ord.column}"`;
        } else if (ordersNode) {
          rangeAttrs = `data-start-line="${ordersNode.range.startLine}" data-start-col="${ordersNode.range.startColumn}" data-end-line="${ordersNode.range.endLine}" data-end-col="${ordersNode.range.endColumn}"`;
        }

        const jumpTitle = t("jumpToOrdersTitle") || "Jump to editor to modify playback order";

        if (ord.type === "name") {
          return `<span class="order-tag" ${rangeAttrs}><span class="order-tag-text" title="${escapeHtml(jumpTitle)}">${escapeHtml(ord.name)}</span>${playBtnHtml}</span>`;
        } else if (ord.type === "relative") {
          return `<span class="order-tag order-tag-directive" ${rangeAttrs} style="color: var(--accent-purple); border-color: rgba(188, 140, 255, 0.3);"><span class="order-tag-text" title="${escapeHtml(jumpTitle)}">{${escapeHtml(ord.value)}}</span>${playBtnHtml}</span>`;
        } else if (ord.type === "absolute") {
          return `<span class="order-tag order-tag-directive" ${rangeAttrs} style="color: var(--accent-yellow); border-color: rgba(210, 153, 34, 0.3);"><span class="order-tag-text" title="${escapeHtml(jumpTitle)}">{${escapeHtml(ord.value)}}</span>${playBtnHtml}</span>`;
        } else if (ord.type === "macro") {
          const tooltip = macroDetail ? `${opName}: ${macroDetail}` : jumpTitle;
          return `<span class="order-tag order-tag-macro" ${rangeAttrs} style="color: var(--accent-blue); border-color: rgba(88, 166, 255, 0.35);"><span class="order-tag-text" title="${escapeHtml(tooltip)}">(${escapeHtml(opName)})</span>${playBtnHtml}</span>`;
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  } else {
    inspectorOrders.innerHTML = `
      <span class="stat-label">${t("noOrders")}</span>
      <button type="button" class="btn btn-sm btn-jump-orders" data-i18n-title="jumpToOrdersTitle" title="${escapeHtml(t("jumpToOrdersTitle") || "Jump to editor to modify playback order")}" style="font-size: 11px; padding: 1px 6px; margin-left: 6px;">
        <span>✏️</span> <span>${escapeHtml(t("jumpToOrders") || "Edit Order")}</span>
      </button>
    `;
  }

  // Tracks / Outline Hierarchy (Sections -> Tracks -> Measures)
  const sectionsNode = outlineNodes.find((n) => n.name === "Sections");

  if (sectionsNode && sectionsNode.children && sectionsNode.children.length > 0) {
    inspectorTracks.innerHTML = `
      <div class="outline-tree">
        ${sectionsNode.children
          .map((secNode) => {
            const secRangeAttrs = `data-start-line="${secNode.range.startLine}" data-start-col="${secNode.range.startColumn}" data-end-line="${secNode.range.endLine}" data-end-col="${secNode.range.endColumn}"`;
            const trackChildren = secNode.children || [];
            const secPlayTitle = (t("playSectionTitle") || "Play section: {section}").replace("{section}", secNode.name);

            const tracksHtml = trackChildren
              .map((trkNode) => {
                const trkRangeAttrs = `data-start-line="${trkNode.range.startLine}" data-start-col="${trkNode.range.startColumn}" data-end-line="${trkNode.range.endLine}" data-end-col="${trkNode.range.endColumn}"`;
                const displayTrackName = trkNode.name === "Pattern" ? (t("trackPattern") || "Pattern") : trkNode.name;
                const trkPlayTitle = (t("playTrackTitle") || "Play track: {section} ({instrument})")
                  .replace("{section}", secNode.name)
                  .replace("{instrument}", displayTrackName);

                return `
                  <div class="track-item outline-track-item" ${trkRangeAttrs} title="L${trkNode.range.startLine}:C${trkNode.range.startColumn}">
                    <span class="track-name">${escapeHtml(displayTrackName)}</span>
                    <span class="outline-item-right">
                      ${trkNode.detail ? `<span class="track-meta">${escapeHtml(trkNode.detail)}</span>` : ""}
                      <button type="button" class="outline-play-btn" data-play-section="${escapeHtml(secNode.name)}" data-play-instrument="${escapeHtml(trkNode.name)}" title="${escapeHtml(trkPlayTitle)}">▶</button>
                    </span>
                  </div>
                `;
              })
              .join("");

            return `
              <details class="outline-section-node" open>
                <summary class="outline-section-summary" ${secRangeAttrs} title="L${secNode.range.startLine}:C${secNode.range.startColumn}">
                  <span class="outline-node-title">
                    <span class="outline-chevron">▶</span>
                    <span>${escapeHtml(secNode.name)}</span>
                  </span>
                  <span class="outline-summary-right">
                    <span class="outline-badge">${trackChildren.length} track${trackChildren.length === 1 ? "" : "s"}</span>
                    <button type="button" class="outline-play-btn" data-play-section="${escapeHtml(secNode.name)}" title="${escapeHtml(secPlayTitle)}">▶</button>
                  </span>
                </summary>
                <div class="outline-tracks-container">
                  ${tracksHtml}
                </div>
              </details>
            `;
          })
          .join("")}
      </div>
    `;
  } else if (currentSheet.entries.length > 0) {
    // Fallback if AST has paragraphs but outline nodes failed
    inspectorTracks.innerHTML = currentSheet.entries
      .map((p) => {
        const offset = p.start ? (p.start > 0 ? `+${p.start}` : `${p.start}`) : "0";
        const totalUnits = p.sections.reduce((acc, s) => acc + s.unitGroups.reduce((uAcc, g) => uAcc + g.units.length, 0), 0);
        const lineAttr = p.line ? `data-start-line="${p.line}" data-start-col="1" data-end-line="${p.line}" data-end-col="1"` : "";
        const instLabel = p.assignment || DEFAULT_INSTRUMENT;
        const trkPlayTitle = (t("playTrackTitle") || "Play track: {section} ({instrument})")
          .replace("{section}", p.name)
          .replace("{instrument}", instLabel);

        return `
          <div class="track-item" ${lineAttr}>
            <span class="track-name">${escapeHtml(p.name)}:${escapeHtml(instLabel)}</span>
            <span class="outline-item-right">
              <span class="track-meta">@|${offset}| · ${totalUnits} notes</span>
              <button type="button" class="outline-play-btn" data-play-section="${escapeHtml(p.name)}" data-play-instrument="${escapeHtml(instLabel)}" title="${escapeHtml(trkPlayTitle)}">▶</button>
            </span>
          </div>
        `;
      })
      .join("");
  } else {
    inspectorTracks.innerHTML = `<span class="stat-label">${t("noTracks")}</span>`;
  }

  // Status bar summary
  const distinctInstruments = SheetInstrumentHelper.distinctInstruments(currentSheet);
  const trackCount = distinctInstruments.length;
  sbStatus.textContent = "Valid TMD";
  sbSummary.textContent = `${currentSheet.entries.length} entries · ${trackCount} instruments · BPM ${currentSheet.speed || 120}`;

  return currentSheet;
}

export function setupInspectorPanelEvents(
  elements: {
    inspectorPanel: HTMLElement;
    btnToggleInspector: HTMLButtonElement;
    btnCloseInspector: HTMLButtonElement;
    inspectorTracks: HTMLElement;
    inspectorOrders: HTMLElement;
    inspectorHarmony?: HTMLElement;
    inspectorTonalityViz?: HTMLElement;
    btnJumpOrders?: HTMLButtonElement;
    inspectorPitchInstSelect?: HTMLSelectElement;
    btnInspectorDownloadSvg?: HTMLButtonElement;
    btnInspectorOpenHtml?: HTMLButtonElement;
  },
  editor: any,
  onSavePanelsState: () => void,
  playSectionOrTrack: (section: string, instrument?: string) => void,
  playFromOrderIndex: (orderIndex: number) => void,
  onPitchInstrumentChanged?: (instrument: string) => void
): void {
  const {
    inspectorPanel,
    btnToggleInspector,
    btnCloseInspector,
    inspectorTracks,
    inspectorOrders,
    inspectorHarmony,
    inspectorTonalityViz,
    btnJumpOrders,
    inspectorPitchInstSelect,
    btnInspectorDownloadSvg,
    btnInspectorOpenHtml,
  } = elements;

  btnInspectorDownloadSvg?.addEventListener("click", () => {
    try {
      const content = typeof editor.getContent === "function" ? editor.getContent() : "";
      if (!content) return;
      const sheet = TmdParser.parse(content);
      if (!sheet) return;
      const locale = getCurrentLocale() === "zh-TW" ? "zh-Hant" : "en";
      const profile = TMDSongInspector.inspect(sheet, undefined, locale);
      const svg = TMDTonalityVisualizer.generateSVG(profile, locale);
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(sheet.name || "score").replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, "_")}_tonality.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn("Failed to download tonality SVG:", err);
    }
  });

  btnInspectorOpenHtml?.addEventListener("click", () => {
    try {
      const content = typeof editor.getContent === "function" ? editor.getContent() : "";
      if (!content) return;
      const sheet = TmdParser.parse(content);
      if (!sheet) return;
      const locale = getCurrentLocale() === "zh-TW" ? "zh-Hant" : "en";
      const profile = TMDSongInspector.inspect(sheet, undefined, locale);
      const html = TMDTonalityVisualizer.generateHTML(profile, locale);
      const newWin = window.open("", "_blank");
      if (newWin) {
        newWin.document.write(html);
        newWin.document.close();
      }
    } catch (err) {
      console.warn("Failed to open tonality HTML report:", err);
    }
  });

  inspectorPitchInstSelect?.addEventListener("change", () => {
    const selected = inspectorPitchInstSelect.value;
    if (selected && onPitchInstrumentChanged) {
      onPitchInstrumentChanged(selected);
    }
  });

  btnToggleInspector.addEventListener("click", () => {
    inspectorPanel.classList.toggle("hidden");
    onSavePanelsState();
  });

  btnCloseInspector.addEventListener("click", () => {
    inspectorPanel.classList.add("hidden");
    onSavePanelsState();
  });

  // Jump to playback order in editor
  const jumpToOrders = () => {
    // 1. First check if any order tags have startLine
    const firstTag = inspectorOrders?.querySelector("[data-start-line]") as HTMLElement | null;
    if (firstTag && firstTag.dataset.startLine) {
      const sLine = parseInt(firstTag.dataset.startLine, 10);
      const sCol = firstTag.dataset.startCol ? parseInt(firstTag.dataset.startCol, 10) : 1;
      const eLine = firstTag.dataset.endLine ? parseInt(firstTag.dataset.endLine, 10) : sLine;
      const eCol = firstTag.dataset.endCol ? parseInt(firstTag.dataset.endCol, 10) : sCol;
      if (!isNaN(sLine) && sLine > 0) {
        if (typeof editor.scrollToRange === "function") {
          editor.scrollToRange(sLine, sCol, eLine, eCol);
        } else {
          editor.scrollToLine(sLine);
        }
        return;
      }
    }

    // 2. Fallback: inspect document content or outline
    if (typeof editor.getContent === "function") {
      const content: string = editor.getContent();
      const outlineNodes = TMDOutlineGenerator.generate(content);
      const ordersNode = outlineNodes.find((n) => n.name === "Orders");
      if (ordersNode) {
        if (typeof editor.scrollToRange === "function") {
          editor.scrollToRange(
            ordersNode.range.startLine,
            ordersNode.range.startColumn,
            ordersNode.range.endLine,
            ordersNode.range.endColumn
          );
        } else {
          editor.scrollToLine(ordersNode.range.startLine);
        }
        return;
      }
      // If no orders block, scroll to the end of file so user can append
      const lines = content.split("\n").length;
      editor.scrollToLine(lines);
    }
  };

  // Fallback jump button if rendered inside inspector panel or card
  btnJumpOrders?.addEventListener("click", (e) => {
    e.preventDefault();
    jumpToOrders();
  });

  inspectorTracks?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const playBtn = target.closest(".outline-play-btn") as HTMLElement | null;
    if (playBtn) {
      e.stopPropagation();
      e.preventDefault();
      const sec = playBtn.dataset.playSection;
      let inst = playBtn.dataset.playInstrument;
      if (inst === "Pattern" || !inst) {
        inst = DEFAULT_INSTRUMENT;
      }
      if (sec) {
        playSectionOrTrack(sec, inst);
      }
      return;
    }

    const clickable = target.closest("[data-start-line]") as HTMLElement | null;
    if (clickable && clickable.dataset.startLine) {
      const sLine = parseInt(clickable.dataset.startLine, 10);
      const sCol = clickable.dataset.startCol ? parseInt(clickable.dataset.startCol, 10) : 1;
      const eLine = clickable.dataset.endLine ? parseInt(clickable.dataset.endLine, 10) : sLine;
      const eCol = clickable.dataset.endCol ? parseInt(clickable.dataset.endCol, 10) : sCol;

      if (!isNaN(sLine) && sLine > 0) {
        if (typeof editor.scrollToRange === "function") {
          editor.scrollToRange(sLine, sCol, eLine, eCol);
        } else {
          editor.scrollToLine(sLine);
        }
      }
    }
  });

  const jumpToSection = (sectionName: string) => {
    if (!sectionName || typeof editor.getContent !== "function") return;
    const outlineNodes = TMDOutlineGenerator.generate(editor.getContent());
    const sectionsNode = outlineNodes.find((node) => node.name === "Sections");
    const sectionNode = sectionsNode?.children?.find((node) => node.name === sectionName);
    if (!sectionNode) return;
    if (typeof editor.scrollToRange === "function") {
      editor.scrollToRange(
        sectionNode.range.startLine,
        sectionNode.range.startColumn,
        sectionNode.range.endLine,
        sectionNode.range.endColumn
      );
    } else {
      editor.scrollToLine(sectionNode.range.startLine);
    }
  };

  inspectorTonalityViz?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const section = target.closest("[data-tonality-section]") as HTMLElement | null;
    if (section?.dataset.tonalitySection) {
      e.preventDefault();
      jumpToSection(section.dataset.tonalitySection);
    }
  });

  inspectorHarmony?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const tag = target.closest("[data-search-text]") as HTMLElement | null;
    const searchText = tag?.dataset.searchText;
    if (!searchText || typeof editor.getContent !== "function") return;
    const content = editor.getContent();
    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index++) {
      const column = lines[index].indexOf(searchText);
      if (column < 0) continue;
      e.preventDefault();
      if (typeof editor.scrollToRange === "function") {
        editor.scrollToRange(index + 1, column + 1, index + 1, column + searchText.length + 1);
      } else {
        editor.scrollToLine(index + 1);
      }
      break;
    }
  });

  inspectorOrders?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const jumpBtn = target.closest(".btn-jump-orders") as HTMLElement | null;
    if (jumpBtn) {
      e.stopPropagation();
      e.preventDefault();
      jumpToOrders();
      return;
    }

    const playBtn = target.closest(".order-play-btn") as HTMLElement | null;
    if (playBtn && playBtn.dataset.playOrderIndex !== undefined) {
      e.stopPropagation();
      e.preventDefault();
      const idx = parseInt(playBtn.dataset.playOrderIndex, 10);
      if (!isNaN(idx) && idx >= 0) {
        playFromOrderIndex(idx);
      }
      return;
    }

    // Clicking order tag or tag text scrolls to the order range in editor
    const clickable = target.closest("[data-start-line]") as HTMLElement | null;
    if (clickable && clickable.dataset.startLine) {
      const sLine = parseInt(clickable.dataset.startLine, 10);
      const sCol = clickable.dataset.startCol ? parseInt(clickable.dataset.startCol, 10) : 1;
      const eLine = clickable.dataset.endLine ? parseInt(clickable.dataset.endLine, 10) : sLine;
      const eCol = clickable.dataset.endCol ? parseInt(clickable.dataset.endCol, 10) : sCol;

      if (!isNaN(sLine) && sLine > 0) {
        if (typeof editor.scrollToRange === "function") {
          editor.scrollToRange(sLine, sCol, eLine, eCol);
        } else {
          editor.scrollToLine(sLine);
        }
      }
    }
  });
}
