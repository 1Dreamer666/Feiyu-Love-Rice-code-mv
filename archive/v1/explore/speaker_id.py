# -*- coding: utf-8 -*-
"""用 d-vector 说话人嵌入判断几个音轨是否同一"声线"。"""
import numpy as np, librosa, warnings
warnings.filterwarnings('ignore')
from resemblyzer import VoiceEncoder, preprocess_wav

enc = VoiceEncoder('cpu')

def emb(path, dur=60.0, sr=16000):
    y, _ = librosa.load(path, sr=sr, mono=True, duration=dur)
    wav = preprocess_wav(y, source_sr=sr)
    e = enc.embed_utterance(wav)
    return e / np.linalg.norm(e)

files = [
    ('LMG 原唱(Let Me Go)',      'sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav'),
    ('1分钟纯享(星落落_oi)',      'build/lmg/BV1R5YL69EC5.wav'),
    ('小猪P 翻唱(去伴奏)',        'sep_xzp/htdemucs/BV1JXJy65Eft/vocals.wav'),
    ('我们 老鼠爱大米 人声',      'sep_out/htdemucs/original_vocal/vocals.wav'),
]
E = {}
for name, p in files:
    E[name] = emb(p)
    print(f'{name:26s} done')

names = list(E)
print('\n=== 余弦相似度 ===')
print('%-26s' % '' + ''.join('%14s' % n[:12] for n in names))
for a in names:
    row = '%-26s' % a[:24]
    for b in names:
        row += '%14.4f' % float(np.dot(E[a], E[b]))
    print(row)
