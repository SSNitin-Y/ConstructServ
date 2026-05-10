// frontend/lib/IdleLogoutClient.tsx
"use client";

import { useEffect, useRef } from "react";
import { fullLogout } from "@/lib/logout";
import { isBusy } from "@/lib/authActivity";
import { startAuthKeepAlive, stopAuthKeepAlive } from "@/lib/authKeepAlive";

/**
 * Logs out after 20 minutes of user inactivity.
 * - If the app is "busy" (e.g., uploading), it will NOT log out.
 * - While mounted, it starts a keep-alive timer that refreshes the Firebase token
 *   periodically when busy, preventing token-expiry 401s during long uploads.
 *
 * This component renders nothing and does not affect UI.
 */
export default function IdleLogoutClient() {
  const timeoutRef = useRef<number | null>(null);
  const IDLE_MS = 20 * 60 * 1000; // 20 minutes

  function redirectToLogin() {
    const next = window.location.pathname + window.location.search;
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }

  function clearTimer() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function scheduleTimer() {
    clearTimer();
    timeoutRef.current = window.setTimeout(() => {
      void handleIdleTimeout();
    }, IDLE_MS);
  }

  async function handleIdleTimeout() {
    // If user is uploading / long-running action, do not log out.
    // Instead, reset the timer and check again later.
    if (isBusy()) {
      scheduleTimer();
      return;
    }

    await fullLogout();
    redirectToLogin();
  }

  useEffect(() => {
    // Start keep-alive logic (only refreshes token when isBusy() === true)
    startAuthKeepAlive();

    // Any activity resets the idle timer.
    const onActivity = () => scheduleTimer();

    // Start timer immediately
    scheduleTimer();

    // Events that count as "activity"
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("mousedown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });

    // Switching back to the tab counts as activity too
    const onVisibility = () => {
      if (!document.hidden) scheduleTimer();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopAuthKeepAlive();
      clearTimer();

      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("mousedown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("touchstart", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
