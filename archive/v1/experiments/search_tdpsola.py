import numpy as np, librosa, soundfile as sf
import pytsmod
from faster_whisper import WhisperModel

sr = 44100
HOP, WIN = 441, 1470
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=sr, mono=False)
take, _ = librosa.load('sing_take_v4.wav', sr=sr, mono=False)
if take.ndim == 1:
    take = np.stack([take, take])
mono_voc = voc.mean(0)
seg = take[:, int(0.56 * sr):int(1.40 * sr)]
seg_mono = np.ascontiguousarray(seg.mean(0))

def contour(y):
    f0, vf, vp = librosa.pyin(y, fmin=150, fmax=900, sr=sr, frame_length=WIN, hop_length=HOP)
    return f0

src_f0 = np.nan_to_num(contour(seg_mono), nan=0.0)
m = WhisperModel('base', device='cuda', compute_type='float16')

def build(T0, T1, xf_s, fx=1.0):
    orig = mono_voc[int(T0 * sr):int(T1 * sr)]
    tgt = contour(orig)
    valid = ~np.isnan(tgt)
    if valid.sum() < 3:
        return None
    filled = np.interp(np.arange(len(tgt)), np.where(valid)[0], tgt[valid])
    alpha = (T1 - T0) / (seg.shape[1] / sr)
    nf = int(round(len(src_f0) * alpha))
    tgt_f0 = np.interp(np.linspace(0, len(filled) - 1, nf), np.arange(len(filled)), filled)
    y = pytsmod.tdpsola(seg_mono, sr, src_f0, tgt_f0=tgt_f0 * fx, alpha=alpha,
                        p_hop_size=HOP, p_win_size=WIN)
    n = int(round((T1 - T0) * sr))
    y = np.asarray(y, dtype=np.float32)
    y = y[:n] if len(y) > n else np.pad(y, (0, n - len(y)))
    y2 = np.stack([y, y])
    xf = int(xf_s * sr)
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
    return out

def asr(y):
    sf.write('/tmp/c.wav', y.T, sr)
    segs, _ = m.transcribe('/tmp/c.wav', language='zh')
    return ''.join(s.text for s in segs)

results = []
for T0 in [91.74, 91.80, 91.86, 91.92]:
    for T1 in [92.64, 92.70, 92.76]:
        for xf_s in [0.03, 0.05]:
            out = build(T0, T1, xf_s)
            if out is None:
                continue
            clip = out[:, int(90.2 * sr):int(94.7 * sr)]
            txt = asr(clip)
            score = sum(ch in txt for ch in '肥飞鱼')
            if '爱' in txt: score += 1
            if '米' in txt: score += 1
            results.append((score, T0, T1, xf_s, txt))
            print(score, T0, T1, xf_s, txt.encode('utf-8'))
results.sort(key=lambda r: -r[0])
print('BEST')
for r in results[:6]:
    print(r[0], r[1], r[2], r[3], r[4].encode('utf-8'))
