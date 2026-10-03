"use client";

import { useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { PhonePreview, PRESET_FONT_VAR } from "./PhonePreview";
import {
  ClipSettings, PRESET_META, FONT_OPTIONS, ASPECTS, EFFECTS, api,
} from "@/lib/autoclip";
import {
  Sparkles, Columns2, ScanFace, Check, UploadCloud, ChevronLeft, Type, ImagePlus,
  Gauge, Sunset, Zap, ZoomIn, Activity, Vibrate, Grip, Focus, Clapperboard, Contrast, Blend,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const EFFECT_ICONS: Record<string, LucideIcon> = {
  progressBar: Gauge,
  fadeInOut: Sunset,
  flash: Zap,
  pushIn: ZoomIn,
  zoomPulse: Activity,
  shake: Vibrate,
  glow: Sparkles,
  grain: Grip,
  vignette: Focus,
  cinematic: Clapperboard,
  mono: Contrast,
  rgbSplit: Blend,
};

/**
 * Style studio — slides up as a full page over the Create screen.
 * Sticky live preview on top; every control updates it instantly.
 */
export function StyleStep({
  settings,
  update,
  onBack,
}: {
  settings: ClipSettings;
  update: (patch: Partial<ClipSettings>) => void;
  onBack: () => void;
}) {
  const wmInput = useRef<HTMLInputElement>(null);

  const toggleEffect = (id: string, on: boolean) => {
    update({ effects: { ...settings.effects, [id]: on } });
  };

  const pickWatermark = async (f: File | undefined) => {
    if (!f) return;
    try {
      const res = await api.uploadFile(f, "watermark");
      update({
        watermark: {
          path: res.path,
          size: settings.watermark?.size ?? 0.16,
          opacity: settings.watermark?.opacity ?? 0.85,
          pos: settings.watermark?.pos ?? "br",
        },
      });
    } catch (e) {
      console.error(e);
    }
  };

  const onEffects = EFFECTS.filter((fx) => settings.effects[fx.id]).length;
  const presetName = PRESET_META[settings.preset]?.name ?? "Custom";

  return (
    <div className="space-y-4">
      {/* top bar */}
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
          <h2 className="text-lg font-bold leading-tight tracking-tight text-white">Style studio</h2>
          <p className="text-[11px] text-zinc-500">Every change previews live</p>
        </div>
      </div>

      {/* sticky mini live preview — stays visible while scrolling options */}
      <div
        className="sticky z-10 -mx-4 px-4 py-1.5"
        style={{ top: "calc(4rem + env(safe-area-inset-top) + 0.375rem)" }}
      >
        <div className="glass-blur flex items-center gap-3 rounded-2xl p-2 pr-3">
          <div className="w-[52px] shrink-0">
            <PhonePreview
              aspect={settings.aspect}
              preset={settings.preset}
              font={settings.font}
              position={settings.position}
              fontScale={settings.fontScale}
              compact
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">
              {presetName}
              <span className="font-normal text-zinc-500"> · {settings.aspect}</span>
            </p>
            <p className="mt-0.5 truncate text-[10px] text-zinc-400">
              {onEffects} effect{onEffects === 1 ? "" : "s"} · font {Math.round((settings.fontScale ?? 1) * 100)}% · pos {settings.position}%
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-violet-500/15 px-2.5 py-1 text-[10px] font-semibold text-violet-300 ring-1 ring-inset ring-violet-400/25">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" aria-hidden="true" />
            live
          </span>
        </div>
      </div>

      {/* big live preview */}
      <section aria-label="Live style preview" className="ac-rise flex justify-center py-1">
        <div className="w-full max-w-[200px]">
          <PhonePreview
            aspect={settings.aspect}
            preset={settings.preset}
            font={settings.font}
            position={settings.position}
            fontScale={settings.fontScale}
          />
        </div>
      </section>

      {/* Aspect ratio */}
      <section aria-label="Aspect ratio" className="glass ac-rise rounded-3xl p-4">
        <SectionTitle icon={<Columns2 className="h-4 w-4" strokeWidth={1.5} />} title="Aspect ratio" meta={`${ASPECTS.length} formats`} />
        <div className="grid grid-cols-4 gap-2">
          {ASPECTS.map((a) => {
            const selected = settings.aspect === a.id;
            const [aw, ah] = a.id.split(":").map(Number);
            const r = aw / ah;
            const gh = r === 1 ? 14 : r > 1 ? Math.round(22 / r) : 18;
            const gw = r === 1 ? 14 : r > 1 ? 22 : Math.round(18 * r);
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => update({ aspect: a.id })}
                className={`flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-200 active:scale-[0.95] ${
                  selected
                    ? "border-violet-400/60 bg-gradient-to-b from-violet-500/15 to-fuchsia-500/10 shadow-[0_0_20px_-6px_rgba(139,92,246,0.5)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
                aria-pressed={selected}
                aria-label={`Aspect ratio ${a.label}`}
              >
                <span className="flex h-[22px] items-center justify-center" aria-hidden="true">
                  <span
                    className={`rounded-[4px] border-[1.5px] transition-colors ${
                      selected ? "border-violet-300 bg-violet-400/30" : "border-zinc-600 bg-white/[0.04]"
                    }`}
                    style={{ width: `${gw}px`, height: `${gh}px` }}
                  />
                </span>
                <span className={`text-[11px] font-bold ${selected ? "text-violet-100" : "text-zinc-400"}`}>{a.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-[11px] text-zinc-500">
          {ASPECTS.find((a) => a.id === settings.aspect)?.sub}
        </p>
      </section>

      {/* Caption preset + font override + size & position */}
      <section aria-label="Caption style" className="glass ac-rise rounded-3xl p-4">
        <SectionTitle
          icon={<Sparkles className="h-4 w-4" strokeWidth={1.5} />}
          title="Caption style"
          meta={`${Object.keys(PRESET_META).length} presets`}
        />
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(PRESET_META).map(([id, pm]) => {
            const selected = settings.preset === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => update({ preset: id, font: null })}
                className={`relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 transition-all duration-200 active:scale-[0.96] ${
                  selected
                    ? "border-violet-400/60 bg-gradient-to-b from-violet-500/15 to-fuchsia-500/10 ring-1 ring-violet-400/40"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
                aria-pressed={selected}
                aria-label={`Caption preset ${pm.name}`}
              >
                {selected && (
                  <span
                    className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_4px_12px_-4px_rgba(139,92,246,0.9)]"
                    aria-hidden="true"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
                <span
                  className={`${pm.css} px-1 text-center text-[15px] leading-tight`}
                  style={{ fontFamily: `var(--fc-${PRESET_FONT_VAR[id] ?? "inter"}, sans-serif)` }}
                >
                  {pm.name}
                </span>
                <span className="text-[10px] font-medium text-zinc-500">{pm.font}</span>
              </button>
            );
          })}
        </div>

        {/* Font override */}
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Font override</p>
          <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              onClick={() => update({ font: null })}
              className={`min-h-[44px] shrink-0 snap-start rounded-2xl border px-3.5 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.96] ${
                !settings.font
                  ? "border-violet-400/50 bg-gradient-to-b from-violet-500/20 to-fuchsia-500/15 text-violet-100 ring-1 ring-violet-400/40"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20"
              }`}
              aria-pressed={!settings.font}
            >
              Preset default
            </button>
            {FONT_OPTIONS.map((f) => {
              const selected = settings.font === f.id;
              return (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => update({ font: f.id })}
                  className={`min-h-[44px] shrink-0 snap-start rounded-2xl border px-3.5 py-2 text-sm transition-all duration-200 active:scale-[0.96] ${
                    selected
                      ? "border-violet-400/50 bg-gradient-to-b from-violet-500/20 to-fuchsia-500/15 text-violet-100 ring-1 ring-violet-400/40"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20"
                  }`}
                  aria-pressed={selected}
                  style={{ fontFamily: `var(--fc-${f.id}, sans-serif)` }}
                >
                  {f.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Size & position */}
        <div className="mt-5 space-y-5">
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-zinc-300">Caption size</span>
              <ValuePill value={`${Math.round((settings.fontScale ?? 1) * 100)}%`} />
            </div>
            <Slider
              value={[settings.fontScale ?? 1]}
              min={0.6}
              max={1.6}
              step={0.05}
              onValueChange={([v]) => update({ fontScale: v })}
              aria-label="Caption size"
            />
          </div>
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-zinc-300">Caption position</span>
              <ValuePill value={`${settings.position}%`} />
            </div>
            <Slider
              value={[settings.position]}
              min={5}
              max={95}
              step={1}
              onValueChange={([v]) => update({ position: v })}
              aria-label="Caption position"
            />
          </div>
        </div>
      </section>

      {/* Effects */}
      <section aria-label="Effects" className="glass ac-rise rounded-3xl p-4">
        <SectionTitle
          icon={<Activity className="h-4 w-4" strokeWidth={1.5} />}
          title="Effects"
          meta={onEffects > 0 ? `${onEffects} of ${EFFECTS.length} on` : `${EFFECTS.length} available`}
        />
        <div className="grid grid-cols-3 gap-2">
          {EFFECTS.map((fx) => {
            const on = !!settings.effects[fx.id];
            const Icon = EFFECT_ICONS[fx.id] ?? Sparkles;
            return (
              <button
                type="button"
                key={fx.id}
                onClick={() => toggleEffect(fx.id, !on)}
                title={fx.desc}
                className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 py-2.5 transition-all duration-200 active:scale-[0.94] ${
                  on
                    ? "border-violet-400/50 bg-gradient-to-b from-violet-500/25 to-fuchsia-500/20 text-violet-100 shadow-[0_6px_20px_-8px_rgba(139,92,246,0.6)]"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20"
                }`}
                aria-pressed={on}
                aria-label={`${fx.name} — ${fx.desc}`}
              >
                <Icon className={`h-[18px] w-[18px] ${on ? "text-violet-200" : "text-zinc-500"}`} strokeWidth={1.5} />
                <span className="text-center text-[10px] font-semibold leading-tight">{fx.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Smart framing */}
      <section aria-label="Smart framing" className="glass ac-rise rounded-3xl p-4">
        <SectionTitle icon={<ScanFace className="h-4 w-4" strokeWidth={1.5} />} title="Smart framing" meta="AI" />
        <div className="space-y-2.5">
          <ToggleRow
            label="Face tracking"
            desc="Keeps the speaker centered with smoothed motion"
            checked={settings.faceTrack}
            onChange={(v) => update({ faceTrack: v })}
          />
          <ToggleRow
            label="Podcast split-screen"
            desc="Stack two speakers into vertical panels"
            checked={settings.splitScreen}
            onChange={(v) => update({ splitScreen: v })}
          />
        </div>
      </section>

      {/* Watermark */}
      <section aria-label="Watermark" className="glass ac-rise rounded-3xl p-4">
        <SectionTitle icon={<ImagePlus className="h-4 w-4" strokeWidth={1.5} />} title="Watermark" meta="optional" />
        {settings.watermark?.path ? (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[13px] font-medium text-zinc-200">
                <Type className="h-4 w-4 text-emerald-300" strokeWidth={1.5} aria-hidden="true" />
                Watermark ready
              </span>
              <button
                type="button"
                onClick={() => update({ watermark: null })}
                aria-label="Remove watermark"
                className="ac-hit flex h-9 items-center rounded-xl px-3 text-xs font-medium text-zinc-400 transition-colors hover:text-red-300"
              >
                Remove
              </button>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium text-zinc-300">Size</span>
                <ValuePill value={`${Math.round((settings.watermark.size ?? 0.16) * 100)}%`} />
              </div>
              <Slider
                value={[settings.watermark.size ?? 0.16]}
                min={0.06}
                max={0.4}
                step={0.01}
                onValueChange={([v]) => update({ watermark: { ...settings.watermark!, size: v } })}
                aria-label="Watermark size"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium text-zinc-300">Opacity</span>
                <ValuePill value={`${Math.round((settings.watermark.opacity ?? 0.85) * 100)}%`} />
              </div>
              <Slider
                value={[settings.watermark.opacity ?? 0.85]}
                min={0.2}
                max={1}
                step={0.05}
                onValueChange={([v]) => update({ watermark: { ...settings.watermark!, opacity: v } })}
                aria-label="Watermark opacity"
              />
            </div>
          </div>
        ) : (
          <>
            <input
              ref={wmInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                pickWatermark(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => wmInput.current?.click()}
              className="ac-focus group flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-3.5 text-sm font-medium text-zinc-400 transition-all duration-200 hover:border-violet-400/50 hover:text-violet-200 active:scale-[0.99]"
            >
              <UploadCloud className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5" strokeWidth={1.5} />
              Upload watermark (PNG)
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function ValuePill({ value }: { value: string }) {
  return (
    <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[11px] font-bold tabular-nums text-violet-200">
      {value}
    </span>
  );
}

function SectionTitle({
  icon, title, meta,
}: { icon: React.ReactNode; title: string; meta?: string }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2.5 text-sm font-semibold text-white">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_6px_18px_-6px_rgba(139,92,246,0.8)]"
          aria-hidden="true"
        >
          {icon}
        </span>
        {title}
      </h3>
      {meta && <span className="text-[10px] font-medium text-zinc-500">{meta}</span>}
    </div>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className={`flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 transition-colors duration-200 ${
        checked ? "border-violet-400/40 bg-violet-500/[0.07]" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100">{label}</div>
        <div className="mt-0.5 text-[10px] leading-tight text-zinc-500">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
