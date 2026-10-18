# -*- coding: utf-8 -*-
"""为 README 生成展示图。

输出：
  docs/images/hero.png      —— 封面（宽幅，README 顶部）
  docs/images/scenes.png    —— 分镜拼图（2×3，纯画面裁切，不含播放器 UI）
  docs/images/character.png —— 角色三视图
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "images")
os.makedirs(OUT_DIR, exist_ok=True)

# 中文字体（Windows 自带）
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]


def get_font(size: int):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def fit(img: Image.Image, w: int, h: int) -> Image.Image:
    """等比缩放并居中裁剪到 w×h。"""
    src_ratio = img.width / img.height
    dst_ratio = w / h
    if src_ratio > dst_ratio:
        new_h = h
        new_w = int(round(h * src_ratio))
    else:
        new_w = w
        new_h = int(round(w / src_ratio))
    img = img.convert("RGB").resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - w) // 2
    top = (new_h - h) // 2
    return img.crop((left, top, left + w, top + h))


def crop_stage(img: Image.Image) -> Image.Image:
    """从整页截图里裁出 MV 画面区域，去掉顶部工具栏与底部播放器。

    整页 1890×985 中，画面板大约在 x∈[268,1630], y∈[78,828]。
    这里按比例裁切，兼容不同尺寸的同类截图。
    """
    w, h = img.size
    left = int(w * 0.1418)
    right = int(w * 0.8624)
    top = int(h * 0.0792)
    bottom = int(h * 0.8406)
    return img.crop((left, top, right, bottom))


def save_opt(img: Image.Image, path: str, quality: int = 88) -> None:
    """优先存 PNG；若体积过大则转 JPEG 以控制仓库体积。

    README 展示图不需要无损，JPEG q88 在 1200px 宽下肉眼无差别，
    体积通常只有 PNG 的 1/3。
    """
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)


def make_hero():
    src = os.path.join(ROOT, "renders", "肥鱼爱大米：激光眼干饭少女.png")
    img = Image.open(src)
    out = fit(img, 1200, int(round(1200 * img.height / img.width)))
    path = os.path.join(OUT_DIR, "hero.jpg")
    save_opt(out, path)
    print("hero  :", os.path.relpath(path, ROOT), "%.1f KB" % (os.path.getsize(path) / 1024))
    return path


def make_scenes():
    picks = [
        ("proto/FINAL_40.png", "前奏 · 闻饭香"),
        ("proto/FINAL_92.png", "副歌 · 我爱你爱着你"),
        ("proto/FINAL_100.png", "副歌 · 风雨护碗"),
        ("proto/FINAL_125.png", "间奏 · 鼓腮抗议"),
        ("proto/FINAL_212.png", "主歌A2 · 深夜守候"),
        ("proto/FINAL_276.png", "尾声 · 分你一半饭"),
    ]

    cell_w = 620
    pad = 18
    label_h = 40
    cols, rows = 2, 3
    font = get_font(22)

    thumbs = []
    for rel, label in picks:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            print("  skip (missing):", rel)
            continue
        img = crop_stage(Image.open(p))
        # 统一 16:9 输出，保证网格整齐
        th = int(round(cell_w * 9 / 16))
        thumbs.append((fit(img, cell_w, th), label))

    if not thumbs:
        print("no thumbs")
        return None

    cell_h = int(round(cell_w * 9 / 16))
    W = cols * cell_w + (cols + 1) * pad
    H = rows * (cell_h + label_h) + (rows + 1) * pad
    canvas = Image.new("RGB", (W, H), (247, 242, 231))
    draw = ImageDraw.Draw(canvas)

    for i, (thumb, label) in enumerate(thumbs):
        r, c = divmod(i, cols)
        x = pad + c * (cell_w + pad)
        y = pad + r * (cell_h + label_h + pad)
        canvas.paste(thumb, (x, y))
        draw.rectangle([x, y, x + cell_w - 1, y + cell_h - 1], outline=(205, 195, 175))
        draw.text((x + 2, y + cell_h + 9), label, font=font, fill=(52, 62, 84))

    path = os.path.join(OUT_DIR, "scenes.jpg")
    save_opt(canvas, path, quality=90)
    print("scenes:", os.path.relpath(path, ROOT), "%.1f KB" % (os.path.getsize(path) / 1024))
    return path


def make_sheet():
    src = os.path.join(ROOT, "参考三视图-深深.png")
    if not os.path.exists(src):
        return None
    img = Image.open(src)
    out = fit(img, 1200, int(round(1200 * img.height / img.width)))
    path = os.path.join(OUT_DIR, "character.jpg")
    save_opt(out, path, quality=90)
    print("char  :", os.path.relpath(path, ROOT), "%.1f KB" % (os.path.getsize(path) / 1024))
    return path


if __name__ == "__main__":
    make_hero()
    make_scenes()
    make_sheet()
