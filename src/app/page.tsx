"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { CreateScreen } from "@/components/autoclip/CreateScreen";
import { StyleStep } from "@/components/autoclip/StyleStep";
import { GenerateView } from "@/components/autoclip/GenerateView";
import { LibraryScreen } from "@/components/autoclip/LibraryScreen";
import {
  api, ClipSettings, DEFAULT_SETTINGS, Job, loadSettings, saveSettings, formatBytes,
} from "@/lib/autoclip";
import { Sparkles, Library as LibraryIcon, Zap, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Screen = "create" | "style" | "generate" | "library";
type Tab = "create" | "library";

/**
 * Autoclip app shell — fixed glass header + floating glass tab bar,
 * four screens (Create / Style / Generate / Library). Aurora Glass theme.
 * All engine logic (jobs, polling, uploads, persistence) lives here.
 */
export default function Home() {
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen>("create");
  const [settings, setSettings] = useState<ClipSettings>(DEFAULT_SETTINGS);
  const [url, setUrl] = useState("");
  const [upload, setUpload] = useState<{ id: string; name: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [online, setOnline] = useState(true);
  const [styleMode, setStyleMode] = useState<"create" | "rerender">("create");
  const [generateOrigin, setGenerateOrigin] = useState<"create" | "library">("create");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- initial load + engine heartbeat (refreshes history + online state) ----
  const refresh = useCallback(async () => {
    try {
      const r = await api.listJobs();
      setHistory(r.jobs);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    setSettings(loadSettings());
    refresh();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => refresh(), 12000);
    return () => clearInterval(id);
  }, [refresh]);

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
      setGenerateOrigin("create");
      setScreen("generate");
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
      setGenerateOrigin("create");
      setScreen("generate");
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
      setGenerateOrigin("library");
      setScreen("generate");
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
    setScreen("create");
  };

  // ---- navigation ----
  const goTab = (t: Tab) => {
    if (t === "library") refresh();
    setScreen(t);
  };

  const openStyle = () => {
    setStyleMode("create");
    setScreen("style");
  };

  const openRerenderStyle = () => {
    setStyleMode("rerender");
    setScreen("style");
  };

  const styleCta = async () => {
    if (styleMode === "rerender") await rerender(settings);
    else await generate();
  };

  const hasSource = !!(url || upload);
  const showTabBar = screen !== "generate";
  const activeTab: Tab = screen === "library" ? "library" : "create";

  // primary CTA (sticky above the tab bar)
  let cta: { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; ghost?: boolean; aria: string } | null = null;
  if (screen === "create") {
    cta = hasSource
      ? { label: "Generate Clips", icon: Zap, onClick: openStyle, aria: "Generate clips" }
      : { label: "Add a link or file to continue", icon: Sparkles, onClick: () => {}, ghost: true, aria: "Add a source to continue" };
  } else if (screen === "style") {
    cta = {
      label: styleMode === "rerender" ? "Re-render clips" : "Generate Clips",
      icon: Zap,
      onClick: styleCta,
      disabled: submitting,
      aria: styleMode === "rerender" ? "Re-render clips with current style" : "Generate clips",
    };
  }

  return (
    <div className="relative min-h-screen bg-[#0B0B14] text-zinc-100">
      {/* aurora backdrop */}
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(140% 110% at 50% -10%, #171728 0%, #12121F 38%, #0B0B14 78%)" }}
        />
        <div
          className="absolute -top-44 left-1/2 h-[480px] w-[480px] -translate-x-1/2"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.20) 0%, transparent 62%)" }}
        />
        <div
          className="absolute -right-36 top-1/4 h-[380px] w-[380px]"
          style={{ background: "radial-gradient(circle, rgba(217,70,239,0.12) 0%, transparent 62%)" }}
        />
        <div
          className="absolute -left-36 bottom-0 h-[340px] w-[340px]"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.07) 0%, transparent 62%)" }}
        />
      </div>

      {/* fixed glass header */}
      <header className="fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="glass-blur border-x-0 border-t-0">
          <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(139,92,246,0.7)]"
                aria-hidden="true"
              >
                <Sparkles className="h-5 w-5" strokeWidth={1.5} />
              </span>
              <div>
                <h1 className="text-[17px] font-extrabold leading-none tracking-tight text-white">Autoclip</h1>
                <p className="mt-1 text-[10px] leading-none text-zinc-500">AI viral clip studio</p>
              </div>
            </div>
            <span
              className={`glass flex h-8 items-center gap-2 rounded-full px-3 text-[10px] font-semibold ${
                online ? "text-emerald-300" : "text-red-300"
              }`}
              role="status"
              aria-label={online ? "Engine online" : "Engine offline"}
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className={`ac-ping absolute inline-flex h-full w-full rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} />
              </span>
              {online ? "engine online" : "engine offline"}
            </span>
          </div>
        </div>
      </header>

      {/* screens */}
      <main
        className={`mx-auto w-full max-w-md px-4 pt-[calc(4rem+env(safe-area-inset-top)+1rem)] ${
          screen === "generate" ? "pb-8" : screen === "library" ? "pb-[9rem]" : "pb-[13.5rem]"
        }`}
      >
        {screen === "create" && (
          <div key="create" className="ac-screen">
            <CreateScreen
              url={url}
              onUrlChange={(v) => {
                setUrl(v);
                if (v) setUpload(null);
              }}
              onPaste={pasteFromClipboard}
              upload={upload}
              uploading={uploading}
              onFile={pickFile}
              onRemoveUpload={() => setUpload(null)}
              settings={settings}
              update={update}
              hasHistory={history.length > 0}
            />
          </div>
        )}

        {screen === "style" && (
          <div key="style" className="ac-slide-up">
            <StyleStep
              settings={settings}
              update={update}
              onBack={() => setScreen(styleMode === "rerender" ? "generate" : "create")}
            />
          </div>
        )}

        {screen === "generate" && job && (
          <div key={`generate-${job.id}`} className="ac-screen">
            <GenerateView
              job={job}
              settings={settings}
              onCancel={cancelJob}
              onRetry={retryJob}
              onRerender={rerender}
              onOpenStyle={openRerenderStyle}
              onNew={startNew}
              onBack={() => setScreen(generateOrigin)}
            />
          </div>
        )}

        {screen === "library" && (
          <div key="library" className="ac-screen">
            <LibraryScreen history={history} onOpen={openHistoryJob} onDelete={deleteHistoryJob} onGoCreate={() => goTab("create")} />
          </div>
        )}
      </main>

      {/* floating bottom stack: legibility scrim → primary CTA → glass tab bar */}
      {showTabBar && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
          <div
            className="h-24 bg-gradient-to-t from-[#0B0B14] via-[#0B0B14]/70 to-transparent"
            aria-hidden="true"
          />
          <div className="pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto w-full max-w-md space-y-3 px-4">
              {cta && (
                <div className="pointer-events-auto">
                  {cta.ghost ? (
                    <button
                      type="button"
                      disabled
                      aria-label={cta.aria}
                      className="glass flex h-14 w-full cursor-default items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-zinc-400"
                    >
                      <cta.icon className="h-4 w-4" strokeWidth={1.5} />
                      {cta.label}
                    </button>
                  ) : (
                    <div className="ac-cta-ring transition-transform duration-200 active:scale-[0.98]">
                      <button
                        type="button"
                        onClick={cta.onClick}
                        disabled={cta.disabled}
                        aria-label={cta.aria}
                        className="ac-focus flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 via-[#a855f7] to-fuchsia-500 text-[15px] font-bold text-white transition-transform duration-200 active:scale-[0.97] disabled:opacity-60"
                      >
                        {submitting ? (
                          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
                        ) : (
                          <cta.icon className="h-5 w-5" strokeWidth={1.5} />
                        )}
                        {cta.label}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <nav
                className="glass-blur relative pointer-events-auto flex items-center rounded-full p-1.5"
                aria-label="Primary tabs"
              >
                {/* animated pill indicator */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-full bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 ring-1 ring-inset ring-white/10 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    activeTab === "library" ? "translate-x-full" : "translate-x-0"
                  }`}
                />
                <TabButton
                  active={activeTab === "create"}
                  label="Create"
                  icon={Sparkles}
                  onClick={() => goTab("create")}
                />
                <TabButton
                  active={activeTab === "library"}
                  label="Library"
                  icon={LibraryIcon}
                  onClick={() => goTab("library")}
                />
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active, label, icon: Icon, onClick,
}: { active: boolean; label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={`${label} tab`}
      className="relative z-10 flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-xs font-semibold transition-colors duration-200 active:scale-[0.97]"
    >
      <Icon className={`h-[18px] w-[18px] transition-colors duration-200 ${active ? "text-violet-200" : "text-zinc-500"}`} strokeWidth={1.5} />
      <span className={active ? "text-white" : "text-zinc-400"}>{label}</span>
    </button>
  );
}
