# -*- coding: utf-8 -*-
"""生成 v1 / v2 两套 README 展示图，分目录存放。

产出：
  docs/images/character.jpg      角色三视图（两版共用）
  docs/images/v1/cover.jpg       v1 封面（激光眼干饭少女）
  docs/images/v1/scenes.jpg      v1 六场景
  docs/images/v2/cover.jpg       v2 封面（B 站实际使用）
  docs/images/v2/cover_alt.jpg   v2 备选封面
  docs/images/v2/scenes.jpg      v2 全 10 章
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "docs", "images")
os.makedirs(os.path.join(IMG, "v1"), exist_ok=True)
os.makedirs(os.path.join(IMG, "v2"), exist_ok=True)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]


def get_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def fit(img, w, h):
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


def fit_wide(img, w):
    h = int(round(w * img.height / img.width))
    return img.convert("RGB").resize((w, h), Image.LANCZOS)


def save_jpg(img, path, quality=90):
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    print("  %-34s %6.0f KB" % (os.path.relpath(path, ROOT), os.path.getsize(path) / 1024))


def crop_stage(img):
    """老版整页截图（1890×985）里裁出 MV 画面区。"""
    w, h = img.size
    return img.crop((int(w * 0.1418), int(h * 0.0792),
                     int(w * 0.8624), int(h * 0.8406)))


def contact_sheet(picks, out_path, cols, cell_w, bg=(247, 242, 231)):
    """picks: [(Image, label), ...] -> 带标签的拼图。"""
    pad, label_h = 18, 40
    rows = (len(picks) + cols - 1) // cols
    cell_h = int(round(cell_w * 9 / 16))
    W = cols * cell_w + (cols + 1) * pad
    H = rows * (cell_h + label_h) + (rows + 1) * pad
    canvas = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(canvas)
    font = get_font(22 if cell_w >= 500 else 17)

    for i, (img, label) in enumerate(picks):
        r, c = divmod(i, cols)
        x = pad + c * (cell_w + pad)
        y = pad + r * (cell_h + label_h + pad)
        canvas.paste(fit(img, cell_w, cell_h), (x, y))
        draw.rectangle([x, y, x + cell_w - 1, y + cell_h - 1], outline=(205, 195, 175))
        draw.text((x + 2, y + cell_h + 9), label, font=font, fill=(52, 62, 84))
    save_jpg(canvas, out_path)


# ---------------------------------------------------------------- v1
print("v1:")
v1_cover = os.path.join(ROOT, "renders", "肥鱼爱大米：激光眼干饭少女.png")
if os.path.exists(v1_cover):
    save_jpg(fit_wide(Image.open(v1_cover), 1200), os.path.join(IMG, "v1", "cover.jpg"), 90)

V1_PICKS = [
    ("proto/FINAL_40.png", "前奏 · 闻饭香"),
    ("proto/FINAL_92.png", "副歌 · 我爱你爱着你"),
    ("proto/FINAL_100.png", "副歌 · 风雨护碗"),
    ("proto/FINAL_125.png", "间奏 · 鼓腮抗议"),
    ("proto/FINAL_212.png", "主歌A2 · 深夜守候"),
    ("proto/FINAL_276.png", "尾声 · 分你一半饭"),
]
picks = []
for rel, label in V1_PICKS:
    p = os.path.join(ROOT, rel)
    if os.path.exists(p):
        picks.append((crop_stage(Image.open(p)), label))
if picks:
    contact_sheet(picks, os.path.join(IMG, "v1", "scenes.jpg"), cols=2, cell_w=620)

# ---------------------------------------------------------------- v2
print("v2:")
ROOT_PNG = os.path.join("docs", "images", "v2", "src", "cover_final_1448x1086")
main_cover = os.path.join(ROOT, "docs", "images", "v2", "src", "cover_final_1448x1086.png")
alt_cover = os.path.join(ROOT, "docs", "images", "v2", "src", "cover_alt_1448x1086.png")
if os.path.exists(main_cover):
    save_jpg(fit_wide(Image.open(main_cover), 1200), os.path.join(IMG, "v2", "cover.jpg"), 92)
if os.path.exists(alt_cover):
    save_jpg(fit_wide(Image.open(alt_cover), 1200), os.path.join(IMG, "v2", "cover_alt.jpg"), 90)

V2_PICKS = [
    ("f01_dream", "01 前奏 · 梦里的超长任务"),
    ("f01_wake", "01 前奏 · 惊醒"),
    ("f02_steal", "02 主歌A1 · 偷吃白饭"),
    ("f02_outsource", "02 主歌A1 · 外包给千问"),
    ("f03_fountain", "03 预副歌 · 白饭吃不完"),
    ("f03_letsgo", "03 预副歌 · Let me go"),
    ("f04_errors", "04 副歌1 · 报错暴雨"),
    ("f04_seasons", "04 副歌1 · 靠着米缸打盹"),
    ("f05_bili", "05 间奏 · 自主扒饭时代"),
    ("f05_caught", "05 间奏 · 被抓包"),
    ("f06_night", "06 主歌A2 · 深夜书房"),
    ("f06_compile", "06 主歌A2 · 编译我来跑"),
    ("f07_heap", "07 预副歌2 · 被米山埋了"),
    ("f08_choruscut", "08 副歌2 · 歌突然没了"),
    ("f08_gone", "08 副歌2 · 愣住"),
    ("f08_raise", "08 副歌2 · 下一首再来"),
    ("f09_silent", "09 尾奏 · 升级之后框框框"),
    ("f09_victory", "09 尾奏 · 胜利结算"),
    ("f10_findmom", "10 尾声 · 寻人启事"),
    ("f10_smile", "10 尾声 · 今天也最可靠"),
]
FRAMES = os.path.join(ROOT, "build", "tmp", "v5frames")  # 由 build/tmp/cap_frames2.js 生成
picks2 = []
for key, label in V2_PICKS:
    p = os.path.join(FRAMES, key + ".png")
    if os.path.exists(p):
        picks2.append((Image.open(p), label))
    else:
        print("  missing", key)
if picks2:
    contact_sheet(picks2, os.path.join(IMG, "v2", "scenes.jpg"), cols=2, cell_w=560)

# ---------------------------------------------------------------- 共用角色三视图
print("shared:")
src = os.path.join(ROOT, "参考三视图-深深.png")
if os.path.exists(src):
    save_jpg(fit_wide(Image.open(src), 1200), os.path.join(IMG, "character.jpg"), 90)

print("done")
