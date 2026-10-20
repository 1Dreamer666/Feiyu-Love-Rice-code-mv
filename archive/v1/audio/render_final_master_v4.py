import asyncio
import edge_tts
import librosa
import numpy as np
import soundfile as sf
import sys
from scipy.signal import butter, sosfilt

sr = 44100
total_dur = 288.0
total_samples = int(total_dur * sr)

print("1. Preparing Legato Feiyu Singing Phrase (zh-CN-XiaoyiNeural)...")
async def gen_phrase():
    c = edge_tts.Communicate("就像肥鱼爱大米", voice="zh-CN-XiaoyiNeural", pitch="+30Hz", rate="-30%")
    await c.save("feiyu_slow_phrase.mp3")

asyncio.run(gen_phrase())

y_slow, _ = librosa.load('feiyu_slow_phrase.mp3', sr=sr, mono=False)
if y_slow.ndim == 1: y_slow = np.stack([y_slow, y_slow])
# 截取完整乐句 0.0s ~ 2.15s
full_phrase = y_slow[:, :int(2.15 * sr)]

print("2. Loading original vocal track...")
y_vocal, _ = librosa.load('original_vocal.mp3', sr=sr, mono=False)
if y_vocal.ndim == 1: y_vocal = np.stack([y_vocal, y_vocal])

y_master = np.zeros((2, total_samples), dtype=np.float32)
orig_take = min(y_vocal.shape[1], total_samples)
y_master[:, :orig_take] = y_vocal[:, :orig_take]

# 尾部 3.5 秒自然淡出
fadeout_len = int(3.5 * sr)
fadeout_curve = np.cos(np.linspace(0, np.pi/2, fadeout_len)) ** 2
y_master[:, total_samples - fadeout_len:] *= fadeout_curve

print("3. Seamlessly replacing three chorus climax phrases with Legato singing...")
# 三处副歌中 "就像肥鱼爱大米" 的起止区间 (秒)
# 采用整句连音置换, 两端在弱拍气口平滑衔接
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
    
    # 时间微调贴合 slot_len
    p_l = librosa.effects.time_stretch(full_phrase[0], rate=full_phrase.shape[1]/p_len)[:p_len]
    p_r = librosa.effects.time_stretch(full_phrase[1], rate=full_phrase.shape[1]/p_len)[:p_len]
    p_fit = np.stack([p_l, p_r])
    
    # 动态能量匹配
    ref_slice = y_master[:, s_idx:e_idx]
    rms_ref = np.sqrt(np.mean(ref_slice**2))
    rms_fit = np.sqrt(np.mean(p_fit**2)) + 1e-6
    p_fit *= (rms_ref / rms_fit) * 1.15
    
    # 立体声微混响处理 (增加 10% 湿声空间感, 与整首伴奏空间场融合)
    rev_len = int(0.18 * sr)
    decay = np.exp(-np.linspace(0, 4.0, rev_len))
    decay = decay / np.sum(decay)
    rev_0 = np.convolve(p_fit[0], decay, mode='full')[:p_len]
    rev_1 = np.convolve(p_fit[1], np.roll(decay, int(0.003*sr)), mode='full')[:p_len]
    p_wet = p_fit * 0.90 + np.stack([rev_0, rev_1]) * 0.10
    
    # 两端等能量交叉淡入淡出
    p_wet[:, :xf_len] *= xf_in
    p_wet[:, -xf_len:] *= xf_out
    
    y_master[:, s_idx:s_idx+xf_len] *= xf_out
    y_master[:, e_idx-xf_len:e_idx] *= xf_in
    y_master[:, s_idx+xf_len:e_idx-xf_len] = 0
    y_master[:, s_idx:e_idx] += p_wet
    print(f"  [OK] Chorus {idx+1} seamlessly replaced with Legato phrase at {t0:.2f}s - {t1:.2f}s")

print("4. Mixing in cute whale dialogues with dynamic sidechain ducking...")
dialogue_configs = [
    ('dialogue_intro.wav', 6.0, 1.00, 0.50),      # 前奏：6.0s，伴奏压降至 50%
    ('dialogue_interlude.wav', 123.5, 1.00, 0.45), # 间奏：123.5s，伴奏压降至 45%
    ('dialogue_outro.wav', 274.0, 1.00, 0.55)      # 尾奏：274.0s，伴奏压降至 55%
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

print("5. Professional Master Limiting & Loudness Normalization...")
peak_val = np.max(np.abs(y_master))
print(f"  Raw Peak: {peak_val:.3f}")
target_peak = 0.950 # -0.45 dBFS
if peak_val > target_peak:
    y_master = y_master * (target_peak / peak_val)

final_peak = np.max(np.abs(y_master))
print(f"  Normalized Peak: {final_peak:.3f}")

wav_path = 'feiyu_master_soundtrack.wav'
mp3_path = 'feiyu_master_soundtrack.mp3'
sf.write(wav_path, y_master.T, sr)
print("  [OK] Saved lossless WAV to", wav_path)
