"""ASS subtitle generator — 15 caption presets, real libass rendering.

Presets define: font, size scale, colors (primary/secondary/outline/back),
outline/shadow, bold/italic, uppercase, alignment, word animation style
(karaoke highlight / pop-in / typewriter reveal / bounce / wobble / rainbow /
elastic / slide-in), boxed background, and per-word timing granularity.
"""
import math

# ASS alignment (numpad): 2=bottom-center, 5=middle-center, 8=top-center
ASS_COLORS = {
    "white": "&H00FFFFFF",
    "yellow": "&H0000E5FF",  # BGR
    "red": "&H0027D1FF",     # #FF2727 in RGB -> BGR 27D1FF? careful: #FFD127
    "green": "&H0054D82D",
    "cyan": "&H00E7C41B",
    "magenta": "&H00D96EF0",
    "black": "&H00000000",
    "dark": "&HAA000000",
    "orange": "&H002792FF",
}

FONT_FILES = {
    # font id -> (family name, file)
    "inter": ("Inter", "Inter-Black.ttf"),
    "inter-bold": ("Inter", "Inter-Bold.ttf"),
    "anton": ("Anton", "Anton-Regular.ttf"),
    "bebas": ("Bebas Neue", "BebasNeue-Regular.ttf"),
    "poppins": ("Poppins ExtraBold", "Poppins-ExtraBold.ttf"),
    "bangers": ("Bangers", "Bangers-Regular.ttf"),
    "titan": ("Titan One", "TitanOne-Regular.ttf"),
    "marker": ("Permanent Marker", "PermanentMarker-Regular.ttf"),
    "archivo": ("Archivo Black", "ArchivoBlack-Regular.ttf"),
    "luckiest": ("Luckiest Guy", "LuckiestGuy-Regular.ttf"),
    "montserrat": ("Montserrat Black", "Montserrat-Black.ttf"),
    "oswald": ("Oswald", "Oswald-Bold.ttf"),
    "rubik": ("Rubik Black", "Rubik-Black.ttf"),
    "lexend": ("Lexend ExtraBold", "Lexend-ExtraBold.ttf"),
    "kanit": ("Kanit Black", "Kanit-Black.ttf"),
    "alfaslab": ("Alfa Slab One", "AlfaSlabOne-Regular.ttf"),
    "sigmar": ("Sigmar One", "SigmarOne-Regular.ttf"),
    "passion": ("Passion One Bold", "PassionOne-Bold.ttf"),
    "righteous": ("Righteous", "Righteous-Regular.ttf"),
    "creepster": ("Creepster", "Creepster-Regular.ttf"),
    "lobster": ("Lobster", "Lobster-Regular.ttf"),
    "pacifico": ("Pacifico", "Pacifico-Regular.ttf"),
    "fredoka": ("Fredoka SemiBold", "Fredoka-SemiBold.ttf"),
}

