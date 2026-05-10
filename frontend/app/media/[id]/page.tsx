// frontend/app/media/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fetchMediaFileUrl, deleteMedia } from "@/lib/mediaClient";
import { fetchConversation, askMediaQuestion } from "@/lib/conversationsClient";
import type { ConversationMessage } from "@/types/conversation";
import { useSmartPolling } from "@/lib/useSmartPolling";
import {
  ArrowLeft,
  Trash2,
  FileText,
  Bot,
  Send,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  MapPin,
  Calendar,
  StickyNote,
  Tag,
  ExternalLink,
} from "lucide-react";

type ApiMediaItem = {
  id: string;
  filename: string;
  media_type: "image" | "video";
  status: "uploading" | "processing" | "ready" | "failed";
  thumbnail_url: string | null;
  created_at: string;

  analysis_type?: string | null;
  notes?: string | null;
  location?: string | null;
  capture_date?: string | null; // "YYYY-MM-DD"
};

type MediaItem = {
  id: string;
  filename: string;
  mediaType: "image" | "video";
  status: "uploading" | "processing" | "ready" | "failed";
  url: string;
  createdAt: string;

  analysisType?: string | null;
  notes?: string | null;
  location?: string | null;
  captureDate?: string | null;
};

type JobItem = {
  id: number;
  job_type: string;
  status: string;
  output_json: string | null;
  input_s3_key: string;
  created_at: string;
  updated_at: string;
  pdf_s3_key?: string | null;
};

type ParsedReport = {
  summary?: string;
  processed_at?: string;
  [key: string]: unknown;
};

type LocalAnalysisMeta = {
  analysisType?: string;
  notes?: string;
  location?: string;
  date?: string | null; // ISO
  filename?: string;
  createdAt?: string; // ISO
};

