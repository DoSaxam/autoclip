"use client";

import { PRESET_META, FONT_OPTIONS, ASPECTS } from "@/lib/autoclip";

/**
 * CSS approximation of the caption style inside a phone frame.
 * The engine renders the authoritative version (see LivePreview dialog).
 */
export function PhonePreview({
  aspect,
  preset,
  font,
  position,
  fontScale,
  children,
}: {
  aspect: string;
  preset: string;
  font?: string | null;
  position: number;
  fontScale?: number;
  children?: React.ReactNode;
}) {
  const asp = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
  const pm = PRESET_META[preset] ?? PRESET_META.karaoke;
  const fontOpt = font ? FONT_OPTIONS.find((f) => f.id === font) : null;
  const family = fontOpt ? `var(--fc-${fontOpt.id})` : `'${pm.font}'`;
  const size = `${(0.95 * (fontScale ?? 1)).toFixed(2)}rem`;

  return (
    <div className="mx-auto w-full">
      <div
        className={`relative ${asp.ratio} w-full overflow-hidden rounded-[1.6rem] border-4 border-zinc-700 bg-gradient-to-b from-zinc-800 via-zinc-900 to-black shadow-xl`}
      >
        {children ?? (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#3f3f46,#18181b_70%)]" />
        )}
        <div
          className="pointer-events-none absolute inset-x-3 flex justify-center"
          style={{ top: `${position}%`, transform: "translateY(-50%)" }}
        >
          <span
            className={`${pm.css} text-center leading-tight [text-shadow:0_2px_6px_rgba(0,0,0,0.9)]`}
            style={{ fontFamily: `${family}, sans-serif`, fontSize: size }}
          >
            THIS IS YOUR CAPTION
          </span>
        </div>
        <div className="absolute inset-x-2 top-2 h-1 overflow-hidden rounded-full bg-black/50">
          <div className="h-full w-2/3 rounded-full bg-emerald-500" />
        </div>
      </div>
    </div>
  );
}
