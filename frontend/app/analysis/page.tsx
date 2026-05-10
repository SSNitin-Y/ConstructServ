// frontend/app/analysis/page.tsx

"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Upload,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import {
  requestUploadIntent,
  markMediaReady,
  createJobForMedia,
} from "@/lib/mediaClient";
import type { MediaUploadIntentRequest } from "@/types/media";
import { startBusy, stopBusy } from "@/lib/authActivity";
import { getStoredToken } from "@/lib/authClient";

type AnalysisType = "roof";

// ============================================================================
// Date utilities
// ============================================================================
const toYyyyMmDd = (d?: Date): string | null => {
  if (!d || Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatForInput = (d?: Date): string => toYyyyMmDd(d) ?? "";

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

const addMonths = (d: Date, delta: number) =>
  new Date(d.getFullYear(), d.getMonth() + delta, 1);

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isSameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

// ============================================================================
// DatePickerInput (unchanged)
// ============================================================================
function DatePickerInput(props: {
  value?: Date;
  onChange: (d: Date | undefined) => void;
  disabled?: boolean;
}) {
  const { value, onChange, disabled } = props;

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    startOfMonth(value ?? new Date())
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  } | null>(null);

  const [text, setText] = useState<string>(() => formatForInput(value));

  useEffect(() => {
    setText(formatForInput(value));
    if (value) setViewMonth(startOfMonth(value));
  }, [value]);

  const parseTypedDate = useCallback((raw: string): Date | null => {
    const s = raw.trim();
    if (!s) return null;

    const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m1) {
      const yyyy = Number(m1[1]);
      const mm = Number(m1[2]);
      const dd = Number(m1[3]);
      const d = new Date(yyyy, mm - 1, dd);
      if (
        d.getFullYear() === yyyy &&
        d.getMonth() === mm - 1 &&
        d.getDate() === dd
      ) {
        return d;
      }
      return null;
    }

    const m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m2) {
      const mm = Number(m2[1]);
      const dd = Number(m2[2]);
      const yyyy = Number(m2[3]);
      const d = new Date(yyyy, mm - 1, dd);
      if (
        d.getFullYear() === yyyy &&
        d.getMonth() === mm - 1 &&
        d.getDate() === dd
      ) {
        return d;
      }
      return null;
    }

    return null;
  }, []);

  const computePosition = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    const r = input.getBoundingClientRect();

    const POP_W = Math.min(360, r.width);
    const POP_H = 360;
    const GAP = 8;
    const PAD = 8;

    const maxLeft = Math.max(PAD, window.innerWidth - POP_W - PAD);
    const left = Math.min(Math.max(r.left, PAD), maxLeft);

    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < POP_H + GAP && spaceAbove > spaceBelow;

    let top = openUp ? r.top - POP_H - GAP : r.bottom + GAP;

    const minTop = PAD;
    const maxTop = window.innerHeight - POP_H - PAD;
    top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));

    if (!openUp) {
      const minDownTop = r.bottom + GAP;
      if (top < minDownTop) top = minDownTop;
    } else {
      const maxUpTop = r.top - POP_H - GAP;
      if (top > maxUpTop) top = maxUpTop;
      if (top < minTop) top = minTop;
    }

    setPos({ top, left, width: POP_W, openUp });
  }, []);

  useEffect(() => {
    if (!open) return;

    computePosition();
    window.addEventListener("scroll", computePosition, true);
    window.addEventListener("resize", computePosition);
    return () => {
      window.removeEventListener("scroll", computePosition, true);
      window.removeEventListener("resize", computePosition);
    };
  }, [open, computePosition]);

  const handleOutsideClick = useCallback((e: MouseEvent) => {
    const root = rootRef.current;
    const pop = popoverRef.current;

    const target = e.target;
    if (!(target instanceof Node)) return;

    const clickedInsideRoot = !!root && root.contains(target);
    const clickedInsidePopover = !!pop && pop.contains(target);

    if (!clickedInsideRoot && !clickedInsidePopover) setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open, handleOutsideClick]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const monthLabel = useMemo(
    () => viewMonth.toLocaleString(undefined, { month: "long", year: "numeric" }),
    [viewMonth]
  );

  const today = useMemo(() => new Date(), []);

  const days = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const startDay = first.getDay();
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startDay);

    const out: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push({ date: d, inMonth: isSameMonth(d, viewMonth) });
    }
    return out;
  }, [viewMonth]);

  const handleDayClick = useCallback(
    (date: Date) => {
      const chosen = new Date(date);
      onChange(chosen);
      setText(formatForInput(chosen));
      setOpen(false);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange(undefined);
    setText("");
    setOpen(false);
  }, [onChange]);

  const handleToday = useCallback(() => {
    const d = new Date();
    onChange(d);
    setText(formatForInput(d));
    setOpen(false);
  }, [onChange]);

  const handlePrevMonth = useCallback(() => {
    setViewMonth((m) => addMonths(m, -1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setViewMonth((m) => addMonths(m, 1));
  }, []);

  const typedDate = parseTypedDate(text);
  const isInvalid = text.trim().length > 0 && !typedDate;

  const popover =
    open && pos
      ? createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[9999]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="card p-4 border border-border shadow-lg">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{monthLabel}</div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost px-2"
                    onClick={handlePrevMonth}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-2"
                    onClick={handleNextMonth}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-xs text-muted">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {days.map(({ date }, idx) => {
                  const inMonth = isSameMonth(date, viewMonth);
                  const selected = value ? isSameDay(date, value) : false;
                  const isToday = isSameDay(date, today);

                  return (
                    <button
                      key={`${date.getTime()}-${idx}`}
                      type="button"
                      onClick={() => handleDayClick(date)}
                      className={[
                        "h-9 rounded-[var(--radius)] text-sm flex items-center justify-center border transition-colors",
                        inMonth
                          ? "border-border bg-card hover:border-primary"
                          : "border-transparent bg-transparent text-muted hover:bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)]",
                        selected
                          ? "border-primary bg-[color-mix(in_srgb,var(--primary)_14%,transparent)]"
                          : "",
                        isToday && !selected
                          ? "ring-1 ring-[color-mix(in_srgb,var(--ring)_35%,transparent)]"
                          : "",
                      ].join(" ")}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button type="button" className="btn btn-ghost" onClick={handleClear}>
                  Clear
                </button>
                <button type="button" className="btn btn-outline" onClick={handleToday}>
                  Today
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD (optional)"
          className={[
            "input w-full pr-10",
            isInvalid
              ? "border-[color-mix(in_srgb,var(--danger)_45%,var(--border))]"
              : "",
          ].join(" ")}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const raw = text.trim();
            if (!raw) {
              onChange(undefined);
              return;
            }
            const parsed = parseTypedDate(raw);
            if (parsed) {
              onChange(parsed);
              setText(formatForInput(parsed));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const raw = text.trim();
              if (!raw) {
                onChange(undefined);
                setOpen(false);
                return;
              }
              const parsed = parseTypedDate(raw);
              if (parsed) {
                onChange(parsed);
                setText(formatForInput(parsed));
                setOpen(false);
              }
            }
            if (e.key === "ArrowDown") {
              if (!disabled) setOpen(true);
            }
          }}
        />

        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost px-2"
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          disabled={disabled}
          aria-label="Open calendar"
        >
          <CalendarIcon className="h-4 w-4 text-muted" />
        </button>
      </div>

      {isInvalid && (
        <div className="mt-1 text-xs text-[color-mix(in_srgb,var(--danger)_85%,var(--foreground))]">
          Enter a valid date (YYYY-MM-DD or MM/DD/YYYY).
        </div>
      )}

      {popover}

      <input type="hidden" value={formatForInput(value)} readOnly />
    </div>
  );
}

