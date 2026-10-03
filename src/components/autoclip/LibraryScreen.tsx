"use client";

import { Job } from "@/lib/autoclip";
import {
  Film, Sparkles, Trash2, CheckCircle2, AlertTriangle, Loader2, Clock3, Play,
} from "lucide-react";

/**
 * Library screen — job history as glass cards.
 * Tap a card to reopen that job in the Generate screen.
 */
export function LibraryScreen({
  history,
  onOpen,
  onDelete,
  onGoCreate,
}: {
  history: Job[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onGoCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <header className="ac-rise flex items-end justify-between px-1 pt-2">
        <div>
          <h2 className="text-[22px] font-extrabold leading-tight tracking-tight text-white">Library</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {history.length > 0 ? `${history.length} job${history.length > 1 ? "s" : ""} · tap to reopen` : "Your clip history"}
          </p>
        </div>
      </header>

      {history.length === 0 ? (
        <section
          aria-label="No history"
          className="ac-rise flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center"
        >
          <span className="relative flex h-16 w-16 items-center justify-center" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-violet-500/10" />
            <Film className="h-8 w-8 text-zinc-600" strokeWidth={1.5} />
            <Sparkles className="absolute -right-1 -top-1 h-5 w-5 text-fuchsia-400" strokeWidth={1.5} />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-zinc-300">Your clips will appear here</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Every job you generate is saved here — reopen to re-download or restyle.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoCreate}
            aria-label="Create your first clip"
            className="ac-cta-ring mt-1 transition-transform duration-200 active:scale-[0.97]"
          >
            <span className="flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 text-[13px] font-bold text-white">
              <Sparkles className="h-4 w-4" strokeWidth={1.5} /> Create your first clip
            </span>
          </button>
        </section>
      ) : (
        <div className="space-y-3">
          {history.map((h, i) => (
            <HistoryCard key={h.id} job={h} onOpen={onOpen} onDelete={onDelete} delay={i * 60} />
          ))}
        </div>
      )}
    </div>
  );
}

const ACTIVE_STATUSES = ["queued", "downloading", "transcribing", "analyzing", "rendering", "uploading"];

function HistoryCard({
  job, onOpen, onDelete, delay,
}: {
  job: Job;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  delay: number;
}) {
  const active = ACTIVE_STATUSES.includes(job.status);
  const failed = job.status === "failed" || job.status === "failed_permanent";
  const canceled = job.status === "canceled";
  const done = job.status === "done";
  const title = job.video_title || job.source_url || "Uploaded video";
  const canDelete = done || failed || canceled;

  return (
    <div className="ac-rise relative" style={{ animationDelay: `${delay}ms` }}>
      <button
        type="button"
        onClick={() => onOpen(job.id)}
        aria-label={`Open job: ${title}`}
        className="glass flex w-full items-center gap-3.5 rounded-3xl p-4 text-left transition-transform duration-200 active:scale-[0.98]"
      >
        {/* icon tile */}
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            done
              ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_6px_18px_-6px_rgba(139,92,246,0.7)]"
              : active
                ? "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/30"
                : failed
                  ? "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-400/25"
                  : "bg-white/[0.05] text-zinc-400 ring-1 ring-inset ring-white/10"
          }`}
          aria-hidden="true"
        >
          {done ? (
            <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />
          ) : active ? (
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
          ) : failed ? (
            <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
          ) : (
            <Film className="h-5 w-5" strokeWidth={1.5} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-white">{title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
            {/* status chip */}
            <span
              className={`flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-semibold ${
                done
                  ? "bg-emerald-400/15 text-emerald-300"
                  : active
                    ? "bg-violet-500/15 text-violet-300"
                    : failed
                      ? "bg-red-500/15 text-red-300"
                      : "bg-zinc-500/15 text-zinc-400"
              }`}
            >
              {active && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" aria-hidden="true" />}
              {done ? "Done" : active ? "Running" : failed ? "Failed" : "Canceled"}
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <Clock3 className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
              {timeAgo(job.create_time)}
            </span>
            {job.clips.length > 0 && (
              <span className="flex items-center gap-1">
                <Play className="h-3 w-3" strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
                {job.clips.length} clip{job.clips.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </button>

      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(job.id)}
          aria-label={`Delete job: ${title}`}
          className="ac-hit glass absolute -right-1.5 -top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-red-300 active:scale-90"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
