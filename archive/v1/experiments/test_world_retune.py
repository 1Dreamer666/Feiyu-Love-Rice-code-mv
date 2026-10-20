# -*- coding: utf-8 -*-
"""把 MiMo (唱歌) 素材的音高映射到原曲旋律（WORLD 保留共振峰），再时间伸缩对齐。
   只替换人声 stem，伴奏全程连续。"""
import numpy as np, librosa, soundfile as sf, pyworld as pw
from pytsmod.wsolatsm import wsola
from faster_whisper import WhisperModel

SR = 44100
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=SR, mono=False)
inst, _ = librosa.load('sep_out/htdemucs/original_vocal/no_vocals.wav', sr=SR, mono=False)
m = WhisperModel('base', device='cuda', compute_type='float16')

CHORUS = [(90.82, 94.10), (210.59, 214.13), (242.21, 245.89)]

def load_take(fn):
    y, _ = librosa.load(fn, sr=SR, mono=True)
    y, _ = librosa.effects.trim(y, top_db=38)
    return y

def orig_f0_curve(t0, t1, n_out):
    """原唱该句的 f0 曲线（去掉八度错误，平滑）"""
    seg = voc[0, int(t0 * SR):int(t1 * SR)]
    f0, vf, vp = librosa.pyin(seg, fmin=150, fmax=900, sr=SR,
                              frame_length=2048, hop_length=256)
    v = ~np.isnan(f0)
    if v.sum() < 4:
        return None
    idx = np.where(v)[0]
    f0f = np.interp(np.arange(len(f0)), idx, f0[v])
    # 去八度：相对中位数，超出 0.72~1.45 的拉回
    med = np.median(f0[v])
    f0f = np.where((f0f < med * 0.72) | (f0f > med * 1.45), med, f0f)
    # 平滑
    k = max(3, int(len(f0f) / 60) | 1)
    f0f = np.convolve(f0f, np.ones(k) / k, mode='same')
    return np.interp(np.linspace(0, len(f0f) - 1, n_out), np.arange(len(f0f)), f0f)

def world_retune(y, t0, t1, n_target):
    """时间伸缩到 n_target，然后把 f0 映射到原曲曲线"""
    # 1) 先时间伸缩（WSOLA，保音高）
    st = np.asarray(wsola(y, n_target / len(y)), dtype=np.float32)
    if st.ndim > 1:
        st = st[0]
    st = st[:n_target] if len(st) >= n_target else np.pad(st, (0, n_target - len(st)))

    # 2) WORLD 分析
    x = st.astype(np.float64)
    f0, sp, ap = pw.wav2world(x, SR)
    if f0.sum() <= 0:
        return st

    # 3) 目标曲线（对齐到 WORLD 帧率）
    tgt = orig_f0_curve(t0, t1, len(f0))
    if tgt is None:
        return st

    # 4) 只做整体音域对齐 + 相对轮廓跟随：
    #    保留素材自身的自然起伏（颤音/滑音），把其中位数移到原曲中位数，
    #    再按原曲曲线的相对形状做 40% 的修正，避免过度机械化。
    voiced = f0 > 0
    med_src = np.median(f0[voiced])
    med_tgt = np.median(tgt)
    ratio_const = med_tgt / med_src
    shape = (tgt / np.median(tgt))
    shape = 1 + (shape - 1) * 0.40
    f0n = np.where(voiced, f0 * ratio_const * shape, 0.0)

    y2 = pw.synthesize(f0n, sp, ap, SR)
    y2 = np.asarray(y2, dtype=np.float32)
    if len(y2) > n_target:
        y2 = y2[:n_target]
    else:
        y2 = np.pad(y2, (0, n_target - len(y2)))
    return y2

def splice(src, slots, xf_s=0.045, tag='x'):
    out = voc.copy()
    xf = int(xf_s * SR)
    rise = np.sin(np.linspace(0, np.pi / 2, xf))
    fall = np.cos(np.linspace(0, np.pi / 2, xf))
    for t0, t1 in slots:
        s0, s1 = int(t0 * SR), int(t1 * SR)
        n = s1 - s0
        y = world_retune(src, t0, t1, n)
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

def asr(clip, sr=SR):
    sf.write('/tmp/w.wav', clip.T, sr)
    segs, _ = m.transcribe('/tmp/w.wav', language='zh')
    return ''.join(s.text for s in segs)

CANDS = [
    ('t3', 'take_t3.wav'), ('t7', 'take_t7.wav'), ('t1', 'take_t1.wav'),
    ('t6', 'take_t6.wav'), ('t8', 'take_t8.wav'), ('v4', 'sing_take_v4.wav'),
]
res = []
for tag, fn in CANDS:
    try:
        src = load_take(fn)
        out = splice(src, CHORUS[:1], tag=tag)
        clip = out[:, int(90.6 * SR):int(94.6 * SR)]
        txt = asr(clip)
        sf.write(f'v6_{tag}_c1.wav', clip.T, SR)
        res.append((tag, txt))
        print(f'{tag}: {txt}', flush=True)
    except Exception as e:
        print('ERR', tag, type(e).__name__, e, flush=True)

with open('v6_asr.txt', 'w', encoding='utf-8') as f:
    for tag, txt in res:
        f.write(f'{tag}: {txt}\n')
print('done')
