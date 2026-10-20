# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, librosa, pyworld as pw

def load(p, dur=None):
    x, sr = sf.read(p, dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    if sr != 44100:
        x = librosa.resample(x, orig_sr=sr, target_sr=44100); sr = 44100
    return (x[:int(sr*dur)] if dur else x), sr

def sec(p, name, step=10.0):
    x, sr = load(p)
    print('===', name, round(len(x)/sr, 1), 's')
    hop = int(sr*step)
    for k in range(0, max(1, len(x)-hop), hop):
        seg = np.ascontiguousarray(x[k:k+hop])
        r = 20*np.log10(np.sqrt((seg**2).mean())+1e-9)
        f0, t = pw.harvest(seg.astype(np.float64), sr, f0_floor=80, f0_ceil=1000, frame_period=10.0)
        v = f0[f0 > 0]
        med = np.median(v) if len(v) > 3 else float('nan')
        print(f'  {k/sr:6.1f}s rms {r:6.1f} dB  f0 {med:6.1f} Hz  voiced {len(v)/len(f0)*100:3.0f}%')

sec('sep_out/htdemucs/original_vocal/vocals.wav', 'OUR VOCAL')
sec('sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav', 'LMG VOCAL', 10.0)
