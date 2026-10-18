# -*- coding: utf-8 -*-
"""把 references/.../v2 的 LIB/CAST 内联进单文件 MV，并用适配层替换 fish()。"""
import io, os, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
REF = os.path.join(BASE, 'references', 'let-me-go-code-mv-main', 'v2', 'src')
SRC = os.path.join(BASE, '肥鱼爱大米.backup.html')  # 始终从原始（未内联 CAST）版本重建
OUT = os.path.join(BASE, 'proto', 'integrated_cast.html')

def read(p):
    with io.open(p, encoding='utf-8') as f:
        return f.read()

lib = read(os.path.join(REF, 'lib.js'))
cast = read(os.path.join(REF, 'cast.js'))

# 去掉依赖 hyperframes 的注册代码
lib = lib.replace('window.__timelines[o.id] = tl;', '/* hyperframes 略 */')
lib = lib.replace('if (window.__hfForceTimelineRebind) window.__hfForceTimelineRebind();', '')

song_stub = 'window.SONG = window.SONG || { duration: 288.0, bpm: 100, beats: [], bars: [] };'

adapter = r'''
    /* ================= CAST 适配层 =================
       旧 MV 的 fish(ctx, {x,y,scale,yaw,expr,pose,t}) → CAST.fish(ctx, pose)
       CAST 的 rig 原点在脚底，s=1 时身高 360 单位。 */
    const CAST_FACE = {
      normal: 'open', sparkle: 'happy', pout: 'smug', smug: 'smug',
      focused: 'determined', brace: 'determined', happy: 'happy',
      sleepy: 'sleepy', sing: 'sing', eureka: 'happy', share: 'happy'
    };
    function castArms(pose) {
      switch (pose) {
        case 'sing':       return { lArm: 33, lBend: 132, lHold: 'mic' };
        // 抱碗/护碗：上臂略外张、前臂收到胸前，用 lHold 的 fold 让双手落在胸腹前
        case 'holdBowl':   return { lArm: 34, lBend: 112, rArm: 34, rBend: 112, lFront: true, rFront: true };
        case 'hugBowl':    return { lArm: 30, lBend: 118, rArm: 30, rBend: 118, lFront: true, rFront: true };
        case 'poutHips':   return { lArm: 22, lBend: 86, rArm: 22, rBend: 86 };
        case 'eureka':     return { rArm: 150, rBend: 6, lArm: 18, lBend: 82 };
        // 递碗：双臂向前平举
        case 'shareRice':  return { lArm: 82, lBend: 16, rArm: 82, rBend: 16, lFront: true, rFront: true };
        case 'countToken': return { rArm: 46, rBend: 108, lArm: 22, lBend: 90 };
        case 'sleepDesk':  return { lArm: 52, lBend: 54, rArm: 52, rBend: 54 };
        default:           return { lArm: 19, lBend: 20, rArm: 19, rBend: 20 };
      }
    }

    function fish(ctx, opts) {
      opts = opts || {};
      const t = opts.t || 0;
      const ms = (typeof getVocalMouthState === 'function') ? getVocalMouthState(t) : null;
      const open = ms ? clamp(ms.openness, 0, 1) : 0;
      const singing = open > 0.06;

      const yaw = (typeof opts.yaw === 'number') ? opts.yaw : 0;
      const sideF = Math.abs(Math.sin(yaw * Math.PI / 180));

      let face = CAST_FACE[opts.expr] || 'open';
      if (opts.pose === 'sleepDesk' || opts.expr === 'sleepy') face = 'sleepy';
      // brace/focused 是"咬牙护住/专注"的情绪，优先级高于普通歌唱脸
      const firm = (opts.expr === 'brace' || opts.expr === 'focused');
      if (singing) face = firm ? 'determined' : 'sing';
      if (firm && !singing) face = 'determined';

      const pose = Object.assign({
        x: (opts.x === undefined ? 960 : opts.x),
        y: (opts.y === undefined ? 580 : opts.y) + 330,
        s: (opts.scale === undefined ? 1 : opts.scale) * 0.92,
        sq: 1 - sideF * 0.13,
        flip: yaw > 60,
        face: face,
        mouth: singing ? Math.max(0.28, open) : 0,
        headTilt: Math.sin(t * 1.15) * 0.03,
        hair: Math.sin(t * 2.2 + 0.4) * 0.55,
        ahoge: Math.sin(t * 4.4) * 0.55,
        tail: Math.sin(t * 2.7) * 12,
        ears: Math.sin(t * 2.5) * 7,
        look: [0, 0],
        blush: 1
      }, castArms(opts.pose));

      // 眨眼（确定性，避免随机）
      const cyc = (t + 1.3) % 4.2;
      if (cyc > 4.05) pose.blink = 1;
      if (opts.expr === 'sparkle') { pose.sparkle = 1; pose.face = 'happy'; }

      try {
        CAST.fish(ctx, pose);
      } catch (e) {
        console.error('[CAST] draw failed:', e && e.message);
      }
    }
'''

