# -*- coding: utf-8 -*-
"""把转换后人声的频谱倾斜对齐到 Let Me Go 参考音色。

做法：在若干倍频程带上比较两者的长时平均谱（LTAS），
据此设计一条平滑的补偿 EQ（限幅在 ±6 dB 内），只修倾斜、不做大改。
输出 build/svc/eq_report.txt 与均衡后的人声。
"""
import numpy as np, librosa, soundfile as sf, os
from scipy.signal import freqz, sosfilt, butter

SR = 44100
REF = 'sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav'
CONV = 'build/svc/out_full/vc_source_full_288s_target_lmg_40s_1.0_30_0.7.wav'
OUT = 'build/svc/out_full/vocal_eq.wav'

# 用副歌+主歌的人声有效片段（避开对白）估计 LTAS
BANDS = [(90, 200), (200, 400), (400, 800), (800, 1600), (1600, 3200),
         (3200, 5000), (5000, 8000), (8000, 12000), (12000, 16000), (16000, 19000)]
CENTERS = [np.sqrt(a * b) for a, b in BANDS]
SEGS = [(40, 70), (70, 100), (100, 115), (160, 190), (190, 220), (220, 250), (250, 268)]


def ltas(path):
    acc = None
    for a, b in SEGS:
        y = librosa.load(path, sr=SR, mono=True, offset=a, duration=b - a)[0]
        if len(y) < SR:
            continue
        S = np.abs(librosa.stft(y, n_fft=4096, hop_length=1024)) ** 2
        f = librosa.fft_frequencies(sr=SR, n_fft=4096)
        v = np.array([S[(f >= lo) & (f < hi)].sum() for lo, hi in BANDS])
        acc = v if acc is None else acc + v
    return acc / len(SEGS)


r = ltas(REF)
c = ltas(CONV)
r_n = r / r.sum()
c_n = c / c.sum()
delta_db = 10 * np.log10((r_n + 1e-12) / (c_n + 1e-12))
delta_db = np.clip(delta_db, -6.0, 6.0)

lines = ['== 频带能量占比（参考 vs 转换后）与建议补偿 ==']
lines.append(f'{"频带(Hz)":>16s} {"参考%":>8s} {"转换%":>8s} {"补偿(dB)":>10s}')
for (lo, hi), rv, cv, d in zip(BANDS, r_n * 100, c_n * 100, delta_db):
    lines.append(f'{lo:6d}-{hi:<8d} {rv:8.2f} {cv:8.2f} {d:+10.2f}')
lines.append(f'\n补偿总量（能量加权）: {np.average(delta_db, weights=c_n):+.2f} dB')
print('\n'.join(lines))

# ---- 设计补偿 FIR：在中心频率上做平滑插值，低频端固定 0 dB ----
freqs = np.concatenate([[20.0], CENTERS, [SR / 2 - 100]])
gains = np.concatenate([[0.0], delta_db, [delta_db[-1]]])
n_taps = 1025
w = np.linspace(0, SR / 2, 4096)
g_interp = np.interp(w, freqs, gains)
# 逆 FFT 得到线性相位 FIR
H = 10 ** (g_interp / 20)
ir = np.fft.irfft(H, n=8192)
win = np.hanning(n_taps)
fir = np.concatenate([ir[: (n_taps - 1) // 2 + 1], ir[-(n_taps - 1) // 2:]]) * win
fir = fir / np.sum(fir)  # 归一到直流增益 1（低频不动）
# 直流增益应保持 1：重新缩放使 0 Hz 响应为 1
H0 = np.abs(np.sum(fir))
fir = fir / H0

y, sr = sf.read(CONV, dtype='float32')
if y.ndim > 1:
    ye = np.stack([np.convolve(ch, fir, mode='same') for ch in y.T], 1)
else:
    ye = np.convolve(y, fir, mode='same')
# 对齐整体响度
rms0 = np.sqrt((y ** 2).mean())
rms1 = np.sqrt((ye ** 2).mean())
ye = (ye * (rms0 / (rms1 + 1e-12))).astype(np.float32)
sf.write(OUT, ye, sr)
print(f'\nwritten {OUT}')

# 复核
c2 = ltas(OUT)
c2_n = c2 / c2.sum()
lines.append('\n== 均衡后复核 ==')
for (lo, hi), rv, cv in zip(BANDS, r_n * 100, c2_n * 100):
    lines.append(f'{lo:6d}-{hi:<8d} 参考 {rv:6.2f}%  转换后 {cv:6.2f}%  差 {cv-rv:+6.2f}')
with open('build/svc/eq_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('written build/svc/eq_report.txt')
