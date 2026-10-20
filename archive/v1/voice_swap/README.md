# Let Me Go 声线替换 · 实测记录

> **归档说明**：本文档记录的是 **v1** 的音频方案（SVC 局部替换）。
> v2 已改用 Suno 全曲重唱，本文仅作技术留档，脚本见 `archive/v1/`。

本轮把《肥鱼爱大米》全曲人声替换成《Let Me Go》那个声线，以下是全过程与实测数据。

## 一、那条声线到底是什么

追溯链路（按 B 站投稿的相互引用）：

| 步骤 | 出处 | 说明 |
|---|---|---|
| 1 | [BV1R5YL69EC5](https://www.bilibili.com/video/BV1R5YL69EC5/) 音鲸干活唱歌1分钟纯享版（星落落_oi） | UP 自述「抽一天的卡了，一直没抽到这个音色」——这是**抽卡抽出来的 AI 音色**，不是真人 |
| 2 | [BV1XbY66nEWr](https://www.bilibili.com/video/BV1XbY66nEWr/) [AI] 大肥鱼摸鱼歌《Let Me Go》（罐装毕加索） | 简介标注「词：deepseek｜曲：Suno/豆包」，即人声由 Suno/豆包生成 |
| 3 | [BV1C7h16jEHJ](https://www.bilibili.com/video/BV1C7h16jEHJ/) 同名动画 MV（polaris0） | 画面工程即上游仓库 `beidou070/let-me-go-code-mv` |
| 4 | [BV1JXJy65Eft](https://www.bilibili.com/video/BV1JXJy65Eft/) 不要相信大肥鱼的话！（小猪P_） | 简介写「大肥鱼声线提取自 Let me go，演唱 by 小猪P横杠」 |

**结论**：所谓「声线提取」并不是从某处导出音色包，而是**用 Let Me Go 的人声当作目标音色参考，做零样本歌声转换（SVC）**。
小猪P 那条是用他自己的演唱做源、Let Me Go 人声做参考转出来的。

实测佐证：把三者的说话人嵌入（d-vector）与 Let Me Go 人声做余弦相似度——

| 音轨 | 与 Let Me Go 人声的相似度 |
|---|---|
| Let Me Go 人声（参考自身） | 1.0000 |
| 小猪P 视频人声 | 0.8901 |
| 星落落_oi 1分钟纯享版 | 0.8413 |
| 我们原来的 MiMo 人声 | 0.7625 |

小猪P 的人声明显更靠近 Let Me Go，与「声线提取自 Let Me go」的说法一致。

## 二、我们怎么复现

用 **Seed-VC**（零样本歌声转换，f0 条件模型 `DiT_seed_v2_uvit_whisper_base_f0_44k`）。

```
源（要改的歌）: 我们母带分离出的人声 stem，288 秒
参考（目标音色）: Let Me Go 人声 2–42 秒
```

流程：

1. Demucs 分离母带 → `vocals.wav` / `no_vocals.wav`
2. Seed-VC 全曲转换（30 步扩散，f0 条件开启，不改音高/时长）
3. 与伴奏重混（人声 −3 dB 相对伴奏）
4. 母带：−14.5 LUFS / True Peak −1.4 dBFS（与原母带同规格）

## 三、实测结果

### 音色接近度（与 Let Me Go 参考人声，分段 d-vector 余弦）

| 段落 | 旧母带 | 新声线版 | 提升 |
|---|---|---|---|
| 40–70s | 0.764 | 0.854 | +0.090 |
| 70–100s | 0.782 | 0.844 | +0.062 |
| 100–130s | 0.759 | 0.832 | +0.073 |
| 160–190s | 0.751 | 0.840 | +0.089 |
| 190–220s | 0.790 | 0.841 | +0.051 |
| 220–250s | 0.782 | 0.830 | +0.048 |
| 250–280s | 0.775 | 0.831 | +0.056 |
| **均值** | **0.772** | **0.839** | **+0.067** |

### 歌词可懂度（faster-whisper 转写对照）

见 [asr_report.txt](asr_report.txt)。多数句子转写完全一致；个别词有退化，例如

- 旧：`哪怕只能够这样的想你` ／ 新：`哪怕只能够测药的像你`
- 旧：`我会轻轻在你耳边对你说` ／ 新：`我会轻轻在你岸边 对你说爱你`

歌词大意仍可听懂，但清晰度有轻微损失。

### 音质指标

| 音轨 | HNR (dB) | 频谱质心 (Hz) |
|---|---|---|
| Let Me Go 参考人声 | 8.5 | 3780 |
| 转换前（原人声） | 5.3 | 3953 |
| 转换后 | 8.5 | 5241 |

转换后谐噪比与参考持平（8.5 dB），说明没有引入沙哑；质心偏高是因为参考音源本身经 B 站有损压缩、高频被削掉了。

### 一次失败的尝试（已回退）

试过用 LTAS 匹配把转换后频谱倾斜对齐到参考，压掉 8–16 kHz 约 3–4 dB。
结果**反而变差**：相似度从 0.960 掉到 0.780。原因是参考音源有损压缩导致高频缺失，对齐它等于把转换结果也削掉高频。已回退，未采用。记录见 [eq_report.txt](eq_report.txt)。

## 四、验收

- 真实浏览器（headless Edge + CDP）解码：旧母带、新声线版 MP3、两者 WAV 全部 `status: ok, dur: 288`
- 真实播放：从 90 s 起播 4 秒，时间轴推进到 93.95 s（`readyState: 4`），速度正常
- 响度：−14.54 LUFS，峰值 −1.40 dBFS

## 五、产出文件

| 文件 | 说明 |
|---|---|
| `build/svc/final/肥鱼爱大米_LetMeGo声线_全曲.mp3` | 全曲新声线版，320 kbps |
| `build/svc/final/feiyu_lmg_voice.wav` | 无损母带 |
| `build/svc/final/对比_原声线_副歌40秒.mp3` | 原声线副歌 40 秒 |
| `build/svc/final/试听_新声线_副歌40秒.mp3` | 新声线副歌 40 秒 |

## 六、复现命令

```bash
# 1) 分离母带
python -m demucs --two-stems=vocals -n htdemucs -o sep_master build/feiyu_master_soundtrack.wav

# 2) 准备源与参考
python archive/v1/prep_svc_full.py

# 3) 零样本歌声转换（需要 build/venv_svc 环境）
build/venv_svc/Scripts/python.exe archive/v1/svc_local.py \
  --source build/svc/source_full_288s.wav \
  --target build/svc/target_lmg_40s.wav \
  --output build/svc/out_full --diffusion-steps 30

# 4) 重混 + 母带
python archive/v1/remix_after_svc.py \
  "build/svc/out_full/vc_source_full_288s_target_lmg_40s_1.0_30_0.7.wav" \
  build/svc/final/feiyu_lmg_voice.wav --vocal-db -3.0
```

## 七、说明

- Let Me Go 的人声本身是 Suno/豆包生成的 AI 音色，不是自然人嗓音；本仓库不附带《Let Me Go》音源，复现需自行取得有权使用的音轨。
- 本页与产出文件仅作技术验证，是否采用请自行判断。
