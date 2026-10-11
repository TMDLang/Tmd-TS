export const LOADING_OVERLAY_ID = "app-loading-overlay";
export const LOADING_STATUS_ID = "app-loading-status";

export function updateLoadingStatus(
  message: string,
  doc: Document | undefined = typeof document !== "undefined" ? document : undefined
): void {
  const statusEl = doc?.getElementById(LOADING_STATUS_ID);
  if (statusEl) {
    statusEl.textContent = message;
  }
}

export function dismissLoadingOverlay(
  doc: Document | undefined = typeof document !== "undefined" ? document : undefined,
  removeDelayMs = 280
): void {
  const overlay = doc?.getElementById(LOADING_OVERLAY_ID);
  if (!overlay) {
    return;
  }
  if (overlay.classList.contains("is-loaded")) {
    return;
  }
  overlay.setAttribute("aria-busy", "false");
  overlay.classList.add("is-loaded");
  setTimeout(() => {
    overlay.remove();
  }, removeDelayMs);
}
