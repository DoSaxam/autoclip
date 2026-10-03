"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ClipSettings, formatBytes } from "@/lib/autoclip";
import {
  Link2, Upload, Loader2, ClipboardPaste, Timer, X, Sparkles, Film,
  FileVideo, Youtube,
} from "lucide-react";

/**
 * Create screen — hero, source card (link + upload), clip settings.
 * All state/handlers are owned by the app shell (page.tsx).
 */
export function CreateScreen({
  url,
  onUrlChange,
  onPaste,
  upload,
  uploading,
  onFile,
  onRemoveUpload,
  settings,
  update,
  hasHistory,
}: {
  url: string;
  onUrlChange: (v: string) => void;
  onPaste: () => void;
  upload: { id: string; name: string; size: number } | null;
  uploading: boolean;
  onFile: (f: File | undefined) => void;
  onRemoveUpload: () => void;
  settings: ClipSettings;
  update: (patch: Partial<ClipSettings>) => void;
  hasHistory: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <section aria-label="Intro" className="ac-rise pt-2">
        <h2 className="text-[27px] font-extrabold leading-[1.12] tracking-tight text-white">
          Any video <span aria-hidden="true" className="text-zinc-600">→</span>{" "}
          <span className="ac-text-grad">Viral clips</span>
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
          Paste a link. We find the best moments, add captions, export vertical shorts.
        </p>
      </section>

      {/* Primary source card */}
      <section aria-label="Video source" className="glass ac-rise rounded-3xl p-4" style={{ animationDelay: "60ms" }}>
        <h3 className="mb-3 flex items-center gap-2.5 text-sm font-semibold text-white">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_6px_18px_-6px_rgba(139,92,246,0.8)]"
            aria-hidden="true"
          >
            <Link2 className="h-4 w-4" strokeWidth={1.5} />
          </span>
          Paste a video link
        </h3>
        <div className="relative rounded-2xl border border-white/10 bg-black/30 transition-all duration-200 focus-within:border-violet-400/60 focus-within:shadow-[0_0_0_4px_rgba(139,92,246,0.15)]">
          <Input
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://youtu.be/… or direct .mp4"
            className={`h-16 rounded-2xl border-0 bg-transparent pl-4 text-[15px] text-white placeholder:text-zinc-500 focus-visible:ring-0 ${url ? "pr-[128px]" : "pr-[96px]"}`}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Video link"
          />
          <div className="absolute right-0 top-0 flex h-16 translate-y-0 items-center gap-1 pr-2">
            {url && (
              <button
                type="button"
                onClick={() => onUrlChange("")}
                aria-label="Clear link"
                className="ac-hit flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:text-white"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
            <button
              type="button"
              onClick={onPaste}
              aria-label="Paste link from clipboard"
              className="ac-hit flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[11px] font-semibold text-violet-200 transition-all active:scale-95 hover:bg-white/[0.09]"
            >
              <ClipboardPaste className="h-4 w-4" strokeWidth={1.5} /> Paste
            </button>
          </div>
        </div>
        {/* platform hint chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-medium text-zinc-400" aria-hidden="true">
            <Youtube className="h-3.5 w-3.5 text-red-400" strokeWidth={1.5} /> YouTube
          </span>
          <span className="flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-medium text-zinc-400" aria-hidden="true">
            <FileVideo className="h-3.5 w-3.5 text-violet-300" strokeWidth={1.5} /> MP4 link
          </span>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label="Upload a video file instead"
            className="ac-hit flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-medium text-zinc-400 transition-colors hover:text-violet-200"
          >
            <Upload className="h-3.5 w-3.5 text-fuchsia-300" strokeWidth={1.5} /> Upload
          </button>
        </div>
      </section>

      {/* Upload dropzone */}
      <section aria-label="Upload file" className="glass ac-rise rounded-3xl p-4" style={{ animationDelay: "120ms" }}>
        <input
          ref={fileInput}
          type="file"
          accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          aria-label="Upload a video file"
          className="ac-focus group flex min-h-[104px] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-7 transition-all duration-200 hover:border-violet-400/50 hover:bg-violet-500/[0.04] active:scale-[0.99] disabled:opacity-60"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-fuchsia-500/25 text-violet-200 ring-1 ring-inset ring-white/10 transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-95">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Upload className="h-5 w-5" strokeWidth={1.5} />
            )}
          </span>
          <span className="text-sm font-semibold text-zinc-200">
            {uploading ? "Uploading…" : "Tap to upload"}
          </span>
          <span className="text-[10px] text-zinc-500">MP4 · MOV · MKV · WEBM</span>
        </button>
        {upload && (
          <div className="ac-rise mt-3 flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] px-3 py-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300" aria-hidden="true">
              <FileVideo className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-emerald-100">{upload.name}</p>
              <p className="text-[10px] text-emerald-300/70">{formatBytes(upload.size)} · ready to clip</p>
            </div>
            <button
              type="button"
              onClick={onRemoveUpload}
              aria-label="Remove uploaded file"
              className="ac-hit flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:text-red-300"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </section>

      {/* Clip settings */}
      <section aria-label="Clip settings" className="glass ac-rise rounded-3xl p-4" style={{ animationDelay: "180ms" }}>
        <h3 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-white">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_6px_18px_-6px_rgba(139,92,246,0.8)]"
            aria-hidden="true"
          >
            <Timer className="h-4 w-4" strokeWidth={1.5} />
          </span>
          Clip settings
        </h3>
        <div className="mb-3 flex items-center justify-center gap-2.5">
          <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3.5 py-1.5 text-[13px] font-bold tabular-nums text-violet-200">
            {settings.clip.minLen}s
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600" aria-hidden="true">to</span>
          <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-3.5 py-1.5 text-[13px] font-bold tabular-nums text-violet-200">
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Number of clips</p>
          <div className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {["auto", "3", "5", "10", "20"].map((n) => {
              const selected = settings.clip.maxClips === n;
              return (
                <button
                  type="button"
                  key={n}
                  onClick={() => update({ clip: { ...settings.clip, maxClips: n } })}
                  aria-pressed={selected}
                  className={`min-h-[44px] min-w-[64px] shrink-0 snap-start rounded-2xl border px-3 text-sm font-semibold transition-all duration-200 active:scale-[0.96] ${
                    selected
                      ? "border-violet-400/50 bg-gradient-to-b from-violet-500/20 to-fuchsia-500/15 text-violet-100 ring-1 ring-violet-400/40"
                      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20"
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
      {!hasHistory && (
        <section
          aria-label="No clips yet"
          className="ac-rise flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center"
          style={{ animationDelay: "240ms" }}
        >
          <span className="relative flex h-16 w-16 items-center justify-center" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-violet-500/10" />
            <Film className="h-8 w-8 text-zinc-600" strokeWidth={1.5} />
            <Sparkles className="absolute -right-1 -top-1 h-5 w-5 text-fuchsia-400" strokeWidth={1.5} />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-zinc-300">Your clips will appear here</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Everything you generate is saved to your Library for quick re-download.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
