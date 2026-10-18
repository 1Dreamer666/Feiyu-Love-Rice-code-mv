#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把母带 MP3 转成 base64 伴生脚本 vendor/master-audio.js。

file:// 下浏览器禁止 fetch 本地文件，但允许 <script src="相对路径"> 加载同目录脚本。
因此把音频以 base64 存进一个 JS 文件，导出时按需懒加载即可零点击拿到母带音频。
"""
import base64
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "肥鱼爱大米_母带原声.mp3")
OUT = os.path.join(ROOT, "vendor", "master-audio.js")


def main() -> int:
    if not os.path.exists(SRC):
        print(f"找不到母带音频: {SRC}", file=sys.stderr)
        return 1

    with open(SRC, "rb") as f:
        raw = f.read()

    b64 = base64.b64encode(raw).decode("ascii")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("/* 母带音频（base64 内嵌）—— 由 tools/make_audio_sidecar.py 生成，请勿手工编辑。\n")
        f.write(" * 源文件: 肥鱼爱大米_母带原声.mp3 (%d bytes)\n" % len(raw))
        f.write(" * 用途: file:// 下无法 fetch 本地文件，导出 MP4 时按需加载本脚本以自动获取音频。\n")
        f.write(" */\n")
        f.write("window.__MASTER_AUDIO_B64 = \"")
        f.write(b64)
        f.write("\";\n")
        f.write("window.__MASTER_AUDIO_BYTES = %d;\n" % len(raw))

    print("源 MP3 : %s (%.2f MB)" % (os.path.basename(SRC), len(raw) / 1048576))
    print("输出   : %s (%.2f MB)" % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1048576))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
