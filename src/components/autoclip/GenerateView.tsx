"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Job, Clip, ClipSettings, api, clipFileUrl, zipUrl, formatBytes, formatDur, ENGINE_PORT,
} from "@/lib/autoclip";
import {
  Download, FileArchive, Loader2, RefreshCw, X, Play, Eye, ClipboardList, HardDrive,
  AlertTriangle, CheckCircle2, Clock, Check, Film, Star, Sparkles, ChevronLeft,
  ArrowDownToLine, AudioLines, ScanSearch, Clapperboard, PartyPopper, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  download: "Downloading source",
  transcribe: "Transcribing speech",
  analyze: "Finding viral moments",
  render: "Rendering clips",
  upload: "Uploading",
  done: "Done",
};
const STAGES = ["download", "transcribe", "analyze", "render"] as const;
const STAGE_SHORT: Record<string, string> = {
  download: "Download",
  transcribe: "Transcribe",
  analyze: "Analyze",
  render: "Render",
};
const STAGE_ICON: Record<string, LucideIcon> = {
  download: ArrowDownToLine,
  transcribe: AudioLines,
  analyze: ScanSearch,
  render: Clapperboard,
};

export function GenerateView({
  job,
  settings,
  onCancel,
  onRetry,
  onRerender,
  onOpenStyle,
  onNew,
  onBack,
}: {
  job: Job;
  settings: ClipSettings;
  onCancel: () => void;
  onRetry: () => void;
  onRerender: (settings: ClipSettings) => void;
  onOpenStyle: () => void;
  onNew: () => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const active = ["queued", "downloading", "transcribing", "analyzing", "rendering", "uploading"].includes(job.status);
  const failed = job.status === "failed" || job.status === "failed_permanent";
  const done = job.status === "done";
  const [liveOpen, setLiveOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const timings = job.stage_timings || {};
  const progress = job.progress ?? 0;
  const indeterminate = active && (job.status === "queued" || progress <= 0.001);

  // ticking clock for elapsed / ETA readouts (presentational only)
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  // cancel needs a second tap within 3s — protects against accidental taps
  useEffect(() => {
    if (!confirmCancel) return;
    const id = setTimeout(() => setConfirmCancel(false), 3000);
    return () => clearTimeout(id);
  }, [confirmCancel]);

  const startMs = job.start_time > 1e12 ? job.start_time : job.start_time * 1000;
  const elapsedSec = active && startMs > 0 ? Math.max(0, (now - startMs) / 1000) : 0;
  const etaSec = active && progress > 0.08 && progress < 0.95 && elapsedSec > 3
    ? (elapsedSec * (1 - progress)) / progress
    : null;

  const cancelClick = () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setConfirmCancel(false);
    onCancel();
  };

  // pipeline line fill: reaches the current stage node (1.0 when finished)
  const stageIdx = STAGES.indexOf(job.stage as typeof STAGES[number]);
  const lineFrac = done ? 1 : Math.max(0, Math.min(3, stageIdx)) / 3;

  // skeleton placeholders while clips render (n = expected clips)
  const expected = settings.clip.maxClips === "auto" ? 3 : parseInt(settings.clip.maxClips, 10) || 3;
  const rendering = active && job.status === "rendering";
  const skeletons = rendering ? Math.max(0, expected - (job.clips?.length ?? 0)) : 0;

  return (
    <div className="space-y-4 pb-4">
      {/* top bar: back + title */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="ac-focus glass flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-zinc-300 transition-transform duration-200 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold leading-tight tracking-tight text-white">
            {active ? "Generating clips" : failed ? "Job failed" : job.status === "canceled" ? "Canceled" : "Clips ready"}
          </h2>
          <p className="truncate text-[11px] text-zinc-500">
            {job.video_title || job.source_url || "Uploaded video"}
          </p>
        </div>
      </div>

      {/* ACTIVE — pipeline hero */}
      {active && (
        <section aria-label="Job status" className="glass ac-rise overflow-hidden rounded-3xl">
          <div className="p-5">
            {/* pipeline visualization */}
            <div
              className="relative mx-auto max-w-[310px]"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={STAGE_LABELS[job.stage] || job.stage}
            >
              <div className="relative flex items-start justify-between">
                {/* base track + gradient fill between node centers */}
                <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-[22px] h-[3px] rounded-full bg-white/10" />
                <span
                  aria-hidden="true"
                  className="absolute left-[12.5%] top-[22px] h-[3px] rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700 ease-out"
                  style={{ width: `${75 * lineFrac}%` }}
                />
                {STAGES.map((s, i) => {
                  const stageDone = timings[s] !== undefined;
                  // when queued (stage not yet known) the first node pulses to show liveness
                  const current = job.stage === s || (job.status === "queued" && i === 0);
                  const Icon = STAGE_ICON[s];
                  return (
                    <div key={s} className="relative z-10 flex w-[56px] flex-col items-center gap-1.5">
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-300 ${
                          stageDone
                            ? "border-transparent bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_6px_18px_-6px_rgba(139,92,246,0.8)]"
                            : current
                              ? "ac-glow border-violet-400/60 bg-violet-500/15 text-violet-200"
                              : "border-white/10 bg-white/[0.03] text-zinc-600"
                        }`}
                      >
                        {stageDone ? (
                          <Check className="h-5 w-5" strokeWidth={2.5} />
                        ) : (
                          <Icon className="h-5 w-5" strokeWidth={1.5} />
                        )}
                      </span>
                      <span className={`text-[10px] font-semibold leading-none ${current ? "text-violet-200" : stageDone ? "text-zinc-300" : "text-zinc-600"}`}>
                        {STAGE_SHORT[s]}
                      </span>
                      <span className="text-[10px] leading-none tabular-nums text-zinc-600">
                        {stageDone && timings[s] !== undefined ? formatDur(timings[s]) : i + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* giant % readout */}
            <div className="mt-7 text-center">
              <div className="flex items-baseline justify-center gap-1">
                <span className="ac-text-grad text-[56px] font-extrabold leading-none tracking-tight tabular-nums">
                  {Math.round(progress * 100)}
                </span>
                <span className="text-lg font-bold text-violet-300/70">%</span>
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-400">
                {job.message || STAGE_LABELS[job.stage] || job.status}
              </p>
              <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] tabular-nums text-zinc-500">
                <Clock className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                {formatDur(elapsedSec)} elapsed
                {etaSec !== null && <span aria-hidden="true">· ≈ {formatDur(etaSec)} left</span>}
              </p>
            </div>

            {/* progress bar */}
            <div className="mt-5">
              <div
                className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.07] ring-1 ring-inset ring-white/5"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Overall progress"
              >
                {indeterminate ? (
                  <div className="ac-indeterminate absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-violet-400 to-transparent" />
                ) : (
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-[0_0_16px_rgba(139,92,246,0.5)] transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(2, progress * 100)}%` }}
                  />
                )}
              </div>
            </div>

            {/* cancel (two-tap confirm) */}
            <button
              type="button"
              onClick={cancelClick}
              aria-label={confirmCancel ? "Tap again to confirm cancel" : "Cancel job"}
              className={`ac-focus mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border text-[13px] font-semibold transition-all duration-200 active:scale-[0.98] ${
                confirmCancel
                  ? "animate-pulse border-red-400/60 bg-red-500/15 text-red-300"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-red-400/40 hover:text-red-300"
              }`}
            >
              {confirmCancel ? (
                <>
                  <AlertTriangle className="h-4 w-4" strokeWidth={1.5} /> Tap again to cancel
                </>
              ) : (
                <>
                  <X className="h-4 w-4" strokeWidth={1.5} /> Cancel job
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {/* DONE — celebration header + actions */}
      {done && (job.clips?.length ?? 0) > 0 && (
        <section aria-label="Job complete" className="glass ac-rise relative overflow-hidden rounded-3xl p-5 text-center">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "radial-gradient(80% 60% at 50% -20%, rgba(139,92,246,0.28), transparent 70%)" }}
          />
          <div className="relative">
            <span
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_12px_36px_-10px_rgba(139,92,246,0.9)]"
              aria-hidden="true"
            >
              <PartyPopper className="h-7 w-7" strokeWidth={1.5} />
            </span>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-white">
              <span className="ac-text-grad">
                {job.clips.length} clip{job.clips.length > 1 ? "s" : ""}
              </span>{" "}
              ready
            </h2>
            <p className="mt-1 text-[12px] text-zinc-400">
              {job.video_title || job.source_url || "Uploaded video"}
              {job.duration > 0 && ` · source ${formatDur(job.duration)}`}
            </p>

            {/* actions */}
            <div className="mt-5 space-y-2">
              <a href={zipUrl(job.id)} download aria-label="Download all clips as zip">
                <button
                  type="button"
                  className="ac-focus flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-violet-400/40 bg-violet-500/10 text-[13px] font-bold text-violet-100 transition-all duration-200 active:scale-[0.98] hover:bg-violet-500/20"
                >
                  <FileArchive className="h-4 w-4" strokeWidth={1.5} /> Download all (.zip)
                </button>
              </a>
              <div className="grid grid-cols-3 gap-2">
                <ActionButton icon={Sparkles} label="Re-render style" onClick={onOpenStyle} ariaLabel="Open style studio to re-render" />
                <ActionButton icon={Eye} label="Live preview" onClick={() => setLiveOpen(true)} ariaLabel="Open live preview" />
                <ActionButton icon={Zap} label="New clip" onClick={onNew} ariaLabel="Start a new clip" />
              </div>
              {job.has_transcript && (
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  aria-label="Edit transcript"
                  className="ac-focus flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-[12px] font-semibold text-zinc-300 transition-all duration-200 active:scale-[0.98] hover:border-white/20"
                >
                  <ClipboardList className="h-4 w-4" strokeWidth={1.5} /> Edit transcript (burned into captions)
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* FAILED / CANCELED — error card */}
      {(failed || job.status === "canceled") && (
        <section aria-label="Job failed" className="glass ac-rise rounded-3xl p-5">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ${
                failed ? "bg-red-500/15 text-red-300 ring-red-400/25" : "bg-zinc-500/15 text-zinc-300 ring-zinc-400/25"
              }`}
              aria-hidden="true"
            >
              <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-white">
                {failed ? "Couldn't finish this job" : "Job canceled"}
              </h2>
              <p className={`mt-1 text-[12px] leading-relaxed ${failed ? "text-red-200/80" : "text-zinc-400"}`}>
                {failed
                  ? job.error || "Job failed"
                  : job.message || "Stopped before completion."}
              </p>
            </div>
          </div>
          {failed && (
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Suggestions">
              {["Try a direct .mp4 link", "Upload the file instead", "Check the video is public"].map((t) => (
                <span
                  key={t}
                  className="flex h-8 items-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-[10px] font-medium text-zinc-400"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-5 flex gap-2">
            {job.status !== "failed_permanent" && (
              <button
                type="button"
                onClick={onRetry}
                aria-label="Retry job"
                className="ac-cta-ring flex-1 active:scale-[0.98]"
              >
                <span className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-[13px] font-bold text-white transition-transform duration-200 active:scale-[0.97]">
                  <RefreshCw className="h-4 w-4" strokeWidth={1.5} /> Retry
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onNew}
              aria-label="Start a new clip"
              className="ac-focus glass flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-zinc-300 transition-all duration-200 active:scale-[0.98]"
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.5} /> New clip
            </button>
          </div>
        </section>
      )}

      {/* skeleton placeholders while rendering */}
      {skeletons > 0 && (
        <section aria-label="Clips rendering" className="space-y-4">
          <h3 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-zinc-200">
            <Sparkles className="h-4 w-4 text-violet-300" strokeWidth={1.5} />
            Rendering {skeletons} clip{skeletons > 1 ? "s" : ""}…
          </h3>
          {Array.from({ length: Math.min(skeletons, 6) }, (_, i) => (
            <ClipSkeleton key={i} index={(job.clips?.length ?? 0) + i} />
          ))}
          {skeletons > 6 && (
            <p className="text-center text-[10px] text-zinc-600">+ {skeletons - 6} more rendering…</p>
          )}
        </section>
      )}

      {/* Results feed */}
      {job.clips?.length > 0 && (
        <section aria-label="Generated clips" className="space-y-4">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" strokeWidth={1.5} />
              {done ? "Generated clips" : `${job.clips.length} clip${job.clips.length > 1 ? "s" : ""} ready`}
            </h3>
            {!done && (
              <a href={zipUrl(job.id)} download aria-label="Download all clips as zip">
                <span className="ac-hit flex h-8 items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 text-[10px] font-bold text-violet-200">
                  <FileArchive className="h-3.5 w-3.5" strokeWidth={1.5} /> .zip
                </span>
              </a>
            )}
          </div>
          {job.clips.map((clip) => (
            <ClipCard key={clip.index} job={job} clip={clip} />
          ))}
        </section>
      )}

      {/* transcript editor entry (while still rendering / analyzing) */}
      {job.has_transcript && !done && (job.status === "analyzing" || job.status === "rendering") && (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          aria-label="Edit transcript"
          className="ac-focus glass flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[12px] font-semibold text-zinc-300 transition-all duration-200 active:scale-[0.98] hover:text-violet-200"
        >
          <ClipboardList className="h-4 w-4" strokeWidth={1.5} /> Edit transcript (burned into captions)
        </button>
      )}

      <LivePreviewDialog job={job} settings={settings} open={liveOpen} onOpenChange={setLiveOpen} />
      <TranscriptEditor
        job={job}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={() => {
          toast({ title: "Transcript saved", description: "Edits are burned into subtitles on the next render." });
          onRerender(settings);
        }}
      />
    </div>
  );
}

function ActionButton({
  icon: Icon, label, onClick, ariaLabel,
}: { icon: LucideIcon; label: string; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="ac-focus glass flex h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold text-zinc-300 transition-all duration-200 active:scale-[0.96] hover:text-violet-200"
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} />
      {label}
    </button>
  );
}

function ClipSkeleton({ index }: { index: number }) {
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="ac-shimmer relative flex h-52 items-center justify-center overflow-hidden bg-white/[0.03]">
        <div className="flex flex-col items-center gap-2 text-zinc-600">
          <Film className="h-7 w-7" strokeWidth={1.5} />
          <span className="text-[10px] font-medium">Rendering clip #{index + 1}…</span>
        </div>
      </div>
      <div className="space-y-2.5 p-4">
        <div className="ac-shimmer relative h-3.5 w-3/4 overflow-hidden rounded-full bg-white/[0.05]" />
        <div className="ac-shimmer relative h-2.5 w-1/2 overflow-hidden rounded-full bg-white/[0.04]" />
      </div>
    </div>
  );
}

function ClipCard({ job, clip }: { job: Job; clip: Clip }) {
  const url = clipFileUrl(job.id, clip);
  // scores may arrive on a 0–10 or 0–100 scale depending on scorer version
  const norm = clip.score <= 10 ? clip.score / 10 : clip.score / 100;
  const high = norm >= 0.7;
  return (
    <article className="glass ac-rise overflow-hidden rounded-3xl">
      <div className="relative bg-black">
        <video
          src={url}
          poster={`${clip.thumbUrl}?XTransformPort=${ENGINE_PORT}`}
          controls
          playsInline
          preload="metadata"
          aria-label={clip.title}
          className="max-h-[420px] w-full bg-black"
        />
        {/* viral score — gradient pill, top-right */}
        <span
          className={`absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold tabular-nums shadow-lg ${
            high
              ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_4px_16px_-4px_rgba(139,92,246,0.8)]"
              : "bg-black/70 text-violet-200 backdrop-blur-sm"
          }`}
          aria-label={`Viral score ${clip.score}`}
        >
          <Star className="h-3 w-3" strokeWidth={2.5} fill="currentColor" aria-hidden="true" /> {clip.score}
        </span>
        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-zinc-200 backdrop-blur-sm">
          #{clip.index + 1}
        </span>
        <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
          <Play className="h-3 w-3" strokeWidth={1.5} fill="currentColor" aria-hidden="true" /> {formatDur(clip.duration)}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-bold leading-snug text-white">{clip.title}</h3>
          {clip.reason && <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{clip.reason}</p>}
        </div>
        {/* meta chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-medium tabular-nums text-zinc-400">
            <Clock className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            {Math.floor(clip.start / 60)}:{String(Math.round(clip.start % 60)).padStart(2, "0")}–
            {Math.floor(clip.end / 60)}:{String(Math.round(clip.end % 60)).padStart(2, "0")}
          </span>
          <span className="flex h-7 items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-medium tabular-nums text-zinc-400">
            {formatBytes(clip.size)}
          </span>
          {clip.driveUrl ? (
            <a
              href={clip.driveUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open in Google Drive"
              className="ac-hit flex h-7 items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 text-[10px] font-semibold text-emerald-300"
            >
              <HardDrive className="h-3 w-3" strokeWidth={1.5} /> Drive
            </a>
          ) : (
            <span className="flex h-7 items-center gap-1 rounded-full border border-white/10 px-2.5 text-[10px] text-zinc-600">
              <HardDrive className="h-3 w-3" strokeWidth={1.5} /> local only
            </span>
          )}
        </div>
        <a
          href={url}
          download={`${clip.title.replace(/[^\w\s-]/g, "").slice(0, 40) || "autoclip"}.mp4`}
          className="block"
          aria-label={`Download ${clip.title}`}
        >
          <span className="ac-cta-ring block transition-transform duration-200 active:scale-[0.98]">
            <span className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-[14px] font-bold text-white transition-transform duration-200 active:scale-[0.97]">
              <Download className="h-4 w-4" strokeWidth={1.5} /> Download MP4
            </span>
          </span>
        </a>
      </div>
    </article>
  );
}

/** Engine-rendered single frame preview with time slider. */
function LivePreviewDialog({
  job, settings, open, onOpenChange,
}: { job: Job; settings: ClipSettings; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [t, setT] = useState(Math.min(5, Math.max(1, (job.duration || 10) / 2)));
  const [img, setImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const renderPreview = useCallback(
    async (time: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/engine/api/jobs/${job.id}/preview?XTransformPort=${ENGINE_PORT}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ t: time, settings }),
          }
        );
        if (!res.ok) throw new Error("preview failed");
        const blob = await res.blob();
        setImg((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch {
        /* preview is best-effort */
      } finally {
        setLoading(false);
      }
    },
    [job.id, settings]
  );

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => renderPreview(t), 400);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [open, t, renderPreview]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="glass-blur max-w-[340px] rounded-3xl p-5">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-white">Live preview</DialogTitle>
        </DialogHeader>
        <div className="relative mx-auto w-full max-w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-black">
          {img ? (
            <img src={img} alt="Styled frame preview" className="w-full" />
          ) : (
            <div className="ac-shimmer relative flex aspect-[9/16] items-center justify-center overflow-hidden bg-white/[0.03]">
              <Loader2 className="h-6 w-6 animate-spin text-violet-300" strokeWidth={1.5} />
            </div>
          )}
          {loading && img && (
            <div className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5" aria-hidden="true">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>Frame time</span>
            <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[10px] font-bold tabular-nums text-violet-200">
              {t.toFixed(1)}s of {formatDur(job.duration)}
            </span>
          </div>
          <Slider value={[t]} min={0} max={Math.max(1, job.duration - 1)} step={0.5} onValueChange={([v]) => setT(v)} aria-label="Preview frame time" />
        </div>
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Real ffmpeg render of the current style at the chosen moment — exactly what the exported clip looks like.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function TranscriptEditor({
  job, open, onOpenChange, onSaved,
}: { job: Job; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [texts, setTexts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && job.sentences) setTexts(job.sentences.map((s) => s.text));
  }, [open, job.sentences]);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveTranscript(job.id, texts.map((text) => ({ text })));
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Save failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="glass-blur max-h-[85vh] max-w-[400px] overflow-hidden rounded-3xl p-5">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-white">Transcript editor</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-zinc-500">
          Fix transcription errors — your edits are burned into the rendered captions.
        </p>
        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {texts.map((text, i) => (
            <div key={i} className="flex gap-2">
              <span className="w-10 shrink-0 pt-2.5 text-right text-[10px] tabular-nums text-zinc-600">
                {Math.floor((job.sentences?.[i]?.start ?? 0) / 60)}:
                {String(Math.round((job.sentences?.[i]?.start ?? 0) % 60)).padStart(2, "0")}
              </span>
              <Textarea
                value={text}
                onChange={(e) => setTexts((arr) => arr.map((v, k) => (k === i ? e.target.value : v)))}
                className="min-h-[44px] resize-none rounded-xl border-white/10 bg-white/[0.04] text-xs text-zinc-100 focus-visible:ring-violet-500/30"
                rows={2}
                aria-label={`Edit sentence ${i + 1}`}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          aria-label="Save transcript and re-render"
          className="ac-cta-ring w-full transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
        >
          <span className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : null}
            Save & re-render with edits
          </span>
        </button>
      </DialogContent>
    </Dialog>
  );
}
