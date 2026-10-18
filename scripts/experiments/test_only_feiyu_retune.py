# -*- coding: utf-8 -*-
"""方案 B：只替换「老鼠」两字为「肥鱼」，保留原唱「就像」「爱大米」。
   优点：替换窗口仅 0.92s，时域拉伸极小；「爱大米」用原唱绝对清晰；
        音高 100% 映射到原唱该句旋律。"""
import numpy as np, librosa, soundfile as sf, pyworld as pw
from pytsmod.wsolatsm import wsola
from faster_whisper import WhisperModel

SR = 44100
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=SR, mono=False)
m = WhisperModel('base', device='cuda', compute_type='float16')

# 原唱「老鼠」窗口
SLOTS = [(91.78, 92.70), (211.85, 212.71), (243.55, 244.47)]

def orig_curve(t0, t1, n_out):
    seg = voc[0, int(t0 * SR):int(t1 * SR)]
    f0, _, _ = librosa.pyin(seg, fmin=150, fmax=900, sr=SR, frame_length=2048, hop_length=256)
    v = ~np.isnan(f0)
    if v.sum() < 4:
        return None
    idx = np.where(v)[0]
    f = np.interp(np.arange(len(f0)), idx, f0[v])
    med = np.median(f0[v])
    f = np.where((f < med * 0.72) | (f > med * 1.45), med, f)
    k = max(3, int(len(f) / 40) | 1)
    f = np.convolve(f, np.ones(k) / k, mode='same')
    return np.interp(np.linspace(0, len(f) - 1, n_out), np.arange(len(f)), f)

def retune(y, t0, t1, n, shape_mix=1.0):
    st = np.asarray(wsola(y, n / len(y)), dtype=np.float32)
    if st.ndim > 1:
        st = st[0]
    st = st[:n] if len(st) >= n else np.pad(st, (0, n - len(st)))
    f0, sp, ap = pw.wav2world(st.astype(np.float64), SR)
    if f0.sum() <= 0:
        return st
    tgt = orig_curve(t0, t1, len(f0))
    if tgt is None:
        return st
    voiced = f0 > 0
    ratio = np.median(tgt) / np.median(f0[voiced])
    shape = 1 + (tgt / np.median(tgt) - 1) * shape_mix
    f0n = np.where(voiced, f0 * ratio * shape, 0.0)
    y2 = np.asarray(pw.synthesize(f0n, sp, ap, SR), dtype=np.float32)
    return y2[:n] if len(y2) >= n else np.pad(y2, (0, n - len(y2)))

def splice(src, slots, xf_s=0.040, shape_mix=1.0):
    out = voc.copy()
    xf = int(xf_s * SR)
    rise = np.sin(np.linspace(0, np.pi / 2, xf))
    fall = np.cos(np.linspace(0, np.pi / 2, xf))
    for t0, t1 in slots:
        s0, s1 = int(t0 * SR), int(t1 * SR)
        n = s1 - s0
        y = retune(src, t0, t1, n, shape_mix)
        rms_ref = np.sqrt(np.mean(voc[:, s0:s1] ** 2))
        y *= rms_ref / (np.sqrt(np.mean(y ** 2)) + 1e-9)
        st = np.stack([y, y])
        st[:, :xf] *= rise
        st[:, -xf:] *= fall
        out[:, s0:s0 + xf] *= fall
        out[:, s1 - xf:s1] *= rise
        out[:, s0 + xf:s1 - xf] = 0
        out[:, s0:s1] += st
    return out

def asr(clip):
    sf.write('/tmp/b.wav', clip.T, SR)
    segs, _ = m.transcribe('/tmp/b.wav', language='zh')
    return ''.join(s.text for s in segs)

def load(fn):
    y, _ = librosa.load(fn, sr=SR, mono=True)
    y, _ = librosa.effects.trim(y, top_db=38)
    return y

# 「肥鱼」在整句里的位置：第 3、4 个字（0-1 就像，2-3 肥鱼）
# take 词级时间：v4: 0.56-0.88 飞, 0.88-1.40 鱼
CANDS = [
    ('v4', 'sing_take_v4.wav', 0.56, 1.40),
    ('t8', 'take_t8.wav', 0.62, 1.35),
    ('t3', 'take_t3.wav', 0.60, 1.30),
    ('t1', 'take_t1.wav', 0.55, 1.25),
    ('t6', 'take_t6.wav', 0.55, 1.22),
    ('t7', 'take_t7.wav', 0.55, 1.28),
]

rows = []
for tag, fn, a, b in CANDS:
    try:
        full = load(fn)
        seg = full[int(a * SR):int(b * SR)]
        if len(seg) < int(0.35 * SR):
            rows.append((tag, 'seg-too-short')); continue
        for sm in [1.0, 0.5]:
            out = splice(seg, SLOTS[:1], shape_mix=sm)
            clip = out[:, int(90.6 * SR):int(94.6 * SR)]
            txt = asr(clip)
            key = f'{tag}_sm{sm}'
            sf.write(f'v7_{key}.wav', clip.T, SR)
            rows.append((key, txt))
            print(f'{key}: {txt}', flush=True)
    except Exception as e:
        print('ERR', tag, type(e).__name__, e, flush=True)

with open('v7_asr.txt', 'w', encoding='utf-8') as f:
    for k, t in rows:
        f.write(f'{k}: {t}\n')
print('done')