PRESETS = {
    "karaoke": {
        "name": "Karaoke Highlight", "font": "inter", "size": 86, "upper": False,
        "primary": "yellow", "secondary": "white", "outline": "black", "back": "black",
        "outline_w": 4, "shadow": 2, "boxed": False, "anim": "karaoke", "align": 2,
        "margin_scale": 0.10, "default_on": True, "desc": "Words light up as they are spoken",
    },
    "beast": {
        "name": "Beast Mode", "font": "anton", "size": 110, "upper": True,
        "primary": "red", "secondary": "white", "outline": "black", "back": "black",
        "outline_w": 6, "shadow": 3, "boxed": False, "anim": "pop", "align": 5,
        "margin_scale": 0.0, "default_on": False, "desc": "Huge aggressive center-punch caps",
    },
    "hormozi": {
        "name": "Hormozi", "font": "archivo", "size": 92, "upper": True,
        "primary": "yellow", "secondary": "white", "outline": "black", "back": "black",
        "outline_w": 5, "shadow": 2, "boxed": False, "anim": "karaoke", "align": 2,
        "margin_scale": 0.14, "default_on": False, "desc": "Classic yellow caps, bottom placement",
    },
    "pop": {
        "name": "Pop Words", "font": "titan", "size": 84, "upper": False,
        "primary": "white", "secondary": "white", "outline": "magenta", "back": "black",
        "outline_w": 5, "shadow": 0, "boxed": False, "anim": "pop", "align": 2,
        "margin_scale": 0.12, "default_on": False, "desc": "Every word pops in with scale overshoot",
    },
    "bounce": {
        "name": "Bounce", "font": "luckiest", "size": 80, "upper": False,
        "primary": "orange", "secondary": "white", "outline": "black", "back": "black",
        "outline_w": 4, "shadow": 3, "boxed": False, "anim": "bounce", "align": 2,
        "margin_scale": 0.12, "default_on": False, "desc": "Words drop in with a springy bounce",
    },
    "wobble": {
        "name": "Wobble", "font": "bangers", "size": 88, "upper": True,
        "primary": "green", "secondary": "white", "outline": "black", "back": "black",
        "outline_w": 5, "shadow": 2, "boxed": False, "anim": "wobble", "align": 2,
        "margin_scale": 0.12, "default_on": False, "desc": "Comic caps with playful rotation",
    },
    "rainbow": {
        "name": "Rainbow Flow", "font": "poppins", "size": 78, "upper": False,
        "primary": "white", "secondary": "white", "outline": "black", "back": "black",
        "outline_w": 4, "shadow": 1, "boxed": False, "anim": "rainbow", "align": 2,
        "margin_scale": 0.12, "default_on": False, "desc": "Colors cycle through every word",
    },
    "typewriter": {
        "name": "Typewriter", "font": "rubik", "size": 74, "upper": False,
        "primary": "white", "secondary": "white", "outline": "black", "back": "black",
        "outline_w": 3, "shadow": 0, "boxed": False, "anim": "typewriter", "align": 8,
        "margin_scale": 0.10, "default_on": False, "desc": "Words appear in sync with speech, top",
    },
    "slide": {
        "name": "Slide In", "font": "montserrat", "size": 76, "upper": True,
        "primary": "white", "secondary": "white", "outline": "black", "back": "black",
        "outline_w": 4, "shadow": 2, "boxed": False, "anim": "slide", "align": 2,
        "margin_scale": 0.12, "default_on": False, "desc": "Lines slide in from the left",
    },
    "neon": {
        "name": "Neon Glow", "font": "lexend", "size": 80, "upper": False,
        "primary": "cyan", "secondary": "cyan", "outline": "magenta", "back": "black",
        "outline_w": 3, "shadow": 0, "boxed": False, "anim": "none", "align": 5,
        "margin_scale": 0.0, "default_on": False, "desc": "Retro neon sign look, centered",
    },
    "elastic": {
        "name": "Elastic Scale", "font": "kanit", "size": 82, "upper": True,
        "primary": "white", "secondary": "yellow", "outline": "black", "back": "black",
        "outline_w": 4, "shadow": 1, "boxed": False, "anim": "elastic", "align": 2,
        "margin_scale": 0.12, "default_on": False, "desc": "Lines snap in with elastic easing",
    },
    "marker": {
        "name": "Marker", "font": "marker", "size": 78, "upper": False,
        "primary": "white", "secondary": "yellow", "outline": "black", "back": "black",
        "outline_w": 4, "shadow": 1, "boxed": False, "anim": "karaoke", "align": 2,
        "margin_scale": 0.12, "default_on": False, "desc": "Handwritten marker style",
    },
    "boxed": {
        "name": "Boxed Caption", "font": "inter", "size": 72, "upper": False,
        "primary": "white", "secondary": "yellow", "outline": "dark", "back": "black",
        "outline_w": 3, "shadow": 0, "boxed": True, "anim": "karaoke", "align": 2,
        "margin_scale": 0.12, "default_on": False, "desc": "Clean text on a dark bar",
    },
    "outline": {
        "name": "Outline Pop", "font": "oswald", "size": 84, "upper": True,
        "primary": "black", "secondary": "yellow", "outline": "white", "back": "black",
        "outline_w": 5, "shadow": 0, "boxed": False, "anim": "karaoke", "align": 5,
        "margin_scale": 0.0, "default_on": False, "desc": "Black fill, thick white outline",
    },
    "minimal": {
        "name": "Minimal", "font": "inter-bold", "size": 58, "upper": False,
        "primary": "white", "secondary": "white", "outline": "black", "back": "black",
        "outline_w": 2, "shadow": 0, "boxed": False, "anim": "none", "align": 2,
        "margin_scale": 0.10, "default_on": False, "desc": "Small, clean, unobtrusive",
    },
}


