# -*- coding: utf-8 -*-
"""改进导出模块的音频获取逻辑：
   fetch 失败（file:// 场景）→ 自动弹出文件选择 → 用户取消则降级为无音频视频。"""
import io, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
p = os.path.join(BASE, 'export_module.js')
s = io.open(p, encoding='utf-8').read()

old_start = s.index('    /** 读取并解码母带音频，返回 44100Hz 立体声 AudioBuffer */')
old_end = s.index('    /**\n     * 导出 MP4。')

new_block = '''    /** 弹出系统文件选择器，返回用户选中的音频 File（取消返回 null） */
    function pickAudioFile() {
      return new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'audio/mpeg,audio/mp3,audio/*,.mp3';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        let settled = false;
        const done = (v) => {
          if (settled) return;
          settled = true;
          inp.remove();
          resolve(v);
        };
        inp.addEventListener('change', () => {
          done(inp.files && inp.files[0] ? inp.files[0] : null);
        });
        // 用户取消时 change 不触发，用焦点回归兜底
        window.addEventListener('focus', () => {
          setTimeout(() => {
            if (!settled && (!inp.files || inp.files.length === 0)) done(null);
          }, 800);
        }, { once: true });
        inp.click();
      });
    }

    /** 读取并解码母带音频，返回 AudioBuffer。失败时抛出可读错误。 */
    async function decodeMasterAudio(audioFile, onNeedPick) {
      let ab = null;
      if (audioFile) {
        ab = await audioFile.arrayBuffer();
      } else {
        const url = (audioEngine && audioEngine.masterAudioUrl) || 'feiyu_master_soundtrack.mp3';
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          ab = await res.arrayBuffer();
        } catch (e) {
          // file:// 下浏览器禁止 fetch 本地文件 —— 改为让用户手动选择
          if (typeof onNeedPick === 'function') onNeedPick();
          const f = await pickAudioFile();
          if (!f) {
            throw new Error('未选择母带音频文件。可先选择 MP3，或导出无音频的视频。');
          }
          ab = await f.arrayBuffer();
        }
      }

      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      let buf;
      try {
        buf = await ac.decodeAudioData(ab);
      } catch (e) {
        try { await ac.close(); } catch (_) {}
        throw new Error('音频解码失败：' + e.message);
      }
      try { await ac.close(); } catch (_) {}

      if (Math.abs(buf.sampleRate - 44100) > 1) {
        const len = Math.ceil(buf.duration * 44100);
        const off = new OfflineAudioContext(2, len, 44100);
        const src = off.createBufferSource();
        src.buffer = buf;
        src.connect(off.destination);
        src.start();
        buf = await off.startRendering();
      }
      return buf;
    }

'''

s = s[:old_start] + new_block + s[old_end:]

# 导出主函数：音频获取失败时允许降级
s = s.replace(
    """        let audioBuf = null;
        if (o.includeAudio) {
          report({ phase: 'prep', message: '解码母带音频…', progress: 0.03 });
          audioBuf = await decodeMasterAudio(o.audioFile);
        }""",
    """        let audioBuf = null;
        let audioSkipped = null;
        if (o.includeAudio) {
          report({ phase: 'prep', message: '解码母带音频…', progress: 0.03 });
          try {
            audioBuf = await decodeMasterAudio(o.audioFile, () => {
              report({ phase: 'prep', message: '需要选择母带 MP3 文件…', progress: 0.03 });
            });
          } catch (e) {
            audioSkipped = e.message;
            report({ phase: 'prep', message: '音频跳过：' + e.message, progress: 0.04 });
          }
        }"""
)

s = s.replace(
    "        report({ phase: 'done', progress: 1, message: '导出完成', bytes });\n        return { blob, bytes, frames };",
    "        report({ phase: 'done', progress: 1, message: '导出完成', bytes });\n        return { blob, bytes, frames, audioSkipped };"
)

io.open(p, 'w', encoding='utf-8').write(s)
print('audio logic improved')
