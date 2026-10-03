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
  Timer, Layers, History, Trash2, Zap,
} from "lucide-react";

type Step = "source" | "style" | "generate";

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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-black">
              <Scissors className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div>
              <h1 className="text-[15px] font-bold leading-none">Autoclip</h1>
              <p className="text-[10px] text-zinc-500">link → viral shorts, fully in cloud</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            engine online
          </span>
        </div>
      </header>

      {/* History chips */}
      {history.length > 0 && step !== "generate" && (
        <div className="border-b border-zinc-800/60 bg-zinc-950">
          <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-2">
            <History className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {history.slice(0, 6).map((h) => (
                <span key={h.id} className="group relative shrink-0">
                  <button
                    onClick={() => openHistoryJob(h.id)}
                    className="flex max-w-[180px] items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/80 py-1 pl-2.5 pr-2 text-[10px] text-zinc-400 hover:border-zinc-600"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      h.status === "done" ? "bg-emerald-500" :
                      h.status === "failed" || h.status === "failed_permanent" ? "bg-red-500" :
                      h.status === "canceled" ? "bg-zinc-600" : "bg-amber-400 animate-pulse"
                    }`} />
                    <span className="truncate">{h.video_title || h.source_url?.slice(0, 30) || "Upload"}</span>
                    {h.status === "done" && <span className="shrink-0 text-emerald-500">{h.clips.length}▶</span>}
                  </button>
                  {h.status !== "done" && !["failed", "canceled", "failed_permanent"].includes(h.status) ? null : (
                    <button
                      onClick={() => deleteHistoryJob(h.id)}
                      className="absolute -right-1 -top-1 hidden rounded-full bg-zinc-800 p-0.5 group-hover:block"
                      aria-label="Delete job"
                    >
                      <Trash2 className="h-2.5 w-2.5 text-zinc-400" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Steps indicator */}
      {step !== "generate" && (
        <div className="mx-auto flex w-full max-w-md items-center gap-1.5 px-4 pt-4 text-[10px]">
          {(["source", "style", "generate"] as Step[]).map((s, i) => {
            const idx = step === "source" ? 0 : 1;
            const active = i <= idx;
            return (
              <div key={s} className="flex flex-1 items-center gap-1.5">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                  i < idx ? "bg-amber-500 text-black" : i === idx ? "border border-amber-500 text-amber-400" : "border border-zinc-700 text-zinc-600"
                }`}>{i < idx ? "✓" : i + 1}</span>
                <span className={active ? "text-zinc-300" : "text-zinc-600"}>{s === "source" ? "Source" : s === "style" ? "Style" : "Generate"}</span>
                {i < 2 && <span className={`h-px flex-1 ${i < idx ? "bg-amber-500" : "bg-zinc-800"}`} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Main content */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        {step === "source" && (
          <div className="space-y-6">
            {/* URL input */}
            <section aria-label="Video source" className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
                <Link2 className="h-4 w-4 text-amber-400" /> Paste a public video link
              </h2>
              <div className="flex gap-2">
                <Input
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setUpload(null); }}
                  placeholder="https://youtu.be/… or direct .mp4"
                  className="h-11 border-zinc-700 bg-zinc-950 text-sm placeholder:text-zinc-600"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <Button
                  variant="outline"
                  onClick={pasteFromClipboard}
                  className="h-11 shrink-0 border-zinc-700 px-3 text-zinc-300"
                  aria-label="Paste from clipboard"
                >
                  <ClipboardPaste className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                YouTube, direct MP4 links and most public platforms. Processing happens in the cloud — nothing touches your device.
              </p>
            </section>

            <div className="flex items-center gap-3 text-[10px] text-zinc-600">
              <span className="h-px flex-1 bg-zinc-800" /> OR <span className="h-px flex-1 bg-zinc-800" />
            </div>

            {/* Upload */}
            <section aria-label="Upload file" className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
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
                className="flex min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 py-5 text-zinc-400 transition-colors hover:border-amber-600/60 hover:text-amber-400"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" strokeWidth={1.5} />
                )}
                <span className="text-sm font-medium">{uploading ? "Uploading…" : "Upload a video file"}</span>
                <span className="text-[10px] text-zinc-600">MP4 / MOV / MKV / WEBM</span>
              </button>
              {upload && (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs">
                  <span className="truncate text-emerald-300">{upload.name}</span>
                  <span className="shrink-0 text-emerald-500">{formatBytes(upload.size)}</span>
                </div>
              )}
            </section>

            {/* Clip settings */}
            <section aria-label="Clip settings" className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
                <Timer className="h-4 w-4 text-amber-400" /> Clip length
              </h2>
              <div className="mb-1.5 flex justify-between text-xs text-zinc-400">
                <span>{settings.clip.minLen}s</span>
                <span className="text-zinc-500">to {settings.clip.maxLen}s per clip</span>
              </div>
              <Slider
                value={[settings.clip.minLen, settings.clip.maxLen]}
                min={5}
                max={120}
                step={5}
                onValueChange={([a, b]) => update({ clip: { ...settings.clip, minLen: a, maxLen: Math.max(a, b) } })}
                aria-label="Clip length range"
              />
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Number of clips</label>
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {["auto", "3", "5", "10", "20"].map((n) => (
                    <button
                      key={n}
                      onClick={() => update({ clip: { ...settings.clip, maxClips: n } })}
                      className={`min-w-[44px] shrink-0 rounded-lg border py-2 text-xs font-semibold ${
                        settings.clip.maxClips === n
                          ? "border-amber-500 bg-amber-500/10 text-amber-400"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      {n === "auto" ? "Auto" : n}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {step === "style" && <StyleStep settings={settings} update={update} />}

        {step === "generate" && job && (
          <GenerateView
            job={job}
            settings={settings}
            onCancel={cancelJob}
            onRetry={retryJob}
            onRerender={rerender}
            onNew={startNew}
          />
        )}
      </main>

      {/* Bottom bar */}
      {step !== "generate" && (
        <div className="sticky bottom-0 z-20 border-t border-zinc-800/80 bg-zinc-950/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-md gap-2 px-4">
            {step === "style" && (
              <Button
                variant="outline"
                onClick={() => setStep("source")}
                className="h-12 flex-1 border-zinc-700 bg-zinc-900 text-zinc-300"
              >
                <ArrowLeft className="mr-1 h-4 w-4" strokeWidth={1.5} /> Back
              </Button>
            )}
            {step === "source" ? (
              <Button
                onClick={() => setStep("style")}
                disabled={!url && !upload}
                className="h-12 flex-1 bg-amber-500 text-[15px] font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
              >
                Choose style <ArrowRight className="ml-1 h-4 w-4" strokeWidth={1.5} />
              </Button>
            ) : (
              <Button
                onClick={generate}
                disabled={submitting}
                className="h-12 flex-1 bg-amber-500 text-[15px] font-semibold text-black hover:bg-amber-400"
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" strokeWidth={1.5} />}
                Generate clips
              </Button>
            )}
          </div>
        </div>
      )}

      <footer className="border-t border-zinc-800/60 py-3">
        <p className="text-center text-[10px] text-zinc-600">
          Autoclip — automatic viral clips with burned captions · renders on FFmpeg + Whisper
        </p>
      </footer>
    </div>
  );
}
