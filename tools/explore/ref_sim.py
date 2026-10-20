# -*- coding: utf-8 -*-
"""参考音色相似度：把候选音色与 LMG 原唱做人声特征距离比较（音高分布 + 频谱包络 + 说话人嵌入）"""
import numpy as np, librosa, soundfile as sf, warnings
warnings.filterwarnings('ignore')
from resemblyzer import VoiceEncoder, preprocess_wav

enc = VoiceEncoder('cpu')

def emb(p, dur=40.0):
    y, _ = librosa.load(p, sr=16000, mono=True, duration=dur)
    e = enc.embed_utterance(preprocess_wav(y, source_sr=16000))
    return e/np.linalg.norm(e)

ref = emb('sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav')
cands = [
    ('Let Me Go 人声(参考自身)', 'sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav'),
    ('1分钟纯享版',              'build/lmg/BV1R5YL69EC5.wav'),
    ('小猪P 翻唱人声',           'sep_xzp/htdemucs/BV1JXJy65Eft/vocals.wav'),
    ('我们 MiMo 人声',           'sep_out/htdemucs/original_vocal/vocals.wav'),
]
for name, p in cands:
    e = emb(p)
    print(f'{name:26s} cos vs LMG = {float(np.dot(ref,e)):.4f}')
