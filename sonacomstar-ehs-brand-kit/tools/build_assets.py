"""Build the Sona Comstar brand assets for the EHS application.

Traces the white-on-black Sona Comstar logo into vector paths, then writes every
SVG, PNG, favicon and the web manifest under public/brand/ from those paths, so
all sizes come from one source.

    python -m venv venv --system-site-packages     # pycairo comes from the system
    venv/bin/pip install numpy pillow potracer
    venv/bin/python tools/build_assets.py SOURCE_LOGO [OUT_DIR]

SOURCE_LOGO is a light-on-dark raster of the stacked logo (emblem above the
SONA COMSTAR wordmark); DataWizard's static/images/logo.webp is one. If corporate
communications supply a larger or vector original, rasterise it light-on-dark
and rerun: everything below is regenerated from it.
"""

import json
import sys
from pathlib import Path

import cairo
import numpy as np
import potrace
from PIL import Image

INK = "#101828"       # --ink in the EHS design tokens
WHITE = "#ffffff"
BLACK = "#000000"     # print and Excel only
UPSCALE = 6           # trace an upscaled copy so curves follow the edge, not the pixel steps


# ---------------------------------------------------------------- tracing

def _row_bands(mask):
    """Split the logo into its horizontal bands (emblem, wordmark) by empty rows."""
    rows = mask.any(axis=1)
    bands, start = [], None
    for y, filled in enumerate(rows):
        if filled and start is None:
            start = y
        elif not filled and start is not None:
            bands.append((start, y))
            start = None
    if start is not None:
        bands.append((start, len(rows)))
    return bands


def trace_logo(path):
    grey = Image.open(path).convert("L")
    big = grey.resize((grey.width * UPSCALE, grey.height * UPSCALE), Image.LANCZOS)
    mask = np.array(big) > 128
    bands = _row_bands(mask)
    if len(bands) != 2:
        sys.exit(f"expected the emblem and the wordmark as two bands, found {len(bands)}")

    parts = []
    for top, bottom in bands:
        band = np.zeros_like(mask)
        band[top:bottom] = mask[top:bottom]
        cols = np.where(band.any(axis=0))[0]
        curves = band_curves(band)
        parts.append({
            "curves": curves,
            "x": cols.min() / UPSCALE, "y": top / UPSCALE,
            "w": (cols.max() + 1 - cols.min()) / UPSCALE, "h": (bottom - top) / UPSCALE,
        })
    emblem, wordmark = parts
    return emblem, wordmark


def band_curves(mask):
    plist = potrace.Bitmap(mask).trace(
        turdsize=4 * UPSCALE,
        turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
        alphamax=1.0, opticurve=True, opttolerance=0.2,
    )
    height, width = mask.shape
    curves = []
    for curve in plist:
        start = curve.start_point
        ends = [(start.x, start.y)] + [(s.end_point.x, s.end_point.y) for s in curve.segments]
        if all(x in (0, width) or y in (0, height) for x, y in ends):
            continue  # potracer also returns the bitmap's own frame; under even-odd it inverts the logo
        segs = []
        for seg in curve.segments:
            if seg.is_corner:
                segs.append(("L", seg.c.x, seg.c.y, seg.end_point.x, seg.end_point.y))
            else:
                segs.append(("C", seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.end_point.x, seg.end_point.y))
        curves.append(((start.x, start.y), segs))
    return curves


# ---------------------------------------------------------------- placement

def placed(part, x, y, height):
    """Return part positioned with its top-left at (x, y), scaled to height."""
    s = height / part["h"]
    ox, oy = part["x"] * UPSCALE, part["y"] * UPSCALE
    k = s / UPSCALE
    return [(lambda px, py: (x + (px - ox) * k, y + (py - oy) * k)), part["curves"]]


