import librosa, numpy as np, soundfile as sf, sys
from faster_whisper import WhisperModel

sr = 44100
VOC = 'sep_out/htdemucs/original_vocal/vocals.wav'
INST = 'sep_out/htdemucs/original_vocal/no_vocals.wav'
TAKE = 'sing_take_v4.wav'

# --- MiMo 歌唱素材：v4 的「肥」「鱼」两个音节 ---
take, _ = librosa.load(TAKE, sr=sr, mono=False)
if take.ndim == 1:
    take = np.stack([take, take])

def slice_syl(t0, t1):
    return take[:, int(t0 * sr):int(t1 * sr)].copy()

syl_fei = slice_syl(0.56, 0.88)   # f0 ~252 Hz
syl_yu = slice_syl(0.88, 1.40)    # f0 ~256 Hz
print('raw syl', syl_fei.shape[1] / sr, syl_yu.shape[1] / sr)

def fit_syl(seg, target_dur, target_hz, cur_hz):
    n_steps = 12 * np.log2(target_hz / cur_hz)
    out = np.stack([librosa.effects.pitch_shift(seg[0], sr=sr, n_steps=n_steps),
                    librosa.effects.pitch_shift(seg[1], sr=sr, n_steps=n_steps)])
    rate = out.shape[1] / (target_dur * sr)
    out = np.stack([librosa.effects.time_stretch(out[0], rate=rate),
                    librosa.effects.time_stretch(out[1], rate=rate)])
    n = int(round(target_dur * sr))
    if out.shape[1] > n:
        out = out[:, :n]
    else:
        out = np.pad(out, ((0, 0), (0, n - out.shape[1])))
    return out

# --- 原唱人声与伴奏 ---
voc, _ = librosa.load(VOC, sr=sr, mono=False)
inst, _ = librosa.load(INST, sr=sr, mono=False)
print('voc', voc.shape, 'inst', inst.shape)

# 合唱 1 的「老鼠」窗口（ASR 词级时间戳）
T_FEI0, T_FEI1, T_YU1 = 91.78, 92.34, 92.70
target_fei = (T_FEI1 - T_FEI0)
target_yu = (T_YU1 - T_FEI1)

f_fit = fit_syl(syl_fei, target_fei, 312, 252)
y_fit = fit_syl(syl_yu, target_yu, 277, 256)
print('fit', f_fit.shape[1] / sr, y_fit.shape[1] / sr)

# 拼接：25ms 交叉淡化
xf = int(0.025 * sr)
rise = np.sin(np.linspace(0, np.pi / 2, xf))
fall = np.cos(np.linspace(0, np.pi / 2, xf))
seg_len = f_fit.shape[1] + y_fit.shape[1]
seg = np.zeros((2, seg_len), dtype=np.float32)
seg[:, :f_fit.shape[1]] = f_fit
seg[:, f_fit.shape[1]:] = y_fit
a = f_fit.shape[1] - xf
seg[:, a:a + xf] = f_fit[:, -xf:] * fall + y_fit[:, :xf] * rise
# 头尾淡入淡出
seg[:, :xf] *= rise
seg[:, -xf:] *= fall

# 电平均衡：对齐原唱该句 RMS
s0 = int(T_FEI0 * sr)
s1 = int(T_YU1 * sr)
ref = voc[:, s0:s1]
rms_ref = np.sqrt(np.mean(ref ** 2))
rms_seg = np.sqrt(np.mean(seg ** 2)) + 1e-9
seg *= (rms_ref / rms_seg) * 1.02
print('rms ref/seg', rms_ref, rms_seg, 'gain', (rms_ref / rms_seg) * 1.02)

# 轻微空间混响（贴合原唱空间感）
rev_len = int(0.16 * sr)
decay = np.exp(-np.linspace(0, 5.0, rev_len))
decay /= decay.sum()
rev0 = np.convolve(seg[0], decay)[:seg.shape[1]]
rev1 = np.convolve(seg[1], np.roll(decay, int(0.004 * sr)))[:seg.shape[1]]
seg_wet = seg * 0.88 + np.stack([rev0, rev1]) * 0.12

# --- 只替换人声 stem ---
voc_new = voc.copy()
xf2 = xf
voc_new[:, s0:s0 + xf2] *= fall
voc_new[:, s1 - xf2:s1] *= rise
voc_new[:, s0 + xf2:s1 - xf2] = 0
voc_new[:, s0:s1] += seg_wet

sf.write('test_v5_chorus1_vocals.wav', voc_new[:, int(88 * sr):int(96 * sr)].T, sr)
mix = voc_new + inst
mix *= 0.9 / max(1e-9, np.max(np.abs(mix)))
sf.write('test_v5_chorus1_mix.wav', mix[:, int(88 * sr):int(96 * sr)].T, sr)

# --- 客观验收 ---
m = WhisperModel('base', device='cuda', compute_type='float16')
segs, _ = m.transcribe('test_v5_chorus1_vocals.wav', language='zh')
txt = ''.join(s.text for s in segs)
print('ASR(vocals):', txt.encode('utf-8'))
segs, _ = m.transcribe('test_v5_chorus1_mix.wav', language='zh')
print('ASR(mix):', ''.join(s.text for s in segs).encode('utf-8'))

# F0 检查
f0, _, _ = librosa.pyin(voc_new[0, s0:s1], fmin=150, fmax=900, sr=sr, frame_length=1024, hop_length=256)
f0v = f0[~np.isnan(f0)]
print('new f0 median', np.median(f0v) if len(f0v) else 0, 'range', (f0v.min(), f0v.max()) if len(f0v) else None)
print('DONE')
