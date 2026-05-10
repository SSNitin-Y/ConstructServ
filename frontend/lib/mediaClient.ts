// frontend/lib/mediaClient.ts

import { api } from "./api";
import type {
  MediaListResponse,
  MediaUploadIntentRequest,
  MediaUploadIntentResponse,
} from "../types/media";

// ---------- Media ----------
export async function fetchMediaList(opts?: {
  page?: number;
  pageSize?: number;
  includeAi?: boolean;
}): Promise<MediaListResponse> {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const includeAi = opts?.includeAi ? 1 : 0;

  return api.get<MediaListResponse>(
    `/media?page=${page}&page_size=${pageSize}&include_ai=${includeAi}`
  );
}

export async function requestUploadIntent(
  payload: MediaUploadIntentRequest
): Promise<MediaUploadIntentResponse> {
  return api.post<MediaUploadIntentResponse>("/media/upload-intent", payload);
}

export async function markMediaReady(mediaId: string): Promise<void> {
  await api.patch(`/media/${mediaId}/mark-ready`, {});
}

export interface MediaFileUrlResponse {
  url: string;
}

export async function fetchMediaFileUrl(
  mediaId: string
): Promise<MediaFileUrlResponse> {
  return api.get<MediaFileUrlResponse>(`/media/${mediaId}/file-url`);
}

/**
 * ✅ IMPORTANT:
 * Upload to the signed URL MUST NOT use api.ts (because api.ts adds Authorization header).
 * This upload goes directly to GCS signed URL.
 */
export async function uploadFileToSignedUrl(opts: {
  uploadUrl: string;
  file: File | Blob;
  uploadMethod?: "PUT" | "POST";
  uploadHeaders?: Record<string, string> | null;
  uploadFields?: Record<string, string> | null;
}): Promise<void> {
  const method = opts.uploadMethod ?? "PUT";

  if (method === "PUT") {
    const res = await fetch(opts.uploadUrl, {
      method: "PUT",
      headers: opts.uploadHeaders ?? undefined,
      body: opts.file,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Signed URL upload failed: ${res.status} ${txt}`);
    }
    return;
  }

  // If you ever switch to POST-based signed uploads, support it here.
  if (method === "POST") {
    const form = new FormData();

    // uploadFields are required for POST policies (not used in your current response)
    if (opts.uploadFields) {
      for (const [k, v] of Object.entries(opts.uploadFields)) {
        form.append(k, v);
      }
    }
    form.append("file", opts.file);

    const res = await fetch(opts.uploadUrl, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Signed POST upload failed: ${res.status} ${txt}`);
    }
    return;
  }

  throw new Error(`Unsupported upload method: ${method}`);
}

/**
 * Convenience helper: request intent -> upload -> mark-ready
 */
export async function uploadMediaEndToEnd(payload: MediaUploadIntentRequest, file: File) {
  const intent = await requestUploadIntent(payload);

  await uploadFileToSignedUrl({
    uploadUrl: intent.upload_url,
    uploadMethod: intent.upload_method as any,
    uploadHeaders: intent.upload_headers ?? null,
    uploadFields: (intent as any).upload_fields ?? null,
    file,
  });

  await markMediaReady(intent.media.id);

  return intent.media;
}

// ---------- Jobs ----------
export interface JobCreateRequest {
  job_type: string;
  media_id: string;
}

export async function createJobForMedia(
  mediaId: string,
  jobType: string = "roof_report"
): Promise<void> {
  const payload: JobCreateRequest = { job_type: jobType, media_id: mediaId };
  await api.post("/jobs", payload);
}

// ---------- Delete Media ----------
export async function deleteMedia(mediaId: string): Promise<void> {
  await api.delete(`/media/${mediaId}`);
}

export async function bulkDeleteMedia(mediaIds: string[]): Promise<{
  deleted_ids: string[];
  count: number;
}> {
  return api.post("/media/bulk-delete", { media_ids: mediaIds });
}
