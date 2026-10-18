# -*- coding: utf-8 -*-
"""把检视台改成「表情/姿态阵容台」——CAST rig 不支持连续 yaw。"""
import io, os, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
gen = os.path.join(BASE, 'integrate_cast.py')
s = io.open(gen, encoding='utf-8').read()

# 读取 HTML 中的原始 stages 块
html = io.open(os.path.join(BASE, '肥鱼爱大米.html'), encoding='utf-8').read()
i = html.find('    const stages = [')
j = html.find('      });', i) + len('      });')
if i == -1 or j < i:
    raise SystemExit('stage block not found')
old_block = html[i:j]

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

repl = (
    "\n# ---- 检视台改阵容台 ----\n"
    "OLD_BLOCK = " + repr(old_block) + "\n"
    "NEW_BLOCK = " + repr(new_block) + "\n"
    "new_html = new_html.replace(OLD_BLOCK, NEW_BLOCK)\n"
    "print('sheet patched:', OLD_BLOCK not in new_html)\n\n"
)

s = s.replace(
    "with io.open(OUT, 'w', encoding='utf-8') as f:\n    f.write(html[:start] + block + '\\n' + html[end:])",
    "new_html = html[:start] + block + '\\n' + html[end:]\n" + repl +
    "with io.open(OUT, 'w', encoding='utf-8') as f:\n    f.write(new_html)"
)

io.open(gen, 'w', encoding='utf-8').write(s)
print('generator patched OK')
