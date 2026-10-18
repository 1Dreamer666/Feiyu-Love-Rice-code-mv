# -*- coding: utf-8 -*-
"""把已移动到 scripts/ 子目录下的脚本的 BASE 修正为项目根目录。"""
import glob
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = "BASE = os.path.dirname(os.path.abspath(__file__))"

changed = []
for path in glob.glob(os.path.join(ROOT, "scripts", "**", "*.py"), recursive=True):
    with io.open(path, encoding="utf-8") as f:
        src = f.read()
    if OLD not in src:
        continue
    rel = os.path.relpath(path, ROOT)
    depth = rel.count(os.sep)  # scripts/integrate/x.py -> 2
    ups = "os.path.dirname(" * depth
    new = "BASE = " + ups + "os.path.abspath(__file__)" + ")" * depth + "  # 项目根目录"
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(src.replace(OLD, new))
    changed.append((rel, depth))

for rel, depth in changed:
    print("%-52s depth=%d" % (rel, depth))
print("total changed:", len(changed))