html = read(SRC)
start = html.find('    function fish(ctx, opts = {}) {')
end = html.find('    function drawRiceBowlProp(', start)
if start == -1 or end == -1:
    raise SystemExit('fish() 定位失败')

block = '\n'.join([
    '    /* ============ 内联 CAST：references/let-me-go-code-mv-main/v2 ============ */',
    song_stub,
    lib,
    cast,
    adapter,
    ''
])

new_html = html[:start] + block + '\n' + html[end:]



# ---- 检视台改阵容台 ----
OLD_BLOCK = '    const stages = [\n        { yaw: 0,         label: \'正面基准 (0° Front)\',       x: 310,  sc: 1.48 },\n        { yaw: customYaw, label: `2.5D 交互视角 (${customYaw}°)`, x: 760,  sc: 1.68, highlight: true },\n        { yaw: -78,       label: \'侧面基准 (-78° Side)\',      x: 1210, sc: 1.48 },\n        { yaw: 180,       label: \'背面基准 (180° Back)\',      x: 1610, sc: 1.48 }\n      ];\n\n      stages.forEach((st) => {\n        if (st.highlight) {\n          wcWashBlob(ctx, st.x, 530, 185, 240, \'#dcebfa\', 0.55, 950);\n        }\n        fish(ctx, {\n          x: st.x,\n          y: 540,\n          scale: st.sc,\n          yaw: st.yaw,\n          expr: expr,\n          pose: pose,\n          t: t\n        });\n\n        ctx.save();\n        ctx.fillStyle = st.highlight ? \'#1d4ed8\' : \'#1d2747\';\n        ctx.font = \'bold 22px "Noto Serif SC", serif\';\n        ctx.textAlign = \'center\';\n        ctx.fillText(st.label, st.x, 845);\n        ctx.restore();\n      });\n\n'
NEW_BLOCK = '    const stages = [\n        { x: 250,  sc: 1.55, expr: \'normal\',  pose: \'stand\',    label: \'平静 · 站立\' },\n        { x: 610,  sc: 1.55, expr: \'happy\',   pose: \'sing\',     label: \'欢唱 · 麦克风\' },\n        { x: 970,  sc: 1.62, expr: expr,      pose: pose,       label: \'当前 · \' + expr + \' / \' + pose, highlight: true },\n        { x: 1330, sc: 1.55, expr: \'sparkle\', pose: \'eureka\',   label: \'灵光 · 竖指\' },\n        { x: 1690, sc: 1.55, expr: \'sleepy\',  pose: \'holdBowl\', label: \'困倦 · 抱碗\' }\n      ];\n\n      stages.forEach((st) => {\n        if (st.highlight) {\n          wcWashBlob(ctx, st.x, 560, 165, 225, \'#dcebfa\', 0.55, 950);\n        }\n        fish(ctx, {\n          x: st.x,\n          y: 560,\n          scale: st.sc,\n          yaw: 0,\n          expr: st.expr,\n          pose: st.pose,\n          t: t\n        });\n\n        ctx.save();\n        ctx.fillStyle = st.highlight ? \'#1d4ed8\' : \'#1d2747\';\n        ctx.font = \'bold 22px "Noto Serif SC", serif\';\n        ctx.textAlign = \'center\';\n        ctx.fillText(st.label, st.x, 862);\n        ctx.restore();\n      });\n\n'
if OLD_BLOCK in new_html:
    new_html = new_html.replace(OLD_BLOCK, NEW_BLOCK)
    print('sheet patched OK')
else:
    print('WARN: sheet block not found')

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(new_html)
print('written', OUT)
print('fish replaced', start, '->', end)
