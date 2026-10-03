"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Job, Clip, ClipSettings, api, clipFileUrl, zipUrl, formatBytes, formatDur, ENGINE_PORT,
} from "@/lib/autoclip";
import {
  Download, FileArchive, Loader2, RefreshCw, X, Play, Eye, ClipboardList, HardDrive,
  AlertTriangle, CheckCircle2, Clock, Check, Film, Star, Sparkles, Wand2,
} from "lucide-react";

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

export function GenerateView({
  job,
  settings,
  onCancel,
  onRetry,
  onRerender,
  onNew,
}: {
  job: Job;
  settings: ClipSettings;
  onCancel: () => void;
  onRetry: () => void;
  onRerender: (settings: ClipSettings) => void;
  onNew: () => void;
}) {
  const { toast } = useToast();
  const active = ["queued", "downloading", "transcribing", "analyzing", "rendering", "uploading"].includes(job.status);
  const failed = job.status === "failed" || job.status === "failed_permanent";
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

  // skeleton placeholders while clips render (n = expected clips)
  const expected = settings.clip.maxClips === "auto" ? 3 : parseInt(settings.clip.maxClips, 10) || 3;
  const rendering = active && job.status === "rendering";
  const skeletons = rendering ? Math.max(0, expected - (job.clips?.length ?? 0)) : 0;

  return (
    <div className="space-y-5 pb-4">
      {/* Status hero card */}
      <section
        aria-label="Job status"
        className={`overflow-hidden rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
          failed
            ? "border-red-900/60 bg-gradient-to-b from-red-950/40 to-red-950/10"
            : active
              ? "border-amber-800/40 bg-gradient-to-b from-zinc-900/80 to-zinc-900/30"
              : "border-emerald-900/50 bg-gradient-to-b from-emerald-950/30 to-zinc-900/20"
        }`}
      >
        <div className="p-4 pb-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {failed ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" strokeWidth={1.5} />
                ) : active ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" strokeWidth={1.5} />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={1.5} />
                )}
                <span className="truncate text-sm font-semibold text-zinc-100">
                  {job.video_title || job.source_url || "Uploaded video"}
                </span>
              </div>
              <p className={`mt-1 text-xs leading-relaxed ${failed ? "text-red-300/80" : "text-zinc-400"}`}>
                {failed ? job.error || "Job failed" : job.message || STAGE_LABELS[job.stage] || job.status}
              </p>
            </div>
            {job.duration > 0 && (
              <span className="shrink-0 rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                source {formatDur(job.duration)}
              </span>
            )}
          </div>

          {active && (
            <div className="mt-4 space-y-2.5">
              <div className="flex items-end justify-between gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-[34px] font-extrabold leading-none tabular-nums tracking-tight text-zinc-50">
                    {Math.round(progress * 100)}
                  </span>
                  <span className="text-base font-bold text-zinc-500">%</span>
                </div>
                <div className="text-right leading-tight">
                  {elapsedSec > 0 && (
                    <p className="flex items-center justify-end gap-1 text-[11px] font-medium tabular-nums text-zinc-400">
                      <Clock className="h-3 w-3 text-zinc-500" strokeWidth={1.5} />
                      {formatDur(elapsedSec)} elapsed
                    </p>
                  )}
                  {etaSec !== null && (
                    <p className="text-[10px] tabular-nums text-zinc-500">≈ {formatDur(etaSec)} left</p>
                  )}
                </div>
              </div>
              {/* indeterminate → determinate progress */}
              <div
                className="relative h-2.5 overflow-hidden rounded-full bg-zinc-800/80 ring-1 ring-inset ring-white/5"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={STAGE_LABELS[job.stage] || job.stage}
              >
                {indeterminate ? (
                  <div className="ac-indeterminate absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
                ) : (
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_12px_rgba(245,158,11,0.35)] transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(2, progress * 100)}%` }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* connected stage stepper */}
        <div className="border-t border-white/5 bg-black/20 px-4 py-3">
          <div className="flex">
            {STAGES.map((s, i) => {
              const done = timings[s] !== undefined;
              const current = job.stage === s && active;
              return (
                <div key={s} className="relative flex flex-1 flex-col items-center gap-1">
                  {i > 0 && (
                    <span
                      aria-hidden="true"
                      className={`-left-1/2 absolute top-[9px] h-0.5 w-full rounded-full transition-colors duration-500 ${
                        done ? "bg-amber-500/80" : "bg-zinc-700/70"
                      }`}
                    />
                  )}
                  <span
                    className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300 ${
                      done
                        ? "bg-amber-500 text-zinc-950 shadow-[0_0_10px_rgba(245,158,11,0.35)]"
                        : current
                          ? "border-2 border-amber-400 bg-amber-500/20 text-amber-300 animate-pulse"
                          : "border border-zinc-700 bg-zinc-900 text-zinc-600"
                    }`}
                  >
                    {done ? (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    ) : (
                      <span className="text-[10px] font-bold">{i + 1}</span>
                    )}
                  </span>
                  <span className={`text-[10px] font-medium leading-none ${current ? "text-amber-300" : done ? "text-zinc-300" : "text-zinc-600"}`}>
                    {STAGE_SHORT[s]}
                  </span>
                  <span className="h-3 text-[10px] leading-none tabular-nums text-zinc-600">
                    {done && timings[s] !== undefined ? formatDur(timings[s]) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/5 p-3">
          {active && (
            <Button
              variant="outline"
              size="sm"
              onClick={cancelClick}
              aria-label={confirmCancel ? "Tap again to confirm cancel" : "Cancel job"}
              className={`h-9 rounded-lg border-zinc-700 text-zinc-300 transition-all active:scale-[0.97] ${
                confirmCancel ? "animate-pulse border-red-500/60 bg-red-500/10 text-red-300" : "hover:border-red-500/40 hover:text-red-300"
              }`}
            >
              {confirmCancel ? (
                <>
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Tap again to cancel
                </>
              ) : (
                <>
                  <X className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Cancel
                </>
              )}
            </Button>
          )}
          {(failed || job.status === "canceled") && job.status !== "failed_permanent" && (
            <Button variant="outline" size="sm" className="h-9 rounded-lg border-zinc-700 text-zinc-300 transition-all active:scale-[0.97] hover:border-amber-500/40 hover:text-amber-300" onClick={onRetry}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Retry
            </Button>
          )}
          {(job.status === "done" || (job.clips?.length ?? 0) > 0) && (
            <>
              <Button variant="outline" size="sm" className="h-9 rounded-lg border-zinc-700 text-zinc-300 transition-all active:scale-[0.97] hover:border-amber-500/40 hover:text-amber-300" onClick={() => setLiveOpen(true)}>
                <Eye className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Live preview
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-lg border-zinc-700 text-zinc-300 transition-all active:scale-[0.97] hover:border-amber-500/40 hover:text-amber-300" onClick={() => onRerender(settings)}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Re-render style
              </Button>
            </>
          )}
          {job.status === "done" && (
            <Button variant="outline" size="sm" className="h-9 rounded-lg border-zinc-700 text-zinc-300 transition-all active:scale-[0.97]" onClick={onNew}>
              <Wand2 className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> New clip
            </Button>
          )}
        </div>
      </section>

      {/* skeleton placeholders while rendering */}
      {skeletons > 0 && (
        <section aria-label="Clips rendering" className="space-y-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
            <Sparkles className="h-4 w-4 text-amber-400" strokeWidth={1.5} />
            Rendering {skeletons} clip{skeletons > 1 ? "s" : ""}…
          </h2>
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
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" strokeWidth={1.5} />
              {job.clips.length} clip{job.clips.length > 1 ? "s" : ""} ready
            </h2>
            <a href={zipUrl(job.id)} download aria-label="Download all clips as zip">
              <Button variant="outline" size="sm" className="h-9 rounded-lg border-amber-500/30 bg-amber-500/10 text-xs font-semibold text-amber-300 transition-all active:scale-[0.97] hover:bg-amber-500/20">
                <FileArchive className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} /> Download all (.zip)
              </Button>
            </a>
          </div>
          {job.clips.map((clip) => (
            <ClipCard key={clip.index} job={job} clip={clip} />
          ))}
        </section>
      )}

      {/* transcript editor */}
      {job.has_transcript && (job.status === "analyzing" || job.status === "rendering" || job.status === "done") && (
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl border-white/10 bg-zinc-900/60 text-zinc-300 transition-all active:scale-[0.98] hover:border-amber-500/40 hover:text-amber-300"
          onClick={() => setEditorOpen(true)}
        >
          <ClipboardList className="mr-2 h-4 w-4" strokeWidth={1.5} /> Edit transcript (burned into captions)
        </Button>
      )}

      <LivePreviewDialog
        job={job}
        settings={settings}
        open={liveOpen}
        onOpenChange={setLiveOpen}
      />
      <TranscriptEditor job={job} open={editorOpen} onOpenChange={setEditorOpen} onSaved={() => {
        toast({ title: "Transcript saved", description: "Edits are burned into subtitles on the next render." });
        onRerender(settings);
      }} />
    </div>
  );
}

