"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Job, Clip, ClipSettings, api, clipFileUrl, zipUrl, formatBytes, formatDur, ENGINE_PORT,
} from "@/lib/autoclip";
import {
  Download, FileArchive, Loader2, RefreshCw, X, Play, Eye, ClipboardList, HardDrive,
  AlertTriangle, CheckCircle2, Clock, Trash2,
} from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  download: "Downloading source",
  transcribe: "Transcribing speech",
  analyze: "Finding viral moments",
  render: "Rendering clips",
  upload: "Uploading",
  done: "Done",
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

  const timings = job.stage_timings || {};

  return (
    <div className="space-y-5 pb-4">
      {/* Status card */}
      <section
        aria-label="Job status"
        className={`rounded-2xl border p-4 ${
          failed ? "border-red-900/60 bg-red-950/30" : active ? "border-amber-800/50 bg-zinc-900/70" : "border-emerald-900/50 bg-emerald-950/20"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {failed ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              ) : active ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              )}
              <span className="truncate text-sm font-semibold text-zinc-100">
                {job.video_title || job.source_url || "Uploaded video"}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {failed ? job.error || "Job failed" : job.message || STAGE_LABELS[job.stage] || job.status}
            </p>
          </div>
          {job.duration > 0 && (
            <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
              source {formatDur(job.duration)}
            </span>
          )}
        </div>

        {active && (
          <div className="mt-3 space-y-2">
            <Progress value={(job.progress ?? 0) * 100} className="h-2 bg-zinc-800 [&>div]:bg-amber-400" />
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>{STAGE_LABELS[job.stage] || job.stage}</span>
              <span>{Math.round((job.progress ?? 0) * 100)}%</span>
            </div>
          </div>
        )}

        {/* stage timeline */}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
          {["download", "transcribe", "analyze", "render"].map((s) => {
            const done = timings[s] !== undefined;
            const current = job.stage === s && active;
            return (
              <span
                key={s}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  current ? "bg-amber-500/20 text-amber-300" : done ? "bg-zinc-800 text-zinc-400" : "bg-zinc-900 text-zinc-600"
                }`}
              >
                {done && <Clock className="h-2.5 w-2.5" />}
                {STAGE_LABELS[s]?.split(" ")[0]}
                {done && timings[s] !== undefined && ` ${formatDur(timings[s])}`}
              </span>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          {active && (
            <Button variant="outline" size="sm" className="h-9 border-zinc-700 text-zinc-300" onClick={onCancel}>
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
          )}
          {(failed || job.status === "canceled") && job.status !== "failed_permanent" && (
            <Button variant="outline" size="sm" className="h-9 border-zinc-700 text-zinc-300" onClick={onRetry}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
            </Button>
          )}
          {(job.status === "done" || (job.clips?.length ?? 0) > 0) && (
            <>
              <Button variant="outline" size="sm" className="h-9 border-zinc-700 text-zinc-300" onClick={() => setLiveOpen(true)}>
                <Eye className="mr-1 h-3.5 w-3.5" /> Live preview
              </Button>
              <Button variant="outline" size="sm" className="h-9 border-zinc-700 text-zinc-300" onClick={() => onRerender(settings)}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Re-render style
              </Button>
            </>
          )}
          {job.status === "done" && (
            <Button variant="outline" size="sm" className="h-9 border-zinc-700 text-zinc-300" onClick={onNew}>
              New clip
            </Button>
          )}
        </div>
      </section>

      {/* Results feed */}
      {job.clips?.length > 0 && (
        <section aria-label="Generated clips" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">
              {job.clips.length} clip{job.clips.length > 1 ? "s" : ""} ready
            </h2>
            <a href={zipUrl(job.id)} download>
              <Button variant="outline" size="sm" className="h-8 border-zinc-700 text-xs text-zinc-300">
                <FileArchive className="mr-1 h-3.5 w-3.5" /> Download all (.zip)
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
          className="h-11 w-full border-zinc-700 bg-zinc-900/60 text-zinc-300"
          onClick={() => setEditorOpen(true)}
        >
          <ClipboardList className="mr-2 h-4 w-4" /> Edit transcript (burned into captions)
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

function ClipCard({ job, clip }: { job: Job; clip: Clip }) {
  const url = clipFileUrl(job.id, clip);
  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
      <div className="relative bg-black">
        <video
          src={url}
          poster={`${clip.thumbUrl}?XTransformPort=${ENGINE_PORT}`}
          controls
          playsInline
          preload="metadata"
          className="max-h-[420px] w-full"
        />
        <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-amber-300 backdrop-blur">
          ★ {clip.score}
        </span>
      </div>
      <div className="space-y-2.5 p-3.5">
        <div>
          <h3 className="text-sm font-semibold leading-snug text-zinc-100">{clip.title}</h3>
          {clip.reason && <p className="mt-0.5 text-[11px] leading-tight text-zinc-500">{clip.reason}</p>}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1"><Play className="h-3 w-3" /> {formatDur(clip.duration)}</span>
          <span>{formatBytes(clip.size)}</span>
          <span>
            {Math.floor(clip.start / 60)}:{String(Math.round(clip.start % 60)).padStart(2, "0")}–
            {Math.floor(clip.end / 60)}:{String(Math.round(clip.end % 60)).padStart(2, "0")} in source
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a href={url} download={`${clip.title.replace(/[^\w\s-]/g, "").slice(0, 40) || "autoclip"}.mp4`} className="flex-1">
            <Button size="sm" className="h-9 w-full bg-amber-500 text-black hover:bg-amber-400">
              <Download className="mr-1 h-3.5 w-3.5" /> Download MP4
            </Button>
          </a>
          {clip.driveUrl ? (
            <a href={clip.driveUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="h-9 border-zinc-700 text-emerald-400">
                <HardDrive className="mr-1 h-3.5 w-3.5" /> Drive
              </Button>
            </a>
          ) : (
            <span className="flex h-9 items-center gap-1 rounded-lg border border-zinc-800 px-2 text-[10px] text-zinc-500">
              <HardDrive className="h-3 w-3" /> local
            </span>
          )}
        </div>
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
      <DialogContent className="max-w-[360px] rounded-2xl border-zinc-800 bg-zinc-950 p-4">
        <DialogHeader>
          <DialogTitle className="text-sm text-zinc-200">Engine-rendered preview</DialogTitle>
        </DialogHeader>
        <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-zinc-800 bg-black">
          {img ? (
            <img src={img} alt="Styled frame preview" className="w-full" />
          ) : (
            <div className="flex aspect-[9/16] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
            </div>
          )}
          {loading && img && (
            <div className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
            </div>
          )}
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-zinc-400">
            <span>Frame time</span>
            <span className="text-zinc-500">{t.toFixed(1)}s of {formatDur(job.duration)}</span>
          </div>
          <Slider value={[t]} min={0} max={Math.max(1, job.duration - 1)} step={0.5} onValueChange={([v]) => setT(v)} />
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
      <DialogContent className="max-h-[85vh] max-w-[420px] overflow-hidden rounded-2xl border-zinc-800 bg-zinc-950 p-4">
        <DialogHeader>
          <DialogTitle className="text-sm text-zinc-200">Transcript editor</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-zinc-500">
          Fix transcription errors — your edits are burned into the rendered captions.
        </p>
        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {texts.map((text, i) => (
            <div key={i} className="flex gap-2">
              <span className="w-10 shrink-0 pt-2 text-right text-[10px] text-zinc-600">
                {Math.floor((job.sentences?.[i]?.start ?? 0) / 60)}:
                {String(Math.round((job.sentences?.[i]?.start ?? 0) % 60)).padStart(2, "0")}
              </span>
              <Textarea
                value={text}
                onChange={(e) => setTexts((arr) => arr.map((v, k) => (k === i ? e.target.value : v)))}
                className="min-h-[44px] resize-none border-zinc-800 bg-zinc-900/70 text-xs text-zinc-200"
                rows={2}
              />
            </div>
          ))}
        </div>
        <Button
          onClick={save}
          disabled={saving}
          className="h-10 w-full bg-amber-500 text-black hover:bg-amber-400"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save & re-render with edits
        </Button>
      </DialogContent>
    </Dialog>
  );
}
