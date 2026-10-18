import numpy as np, librosa, soundfile as sf
import pytsmod
from faster_whisper import WhisperModel

sr = 44100
HOP = 441
WIN = 1470
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=sr, mono=False)
take, _ = librosa.load('sing_take_v4.wav', sr=sr, mono=False)
if take.ndim == 1:
    take = np.stack([take, take])

T0, TM, T1 = 91.78, 92.34, 92.70
mono_take = take.mean(0)
mono_voc = voc.mean(0)

def f0_contour(y, fmin=150, fmax=900):
    f0, vf, vp = librosa.pyin(y, fmin=fmin, fmax=fmax, sr=sr, frame_length=WIN, hop_length=HOP)
    return f0

# 源：v4 的「肥+鱼」0.56~1.40
seg = take[:, int(0.56 * sr):int(1.40 * sr)]
seg_mono = seg.mean(0)
src_f0 = f0_contour(seg_mono)
src_f0 = np.nan_to_num(src_f0, nan=0.0)

# 目标：原唱 91.78~92.70 的音高曲线
orig_seg = mono_voc[int(T0 * sr):int(T1 * sr)]
tgt_raw = f0_contour(orig_seg)
# 插值补全 NaN
valid = ~np.isnan(tgt_raw)
if valid.sum() > 2:
    tgt_filled = np.interp(np.arange(len(tgt_raw)), np.where(valid)[0], tgt_raw[valid])
else:
    tgt_filled = np.full(len(tgt_raw), 300.0)

alpha = (T1 - T0) / ((seg.shape[1]) / sr)
out_len_frames = int(round(len(src_f0) * alpha))
tgt_f0 = np.interp(np.linspace(0, len(tgt_filled) - 1, out_len_frames), np.arange(len(tgt_filled)), tgt_filled)

print('src frames', len(src_f0), 'tgt frames', len(tgt_f0), 'alpha', alpha)
print('src f0 med', np.nanmedian(src_f0), 'tgt f0 med', np.nanmedian(tgt_f0))

y = pytsmod.tdpsola(seg_mono, sr, src_f0, tgt_f0=tgt_f0, alpha=alpha,
                    p_hop_size=HOP, p_win_size=WIN)
print('out shape', np.shape(y), 'dur', len(y) / sr)
n = int(round((T1 - T0) * sr))
y = np.asarray(y, dtype=np.float32)
if len(y) > n:
    y = y[:n]
else:
    y = np.pad(y, (0, n - len(y)))
y2 = np.stack([y, y])

# 拼接进原唱
xf = int(0.025 * sr)
rise = np.sin(np.linspace(0, np.pi / 2, xf)); fall = np.cos(np.linspace(0, np.pi / 2, xf))
s0, s1 = int(T0 * sr), int(T1 * sr)
rms_ref = np.sqrt(np.mean(voc[:, s0:s1] ** 2))
y2 *= rms_ref / (np.sqrt(np.mean(y2 ** 2)) + 1e-9)
out = voc.copy()
out[:, s0:s0 + xf] *= fall
out[:, s1 - xf:s1] *= rise
out[:, s0 + xf:s1 - xf] = 0
y2[:, :xf] *= rise; y2[:, -xf:] *= fall
out[:, s0:s1] += y2
sf.write('test_tdpsola.wav', out[:, int(90.3 * sr):int(94.6 * sr)].T, sr)

m = WhisperModel('base', device='cuda', compute_type='float16')
segs, _ = m.transcribe('test_tdpsola.wav', language='zh')
print('ASR', ''.join(s.text for s in segs).encode('utf-8'))

y_chk, _ = librosa.load('test_tdpsola.wav', sr=sr, mono=True, offset=1.48, duration=0.92)
f0, _, _ = librosa.pyin(y_chk, fmin=150, fmax=900, sr=sr, frame_length=WIN, hop_length=HOP)
f0v = f0[~np.isnan(f0)]
print('out f0 med', np.median(f0v) if len(f0v) else 0, 'range', (f0v.min(), f0v.max()) if len(f0v) else None)
