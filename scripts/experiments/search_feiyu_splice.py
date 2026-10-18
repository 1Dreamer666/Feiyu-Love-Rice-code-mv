import librosa, numpy as np, soundfile as sf, itertools
from faster_whisper import WhisperModel

sr = 44100
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=sr, mono=False)
takes = {
    'v4': librosa.load('sing_take_v4.wav', sr=sr, mono=False)[0],
    'v7': librosa.load('sing_take_v7.wav', sr=sr, mono=False)[0],
    'v8': librosa.load('sing_take_v8.wav', sr=sr, mono=False)[0],
}
for k, v in takes.items():
    if v.ndim == 1:
        takes[k] = np.stack([v, v])

T0, TM, T1 = 91.78, 92.34, 92.70
m = WhisperModel('base', device='cuda', compute_type='float16')

def process(seg, target_dur, target_hz, cur_hz, do_pitch=True, do_stretch=True):
    out = seg
    if do_pitch:
        n = 12 * np.log2(target_hz / cur_hz)
        out = np.stack([librosa.effects.pitch_shift(out[0], sr=sr, n_steps=n),
                        librosa.effects.pitch_shift(out[1], sr=sr, n_steps=n)])
    if do_stretch:
        rate = out.shape[1] / (target_dur * sr)
        out = np.stack([librosa.effects.time_stretch(out[0], rate=rate),
                        librosa.effects.time_stretch(out[1], rate=rate)])
    n = int(round(target_dur * sr))
    if out.shape[1] > n:
        out = out[:, :n]
    else:
        out = np.pad(out, ((0, 0), (0, n - out.shape[1])))
    return out

def build(take, b, do_pitch=True, do_stretch=True, f0f=252, f0y=256):
    t = takes[take]
    fei = t[:, int(0.56 * sr):int(b * sr)]
    yu = t[:, int(b * sr):int(1.40 * sr)]
    f = process(fei, TM - T0, 312, f0f, do_pitch, do_stretch)
    y = process(yu, T1 - TM, 277, f0y, do_pitch, do_stretch)
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
    return out

def asr(seg_audio):
    sf.write('/tmp/cand.wav', seg_audio.T, sr)
    segs, _ = m.transcribe('/tmp/cand.wav', language='zh')
    return ''.join(s.text for s in segs)

base = voc[:, int(90.3 * sr):int(94.6 * sr)]
print('BASE ASR:', asr(base).encode('utf-8'))

results = []
for take in ['v4', 'v7', 'v8']:
    for b in [0.80, 0.88, 0.95, 1.02, 1.10]:
        for mode in ['both', 'nopitch', 'nostretch']:
            try:
                out = build(take, b, mode != 'nopitch', mode != 'nostretch')
                txt = asr(out[:, int(90.3 * sr):int(94.6 * sr)])
                score = sum(ch in txt for ch in '肥飞鱼')
                results.append((score, take, b, mode, txt))
                print(score, take, b, mode, txt.encode('utf-8'))
            except Exception as e:
                print('ERR', take, b, mode, e)
results.sort(reverse=True)
print('BEST:')
for r in results[:5]:
    print(r[0], r[1], r[2], r[3], r[4].encode('utf-8'))
