# -*- coding: utf-8 -*-
"""准备 Seed-VC 的 source（我们的人声）与 target（Let Me Go 参考音色）"""
import soundfile as sf, numpy as np, librosa, os
os.makedirs('build/svc', exist_ok=True)

# 1) target：Let Me Go 人声里最干净的一段
x, sr = sf.read('sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav', dtype='float32')
if x.ndim > 1: x = x.mean(1)
ref = x[int(2*44100):int(22*44100)]
sf.write('build/svc/target_lmg.wav', ref, 44100)
print('target_lmg.wav', round(len(ref)/44100, 2), 's')

# 2) source：我们 88-108s 副歌人声（去掉首尾静音）
v, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=44100, mono=True)
src = v[int(88*44100):int(108*44100)]
src, _ = librosa.effects.trim(src, top_db=30)
sf.write('build/svc/source_chorus20s.wav', src, 44100)
print('source_chorus20s.wav', round(len(src)/44100, 2), 's')
