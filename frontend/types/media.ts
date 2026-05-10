// frontend/types/media.ts

export type MediaType = "image" | "video";
export type MediaStatus = "uploading" | "processing" | "ready" | "failed";

export type AiStatus = "none" | "running" | "ready" | "failed";

export interface MediaListItem {
  id: string;
  filename: string;
  media_type: MediaType;
  status: MediaStatus;
  created_at: string;
  thumbnail_url: string | null;

  // persisted analysis metadata (optional)
  analysis_type?: string | null;
  notes?: string | null;
  location?: string | null;
  capture_date?: string | null; // "YYYY-MM-DD"

  // ✅ NEW: ai status from backend
  ai_status?: AiStatus | null;
  latest_job_id?: number | null;
  latest_job_status?: string | null;
  latest_job_type?: string | null;
}

export interface MediaListResponse {
  items: MediaListItem[];
}

export interface MediaUploadIntentRequest {
  filename: string;
  media_type: MediaType;
  content_type?: string;
  size_bytes?: number;

  analysis_type?: string | null;
  notes?: string | null;
  location?: string | null;
  capture_date?: string | null;
}

export interface MediaUploadIntentResponse {
  media: MediaListItem;
  upload_url: string;
  upload_method: "PUT" | "POST";
  upload_headers?: Record<string, string>;
  upload_fields?: Record<string, string>;
}
