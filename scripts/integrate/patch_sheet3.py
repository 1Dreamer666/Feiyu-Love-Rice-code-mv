# -*- coding: utf-8 -*-
"""把检视台改成「表情/姿态阵容台」——按行区间精确替换，避免残留。"""
import io, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
gen = os.path.join(BASE, 'integrate_cast.py')
html = io.open(os.path.join(BASE, '肥鱼爱大米.html'), encoding='utf-8').read()

lines = html.split('\n')
start_i = next(k for k, l in enumerate(lines) if l.strip().startswith('const stages = ['))
# 找到 stages.forEach 块结束：从 start_i 向后，遇到缩进为 6 空格的 "});" 即结束
end_i = None
depth_seen = False
for k in range(start_i, min(start_i + 80, len(lines))):
    if 'stages.forEach' in lines[k]:
        depth_seen = True
    if depth_seen and lines[k].strip() == '});':
        end_i = k
        break
if end_i is None:
    raise SystemExit('end not found')

old_block = '\n'.join(lines[start_i:end_i + 1])

new_block = """    const stages = [
        { x: 250,  sc: 1.55, expr: 'normal',  pose: 'stand',    label: '平静 · 站立' },
        { x: 610,  sc: 1.55, expr: 'happy',   pose: 'sing',     label: '欢唱 · 麦克风' },
        { x: 970,  sc: 1.62, expr: expr,      pose: pose,       label: '当前 · ' + expr + ' / ' + pose, highlight: true },
        { x: 1330, sc: 1.55, expr: 'sparkle', pose: 'eureka',   label: '灵光 · 竖指' },
        { x: 1690, sc: 1.55, expr: 'sleepy',  pose: 'holdBowl', label: '困倦 · 抱碗' }
      ];

      stages.forEach((st) => {
        if (st.highlight) {
          wcWashBlob(ctx, st.x, 560, 165, 225, '#dcebfa', 0.55, 950);
        }
        fish(ctx, {
          x: st.x,
          y: 560,
          scale: st.sc,
          yaw: 0,
          expr: st.expr,
          pose: st.pose,
          t: t
        });

        ctx.save();
        ctx.fillStyle = st.highlight ? '#1d4ed8' : '#1d2747';
        ctx.font = 'bold 22px "Noto Serif SC", serif';
        ctx.textAlign = 'center';
        ctx.fillText(st.label, st.x, 862);
        ctx.restore();
      });"""

s = io.open(gen, encoding='utf-8').read()

# 移除上一版 patch 注入的 OLD_BLOCK/NEW_BLOCK 段
import re
s = re.sub(r"\n# ---- 检视台改阵容台 ----\nOLD_BLOCK = .*?\nNEW_BLOCK = .*?\nnew_html = new_html\.replace\(OLD_BLOCK, NEW_BLOCK\)\nprint\('sheet patched:', OLD_BLOCK not in new_html\)\n\n", "\n", s, flags=re.S)

inject = (
    "\n# ---- 检视台改阵容台（按行区间替换）----\n"
    "OLD_BLOCK = " + repr(old_block) + "\n"
    "NEW_BLOCK = " + repr(new_block) + "\n"
    "if OLD_BLOCK in new_html:\n"
    "    new_html = new_html.replace(OLD_BLOCK, NEW_BLOCK)\n"
    "    print('sheet patched OK')\n"
    "else:\n"
    "    print('WARN: sheet block not found')\n\n"
)

s = s.replace(
    "with io.open(OUT, 'w', encoding='utf-8') as f:\n    f.write(new_html)",
    inject + "with io.open(OUT, 'w', encoding='utf-8') as f:\n    f.write(new_html)"
)

io.open(gen, 'w', encoding='utf-8').write(s)
print('patched generator; old block lines:', end_i - start_i + 1)
