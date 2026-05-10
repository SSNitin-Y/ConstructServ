// frontend/app/library/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  fetchMediaList,
  requestUploadIntent,
  markMediaReady,
  fetchMediaFileUrl,
  createJobForMedia,
  deleteMedia,
  bulkDeleteMedia,
} from "@/lib/mediaClient";
import { fetchJobPdfUrl, retryJobPdf } from "@/lib/jobsClient";

import type {
  MediaListItem as ApiMediaListItem,
  MediaUploadIntentRequest,
  AiStatus as ApiAiStatus,
} from "@/types/media";

import {
  Upload,
  Trash2,
  CheckSquare,
  Square,
  ExternalLink,
  RefreshCw,
  FileText,
} from "lucide-react";

import { useCachedList } from "@/lib/useCachedList";
import { cacheSet } from "@/lib/simpleCache";
import { startBusy, stopBusy } from "@/lib/authActivity";

type MediaType = "image" | "video";
type AiStatus = "none" | "running" | "ready" | "failed";

type MediaItem = {
  id: string;
  filename: string;
  mediaType: MediaType;
  status: "uploading" | "processing" | "ready" | "failed";
  thumbnailUrl?: string;
  createdAt: string;

  aiStatus: AiStatus;
  latestJobId: number | null;
  latestJobStatus: string | null;
  latestJobType: string | null;
};

type ApiMediaListResponse = {
  items: ApiMediaListItem[];
};

function normalizeAiStatus(s?: ApiAiStatus | string | null): AiStatus {
  if (!s) return "none";
  if (s === "none" || s === "running" || s === "ready" || s === "failed") return s;
  return "none";
}

function mapApiToUi(item: ApiMediaListItem): MediaItem {
  return {
    id: item.id,
    filename: item.filename,
    mediaType: item.media_type,
    status: item.status,
    thumbnailUrl: item.thumbnail_url ?? undefined,
    createdAt: item.created_at,

    aiStatus: normalizeAiStatus(item.ai_status ?? null),
    latestJobId: item.latest_job_id ?? null,
    latestJobStatus: item.latest_job_status ?? null,
    latestJobType: item.latest_job_type ?? null,
  };
}

function shouldPollLibrary(list: MediaItem[] | null) {
  if (!list || list.length === 0) return false;
  return list.some((i) => {
    const job = (i.latestJobStatus || "").toLowerCase();
    const uploading = i.status === "uploading";
    const processing = i.status === "processing";
    const aiRunning = i.aiStatus === "running";
    const jobRunning = job === "pending" || job === "processing";
    return uploading || processing || aiRunning || jobRunning;
  });
}

