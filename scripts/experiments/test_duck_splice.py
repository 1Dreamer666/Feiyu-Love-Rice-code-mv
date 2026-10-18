import numpy as np, librosa, soundfile as sf
import pytsmod
from faster_whisper import WhisperModel

sr = 44100
HOP, WIN = 441, 1470
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=sr, mono=False)
mono_voc = voc.mean(0)
m = WhisperModel('base', device='cuda', compute_type='float16')

def contour(y):
    f0, vf, vp = librosa.pyin(y, fmin=150, fmax=900, sr=sr, frame_length=WIN, hop_length=HOP)
    return f0

def transfer(src, T0, T1):
    """把 src 的歌词按原唱 [T0,T1] 的音高曲线重唱，时长对齐 T0..T1"""
    src = np.ascontiguousarray(src)
    src_f0 = np.nan_to_num(contour(src), nan=0.0)
    orig = mono_voc[int(T0 * sr):int(T1 * sr)]
    tgt = contour(orig)
    valid = ~np.isnan(tgt)
    if valid.sum() < 3:
        return None
    filled = np.interp(np.arange(len(tgt)), np.where(valid)[0], tgt[valid])
    # 先做同长度变调（alpha=1），再整体变速
    tgt_f0 = np.interp(np.linspace(0, len(filled) - 1, len(src_f0)), np.arange(len(filled)), filled)
    y = pytsmod.tdpsola(src, sr, src_f0, tgt_f0=tgt_f0, alpha=1.0,
                        p_hop_size=HOP, p_win_size=WIN)
    y = np.asarray(y, dtype=np.float32)
    n = int(round((T1 - T0) * sr))
    rate = len(y) / n
    y = librosa.effects.time_stretch(y, rate=rate)
    if len(y) > n:
        y = y[:n]
    else:
        y = np.pad(y, (0, n - len(y)))
    return y

def assemble(y, T0, T1, duck_level=0.16, ramp=0.12):
    y2 = np.stack([y, y])
    s0, s1 = int(T0 * sr), int(T1 * sr)
    n = s1 - s0
    r = int(ramp * sr)
    duck = np.full(n, duck_level, dtype=np.float32)
    duck[:r] = np.linspace(1.0, duck_level, r)
    duck[-r:] = np.linspace(duck_level, 1.0, r)
    rms_ref = np.sqrt(np.mean(voc[:, s0:s1] ** 2))
    y2 *= rms_ref / (np.sqrt(np.mean(y2 ** 2)) + 1e-9)
    out = voc.copy()
    out[:, s0:s1] = out[:, s0:s1] * duck + y2
    return out

take4, _ = librosa.load('sing_take_v4.wav', sr=sr, mono=True)
# A. 只替换「老鼠」两字
seg_feiyu = take4[int(0.56 * sr):int(1.40 * sr)]
for T0, T1, lvl, ramp in [(91.78, 92.70, 0.16, 0.12), (91.78, 92.70, 0.10, 0.15), (91.86, 92.66, 0.12, 0.14)]:
    y = transfer(seg_feiyu, T0, T1)
    out = assemble(y, T0, T1, lvl, ramp)
    sf.write(f'test_duck_{T0}_{T1}_{lvl}.wav', out[:, int(90.2 * sr):int(94.7 * sr)].T, sr)
    segs, _ = m.transcribe(f'test_duck_{T0}_{T1}_{lvl}.wav', language='zh')
    print('A', T0, T1, lvl, ''.join(s.text for s in segs).encode('utf-8'))

# B. 整句替换（v4 完整 7 字）
seg_full = take4[:int(2.75 * sr)]
for T0, T1, lvl, ramp in [(90.82, 94.10, 0.12, 0.15), (90.82, 94.10, 0.0, 0.05)]:
    y = transfer(seg_full, T0, T1)
    out = assemble(y, T0, T1, lvl, ramp)
    sf.write(f'test_duck_full_{lvl}.wav', out[:, int(89.8 * sr):int(95.2 * sr)].T, sr)
    segs, _ = m.transcribe(f'test_duck_full_{lvl}.wav', language='zh')
    print('B', lvl, ''.join(s.text for s in segs).encode('utf-8'))
print('DONE')
