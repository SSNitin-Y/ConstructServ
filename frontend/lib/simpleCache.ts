//frontend/lib/simpleCache.ts

type CacheEntry<T> = {
  value: T;
  savedAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): CacheEntry<T> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry as CacheEntry<T>;
}

export function cacheSet<T>(key: string, value: T) {
  cache.set(key, { value, savedAt: Date.now() });
}

export function cacheClear(key: string) {
  cache.delete(key);
}