def _ts(sec: float) -> str:
    sec = max(0.0, sec)
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _wrap_words(words, max_words_per_line=4, max_chars=26):
    """Group word dicts into lines (list of list)."""
    lines, cur, cur_len = [], [], 0
    for w in words:
        wl = len(w["word"]) + 1
        if cur and (cur_len + wl > max_chars or len(cur) >= max_words_per_line):
            lines.append(cur)
            cur, cur_len = [], 0
        cur.append(w)
        cur_len += wl
    if cur:
        lines.append(cur)
    return lines


def _font_size_for(preset, line_text: str, video_h: int) -> int:
    base = preset["size"] * (video_h / 1920.0)
    # shrink long lines to fit width
    factor = max(0.55, min(1.0, 24.0 / max(12, len(line_text))))
    return int(base * factor)


class AssBuilder:
    def __init__(self, video_w: int, video_h: int, position: int, preset_id: str,
                 font_override=None, font_scale: float = 1.0):
        """position: 0-100 vertical slider (0 top, 100 bottom)."""
        self.w, self.h = video_w, video_h
        self.position = max(0, min(100, position))
        self.preset_id = preset_id if preset_id in PRESETS else "karaoke"
        self.preset = PRESETS[self.preset_id]
        self.font_override = font_override if font_override in FONT_FILES else None
        self.font_scale = font_scale or 1.0
        self.events = []
        p = self.preset
        self.align = p["align"]
        # vertical anchor from position slider
        if self.align == 5:
            self.margin_v = int(self.h * (0.10 + 0.80 * (self.position / 100.0)))
        elif self.align == 2:
            self.margin_v = int(self.h * (0.05 + 0.30 * (self.position / 100.0)))
        else:  # align 8 top
            self.margin_v = int(self.h * (0.05 + 0.30 * (self.position / 100.0)))

    def _anchor_y(self) -> int:
        if self.align == 2:
            return self.h - self.margin_v
        if self.align == 8:
            return self.margin_v
        return self.h // 2

    def header(self) -> str:
        p = self.preset
        font_key = self.font_override or p["font"]
        family, _ = FONT_FILES.get(font_key, ("Inter", "Inter-Black.ttf"))
        prim = ASS_COLORS[p["primary"]]
        sec = ASS_COLORS[p["secondary"]]
        outl = ASS_COLORS[p["outline"]]
        back = ASS_COLORS[p["back"]]
        bord = p["outline_w"]
        shad = p["shadow"]
        box = 3 if p["boxed"] else 1  # BorderStyle 3 = opaque box
        return (
            "[Script Info]\n"
            "ScriptType: v4.00+\n"
            f"PlayResX: {self.w}\nPlayResY: {self.h}\n"
            "WrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,"
            " Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline,"
            " Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            f"Style: Caption,{family},{int(72 * self.font_scale)},{prim},{sec},{outl},{back},"
            f"{-1 if p['upper'] else 0},0,0,0,100,100,0,0,{box},{bord},{shad},{self.align},60,60,{self.margin_v},1\n\n"
            "[Events]\n"
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )

    # ---------- animation helpers ----------
    def _anim_tags(self, words, line_start, video_h):
        """Return (prefix_tags, word_fmt_fn) implementing the preset animation."""
        p = self.preset
        anim = p["anim"]
        size = _font_size_for(p, " ".join(w["word"] for w in words), video_h)
        base = f"\\fs{size}"

        if anim == "karaoke":
            def fmt(idx, w, t0):
                # k values: cumulative flip times must match real word starts
                if idx == 0:
                    k = max(1, int(round((w["start"] - t0) * 100)))
                else:
                    k = max(1, int(round((w["end"] - w["start"]) * 100)))
                return f"{{\\k{k}}}{w['word']}"
            return base, fmt

        if anim == "pop":
            def fmt(idx, w, t0):
                return (
                    f"{{\\fscx0\\fscy0\\t(0,120,\\fscx115\\fscy115)\\t(120,220,\\fscx100\\fscy100)}}{w['word']}"
                )
            return base, fmt

        if anim == "bounce":
            def fmt(idx, w, t0):
                return (
                    f"{{\\fscy0\\t(0,180,\\fscy112)\\t(180,320,\\fscy92)\\t(320,420,\\fscy100)}}{w['word']}"
                )
            return base, fmt

        if anim == "wobble":
            def fmt(idx, w, t0):
                rot = 6 if idx % 2 == 0 else -6
                return f"{{\\frz{rot}\\t(0,300,\\frz{-rot})\\t(300,600,\\frz{rot * 0.4})}}{w['word']}"
            return base, fmt

        if anim == "rainbow":
            palette = ["&H00E5C41B", "&H0027D1FF", "&H0054D82D", "&H00D96EF0", "&H002792FF"]
            def fmt(idx, w, t0):
                c = palette[idx % len(palette)]
                return f"{{\\c{c}\\t(0,400,\\c{palette[(idx + 1) % len(palette)]})}}{w['word']}"
            return base, fmt

        if anim == "typewriter":
            def fmt(idx, w, t0):
                t_on = int(max(0, (w["start"] - t0) * 1000))
                t_start = max(0, t_on - 60)
                return (
                    f"{{\\alpha&HFF&\\t({t_start},{t_on},\\alpha&H00&)}}{w['word']}"
                )
            return base, fmt

        if anim == "elastic":
            def fmt(idx, w, t0):
                return (
                    f"{{\\fscx60\\fscy60\\t(0,140,\\fscx110\\fscy110)\\t(140,260,\\fscx90\\fscy90)"
                    f"\\t(260,380,\\fscx105\\fscy105)\\t(380,460,\\fscx100\\fscy100)}}{w['word']}"
                )
            return base, fmt

        def fmt(idx, w, t0):
            return w["word"]
        return base, fmt

    def add_sentence(self, words, sentence_start: float, sentence_end: float):
        """words: list of {word, start, end} (clip-relative). One Dialogue per visual line."""
        if not words:
            return
        p = self.preset
        text_upper = p["upper"]
        anim = p["anim"]

        # apply casing on copies BEFORE formatting
        cased = []
        for w in words:
            token = w["word"].upper() if text_upper else w["word"]
            cased.append({"word": token, "start": w["start"], "end": w["end"]})

        lines = _wrap_words(cased)
        for line in lines:
            t0 = line[0]["start"]  # event start = first word's start
            te = line[-1]["end"]
            base_tags, fmt = self._anim_tags(line, t0, self.h)
            parts = [fmt(i, w, t0) for i, w in enumerate(line)]
            if anim == "slide":
                x_off = -int(self.w * 0.6)
                x_fin = self.w // 2
                y = self._anchor_y()
                text = (f"{{{base_tags}\\move({x_off},{y},{x_fin},{y},0,240)}}"
                        + " ".join(parts))
            else:
                text = "{" + base_tags + "}" + " ".join(parts)
            start = _ts(max(0.0, t0 - 0.05))
            end = _ts(te + 0.15)
            self.events.append(
                f"Dialogue: 0,{start},{end},Caption,,0,0,0,,{text}"
            )

    def render(self) -> str:
        return self.header() + "\n".join(self.events) + "\n"


def build_ass(sentences, video_w: int, video_h: int, preset_id: str, position: int,
              font_override=None, font_scale=1.0) -> str:
    """sentences: [{words:[{word,start,end}], start, end, text}]"""
    b = AssBuilder(video_w, video_h, position, preset_id, font_override, font_scale)
    for s in sentences:
        if not s.get("words"):
            continue
        b.add_sentence(s["words"], s["start"], s["end"])
    return b.render()


def preset_list():
    return [
        {"id": pid, "name": p["name"], "font": FONT_FILES[p["font"]][0], "desc": p["desc"],
         "default": bool(p.get("default_on"))}
        for pid, p in PRESETS.items()
    ]


def font_list():
    return [{"id": fid, "name": fam, "file": fn} for fid, (fam, fn) in FONT_FILES.items()]
