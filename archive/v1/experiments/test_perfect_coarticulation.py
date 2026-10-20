import asyncio
import edge_tts
import librosa
import numpy as np
import soundfile as sf
import sys
from faster_whisper import WhisperModel

sr = 44100
model = WhisperModel('base', device='cuda', compute_type='float16')

# 1. 重新生成慢速抒情流行乐节奏: feiyu_slow_phrase.mp3
async def main():
    c = edge_tts.Communicate("就像肥鱼爱大米", voice="zh-CN-XiaoyiNeural", pitch="+32Hz", rate="-36%")
    await c.save("feiyu_slow_phrase.mp3")

asyncio.run(main())

# 2. 读取原曲带人声版
y_vocal, _ = librosa.load('original_vocal.mp3', sr=sr, mono=False)
if y_vocal.ndim == 1: y_vocal = np.stack([y_vocal, y_vocal])

y_slow, _ = librosa.load('feiyu_slow_phrase.mp3', sr=sr, mono=False)
if y_slow.ndim == 1: y_slow = np.stack([y_slow, y_slow])

# 提取从 0.65s (包含 '像' 的收音) 到 1.32s (包含 '爱' 的起音), 长度刚好 0.67s
feiyu_phrase_segment = y_slow[:, int(0.65 * sr):int(1.32 * sr)]

# 原唱副歌中从 '像' 的尾音 (91.75s) 到 '爱' 的起音 (92.68s)
t_in = int(91.75 * sr)
t_out = int(92.68 * sr)
slot_len = t_out - t_in

# 极平滑伸缩
fl = librosa.effects.time_stretch(feiyu_phrase_segment[0], rate=feiyu_phrase_segment.shape[1]/slot_len)[:slot_len]
fr = librosa.effects.time_stretch(feiyu_phrase_segment[1], rate=feiyu_phrase_segment.shape[1]/slot_len)[:slot_len]
f_fit = np.stack([fl, fr])

# 能量匹配
ref_slice = y_vocal[:, t_in:t_out]
rms_ref = np.sqrt(np.mean(ref_slice**2))
rms_fit = np.sqrt(np.mean(f_fit**2)) + 1e-6
f_fit *= (rms_ref / rms_fit) * 1.15

# 混响卷积匹配
rev_len = int(0.18 * sr)
decay = np.exp(-np.linspace(0, 4.0, rev_len))
decay = decay / np.sum(decay)
rev_0 = np.convolve(f_fit[0], decay, mode='full')[:slot_len]
rev_1 = np.convolve(f_fit[1], np.roll(decay, int(0.003*sr)), mode='full')[:slot_len]
f_wet = f_fit * 0.85 + np.stack([rev_0, rev_1]) * 0.15

# 35ms 汉宁窗交叉淡化
fade_len = int(0.035 * sr)
fade_in = np.sin(np.linspace(0, np.pi/2, fade_len))
fade_out = np.cos(np.linspace(0, np.pi/2, fade_len))

f_wet[:, :fade_len] *= fade_in
f_wet[:, -fade_len:] *= fade_out

test_clip = y_vocal[:, int(88*sr):int(96*sr)].copy()
rel_s = t_in - int(88*sr)
rel_e = rel_s + slot_len

test_clip[:, rel_s:rel_s+fade_len] *= fade_out
test_clip[:, rel_e-fade_len:rel_e] *= fade_in
test_clip[:, rel_s+fade_len:rel_e-fade_len] = 0
test_clip[:, rel_s:rel_e] += f_wet

sf.write('test_perfect_coarticulation.wav', test_clip.T, sr)
print('Rendered test_perfect_coarticulation.wav! Transcribing...')

segs, _ = model.transcribe('test_perfect_coarticulation.wav', language='zh', word_timestamps=True)
rec = ' '.join([f'{w.word}[{w.start:.2f}-{w.end:.2f}]' for s in segs if s.words for w in s.words])
txt = ''.join([s.text for s in segs])
sys.stdout.buffer.write(f'ASR Text: {txt}\nWords: {rec}\n'.encode('utf-8'))
