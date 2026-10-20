# -*- coding: utf-8 -*-
"""ASR 校验：转换后歌词是否还听得懂。
用法：python tools/asr_check.py <wav> <start_s> <end_s>
"""
import sys, warnings, numpy as np, librosa
warnings.filterwarnings('ignore')
from faster_whisper import WhisperModel

path = sys.argv[1]
seg_a, seg_b = float(sys.argv[2]), float(sys.argv[3])
y, _ = librosa.load(path, sr=16000, mono=True, offset=seg_a, duration=seg_b - seg_a)

model = WhisperModel('small', device='auto', compute_type='int8')
segments, info = model.transcribe(
    y, language='zh', beam_size=5,
    initial_prompt='老鼠爱大米 我爱你爱着你 就像肥鱼爱大米 不管有多少风雨 我都会依然陪着你',
)
text = ''.join(s.text for s in segments)
print('>>>', text.strip())
