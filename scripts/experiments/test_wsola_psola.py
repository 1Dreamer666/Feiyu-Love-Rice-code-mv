import numpy as np, librosa, soundfile as sf
import pytsmod
from pytsmod.wsolatsm import wsola
from faster_whisper import WhisperModel

sr = 44100
HOP, WIN = 441, 1470
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=sr, mono=False)
inst, _ = librosa.load('sep_out/htdemucs/original_vocal/no_vocals.wav', sr=sr, mono=False)
mono_voc = voc.mean(0)
take4, _ = librosa.load('sing_take_v4.wav', sr=sr, mono=True)
m = WhisperModel('base', device='cuda', compute_type='float16')

def contour(y):
    f0, vf, vp = librosa.pyin(y, fmin=150, fmax=900, sr=sr, frame_length=WIN, hop_length=HOP)
    return np.nan_to_num(f0, nan=0.0)

def target_curve(T0, T1, n):
    orig = mono_voc[int(T0 * sr):int(T1 * sr)]
    tgt = contour(orig)
    tgt = tgt[tgt > 0]
    if len(tgt) < 3:
        tgt = np.array([300.0, 300.0])
    # 用原唱音高的分位数重建平滑曲线（去掉八度错误）
    med = np.median(tgt)
    tgt = np.where((tgt < med * 0.72) | (tgt > med * 1.45), med, tgt)
    curve = np.interp(np.linspace(0, len(tgt) - 1, n), np.arange(len(tgt)), tgt)
    return curve

def melody_transfer(src, T0, T1):
    n = int(round((T1 - T0) * sr))
    alpha = n / len(src)
    try:
        st = wsola(src, sr, alpha)
    except Exception:
        st = librosa.effects.time_stretch(src, rate=len(src) / n)
    st = np.asarray(st, dtype=np.float32)[:n]
    if len(st) < n:
        st = np.pad(st, (0, n - len(st)))
    src_f0 = contour(st)
    tgt = target_curve(T0, T1, len(src_f0))
    y = pytsmod.tdpsola(st, sr, src_f0, tgt_f0=tgt, alpha=1.0, p_hop_size=HOP, p_win_size=WIN)
    y = np.asarray(y, dtype=np.float32)[:n]
    if len(y) < n:
        y = np.pad(y, (0, n - len(y)))
    return y

def assemble(y, T0, T1, duck_level, ramp):
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

def test(tag, src, T0, T1, duck_level, ramp=0.12):
    y = melody_transfer(src, T0, T1)
    out = assemble(y, T0, T1, duck_level, ramp)
    clip = out[:, max(0, int((T0 - 1.6) * sr)):int((T1 + 1.8) * sr)]
    sf.write(f'test_{tag}.wav', clip.T, sr)
    segs, _ = m.transcribe(f'test_{tag}.wav', language='zh')
    txt = ''.join(s.text for s in segs)
    print(tag, 'duck', duck_level, 'ASR', txt.encode('utf-8'))
    return y

# A: 只替换「老鼠」
test('A_whole_duck', take4[int(0.56 * sr):int(1.40 * sr)], 91.78, 92.70, 0.16)
test('A_whole_duck0', take4[int(0.56 * sr):int(1.40 * sr)], 91.78, 92.70, 0.0)
# B: 整句替换
test('B_full_duck', take4[:int(2.75 * sr)], 90.82, 94.10, 0.10, 0.15)
test('B_full_duck0', take4[:int(2.75 * sr)], 90.82, 94.10, 0.0, 0.06)
print('DONE')
