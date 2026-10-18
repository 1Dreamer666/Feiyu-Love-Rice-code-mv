# -*- coding: utf-8 -*-
"""把 proto/parts 的部件合并进单文件 MV，生成 proto/integrated.html 供预览验收。"""
import re, io, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
HTML = os.path.join(BASE, '肥鱼爱大米.html')
OUT = os.path.join(BASE, 'proto', 'integrated.html')

def read(p):
    with io.open(p, encoding='utf-8') as f:
        return f.read()

def part(name):
    return read(os.path.join(BASE, 'proto', 'parts', name))

util = part('00_util.js')

# 1) 调色板：只保留 HTML 里没有的新常量（旧常量已在 HTML 2207 行声明，重复 const 会语法错误）
util = util.replace("""const INK = '#191b30';
const HAIR_DARK = '#253464';
const HAIR_MID = '#3c61ae';
const HAIR_BRIGHT = '#629be4';
const HAIR_TIP = '#92cbf9';
const HAIR_LIGHT = '#a8d6fb';
const DRESS_NAVY = '#1c2442';
const DRESS_MID = '#283661';
const GOLD = '#deb057';
const GOLD_DARK = '#b07e2c';
const GOLD_LIGHT = '#f2d491';
const CREAM = '#fbf8f3';
const RUFFLE_SHADOW = '#dfe5f2';
const SKIN = '#fff1ea';
const SKIN_SHADOW = '#f6d9cf';
const BLUSH = '#f58b95';
const BOW_BLUE = '#5ba7ee';
const BOW_BLUE_DARK = '#2f6fbf';""",
"""const HAIR_LIGHT = '#a8d6fb';
const GOLD_LIGHT = '#f2d491';
const SKIN = '#fff1ea';
const SKIN_SHADOW = '#f6d9cf';
const BLUSH = '#f58b95';
const BOW_BLUE = '#5ba7ee';
const BOW_BLUE_DARK = '#2f6fbf';""")

# 2) 去掉与 HTML 重复的工具函数（clamp ... hbStrokePath），保留 makeFishState 起
i = util.find('function clamp(v, lo, hi)')
j = util.find('/* ---------------------------------------------------------------- 状态模型 */')
if i != -1 and j != -1 and j > i:
    util = util[:i] + util[j:]

merged = "\n\n".join([
    '    // =================== NEW FISH MODEL (proto/parts) ===================',
    util,
    part('10_head.js'),
    part('20_hair.js'),
    part('30_accessories.js'),
    part('40_body.js'),
    part('50_arms.js'),
    part('60_legs_tail.js'),
    part('99_assemble.js'),
])

wrapper = r'''
    // =================== fish() 兼容包装：旧场景 API → 新部件装配 ===================
    function fish(ctx, opts = {}) {
      const S = makeFishState({
        yaw: (typeof opts.yaw === 'number') ? opts.yaw : undefined,
        view: opts.view,
        pitch: opts.pitch,
        expr: opts.expr,
        pose: opts.pose,
        t: opts.t || 0,
        walkPhase: opts.walkPhase || 0
      });
      // 口型与眨眼交由运行时状态驱动
      if (typeof getVocalMouthState === 'function') {
        S.mouth = getVocalMouthState(S.t);
        if (S.mouth && S.mouth.openness > 0.05) {
          S.breath += Math.sin(S.t * 7.2) * 3.2 * 0.4;
        }
      }
      S.isBlinking = ((S.t + 1.3) % 4.2) > 4.04 && S.expr !== 'sparkle' && S.expr !== 'pout';
      S.isExcited = (S.expr === 'sparkle' || S.expr === 'happy' || S.pose === 'eureka' ||
                     S.pose === 'shareRice' || (S.mouth && S.mouth.openness > 0.2));

      const sc = (opts.scale === undefined ? 1 : opts.scale) * 0.86;
      const px = (opts.x === undefined ? 960 : opts.x);
      const py = (opts.y === undefined ? 580 : opts.y) + S.breath + S.walkBob;

      ctx.save();
      ctx.translate(px, py);
      if (opts.flipX) ctx.scale(-sc, sc);
      else ctx.scale(sc, sc);
      assembleFish(ctx, S);
      ctx.restore();
    }
'''

html = read(HTML)
start = html.find('    function fish(ctx, opts = {}) {')
end = html.find('    function drawRiceBowlProp(', start)
if start == -1 or end == -1:
    raise SystemExit('fish() 定位失败 start=%s end=%s' % (start, end))

new_html = html[:start] + merged + wrapper + '\n' + html[end:]

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(new_html)

print('written', OUT, len(new_html), 'bytes')
print('fish replaced from', start, 'to', end)
