import asyncio
import edge_tts
import urllib.request
import json
import base64
import librosa
import numpy as np
import soundfile as sf
import sys
import os
from scipy.signal import butter, sosfilt

# ---- 从项目根目录的 .env 读取密钥（.env 不入库，见 .gitignore）----
def _load_env():
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

sr = 44100
total_dur = 288.0
total_samples = int(total_dur * sr)

print("Step 1: Generating high quality whale dialogues (MiMo)...")
api_key = os.environ.get('MIMO_API_KEY', '')
if not api_key:
    raise SystemExit('缺少 MIMO_API_KEY：请复制 .env.example 为 .env 并填入密钥。')
url = os.environ.get('MIMO_BASE_URL', 'https://api.xiaomimimo.com/v1').rstrip('/') + '/chat/completions'

dialogues = [
    ('dialogue_intro.wav', 
     '角色：你是DeepSeek社区二创形象“鲸鱼娘·大肥鱼（深深）”，可爱蓝发女仆小鲸鱼。嗓音清脆甜美。性格贪吃、嘴硬、偶尔偷懒，但关键时刻非常认真可靠。\n场景：清晨阳光照进木屋，大肥鱼先迷糊撒娇，随后闻到刚出锅的柴火大米饭浓香，瞬间开心欢呼。声音干净清脆。',
     '(俏皮)唔，再让我偷懒五分钟嘛，梦里全都是热乎乎的大白米饭呢。哇，好香呀，是刚出锅的柴火大米饭！只要碗里还有热乎乎的白饭，今天本鱼也是最可靠的一天！'),
    
    ('dialogue_interlude.wav',
     '角色：你是DeepSeek社区二创形象“鲸鱼娘·大肥鱼（深深）”，可爱蓝发女仆小鲸鱼。\n场景：间奏可爱独白：先傲娇抗议别人叫自己大肥鱼，随后得意欢呼自己秒解算法难题。声音清亮无杂音。',
     '(俏皮)唔，谁是大肥鱼呀！不许叫我大肥鱼，这明明是蓬松的头发和双层裙撑！哼哼，搞定啦，这种复杂推理小问题，怎么可能难倒本鱼？快奖励我一大碗热白饭！'),
    
    ('dialogue_outro.wav',
     '角色：你是DeepSeek社区二创形象“鲸鱼娘·大肥鱼（深深）”，贪吃又深情的可爱小鲸鱼娘。\n场景：全片最高潮副歌收尾，温柔而深情地把心爱的大米饭分给对方。',
     '喏，分你一半白饭，本鱼会一直一直陪着你的！')
]

