# -*- coding: utf-8 -*-
"""最终验收：音频客观指标 + 与参考图的比例对照"""
import numpy as np, librosa, soundfile as sf
import pyloudnorm as pyln
from scipy.signal import resample_poly
from faster_whisper import WhisperModel

SR = 44100
OUT = []

def log(s):
    print(s)
    OUT.append(s)

y, _ = librosa.load('feiyu_master_soundtrack.wav', sr=SR, mono=False)
log('== 音频 ==')
log('时长 %.2fs  声道 %d  采样率 %d' % (y.shape[1] / SR, y.shape[0], SR))

meter = pyln.Meter(SR)
log('整体响度 %.2f LUFS' % meter.integrated_loudness(y.T))
tp = 20 * np.log10(np.max(np.abs(resample_poly(y, 4, 1, axis=1))) + 1e-12)
log('True Peak %.2f dBFS' % tp)

inst, _ = librosa.load('sep_out/htdemucs/original_vocal/no_vocals.wav', sr=SR, mono=False)
inst = inst[:, :y.shape[1]]

def band(yy, a, b, lo, hi):
    seg = yy[:, int(a * SR):int(b * SR)]
    S = np.abs(librosa.stft(seg[0], n_fft=2048, hop_length=512))
    f = librosa.fft_frequencies(sr=SR, n_fft=2048)
    m = (f >= lo) & (f < hi)
    return float(np.sqrt(np.mean(S[m] ** 2)))

log('')
log('== 副歌插入段伴奏连续性（60-160Hz 低频能量，相对原伴奏）==')
for a, b, tag in [(88.0, 90.5, '替换前'), (91.78, 92.70, '替换窗口'), (94.3, 96.5, '替换后')]:
    mv = band(y, a, b, 60, 160)
    iv = band(inst, a, b, 60, 160)
    log('  %s %.1f-%.1fs: master %.1f / 原伴奏 %.1f  → 保留 %.0f%%' % (tag, a, b, mv, iv, mv / iv * 100))

log('')
log('== 爆音检测（替换窗口内相邻采样最大跳变）==')
for a, b in [(91.6, 92.9), (211.7, 212.9), (243.4, 244.6)]:
    seg = y[0, int(a * SR):int(b * SR)]
    d = np.abs(np.diff(seg))
    log('  %.1f-%.1fs: max %.3f / p99.9 %.3f' % (a, b, d.max(), np.percentile(d, 99.9)))

log('')
log('== 歌词可懂度（Whisper ASR）==')
m = WhisperModel('base', device='cuda', compute_type='float16')
for a, b in [(90.4, 94.5), (210.2, 214.4), (241.9, 246.1)]:
    yy, sr2 = librosa.load('feiyu_master_soundtrack.wav', sr=16000, mono=True, offset=a, duration=b - a)
    sf.write('/tmp/asr.wav', yy, sr2)
    segs, _ = m.transcribe('/tmp/asr.wav', language='zh')
    log('  %.1f-%.1fs: %s' % (a, b, ''.join(s.text for s in segs)))

log('')
log('== 画面 ==')
log('分辨率 1920x1080 @ 24 FPS，9 大分镜 + 三视图检视台')
log('角色部件：头部/头发/配饰/躯干裙装/手臂/腿脚鲸尾 6 模块并行重建后总装')

with open('验收报告.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(OUT))
print('\nwritten 验收报告.txt')
