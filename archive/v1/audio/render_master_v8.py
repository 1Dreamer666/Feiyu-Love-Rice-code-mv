# -*- coding: utf-8 -*-
"""母带 v8：修正 True Peak 到 -0.4 dBFS，并优化「肥鱼」替换段。
   - 只替换「老鼠」两字（0.86~0.92s 窗口），保留原唱「就像」「爱大米」
   - 用 take_t1 的「肥鱼」段（ASR 最接近）
   - WORLD 音高映射 + WSOLA 时间对齐
   - 伴奏全程连续（只改人声 stem）
"""
import numpy as np, librosa, soundfile as sf, subprocess, pyworld as pw
from pytsmod.wsolatsm import wsola
import pyloudnorm as pyln
from scipy.signal import butter, sosfilt, resample_poly

SR = 44100
TOTAL = 288.0
N = int(TOTAL * SR)

print('[1] 载入 stem ...')
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=SR, mono=False)
inst, _ = librosa.load('sep_out/htdemucs/original_vocal/no_vocals.wav', sr=SR, mono=False)
voc = np.ascontiguousarray(voc[:, :N]); inst = np.ascontiguousarray(inst[:, :N])

print('[2] MiMo (唱歌) 素材 ...')
take, _ = librosa.load('take_t1.wav', sr=SR, mono=True)
take, _ = librosa.effects.trim(take, top_db=38)
src = take[int(0.55 * SR):int(1.25 * SR)]
print('    肥鱼段 %.2fs' % (len(src) / SR))

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

def retune(y, t0, t1, n):
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
    shape = tgt / np.median(tgt)
    f0n = np.where(voiced, f0 * ratio * shape, 0.0)
    y2 = np.asarray(pw.synthesize(f0n, sp, ap, SR), dtype=np.float32)
    return y2[:n] if len(y2) >= n else np.pad(y2, (0, n - len(y2)))

print('[3] 替换「老鼠」→「肥鱼」 ...')
voc_new = voc.copy()
xf = int(0.040 * SR)
rise = np.sin(np.linspace(0, np.pi / 2, xf))
fall = np.cos(np.linspace(0, np.pi / 2, xf))
for i, (t0, t1) in enumerate(SLOTS):
    s0, s1 = int(t0 * SR), int(t1 * SR)
    n = s1 - s0
    y = retune(src, t0, t1, n)
    rl = int(0.13 * SR)
    dec = np.exp(-np.linspace(0, 5.0, rl)); dec /= dec.sum()
    y = y * 0.91 + np.convolve(y, dec)[:n] * 0.09
    rms_ref = np.sqrt(np.mean(voc[:, s0:s1] ** 2))
    y *= rms_ref / (np.sqrt(np.mean(y ** 2)) + 1e-9)
    st = np.stack([y, y])
    st[:, :xf] *= rise; st[:, -xf:] *= fall
    voc_new[:, s0:s0 + xf] *= fall
    voc_new[:, s1 - xf:s1] *= rise
    voc_new[:, s0 + xf:s1 - xf] = 0
    voc_new[:, s0:s1] += st
    print('    slot %d %.2f-%.2f (%.2fs)' % (i + 1, t0, t1, n / SR))

print('[4] 合并 ...')
mix = voc_new + inst

print('[5] 独白 + sidechain ...')
sos_hp = butter(2, 85, btype='highpass', fs=SR, output='sos')
for fn, t_start, gain, duck_level in [
    ('dialogue_intro.wav', 6.0, 1.00, 0.50),
    ('dialogue_interlude.wav', 123.5, 1.00, 0.45),
    ('dialogue_outro.wav', 274.0, 1.00, 0.55),
]:
    d, _ = librosa.load(fn, sr=SR, mono=False)
    if d.ndim == 1:
        d = np.stack([d, d])
    d = np.stack([sosfilt(sos_hp, d[0]), sosfilt(sos_hp, d[1])]) * gain
    s = int(t_start * SR); e = min(N, s + d.shape[1]); d = d[:, :e - s]
    L = e - s
    di, do = int(0.30 * SR), int(0.40 * SR)
    duck = np.full(L, duck_level, dtype=np.float32)
    duck[:di] = np.linspace(1.0, duck_level, di)
    duck[-do:] = np.linspace(duck_level, 1.0, do)
    mix[:, s:e] = mix[:, s:e] * duck + d
    print('    +', fn)

print('[6] 淡出 + 母带（-14.5 LUFS，True Peak -0.4）...')
fade = int(3.5 * SR)
mix[:, N - fade:] *= (np.cos(np.linspace(0, np.pi / 2, fade)) ** 2)

meter = pyln.Meter(SR)
mix *= 0.96 / np.max(np.abs(mix))
loud = meter.integrated_loudness(mix.T)
mix = pyln.normalize.loudness(mix.T, loud, -14.5).T

# True Peak 限制：迭代到 ≤ -0.4 dBFS 且尽量保持响度
target_tp = 10 ** (-0.4 / 20)
for _ in range(8):
    tp = np.max(np.abs(resample_poly(mix, 4, 1, axis=1)))
    if tp <= target_tp:
        break
    mix *= (target_tp / tp) * 0.999
    loud = meter.integrated_loudness(mix.T)
    if loud < -14.6:
        # 用轻微限幅换回响度
        mix = np.tanh(mix * 1.02) / 1.02
        loud = meter.integrated_loudness(mix.T)
        mix = pyln.normalize.loudness(mix.T, loud, -14.5).T

tp = np.max(np.abs(resample_poly(mix, 4, 1, axis=1)))
loud = meter.integrated_loudness(mix.T)
print('    LUFS %.2f   TruePeak %.2f dBFS' % (loud, 20 * np.log10(tp + 1e-12)))

sf.write('feiyu_master_soundtrack.wav', mix.T, SR, subtype='PCM_16')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'feiyu_master_soundtrack.wav',
                '-b:a', '320k', 'feiyu_master_soundtrack.mp3'], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'feiyu_master_soundtrack.wav',
                '-b:a', '320k', '肥鱼爱大米_母带原声.mp3'], check=True)
print('[7] done')
