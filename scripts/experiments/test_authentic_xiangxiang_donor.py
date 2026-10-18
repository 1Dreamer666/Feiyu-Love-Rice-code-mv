import librosa
import numpy as np
import soundfile as sf
import sys
from faster_whisper import WhisperModel

sr = 44100
model = WhisperModel('base', device='cuda', compute_type='float16')

# 1. 加载 original_vocal.mp3
y, _ = librosa.load('original_vocal.mp3', sr=sr, mono=False)
if y.ndim == 1: y = np.stack([y, y])

# 提取香香原声素材:
# A. '风' 的开头 [f] 唇齿擦音: 96.40s ~ 96.52s (120ms)
f_onset = y[:, int(96.40*sr):int(96.52*sr)]

# B. '陪' 的核心元音 [ei]: 99.85s ~ 100.20s (350ms)
ei_body = y[:, int(99.85*sr):int(100.20*sr)]

# C. '雨' 的原声音节 [y-ü]: 97.14s ~ 97.66s (520ms)
yu_body = y[:, int(97.14*sr):int(97.66*sr)]

# 拼接 '肥' [f] + [ei]:
# 30ms 交叉平滑过渡
xf_f = int(0.030 * sr)
xf_out = np.cos(np.linspace(0, np.pi/2, xf_f))
xf_in = np.sin(np.linspace(0, np.pi/2, xf_f))

fei_len = f_onset.shape[1] + ei_body.shape[1] - xf_f
fei_comb = np.zeros((2, fei_len), dtype=np.float32)
fei_comb[:, :f_onset.shape[1]] = f_onset
fei_comb[:, f_onset.shape[1]-xf_f:f_onset.shape[1]] *= xf_out
fei_comb[:, f_onset.shape[1]-xf_f:f_onset.shape[1]] += ei_body[:, :xf_f] * xf_in
fei_comb[:, f_onset.shape[1]:] = ei_body[:, xf_f:]

# 音高微调:
# 原唱副歌中: '老'(G4: 392Hz), '鼠'(Bb4: 466Hz)
# 香香的 '陪' 大约在 Eb4~F4，轻微上移 2 个半音至 G4
# 香香的 '雨' 大约在 G4，轻微上移 2 个半音至 Bb4
fei_tuned = np.stack([
    librosa.effects.pitch_shift(fei_comb[0], sr=sr, n_steps=2.0),
    librosa.effects.pitch_shift(fei_comb[1], sr=sr, n_steps=2.0)
])

yu_tuned = np.stack([
    librosa.effects.pitch_shift(yu_body[0], sr=sr, n_steps=2.0),
    librosa.effects.pitch_shift(yu_body[1], sr=sr, n_steps=2.0)
])

# 连音拼接 '肥' (0.45s) -> '鱼' (0.45s)
f_trim = fei_tuned[:, :int(0.45 * sr)]
y_trim = yu_tuned[:, :int(0.45 * sr)]

xf_m = int(0.040 * sr) # 40ms 连音 Legato
xf_m_out = np.cos(np.linspace(0, np.pi/2, xf_m))
xf_m_in = np.sin(np.linspace(0, np.pi/2, xf_m))

feiyu_sing = np.zeros((2, f_trim.shape[1] + y_trim.shape[1] - xf_m), dtype=np.float32)
feiyu_sing[:, :f_trim.shape[1]] = f_trim
feiyu_sing[:, f_trim.shape[1]-xf_m:f_trim.shape[1]] *= xf_m_out
feiyu_sing[:, f_trim.shape[1]-xf_m:f_trim.shape[1]] += y_trim[:, :xf_m] * xf_m_in
feiyu_sing[:, f_trim.shape[1]:] = y_trim[:, xf_m:]

# 目标替换区间: 91.75s ~ 92.68s (长 0.93s)
target_len = int(0.93 * sr)
fit_l = librosa.effects.time_stretch(feiyu_sing[0], rate=feiyu_sing.shape[1]/target_len)[:target_len]
fit_r = librosa.effects.time_stretch(feiyu_sing[1], rate=feiyu_sing.shape[1]/target_len)[:target_len]
feiyu_fit = np.stack([fit_l, fit_r])

# 能量匹配
ref_mouse = y[:, int(91.75*sr):int(91.75*sr)+target_len]
rms_ref = np.sqrt(np.mean(ref_mouse**2))
rms_fit = np.sqrt(np.mean(feiyu_fit**2)) + 1e-6
feiyu_fit *= (rms_ref / rms_fit) * 1.02

# 30ms 交叉淡化
fade_s = int(0.030 * sr)
fade_in = np.sin(np.linspace(0, np.pi/2, fade_s))
fade_out = np.cos(np.linspace(0, np.pi/2, fade_s))

feiyu_fit[:, :fade_s] *= fade_in
feiyu_fit[:, -fade_s:] *= fade_out

# 拼入 88.0s ~ 96.0s 测试切片
test_clip = y[:, int(88*sr):int(96*sr)].copy()
rel_s = int((91.75 - 88.0) * sr)
rel_e = rel_s + target_len

test_clip[:, rel_s:rel_s+fade_s] *= fade_out
test_clip[:, rel_e-fade_s:rel_e] *= fade_in
test_clip[:, rel_s+fade_s:rel_e-fade_s] = 0
test_clip[:, rel_s:rel_e] += feiyu_fit

sf.write('test_authentic_donor_chorus.wav', test_clip.T, sr)
print('Saved test_authentic_donor_chorus.wav! Transcribing...')

segs, _ = model.transcribe('test_authentic_donor_chorus.wav', language='zh', word_timestamps=True)
rec = ' '.join([f'{w.word}[{w.start:.2f}-{w.end:.2f}]' for s in segs if s.words for w in s.words])
txt = ''.join([s.text for s in segs])
sys.stdout.buffer.write(f'ASR Text: {txt}\nWords: {rec}\n'.encode('utf-8'))
