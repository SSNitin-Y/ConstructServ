// frontend/app/job/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Job } from "@/types/jobs";
import { fetchJobs, deleteJob, fetchJobPdfUrl, retryJobPdf } from "@/lib/jobsClient";
import { deleteMedia } from "@/lib/mediaClient";
import { Trash2, RefreshCw, ExternalLink, FileText } from "lucide-react";
import { useCachedList } from "@/lib/useCachedList";
import { cacheSet } from "@/lib/simpleCache";

type ParsedJobOutput = {
  summary?: string;
  processed_at?: string;
  [key: string]: unknown;
};

function shouldPollJobs(list: Job[] | null) {
  if (!list || list.length === 0) return false;
  return list.some((j) => {
    const s = (j.status || "").toLowerCase();
    return s === "pending" || s === "processing";
  });
}

export default function JobsPage() {
  const cacheKey = "jobs:list:v1";

  const {
    data: cachedJobs,
    loading,
    error,
    refresh: refreshJobs,
    isLive,
  } = useCachedList<Job[]>({
    cacheKey,
    fetcher: async () => {
      const list = await fetchJobs();
      return list;
    },
    shouldPoll: shouldPollJobs,
  });

  // Local state so delete actions feel instant (and we keep cache in sync)
  const [jobs, setJobs] = useState<Job[]>(() => cachedJobs ?? []);

  // Store PDF urls by job id (best-effort). NOTE: empty string means "attempted and failed"
  const [pdfUrlByJobId, setPdfUrlByJobId] = useState<Record<number, string>>({});

  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);
  const [deletingMediaForJobId, setDeletingMediaForJobId] = useState<number | null>(null);

  // ✅ retry state
  const [retryingJobId, setRetryingJobId] = useState<number | null>(null);

  // Sync local state when fresh data comes in
  useEffect(() => {
    if (cachedJobs) setJobs(cachedJobs);
  }, [cachedJobs]);

  // Best-effort hydrate PDF urls for completed jobs that actually have PDFs
  useEffect(() => {
    let cancelled = false;

    async function hydratePdfUrls() {
      const completedWithPdfJobIds = jobs
        .filter((j: any) => (j.status || "").toLowerCase() === "completed" && !!(j as any).has_pdf)
        .map((j) => j.id)
        .filter((id) => typeof id === "number" && id > 0);

      // don't retry if we've already attempted (even if it failed -> "")
      const toFetch = completedWithPdfJobIds.filter((jobId) => !(jobId in pdfUrlByJobId));
      if (toFetch.length === 0) return;

      for (const jobId of toFetch) {
        try {
          const res = await fetchJobPdfUrl(jobId);
          if (cancelled) return;

          if (res?.url) {
            setPdfUrlByJobId((prev) => ({ ...prev, [jobId]: res.url }));
          } else {
            // negative cache
            setPdfUrlByJobId((prev) => ({ ...prev, [jobId]: "" }));
          }
        } catch {
          // negative cache so it doesn't keep trying
          if (!cancelled) {
            setPdfUrlByJobId((prev) => ({ ...prev, [jobId]: "" }));
          }
        }
      }
    }

    hydratePdfUrls();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.map((j) => `${j.id}:${j.status}:${(j as any).has_pdf ? 1 : 0}`).join("|")]);

  const stats = useMemo(() => {
    const total = jobs.length;
    const pending = jobs.filter((j) => (j.status || "").toLowerCase() === "pending").length;
    const processing = jobs.filter((j) => (j.status || "").toLowerCase() === "processing").length;
    const completed = jobs.filter((j) => (j.status || "").toLowerCase() === "completed").length;
    const failed = jobs.filter((j) => (j.status || "").toLowerCase() === "failed").length;
    return { total, pending, processing, completed, failed };
  }, [jobs]);

  const handleDeleteJob = async (jobId: number) => {
    const ok = window.confirm("Delete this job? This does not delete the media.");
    if (!ok) return;

    try {
      setDeletingJobId(jobId);
      await deleteJob(jobId);

      setJobs((prev) => {
        const next = prev.filter((j) => j.id !== jobId);
        cacheSet(cacheKey, next);
        return next;
      });

      setPdfUrlByJobId((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    } catch (err: any) {
      console.error("Failed to delete job", err);
      const detail =
        (err?.body && (err.body as any).detail) ||
        err?.message ||
        "Failed to delete job.";
      alert(String(detail));
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleDeleteMedia = async (job: Job) => {
    const mediaId = (job as any).media_id as string | null | undefined;
    if (!mediaId) return;

    const ok = window.confirm("Delete this media and its jobs? This cannot be undone.");
    if (!ok) return;

    try {
      setDeletingMediaForJobId(job.id);
      await deleteMedia(mediaId);

      setJobs((prev) => {
        const next = prev.filter((j) => j.id !== job.id);
        cacheSet(cacheKey, next);
        return next;
      });

      setPdfUrlByJobId((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    } catch (err: any) {
      console.error("Failed to delete media", err);
      const detail =
        (err?.body && (err.body as any).detail) ||
        err?.message ||
        "Failed to delete media.";
      alert(String(detail));
    } finally {
      setDeletingMediaForJobId(null);
    }
  };

  const handleRefresh = async () => {
    await refreshJobs();
  };

  // ✅ retry pdf handler
  const handleRetryPdf = async (jobId: number) => {
    try {
      setRetryingJobId(jobId);

      await retryJobPdf(jobId);

      // Refresh list so status becomes completed + has_pdf updates
      await refreshJobs();

      // Clear cached PDF url so hydration can fetch again
      setPdfUrlByJobId((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    } catch (err: any) {
      console.error("Failed to retry PDF", err);
      const detail =
        (err?.body && (err.body as any).detail) ||
        err?.message ||
        "Failed to retry PDF.";
      alert(String(detail));
    } finally {
      setRetryingJobId(null);
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-background">
      <div className="container-app py-10">
        <div className="card p-6 md:p-8 overflow-hidden relative">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] blur-2xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--ring)_14%,transparent)] blur-2xl" />

          <div className="relative">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 badge mb-3">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  Jobs • backend processing history
                </div>

                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Jobs</h1>
                <p className="mt-2 text-muted max-w-2xl">
                  Jobs are created from uploaded media. You can delete the job (keeps the media),
                  or delete the media (removes related jobs too).
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/" className="btn btn-ghost">
                    Home
                  </Link>
                  <Link href="/library" className="btn btn-outline">
                    Media Library
                  </Link>
                  <Link href="/analysis" className="btn btn-outline">
                    New Analysis
                  </Link>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={loading}
                  className="btn btn-outline"
                  title={isLive ? "Auto-updating while jobs run" : "Refresh jobs"}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Total" value={stats.total} />
              <Stat label="Pending" value={stats.pending} />
              <Stat label="Processing" value={stats.processing} />
              <Stat label="Completed" value={stats.completed} />
              <Stat label="Failed" value={stats.failed} />
            </div>

            <div className="mt-8">
              {loading && jobs.length === 0 ? (
                <div className="card-soft p-5">
                  <p className="text-sm text-muted">Loading jobs…</p>
                </div>
              ) : error ? (
                <div className="card-soft p-5">
                  <p className="text-sm text-[color-mix(in_srgb,var(--danger)_85%,var(--foreground))]">
                    Error: {error}
                  </p>
                </div>
              ) : jobs.length === 0 ? (
                <div className="card-soft p-5">
                  <p className="text-sm text-muted">
                    No jobs yet. Upload media from the{" "}
                    <Link href="/library" className="underline">
                      Media Library
                    </Link>{" "}
                    to create processing jobs.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {jobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      pdfUrl={pdfUrlByJobId[job.id] ? pdfUrlByJobId[job.id] : null}
                      onDeleteJob={handleDeleteJob}
                      onDeleteMedia={handleDeleteMedia}
                      onRetryPdf={handleRetryPdf}
                      retryingJobId={retryingJobId}
                      deletingJobId={deletingJobId}
                      deletingMediaForJobId={deletingMediaForJobId}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-soft p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-extrabold">{value}</div>
    </div>
  );
}

function JobCard({
  job,
  pdfUrl,
  onDeleteJob,
  onDeleteMedia,
  onRetryPdf,
  retryingJobId,
  deletingJobId,
  deletingMediaForJobId,
}: {
  job: Job;
  pdfUrl: string | null;
  onDeleteJob: (jobId: number) => void;
  onDeleteMedia: (job: Job) => void;
  onRetryPdf: (jobId: number) => void;
  retryingJobId: number | null;
  deletingJobId: number | null;
  deletingMediaForJobId: number | null;
}) {
  const parsed = parseJobOutput(job.output_json);
  const mediaId = (job as any).media_id as string | null | undefined;

  const isDeletingJob = deletingJobId === job.id;
  const isDeletingMedia = deletingMediaForJobId === job.id;

  const statusLower = (job.status || "").toLowerCase();
  const isCompleted = statusLower === "completed";
  const isFailed = statusLower === "failed";

  // Only show retry for roof_report failed jobs that have analysis output saved
  const canRetryPdf = isFailed && job.job_type === "roof_report" && !!job.output_json;
  const isRetrying = retryingJobId === job.id;

  return (
    <div className="card p-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">
              Job #{job.id} • {job.job_type}
            </p>
            <JobStatusBadge status={job.status} />
          </div>

          <p className="mt-2 text-xs text-muted break-all">
            Input: <span className="font-mono">{job.input_s3_key}</span>
          </p>

          {mediaId && (
            <p className="mt-2 text-xs text-muted flex items-center gap-2 break-all">
              Media:
              <Link href={`/media/${mediaId}`} className="underline inline-flex items-center gap-1">
                <span className="font-mono">{mediaId}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </p>
          )}

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted">
            <div>
              Created:{" "}
              <span className="font-mono">{new Date(job.created_at).toLocaleString()}</span>
            </div>
            <div>
              Updated:{" "}
              <span className="font-mono">{new Date(job.updated_at).toLocaleString()}</span>
            </div>
          </div>

          {isCompleted && pdfUrl ? (
            <div className="mt-3">
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline inline-flex items-center gap-2"
                title="Open PDF report"
              >
                <FileText className="h-4 w-4" />
                Open PDF
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ) : null}

          {parsed && (
            <div className="mt-4 card-soft p-4">
              <div className="text-xs font-semibold">Report (placeholder)</div>
              {parsed.summary && <p className="mt-2 text-sm text-muted">{parsed.summary}</p>}
              {parsed.processed_at && (
                <p className="mt-2 text-xs text-muted">
                  Processed at: <span className="font-mono">{parsed.processed_at}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col gap-2 md:items-end">
          {canRetryPdf && (
            <button
              type="button"
              onClick={() => onRetryPdf(job.id)}
              disabled={isDeletingJob || isDeletingMedia || isRetrying}
              className="btn btn-outline py-1.5 px-6 text-sm whitespace-nowrap"
              title="Retry generating the PDF for this job"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
              {isRetrying ? "Retrying PDF…" : "Retry PDF"}
            </button>
          )}

          <button
            type="button"
            onClick={() => onDeleteJob(job.id)}
            disabled={isDeletingJob || isDeletingMedia || isRetrying}
            className="btn btn-outline py-1.5 px-6 text-sm whitespace-nowrap"
            title="Delete only the job (keeps the media)"
          >
            <Trash2 className="h-4 w-4" />
            {isDeletingJob ? "Deleting Job…" : "Delete Job"}
          </button>

          {mediaId && (
            <button
              type="button"
              onClick={() => onDeleteMedia(job)}
              disabled={isDeletingJob || isDeletingMedia || isRetrying}
              className="btn btn-danger py-1.5 text-sm whitespace-nowrap"
              title="Delete the media (removes related jobs too)"
            >
              <Trash2 className="h-4 w-4" />
              {isDeletingMedia ? "Deleting Media…" : "Delete Media"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: Job["status"] }) {
  const s = (status || "").toLowerCase();
  const label =
    s === "completed"
      ? "Completed"
      : s === "processing"
      ? "Processing"
      : s === "pending"
      ? "Pending"
      : "Failed";

  const cls =
    s === "completed"
      ? "badge badge-success"
      : s === "processing"
      ? "badge badge-warning"
      : s === "pending"
      ? "badge"
      : "badge badge-danger";

  return <span className={cls}>{label}</span>;
}

function parseJobOutput(output_json: string | null): ParsedJobOutput | null {
  if (!output_json) return null;
  try {
    const parsed = JSON.parse(output_json);
    if (parsed && typeof parsed === "object") return parsed as ParsedJobOutput;
  } catch (e) {
    console.warn("Failed to parse job.output_json", e);
  }
  return null;
}
