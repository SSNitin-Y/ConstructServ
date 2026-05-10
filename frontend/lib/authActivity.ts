// frontend/lib/authActivity.ts

/**
 * Very small "busy" tracker.
 * If busyCount > 0, we treat the app as "busy" (e.g., uploading),
 * and idle logout should not trigger.
 */
let busyCount = 0;

export function startBusy(reason?: string) {
  busyCount += 1;
  // Optional: you can log reason during development
  // console.log("[authActivity] startBusy", reason, busyCount);
}

export function stopBusy(reason?: string) {
  busyCount = Math.max(0, busyCount - 1);
  // console.log("[authActivity] stopBusy", reason, busyCount);
}

export function isBusy() {
  return busyCount > 0;
}
