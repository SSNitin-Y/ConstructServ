// frontend/lib/api.ts
import { getStoredToken } from "@/lib/authClient";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  // ✅ Prevent accidental production builds that call localhost
  throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
}

export type ApiMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

// ✅ module-level guard: shared across all requests
let isHandling401 = false;

function getAuthToken(): string | null {
  // ✅ reads from sessionStorage now (via authClient)
  return getStoredToken();
}

function redirectToLogin() {
  if (typeof window === "undefined") return;

  const next = window.location.pathname + window.location.search;
  const url = `/login?next=${encodeURIComponent(next)}`;
  window.location.href = url;
}

async function request<T>(
  path: string,
  method: ApiMethod,
  body?: unknown,
  extraHeaders?: HeadersInit
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(extraHeaders || {}),
  };

  const token = getAuthToken();
  if (token) {
    (headers as any)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let responseBody: unknown = null;
  const text = await response.text().catch(() => "");

  try {
    responseBody = text ? JSON.parse(text) : null;
  } catch {
    responseBody = text;
  }

  if (response.status === 401) {
    // Prevent multi-request logout spam when multiple calls fail at once (polling, hydration, etc.)
    if (!isHandling401) {
      isHandling401 = true;
      try {
        const { fullLogout } = await import("./logout");
        await fullLogout();
      } finally {
        redirectToLogin();
      }
    }

    // ✅ IMPORTANT: throw ApiError with status so polling hooks can stop immediately
    const err: ApiError = new Error("Unauthorized");
    err.status = 401;
    err.body = responseBody;
    throw err;
  }

  if (!response.ok) {
    const error: ApiError = new Error(
      `API error ${response.status}: ${response.statusText}`
    );
    error.status = response.status;
    error.body = responseBody;
    throw error;
  }

  if (response.status === 204 || !text) {
    return undefined as T;
  }

  return responseBody as T;
}

export const api = {
  get<T>(path: string) {
    return request<T>(path, "GET");
  },
  post<T>(path: string, body?: unknown) {
    return request<T>(path, "POST", body);
  },
  put<T>(path: string, body?: unknown) {
    return request<T>(path, "PUT", body);
  },
  patch<T>(path: string, body?: unknown) {
    return request<T>(path, "PATCH", body);
  },
  delete<T>(path: string) {
    return request<T>(path, "DELETE");
  },
  getMediaItem<T>(id: string) {
    return request<T>(`/media/${id}`, "GET");
  },
};
