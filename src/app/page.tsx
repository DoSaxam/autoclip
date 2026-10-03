"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { StyleStep } from "@/components/autoclip/StyleStep";
import { GenerateView } from "@/components/autoclip/GenerateView";
import {
  api, ClipSettings, DEFAULT_SETTINGS, Job, loadSettings, saveSettings, formatBytes,
} from "@/lib/autoclip";
import {
  Scissors, Link2, Upload, ArrowRight, ArrowLeft, Loader2, ClipboardPaste,
  Timer, History, Zap, X, Sparkles, Film, FileVideo, Check,
} from "lucide-react";

type Step = "source" | "style" | "generate";

const STEP_LABELS: Record<Step, string> = { source: "Source", style: "Style", generate: "Generate" };
const CARD =
  "rounded-2xl border border-white/5 bg-gradient-to-b from-zinc-900/70 to-zinc-900/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

export default function Home() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("source");
  const [settings, setSettings] = useState<ClipSettings>(DEFAULT_SETTINGS);
  const [url, setUrl] = useState("");
  const [upload, setUpload] = useState<{ id: string; name: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    api.listJobs().then((r) => setHistory(r.jobs)).catch(() => {});
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = useCallback((patch: Partial<ClipSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  // ---- polling for active job ----
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const active = job && ["queued", "downloading", "transcribing", "analyzing", "rendering", "uploading"].includes(job.status);
    if (!job || !active) return;
    pollRef.current = setInterval(async () => {
      try {
        const j = await api.getJob(job.id);
        setJob(j);
        if (j.status === "done") {
          toast({ title: "Clips ready 🎬", description: `${j.clips.length} clip(s) generated.` });
        }
        api.listJobs().then((r) => setHistory(r.jobs)).catch(() => {});
      } catch {
        /* transient */
      }
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job?.id, job?.status, toast]);

  // ---- source actions ----
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      toast({ title: "Clipboard unavailable", description: "Paste manually into the field.", variant: "destructive" });
    }
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const res = await api.uploadFile(f, "media");
      setUpload({ id: res.upload_id!, name: res.name, size: res.size });
      setUrl("");
      toast({ title: "Video uploaded", description: `${res.name} (${formatBytes(res.size)})` });
    } catch (e) {
      toast({ title: "Upload failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const generate = async () => {
    if (!url && !upload) {
      toast({ title: "Add a source first", description: "Paste a public video link or upload a file.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createJob(
        upload ? { upload_id: upload.id, settings } : { source_url: url, settings }
      );
      const j = await api.getJob(res.job_id);
      setJob(j);
      setStep("generate");
      api.listJobs().then((r) => setHistory(r.jobs)).catch(() => {});
    } catch (e) {
      toast({ title: "Could not start job", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelJob = async () => {
    if (!job) return;
    try {
      await api.cancelJob(job.id);
      toast({ title: "Canceling…", description: "Stopping at the next safe point." });
    } catch (e) {
      toast({ title: "Cancel failed", description: String((e as Error).message), variant: "destructive" });
    }
  };

  const retryJob = async () => {
    if (!job) return;
    try {
      await api.retryJob(job.id);
      setJob({ ...job, status: "queued", progress: 0, message: "re-queued" });
    } catch (e) {
      toast({ title: "Retry failed", description: String((e as Error).message), variant: "destructive" });
    }
  };

  const rerender = async (s: ClipSettings) => {
    if (!job) return;
    try {
      await api.rerender(job.id, s);
      setJob({ ...job, status: "queued", stage: "queued", progress: 0, clips: [], message: "re-rendering" });
      setStep("generate");
      toast({ title: "Re-rendering", description: "Reusing transcript & analysis — only re-rendering." });
    } catch (e) {
      toast({ title: "Re-render failed", description: String((e as Error).message), variant: "destructive" });
    }
  };

  const openHistoryJob = async (id: string) => {
    try {
      const j = await api.getJob(id);
      setJob(j);
      setSettings({ ...DEFAULT_SETTINGS, ...j.settings });
      setStep("generate");
    } catch {
      /* ignore */
    }
  };

  const deleteHistoryJob = async (id: string) => {
    try {
      await api.deleteJob(id);
      setHistory((h) => h.filter((j) => j.id !== id));
      if (job?.id === id) setJob(null);
    } catch (e) {
      toast({ title: "Delete failed", description: String((e as Error).message), variant: "destructive" });
    }
  };

  const startNew = () => {
    setJob(null);
    setUpload(null);
    setUrl("");
    setStep("source");
  };

  const stepIdx = step === "source" ? 0 : step === "style" ? 1 : 2;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-zinc-950/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950 shadow-[0_4px_16px_-4px_rgba(245,158,11,0.5)]">
              <Scissors className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </span>
            <div>
              <h1 className="text-[15px] font-bold leading-none tracking-tight">Autoclip</h1>
              <p className="mt-1 text-[10px] leading-none text-zinc-500">link → viral shorts, fully in cloud</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-medium text-zinc-400">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="ac-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            engine online
          </span>
        </div>
      </header>

      {/* History chips */}
      {history.length > 0 && step !== "generate" && (
        <div className="border-b border-white/5 bg-zinc-950/60">
          <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-2">
            <History className="h-3.5 w-3.5 shrink-0 text-zinc-600" strokeWidth={1.5} />
            <div className="flex snap-x gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {history.slice(0, 6).map((h) => {
                const terminal = h.status === "done" || ["failed", "canceled", "failed_permanent"].includes(h.status);
                return (
                  <span key={h.id} className="relative shrink-0 snap-start">
                    <button
                      onClick={() => openHistoryJob(h.id)}
                      aria-label={`Open job: ${h.video_title || h.source_url || "Upload"}`}
                      className="ac-hit flex h-9 max-w-[190px] items-center gap-2 rounded-full border border-white/5 bg-zinc-900/80 pl-3 pr-3.5 text-[11px] text-zinc-300 transition-all duration-200 hover:border-zinc-600/60 active:scale-[0.97]"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        h.status === "done" ? "bg-emerald-500" :
                        h.status === "failed" || h.status === "failed_permanent" ? "bg-red-500" :
                        h.status === "canceled" ? "bg-zinc-600" : "bg-amber-400 animate-pulse"
                      }`} />
                      <span className="truncate font-medium">{h.video_title || h.source_url?.slice(0, 30) || "Upload"}</span>
                      {h.status === "done" && (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                          {h.clips.length} clip{h.clips.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                    {terminal && (
                      <button
                        onClick={() => deleteHistoryJob(h.id)}
                        className="ac-hit absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 ring-1 ring-white/10 transition-colors hover:bg-red-500/90 hover:text-white"
                        aria-label="Delete job from history"
                      >
                        <X className="h-3 w-3" strokeWidth={2} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Steps indicator with progress fill */}
      {step !== "generate" && (
        <div className="mx-auto w-full max-w-md px-4 pt-4" role="group" aria-label="Progress: 3 steps">
          <div className="relative flex items-center justify-between">
            <div className="absolute inset-x-[10px] top-[8.5px] h-[3px] overflow-hidden rounded-full bg-zinc-800/80" aria-hidden="true">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500 ease-out"
                style={{ width: `${(stepIdx / 2) * 100}%` }}
              />
            </div>
            {(["source", "style", "generate"] as Step[]).map((s, i) => (
              <div key={s} className="relative z-10 flex flex-col items-center gap-1.5" aria-current={i === stepIdx ? "step" : undefined}>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300 ${
                    i < stepIdx
                      ? "bg-amber-500 text-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.45)]"
                      : i === stepIdx
                        ? "scale-110 border-2 border-amber-400 bg-zinc-950 text-amber-400"
                        : "border border-zinc-700 bg-zinc-950 text-zinc-600"
                  }`}
                >
                  {i < stepIdx ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className={`text-[10px] font-medium ${i <= stepIdx ? "text-zinc-300" : "text-zinc-600"}`}>{STEP_LABELS[s]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        {step === "source" && (
          <div key="source" className="ac-step-in space-y-5">
            {/* Hero microcopy */}
            <section aria-label="Intro" className="pt-1">
              <p className="text-[22px] font-bold leading-tight tracking-tight text-zinc-50">
                Paste a link — get{" "}
                <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
                  viral-ready clips
                </span>
                .
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-relaxed text-zinc-500">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400/80" strokeWidth={1.5} />
                AI finds the moments · captions burn in · ready to post
              </p>
            </section>

            {/* URL input */}
            <section aria-label="Video source" className={CARD}>
              <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-zinc-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20">
                  <Link2 className="h-4 w-4" strokeWidth={1.5} />
                </span>
                Paste a public video link
              </h2>
              <div className="relative">
                <Input
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setUpload(null); }}
                  placeholder="https://youtu.be/… or direct .mp4"
                  className={`h-12 rounded-xl border-white/10 bg-zinc-950/80 text-sm placeholder:text-zinc-600 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/30 ${url ? "pr-[118px]" : "pr-[88px]"}`}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-label="Video link"
                />
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-1">
                  {url && (
                    <button
                      onClick={() => setUrl("")}
                      aria-label="Clear link"
                      className="ac-hit flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-zinc-200"
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  )}
                  <button
                    onClick={pasteFromClipboard}
                    aria-label="Paste link from clipboard"
                    className="ac-hit flex h-9 items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 text-[11px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-500/25 transition-all active:scale-95 hover:bg-amber-500/25"
                  >
                    <ClipboardPaste className="h-4 w-4" strokeWidth={1.5} /> Paste
                  </button>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-500">
                YouTube, direct MP4 links and most public platforms. Processing happens in the cloud — nothing touches your device.
              </p>
            </section>

            <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-zinc-600" aria-hidden="true">
              <span className="h-px flex-1 bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-800" />
            </div>

            {/* Upload */}
            <section aria-label="Upload file" className={CARD}>
              <input
                ref={fileInput}
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                aria-label="Upload a video file"
                className="ac-focus group flex min-h-[96px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-zinc-950/50 py-6 transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/[0.03] active:scale-[0.99] disabled:opacity-60"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800/80 ring-1 ring-inset ring-white/5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-105 group-active:scale-95">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-amber-400" strokeWidth={1.5} />
                  ) : (
                    <Upload className="h-5 w-5 text-zinc-300 transition-colors group-hover:text-amber-400" strokeWidth={1.5} />
                  )}
                </span>
                <span className="text-sm font-medium text-zinc-300">{uploading ? "Uploading…" : "Upload a video file"}</span>
                <span className="text-[10px] text-zinc-600">MP4 · MOV · MKV · WEBM</span>
              </button>
              {upload && (
                <div className="ac-step-in mt-3 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <FileVideo className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-emerald-200">{upload.name}</p>
                    <p className="text-[10px] text-emerald-500/80">{formatBytes(upload.size)} · ready to clip</p>
                  </div>
                  <button
                    onClick={() => setUpload(null)}
                    aria-label="Remove uploaded file"
                    className="ac-hit flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-red-300"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </section>

            {/* Clip settings */}
            <section aria-label="Clip settings" className={CARD}>
              <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-zinc-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20">
                  <Timer className="h-4 w-4" strokeWidth={1.5} />
                </span>
                Clip length
              </h2>
              <div className="mb-3 flex items-center justify-center gap-2">
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold tabular-nums text-amber-300">
                  {settings.clip.minLen}s
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">to</span>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold tabular-nums text-amber-300">
                  {settings.clip.maxLen}s
                </span>
                <span className="text-[10px] text-zinc-500">per clip</span>
              </div>
              <Slider
                value={[settings.clip.minLen, settings.clip.maxLen]}
                min={5}
                max={120}
                step={5}
                onValueChange={([a, b]) => update({ clip: { ...settings.clip, minLen: a, maxLen: Math.max(a, b) } })}
                aria-label="Clip length range"
              />
              <div className="mt-5">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Number of clips</label>
                <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {["auto", "3", "5", "10", "20"].map((n) => {
                    const selected = settings.clip.maxClips === n;
                    return (
                      <button
                        key={n}
                        onClick={() => update({ clip: { ...settings.clip, maxClips: n } })}
                        aria-pressed={selected}
                        className={`min-h-[44px] min-w-[56px] shrink-0 snap-start rounded-xl border px-3 text-sm font-semibold transition-all duration-200 active:scale-[0.96] ${
                          selected
                            ? "border-amber-500/70 bg-amber-500/10 text-amber-300 ring-2 ring-amber-500/40"
                            : "border-white/5 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600/60"
                        }`}
                      >
                        {n === "auto" ? "Auto" : n}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Empty history state */}
            {history.length === 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3.5">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                  <Film className="h-8 w-8 text-zinc-800" strokeWidth={1.5} />
                  <Scissors className="absolute -right-1 -top-1 h-4 w-4 text-amber-500/70" strokeWidth={1.5} />
                  <Sparkles className="absolute -bottom-0.5 -left-1 h-3.5 w-3.5 text-amber-400/50" strokeWidth={1.5} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-zinc-300">No clips yet</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">
                    Your generated clips will appear here for quick re-download.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "style" && (
          <div key="style" className="ac-step-in">
            <StyleStep settings={settings} update={update} />
          </div>
        )}

        {step === "generate" && job && (
          <div key="generate" className="ac-step-in">
            <GenerateView
              job={job}
              settings={settings}
              onCancel={cancelJob}
              onRetry={retryJob}
              onRerender={rerender}
              onNew={startNew}
            />
          </div>
        )}
      </main>

      {/* Bottom bar */}
      {step !== "generate" && (
        <div className="sticky bottom-0 z-20 border-t border-white/5 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-zinc-950/80 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-md gap-2 px-4">
            {step === "style" && (
              <Button
                variant="outline"
                onClick={() => setStep("source")}
                aria-label="Back to source step"
                className="h-12 flex-1 rounded-xl border-white/10 bg-zinc-900/70 text-[15px] font-medium text-zinc-300 transition-all hover:border-zinc-600/60 active:scale-[0.98]"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Back
              </Button>
            )}
            {step === "source" ? (
              <Button
                onClick={() => setStep("style")}
                disabled={!url && !upload}
                aria-label="Continue to style step"
                className="h-12 flex-1 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-[15px] font-semibold text-zinc-950 shadow-[0_8px_30px_-10px_rgba(245,158,11,0.55)] transition-all hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
              >
                Choose style <ArrowRight className="ml-0.5 h-4 w-4" strokeWidth={1.5} />
              </Button>
            ) : (
              <Button
                onClick={generate}
                disabled={submitting}
                aria-label="Generate clips"
                className="h-12 flex-1 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-[15px] font-semibold text-zinc-950 shadow-[0_8px_30px_-10px_rgba(245,158,11,0.55)] transition-all hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} /> : <Zap className="mr-1.5 h-4 w-4" strokeWidth={1.5} />}
                Generate clips
              </Button>
            )}
          </div>
        </div>
      )}

      <footer className="border-t border-white/5 py-3">
        <p className="text-center text-[10px] leading-relaxed text-zinc-600">
          Autoclip — automatic viral clips with burned captions · renders on FFmpeg + Whisper
        </p>
      </footer>
    </div>
  );
}
