// frontend/lib/jobsClient.ts

import { api } from "./api";
import type { Job } from "../types/jobs";

/**
 * Fetch all jobs for the current user.
 * Backend: GET /jobs
 *
 * Backend returns a plain array: Job[]
 */
export async function fetchJobs(): Promise<Job[]> {
  const data = await api.get<any>("/jobs");
  // Defensive: support either Job[] OR { items: Job[] }
  return Array.isArray(data) ? (data as Job[]) : (data?.items ?? []);
}

/**
 * Fetch all jobs associated with a specific media item.
 * Backend: GET /media/{media_id}/jobs
 */
export async function fetchJobsForMedia(mediaId: string): Promise<Job[]> {
  return api.get<Job[]>(`/media/${mediaId}/jobs`);
}

/**
 * Fetch the latest job associated with a specific media item.
 */
export async function fetchLatestJobForMedia(mediaId: string): Promise<Job | null> {
  const jobs = await fetchJobsForMedia(mediaId);
  if (!jobs || jobs.length === 0) return null;

  const sorted = [...jobs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sorted[0];
}

/**
 * Delete a single job (does NOT delete media)
 * Backend: DELETE /jobs/{job_id}
 */
export async function deleteJob(jobId: number): Promise<void> {
  await api.delete(`/jobs/${jobId}`);
}

/**
 * Get signed URL for the job PDF (if available)
 * Backend: GET /jobs/{job_id}/pdf-url -> { url: string }
 *
 * ✅ IMPORTANT:
 * - If backend returns 404, it means "PDF not generated / not available" (normal).
 * - We return null for 404 so the UI doesn't treat it like an error.
 */
export async function fetchJobPdfUrl(jobId: number): Promise<{ url: string } | null> {
  try {
    const res = await api.get<{ url: string }>(`/jobs/${jobId}/pdf-url`);
    if (!res?.url) return null;
    return res;
  } catch (err: any) {
    // 404 is expected when no PDF exists for that job
    if (err?.status === 404) return null;
    throw err;
  }
}

/**
 * Retry generating a PDF for a job.
 * Backend: POST /jobs/{job_id}/retry-pdf
 *
 * Returns the updated Job.
 */
export async function retryJobPdf(jobId: number): Promise<Job> {
  return api.post<Job>(`/jobs/${jobId}/retry-pdf`);
}
