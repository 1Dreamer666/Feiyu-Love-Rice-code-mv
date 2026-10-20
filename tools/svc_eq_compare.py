# -*- coding: utf-8 -*-
"""对比 EQ 前后人声与参考音色的接近度，判断均衡是否帮了倒忙。"""
import numpy as np, librosa, warnings
warnings.filterwarnings('ignore')
from resemblyzer import VoiceEncoder, preprocess_wav

enc = VoiceEncoder('cpu')


def emb(p, off, dur=30.0):
    y, _ = librosa.load(p, sr=16000, mono=True, offset=off, duration=dur)
    e = enc.embed_utterance(preprocess_wav(y, source_sr=16000))
    return e / np.linalg.norm(e)


files = [
    ('LMG 参考人声',        'sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav'),
    ('EQ 前（SVC 输出）',   'build/svc/out_full/vc_source_full_288s_target_lmg_40s_1.0_30_0.7.wav'),
    ('EQ 后（SVC 输出）',   'build/svc/out_full/vocal_eq.wav'),
    ('旧母带整轨',          'build/feiyu_master_soundtrack.wav'),
    ('新母带整轨',          'build/svc/final/feiyu_lmg_voice.wav'),
]

SEGS = [(40, 70), (70, 100), (100, 130), (160, 190), (190, 220), (220, 250), (250, 280)]
ref = emb(files[0][1], 2)
print(f'{"音轨":<22s}' + ''.join(f'{a:>9d}s' for a, _ in SEGS) + f'{"  均值":>9s}')
for name, p in files[1:]:
    vals = [float(np.dot(ref, emb(p, a))) for a, _ in SEGS]
    print(f'{name:<22s}' + ''.join(f'{v:10.3f}' for v in vals) + f'{np.mean(vals):10.3f}')
