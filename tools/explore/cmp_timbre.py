# -*- coding: utf-8 -*-
import soundfile as sf, numpy as np, librosa, pyworld as pw, sys

def load(p, dur=20.0):
    x, sr = sf.read(p, dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    if sr != 44100:
        x = librosa.resample(x, orig_sr=sr, target_sr=44100); sr = 44100
    return x[:int(sr*dur)], sr

def stats(p, name, dur=20.0):
    x, sr = load(p, dur)
    f0, t = pw.harvest(np.ascontiguousarray(x, dtype=np.float64), sr, f0_floor=70, f0_ceil=1100, frame_period=5.0)
    v = f0[f0 > 0]
    S = np.abs(librosa.stft(x, n_fft=2048, hop_length=512))
    cen = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
    roll = librosa.feature.spectral_rolloff(S=S, sr=sr, roll_percent=0.85)[0]
    mel = librosa.feature.melspectrogram(S=S**2, sr=sr, n_mels=64, fmax=11025)
    lmel = librosa.power_to_db(mel + 1e-10)
    print(f'{name:26s} dur {len(x)/sr:5.1f}s voiced {len(v)/max(1,len(f0))*100:3.0f}%  '
          f'f0 med {np.median(v):6.1f}  p10 {np.percentile(v,10):6.1f}  p90 {np.percentile(v,90):6.1f}  '
          f'centroid {np.median(cen):5.0f}  roll85 {np.median(roll):5.0f}')
    return lmel.mean(1)

A = stats('sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav', 'LetMeGo vocals')
B = stats('build/lmg/BV1R5YL69EC5.wav',             '1min pure (raw)')
C = stats('sep_out/htdemucs/original_vocal/vocals.wav', 'Our 老鼠爱大米 vocal')
D = stats('sep_xzp/htdemucs/BV1JXJy65Eft/vocals.wav', '小猪P cover vocal')

def cos(a, b): return float(np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b)))
print()
print('mel-cos  LMG~1min   %.4f' % cos(A,B))
print('mel-cos  LMG~小猪P   %.4f' % cos(A,D))
print('mel-cos  LMG~ours    %.4f' % cos(A,C))
print('mel-cos  小猪P~1min  %.4f' % cos(D,B))
