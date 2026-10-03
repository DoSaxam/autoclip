"use client";

import { PRESET_META, FONT_OPTIONS, ASPECTS } from "@/lib/autoclip";

/**
 * CSS approximation of the caption style inside a phone frame.
 * The engine renders the authoritative version (see LivePreview dialog).
 * `compact` renders a mini variant for the sticky style preview.
 */
export function PhonePreview({
  aspect,
  preset,
  font,
  position,
  fontScale,
  label,
  compact = false,
  children,
}: {
  aspect: string;
  preset: string;
  font?: string | null;
  position: number;
  fontScale?: number;
  label?: string;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const asp = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
  const pm = PRESET_META[preset] ?? PRESET_META.karaoke;
  const fontOpt = font ? FONT_OPTIONS.find((f) => f.id === font) : null;
  const family = fontOpt ? `var(--fc-${fontOpt.id})` : `'${pm.font}'`;
  const size = compact ? "0.5rem" : `${(0.95 * (fontScale ?? 1)).toFixed(2)}rem`;
  const text = label ?? (compact ? "GO VIRAL" : "THIS IS YOUR CAPTION");

  return (
    <div className="mx-auto w-full" aria-hidden="true">
      <div
        className={`relative ${asp.ratio} w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-gradient-to-b from-zinc-800 via-zinc-900 to-black shadow-[0_10px_36px_-14px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)]`}
      >
        {children ?? (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#3f3f46,#18181b_70%)]" />
        )}
        {/* dynamic-island notch */}
        {!compact && (
          <div className="absolute left-1/2 top-2 h-[5px] w-12 -translate-x-1/2 rounded-full bg-black/80" />
        )}
        {/* progress-bar effect */}
        <div className={`absolute inset-x-2 overflow-hidden rounded-full bg-black/50 ${compact ? "top-1.5 h-[3px]" : "top-3.5 h-1"}`}>
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
        </div>
        <div
          className="pointer-events-none absolute inset-x-3 flex justify-center"
          style={{ top: `${position}%`, transform: "translateY(-50%)" }}
        >
          <span
            className={`${pm.css} text-center leading-tight [text-shadow:0_2px_6px_rgba(0,0,0,0.9)]`}
            style={{ fontFamily: `${family}, sans-serif`, fontSize: size }}
          >
            {text}
          </span>
        </div>
        {/* screen sheen */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent" />
      </div>
    </div>
  );
}
