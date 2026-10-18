# -*- coding: utf-8 -*-
"""把 MP4 导出功能注入单文件 MV：
   1) head 里加 mp4-muxer
   2) header 里加「导出 MP4」按钮
   3) body 末尾加导出面板
   4) 脚本末尾加导出模块
   幂等：若已存在标记则先移除旧块再注入。"""
import io, os, re

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # 项目根目录
SRC = os.path.join(BASE, '肥鱼爱大米.html')
OUT = os.path.join(BASE, '肥鱼爱大米.html')

def read(p):
    with io.open(p, encoding='utf-8') as f:
        return f.read()

html = read(SRC)
mod = read(os.path.join(BASE, 'export_module.js'))

# ---------- 1) muxer ----------
if 'mp4-muxer' not in html:
    html = html.replace(
        '  <script src="https://cdn.jsdelivr.net/npm/p5.brush@1.1.1/dist/p5.brush.min.js"></script>',
        '  <script src="https://cdn.jsdelivr.net/npm/p5.brush@1.1.1/dist/p5.brush.min.js"></script>\n'
        '  <script src="vendor/mp4-muxer.js"></script>'
    )

# ---------- 2) 按钮 ----------
BTN = '''        <button id="btn-export-mp4" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600/90 text-white shadow hover:bg-amber-500 transition flex items-center gap-1.5 border border-amber-400/40">
          <span>🎬</span><span>导出 MP4</span>
        </button>
'''
if 'btn-export-mp4' not in html:
    anchor = '        <button id="btn-mode-mv"'
    html = html.replace(anchor, BTN + anchor, 1)

# ---------- 3) 面板 ----------
PANEL = '''
  <!-- MP4 导出面板 -->
  <div id="export-modal" class="hidden absolute inset-0 bg-slate-950/85 backdrop-blur-md z-40 flex items-center justify-center p-4">
    <div class="w-full max-w-xl rounded-2xl bg-[#f7f2e7] text-[#1d2542] shadow-2xl border-2 border-[#2b4c8c]/35 p-5">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 class="text-xl font-bold">🎬 导出 MP4 视频</h3>
          <p class="text-xs text-slate-600 mt-1">离线逐帧渲染（与播放完全一致）+ 母带原声 AAC，输出 H.264 / MP4。</p>
        </div>
        <button id="export-close" class="text-slate-500 hover:text-slate-800 text-2xl leading-none px-1">×</button>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-3">
        <label class="block">
          <span class="text-[11px] font-semibold text-slate-600">开始（秒）</span>
          <input id="export-start" type="number" min="0" max="288" step="0.5" value="0"
                 class="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm" />
        </label>
        <label class="block">
          <span class="text-[11px] font-semibold text-slate-600">结束（秒）</span>
          <input id="export-end" type="number" min="0" max="288" step="0.5" value="288"
                 class="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm" />
        </label>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-3">
        <label class="block">
          <span class="text-[11px] font-semibold text-slate-600">分辨率</span>
          <select id="export-res" class="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm">
            <option value="1920x1080">1920 × 1080（原画）</option>
            <option value="1280x720">1280 × 720</option>
            <option value="2560x1440">2560 × 1440</option>
          </select>
        </label>
        <div class="block">
          <span class="text-[11px] font-semibold text-slate-600">母带音频</span>
          <div class="mt-1 flex items-center gap-1.5">
            <button id="export-pick-audio" class="px-2 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-[11px] font-medium">选择 MP3</button>
            <span id="export-audio-name" class="text-[11px] text-slate-500 truncate">自动读取</span>
          </div>
        </div>
      </div>

      <div class="mb-2">
        <div class="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div id="export-bar" class="h-full w-0 bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-200"></div>
        </div>
        <div class="flex items-center justify-between mt-1">
          <span id="export-msg" class="text-[11px] text-slate-600">就绪</span>
          <span id="export-pct" class="text-[11px] font-mono font-bold text-sky-700">0%</span>
        </div>
      </div>

      <div id="export-log" class="text-[11px] text-slate-600 leading-relaxed min-h-[16px] mb-3"></div>

      <div class="flex items-center justify-end gap-2">
        <button id="export-cancel" disabled class="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold disabled:opacity-40">取消</button>
        <button id="export-go" class="px-5 py-2 rounded-xl bg-[#264785] hover:bg-[#3159a6] text-white text-sm font-semibold shadow-lg">开始导出</button>
      </div>
    </div>
  </div>
'''
if 'export-modal' not in html:
    # 插到 start-overlay 结束之后（同一层级）
    marker = '      <!-- MiMo-V2.5-TTS & Original Song Crawler Drawer Modal -->'
    if marker in html:
        html = html.replace(marker, PANEL + '\n' + marker, 1)
    else:
        html = html.replace('</body>', PANEL + '\n</body>', 1)

# ---------- 4) 脚本模块（幂等：先删旧块再插入新块）----------
MOD_MARK = '    // 10. MP4 视频导出'
if MOD_MARK in html:
    start = html.find(MOD_MARK)
    end = html.find('  </script>', start)
    if end == -1:
        raise SystemExit('old module end not found')
    html = html[:start] + html[end:]

idx = html.rfind('  </script>')
if idx == -1:
    raise SystemExit('script end not found')
html = html[:idx] + mod + '\n' + html[idx:]

# ---------- 5) 母带音频地址修正 ----------
html = html.replace(
    "this.masterAudioUrl = 'feiyu_master_soundtrack.mp3';",
    "this.masterAudioUrl = '肥鱼爱大米_母带原声.mp3';"
)

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)

print('written', OUT, len(html))
print('muxer:', 'vendor/mp4-muxer.js' in html)
print('button:', 'btn-export-mp4' in html)
print('panel:', 'export-modal' in html)
print('module:', MOD_MARK in html)
