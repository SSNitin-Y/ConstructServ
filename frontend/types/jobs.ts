// types/jobs.ts

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface Job {
  id: number;
  user_id: string;
  job_type: string;
  input_s3_key: string;
  status: JobStatus;

  output_json: string | null;
  pdf_s3_key: string | null;

  media_id: string | null;

  created_at: string; // ISO string from backend
  updated_at: string; // ISO string from backend

  // ✅ NEW (Option A): backend tells us if a PDF exists without extra calls
  has_pdf: boolean;
}

// /jobs returns a plain JSON array
export type JobListResponse = Job[];

export type AiStatus = "none" | JobStatus;
