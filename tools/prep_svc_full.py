# -*- coding: utf-8 -*-
"""准备全曲 SVC 素材：source = 我们母带里的 MiMo 人声，target = Let Me Go 音色"""
import soundfile as sf, numpy as np, librosa, os
os.makedirs('build/svc', exist_ok=True)

# source：母带人声 stem（288s）
x, sr = sf.read('sep_master/htdemucs/feiyu_master_soundtrack/vocals.wav', dtype='float32')
if x.ndim > 1: x = x.mean(1)
sf.write('build/svc/source_full_288s.wav', x, sr)
print('source_full_288s.wav', round(len(x)/sr, 2), 's', sr)

# target：LMG 人声 2-42s（最干净、有声比例最高的一段）
t, tsr = sf.read('sep_lmg/htdemucs/BV1XbY66nEWr/vocals.wav', dtype='float32')
if t.ndim > 1: t = t.mean(1)
ref = t[int(2*tsr):int(42*tsr)]
sf.write('build/svc/target_lmg_40s.wav', ref, tsr)
print('target_lmg_40s.wav', round(len(ref)/tsr, 2), 's', tsr)

# 保存伴奏 stem 供重混
inst, isr = sf.read('sep_master/htdemucs/feiyu_master_soundtrack/no_vocals.wav', dtype='float32')
if inst.ndim == 1: inst = np.stack([inst, inst], 1)
sf.write('build/svc/inst_288s.wav', inst, isr)
print('inst_288s.wav', inst.shape, isr)
