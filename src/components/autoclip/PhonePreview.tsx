"use client";

import { PRESET_META, FONT_OPTIONS, ASPECTS } from "@/lib/autoclip";

/**
 * Maps a caption preset id to its --fc-* font variable
 * (defined in src/app/fonts.css — the exact fonts the engine burns in).
 */
export const PRESET_FONT_VAR: Record<string, string> = {
  karaoke: "inter",
  beast: "anton",
  hormozi: "archivo",
  pop: "titan",
  bounce: "luckiest",
  wobble: "bangers",
  rainbow: "poppins",
  typewriter: "rubik",
  slide: "montserrat",
  neon: "lexend",
  elastic: "kanit",
  marker: "marker",
  boxed: "inter",
  outline: "oswald",
  minimal: "inter",
};

/**
 * CSS approximation of the caption style inside a phone frame
 * (Aurora Glass edition — thin gradient bezel, violet progress bar).
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
  const family = fontOpt
    ? `var(--fc-${fontOpt.id}, sans-serif)`
    : `var(--fc-${PRESET_FONT_VAR[preset] ?? "inter"}, sans-serif)`;
  const size = compact ? "0.5rem" : `${(0.95 * (fontScale ?? 1)).toFixed(2)}rem`;
  const text = label ?? (compact ? "GO VIRAL" : "THIS IS YOUR CAPTION");

  return (
    <div className="mx-auto w-full" aria-hidden="true">
      {/* thin gradient bezel */}
      <div
        className={`bg-gradient-to-b from-white/25 via-white/10 to-white/[0.03] shadow-[0_16px_48px_-16px_rgba(0,0,0,0.85)] ${
          compact ? "rounded-[0.8rem] p-[2.5px]" : "rounded-[1.6rem] p-[3px]"
        }`}
      >
        <div
          className={`relative ${asp.ratio} w-full overflow-hidden bg-[#0d0d18] ${
            compact ? "rounded-[0.65rem]" : "rounded-[1.45rem]"
          }`}
        >
          {children ?? (
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 30% 15%, rgba(139,92,246,0.28), transparent 55%)," +
                  "radial-gradient(circle at 75% 80%, rgba(217,70,239,0.18), transparent 52%)," +
                  "linear-gradient(#0d0d18, #08080f)",
              }}
            />
          )}
          {/* dynamic-island notch */}
          {!compact && (
            <div className="absolute left-1/2 top-2 h-[5px] w-12 -translate-x-1/2 rounded-full bg-black/80" />
          )}
          {/* progress-bar effect (violet → fuchsia) */}
          <div
            className={`absolute inset-x-2 overflow-hidden rounded-full bg-white/10 ${
              compact ? "top-1.5 h-[3px]" : "top-3.5 h-1"
            }`}
          >
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400" />
          </div>
          {/* caption */}
          <div
            className="pointer-events-none absolute inset-x-3 flex justify-center"
            style={{ top: `${position}%`, transform: "translateY(-50%)" }}
          >
            <span
              className={`${pm.css} text-center leading-tight [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]`}
              style={{ fontFamily: `${family}, sans-serif`, fontSize: size }}
            >
              {text}
            </span>
          </div>
          {/* screen sheen */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-transparent" />
        </div>
      </div>
    </div>
  );
}
