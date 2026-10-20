import json, urllib.request, base64, os
import numpy as np, librosa, soundfile as sf
from faster_whisper import WhisperModel


def _load_env():
    """从项目根目录 .env 读取 MIMO_API_KEY（.env 已被 .gitignore 忽略）。"""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    path = os.path.join(root, '.env')
    if not os.path.isfile(path):
        return
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_env()

API = os.environ.get('MIMO_API_KEY', '')
if not API:
    raise SystemExit('缺少 MIMO_API_KEY：请复制 .env.example 为 .env 并填入密钥。')
URL = os.environ.get('MIMO_BASE_URL', 'https://api.xiaomimimo.com/v1').rstrip('/') + '/chat/completions'
SR = 44100

SONG_NOTES = np.array([277, 311, 311, 277, 277, 349, 415], dtype=float)
SONG_BOUNDS = [(90.82, 91.38), (91.38, 91.78), (91.78, 92.34), (92.34, 92.70),
               (92.70, 93.20), (93.20, 93.62), (93.62, 94.10)]

variants = [
    ('t1', '清亮甜美的少女歌声，像流行歌曲副歌一样明亮上扬，咬字清晰。', '(唱歌)就像肥鱼爱大米', '冰糖'),
    ('t2', '甜美少女歌声，中低音区温柔起句，句尾轻轻上扬。', '(唱歌)就像肥鱼爱大米', '冰糖'),
    ('t3', '活泼俏皮的少女歌声，节奏轻快，咬字清楚。', '(唱歌)就像肥鱼爱大米', '冰糖'),
    ('t4', '清亮甜美的少女歌声，抒情慢速，长音连贯。', '(唱歌)就像肥鱼爱大米', '茉莉'),
    ('t5', '温暖清澈的女声，像童谣一样简单干净。', '(唱歌)就像肥鱼爱大米', '茉莉'),
    ('t6', '甜美少女歌声，音域集中在中音，句尾不要飙高。', '(唱歌)就像肥鱼爱大米', '冰糖'),
    ('t7', '清亮少女歌声，轻快有弹性，像在哼小调。', '(唱歌)就像肥鱼爱大米', '冰糖'),
    ('t8', '温柔甜美的少女歌声，平稳叙述感。', '(唱歌)就像肥鱼爱大米', '冰糖'),
]

def gen(tag, user, assist, voice):
    payload = {'model': 'mimo-v2.5-tts',
               'messages': [{'role': 'user', 'content': user}, {'role': 'assistant', 'content': assist}],
               'audio': {'format': 'wav', 'voice': voice}}
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(), headers={
        'Content-Type': 'application/json', 'Authorization': f'Bearer {API}'})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode())
    fn = f'take_{tag}.wav'
    open(fn, 'wb').write(base64.b64decode(d['choices'][0]['message']['audio']['data']))
    return fn

m = WhisperModel('base', device='cuda', compute_type='float16')

def evaluate(fn):
    y, _ = librosa.load(fn, sr=SR, mono=True)
    dur = len(y) / SR
    segs, _ = m.transcribe(fn, language='zh', word_timestamps=True)
    words = []
    txt = ''
    for s in segs:
        txt += s.text
        for w in s.words:
            words.append((w.start, w.end, w.word))
    f0, _, _ = librosa.pyin(y, fmin=120, fmax=900, sr=SR, frame_length=1470, hop_length=441)
    t = librosa.times_like(f0, sr=SR, hop_length=441)
    notes = []
    for a, b, _w in words:
        mask = (t >= a) & (t < b) & ~np.isnan(f0)
        notes.append(float(np.median(f0[mask])) if mask.sum() else 0.0)
    # 只保留有声字的音高
    notes = [n for n in notes if n > 0]
    best = (999, 0)
    if len(notes) >= 5:
        arr = np.array(notes[:7])
        ref = SONG_NOTES[:len(arr)]
        for s in np.arange(-5, 5.01, 0.5):
            err = np.sqrt(np.mean((12 * np.log2(arr * 2 ** (s / 12) / ref)) ** 2))
            if err < best[0]:
                best = (err, s)
    return dict(file=fn, dur=dur, text=txt, words=words, notes=notes,
                err=best[0], shift=best[1])

results = []
for tag, user, assist, voice in variants:
    try:
        fn = gen(tag, user, assist, voice)
        r = evaluate(fn)
        results.append(r)
        print(f"{tag} dur={r['dur']:.2f} notes={[round(n) for n in r['notes']]} "
              f"err={r['err']:.2f}st shift={r['shift']:+.1f} ASR={r['text']}", flush=True)
    except Exception as e:
        print('ERR', tag, e, flush=True)

results.sort(key=lambda r: r['err'])
with open('take_eval.txt', 'w', encoding='utf-8') as f:
    for r in results:
        f.write(f"{r['file']} err={r['err']:.2f} shift={r['shift']:+.1f} dur={r['dur']:.2f} "
                f"notes={[round(n) for n in r['notes']]} text={r['text']}\n")
print('BEST', results[0]['file'] if results else None)