def path_d(layers):
    out = []
    for fn, curves in layers:
        for (sx, sy), segs in curves:
            p = fn(sx, sy)
            out.append(f"M{p[0]:.1f} {p[1]:.1f}")
            for seg in segs:
                pts = [fn(seg[i], seg[i + 1]) for i in range(1, len(seg), 2)]
                flat = " ".join(f"{a:.1f} {b:.1f}" for a, b in pts)
                out.append(f"{seg[0]}{flat}")
            out.append("Z")
    return "".join(out)


def cairo_path(ctx, layers):
    for fn, curves in layers:
        for (sx, sy), segs in curves:
            ctx.move_to(*fn(sx, sy))
            for seg in segs:
                pts = [fn(seg[i], seg[i + 1]) for i in range(1, len(seg), 2)]
                if seg[0] == "L":
                    ctx.line_to(*pts[0])
                    ctx.line_to(*pts[1])
                else:
                    ctx.curve_to(*pts[0], *pts[1], *pts[2])
            ctx.close_path()


def rgb(hex_colour):
    h = hex_colour.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


# ---------------------------------------------------------------- layouts

def stacked(emblem, wordmark, height=100.0):
    """The logo as supplied: emblem centred above the wordmark, original spacing."""
    s = height / (wordmark["y"] + wordmark["h"] - emblem["y"])
    width = max(emblem["w"], wordmark["w"]) * s
    e_x = (width - emblem["w"] * s) / 2
    w_x = (width - wordmark["w"] * s) / 2
    w_y = (wordmark["y"] - emblem["y"]) * s
    layers = [placed(emblem, e_x, 0, emblem["h"] * s), placed(wordmark, w_x, w_y, wordmark["h"] * s)]
    return layers, width, height


def horizontal(emblem, wordmark, height=100.0):
    """Derived lockup for wide, short slots: wordmark cap height 30% of the emblem."""
    word_h = height * 0.30
    word_w = wordmark["w"] * word_h / wordmark["h"]
    emb_w = emblem["w"] * height / emblem["h"]
    gap = height * 0.25
    layers = [placed(emblem, 0, 0, height), placed(wordmark, emb_w + gap, (height - word_h) / 2, word_h)]
    return layers, emb_w + gap + word_w, height


def alone(part, height=100.0):
    return [placed(part, 0, 0, height)], part["w"] * height / part["h"], height


# ---------------------------------------------------------------- writers

def write_svg(path, layers, w, h, colour, title):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" '
        f'role="img" aria-label="{title}">\n'
        f"<title>{title}</title>\n"
        f'<path fill="{colour}" fill-rule="evenodd" d="{path_d(layers)}"/>\n</svg>\n'
    )


def write_png(path, layers, w, h, colour, width_px, background=None, pad=0.0):
    """Render at width_px wide; pad is clear space on every side, as a fraction of height."""
    scale = width_px / (w + 2 * pad * h)
    px_w, px_h = round((w + 2 * pad * h) * scale), round((h + 2 * pad * h) * scale)
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, px_w, px_h)
    ctx = cairo.Context(surface)
    if background:
        ctx.set_source_rgb(*rgb(background))
        ctx.paint()
    ctx.translate(pad * h * scale, pad * h * scale)
    ctx.scale(scale, scale)
    cairo_path(ctx, layers)
    ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
    ctx.set_source_rgb(*rgb(colour))
    ctx.fill()
    path.parent.mkdir(parents=True, exist_ok=True)
    surface.write_to_png(str(path))


def app_icon(emblem, size, emblem_ratio, radius_ratio):
    """Ink tile with the white emblem, as the brand tile appears on light surfaces."""
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    ctx = cairo.Context(surface)
    r = size * radius_ratio
    ctx.new_sub_path()
    ctx.arc(size - r, r, r, -np.pi / 2, 0)
    ctx.arc(size - r, size - r, r, 0, np.pi / 2)
    ctx.arc(r, size - r, r, np.pi / 2, np.pi)
    ctx.arc(r, r, r, np.pi, 3 * np.pi / 2)
    ctx.close_path()
    ctx.set_source_rgb(*rgb(INK))
    ctx.fill()
    layers, w, h = alone(emblem, size * emblem_ratio)
    ctx.translate((size - w) / 2, (size - h) / 2)
    cairo_path(ctx, layers)
    ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
    ctx.set_source_rgb(1, 1, 1)
    ctx.fill()
    return Image.frombuffer("RGBA", (size, size), bytes(surface.get_data()), "raw", "BGRA", 0, 1).copy()


