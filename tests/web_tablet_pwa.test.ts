import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const html = readFileSync(join(root, "web/index.html"), "utf8");
const styles = readFileSync(join(root, "web/src/styles.css"), "utf8");
const main = readFileSync(join(root, "web/src/main.ts"), "utf8");

describe("tablet and PWA web contract", () => {
  it("declares a stable, safe-area-aware viewport without disabling user zoom", () => {
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />'
    );
    expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
  });

  it("declares install metadata and iOS standalone support", () => {
    expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="TMD Studio" />');
  });

  it("registers the service worker from the application bootstrap", () => {
    expect(main).toContain('navigator.serviceWorker.register("./sw.js")');
  });

  it("ships a manifest with standalone launch and app icons", () => {
    const manifest = JSON.parse(readFileSync(join(root, "web/public/manifest.webmanifest"), "utf8"));

    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("./");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "./pwa-icon.svg", sizes: "192x192" }),
        expect.objectContaining({ src: "./pwa-icon.svg", sizes: "512x512" }),
      ])
    );
  });

  it("protects tablet layouts and keeps primary controls touch-sized", () => {
    expect(styles).toMatch(/@media\s*\(min-width:\s*600px\)\s*and\s*\(max-width:\s*1024px\)/);
    expect(styles).toMatch(/--tablet-touch-target:\s*44px/);
    expect(styles).toMatch(/min-height:\s*var\(--tablet-touch-target\)/);
    expect(styles).toMatch(/min-width:\s*var\(--tablet-touch-target\)/);
    expect(styles).toMatch(/overflow-x:\s*hidden/);
    expect(styles).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("only suppresses touch gestures while the floating player is actively dragged", () => {
    expect(styles).not.toMatch(/\.tmd-player-bar\s*\{[^}]*touch-action:\s*none/s);
    expect(styles).toMatch(/\.tmd-player-bar\.dragging\s*\{[^}]*touch-action:\s*none/s);
  });
});
