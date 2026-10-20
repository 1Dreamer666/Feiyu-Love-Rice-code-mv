# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, librosa

def load(p, sr=44100):
    x, s = sf.read(p, dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    if s != sr: x = librosa.resample(x, orig_sr=s, target_sr=sr)
    return x

m   = load('build/feiyu_master_soundtrack.wav')
v   = load('sep_out/htdemucs/original_vocal/vocals.wav')
ov  = load('build/audio_takes/original_vocal.mp3')
inst= load('sep_out/htdemucs/original_vocal/no_vocals.wav')

def best_lag(a, b, lo=-3, hi=3):
    """粗对齐：在 ±3 秒内找最大互相关"""
    best, bl = -1, 0
    for lag in np.arange(lo, hi, 0.01):
        k = int(lag*44100)
        if k >= 0: x, y = a[k:k+44100*4], b[:44100*4]
        else:      x, y = a[:44100*4], b[-k:-k+44100*4]
        n = min(len(x), len(y))
        if n < 44100: continue
        c = float(np.corrcoef(x[:n], y[:n])[0,1])
        if c > best: best, bl = c, lag
    return bl, best

for name, sig in [('sep_out vocals', v), ('original_vocal.mp3', ov), ('sep_out no_vocals', inst)]:
    # 用 master 的 60-64s 段落做模板
    seg = m[int(60*44100):int(64*44100)]
    lag, c = best_lag(sig[int(56*44100):int(70*44100)], seg)
    print(f'master[60-64s] vs {name:22s}: lag {lag:+.2f}s  corr {c:+.3f}')

# 频谱对比
for name, sig in [('master', m), ('sep_out vocals', v), ('original_vocal.mp3', ov)]:
    seg = sig[int(60*44100):int(64*44100)]
    S = np.abs(librosa.stft(seg, n_fft=2048, hop_length=512))**2
    cen = librosa.feature.spectral_centroid(S=S, sr=44100)[0]
    flat= librosa.feature.spectral_flatness(S=S).mean()
    rms = 20*np.log10(np.sqrt((seg**2).mean())+1e-9)
    print(f'{name:20s} centroid {np.median(cen):6.0f} Hz  flatness {flat:.4f}  rms {rms:6.1f} dB')