// ============================================================================
// localStorage helper (unchanged)
// ============================================================================
const saveAnalysisMeta = (mediaId: string, meta: any) => {
  try {
    localStorage.setItem(`analysis_meta:${mediaId}`, JSON.stringify(meta));
  } catch {
    // ignore
  }
};

// ============================================================================
// ✅ Cloud PUT upload helper (GCS signed URL compatible)
// IMPORTANT: must send exactly signed headers from backend (e.g. Content-Type)
// ============================================================================
const uploadFileToCloudPutWithProgress = (
  file: File,
  uploadUrl: string,
  uploadHeaders: Record<string, string> | undefined,
  onProgress: (percent: number) => void
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = (event.loaded / event.total) * 100;
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timeout"));

    xhr.open("PUT", uploadUrl);

    // ✅ If backend provided signed headers, use them exactly
    if (uploadHeaders) {
      for (const [k, v] of Object.entries(uploadHeaders)) {
        xhr.setRequestHeader(k, v);
      }
    } else {
      // fallback
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    }

    xhr.timeout = 300000;
    xhr.send(file);
  });
};

// ============================================================================
// Page
// ============================================================================
export default function AnalysisPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
  const token = getStoredToken();
  if (!token) console.warn("No rukmer_token found – later redirect to /login.");
  }, []);

  const [analysisType, setAnalysisType] = useState<AnalysisType>("roof");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);

  const [dragOver, setDragOver] = useState(false);

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "finalizing" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const isBusy = phase === "uploading" || phase === "finalizing";

  const selectedLabel = useMemo(() => {
    if (analysisType === "roof") return "Roof Inspection";
    return "Analysis";
  }, [analysisType]);

  const handlePickFile = useCallback(() => fileInputRef.current?.click(), []);

  const handleFiles = useCallback(
    async (file: File) => {
      setError(null);
      setUploadProgress(0);
      setPhase("uploading");
      startBusy("analysis upload");

      try {
        const media_type: MediaUploadIntentRequest["media_type"] =
          file.type.startsWith("video/") ? "video" : "image";

        // NOTE: if your backend upload-intent schema doesn't include these meta fields yet,
        // you can delete analysis_type/notes/location/capture_date and uploads will still work.
        const payload: MediaUploadIntentRequest = {
          filename: file.name,
          media_type,
          content_type: file.type || undefined,
          size_bytes: file.size,

          analysis_type: analysisType === "roof" ? "roof_report" : undefined,
          notes: notes || undefined,
          location: location || undefined,
          capture_date: toYyyyMmDd(date) || undefined,
        } as any;

        const intent = await requestUploadIntent(payload);

        saveAnalysisMeta(intent.media.id, {
          analysisType,
          notes,
          location,
          date: date ? date.toISOString() : null,
          filename: file.name,
          createdAt: new Date().toISOString(),
        });

        // ✅ Upload with exact signed headers (GCS)
        await uploadFileToCloudPutWithProgress(
          file,
          intent.upload_url,
          (intent as any).upload_headers ?? undefined,
          setUploadProgress
        );

        setPhase("finalizing");
        await markMediaReady(intent.media.id);
        await createJobForMedia(intent.media.id, "roof_report");

        setPhase("done");
        setUploadProgress(100);
        router.push(`/media/${intent.media.id}`);
      } catch (err: any) {
        console.error("Analysis upload flow failed:", err);
        setPhase("error");

        const detail =
          (err?.body && (err.body as any).detail) ||
          err?.message ||
          "Upload failed. Please try again.";

        setError(String(detail));
        setUploadProgress(null);
      } finally {
        stopBusy("analysis upload");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [analysisType, notes, location, date, router]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (isBusy) return;
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      await handleFiles(file);
    },
    [isBusy, handleFiles]
  );

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await handleFiles(file);
    },
    [handleFiles]
  );

  const dragZoneClassName = useMemo(
    () =>
      [
        "rounded-[var(--radius)] border border-border bg-card p-8 transition-colors",
        dragOver ? "border-primary" : "",
        isBusy ? "opacity-70" : "hover:border-primary",
      ].join(" "),
    [dragOver, isBusy]
  );

  return (
    <main className="min-h-[calc(100vh-64px)] bg-background">
      <div className="container-app py-10">
        <div className="card p-8 md:p-10 overflow-hidden relative">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--primary)_22%,transparent)] blur-2xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--ring)_18%,transparent)] blur-2xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 badge mb-4">
              <span className="h-2 w-2 rounded-full bg-primary" />
              New analysis
            </div>

            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              {selectedLabel}
            </h1>
            <p className="mt-3 text-muted max-w-2xl">
              Upload an image or video. We’ll create the media record, start a
              job, and send you to the analysis detail page.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setAnalysisType("roof")}
                className={`card-soft p-5 text-left transition-colors ${
                  analysisType === "roof"
                    ? "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))]"
                    : ""
                }`}
                disabled={isBusy}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Roof Inspection</div>
                  <span className="badge">Available</span>
                </div>
                <div className="text-sm text-muted mt-1">
                  Creates a <span className="font-mono">roof_report</span> job.
                </div>
              </button>

              <div className="card-soft p-5 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Site Safety</div>
                  <span className="badge">Soon</span>
                </div>
                <div className="text-sm text-muted mt-1">
                  Coming later (different job type).
                </div>
              </div>

              <div className="card-soft p-5 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Damage Assessment</div>
                  <span className="badge">Soon</span>
                </div>
                <div className="text-sm text-muted mt-1">
                  Coming later (different job type).
                </div>
              </div>
            </div>

            <div className="mt-8 card-soft p-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={onFileChange}
                disabled={isBusy}
              />

              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (!isBusy) setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isBusy) setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                }}
                onDrop={onDrop}
                className={dragZoneClassName}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>

                  <div className="flex-1">
                    <div className="text-lg font-bold">Drop a file here, or browse</div>
                    <div className="text-sm text-muted mt-1">
                      Images & videos supported. Upload starts immediately.
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1 badge">
                        <ImageIcon className="h-3.5 w-3.5" />
                        JPG/PNG
                      </span>
                      <span className="inline-flex items-center gap-1 badge">
                        <VideoIcon className="h-3.5 w-3.5" />
                        MP4/MOV
                      </span>
                      <span className="inline-flex items-center gap-1 badge">
                        <Sparkles className="h-3.5 w-3.5" />
                        Job created automatically
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handlePickFile}
                      disabled={isBusy}
                      className="btn btn-primary"
                    >
                      {isBusy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Working…
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Choose file
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {uploadProgress !== null && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>
                        {phase === "uploading"
                          ? "Uploading…"
                          : phase === "finalizing"
                          ? "Finalizing (creating job)…"
                          : phase === "done"
                          ? "Done"
                          : " "}
                      </span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[color-mix(in_srgb,var(--border)_80%,transparent)] overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>

                    {phase === "done" && (
                      <div className="mt-3 inline-flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-[color-mix(in_srgb,var(--success)_85%,var(--foreground))]" />
                        <span className="text-muted">Upload complete. Redirecting…</span>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div className="mt-6 card-soft p-4 border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-[color-mix(in_srgb,var(--danger)_85%,var(--foreground))]" />
                      <div>
                        <div className="text-sm font-semibold">Upload failed</div>
                        <div className="text-sm text-muted mt-1">{error}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  className="input"
                  placeholder="Notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isBusy}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Location (optional)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={isBusy}
                />
                <DatePickerInput value={date} onChange={setDate} disabled={isBusy} />
              </div>
            </div>

            <div className="mt-6 text-xs text-muted">
              This page redirects you into <span className="font-mono">/media/[id]</span>{" "}
              after creating the job.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
