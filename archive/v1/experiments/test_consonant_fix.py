import asyncio
import edge_tts
import librosa
import numpy as np
import soundfile as sf
import sys
from faster_whisper import WhisperModel

sr = 44100
model = WhisperModel('base', device='cuda', compute_type='float16')

async def gen_notes():
    # 完整保留辅音 f 和 y 的高清自然发音
    # rate=-10% 保持抒情歌唱的饱满拉长音
    c_fei = edge_tts.Communicate("肥", voice="zh-CN-XiaoyiNeural", pitch="+32Hz", rate="-12%")
    await c_fei.save("fei_full_cons.mp3")
    
    c_yu = edge_tts.Communicate("鱼", voice="zh-CN-XiaoyiNeural", pitch="+60Hz", rate="-15%")
    await c_yu.save("yu_full_cons.mp3")

asyncio.run(gen_notes())

y_f, _ = librosa.load("fei_full_cons.mp3", sr=sr, mono=False)
y_y, _ = librosa.load("yu_full_cons.mp3", sr=sr, mono=False)
if y_f.ndim == 1: y_f = np.stack([y_f, y_f])
if y_y.ndim == 1: y_y = np.stack([y_y, y_y])

# 从 0.00s 绝对从零开始提取! 绝不裁剪掉开头的唇齿辅音 [f]!
# 肥: 0.00s 到 0.50s (长 0.50s)
# 鱼: 0.00s 到 0.44s (长 0.44s)
f_take = y_f[:, :int(0.50 * sr)]
y_take = y_y[:, :int(0.44 * sr)]

# 中间 35ms Legato 连音交叉淡化
xf = int(0.035 * sr)
xf_out = np.cos(np.linspace(0, np.pi/2, xf))
xf_in = np.sin(np.linspace(0, np.pi/2, xf))

comb_len = f_take.shape[1] + y_take.shape[1] - xf
comb = np.zeros((2, comb_len), dtype=np.float32)

comb[:, :f_take.shape[1]] = f_take
comb[:, f_take.shape[1]-xf:f_take.shape[1]] *= xf_out
comb[:, f_take.shape[1]-xf:f_take.shape[1]] += y_take[:, :xf] * xf_in
comb[:, f_take.shape[1]:] = y_take[:, xf:]

# 保存并测试识别
sf.write("feiyu_full_cons.wav", comb.T, sr)
print(f"Crafted full-consonant Feiyu length: {comb.shape[1]/sr:.3f}s. Transcribing...")

segs, _ = model.transcribe("feiyu_full_cons.wav", language="zh", word_timestamps=True)
words = ' '.join([f'{w.word}[{w.start:.2f}-{w.end:.2f}]' for s in segs if s.words for w in s.words])
txt = ''.join([s.text for s in segs])
sys.stdout.buffer.write(f"Feiyu Audio Text: '{txt}'\nWords: {words}\n".encode('utf-8'))
