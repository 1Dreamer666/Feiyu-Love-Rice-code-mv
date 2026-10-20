import numpy as np, librosa, soundfile as sf
import pyworld as pw
from pytsmod.wsolatsm import wsola
from faster_whisper import WhisperModel

SR = 44100
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=SR, mono=False)
take4, _ = librosa.load('sing_take_v4.wav', sr=SR, mono=True)
m = WhisperModel('base', device='cuda', compute_type='float16')

def world_shift(x, f0_fn):
    x = x.astype(np.float64)
    f0, sp, ap = pw.wav2world(x, SR)
    f0n = f0_fn(f0)
    y = pw.synthesize(f0n, sp, ap, SR)
    return np.asarray(y, dtype=np.float32)

# --- 两字「肥鱼」：分前后两段给不同音高 ---
seg = take4[int(0.56 * SR):int(1.40 * SR)]
split = int(0.32 * SR)  # 0.56+0.32 = 0.88s 处
ratio_fei = 311 / 252
ratio_yu = 277 / 256

y = world_shift(seg, lambda f0: np.where(np.arange(len(f0)) < split / (seg.size / len(f0)),
                                         f0 * ratio_fei, f0 * ratio_yu))
# 时长对齐 0.92s
n = int(round(0.92 * SR))
y = wsola(y, n / len(y))[:n]
y = np.pad(y, (0, max(0, n - len(y))))
sf.write('/tmp/world_feiyu.wav', y, SR)
segs, _ = m.transcribe('/tmp/world_feiyu.wav', language='zh')
print('WORLD 肥鱼 ASR:', ''.join(s.text for s in segs).encode('utf-8'))

# --- 拼进原唱 ---
T0, T1 = 91.78, 92.70
xf = int(0.025 * SR)
rise = np.sin(np.linspace(0, np.pi / 2, xf)); fall = np.cos(np.linspace(0, np.pi / 2, xf))
y2 = np.stack([y, y])
s0, s1 = int(T0 * SR), int(T1 * SR)
rms_ref = np.sqrt(np.mean(voc[:, s0:s1] ** 2))
y2 *= rms_ref / (np.sqrt(np.mean(y2 ** 2)) + 1e-9)
out = voc.copy()
out[:, s0:s0 + xf] *= fall
out[:, s1 - xf:s1] *= rise
out[:, s0 + xf:s1 - xf] = 0
y2[:, :xf] *= rise; y2[:, -xf:] *= fall
out[:, s0:s1] += y2
clip = out[:, int(90.2 * SR):int(94.7 * SR)]
sf.write('test_world_splice.wav', clip.T, SR)
segs, _ = m.transcribe('test_world_splice.wav', language='zh')
print('WORLD splice ASR:', ''.join(s.text for s in segs).encode('utf-8'))

# 音高检查
f0, _, _ = librosa.pyin(clip.mean(0), fmin=150, fmax=900, sr=SR, frame_length=1470, hop_length=441)
t = librosa.times_like(f0, sr=SR, hop_length=441) + 90.2
for a, b in [(91.78, 92.34), (92.34, 92.70)]:
    mm = (t >= a) & (t < b) & ~np.isnan(f0)
    print(a, b, 'median', np.median(f0[mm]) if mm.sum() else 0)
