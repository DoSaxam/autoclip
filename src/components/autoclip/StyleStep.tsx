"use client";

import { useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { PhonePreview } from "./PhonePreview";
import {
  ClipSettings, PRESET_META, FONT_OPTIONS, ASPECTS, EFFECTS, api,
} from "@/lib/autoclip";
import {
  Type, Sparkles, ImagePlus, Layers, ScanFace, Columns2, Check, UploadCloud,
} from "lucide-react";

const CARD =
  "rounded-2xl border border-white/5 bg-gradient-to-b from-zinc-900/70 to-zinc-900/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

export function StyleStep({
  settings,
  update,
}: {
  settings: ClipSettings;
  update: (patch: Partial<ClipSettings>) => void;
}) {
  const wmInput = useRef<HTMLInputElement>(null);

  const toggleEffect = (id: string, on: boolean) => {
    update({ effects: { ...settings.effects, [id]: on } });
  };

  const pickWatermark = async (f: File | undefined) => {
    if (!f) return;
    try {
      const res = await api.uploadFile(f, "watermark");
      update({ watermark: { path: res.path, size: settings.watermark?.size ?? 0.16, opacity: settings.watermark?.opacity ?? 0.85, pos: settings.watermark?.pos ?? "br" } });
    } catch (e) {
      console.error(e);
    }
  };

  const onEffects = EFFECTS.filter((fx) => settings.effects[fx.id]).length;
  const presetName = PRESET_META[settings.preset]?.name ?? "Custom";

  return (
    <div className="space-y-5 pb-2">
      {/* Sticky mini live preview — stays visible while scrolling options */}
      <div
        className="sticky z-10 -mx-4 px-4 py-1.5"
        style={{ top: "calc(3.5rem + env(safe-area-inset-top) + 0.25rem)" }}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/90 p-2 pr-3.5 shadow-xl backdrop-blur-md">
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
            <p className="truncate text-xs font-semibold text-zinc-100">
              {presetName}
              <span className="font-normal text-zinc-500"> · {settings.aspect}</span>
            </p>
            <p className="mt-0.5 truncate text-[10px] text-zinc-500">
              font {Math.round((settings.fontScale ?? 1) * 100)}% · pos {settings.position}% · {onEffects} effect{onEffects === 1 ? "" : "s"} on
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/20">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            live
          </span>
        </div>
      </div>

      {/* Aspect ratio */}
      <section aria-label="Aspect ratio" className={CARD}>
        <SectionTitle icon={<Columns2 className="h-4 w-4" strokeWidth={1.5} />} title="Aspect ratio" meta={`${ASPECTS.length} formats`} />
        <div className="grid grid-cols-4 gap-2">
          {ASPECTS.map((a) => {
            const selected = settings.aspect === a.id;
            const [aw, ah] = a.id.split(":").map(Number);
            const r = aw / ah;
            const gh = r === 1 ? 13 : r > 1 ? Math.round(20 / r) : 16;
            const gw = r === 1 ? 13 : r > 1 ? 20 : Math.round(16 * r);
            return (
              <button
                key={a.id}
                onClick={() => update({ aspect: a.id })}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-1.5 rounded-xl border transition-all duration-200 active:scale-[0.96] ${
                  selected
                    ? "border-amber-500/70 bg-amber-500/10 ring-2 ring-amber-500/40"
                    : "border-white/5 bg-zinc-900/60 hover:border-zinc-600/60"
                }`}
                aria-pressed={selected}
                aria-label={`Aspect ratio ${a.label}`}
              >
                <span className="flex h-4 items-center justify-center" aria-hidden="true">
                  <span
                    className={`rounded-[3px] border-[1.5px] transition-colors ${selected ? "border-amber-400 bg-amber-500/25" : "border-zinc-500 bg-zinc-700/40"}`}
                    style={{ width: `${gw}px`, height: `${gh}px` }}
                  />
                </span>
                <span className={`text-xs font-bold ${selected ? "text-amber-300" : "text-zinc-300"}`}>{a.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">{ASPECTS.find((a) => a.id === settings.aspect)?.sub}</p>
      </section>

      {/* Caption preset */}
      <section aria-label="Caption preset" className={CARD}>
        <SectionTitle icon={<Sparkles className="h-4 w-4" strokeWidth={1.5} />} title="Caption style" meta={`${Object.keys(PRESET_META).length} presets`} />
        <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Object.entries(PRESET_META).map(([id, pm]) => {
            const selected = settings.preset === id;
            return (
              <button
                key={id}
                onClick={() => update({ preset: id, font: null })}
                className={`flex w-[82px] shrink-0 snap-start flex-col items-center gap-1 rounded-xl border px-1.5 py-3 transition-all duration-200 active:scale-[0.95] ${
                  selected
                    ? "border-amber-500/70 bg-amber-500/10 ring-2 ring-amber-500/40"
                    : "border-white/5 bg-zinc-900/60 hover:border-zinc-600/60"
                }`}
                aria-pressed={selected}
                aria-label={`Caption preset ${pm.name}`}
              >
                <span
                  className={`${pm.css} block min-h-[22px] text-base leading-tight`}
                  style={{ fontFamily: `var(--fc-${id === "karaoke" ? "inter" : id === "hormozi" ? "archivo" : id === "marker" ? "marker" : id})` }}
                >
                  {pm.name}
                </span>
                <span className="flex h-4 items-center gap-0.5 text-[10px] font-medium text-zinc-500">
                  {selected ? <Check className="h-3 w-3 text-amber-400" strokeWidth={2.5} /> : null}
                  <span className="max-w-[62px] truncate">{pm.font}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Font override */}
        <div className="mt-4">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Font override</label>
          <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => update({ font: null })}
              className={`min-h-[44px] shrink-0 snap-start rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.96] ${
                !settings.font
                  ? "border-amber-500/70 bg-amber-500/10 text-amber-300 ring-2 ring-amber-500/40"
                  : "border-white/5 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600/60"
              }`}
              aria-pressed={!settings.font}
            >
              Preset default
            </button>
            {FONT_OPTIONS.map((f) => {
              const selected = settings.font === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => update({ font: f.id })}
                  className={`min-h-[44px] shrink-0 snap-start rounded-xl border px-3.5 py-2 text-sm transition-all duration-200 active:scale-[0.96] ${
                    selected
                      ? "border-amber-500/70 bg-amber-500/10 text-amber-300 ring-2 ring-amber-500/40"
                      : "border-white/5 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600/60"
                  }`}
                  aria-pressed={selected}
                  style={{ fontFamily: `${f.css.includes("fc") ? `var(--fc-${f.id})` : "inherit"}, sans-serif` }}
                >
                  {f.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Font size + position */}
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">Font size</span>
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-300">
                {Math.round((settings.fontScale ?? 1) * 100)}%
              </span>
            </div>
            <Slider
              value={[settings.fontScale ?? 1]}
              min={0.6}
              max={1.6}
              step={0.05}
              onValueChange={([v]) => update({ fontScale: v })}
              aria-label="Font size"
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-300">Caption position (top → bottom)</span>
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-300">
                {settings.position}%
              </span>
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

        <div className="mt-5 max-w-[170px]">
          <PhonePreview
            aspect={settings.aspect}
            preset={settings.preset}
            font={settings.font}
            position={settings.position}
            fontScale={settings.fontScale}
          />
        </div>
      </section>

      {/* Effects */}
      <section aria-label="Effects" className={CARD}>
        <SectionTitle
          icon={<Layers className="h-4 w-4" strokeWidth={1.5} />}
          title="Effects"
          meta={onEffects > 0 ? `${onEffects} of ${EFFECTS.length} on` : `${EFFECTS.length} available`}
        />
        <div className="grid grid-cols-2 gap-2">
          {EFFECTS.map((fx) => {
            const on = !!settings.effects[fx.id];
            return (
              <button
                key={fx.id}
                onClick={() => toggleEffect(fx.id, !on)}
                className={`flex min-h-[60px] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 active:scale-[0.97] ${
                  on ? "border-amber-500/50 bg-amber-500/[0.08]" : "border-white/5 bg-zinc-900/60 hover:border-zinc-600/60"
                }`}
                aria-pressed={on}
              >
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold leading-tight ${on ? "text-amber-300" : "text-zinc-300"}`}>{fx.name}</span>
                  <span className="block text-[10px] leading-tight text-zinc-500">{fx.desc}</span>
                </span>
                {/* animated mini switch */}
                <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${on ? "bg-amber-500" : "bg-zinc-700/90"}`}>
                  <span
                    className={`absolute left-[3px] top-1/2 size-[18px] -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-300 ${on ? "translate-x-[20px]" : "translate-x-0"}`}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Tracking + layout */}
      <section aria-label="Smart framing" className={CARD}>
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
      <section aria-label="Watermark" className={CARD}>
        <SectionTitle icon={<ImagePlus className="h-4 w-4" strokeWidth={1.5} />} title="Watermark" meta="optional" />
        {settings.watermark?.path ? (
          <div className="space-y-3 rounded-xl border border-white/5 bg-zinc-950/50 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-zinc-200">
                <Type className="h-4 w-4 text-emerald-400" strokeWidth={1.5} />
                Watermark ready
              </span>
              <Button variant="ghost" size="sm" className="h-9 rounded-lg text-xs text-zinc-400 hover:text-red-300" onClick={() => update({ watermark: null })}>
                Remove
              </Button>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">Size</span>
                <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-300">
                  {Math.round((settings.watermark.size ?? 0.16) * 100)}%
                </span>
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
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">Opacity</span>
                <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-300">
                  {Math.round((settings.watermark.opacity ?? 0.85) * 100)}%
                </span>
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
              onChange={(e) => pickWatermark(e.target.files?.[0])}
            />
            <button
              onClick={() => wmInput.current?.click()}
              className="ac-focus group flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-zinc-950/50 py-3 text-sm font-medium text-zinc-400 transition-all duration-200 hover:border-amber-500/40 hover:text-amber-400 active:scale-[0.99]"
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

function SectionTitle({
  icon, title, meta,
}: { icon: React.ReactNode; title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-zinc-100">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20">
          {icon}
        </span>
        {title}
      </h2>
      {meta && <span className="text-[10px] font-medium text-zinc-500">{meta}</span>}
    </div>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`flex min-h-[56px] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-200 ${checked ? "border-amber-500/40 bg-amber-500/[0.06]" : "border-white/5 bg-zinc-900/60"}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-200">{label}</div>
        <div className="text-[10px] leading-tight text-zinc-500">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