function readLocalAnalysisMeta(mediaId: string): LocalAnalysisMeta | null {
  try {
    const raw = localStorage.getItem(`analysis_meta:${mediaId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as LocalAnalysisMeta;
  } catch {
    return null;
  }
}

function formatDateForDisplay(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

function prettyAnalysisType(value?: string | null) {
  if (!value) return null;
  if (value === "roof_report") return "Roof Inspection";
  return value;
}

function isTerminalJobStatus(status?: string | null) {
  const s = (status || "").toLowerCase();
  return s === "completed" || s === "failed";
}

function isActiveJobStatus(status?: string | null) {
  const s = (status || "").toLowerCase();
  return s === "pending" || s === "processing";
}

export default function MediaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const mediaId = params.id;

  const [media, setMedia] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [latestJob, setLatestJob] = useState<JobItem | null>(null);
  const [report, setReport] = useState<ParsedReport | null>(null);

  const [question, setQuestion] = useState("");

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [localMeta, setLocalMeta] = useState<LocalAnalysisMeta | null>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [pollFailures, setPollFailures] = useState(0);

  useEffect(() => {
    if (!mediaId) return;
    if (typeof window === "undefined") return;
    setLocalMeta(readLocalAnalysisMeta(mediaId));
  }, [mediaId]);

  useEffect(() => {
    if (!mediaId) return;

    async function loadMedia() {
      try {
        setLoading(true);
        setError(null);

        const data = await api.get<ApiMediaItem>(`/media/${mediaId}`);
        setMedia(mapApiMediaToUi(data));
      } catch (err: any) {
        console.error("Failed to load media", err);

        if (err?.status === 404) setError("Media not found.");
        else if (err?.status === 401)
          setError("You are not authorized. Please log in again.");
        else setError("Failed to load media details.");
      } finally {
        setLoading(false);
      }
    }

    loadMedia();
  }, [mediaId]);

  useEffect(() => {
    if (!mediaId) return;

    async function loadFileUrl() {
      try {
        const res = await fetchMediaFileUrl(mediaId);
        setMedia((prev) => (prev ? { ...prev, url: res.url } : prev));
      } catch (err) {
        console.error("Failed to fetch media file url", err);
      }
    }

    loadFileUrl();
  }, [mediaId]);

  useEffect(() => {
    if (!mediaId) return;

    let cancelled = false;

    async function loadConversation() {
      try {
        const convo = await fetchConversation(mediaId);
        if (cancelled) return;
        setMessages(convo.messages || []);
      } catch (err: any) {
        console.error("Failed to load conversation", err);
      }
    }

    loadConversation();

    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const loadJobsOnce = useCallback(async () => {
    if (!mediaId) return;

    try {
      const jobs = await api.get<JobItem[]>(`/media/${mediaId}/jobs`);

      setPollFailures(0);

      if (jobs.length > 0) {
        const latest = jobs[0];
        setLatestJob(latest);

        if (latest.output_json) {
          try {
            setReport(JSON.parse(latest.output_json) as ParsedReport);
          } catch (e) {
            console.error("Failed to parse job.output_json", e);
            setReport(null);
          }
        } else {
          setReport(null);
        }
      } else {
        setLatestJob(null);
        setReport(null);
      }
    } catch (e) {
      console.error("Failed to load jobs for media", e);
      setPollFailures((n) => Math.min(n + 1, 6));
    }
  }, [mediaId]);

  const getJobsPollDelay = useCallback((): number | null => {
    if (latestJob && isTerminalJobStatus(latestJob.status)) return null;

    if (pollFailures > 0) {
      const base = 2000 * Math.pow(2, pollFailures - 1);
      return Math.min(base, 30_000);
    }

    if (!latestJob) return 3000;
    if (isActiveJobStatus(latestJob.status)) return 2000;
    return 10_000;
  }, [latestJob, pollFailures]);

  useEffect(() => {
    loadJobsOnce();
  }, [loadJobsOnce]);

  useSmartPolling({
    enabled: !!mediaId,
    getDelayMs: getJobsPollDelay,
    tick: loadJobsOnce,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadPdfUrl() {
      setPdfUrl(null);

      if (!latestJob) return;
      if ((latestJob.status || "").toLowerCase() !== "completed") return;

      try {
        const res = await api.get<{ url: string }>(
          `/jobs/${latestJob.id}/pdf-url`
        );
        if (cancelled) return;
        setPdfUrl(res?.url || null);
      } catch {
        if (!cancelled) setPdfUrl(null);
      }
    }

    loadPdfUrl();
    return () => {
      cancelled = true;
    };
  }, [latestJob?.id, latestJob?.status]);

  const mediaTypeLabel = useMemo(() => {
    if (!media) return "";
    return media.mediaType === "video" ? "Video" : "Image";
  }, [media]);

  const statusBadgeClass = useMemo(() => {
    if (!media) return "badge";
    if (media.status === "ready") return "badge badge-success";
    if (media.status === "processing" || media.status === "uploading")
      return "badge badge-warning";
    return "badge badge-danger";
  }, [media]);

  const jobBadgeClass = useMemo(() => {
    if (!latestJob) return "badge";
    const s = latestJob.status?.toLowerCase();
    if (s === "completed") return "badge badge-success";
    if (s === "processing" || s === "pending") return "badge badge-warning";
    return "badge badge-danger";
  }, [latestJob]);

  const effectiveMeta = useMemo(() => {
    const backend = {
      analysisType: media?.analysisType ?? null,
      notes: media?.notes ?? null,
      location: media?.location ?? null,
      date: media?.captureDate ?? null,
    };

    const local = {
      analysisType: localMeta?.analysisType ?? null,
      notes: localMeta?.notes ?? null,
      location: localMeta?.location ?? null,
      date: localMeta?.date ?? null,
    };

    return {
      analysisType: backend.analysisType || local.analysisType,
      notes: backend.notes || local.notes,
      location: backend.location || local.location,
      date: backend.date || local.date,
    };
  }, [media, localMeta]);

  const prettyMetaDate = formatDateForDisplay(effectiveMeta.date);
  const prettyMetaType = prettyAnalysisType(effectiveMeta.analysisType);

  const hasAnyMeta =
    !!prettyMetaType ||
    !!effectiveMeta.location ||
    !!prettyMetaDate ||
    !!effectiveMeta.notes;

  const handleDelete = async () => {
    if (!media) return;

    const ok = window.confirm(
      "Delete this media and its jobs? This cannot be undone."
    );
    if (!ok) return;

    try {
      setIsDeleting(true);
      await deleteMedia(media.id);
      router.push("/library");
    } catch (err: any) {
      console.error("Failed to delete media", err);
      const detail =
        (err?.body && (err.body as any).detail) ||
        err?.message ||
        "Failed to delete media.";
      alert(String(detail));
    } finally {
      setIsDeleting(false);
    }
  };

  // ✅ FIXED: use askMediaQuestion (from conversationsClient)
  const handleAsk = async () => {
    const trimmed = question.trim();
    if (!trimmed || !media) return;

    setQuestion("");
    setAskError(null);
    setIsAsking(true);

    try {
      const res = await askMediaQuestion(media.id, {
        prompt: trimmed,
        job_id: null,
        report_summary: report?.summary ? String(report.summary) : null,
      });

      setMessages((prev) => [...prev, res.user_message, res.assistant_message]);
    } catch (err: any) {
      console.error("Failed to ask Rukmer GPT", err);
      const detail =
        (err?.body && (err.body as any).detail) ||
        err?.message ||
        "Failed to get a response from Rukmer GPT.";
      setAskError(String(detail));
    } finally {
      setIsAsking(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-64px)] bg-background">
        <div className="container-app py-12 flex items-center justify-center">
          <div className="card p-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted">Loading media…</p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !media) {
    return (
      <main className="min-h-[calc(100vh-64px)] bg-background">
        <div className="container-app py-12 flex items-center justify-center">
          <div className="card p-6">
            <p className="text-sm text-[color-mix(in_srgb,var(--danger)_85%,var(--foreground))]">
              {error ?? "Media not found"}
            </p>
            <div className="mt-4">
              <Link href="/library" className="btn btn-outline">
                <ArrowLeft className="h-4 w-4" />
                Back to Library
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-background">
      <div className="container-app py-8">
        {/* Header */}
        <div className="card p-6 md:p-7 overflow-hidden relative">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] blur-2xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--ring)_14%,transparent)] blur-2xl" />

          <div className="relative flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <Link href="/library" className="btn btn-ghost">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Library
                </Link>

                <div className="mt-3">
                  <div className="inline-flex items-center gap-2 badge">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    Media detail
                  </div>

                  <h1 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">
                    {media.filename}
                  </h1>

                  <p className="mt-2 text-sm text-muted">
                    Uploaded{" "}
                    <span className="font-semibold">
                      {new Date(media.createdAt).toLocaleString()}
                    </span>
                    .
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={statusBadgeClass}>
                      Status: {media.status}
                    </span>

                    <span className="badge">
                      {media.mediaType === "video" ? (
                        <VideoIcon className="h-3.5 w-3.5" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5" />
                      )}
                      {mediaTypeLabel}
                    </span>

                    {latestJob && (
                      <span className={jobBadgeClass}>
                        Job #{latestJob.id}: {latestJob.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start md:items-end flex-col gap-2">
                <div className="text-right">
                  <div className="text-xs text-muted">Media ID</div>
                  <div className="text-xs font-mono text-foreground break-all max-w-[22rem]">
                    {media.id}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="btn btn-danger"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[2fr_1.1fr] gap-6">
          {/* LEFT: Preview + Chat */}
          <div className="space-y-6">
            <div className="card p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Media preview</div>
                <span className="badge">
                  {media.mediaType === "video" ? (
                    <VideoIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  {mediaTypeLabel}
                </span>
              </div>

              <div className="rounded-[var(--radius)] border border-border overflow-hidden bg-[color-mix(in_srgb,var(--card)_70%,transparent)]">
                <div className="aspect-video bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] flex items-center justify-center">
                  {media.mediaType === "video" ? (
                    <video
                      src={media.url}
                      className="w-full h-full object-contain"
                      controls
                      muted
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={media.url}
                      alt={media.filename}
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="card p-4 md:p-5 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <div className="text-sm font-semibold">Rukmer GPT</div>
                </div>
                <div className="text-xs text-muted">
                  Ask about this media & report
                </div>
              </div>

              <div className="mt-3 flex-1 overflow-y-auto space-y-3 pr-1 min-h-[220px]">
                {messages.length === 0 ? (
                  <div className="text-sm text-muted">
                    No questions yet. Try:
                    <div className="mt-1 font-semibold">
                      “Summarize the current roof condition.”
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-[var(--radius)] border border-border p-3 ${
                        m.role === "user"
                          ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                          : "bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold">
                          {m.role === "user" ? "You" : "Rukmer GPT"}
                        </div>
                        <div className="text-[11px] text-muted">
                          {new Date(m.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <textarea
                  placeholder="Ask about roof condition, damage, next steps…"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={3}
                  className="input resize-none"
                />

                <button
                  type="button"
                  onClick={handleAsk}
                  disabled={isAsking || !question.trim()}
                  className={`btn btn-primary w-full mt-3 ${
                    isAsking || !question.trim()
                      ? "opacity-60 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {isAsking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Asking…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Ask Rukmer GPT
                    </>
                  )}
                </button>

                {askError && (
                  <div className="mt-3 card-soft p-3 border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]">
                    <p className="text-sm text-[color-mix(in_srgb,var(--danger)_85%,var(--foreground))]">
                      {askError}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Metadata + Latest Job + Report */}
          <div className="space-y-6">
            {hasAnyMeta && (
              <div className="card p-4 md:p-5">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <div className="text-sm font-semibold">Analysis metadata</div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {prettyMetaType ? (
                    <div className="flex items-start gap-2">
                      <Tag className="h-4 w-4 mt-0.5 text-muted" />
                      <div>
                        <div className="text-xs text-muted">Type</div>
                        <div className="font-semibold">{prettyMetaType}</div>
                      </div>
                    </div>
                  ) : null}

                  {effectiveMeta.location ? (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted" />
                      <div>
                        <div className="text-xs text-muted">Location</div>
                        <div className="font-semibold">
                          {effectiveMeta.location}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {prettyMetaDate ? (
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 mt-0.5 text-muted" />
                      <div>
                        <div className="text-xs text-muted">Date</div>
                        <div className="font-semibold">{prettyMetaDate}</div>
                      </div>
                    </div>
                  ) : null}

                  {effectiveMeta.notes ? (
                    <div className="flex items-start gap-2 sm:col-span-2">
                      <StickyNote className="h-4 w-4 mt-0.5 text-muted" />
                      <div>
                        <div className="text-xs text-muted">Notes</div>
                        <div className="font-semibold whitespace-pre-wrap">
                          {effectiveMeta.notes}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 text-xs text-muted">
                  Source: backend (fallback to local cache only if missing).
                </div>
              </div>
            )}

            {latestJob && (
              <div className="card p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Latest job</div>
                    <div className="mt-1 text-sm text-muted">
                      <span className="font-mono">#{latestJob.id}</span> •{" "}
                      {latestJob.job_type}
                    </div>
                    <div className="mt-2 text-xs text-muted">
                      Updated{" "}
                      <span className="font-mono">
                        {new Date(latestJob.updated_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <span className={jobBadgeClass}>{latestJob.status}</span>
                </div>
              </div>
            )}

            <div className="card p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <div className="text-sm font-semibold">AI Roof Report</div>
                </div>

                <div className="flex items-center gap-2">
                  {latestJob ? (
                    <span className={jobBadgeClass}>{latestJob.status}</span>
                  ) : null}

                  {pdfUrl ? (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline"
                    >
                      <FileText className="h-4 w-4" />
                      Download PDF
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="mt-3">
                {!latestJob ? (
                  <p className="text-sm text-muted">
                    No job found for this media yet.
                  </p>
                ) : latestJob && !report ? (
                  <p className="text-sm text-muted">
                    Report not ready or failed to parse.
                  </p>
                ) : report?.summary ? (
                  <p className="text-sm text-foreground">{report.summary}</p>
                ) : (
                  <p className="text-sm text-muted">No summary provided.</p>
                )}

                {report?.processed_at && (
                  <div className="mt-3 text-xs text-muted">
                    Processed at{" "}
                    <span className="font-mono">{report.processed_at}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-outline">
            Home
          </Link>
          <Link href="/library" className="btn btn-outline">
            Library
          </Link>
          <Link href="/job" className="btn btn-outline">
            Jobs
          </Link>
          <Link href="/analysis" className="btn btn-primary">
            Start New Analysis
          </Link>
        </div>
      </div>
    </main>
  );
}

function mapApiMediaToUi(item: ApiMediaItem) {
  return {
    id: item.id,
    filename: item.filename,
    mediaType: item.media_type,
    status: item.status,
    url:
      item.thumbnail_url ??
      "https://via.placeholder.com/1200x700?text=No+Preview",
    createdAt: item.created_at,

    analysisType: item.analysis_type ?? null,
    notes: item.notes ?? null,
    location: item.location ?? null,
    captureDate: item.capture_date ?? null,
  };
}