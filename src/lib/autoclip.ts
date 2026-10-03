"use client";

/**
 * Autoclip engine client — all calls go through the Caddy gateway
 * via XTransformPort=8001 (engine) so they work from the browser.
 * On gateway errors (502/503/network) it triggers the self-heal route
 * and retries once.
 */

export const ENGINE_PORT = 8001;

export type ClipSettings = {
  aspect: string;
  preset: string;
  font?: string | null;
  fontScale?: number;
  position: number;
  clip: { minLen: number; maxLen: number; maxClips: string };
  faceTrack: boolean;
  splitScreen: boolean;
  effects: Record<string, boolean>;
  watermark?: { path?: string; size?: number; opacity?: number; pos?: string } | null;
};

export type Clip = {
  index: number;
  url: string;
  thumbUrl: string;
  title: string;
  score: number;
  reason?: string;
  start: number;
  end: number;
  duration: number;
  size: number;
  driveUrl?: string;
};

export type Job = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  message: string;
  error: string;
  source_url: string;
  source_kind: string;
  video_title: string;
  duration: number;
  settings: ClipSettings;
  clips: Clip[];
  create_time: number;
  start_time: number;
  end_time: number;
  stage_timings: Record<string, number>;
  has_transcript: boolean;
  sentences?: { start: number; end: number; text: string }[];
};

export const DEFAULT_SETTINGS: ClipSettings = {
  aspect: "9:16",
  preset: "karaoke",
  font: null,
  fontScale: 1,
  position: 50,
  clip: { minLen: 15, maxLen: 90, maxClips: "auto" },
  faceTrack: true,
  splitScreen: false,
  effects: { progressBar: true, fadeInOut: true, flash: false, zoomPulse: false, pushIn: false, shake: false, vignette: false, mono: false, cinematic: false, rgbSplit: false, grain: false, glow: false },
  watermark: null,
};

export const PRESET_META: Record<string, { name: string; css: string; font: string }> = {
  karaoke: { name: "Karaoke", font: "Inter", css: "text-white font-black" },
  beast: { name: "Beast", font: "Anton", css: "text-red-500 font-black uppercase tracking-tight" },
  hormozi: { name: "Hormozi", font: "Archivo Black", css: "text-yellow-400 font-black uppercase" },
  pop: { name: "Pop", font: "Titan One", css: "text-fuchsia-400 font-black" },
  bounce: { name: "Bounce", font: "Luckiest Guy", css: "text-orange-400 font-black" },
  wobble: { name: "Wobble", font: "Bangers", css: "text-lime-400 font-black uppercase tracking-wide" },
  rainbow: { name: "Rainbow", font: "Poppins ExtraBold", css: "text-emerald-400 font-extrabold" },
  typewriter: { name: "Typewriter", font: "Rubik Black", css: "text-white font-black" },
  slide: { name: "Slide", font: "Montserrat Black", css: "text-white font-black uppercase" },
  neon: { name: "Neon", font: "Lexend ExtraBold", css: "text-cyan-300 font-extrabold drop-shadow-[0_0_12px_rgba(103,232,249,0.9)]" },
  elastic: { name: "Elastic", font: "Kanit Black", css: "text-white font-black uppercase" },
  marker: { name: "Marker", font: "Permanent Marker", css: "text-white" },
  boxed: { name: "Boxed", font: "Inter", css: "text-white bg-black/70 px-2 py-0.5 rounded font-bold" },
  outline: { name: "Outline", font: "Oswald", css: "text-black font-bold uppercase [text-shadow:0_0_2px_white,0_0_2px_white,2px_0_0_white,-2px_0_0_white,0_2px_white,0_-2px_white]" },
  minimal: { name: "Minimal", font: "Inter", css: "text-white text-sm font-semibold" },
};

export const FONT_OPTIONS: { id: string; name: string; css: string }[] = [
  { id: "inter", name: "Inter Black", css: "font-[family-name:var(--fc-inter)]" },
  { id: "anton", name: "Anton", css: "font-[family-name:var(--fc-anton)]" },
  { id: "bebas", name: "Bebas Neue", css: "font-[family-name:var(--fc-bebas)]" },
  { id: "poppins", name: "Poppins", css: "font-[family-name:var(--fc-poppins)]" },
  { id: "bangers", name: "Bangers", css: "font-[family-name:var(--fc-bangers)]" },
  { id: "titan", name: "Titan One", css: "font-[family-name:var(--fc-titan)]" },
  { id: "marker", name: "Marker", css: "font-[family-name:var(--fc-marker)]" },
  { id: "archivo", name: "Archivo Black", css: "font-[family-name:var(--fc-archivo)]" },
  { id: "luckiest", name: "Luckiest Guy", css: "font-[family-name:var(--fc-luckiest)]" },
  { id: "montserrat", name: "Montserrat", css: "font-[family-name:var(--fc-montserrat)]" },
  { id: "oswald", name: "Oswald", css: "font-[family-name:var(--fc-oswald)]" },
  { id: "rubik", name: "Rubik", css: "font-[family-name:var(--fc-rubik)]" },
  { id: "lexend", name: "Lexend", css: "font-[family-name:var(--fc-lexend)]" },
  { id: "kanit", name: "Kanit", css: "font-[family-name:var(--fc-kanit)]" },
  { id: "alfaslab", name: "Alfa Slab", css: "font-[family-name:var(--fc-alfaslab)]" },
  { id: "sigmar", name: "Sigmar One", css: "font-[family-name:var(--fc-sigmar)]" },
  { id: "passion", name: "Passion One", css: "font-[family-name:var(--fc-passion)]" },
  { id: "righteous", name: "Righteous", css: "font-[family-name:var(--fc-righteous)]" },
  { id: "creepster", name: "Creepster", css: "font-[family-name:var(--fc-creepster)]" },
  { id: "lobster", name: "Lobster", css: "font-[family-name:var(--fc-lobster)]" },
  { id: "pacifico", name: "Pacifico", css: "font-[family-name:var(--fc-pacifico)]" },
  { id: "fredoka", name: "Fredoka", css: "font-[family-name:var(--fc-fredoka)]" },
];

