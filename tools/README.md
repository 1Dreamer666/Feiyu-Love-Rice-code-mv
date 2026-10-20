# tools 目录

## 声线替换（Let Me Go 声线）

| 脚本 | 用途 |
|---|---|
| `prep_svc_full.py` | 从母带分出人声 stem，并截取 Let Me Go 参考片段 |
| `svc_local.py` | Seed-VC 零样本歌声转换（用本地权重，绕过联网下载） |
| `remix_after_svc.py` | 转换后人声与伴奏重混 + 母带（−14.5 LUFS / TP −1.4 dBFS） |
| `svc_quality.py` | 音色接近度、HNR、频谱质心等体检指标 |
| `svc_eq_compare.py` | 对比均衡前后与目标音色的接近度 |
| `asr_compare.py` | 旧/新母带歌词转写对照，检查可懂度 |

完整记录见 [`../docs/voice_swap/README.md`](../docs/voice_swap/README.md)。

## 浏览器验收（headless Edge + CDP）

| 脚本 | 用途 |
|---|---|
| `cdp_audio_check.js` | 检查 `file://` 下母带音频能否零点击自动获取 |
| `cdp_audio_control.js` | 多个音轨的解码对照（旧母带 vs 新版） |
| `cdp_audio_verify.js` | 分段响度、媒体信息、真实播放推进 |
| `cdp_play_check.js` | 从指定时间起播，观察时间轴是否正常推进 |
| `cdp_export_real.js` | 真实 `file://` 环境下的 MP4 导出全流程验收 |
| `cdp_shot*.js` / `cdp_scenes*.js` | 页面截图、滚动截图、场景帧抓取 |
| `cdp_eval.js` | 在页面里执行任意 JS 表达式 |
| `cdp_save_blob.js` | 落盘页面内生成的 Blob |

## 素材生成

| 脚本 | 用途 |
|---|---|
| `make_readme_images.py` | 生成 README 用的封面、分镜、角色三视图 |
| `make_audio_sidecar.py` | 把母带 MP3 转成 base64 旁挂脚本，供 `file://` 下导出取用 |
| `fix_script_paths.py` | 批量修正脚本里的项目根目录基准 |

## explore/

过程中的一次性探查脚本，留档备查（分析音高分布、说话人识别、初版素材准备等）。
