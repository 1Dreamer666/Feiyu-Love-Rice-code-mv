# tools 目录

当前版本（v2）使用的工具。**v1 的专用脚本已归档到 [`archive/v1/`](../archive/v1/)**。

## 素材生成

| 脚本 | 用途 |
|---|---|
| `make_images_v2.py` | 生成 `docs/images/` 下的 v1/v2 展示图（封面、分镜拼图、角色三视图） |
| `make_audio_sidecar.py` | 把母带 MP3 转成 base64 旁挂脚本，供 `file://` 下导出取用 |
| `fix_script_paths.py` | 批量修正脚本里的项目根目录基准 |

## 浏览器验收（headless Edge + CDP）

两版通用。

| 脚本 | 用途 |
|---|---|
| `cdp_audio_check.js` | 检查 `file://` 下母带音频能否零点击自动获取 |
| `cdp_audio_verify.js` | 分段响度、媒体信息、真实播放推进 |
| `cdp_play_check.js` | 从指定时间起播，观察时间轴是否正常推进 |
| `cdp_export_real.js` | 真实 `file://` 环境下的 MP4 导出全流程验收 |
| `cdp_scenes.js` / `cdp_scenes2.js` | 多时间点场景帧抓取 |
| `cdp_shot*.js` | 页面截图、滚动截图 |
| `cdp_eval.js` | 在页面里执行任意 JS 表达式 |
| `cdp_save_blob.js` | 落盘页面内生成的 Blob |

## Suno 抓取（v2 专用）

Suno 的媒体文件由 Service Worker 解密，CDN 上的 m4a 是密文。
以下脚本**不绕过 DRM**，而是录制浏览器解码后的播放输出。

| 脚本 | 用途 |
|---|---|
| `cdp_record.js` | 用 `captureStream()` + `MediaRecorder` 录制播放中的音频 |
| `cdp_rec_song.js` | 单次完整录制一首歌（不在开始后重置 `currentTime`） |
| `cdp_rec_install.js` | 注入录制用的 hook |
| `cdp_rclick.js` | 真实鼠标点击（React 会忽略合成 `element.click()`） |
| `cdp_typeinto.js` | 向指定输入框填入文本（绕开文件选择框） |
| `cdp_live.js` | 通用 CDP 会话：eval / 截图 / 导航 / 点击 / 按键 |
| `cdp_net.js` / `cdp_resp.js` / `cdp_headers.js` | 网络请求与响应头观察 |
| `cdp_sw.js` | Service Worker 观察 |
| `cdp_download.js` / `cdp_dl_native.js` / `cdp_setdl.js` | 下载行为接管 |
| `cdp_getblob.js` | 取页面内 Blob |
| `cdp_click.js` | 合成点击（仅用于非 React 控件） |

## 相关文档

- 当前版本说明：[`../README.md`](../README.md)
- v2 投稿文案：[`../docs/bilibili_intro_v2.md`](../docs/bilibili_intro_v2.md)
- v1 归档（含 SVC 声线替换实测记录）：[`../archive/v1/`](../archive/v1/)
