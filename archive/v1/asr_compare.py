# -*- coding: utf-8 -*-
"""ASR 对比校验：旧母带 vs 转换后母带，歌词可懂度是否退化。
结果写入 build/svc/asr_report.txt（UTF-8），避免控制台乱码。
"""
import warnings, numpy as np, librosa
warnings.filterwarnings('ignore')
from faster_whisper import WhisperModel

model = WhisperModel('small', device='auto', compute_type='int8')
SEGS = [(28, 58), (88, 118), (150, 180), (190, 220), (240, 270)]
FILES = [('旧母带', 'build/feiyu_master_soundtrack.wav'),
         ('新母带', 'build/svc/final/feiyu_lmg_voice.wav')]

lines = []
for a, b in SEGS:
    lines.append(f'=== {a}-{b}s ===')
    for name, p in FILES:
        y, _ = librosa.load(p, sr=16000, mono=True, offset=a, duration=b - a)
        segs, _ = model.transcribe(y, language='zh', beam_size=5,
                                   initial_prompt='老鼠爱大米 我爱你爱着你 就像肥鱼爱大米 不管有多少风雨 我都会依然陪着你')
        lines.append(f'{name}: ' + ''.join(s.text for s in segs).strip())
    lines.append('')

with open('build/svc/asr_report.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('written build/svc/asr_report.txt')
