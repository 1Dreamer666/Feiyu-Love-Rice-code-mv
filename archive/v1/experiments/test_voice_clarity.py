import asyncio
import edge_tts
import sys
from faster_whisper import WhisperModel
import librosa

voices = [
    ("xiaoyi", "zh-CN-XiaoyiNeural", "就像肥鱼爱大米"),
    ("xiaoxiao", "zh-CN-XiaoxiaoNeural", "就像肥鱼爱大米"),
    ("hsiaochen", "zh-TW-HsiaoChenNeural", "就像肥鱼爱大米"),
    ("xiaoyi_phonetic", "zh-CN-XiaoyiNeural", "就像飞鱼爱大米"),
    ("xiaoxiao_phonetic", "zh-CN-XiaoxiaoNeural", "就像飞鱼爱大米"),
    ("xiaoxiao_lyric", "zh-CN-XiaoxiaoNeural", "我爱你，就像肥鱼爱大米。"),
]

async def gen_all():
    for name, v, text in voices:
        c = edge_tts.Communicate(text, voice=v, pitch="+25Hz", rate="-25%")
        await c.save(f"test_v_{name}.mp3")

asyncio.run(gen_all())

model = WhisperModel('base', device='cuda', compute_type='float16')
print("=== Voice candidates clarity test ===")
for name, v, text in voices:
    fn = f"test_v_{name}.mp3"
    segs, _ = model.transcribe(fn, language='zh', word_timestamps=True)
    words = []
    txts = []
    for s in segs:
        txts.append(s.text)
        if s.words:
            for w in s.words:
                words.append(f"{w.word}[{w.start:.2f}-{w.end:.2f}]")
    w_str = ' '.join(words)
    dur = librosa.get_duration(path=fn)
    sys.stdout.buffer.write(f"[{name:18s} | dur={dur:.2f}s]: {''.join(txts)}\n    Words: {w_str}\n".encode('utf-8'))