export default function LibraryPage() {
  // ✅ bump key to wipe old cached data that still references deleted job ids
  const cacheKey = "library:list:includeAi:v2";

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    data: cachedItems,
    loading,
    error,
    refresh: refreshMedia,
    isLive,
  } = useCachedList<MediaItem[]>({
    cacheKey,
    fetcher: async () => {
      const res: ApiMediaListResponse = await fetchMediaList({ includeAi: true });
      return res.items.map(mapApiToUi);
    },
    shouldPoll: shouldPollLibrary,
  });

  const [items, setItems] = useState<MediaItem[]>(() => cachedItems ?? []);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ✅ allow null to mean “checked but missing”
  const [pdfUrlByJobId, setPdfUrlByJobId] = useState<Record<number, string | null>>({});

  // ✅ retry state
  const [retryingJobId, setRetryingJobId] = useState<number | null>(null);

  useEffect(() => {
    if (cachedItems) {
      setItems(cachedItems);

      setSelectedIds((prev) => {
        const next = new Set<string>();
        const allowed = new Set(cachedItems.map((m) => m.id));
        prev.forEach((id) => {
          if (allowed.has(id)) next.add(id);
        });
        return next;
      });

      // ✅ also prune pdf cache for job ids that aren't present anymore (helps remove stale ids)
      const liveJobIds = new Set(
        cachedItems
          .map((x) => x.latestJobId)
          .filter((id): id is number => typeof id === "number" && id > 0)
      );
      setPdfUrlByJobId((prev) => {
        const next: Record<number, string | null> = {};
        for (const [k, v] of Object.entries(prev)) {
          const jobId = Number(k);
          if (liveJobIds.has(jobId)) next[jobId] = v;
        }
        return next;
      });
    }
  }, [cachedItems]);

  const loadMedia = useCallback(async () => {
    await refreshMedia();
  }, [refreshMedia]);

  useEffect(() => {
    const needsPreview = items.filter((i) => i.status === "ready" && !i.thumbnailUrl);
    if (needsPreview.length === 0) return;

    needsPreview.forEach((item) => {
      fetchMediaFileUrl(item.id)
        .then((res) => {
          setItems((prev) =>
            prev.map((m) => (m.id === item.id ? { ...m, thumbnailUrl: res.url } : m))
          );
        })
        .catch((err) => console.error("Failed to load preview for media", item.id, err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => `${i.id}:${i.status}:${i.thumbnailUrl ?? ""}`).join("|")]);

  // ✅ PDF hydration: only fetch once per jobId; store null when missing
  useEffect(() => {
    let cancelled = false;

    async function hydratePdfUrls() {
      const jobIdsToFetch = items
        .map((i) => i.latestJobId)
        .filter((id): id is number => typeof id === "number" && id > 0)
        .filter((jobId) => {
          const item = items.find((x) => x.latestJobId === jobId);
          const isCompleted = (item?.latestJobStatus || "").toLowerCase() === "completed";
          const alreadyChecked = Object.prototype.hasOwnProperty.call(pdfUrlByJobId, jobId);
          return isCompleted && !alreadyChecked;
        });

      if (jobIdsToFetch.length === 0) return;

      for (const jobId of jobIdsToFetch) {
        const res = await fetchJobPdfUrl(jobId); // returns {url} | null
        if (cancelled) return;

        setPdfUrlByJobId((prev) => ({
          ...prev,
          [jobId]: res?.url ?? null, // ✅ null = checked but missing/deleted
        }));
      }
    }

    hydratePdfUrls();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => `${i.id}:${i.latestJobId ?? ""}:${i.latestJobStatus ?? ""}`).join("|")]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    startBusy("library upload");

    try {
      setUploadProgress(0);

      const media_type: MediaUploadIntentRequest["media_type"] =
        file.type.startsWith("video/") ? "video" : "image";

      const payload: MediaUploadIntentRequest = {
        filename: file.name,
        media_type,
        content_type: file.type || undefined,
        size_bytes: file.size,
      };

      const intent = await requestUploadIntent(payload);

      await uploadFileToGcsWithProgress(
        file,
        intent.upload_url,
        intent.media.id,
        intent.upload_headers ?? undefined,
        (p) => setUploadProgress(p)
      );

      await loadMedia();
    } catch (err) {
      console.error("Failed to upload media", err);
    } finally {
      stopBusy("library upload");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadProgress(null);
    }
  };

  // ✅ Retry PDF handler
  const handleRetryPdf = async (jobId: number) => {
    try {
      setRetryingJobId(jobId);
      await retryJobPdf(jobId);

      // refresh list so latest job status updates
      await loadMedia();

      // clear cached pdf url so hydration can refetch
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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const allSelected = useMemo(() => {
    if (items.length === 0) return false;
    return items.every((i) => selectedIds.has(i.id));
  }, [items, selectedIds]);

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      const shouldSelectAll = !(items.length > 0 && items.every((i) => prev.has(i.id)));
      if (shouldSelectAll) items.forEach((i) => next.add(i.id));
      return next;
    });
  };

  const handleDeleteOne = async (id: string) => {
    const ok = window.confirm("Delete this media and its jobs? This cannot be undone.");
    if (!ok) return;

    try {
      setDeletingId(id);
      await deleteMedia(id);

      setItems((prev) => {
        const next = prev.filter((m) => m.id !== id);
        cacheSet(cacheKey, next);
        return next;
      });

      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err: any) {
      console.error("Failed to delete media", err);
      alert((err?.body && (err.body as any).detail) || err?.message || "Failed to delete media.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const ok = window.confirm(
      `Delete ${ids.length} media item(s) and their jobs? This cannot be undone.`
    );
    if (!ok) return;

    try {
      setIsBulkDeleting(true);
      await bulkDeleteMedia(ids);

      setItems((prev) => {
        const next = prev.filter((m) => !selectedIds.has(m.id));
        cacheSet(cacheKey, next);
        return next;
      });

      clearSelection();
    } catch (err: any) {
      console.error("Failed to bulk delete media", err);
      alert(
        (err?.body && (err.body as any).detail) ||
          err?.message ||
          "Failed to delete selected media."
      );
    } finally {
      setIsBulkDeleting(false);
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
                  Media Library • uploads + previews
                </div>

                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                  Media Library
                </h1>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/" className="btn btn-ghost">
                    Home
                  </Link>
                  <Link href="/analysis" className="btn btn-outline">
                    New Analysis
                  </Link>
                  <Link href="/job" className="btn btn-outline">
                    Jobs
                  </Link>
                </div>
              </div>

              <div className="flex flex-col items-start md:items-end gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={loadMedia}
                    disabled={loading}
                    title={isLive ? "Auto-updating while items run" : "Refresh media"}
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <button type="button" className="btn btn-primary" onClick={handleUploadClick}>
                    <Upload className="h-4 w-4" />
                    Upload
                  </button>
                </div>

                {uploadProgress !== null && (
                  <div className="w-full md:w-72 card-soft p-3">
                    <div className="flex justify-between text-xs text-muted">
                      <span>Uploading…</span>
                      <span>{uploadProgress.toFixed(0)}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[color-mix(in_srgb,var(--border)_60%,transparent)]">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button type="button" className="btn btn-outline" onClick={toggleSelectAll}>
                      {allSelected ? (
                        <>
                          <CheckSquare className="h-4 w-4" /> Unselect all
                        </>
                      ) : (
                        <>
                          <Square className="h-4 w-4" /> Select all
                        </>
                      )}
                    </button>
                  )}

                  {selectedIds.size > 0 && (
                    <>
                      <button type="button" className="btn btn-outline" onClick={clearSelection}>
                        Clear ({selectedIds.size})
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteSelected}
                        disabled={isBulkDeleting}
                        className={`btn btn-danger ${
                          isBulkDeleting ? "opacity-70 cursor-not-allowed" : ""
                        }`}
                      >
                        <Trash2 className="h-4 w-4" />
                        {isBulkDeleting ? "Deleting…" : `Delete Selected (${selectedIds.size})`}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8">
              {loading && items.length === 0 ? (
                <div className="card-soft p-5">
                  <p className="text-sm text-muted">Loading your media…</p>
                </div>
              ) : error ? (
                <div className="card-soft p-5">
                  <p className="text-sm text-[color-mix(in_srgb,var(--danger)_85%,var(--foreground))]">
                    Error: {error}
                  </p>
                </div>
              ) : items.length === 0 ? (
                <div className="card-soft p-5">
                  <p className="text-sm text-muted">
                    No media yet. Click <span className="font-semibold">Upload</span> to add your
                    first image or video.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((item) => {
                    const checked = selectedIds.has(item.id);
                    const isDeleting = deletingId === item.id;

                    const pdfUrl = item.latestJobId ? pdfUrlByJobId[item.latestJobId] : null;

                    const showRetryPdf =
                      !!item.latestJobId &&
                      (item.latestJobStatus || "").toLowerCase() === "failed" &&
                      (item.latestJobType || "").toLowerCase() === "roof_report";

                    const isRetrying = retryingJobId === item.latestJobId;

                    return (
                      <div key={item.id} className="card overflow-hidden">
                        <div className="relative aspect-video bg-[color-mix(in_srgb,var(--card-2)_55%,transparent)]">
                          <label className="absolute top-3 left-3 z-10 inline-flex items-center gap-2 rounded-full px-3 py-1 bg-[color-mix(in_srgb,var(--card)_70%,transparent)] border border-border backdrop-blur">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelected(item.id)}
                              className="h-4 w-4"
                            />
                            <span className="text-xs font-semibold">Select</span>
                          </label>

                          {item.thumbnailUrl ? (
                            item.mediaType === "video" ? (
                              <video
                                src={item.thumbnailUrl}
                                className="w-full h-full object-cover"
                                controls
                                muted
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.thumbnailUrl}
                                alt={item.filename}
                                className="w-full h-full object-cover"
                              />
                            )
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-muted">
                              No preview yet
                            </div>
                          )}
                        </div>

                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{item.filename}</p>
                              <p className="text-xs text-muted mt-1">
                                Uploaded:{" "}
                                <span className="font-mono">
                                  {new Date(item.createdAt).toLocaleString()}
                                </span>
                              </p>
                            </div>
                            <span className="badge">{item.mediaType}</span>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <StatusBadge status={item.status} />
                            <Link
                              href={`/media/${item.id}`}
                              className="text-sm font-semibold inline-flex items-center gap-1 underline"
                            >
                              Open <ExternalLink className="h-4 w-4" />
                            </Link>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <AiStatusBadge status={item.aiStatus} />

                            <div className="flex items-center gap-3 flex-wrap justify-end">
                              {item.latestJobId ? (
                                <>
                                  <Link
                                    href={`/job?job_id=${item.latestJobId}`}
                                    className="text-sm font-semibold inline-flex items-center gap-1 underline"
                                    title={`Job #${item.latestJobId}`}
                                  >
                                    View job <ExternalLink className="h-4 w-4" />
                                  </Link>

                                  {pdfUrl ? (
                                    <a
                                      href={pdfUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sm font-semibold inline-flex items-center gap-1 underline"
                                      title="Open PDF report"
                                    >
                                      <FileText className="h-4 w-4" />
                                      PDF <ExternalLink className="h-4 w-4" />
                                    </a>
                                  ) : null}

                                  {showRetryPdf ? (
                                    <button
                                      type="button"
                                      onClick={() => handleRetryPdf(item.latestJobId!)}
                                      disabled={isRetrying}
                                      className="btn btn-outline py-1 px-3 text-sm whitespace-nowrap"
                                      title="Retry generating the PDF for this job"
                                    >
                                      <RefreshCw
                                        className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
                                      />
                                      {isRetrying ? "Retrying…" : "Retry PDF"}
                                    </button>
                                  ) : null}
                                </>
                              ) : (
                                <span className="text-xs text-muted">No job yet</span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteOne(item.id)}
                              disabled={isDeleting}
                              className={`btn btn-danger w-full ${
                                isDeleting ? "opacity-70 cursor-not-allowed" : ""
                              }`}
                            >
                              <Trash2 className="h-4 w-4" />
                              {isDeleting ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: MediaItem["status"] }) {
  const label =
    status === "ready"
      ? "Ready"
      : status === "processing"
      ? "Processing"
      : status === "uploading"
      ? "Uploading"
      : "Failed";

  const cls =
    status === "ready"
      ? "badge badge-success"
      : status === "processing"
      ? "badge badge-warning"
      : status === "uploading"
      ? "badge"
      : "badge badge-danger";

  return <span className={cls}>{label}</span>;
}

function AiStatusBadge({ status }: { status: AiStatus }) {
  const label =
    status === "none"
      ? "No analysis"
      : status === "running"
      ? "Running"
      : status === "ready"
      ? "Ready"
      : "Failed";

  const cls =
    status === "ready"
      ? "badge badge-success"
      : status === "running"
      ? "badge badge-warning"
      : status === "failed"
      ? "badge badge-danger"
      : "badge";

  return <span className={cls}>AI: {label}</span>;
}

function uploadFileToGcsWithProgress(
  file: File,
  uploadUrl: string,
  mediaId: string,
  uploadHeaders: Record<string, string> | undefined,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = (event.loaded / event.total) * 100;
        onProgress(percent);
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        try {
          await markMediaReady(mediaId);
          await createJobForMedia(mediaId, "roof_report");
        } catch (err) {
          console.error("Failed to mark media ready / create job", err);
        }
        resolve();
      } else {
        console.error("Upload failed:", xhr.status, xhr.responseText);
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));

    xhr.open("PUT", uploadUrl);

    if (uploadHeaders) {
      for (const [k, v] of Object.entries(uploadHeaders)) {
        xhr.setRequestHeader(k, v);
      }
    } else {
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    }

    xhr.send(file);
  });
}