function ClipSkeleton({ index }: { index: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/50">
      <div className="ac-shimmer relative flex h-52 items-center justify-center overflow-hidden bg-zinc-900/80">
        <div className="flex flex-col items-center gap-2 text-zinc-600">
          <Film className="h-7 w-7" strokeWidth={1.5} />
          <span className="text-[10px] font-medium">Rendering clip #{index + 1}…</span>
        </div>
      </div>
      <div className="space-y-2.5 p-3.5">
        <div className="ac-shimmer relative h-3.5 w-3/4 overflow-hidden rounded bg-zinc-800/70" />
        <div className="ac-shimmer relative h-2.5 w-1/2 overflow-hidden rounded bg-zinc-800/50" />
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
    <article className="overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-zinc-900/70 to-zinc-900/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
        <span
          className={`absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold tabular-nums shadow-lg ${
            high ? "bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950" : "bg-black/75 text-amber-300 backdrop-blur-sm"
          }`}
          aria-label={`Viral score ${clip.score}`}
        >
          <Star className="h-3 w-3" strokeWidth={2.5} fill="currentColor" /> {clip.score}
        </span>
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
          <Play className="h-3 w-3" strokeWidth={1.5} fill="currentColor" /> {formatDur(clip.duration)}
        </span>
        <span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-1 text-[10px] font-medium text-zinc-300 backdrop-blur-sm">
          #{clip.index + 1}
        </span>
      </div>
      <div className="space-y-3 p-3.5">
        <div>
          <h3 className="text-sm font-semibold leading-snug text-zinc-100">{clip.title}</h3>
          {clip.reason && <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{clip.reason}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
          <span className="flex items-center gap-2.5 tabular-nums">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" strokeWidth={1.5} />
              {Math.floor(clip.start / 60)}:{String(Math.round(clip.start % 60)).padStart(2, "0")}–
              {Math.floor(clip.end / 60)}:{String(Math.round(clip.end % 60)).padStart(2, "0")}
            </span>
            <span>{formatBytes(clip.size)}</span>
          </span>
          {clip.driveUrl ? (
            <a href={clip.driveUrl} target="_blank" rel="noreferrer" aria-label="Open in Google Drive">
              <span className="flex h-7 items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 text-[10px] font-semibold text-emerald-400">
                <HardDrive className="h-3 w-3" strokeWidth={1.5} /> Drive
              </span>
            </a>
          ) : (
            <span className="flex h-7 items-center gap-1 rounded-lg border border-white/5 px-2 text-[10px] text-zinc-600">
              <HardDrive className="h-3 w-3" strokeWidth={1.5} /> local only
            </span>
          )}
        </div>
        <a href={url} download={`${clip.title.replace(/[^\w\s-]/g, "").slice(0, 40) || "autoclip"}.mp4`} className="block" aria-label={`Download ${clip.title}`}>
          <Button size="lg" className="h-11 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-[15px] font-semibold text-zinc-950 shadow-[0_8px_24px_-10px_rgba(245,158,11,0.55)] transition-all hover:from-amber-300 hover:to-amber-400 active:scale-[0.98]">
            <Download className="h-4 w-4" strokeWidth={1.5} /> Download MP4
          </Button>
        </a>
      </div>
    </article>
  );
}

/** Engine-rendered single frame preview with time + position sliders. */
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
      <DialogContent aria-describedby={undefined} className="max-w-[360px] rounded-2xl border-white/10 bg-zinc-950 p-4">
        <DialogHeader>
          <DialogTitle className="text-sm text-zinc-200">Engine-rendered preview</DialogTitle>
        </DialogHeader>
        <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-white/10 bg-black">
          {img ? (
            <img src={img} alt="Styled frame preview" className="w-full" />
          ) : (
            <div className="ac-shimmer relative flex aspect-[9/16] items-center justify-center overflow-hidden bg-zinc-900">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-600" strokeWidth={1.5} />
            </div>
          )}
          {loading && img && (
            <div className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-400">
            <span>Frame time</span>
            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-300">{t.toFixed(1)}s of {formatDur(job.duration)}</span>
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
      <DialogContent aria-describedby={undefined} className="max-h-[85vh] max-w-[420px] overflow-hidden rounded-2xl border-white/10 bg-zinc-950 p-4">
        <DialogHeader>
          <DialogTitle className="text-sm text-zinc-200">Transcript editor</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-zinc-500">
          Fix transcription errors — your edits are burned into the rendered captions.
        </p>
        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {texts.map((text, i) => (
            <div key={i} className="flex gap-2">
              <span className="w-10 shrink-0 pt-2 text-right text-[10px] tabular-nums text-zinc-600">
                {Math.floor((job.sentences?.[i]?.start ?? 0) / 60)}:
                {String(Math.round((job.sentences?.[i]?.start ?? 0) % 60)).padStart(2, "0")}
              </span>
              <Textarea
                value={text}
                onChange={(e) => setTexts((arr) => arr.map((v, k) => (k === i ? e.target.value : v)))}
                className="min-h-[44px] resize-none rounded-lg border-white/10 bg-zinc-900/70 text-xs text-zinc-200"
                rows={2}
                aria-label={`Edit sentence ${i + 1}`}
              />
            </div>
          ))}
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="h-11 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-sm font-semibold text-zinc-950 transition-all hover:from-amber-300 hover:to-amber-400 active:scale-[0.98]"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} /> : null}
          Save & re-render with edits
        </Button>
      </DialogContent>
    </Dialog>
  );
}
