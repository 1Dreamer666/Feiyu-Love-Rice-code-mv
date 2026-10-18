# -*- coding: utf-8 -*-
"""把检视台从「偏航角三视图」改为「表情/姿态阵容台」——CAST rig 不支持连续 yaw，
   改为展示 6 种表情 + 用户当前选择的高亮展示，更符合 CAST 的能力边界。"""
import io, os, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
p = os.path.join(BASE, 'integrate_cast.py')
s = io.open(p, encoding='utf-8').read()

old = """    const stages = [
        { yaw: 0,         label: '正面基准 (0° Front)',       x: 310,  sc: 1.48 },
        { yaw: customYaw, label: `2.5D 交互视角 (${customYaw}°)`, x: 760,  sc: 1.68, highlight: true },
        { yaw: -78,       label: '侧面基准 (-78° Side)',      x: 1210, sc: 1.48 },
        { yaw: 180,       label: '背面基准 (180° Back)',      x: 1610, sc: 1.48 }
      ];

      stages.forEach((st) => {
        if (st.highlight) {
          wcWashBlob(ctx, st.x, 530, 185, 240, '#dcebfa', 0.55, 950);
        }
        fish(ctx, {
          x: st.x,
          y: 540,
          scale: st.sc,
          yaw: st.yaw,
          expr: expr,
          pose: pose,
          t: t
        });

        ctx.save();
        ctx.fillStyle = st.highlight ? '#1d4ed8' : '#1d2747';
        ctx.font = 'bold 22px "Noto Serif SC", serif';
        ctx.textAlign = 'center';
        ctx.fillText(st.label, st.x, 845);
        ctx.restore();
      });"""

new = """    const stages = [
        { x: 250,  sc: 1.55, expr: 'normal',  pose: 'stand',      label: '平静 · 站立' },
        { x: 610,  sc: 1.55, expr: 'happy',   pose: 'sing',       label: '欢唱 · 麦克风' },
        { x: 970,  sc: 1.62, expr: expr,      pose: pose,         label: `当前 · ${expr}/${pose}`, highlight: true },
        { x: 1330, sc: 1.55, expr: 'sparkle', pose: 'eureka',     label: '灵光 · 竖指' },
        { x: 1690, sc: 1.55, expr: 'sleepy',  pose: 'holdBowl',   label: '困倦 · 抱碗' }
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

if old not in s:
    raise SystemExit('sheet block not found in generator')

s = s.replace(old, new)

# 给 generator 增加一个「替换检视台」步骤
s = s.replace(
    "with io.open(OUT, 'w', encoding='utf-8') as f:\n    f.write(html[:start] + block + '\\n' + html[end:])",
    "new_html = html[:start] + block + '\\n' + html[end:]\n\n"
    "# 替换检视台为阵容台\n"
    "if old in new_html:\n"
    "    new_html = new_html.replace(old, new)\n"
    "else:\n"
    "    print('WARN: sheet block not found in html')\n\n"
    "with io.open(OUT, 'w', encoding='utf-8') as f:\n    f.write(new_html)"
)

io.open(p, 'w', encoding='utf-8').write(s)
print('generator patched')
