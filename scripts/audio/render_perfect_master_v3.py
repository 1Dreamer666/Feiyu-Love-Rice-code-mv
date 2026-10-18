import librosa
import numpy as np
import soundfile as sf
import sys
from scipy.signal import butter, sosfilt

sr = 44100
total_dur = 288.0
total_samples = int(total_dur * sr)

print("1. Loading original vocal track...")
y_vocal, _ = librosa.load('original_vocal.mp3', sr=sr, mono=False)
if y_vocal.ndim == 1: y_vocal = np.stack([y_vocal, y_vocal])

y_master = np.zeros((2, total_samples), dtype=np.float32)
orig_take = min(y_vocal.shape[1], total_samples)
y_master[:, :orig_take] = y_vocal[:, :orig_take]

# 尾部 3.5 秒自然淡出
fadeout_len = int(3.5 * sr)
fadeout_curve = np.cos(np.linspace(0, np.pi/2, fadeout_len)) ** 2
y_master[:, total_samples - fadeout_len:] *= fadeout_curve

print("2. Crafting melodic, pure, crystal-clear 'Feiyu' vocal element...")
# 加载 feiyu_melodic_note.wav (F0 上扬旋律跳跃 G4 -> Bb4)
y_feiyu, _ = librosa.load('feiyu_melodic_note.wav', sr=sr, mono=False)
if y_feiyu.ndim == 1: y_feiyu = np.stack([y_feiyu, y_feiyu])

# 切出 feiyu 核心饱满发声区间 (0.05s ~ 0.85s, 长 0.80s)
feiyu_core = y_feiyu[:, int(0.05 * sr):int(0.85 * sr)]

# 三处副歌中严格替换 "老鼠" (绝不碰触 "就像" 和 "爱大米")
chorus_slots = [
    (91.77, 92.68),   # 副歌 1
    (211.78, 212.68), # 副歌 2
    (243.54, 244.44)  # 副歌 3
]

fade_samples = int(0.028 * sr) # 28ms 汉宁窗等能量交叉淡化
fade_in = np.sin(np.linspace(0, np.pi/2, fade_samples))
fade_out = np.cos(np.linspace(0, np.pi/2, fade_samples))

# 正确归一化的立体声板式混响核 (衰减 0.20s, 湿声比 12%, 绝不产生暴增)
rev_len = int(0.20 * sr)
decay_raw = np.exp(-np.linspace(0, 4.0, rev_len))
decay = decay_raw / (np.sum(decay_raw) + 1e-6) # 归一化能量卷积核！

for idx, (t0, t1) in enumerate(chorus_slots):
    s_idx = int(t0 * sr)
    e_idx = int(t1 * sr)
    slot_len = e_idx - s_idx
    
    fl = librosa.effects.time_stretch(feiyu_core[0], rate=feiyu_core.shape[1]/slot_len)[:slot_len]
    fr = librosa.effects.time_stretch(feiyu_core[1], rate=feiyu_core.shape[1]/slot_len)[:slot_len]
    f_fit = np.stack([fl, fr])
    
    # 动态能量与人声咬字穿透力匹配
    ref_slice = y_master[:, s_idx:e_idx]
    rms_ref = np.sqrt(np.mean(ref_slice**2))
    rms_fit = np.sqrt(np.mean(f_fit**2)) + 1e-6
    f_fit = f_fit * (rms_ref / rms_fit) * 1.05
    
    # 混响湿声叠加 (干声 88% + 湿声 12%)
    rev_0 = np.convolve(f_fit[0], decay, mode='full')[:slot_len]
    rev_1 = np.convolve(f_fit[1], np.roll(decay, int(0.003*sr)), mode='full')[:slot_len]
    f_wet = f_fit * 0.88 + np.stack([rev_0, rev_1]) * 0.12
    
    # 交叉淡化
    f_wet[:, :fade_samples] *= fade_in
    f_wet[:, -fade_samples:] *= fade_out
    
    y_master[:, s_idx:s_idx+fade_samples] *= fade_out
    y_master[:, e_idx-fade_samples:e_idx] *= fade_in
    y_master[:, s_idx+fade_samples:e_idx-fade_samples] = 0
    y_master[:, s_idx:e_idx] += f_wet
    print(f"  [OK] Chorus {idx+1} seamlessly placed at {t0:.2f}s - {t1:.2f}s")

print("3. Mixing in cute whale dialogues with dynamic sidechain ducking...")
dialogue_configs = [
    ('dialogue_intro.wav', 6.0, 1.00, 0.50),      # 前奏：6.0s
    ('dialogue_interlude.wav', 123.5, 1.00, 0.45), # 间奏：123.5s
    ('dialogue_outro.wav', 274.0, 1.00, 0.55)      # 尾奏：274.0s
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

print("4. Professional Master Limiting & Loudness Normalization...")
peak_val = np.max(np.abs(y_master))
print(f"  Raw Peak: {peak_val:.3f}")
target_peak = 0.950 # 标准 -0.45 dBFS
if peak_val > target_peak:
    y_master = y_master * (target_peak / peak_val)

final_peak = np.max(np.abs(y_master))
print(f"  Normalized Peak: {final_peak:.3f}")

wav_path = 'feiyu_master_soundtrack.wav'
mp3_path = 'feiyu_master_soundtrack.mp3'
sf.write(wav_path, y_master.T, sr)
print("  [OK] Saved lossless WAV to", wav_path)
