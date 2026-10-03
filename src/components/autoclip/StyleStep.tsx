"use client";

import { useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { PhonePreview } from "./PhonePreview";
import {
  ClipSettings, PRESET_META, FONT_OPTIONS, ASPECTS, EFFECTS, api,
} from "@/lib/autoclip";
import { Type, Sparkles, ImagePlus, Layers, ScanFace, Columns2 } from "lucide-react";

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

  return (
    <div className="space-y-6 pb-4">
      {/* Aspect ratio */}
      <section aria-label="Aspect ratio">
        <SectionTitle icon={<Columns2 className="h-4 w-4" />}>Aspect ratio</SectionTitle>
        <div className="grid grid-cols-4 gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => update({ aspect: a.id })}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors ${
                settings.aspect === a.id
                  ? "border-amber-500 bg-amber-500/10 text-amber-400"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
              }`}
              aria-pressed={settings.aspect === a.id}
            >
              <span className="text-sm font-bold">{a.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">{ASPECTS.find((a) => a.id === settings.aspect)?.sub}</p>
      </section>

      {/* Caption preset */}
      <section aria-label="Caption preset">
        <SectionTitle icon={<Sparkles className="h-4 w-4" />}>Caption style</SectionTitle>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Object.entries(PRESET_META).map(([id, pm]) => (
            <button
              key={id}
              onClick={() => update({ preset: id, font: null })}
              className={`shrink-0 rounded-xl border px-3.5 py-3 text-center transition-colors ${
                settings.preset === id
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
              }`}
              aria-pressed={settings.preset === id}
            >
              <span
                className={`${pm.css} block text-base`}
                style={{ fontFamily: `var(--fc-${id === "karaoke" ? "inter" : id === "hormozi" ? "archivo" : id === "marker" ? "marker" : id})` }}
              >
                {pm.name}
              </span>
            </button>
          ))}
        </div>

        {/* Font override */}
        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">Font override</label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => update({ font: null })}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs ${
                !settings.font ? "border-amber-500 text-amber-400" : "border-zinc-800 text-zinc-400"
              }`}
            >
              Preset default
            </button>
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => update({ font: f.id })}
                className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${
                  settings.font === f.id ? "border-amber-500 text-amber-400" : "border-zinc-800 text-zinc-300"
                }`}
                style={{ fontFamily: `${f.css.includes("fc") ? `var(--fc-${f.id})` : "inherit"}, sans-serif` }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Font size + position */}
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-zinc-400">
              <span>Font size</span>
              <span className="text-zinc-500">{Math.round((settings.fontScale ?? 1) * 100)}%</span>
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
            <div className="mb-1.5 flex justify-between text-xs text-zinc-400">
              <span>Caption position (top → bottom)</span>
              <span className="text-zinc-500">{settings.position}%</span>
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

        <div className="mt-5 max-w-[220px]">
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
      <section aria-label="Effects">
        <SectionTitle icon={<Layers className="h-4 w-4" />}>Effects</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {EFFECTS.map((fx) => {
            const on = !!settings.effects[fx.id];
            return (
              <button
                key={fx.id}
                onClick={() => toggleEffect(fx.id, !on)}
                className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-amber-500/60 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                }`}
                aria-pressed={on}
              >
                <span>
                  <span className={`block text-sm font-semibold ${on ? "text-amber-300" : "text-zinc-300"}`}>{fx.name}</span>
                  <span className="block text-[10px] leading-tight text-zinc-500">{fx.desc}</span>
                </span>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? "bg-amber-400" : "bg-zinc-700"}`} />
              </button>
            );
          })}
        </div>
      </section>

      {/* Tracking + layout */}
      <section aria-label="Smart framing">
        <SectionTitle icon={<ScanFace className="h-4 w-4" />}>Smart framing</SectionTitle>
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
      <section aria-label="Watermark">
        <SectionTitle icon={<ImagePlus className="h-4 w-4" />}>Watermark</SectionTitle>
        {settings.watermark?.path ? (
          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Watermark ready</span>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-400" onClick={() => update({ watermark: null })}>
                Remove
              </Button>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-zinc-400">
                <span>Size</span>
                <span className="text-zinc-500">{Math.round((settings.watermark.size ?? 0.16) * 100)}%</span>
              </div>
              <Slider
                value={[settings.watermark.size ?? 0.16]}
                min={0.06}
                max={0.4}
                step={0.01}
                onValueChange={([v]) => update({ watermark: { ...settings.watermark!, size: v } })}
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-zinc-400">
                <span>Opacity</span>
                <span className="text-zinc-500">{Math.round((settings.watermark.opacity ?? 0.85) * 100)}%</span>
              </div>
              <Slider
                value={[settings.watermark.opacity ?? 0.85]}
                min={0.2}
                max={1}
                step={0.05}
                onValueChange={([v]) => update({ watermark: { ...settings.watermark!, opacity: v } })}
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
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 py-3 text-sm text-zinc-400 hover:border-zinc-600"
            >
              <Type className="h-4 w-4" /> Upload watermark (PNG)
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
      <span className="text-amber-400">{icon}</span>
      {children}
    </h2>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-3">
      <div>
        <div className="text-sm font-medium text-zinc-200">{label}</div>
        <div className="text-[10px] text-zinc-500">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
