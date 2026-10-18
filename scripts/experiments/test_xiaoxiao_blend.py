import librosa
import numpy as np
import soundfile as sf
import sys
from faster_whisper import WhisperModel

sr = 44100
model = WhisperModel('base', device='cuda', compute_type='float16')

# 1. 加载原曲香香版本
y_vocal, _ = librosa.load('original_vocal.mp3', sr=sr, mono=False)
if y_vocal.ndim == 1: y_vocal = np.stack([y_vocal, y_vocal])

# 2. 加载发音极清晰的 xiaoxiao_phonetic: test_v_xiaoxiao_phonetic.mp3
y_xx, _ = librosa.load('test_v_xiaoxiao_phonetic.mp3', sr=sr, mono=False)
if y_xx.ndim == 1: y_xx = np.stack([y_xx, y_xx])

# 切出完整乐句: 0.00s 到 1.95s (涵盖 "就像飞鱼艾大米")
phrase_clip = y_xx[:, :int(1.95 * sr)]

# 原唱副歌 1 中 "就像老鼠爱大米" 的黄金起止区间:
# 90.72s (就 的起始气口) 到 94.10s (米 的自然颤音尾韵收口)
# 长度 3.38s
t0, t1 = 90.72, 94.10
s_idx = int(t0 * sr)
e_idx = int(t1 * sr)
slot_len = e_idx - s_idx

# 做高保真时间伸缩 (从 1.95s 舒展到 3.38s, 成为饱满悠扬的抒情慢歌)
fl = librosa.effects.time_stretch(phrase_clip[0], rate=phrase_clip.shape[1]/slot_len)[:slot_len]
fr = librosa.effects.time_stretch(phrase_clip[1], rate=phrase_clip.shape[1]/slot_len)[:slot_len]
p_fit = np.stack([fl, fr])

# 音高微调: 向上平移 1.5 个半音，完全吻合香香版 Eb 调副歌主旋律 (1 2 3 5 3 2 1)
p_fit[0] = librosa.effects.pitch_shift(p_fit[0], sr=sr, n_steps=1.5)
p_fit[1] = librosa.effects.pitch_shift(p_fit[1], sr=sr, n_steps=1.5)

# 动态能量匹配
ref_slice = y_vocal[:, s_idx:e_idx]
rms_ref = np.sqrt(np.mean(ref_slice**2))
rms_fit = np.sqrt(np.mean(p_fit**2)) + 1e-6
p_fit *= (rms_ref / rms_fit) * 1.10

# 混响卷积处理: 增加 12% 模拟录音室板式混响
rev_len = int(0.20 * sr)
decay = np.exp(-np.linspace(0, 4.0, rev_len))
decay = decay / np.sum(decay)
rev_0 = np.convolve(p_fit[0], decay, mode='full')[:slot_len]
rev_1 = np.convolve(p_fit[1], np.roll(decay, int(0.003*sr)), mode='full')[:slot_len]
p_wet = p_fit * 0.88 + np.stack([rev_0, rev_1]) * 0.12

# 45ms 汉宁窗等能量平滑淡入淡出 (在 90.72s 气口和 94.10s 呼吸间隙无痕接驳)
fade_len = int(0.045 * sr)
fade_in = np.sin(np.linspace(0, np.pi/2, fade_len))
fade_out = np.cos(np.linspace(0, np.pi/2, fade_len))

p_wet[:, :fade_len] *= fade_in
p_wet[:, -fade_len:] *= fade_out

# 拼入 88.0s ~ 96.0s 完整副歌前半乐句
test_out = y_vocal[:, int(88*sr):int(96*sr)].copy()
rel_s = s_idx - int(88*sr)
rel_e = rel_s + slot_len

test_out[:, rel_s:rel_s+fade_len] *= fade_out
test_out[:, rel_e-fade_len:rel_e] *= fade_in
test_out[:, rel_s+fade_len:rel_e-fade_len] = 0
test_out[:, rel_s:rel_e] += p_wet

sf.write('test_xiaoxiao_chorus1.wav', test_out.T, sr)
print('Saved test_xiaoxiao_chorus1.wav! Transcribing...')

segs, _ = model.transcribe('test_xiaoxiao_chorus1.wav', language='zh', word_timestamps=True)
words = ' '.join([f'{w.word}[{w.start+88.0:.2f}-{w.end+88.0:.2f}]' for s in segs if s.words for w in s.words])
txt = ''.join([s.text for s in segs])
sys.stdout.buffer.write(f'ASR Text: {txt}\nWords: {words}\n'.encode('utf-8'))
