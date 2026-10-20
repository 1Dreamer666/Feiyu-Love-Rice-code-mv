# archive/v1 —— v1 归档

v1（2026-10-18 发布，[BV1L5n56QEcf](https://www.bilibili.com/video/BV1L5n56QEcf/)）的专用脚本与文档。
**当前版本是 v2**，这里的代码不再维护，仅供追溯与复现对照。

v1 的做法是「只替换人声、保留原伴奏」：Demucs 分轨 → MiMo-V2.5-TTS 生成替换词 →
WSOLA 时间伸缩 + WORLD 音高映射 → 只替换 `vocals` 轨。伴奏天然连续，
但唱到「肥鱼」二字时音色会突变 —— 这正是 v2 改用 Suno 全曲重唱的原因。

## 目录内容

### 音频链路

| 路径 | 说明 |
|---|---|
| `audio/render_master_v8.py` | v1 最终母带脚本（Demucs + MiMo + WSOLA + WORLD） |
| `audio/render_master_v3~v7.py` | 迭代过程中的中间版本，留档对比 |
| `audio/generate_all_in_one_master.py` | 一体化母带生成 |
| `audio/verify_final.py` | 音频客观指标 + 角色比例对照验收 |
| `experiments/` | PSOLA / WSOLA / WORLD / TD-PSOLA 等拼接方案的一次性试验 |

### 声线替换（Let Me Go 声线）

| 路径 | 说明 |
|---|---|
| `prep_svc_full.py` | 从母带分出人声 stem，截取 Let Me Go 参考片段 |
| `svc_local.py` | Seed-VC 零样本歌声转换（本地权重） |
| `remix_after_svc.py` | 转换后人声与伴奏重混 + 母带 |
| `svc_quality.py` | 音色接近度、HNR、频谱质心等指标 |
| `svc_eq_compare.py` | 均衡前后与目标音色的接近度对比 |
| `asr_compare.py` | 旧/新母带歌词转写对照 |
| `voice_swap/README.md` | ★ 完整实测记录：那条声线到底是什么、如何复现、验收数据 |
| `explore/` | 音高分布、说话人识别、初版素材准备等探查脚本 |

### 其他

| 路径 | 说明 |
|---|---|
| `cdp_audio_control.js` | 旧母带 vs 新声线版的音轨解码对照 |
| `make_readme_images.py` | v1 的 README 展示图生成（已被 `tools/make_images_v2.py` 取代） |
| `bilibili_intro.md` | v1 的 B 站投稿简介 |

## 相关

- v1 成片：`肥鱼爱大米_v1_0-288s.mp4`（不随仓库分发）
- v1 封面与分镜：`docs/images/v1/`
- 当前版本：[`../../README.md`](../../README.md)
