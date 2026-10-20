# -*- coding: utf-8 -*-
"""母带里唱歌的到底是谁：MiMo TTS 还是杨臣刚原唱？"""
import numpy as np, librosa, warnings
warnings.filterwarnings('ignore')
from resemblyzer import VoiceEncoder, preprocess_wav
enc = VoiceEncoder('cpu')

def emb(p, a=None, b=None, dur=40.0):
    y, _ = librosa.load(p, sr=16000, mono=True, offset=a or 0, duration=(b-a) if (a and b) else dur)
    e = enc.embed_utterance(preprocess_wav(y, source_sr=16000))
    return e/np.linalg.norm(e)

pairs = [
    ('母带人声 88-128s',  emb('sep_master/htdemucs/feiyu_master_soundtrack/vocals.wav', 88, 128)),
    ('母带人声 180-220s', emb('sep_master/htdemucs/feiyu_master_soundtrack/vocals.wav', 180, 220)),
    ('原曲人声 88-128s',  emb('sep_out/htdemucs/original_vocal/vocals.wav', 88, 128)),
    ('MiMo take_t1',      emb('build/audio_takes/take_t1.wav')),
    ('MiMo 对白 intro',    emb('build/audio_takes/dialogue_intro.wav')),
    ('MiMo sing_syl_y1',  emb('build/audio_takes/sing_syl_y1.wav')),
]
print('%-22s' % '' + ''.join('%10s' % n[:8] for n,_ in pairs))
for a,ea in pairs:
    row = '%-22s' % a
    for b,eb in pairs: row += '%10.3f' % float(np.dot(ea,eb))
    print(row)
