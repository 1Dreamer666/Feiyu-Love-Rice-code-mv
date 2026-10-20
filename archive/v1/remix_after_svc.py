# -*- coding: utf-8 -*-
"""把 SVC 转换后的人声与伴奏重新混音，并做母带处理（-14.5 LUFS / TP ≤ -1.4 dBFS）。

用法：
  python tools/remix_after_svc.py <converted_vocal.wav> <out_mp3_or_wav> [--inst path] [--dry path]
"""
import argparse, os, subprocess, numpy as np, soundfile as sf, librosa, pyloudnorm as pyln
from scipy.signal import butter, sosfilt

SR = 44100


def load_mono_or_stereo(p, sr=SR):
    x, s = sf.read(p, dtype='float32', always_2d=True)
    if s != sr:
        x = librosa.resample(x.T, orig_sr=s, target_sr=sr).T
    return x


def hp(x, fc=70.0, order=2):
    sos = butter(order, fc, btype='highpass', fs=SR, output='sos')
    return sosfilt(sos, x, axis=0).astype(np.float32)


def match_len(x, n):
    if len(x) >= n:
        return x[:n]
    return np.pad(x, ((0, n - len(x)), (0, 0)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('vocal')
    ap.add_argument('out')
    ap.add_argument('--inst', default='build/svc/inst_288s.wav')
    ap.add_argument('--dry', default=None, help='可选：未转换的原始人声，用于对比/回填')
    ap.add_argument('--vocal-db', type=float, default=-3.0, help='人声相对伴奏的电平（dB）')
    ap.add_argument('--target-lufs', type=float, default=-14.5)
    ap.add_argument('--true-peak', type=float, default=-1.4)
    args = ap.parse_args()

    inst = load_mono_or_stereo(args.inst)
    voc = load_mono_or_stereo(args.vocal)
    if voc.shape[1] == 1 and inst.shape[1] == 2:
        voc = np.repeat(voc, 2, axis=1)

    n = len(inst)
    voc = match_len(voc, n)

    # 人声高通去隆隆声
    voc = hp(voc, 70.0)
    # 归一化人声到与伴奏匹配的响度：按 RMS 对齐，再加 vocal-db 偏移
    def rms(x):
        return np.sqrt((x ** 2).mean()) + 1e-12
    gain = (rms(inst) / rms(voc)) * (10 ** (args.vocal_db / 20))
    voc = (voc * gain).astype(np.float32)

    mix = inst + voc

    # ---- 母带链：LUFS 归一 → 前视限幅 → 复核 ----
    meter = pyln.Meter(SR)
    ceiling = 10 ** (args.true_peak / 20)

    def lookahead_limit(x, ceil, release_ms=120.0, look_ms=5.0):
        """简单前视限幅：按包络增益，不做削波。"""
        peak = np.abs(x).max(axis=1)
        la = max(1, int(SR * look_ms / 1000))
        # 前视：取未来 la 个采样里的最大值
        env = np.maximum.reduce([np.roll(peak, -k) for k in range(0, la, max(1, la // 4))])
        gain = np.ones_like(env)
        need = env > ceil
        gain[need] = ceil / env[need]
        # 释放平滑（一阶低通，向下只允许慢恢复）
        alpha = np.exp(-1.0 / (SR * release_ms / 1000))
        g = gain[0]
        out = np.empty_like(gain)
        for i in range(len(gain)):
            g = min(gain[i], g * alpha + gain[i] * (1 - alpha))
            out[i] = g
        return (x * out[:, None]).astype(np.float32)

    loud = meter.integrated_loudness(mix)
    mix = pyln.normalize.loudness(mix, loud, args.target_lufs)
    # 限幅可能压掉一点响度，最多迭代 3 次逼近目标
    for _ in range(3):
        if np.abs(mix).max() > ceiling:
            mix = lookahead_limit(mix, ceiling)
        cur = meter.integrated_loudness(mix)
        if abs(cur - args.target_lufs) < 0.4:
            break
        mix = pyln.normalize.loudness(mix, cur, args.target_lufs)
    if np.abs(mix).max() > ceiling:
        mix = mix * (ceiling / np.abs(mix).max())

    sf.write(args.out, mix.astype(np.float32), SR)
    out_loud = meter.integrated_loudness(mix)
    print(f'written {args.out}')
    print(f'  duration {len(mix)/SR:.2f}s   LUFS {out_loud:.2f}   peak {20*np.log10(np.abs(mix).max()):.2f} dBFS')


if __name__ == '__main__':
    main()
