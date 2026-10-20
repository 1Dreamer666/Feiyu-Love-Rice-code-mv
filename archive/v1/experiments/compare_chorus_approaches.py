import asyncio
import edge_tts
import librosa
import numpy as np
import soundfile as sf
import sys
from faster_whisper import WhisperModel

sr = 44100
model = WhisperModel('base', device='cuda', compute_type='float16')

# 1. 确保所需的高清发音素材直接生成好
async def prepare_materials():
    c1 = edge_tts.Communicate("肥鱼", voice="zh-CN-XiaoyiNeural", pitch="+45Hz", rate="-10%")
    await c1.save("feiyu_param_pitch.mp3")
    
    c2 = edge_tts.Communicate("就像肥鱼爱大米", voice="zh-CN-XiaoyiNeural", pitch="+30Hz", rate="-30%")
    await c2.save("feiyu_slow_phrase.mp3")

asyncio.run(prepare_materials())

# 加载 original_vocal (88.0s ~ 102.0s, 副歌前半段完整14秒)
t_s = 88.0
t_dur = 14.0
y_voc, _ = librosa.load('original_vocal.mp3', sr=sr, offset=t_s, duration=t_dur, mono=False)
if y_voc.ndim == 1: y_voc = np.stack([y_voc, y_voc])

# 方案 1: 双声部和声融合 (Dual-Voice Ducking & Blend)
# 保留香香原唱底层 (-6dB 避让), 顶层以立体声突出发音清晰的 "肥鱼"
y_feiyu, _ = librosa.load('feiyu_param_pitch.mp3', sr=sr, mono=False)
if y_feiyu.ndim == 1: y_feiyu = np.stack([y_feiyu, y_feiyu])
feiyu_clip = y_feiyu[:, :int(0.68 * sr)]

s_in = int((91.76 - t_s) * sr)
s_out = int((92.68 - t_s) * sr)
s_len = s_out - s_in

fl = librosa.effects.time_stretch(feiyu_clip[0], rate=feiyu_clip.shape[1]/s_len)[:s_len]
fr = librosa.effects.time_stretch(feiyu_clip[1], rate=feiyu_clip.shape[1]/s_len)[:s_len]
f_fit = np.stack([fl, fr])

fade_s = int(0.02 * sr)
f_in = np.sin(np.linspace(0, np.pi/2, fade_s))
f_out = np.cos(np.linspace(0, np.pi/2, fade_s))

f_fit[:, :fade_s] *= f_in
f_fit[:, -fade_s:] *= f_out

duck = np.ones(s_len)
duck[:fade_s] = np.linspace(1.0, 0.20, fade_s)
duck[-fade_s:] = np.linspace(0.20, 1.0, fade_s)
duck[fade_s:-fade_s] = 0.20

v1 = y_voc.copy()
v1[:, s_in:s_out] = v1[:, s_in:s_out] * duck + f_fit * 1.35
sf.write('test_approach_1.wav', v1.T, sr)

# 方案 2: 整句 '就像肥鱼爱大米' 连贯置换 (从 90.70s 到 94.10s)
y_slow, _ = librosa.load('feiyu_slow_phrase.mp3', sr=sr, mono=False)
if y_slow.ndim == 1: y_slow = np.stack([y_slow, y_slow])

full_phrase = y_slow[:, :int(2.15 * sr)]
phrase_start = int((90.70 - t_s) * sr)
phrase_end = int((94.10 - t_s) * sr)
phrase_len = phrase_end - phrase_start

p_l = librosa.effects.time_stretch(full_phrase[0], rate=full_phrase.shape[1]/phrase_len)[:phrase_len]
p_r = librosa.effects.time_stretch(full_phrase[1], rate=full_phrase.shape[1]/phrase_len)[:phrase_len]
p_fit = np.stack([p_l, p_r])

rms_p = np.sqrt(np.mean(y_voc[:, phrase_start:phrase_end]**2))
rms_fit = np.sqrt(np.mean(p_fit**2)) + 1e-6
p_fit *= (rms_p / rms_fit) * 1.15

xf_p = int(0.04 * sr)
p_fit[:, :xf_p] *= np.sin(np.linspace(0, np.pi/2, xf_p))
p_fit[:, -xf_p:] *= np.cos(np.linspace(0, np.pi/2, xf_p))

v2 = y_voc.copy()
v2[:, phrase_start:phrase_start+xf_p] *= np.cos(np.linspace(0, np.pi/2, xf_p))
v2[:, phrase_end-xf_p:phrase_end] *= np.sin(np.linspace(0, np.pi/2, xf_p))
v2[:, phrase_start+xf_p:phrase_end-xf_p] = 0
v2[:, phrase_start:phrase_end] += p_fit
sf.write('test_approach_2.wav', v2.T, sr)

print("Both approaches rendered! Running Whisper ASR...")
for name, fn in [("Approach 1 (Dual-Voice Ducking)", "test_approach_1.wav"), ("Approach 2 (Full Phrase Legato)", "test_approach_2.wav")]:
    segs, _ = model.transcribe(fn, language='zh', word_timestamps=True)
    rec = ' '.join([f'{w.word}[{w.start:.2f}-{w.end:.2f}]' for s in segs if s.words for w in s.words])
    txt = ''.join([s.text for s in segs])
    sys.stdout.buffer.write(f"\n=== {name} ===\nText: {txt}\nWords: {rec}\n".encode('utf-8'))
