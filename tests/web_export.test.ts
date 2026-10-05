import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect,it } from 'vitest';

import { en } from '../web/src/locales/en.js';
import { zhTW } from '../web/src/locales/zh-TW.js';

describe('Web UI Exporters & REAPER support (TDD)', () => {
  it('defines REAPER export i18n labels in zh-TW and en locales', () => {
    expect((zhTW as any).exportReaper).toBe('REAPER 專案檔 (.rpp)');
    expect((en as any).exportReaper).toBe('REAPER Project (.rpp)');
  });

  it('includes REAPER export button in index.html with i18n attribute', () => {
    const htmlPath = path.join(__dirname, '../web/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('id="export-reaper"');
    expect(html).toContain('data-i18n="exportReaper"');
  });

  it('binds export-reaper button in web/src/main.ts and handles RPP download', () => {
    const mainPath = path.join(__dirname, '../web/src/main.ts');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');
    const domPath = path.join(__dirname, '../web/src/ui/dom.ts');
    const domContent = fs.existsSync(domPath) ? fs.readFileSync(domPath, 'utf-8') : '';
    const exportPath = path.join(__dirname, '../web/src/ui/exportMenu.ts');
    const exportContent = fs.existsSync(exportPath) ? fs.readFileSync(exportPath, 'utf-8') : '';
    const fullContent = [mainContent, domContent, exportContent].join('\n');

    expect(fullContent).toContain('export-reaper');
    expect(fullContent).toContain('TmdReaperGenerator');
    expect(fullContent).toContain('.generateRPP(');
  });

  it('defines VOCALOID export i18n labels in zh-TW and en locales', () => {
    expect((zhTW as any).exportVsq).toBe('VOCALOID2 專案檔 (.vsq)');
    expect((en as any).exportVsq).toBe('VOCALOID2 Project (.vsq)');
    expect((zhTW as any).exportVsqx).toBe('VOCALOID3/4 專案檔 (.vsqx)');
    expect((en as any).exportVsqx).toBe('VOCALOID3/4 Project (.vsqx)');
  });

  it('includes VOCALOID export buttons in web/index.html with i18n attributes', () => {
    const htmlPath = path.join(__dirname, '../web/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('id="export-vsq"');
    expect(html).toContain('data-i18n="exportVsq"');
    expect(html).toContain('id="export-vsqx"');
    expect(html).toContain('data-i18n="exportVsqx"');
  });

  it('binds export-vsq and export-vsqx buttons in web/src/main.ts', () => {
    const mainPath = path.join(__dirname, '../web/src/main.ts');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');
    const domPath = path.join(__dirname, '../web/src/ui/dom.ts');
    const domContent = fs.existsSync(domPath) ? fs.readFileSync(domPath, 'utf-8') : '';
    const exportPath = path.join(__dirname, '../web/src/ui/exportMenu.ts');
    const exportContent = fs.existsSync(exportPath) ? fs.readFileSync(exportPath, 'utf-8') : '';
    const fullContent = [mainContent, domContent, exportContent].join('\n');

    expect(fullContent).toContain('export-vsq');
    expect(fullContent).toContain('export-vsqx');
    expect(fullContent).toContain('TmdVSQGenerator');
    expect(fullContent).toContain('TmdVSQXGenerator');
  });

  it('defines ChordPro export i18n labels in zh-TW and en locales', () => {
    expect((zhTW as any).exportChordPro).toBe('ChordPro 和弦簡譜 (.cho)');
    expect((en as any).exportChordPro).toBe('ChordPro Lead Sheet (.cho)');
  });

  it('includes ChordPro export button in web/index.html with i18n attributes', () => {
    const htmlPath = path.join(__dirname, '../web/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('id="export-chordpro"');
    expect(html).toContain('data-i18n="exportChordPro"');
  });

  it('binds export-chordpro button in web/src/main.ts and handles .cho download', () => {
    const mainPath = path.join(__dirname, '../web/src/main.ts');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');
    const domPath = path.join(__dirname, '../web/src/ui/dom.ts');
    const domContent = fs.existsSync(domPath) ? fs.readFileSync(domPath, 'utf-8') : '';
    const exportPath = path.join(__dirname, '../web/src/ui/exportMenu.ts');
    const exportContent = fs.existsSync(exportPath) ? fs.readFileSync(exportPath, 'utf-8') : '';
    const fullContent = [mainContent, domContent, exportContent].join('\n');

    expect(fullContent).toContain('export-chordpro');
    expect(fullContent).toContain('TmdChordProGenerator');
    expect(fullContent).toContain('.generateChordPro(');
  });

  it('removes top toolbar sample-select dropdown and relies on drawer samples list', () => {
    const htmlPath = path.join(__dirname, '../web/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).not.toContain('id="sample-select"');
    expect(html).toContain('id="library-samples-list"');

    const mainPath = path.join(__dirname, '../web/src/main.ts');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');
    expect(mainContent).not.toContain('sample-select');
    expect(mainContent).not.toContain('sampleSelect');
  });

  it('includes AI validation banner and repair wiring in web/index.html and web/src/main.ts', () => {
    const htmlPath = path.join(__dirname, '../web/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('id="ai-validation-banner"');
    expect(html).toContain('id="btn-ai-retry-repair"');

    const mainPath = path.join(__dirname, '../web/src/main.ts');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');
    const aiPath = path.join(__dirname, '../web/src/ui/aiDrawer.ts');
    const aiContent = fs.existsSync(aiPath) ? fs.readFileSync(aiPath, 'utf-8') : '';
    const fullContent = [mainContent, aiContent].join('\n');

    expect(fullContent).toContain('validateTmdCode');
    expect(fullContent).toContain('buildRepairPrompt');
    expect(fullContent).toContain('btn-ai-retry-repair');
  });

  it('supports separate Multi-Track GM, Piano-only GM, and Tiny synth options in locales and UI', () => {
    // Check locales
    expect((zhTW as any).synthOptionGm).toBeDefined();
    expect((zhTW as any).synthOptionPiano).toBeDefined();
    expect((zhTW as any).synthOptionTiny).toBeDefined();

    expect((en as any).synthOptionGm).toBeDefined();
    expect((en as any).synthOptionPiano).toBeDefined();
    expect((en as any).synthOptionTiny).toBeDefined();

    // Check index.html synth-select options
    const htmlPath = path.join(__dirname, '../web/index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('value="gm"');
    expect(html).toContain('value="piano"');
    expect(html).toContain('value="tiny"');
  });
});

