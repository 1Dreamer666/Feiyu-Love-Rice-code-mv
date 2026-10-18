# 第三方组件与素材声明

本项目包含或依赖以下第三方内容。各部分权利独立，**不将整个仓库笼统标为单一许可**。

---

## 运行库

| 组件 | 版本 | 许可 | 来源 |
| --- | --- | --- | --- |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | 5.2.2 | MIT | `vendor/mp4-muxer.js` |
| [p5.js](https://p5js.org/) | 1.11.3 | LGPL-2.1 | CDN 引入 |
| [p5.brush](https://github.com/acamposuribe/p5.brush) | 1.1.1 | MIT | CDN 引入 |
| [Tailwind CSS](https://tailwindcss.com/) | CDN 版 | MIT | CDN 引入 |

> p5.js 以 CDN 方式引入，未修改、未内联，符合 LGPL-2.1 的动态链接要求。

---

## 音频处理

| 组件 | 许可 | 用途 |
| --- | --- | --- |
| [Demucs](https://github.com/facebookresearch/demucs) | MIT | 人声 / 伴奏分轨 |
| [WORLD](https://github.com/mmorise/World)（pyworld） | 修改版 BSD | 音高映射 |
| [pytsmod](https://github.com/noah_avila/pytsmod) | MIT | WSOLA 时间伸缩 |
| [pyloudnorm](https://github.com/csteinmetz1/pyloudnorm) | MIT | 响度归一 |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | MIT | 歌词可懂度验证（ASR） |
| [FFmpeg](https://ffmpeg.org/) | LGPL/GPL | 编解码与封装 |

---

## 角色与音乐权利

### 音乐

- **《老鼠爱大米》** —— 词曲原作：**杨臣刚**（2004）
- 本作为非商业同人改编。改编歌词、演唱音源由 MiMo-V2.5-TTS 生成。
- **原曲音轨不随本仓库分发。** 复现母带需自行准备原曲音频。

### 角色

- **DeepSeek 鲸鱼娘** —— 角色原型
- **女仆鲸鱼娘设计** —— @ZipZipPipe、@这个刀子真甜、@polaris0
- 本作角色形象参考了 [let-me-go-code-mv](https://github.com/beidou070/let-me-go-code-mv)
  并做了微调。该工程明确声明「项目自有代码暂未授予通用开源许可证」，
  因此本项目**不包含**其源码，仅在形象设计层面借鉴并署名。
- 角色衍生部分适用 **CC BY-NC-SA 4.0**：署名、非商业性使用、相同方式共享。

### 字体

界面与字幕使用系统字体及 CDN 字体，未内嵌分发第三方字体文件。

---

## 不随仓库分发的内容

以下内容因体积或许可原因**未纳入版本控制**（见 `.gitignore`）：

- 原曲音轨、母带、分轨、实验音频（`*.wav`、`*.mp3`）
- 成片视频（`*.mp4`）—— 请通过 [B 站](https://www.bilibili.com/video/BV1L5n56QEcf/) 观看
- `references/` 目录（第三方参考工程，无通用开源许可）
- `vendor/master-audio.js`（由母带 mp3 现场生成的 base64 数据）
- 开发过程截图与浏览器缓存

---

## 免责声明

本项目为**非商业同人作品**，仅供学习与交流。角色形象、歌曲版权归各自权利人所有。
如权利人认为本作存在不当使用，请联系删除。
