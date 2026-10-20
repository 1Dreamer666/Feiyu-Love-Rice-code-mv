# -*- coding: utf-8 -*-
"""只替换「老鼠」两字 → 「肥鱼」，保留原唱清晰的「爱大米」。
   人声 stem 独立，伴奏天然不断。只做 WSOLA 时间伸缩，不变调。"""
import numpy as np, librosa, soundfile as sf
from pytsmod.wsolatsm import wsola
from faster_whisper import WhisperModel

SR = 44100
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=SR, mono=False)
inst, _ = librosa.load('sep_out/htdemucs/original_vocal/no_vocals.wav', sr=SR, mono=False)
m = WhisperModel('base', device='cuda', compute_type='float16')

# 原唱三处「老鼠」窗口（词级时间戳）
SLOTS = [(91.78, 92.70), (211.85, 212.71), (243.55, 244.47)]

def load_take(fn):
    y, _ = librosa.load(fn, sr=SR, mono=True)
    y, _ = librosa.effects.trim(y, top_db=35)
    return y

def fit(y, n):
    out = np.asarray(wsola(y, n / len(y)), dtype=np.float32)
    if out.ndim > 1:
        out = out[0]
    return out[:n] if len(out) >= n else np.pad(out, (0, n - len(out)))

def splice(vocals, src, slots, xf_s=0.045):
    out = vocals.copy()
    xf = int(xf_s * SR)
    rise = np.sin(np.linspace(0, np.pi / 2, xf))
    fall = np.cos(np.linspace(0, np.pi / 2, xf))
    for t0, t1 in slots:
        s0, s1 = int(t0 * SR), int(t1 * SR)
        n = s1 - s0
        y = fit(src, n)
        rms_ref = np.sqrt(np.mean(vocals[:, s0:s1] ** 2))
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
    sf.write('/tmp/t.wav', clip.T, SR)
    segs, _ = m.transcribe('/tmp/t.wav', language='zh')
    return ''.join(s.text for s in segs)

# 候选：各 take 的「肥鱼」两字片段（手工时间窗）
CANDS = [
    ('v4_feiyu', 'sing_take_v4.wav', 0.56, 1.40),
    ('t3_s2s3', 'take_t3.wav', 0.90, 1.55),
    ('t7_s2s3', 'take_t7.wav', 0.35, 1.15),
    ('t1_s2s3', 'take_t1.wav', 0.30, 1.05),
    ('t6_s2s3', 'take_t6.wav', 0.28, 1.00),
]

for tag, fn, a, b in CANDS:
    try:
        full = load_take(fn)
        seg = full[int(a * SR):int(b * SR)]
        if len(seg) < int(0.3 * SR):
            print(tag, 'segment too short'); continue
        out = splice(voc, seg, SLOTS[:1])
        clip = out[:, int(90.6 * SR):int(94.6 * SR)]
        txt = asr(clip)
        print(f'{tag:10s} ASR={txt}', flush=True)
        sf.write(f'test_only_feiyu_{tag}.wav', clip.T, SR)
    except Exception as e:
        print('ERR', tag, e)
