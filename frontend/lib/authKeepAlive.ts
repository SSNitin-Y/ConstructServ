// frontend/lib/authKeepAlive.ts

import { refreshFirebaseToken } from "@/lib/tokenRefresh";
import { isBusy } from "@/lib/authActivity";

let intervalId: number | null = null;

/**
 * Start periodic token refresh while the app is busy (e.g. uploading).
 */
export function startAuthKeepAlive() {
  if (intervalId !== null) return;

  // Refresh every 10 minutes (safe margin under Firebase expiry)
  intervalId = window.setInterval(async () => {
    if (!isBusy()) return;

    await refreshFirebaseToken();
  }, 10 * 60 * 1000);
}

/**
 * Stop periodic token refresh.
 */
export function stopAuthKeepAlive() {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}
