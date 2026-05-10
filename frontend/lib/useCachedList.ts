// frontend/lib/useCachedList.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cacheGet, cacheSet } from "@/lib/simpleCache";

type UseCachedListArgs<T> = {
  cacheKey: string;
  fetcher: () => Promise<T>;
  shouldPoll?: (data: T | null) => boolean;
  liveIntervalMs?: number; // default 5000
};

type UseCachedListResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isLive: boolean;
};

export function useCachedList<T>({
  cacheKey,
  fetcher,
  shouldPoll,
  liveIntervalMs = 5000,
}: UseCachedListArgs<T>): UseCachedListResult<T> {
  // ✅ Read cached value correctly (CacheEntry<T>.value)
  const [data, setData] = useState<T | null>(() => {
    const entry = cacheGet<T>(cacheKey);
    return entry ? entry.value : null;
  });

  const [loading, setLoading] = useState<boolean>(() => data === null);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ✅ Pause polling when tab is not visible (prevents pointless spam)
  useEffect(() => {
    const onVis = () => setIsVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const next = await fetcher();
      if (!mountedRef.current) return;

      setData(next);
      cacheSet(cacheKey, next);
      setError(null);
    } catch (e: any) {
      if (!mountedRef.current) return;

      const msg = e?.message ? String(e.message) : "Failed to load data";
      setError(msg);

      // ✅ Important: stop polling on error (prevents 401 loops)
      stopInterval();
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [cacheKey, fetcher, stopInterval]);

  // ✅ If cache is empty, fetch once on mount.
  useEffect(() => {
    const entry = cacheGet<T>(cacheKey);
    if (entry) {
      setData(entry.value);
      setLoading(false);
      return;
    }

    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const wantsLive = useMemo(() => {
    if (!shouldPoll) return false;
    try {
      return !!shouldPoll(data);
    } catch {
      return false;
    }
  }, [data, shouldPoll]);

  const isLive = intervalRef.current !== null;

  // ✅ Start/stop polling depending on wantsLive + tab visibility
  useEffect(() => {
    if (!isVisible) {
      stopInterval();
      return;
    }

    if (!wantsLive) {
      stopInterval();
      return;
    }

    if (intervalRef.current !== null) return;

    intervalRef.current = window.setInterval(() => {
      refresh();
    }, liveIntervalMs);

    return () => stopInterval();
  }, [isVisible, wantsLive, refresh, liveIntervalMs, stopInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopInterval();
  }, [stopInterval]);

  return { data, loading, error, refresh, isLive };
}