def write_favicon_svg(path, emblem):
    size, ratio, radius = 64, 0.74, 14 / 48
    layers, w, h = alone(emblem, size * ratio)
    ox, oy = (size - w) / 2, (size - h) / 2
    path.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">\n'
        f'<rect width="{size}" height="{size}" rx="{size * radius:.2f}" fill="{INK}"/>\n'
        f'<path transform="translate({ox:.2f} {oy:.2f})" fill="{WHITE}" fill-rule="evenodd" '
        f'd="{path_d(layers)}"/>\n</svg>\n'
    )


# ---------------------------------------------------------------- main

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    source = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "public" / "brand"
    emblem, wordmark = trace_logo(source)

    name = "Sona Comstar"
    colours = {"white": WHITE, "ink": INK, "black": BLACK}
    layouts = {
        "logo": (stacked(emblem, wordmark), f"{name} logo"),
        "logo-horizontal": (horizontal(emblem, wordmark), f"{name} logo"),
        "emblem": (alone(emblem), f"{name} emblem"),
        "wordmark": (alone(wordmark), name),
    }
    png_widths = {"logo": (240, 480, 960), "logo-horizontal": (320, 640, 1280),
                  "emblem": (64, 128, 256, 512), "wordmark": (240, 480, 960)}

    for key, ((layers, w, h), title) in layouts.items():
        for tone, colour in colours.items():
            if key == "wordmark" and tone == "black":
                continue
            stem = f"sona-comstar-{key}-{tone}"
            write_svg(out / "logo" / f"{stem}.svg", layers, w, h, colour, title)
            for px in png_widths[key]:
                write_png(out / "logo" / "png" / f"{stem}-{px}w.png", layers, w, h, colour, px)

    # Excel / print header: black on white, clear space included, ~300 dpi at 2 inches wide.
    layers, w, h = horizontal(emblem, wordmark)
    write_png(out / "print" / "sona-comstar-report-header.png", layers, w, h, BLACK, 600, background=WHITE, pad=0.2)
    layers, w, h = stacked(emblem, wordmark)
    write_png(out / "print" / "sona-comstar-logo-print.png", layers, w, h, BLACK, 1200, background=WHITE, pad=0.2)

    # Browser and device icons.
    icons = out / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    write_favicon_svg(icons / "favicon.svg", emblem)
    tile = lambda s: app_icon(emblem, s, 0.74, 14 / 48)
    tile(32).save(icons / "favicon-32x32.png")
    tile(16).save(icons / "favicon-16x16.png")
    tile(256).save(icons / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    app_icon(emblem, 180, 0.62, 0).save(icons / "apple-touch-icon.png")     # iOS rounds the corners itself
    app_icon(emblem, 192, 0.66, 14 / 48).save(icons / "icon-192.png")
    app_icon(emblem, 512, 0.66, 14 / 48).save(icons / "icon-512.png")
    app_icon(emblem, 512, 0.50, 0).save(icons / "icon-maskable-512.png")   # emblem inside the 80% safe zone

    manifest = {
        "name": "EHS · Sona Comstar",
        "short_name": "EHS",
        "icons": [
            {"src": "/brand/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/brand/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/brand/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
        "theme_color": INK,
        "background_color": "#f9fafb",
        "display": "standalone",
        "start_url": "/",
    }
    (icons / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote brand assets to {out}")


if __name__ == "__main__":
    main()
