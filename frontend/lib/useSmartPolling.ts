// frontend/lib/useSmartPolling.ts
"use client";

import { useEffect, useRef } from "react";

type Options = {
  enabled: boolean;
  getDelayMs: () => number | null; // null => stop
  tick: () => Promise<void> | void;
};

/**
 * A safe polling hook:
 * - Uses setTimeout (not setInterval) to prevent overlap
 * - Never runs concurrent ticks
 * - Stops immediately when enabled=false or getDelayMs returns null
 * - Cleans up on unmount
 */
export function useSmartPolling({ enabled, getDelayMs, tick }: Options) {
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    function clearTimer() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    async function runOnceAndReschedule() {
      if (cancelledRef.current) return;
      if (!enabled) return;

      const delay = getDelayMs();
      if (delay === null) return;

      // Prevent overlapping ticks
      if (!runningRef.current) {
        runningRef.current = true;
        try {
          await tick();
        } finally {
          runningRef.current = false;
        }
      }

      if (cancelledRef.current) return;
      if (!enabled) return;

      const nextDelay = getDelayMs();
      if (nextDelay === null) return;

      clearTimer();
      timerRef.current = window.setTimeout(runOnceAndReschedule, nextDelay);
    }

    // Start
    clearTimer();
    if (enabled) {
      const firstDelay = getDelayMs();
      if (firstDelay !== null) {
        timerRef.current = window.setTimeout(runOnceAndReschedule, firstDelay);
      }
    }

    // Cleanup
    return () => {
      cancelledRef.current = true;
      clearTimer();
    };
  }, [enabled, getDelayMs, tick]);
}
