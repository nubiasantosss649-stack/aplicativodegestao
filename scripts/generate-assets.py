#!/usr/bin/env python3
"""Gera os ícones e a splash do Gestão Fácil IA (identidade própria).

Uso: python3 scripts/generate-assets.py
Saída: assets/icon.png, android-icon-*.png, splash-icon.png, favicon.png
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / "assets"
ROYAL_DARK = (23, 37, 84)      # #172554
ROYAL = (30, 64, 175)          # #1E40AF
ROYAL_LIGHT = (47, 91, 234)    # #2F5BEA
GREEN = (52, 211, 153)         # #34D399
WHITE = (255, 255, 255)
S = 1024


def gradient(size: int) -> Image.Image:
    """Fundo azul royal com degradê diagonal suave."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(int(ROYAL_LIGHT[i] * (1 - t) + ROYAL_DARK[i] * t) for i in range(3))
    return img


def glyph(size: int, scale: float, color=WHITE, accent=GREEN, mono=False) -> Image.Image:
    """Símbolo: três barras crescentes + seta verde de crescimento, centralizado."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    u = size * scale / 10  # unidade relativa
    cx, cy = size / 2, size / 2
    base_y = cy + 3.2 * u
    bar_w = 1.7 * u
    gap = 0.7 * u
    heights = [2.6 * u, 4.2 * u, 5.9 * u]
    total_w = 3 * bar_w + 2 * gap
    x0 = cx - total_w / 2
    for i, h in enumerate(heights):
        x = x0 + i * (bar_w + gap)
        d.rounded_rectangle([x, base_y - h, x + bar_w, base_y], radius=bar_w * 0.28, fill=color)
    # Seta de crescimento
    acc = color if mono else accent
    pts = [(x0 - 0.2 * u, cy - 0.2 * u), (cx - 0.4 * u, cy - 2.3 * u), (cx + 0.8 * u, cy - 1.3 * u), (cx + 3.0 * u, cy - 3.9 * u)]
    d.line(pts, fill=acc, width=int(0.62 * u), joint="curve")
    for p in pts[1:-1]:
        r = 0.31 * u
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=acc)
    tip = pts[-1]
    head = 1.25 * u
    d.polygon([(tip[0] + 0.35 * u, tip[1] - 0.35 * u), (tip[0] - head, tip[1] - 0.15 * u), (tip[0] + 0.15 * u, tip[1] + head)], fill=acc)
    # Linha de base
    d.rounded_rectangle([x0 - 0.6 * u, base_y + 0.45 * u, x0 + total_w + 0.6 * u, base_y + 0.85 * u], radius=0.2 * u, fill=color)
    return layer


def with_shadow(base: Image.Image, layer: Image.Image) -> Image.Image:
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    alpha = layer.split()[3].filter(ImageFilter.GaussianBlur(18))
    shadow.putalpha(alpha.point(lambda a: int(a * 0.35)))
    out = base.convert("RGBA")
    out.alpha_composite(shadow, (0, 14))
    out.alpha_composite(layer)
    return out


def main() -> None:
    bg = gradient(S)
    # iOS / ícone geral: quadrado, sem transparência
    with_shadow(bg, glyph(S, 0.62)).convert("RGB").save(ROOT / "icon.png", optimize=True)
    # Android adaptativo: símbolo dentro da zona segura (~66%)
    glyph(S, 0.42).save(ROOT / "android-icon-foreground.png", optimize=True)
    bg.save(ROOT / "android-icon-background.png", optimize=True)
    glyph(S, 0.42, mono=True).save(ROOT / "android-icon-monochrome.png", optimize=True)
    # Splash: símbolo branco sobre fundo azul (cor definida no app.json)
    glyph(S, 0.7).save(ROOT / "splash-icon.png", optimize=True)
    # Favicon (web)
    with_shadow(gradient(256), glyph(256, 0.66)).convert("RGB").resize((48, 48), Image.LANCZOS).save(ROOT / "favicon.png", optimize=True)
    print("Assets gerados em", ROOT)


if __name__ == "__main__":
    main()
