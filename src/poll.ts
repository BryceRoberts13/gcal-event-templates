/** How often dialog watchers rescan Calendar after a missed mutation. */
export const DIALOG_SCAN_INTERVAL_MS = 1500;

/** How often the content script checks that the extension context is still alive. */
export const CONTEXT_CHECK_INTERVAL_MS = 3000;

/** First wait after opening the color menu, then the gap between retries. */
export const COLOR_PICK_INITIAL_DELAY_MS = 40;
export const COLOR_PICK_RETRY_DELAY_MS = 60;
export const COLOR_PICK_MAX_ATTEMPTS = 8;

/** Backoff between failed storage messages. */
export const STORAGE_RETRY_DELAY_MS = 100;

const MIN_DELAY_MS = 16;
const MAX_DELAY_MS = 60_000;

export function assertDelayMs(ms: number, label: string): number {
  if (!Number.isInteger(ms) || ms < MIN_DELAY_MS || ms > MAX_DELAY_MS) {
    throw new Error(
      `${label} must be an integer from ${MIN_DELAY_MS} to ${MAX_DELAY_MS} ms`,
    );
  }
  return ms;
}

export function setValidatedInterval(tick: () => void, ms: number): number {
  const delay = assertDelayMs(ms, "Poll interval");
  return window.setInterval(() => {
    if (document.visibilityState === "hidden") {
      return;
    }
    tick();
  }, delay);
}

export function setValidatedTimeout(tick: () => void, ms: number): number {
  const delay = assertDelayMs(ms, "Poll delay");
  return window.setTimeout(tick, delay);
}
