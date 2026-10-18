# -*- coding: utf-8 -*-
"""
《肥鱼爱大米》母带 v5
- 人声/伴奏已用 Demucs 分离：插入新唱段时伴奏永不中断
- 三处副歌「就像肥鱼爱大米」用 MiMo-V2.5-TTS 的 (唱歌) 标签真唱素材替换
- 只做时间伸缩（WSOLA），不变调，最大化保留咬字清晰度
- 输出：-14.5 LUFS / True Peak -0.4 dBFS
"""
import numpy as np, librosa, soundfile as sf, subprocess, os
from pytsmod.wsolatsm import wsola
import pyloudnorm as pyln
from scipy.signal import butter, sosfilt

SR = 44100
TOTAL = 288.0
N = int(TOTAL * SR)

print('1. 载入分离后的 stem ...')
voc, _ = librosa.load('sep_out/htdemucs/original_vocal/vocals.wav', sr=SR, mono=False)
inst, _ = librosa.load('sep_out/htdemucs/original_vocal/no_vocals.wav', sr=SR, mono=False)
voc = np.ascontiguousarray(voc[:, :N])
inst = np.ascontiguousarray(inst[:, :N])
print('   vocals', voc.shape, 'inst', inst.shape)

print('2. 载入 MiMo 唱歌素材并裁掉首尾静音 ...')
take, _ = librosa.load('take_t8.wav', sr=SR, mono=True)
take, _ = librosa.effects.trim(take, top_db=35)
print('   take dur = %.2fs' % (len(take) / SR))

CHORUS = [
    (90.82, 94.10),
    (210.59, 214.13),
    (242.21, 245.89),
]

def stereo(y):
    return np.stack([y, y]).astype(np.float32)

def fit_wsola(y, target_n):
    factor = target_n / len(y)
    out = wsola(y, factor)
    out = np.asarray(out, dtype=np.float32)
    if out.ndim > 1:
        out = out[0]
    if len(out) > target_n:
        out = out[:target_n]
    else:
        out = np.pad(out, (0, target_n - len(out)))
    return out

print('3. 逐段替换副歌（只改人声轨，伴奏原封不动）...')
voc_new = voc.copy()
xf = int(0.050 * SR)
rise = np.sin(np.linspace(0, np.pi / 2, xf))
fall = np.cos(np.linspace(0, np.pi / 2, xf))

for i, (t0, t1) in enumerate(CHORUS):
    s0, s1 = int(t0 * SR), int(t1 * SR)
    n = s1 - s0
    y = fit_wsola(take, n)

    # 轻微空间混响，贴合原唱空间
    rev_len = int(0.15 * SR)
    decay = np.exp(-np.linspace(0, 5.0, rev_len)); decay /= decay.sum()
    wet = np.convolve(y, decay)[:n]
    y = y * 0.90 + wet * 0.10

    # 电平匹配到原句 RMS
    rms_ref = np.sqrt(np.mean(voc[:, s0:s1] ** 2))
    y *= rms_ref / (np.sqrt(np.mean(y ** 2)) + 1e-9)

    y = stereo(y)
    y[:, :xf] *= rise
    y[:, -xf:] *= fall

    voc_new[:, s0:s0 + xf] *= fall
    voc_new[:, s1 - xf:s1] *= rise
    voc_new[:, s0 + xf:s1 - xf] = 0
    voc_new[:, s0:s1] += y
    print('   chorus %d  %.2f-%.2f  (%.2fs)  stretch x%.3f' % (i + 1, t0, t1, n / SR, n / len(take)))

print('4. 人声 + 伴奏 合并（伴奏全程连续）...')
mix = voc_new + inst

print('5. 鲸鱼娘对白 + sidechain 伴奏避让 ...')
dialogues = [
    ('dialogue_intro.wav', 6.0, 1.00, 0.50),
    ('dialogue_interlude.wav', 123.5, 1.00, 0.45),
    ('dialogue_outro.wav', 274.0, 1.00, 0.55),
]
sos_hp = butter(2, 85, btype='highpass', fs=SR, output='sos')
for fn, t_start, gain, duck_level in dialogues:
    if not os.path.exists(fn):
        print('   [skip]', fn); continue
    d, _ = librosa.load(fn, sr=SR, mono=False)
    if d.ndim == 1:
        d = np.stack([d, d])
    if d.shape[0] == 1:
        d = np.stack([d[0], d[0]])
    d = np.stack([sosfilt(sos_hp, d[0]), sosfilt(sos_hp, d[1])]) * gain
    s = int(t_start * SR)
    e = min(N, s + d.shape[1])
    d = d[:, :e - s]
    L = e - s
    di = int(0.30 * SR); do = int(0.40 * SR)
    duck = np.full(L, duck_level, dtype=np.float32)
    duck[:di] = np.linspace(1.0, duck_level, di)
    duck[-do:] = np.linspace(duck_level, 1.0, do)
    mix[:, s:e] = mix[:, s:e] * duck + d
    print('   mixed', fn, 'at', t_start)

print('6. 尾部淡出 ...')
fade = int(3.5 * SR)
curve = np.cos(np.linspace(0, np.pi / 2, fade)) ** 2
mix[:, N - fade:] *= curve

print('7. 母带响度标准化 ...')
peak = np.max(np.abs(mix))
print('   raw peak %.3f' % peak)
mix = mix * (0.96 / peak)

meter = pyln.Meter(SR)
loud = meter.integrated_loudness(mix.T)
print('   loudness before norm: %.2f LUFS' % loud)
target = -14.5
mix = pyln.normalize.loudness(mix.T, loud, target).T
# True Peak 限制（4x 过采样）
from scipy.signal import resample_poly
tp = np.max(np.abs(resample_poly(mix, 4, 1, axis=1)))
print('   true peak %.3f dBFS' % (20 * np.log10(tp + 1e-12)))
if tp > 0.955:
    mix *= 0.955 / tp
    loud = meter.integrated_loudness(mix.T)
    print('   after TP limit: %.2f LUFS' % loud)

sf.write('feiyu_master_soundtrack.wav', mix.T, SR, subtype='PCM_16')
print('   WAV saved')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'feiyu_master_soundtrack.wav',
                '-b:a', '320k', 'feiyu_master_soundtrack.mp3'], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'feiyu_master_soundtrack.wav',
                '-b:a', '320k', '肥鱼爱大米_母带原声.mp3'], check=True)
print('   MP3 saved')

print('8. 客观验收 ...')
for i, (t0, t1) in enumerate(CHORUS):
    s0, s1 = int(t0 * SR), int(t1 * SR)
    a = np.sqrt(np.mean(mix[:, s0:s1] ** 2))
    print('   chorus %d mix rms %.4f' % (i + 1, a))
print('DONE')
