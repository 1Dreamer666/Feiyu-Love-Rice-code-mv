import librosa, numpy as np, soundfile as sf
import parselmouth
from parselmouth.praat import call
from faster_whisper import WhisperModel

sr = 44100
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=sr, mono=False)
take, _ = librosa.load('sing_take_v4.wav', sr=sr, mono=False)
if take.ndim == 1:
    take = np.stack([take, take])

T0, TM, T1 = 91.78, 92.34, 92.70

def psola_shift(mono, ratio):
    """Praat PSOLA: 改音高、保共振峰与时长"""
    snd = parselmouth.Sound(mono.astype(np.float64), sampling_frequency=sr)
    manip = call(snd, "To Manipulation", 0.01, 70, 900)
    tier = call(manip, "Extract pitch tier")
    call(tier, "Multiply frequencies", 0, 0, ratio)
    call([tier, manip], "Replace pitch tier")
    out = call(manip, "Get resynthesis (overlap-add)")
    y = out.values[0] if out.values.ndim > 1 else out.values
    y = np.asarray(y, dtype=np.float32)
    if len(y) > len(mono):
        y = y[:len(mono)]
    else:
        y = np.pad(y, (0, len(mono) - len(y)))
    return y

def fit(seg, target_dur, ratio):
    out = np.stack([psola_shift(seg[0], ratio), psola_shift(seg[1], ratio)])
    rate = out.shape[1] / (target_dur * sr)
    out = np.stack([librosa.effects.time_stretch(out[0], rate=rate),
                    librosa.effects.time_stretch(out[1], rate=rate)])
    n = int(round(target_dur * sr))
    if out.shape[1] > n:
        out = out[:, :n]
    else:
        out = np.pad(out, ((0, 0), (0, n - out.shape[1])))
    return out

def build(b, ratio_f, ratio_y, tag):
    fei = take[:, int(0.56 * sr):int(b * sr)]
    yu = take[:, int(b * sr):int(1.40 * sr)]
    f = fit(fei, TM - T0, ratio_f)
    y = fit(yu, T1 - TM, ratio_y)
    xf = int(0.020 * sr)
    rise = np.sin(np.linspace(0, np.pi / 2, xf)); fall = np.cos(np.linspace(0, np.pi / 2, xf))
    seg = np.concatenate([f, y], axis=1)
    a = f.shape[1] - xf
    seg[:, a:a + xf] = f[:, -xf:] * fall + y[:, :xf] * rise
    seg[:, :xf] *= rise; seg[:, -xf:] *= fall
    s0, s1 = int(T0 * sr), int(T1 * sr)
    rms_ref = np.sqrt(np.mean(voc[:, s0:s1] ** 2))
    seg *= rms_ref / (np.sqrt(np.mean(seg ** 2)) + 1e-9)
    out = voc.copy()
    out[:, s0:s0 + xf] *= fall
    out[:, s1 - xf:s1] *= rise
    out[:, s0 + xf:s1 - xf] = 0
    out[:, s0:s1] += seg
    sf.write(f'test_psola_{tag}.wav', out[:, int(90.3 * sr):int(94.6 * sr)].T, sr)
    return out

m = WhisperModel('base', device='cuda', compute_type='float16')
def asr(y):
    sf.write('/tmp/ps.wav', y.T, sr)
    segs, _ = m.transcribe('/tmp/ps.wav', language='zh')
    return ''.join(s.text for s in segs)

cands = [
    ('r1_312_277', 312 / 252, 277 / 256),
    ('r2_global', 2 ** (2.5 / 12), 2 ** (2.5 / 12)),
    ('r3_312_281', 312 / 252, 281 / 256),
    ('r4_none', 1.0, 1.0),
]
for tag, rf, ry in cands:
    out = build(0.88, rf, ry, tag)
    print(tag, asr(out[:, int(90.3 * sr):int(94.6 * sr)]).encode('utf-8'))

# F0 check
y, _ = librosa.load('test_psola_r1_312_277.wav', sr=sr, mono=True, offset=1.48, duration=0.92)
f0, _, _ = librosa.pyin(y, fmin=150, fmax=900, sr=sr, frame_length=1024, hop_length=256)
f0v = f0[~np.isnan(f0)]
print('f0 r1', np.median(f0v) if len(f0v) else 0, f0v.min() if len(f0v) else 0, f0v.max() if len(f0v) else 0)
print('DONE')
