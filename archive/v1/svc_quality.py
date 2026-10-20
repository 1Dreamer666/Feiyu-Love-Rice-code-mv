# -*- coding: utf-8 -*-
"""转换质量体检 + 导出可试听文件。

- 说话人嵌入：转换后与 Let Me Go 参考的接近程度（分段）
- 谐噪比 HNR：判断是否出现沙哑/金属噪声
- 频谱质心/高频能量：判断是否有带宽损失
输出：build/svc/quality_report.txt，以及 final/*.mp3
"""
import warnings, numpy as np, librosa, soundfile as sf, subprocess, os
warnings.filterwarnings('ignore')
from resemblyzer import VoiceEncoder, preprocess_wav

SR = 44100
enc = VoiceEncoder('cpu')

LMG = 'sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav'
OLD = 'build/feiyu_master_soundtrack.wav'
NEW = 'build/svc/final/feiyu_lmg_voice.wav'
CONV = 'build/svc/out_full/vc_source_full_288s_target_lmg_40s_1.0_30_0.7.wav'
SRC = 'build/svc/source_full_288s.wav'


def emb(path, off, dur=30.0):
    y, _ = librosa.load(path, sr=16000, mono=True, offset=off, duration=dur)
    e = enc.embed_utterance(preprocess_wav(y, source_sr=16000))
    return e / np.linalg.norm(e)


def hnr(x, sr=SR, fmin=80, fmax=1000):
    """用自相关峰估 HNR（dB）。"""
    f0, vflag, vprob = librosa.pyin(x, fmin=fmin, fmax=fmax, sr=sr,
                                    frame_length=2048, hop_length=512)
    idx = ~np.isnan(f0)
    if idx.sum() < 5:
        return float('nan')
    vals = []
    for i in np.where(idx)[0][:: max(1, idx.sum() // 60)]:
        c = int(i * 512)
        seg = x[c:c + 2048]
        if len(seg) < 1024:
            continue
        seg = seg - seg.mean()
        ac = np.correlate(seg, seg, 'full')[len(seg) - 1:]
        if ac[0] <= 0:
            continue
        ac = ac / ac[0]
        lo = int(sr / fmax); hi = int(sr / fmin)
        if hi >= len(ac) or lo >= hi:
            continue
        r = ac[lo:hi].max()
        if 0 < r < 1:
            vals.append(10 * np.log10(r / (1 - r)))
    return float(np.median(vals)) if vals else float('nan')


lines = []
lines.append('== 说话人嵌入相似度（与 Let Me Go 参考音色）==')
ref = emb(LMG, 2)
lines.append(f'{"段落":>12s}  {"旧母带":>8s}  {"新母带":>8s}  {"提升":>7s}')
for a in [40, 70, 100, 160, 190, 220, 250]:
    eo, en = emb(OLD, a), emb(NEW, a)
    so, sn = float(np.dot(ref, eo)), float(np.dot(ref, en))
    lines.append(f'{a:5d}-{a+30:4d}s  {so:8.3f}  {sn:8.3f}  {sn-so:+7.3f}')
lines.append('')

lines.append('== 音质指标 ==')
lines.append(f'{"音轨":<26s} {"HNR(dB)":>9s} {"质心(Hz)":>10s} {">10k占比":>9s}')
for name, p in [('Let Me Go 参考人声', LMG), ('转换前（原人声）', SRC), ('转换后（LMG声线）', CONV)]:
    y, _ = librosa.load(p, sr=SR, mono=True, offset=88, duration=30)
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    hi = S[freqs > 10000].sum() / S.sum()
    cen = float(np.median(librosa.feature.spectral_centroid(S=S, sr=SR)))
    lines.append(f'{name:<26s} {hnr(y):9.1f} {cen:10.0f} {hi*100:8.2f}%')
lines.append('')

lines.append('== 响度/峰值 ==')
import pyloudnorm as pyln
m = pyln.Meter(SR)
for name, p in [('旧母带', OLD), ('新母带', NEW)]:
    x, _ = sf.read(p, dtype='float32')
    lines.append(f'{name}: LUFS {m.integrated_loudness(x):6.2f}   peak {20*np.log10(np.abs(x).max()):6.2f} dBFS   {x.shape[1]}ch')

os.makedirs('build/svc/final', exist_ok=True)
with open('build/svc/quality_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('\n'.join(lines))
