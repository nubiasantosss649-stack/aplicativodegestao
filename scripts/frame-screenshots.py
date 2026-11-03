#!/usr/bin/env python3
"""Gera imagens prontas para as lojas: captura real + fundo da marca + frase.

Entrada: store/screenshots/<dispositivo>/*.png (geradas por e2e/screenshots.js)
Saída:   store/framed/<dispositivo>/*.png e store/feature-graphic.png (Google Play)
"""
import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "store" / "screenshots"
OUT = ROOT / "store" / "framed"
FONT_BOLD = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
FONT_REG = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"

CAPTIONS = {
    "01-dashboard": ("Seu negócio organizado", "Vendas, recebimentos e lucro do dia em um só lugar"),
    "02-venda-rapida": ("Venda rápida", "Busque ou leia o código de barras e finalize em segundos"),
    "03-pagamento": ("Dinheiro, Pix, cartão ou fiado", "Pagamento misto e troco calculado automaticamente"),
    "04-fiados": ("Fiado sob controle", "Saiba quem está devendo e cobre pelo WhatsApp"),
    "05-assistente-ia": ("Assistente IA", "Pergunte em português e entenda seus números"),
    "06-relatorios": ("Relatórios completos", "Lucro por produto, horários e melhores clientes"),
    "07-recomendacoes": ("Descubra onde está perdendo dinheiro", "Alertas, reposição de estoque e preços sugeridos"),
    "08-produtos": ("Estoque sempre em dia", "Baixa automática a cada venda e alerta de estoque baixo"),
    "09-financeiro": ("Transforme números em decisões", "Fluxo de caixa, despesas e lucro estimado"),
}

spec = importlib.util.spec_from_file_location("assets", ROOT / "scripts" / "generate-assets.py")
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


def background(w: int, h: int) -> Image.Image:
    return assets.gradient(max(w, h)).resize((w, h))


def fit_text(draw, text, font_path, max_width, size):
    while size > 10:
        font = ImageFont.truetype(font_path, size)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(font_path, size)


def frame(img: Image.Image, title: str, subtitle: str) -> Image.Image:
    w, h = img.size
    canvas = background(w, h).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    pad = int(w * 0.07)
    tfont = fit_text(draw, title, FONT_BOLD, w - 2 * pad, int(w * 0.075))
    sfont = fit_text(draw, subtitle, FONT_REG, w - 2 * pad, int(w * 0.04))
    y = int(h * 0.05)
    draw.text((w / 2, y), title, font=tfont, fill="white", anchor="mt")
    y += int(tfont.size * 1.3)
    draw.text((w / 2, y), subtitle, font=sfont, fill=(219, 230, 254), anchor="mt")
    top = y + int(sfont.size * 2.2)

    scale = (h - top - int(h * 0.03)) / h
    sw, sh = int(w * scale), int(h * scale)
    shot = img.convert("RGBA").resize((sw, sh), Image.LANCZOS)
    radius = int(sw * 0.06)
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw, sh], radius=radius, fill=255)
    x = (w - sw) // 2
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([x, top + 12, x + sw, top + sh + 12], radius=radius, fill=(0, 0, 0, 110))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(24)))
    canvas.paste(shot, (x, top), mask)
    return canvas.convert("RGB")


def feature_graphic() -> None:
    w, h = 1024, 500
    canvas = background(w, h).convert("RGBA")
    canvas.alpha_composite(assets.glyph(420, 0.8).resize((360, 360)), (40, 70))
    draw = ImageDraw.Draw(canvas)
    draw.text((430, 170), "Gestão Fácil IA", font=ImageFont.truetype(FONT_BOLD, 62), fill="white")
    draw.text((432, 255), "Seu negócio organizado,", font=ImageFont.truetype(FONT_REG, 34), fill=(219, 230, 254))
    draw.text((432, 298), "suas vendas crescendo.", font=ImageFont.truetype(FONT_REG, 34), fill=(219, 230, 254))
    canvas.convert("RGB").save(ROOT / "store" / "feature-graphic.png", optimize=True)


def main() -> None:
    for device_dir in sorted(p for p in SRC.iterdir() if p.is_dir()):
        out = OUT / device_dir.name
        out.mkdir(parents=True, exist_ok=True)
        for f in sorted(device_dir.glob("*.png")):
            title, subtitle = CAPTIONS.get(f.stem, ("Gestão Fácil IA", ""))
            frame(Image.open(f), title, subtitle).save(out / f.name, optimize=True)
    feature_graphic()
    print("Imagens geradas em", OUT)


if __name__ == "__main__":
    main()