for fn, sys_p, txt in dialogues:
    payload = {
        'model': 'mimo-v2.5-tts',
        'messages': [
            {'role': 'user', 'content': sys_p},
            {'role': 'assistant', 'content': txt}
        ],
        'audio': {'format': 'wav', 'voice': '冰糖'}
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            b64 = data['choices'][0]['message']['audio']['data']
            with open(fn, 'wb') as f:
                f.write(base64.b64decode(b64))
            print(f"  [OK] Generated {fn}")
    except Exception as e:
        print(f"  [Error] {fn}: {e}")

print("Step 2: Generating full legato phrase '就像肥鱼爱大米' (Edge-TTS Xiaoyi)...")
async def gen_phrase():
    c = edge_tts.Communicate("就像肥鱼爱大米", voice="zh-CN-XiaoyiNeural", pitch="+30Hz", rate="-30%")
    await c.save("feiyu_slow_phrase.mp3")

asyncio.run(gen_phrase())
print("  [OK] feiyu_slow_phrase.mp3 ready")

print("Step 3: Loading original vocal track...")
y_vocal, _ = librosa.load('original_vocal.mp3', sr=sr, mono=False)
if y_vocal.ndim == 1: y_vocal = np.stack([y_vocal, y_vocal])

y_master = np.zeros((2, total_samples), dtype=np.float32)
orig_take = min(y_vocal.shape[1], total_samples)
y_master[:, :orig_take] = y_vocal[:, :orig_take]

# 尾部 3.5 秒自然淡出
fadeout_len = int(3.5 * sr)
fadeout_curve = np.cos(np.linspace(0, np.pi/2, fadeout_len)) ** 2
y_master[:, total_samples - fadeout_len:] *= fadeout_curve

print("Step 4: Executing full phrase Legato inpainting for all 3 choruses...")
y_slow, _ = librosa.load('feiyu_slow_phrase.mp3', sr=sr, mono=False)
if y_slow.ndim == 1: y_slow = np.stack([y_slow, y_slow])
full_phrase = y_slow[:, :int(2.15 * sr)]

chorus_slots = [
    (90.65, 94.10),   # 副歌 1
    (210.65, 214.10), # 副歌 2
    (242.35, 245.85)  # 副歌 3
]

xf_len = int(0.040 * sr) # 40ms 汉宁窗等能量交叉淡化
xf_in = np.sin(np.linspace(0, np.pi/2, xf_len))
xf_out = np.cos(np.linspace(0, np.pi/2, xf_len))

for idx, (t0, t1) in enumerate(chorus_slots):
    s_idx = int(t0 * sr)
    e_idx = int(t1 * sr)
    p_len = e_idx - s_idx
    
    p_l = librosa.effects.time_stretch(full_phrase[0], rate=full_phrase.shape[1]/p_len)[:p_len]
    p_r = librosa.effects.time_stretch(full_phrase[1], rate=full_phrase.shape[1]/p_len)[:p_len]
    p_fit = np.stack([p_l, p_r])
    
    ref_slice = y_master[:, s_idx:e_idx]
    rms_ref = np.sqrt(np.mean(ref_slice**2))
    rms_fit = np.sqrt(np.mean(p_fit**2)) + 1e-6
    p_fit *= (rms_ref / rms_fit) * 1.15
    
    rev_len = int(0.18 * sr)
    decay = np.exp(-np.linspace(0, 4.0, rev_len))
    decay = decay / np.sum(decay)
    rev_0 = np.convolve(p_fit[0], decay, mode='full')[:p_len]
    rev_1 = np.convolve(p_fit[1], np.roll(decay, int(0.003*sr)), mode='full')[:p_len]
    p_wet = p_fit * 0.90 + np.stack([rev_0, rev_1]) * 0.10
    
    p_wet[:, :xf_len] *= xf_in
    p_wet[:, -xf_len:] *= xf_out
    
    y_master[:, s_idx:s_idx+xf_len] *= xf_out
    y_master[:, e_idx-xf_len:e_idx] *= xf_in
    y_master[:, s_idx+xf_len:e_idx-xf_len] = 0
    y_master[:, s_idx:e_idx] += p_wet
    print(f"  [OK] Chorus {idx+1} seamlessly replaced at {t0:.2f}s - {t1:.2f}s")

print("Step 5: Mixing dialogues with dynamic sidechain ducking...")
dialogue_configs = [
    ('dialogue_intro.wav', 6.0, 1.00, 0.50),
    ('dialogue_interlude.wav', 123.5, 1.00, 0.45),
    ('dialogue_outro.wav', 274.0, 1.00, 0.55)
]

for d_file, t_start, d_gain, bgm_duck_level in dialogue_configs:
    d_raw, _ = librosa.load(d_file, sr=sr, mono=False)
    if d_raw.ndim == 1: d_raw = np.stack([d_raw, d_raw])
    
    sos_hp = butter(2, 85, btype='highpass', fs=sr, output='sos')
    d_clean = np.stack([
        sosfilt(sos_hp, d_raw[0]),
        sosfilt(sos_hp, d_raw[1])
    ]) * d_gain
    
    d_len = d_clean.shape[1]
    s_idx = int(t_start * sr)
    e_idx = s_idx + d_len
    
    if e_idx > total_samples:
        d_len = total_samples - s_idx
        d_clean = d_clean[:, :d_len]
        e_idx = total_samples
        
    duck_in_len = int(0.3 * sr)
    duck_out_len = int(0.4 * sr)
    duck_curve = np.ones(d_len, dtype=np.float32) * bgm_duck_level
    duck_curve[:duck_in_len] = np.linspace(1.0, bgm_duck_level, duck_in_len)
    duck_curve[-duck_out_len:] = np.linspace(bgm_duck_level, 1.0, duck_out_len)
    
    y_master[:, s_idx:e_idx] = y_master[:, s_idx:e_idx] * duck_curve + d_clean
    print(f"  [OK] Mixed {d_file} at {t_start:.1f}s")

print("Step 6: Master Peak Normalization (-0.45 dBFS)...")
peak_val = np.max(np.abs(y_master))
print(f"  Raw Peak: {peak_val:.3f}")
target_peak = 0.950
if peak_val > target_peak:
    y_master = y_master * (target_peak / peak_val)

final_peak = np.max(np.abs(y_master))
print(f"  Normalized Peak: {final_peak:.3f}")

wav_path = 'feiyu_master_soundtrack.wav'
sf.write(wav_path, y_master.T, sr)
print(f"  [OK] Saved lossless WAV to {wav_path}")