export const ASPECTS = [
  { id: "9:16", label: "9:16", sub: "Shorts / Reels / TikTok", ratio: "aspect-[9/16]" },
  { id: "1:1", label: "1:1", sub: "Square feed", ratio: "aspect-square" },
  { id: "4:5", label: "4:5", sub: "Instagram portrait", ratio: "aspect-[4/5]" },
  { id: "16:9", label: "16:9", sub: "YouTube landscape", ratio: "aspect-video" },
];

export const EFFECTS: { id: string; name: string; desc: string }[] = [
  { id: "progressBar", name: "Progress bar", desc: "Growing bar at the top" },
  { id: "fadeInOut", name: "Fade in/out", desc: "Smooth clip entrance & exit" },
  { id: "flash", name: "Flash", desc: "White flash on cut" },
  { id: "pushIn", name: "Slow push-in", desc: "Gradual zoom for energy" },
  { id: "zoomPulse", name: "Zoom pulse", desc: "Rhythmic punch-in beats" },
  { id: "shake", name: "Shake", desc: "Handheld camera shake" },
  { id: "glow", name: "Glow", desc: "Dreamy bloom highlights" },
  { id: "grain", name: "Film grain", desc: "Analog texture" },
  { id: "vignette", name: "Vignette", desc: "Darkened corners" },
  { id: "cinematic", name: "Cinematic", desc: "Teal-orange grade" },
  { id: "mono", name: "Mono", desc: "Black & white" },
  { id: "rgbSplit", name: "RGB split", desc: "Glitch channel shift" },
];

async function ensureEngine(): Promise<void> {
  try {
    await fetch("/api/engine/ensure", { cache: "no-store" });
  } catch {
    /* next-server may be cold — ignore */
  }
}

async function engineFetch<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const url = `/engine${path}${path.includes("?") ? "&" : "?"}XTransformPort=${ENGINE_PORT}`;
  try {
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (res.status === 502 || res.status === 503) throw new Error("gateway");
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || body.error || `engine error ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    if (!retried && (msg.includes("gateway") || msg.includes("Failed to fetch"))) {
      await ensureEngine();
      await new Promise((r) => setTimeout(r, 2500));
      return engineFetch<T>(path, init, true);
    }
    throw e;
  }
}

export const api = {
  createJob: (body: { source_url?: string; upload_id?: string; settings: ClipSettings }) =>
    engineFetch<{ job_id: string }>("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getJob: (id: string) => engineFetch<Job>(`/api/jobs/${id}`),
  listJobs: () => engineFetch<{ jobs: Job[] }>("/api/jobs"),
  cancelJob: (id: string) => engineFetch<{ ok: boolean }>(`/api/jobs/${id}/cancel`, { method: "POST" }),
  retryJob: (id: string) => engineFetch<{ ok: boolean }>(`/api/jobs/${id}/retry`, { method: "POST" }),
  rerender: (id: string, settings: ClipSettings) =>
    engineFetch<{ ok: boolean }>(`/api/jobs/${id}/rerender`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    }),
  deleteJob: (id: string) => engineFetch<{ ok: boolean }>(`/api/jobs/${id}`, { method: "DELETE" }),
  saveTranscript: (id: string, sentences: { text: string }[]) =>
    engineFetch<{ ok: boolean }>(`/api/jobs/${id}/transcript`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentences }),
    }),
  driveStatus: () => engineFetch<{ configured: boolean; connected: boolean; email: string }>("/api/drive/status"),
  driveConnect: (origin: string) =>
    engineFetch<{ auth_url: string }>(`/api/drive/connect?redirect=${encodeURIComponent(origin)}`),
  uploadFile: async (file: File, kind: "media" | "watermark") => {
    const fd = new FormData();
    fd.append("file", file);
    const path = kind === "media" ? "/api/upload" : "/api/watermark";
    return engineFetch<{ upload_id?: string; path: string; size: number; name: string }>(path, {
      method: "POST",
      body: fd,
    });
  },
};

export function clipFileUrl(jobId: string, clip: Clip): string {
  return `${clip.url}?XTransformPort=${ENGINE_PORT}`;
}

export function zipUrl(jobId: string): string {
  return `/engine/api/jobs/${jobId}/zip?XTransformPort=${ENGINE_PORT}`;
}

export function formatBytes(n: number): string {
  if (!n) return "--";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDur(s: number): string {
  if (!s) return "--";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
}

const LS_KEY = "autoclip-settings-v1";

export function loadSettings(): ClipSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, clip: { ...DEFAULT_SETTINGS.clip, ...(parsed.clip || {}) }, effects: { ...DEFAULT_SETTINGS.effects, ...(parsed.effects || {}) } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: ClipSettings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}
