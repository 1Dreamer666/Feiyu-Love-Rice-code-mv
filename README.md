# 肥鱼爱大米 · 代码 MV

> 《老鼠爱大米》同人改编动画 MV —— 主角是 DeepSeek 鲸鱼娘「大肥鱼（深深）」。
>
> 画面由纯代码（p5.js / Canvas 2D）逐帧绘制，**没有使用任何逐帧手绘素材**；
> 演唱音源用 MiMo-V2.5-TTS 的「唱歌」模式替换原曲部分字眼。

**[▶ B 站正片](https://www.bilibili.com/video/BV1L5n56QEcf/)**　·　
[源码仓库](https://github.com/1Dreamer666/Feiyu-Love-Rice-code-mv)

> 成片视频与音频不随本仓库分发（与上游
> [let-me-go-code-mv](https://github.com/beidou070/let-me-go-code-mv) 的做法一致），
> 请通过上方 B 站链接观看；如需复现，按「复现母带」一节自行生成。

---

## 这是什么

一首 288 秒（4 分 48 秒）的 1920×1080 / 24 FPS 音乐视频，全部画面由一个 HTML 文件里的
JavaScript 函数 `renderMVFrame(ctx, t)` 计算得出。给定时间 `t`，就唯一确定一帧画面 ——
没有随机数、没有时钟依赖，因此**可以离线逐帧导出，结果与播放完全一致**。

单文件即完整作品：双击 `肥鱼爱大米.html` 即可播放，无需安装、无需联网（字体与音频除外）。

---

## 快速开始

```bash
# 1) 直接用浏览器打开（推荐 Edge / Chrome 最新版）
#    双击 肥鱼爱大米.html 即可

# 2) 导出 MP4
#    点击页面顶部「🎬 导出 MP4」→ 选择保存位置 → 开始导出
```

导出依赖：

- 浏览器需支持 **WebCodecs**（Edge / Chrome 94+）
- 母带音频 `肥鱼爱大米_母带原声.mp3` 放在同目录，或点击面板里的「选择 MP3」手动指定
- 若 `vendor/master-audio.js` 存在，会**自动**读取音频，无需任何点击

> ⚠️ 浏览器「下载」得到的 MP4 可能被 Windows 标记为「来自 Internet」而无法打开。
> 面板里选择保存位置（流式写盘）可避免此问题；已下载的文件可右键 → 属性 → 勾选「解除锁定」。

---

## 目录结构

```
.
├── 肥鱼爱大米.html              # ★ 主程序：完整 MV + MP4 导出功能（单文件）
├── 肥鱼爱大米_0-288s.mp4        # 成片（1920×1080，含母带音轨）
├── 参考三视图-深深.png           # 角色设定三视图（正面 / 侧面 / 背面）
├── export_module.js             # MP4 导出模块源码（被注入进 HTML）
│
├── scripts/
│   ├── audio/                   # 母带制作：分轨、变调、混音、母带化
│   │   └── render_master_v8.py  # ★ 当前母带脚本（最终版本）
│   ├── integrate/               # 把角色模型 / 导出功能注入主 HTML
│   │   ├── inject_export.py     # ★ 注入 MP4 导出功能（幂等）
│   │   ├── integrate_cast.py    # 内联 CAST 角色骨架
│   │   └── integrate_parts.py   # 合并 proto/parts 部件
│   └── experiments/             # 探索性脚本（PSOLA / WSOLA / WORLD 对比等）
│
├── proto/                       # 角色部件开发工作台（多 agent 并行建模）
│   ├── parts/                   # ★ 6 大部件：头/发/配饰/躯干/手臂/腿尾
│   ├── SPEC.md                  # 部件开发规范（坐标系、锚点、验收标准）
│   └── FINAL_*.png              # 成品帧抽样
│
├── tools/                       # 验证与构建工具
│   ├── make_audio_sidecar.py    # ★ 把母带 mp3 转成 base64 伴生脚本
│   ├── cdp_export_real.js       # 真实 file:// 条件下导出验证
│   └── cdp_*.js                 # 无头 Edge + CDP 截图 / 验收
│
├── vendor/
│   └── mp4-muxer.js             # mp4-muxer 5.2.2（MP4 封装）
│
├── renders/                     # 验收分镜、封面、场景截图
├── docs/
│   ├── mimo_docs_text.txt       # MiMo TTS 文档存档
│   └── verification/            # 音频验收报告、ASR 可懂度记录
│
├── .env.example                 # 环境变量模板（复制为 .env）
└── .gitignore
```

---

## 技术要点

### 画面：纯函数式逐帧渲染

核心是一个纯函数：

```js
renderMVFrame(ctx, t)   // t ∈ [0, 288]，给定时间 → 唯一画面
```

- 角色是程序化 Canvas 2D 骨架（约 2.5 头身 Q 版），不是贴图
- 分镜、镜头运动、粒子、水彩纹理全部由代码生成
- 因为无状态、无随机，所以播放与导出**逐像素一致**

角色模型由 6 个部件文件并行开发（`proto/parts/`），再总装进单文件。
部件规范见 [`proto/SPEC.md`](proto/SPEC.md)。

### 音频：只替换人声，伴奏不动

关键约束是「插入改编歌词时伴奏不能断」。做法是**分轨处理**：

1. Demucs 分离原曲 → `vocals.wav` / `no_vocals.wav`
2. 用 MiMo-V2.5-TTS 的 `(唱歌)` 模式生成「肥鱼」等替换词的演唱片段
3. WSOLA 时间伸缩对齐节奏 + WORLD 声码器做音高映射（旋律迁移）
4. **只替换 vocals 轨**，`no_vocals` 原样保留 → 伴奏天然连续
5. pyloudnorm 归一到 −14.5 LUFS，真峰值限制在 −1.4 dBFS

验收数据见 [`docs/verification/验收报告.txt`](docs/verification/验收报告.txt)：
伴奏低频能量保留 66–68%，替换窗口无爆音（最大采样跳变 0.28–0.44）。

### 导出：WebCodecs + mp4-muxer

- `VideoEncoder` → H.264 High（`avc1.640028`），8 Mbps
- `AudioEncoder` → AAC-LC 192 kbps
- 逐帧 `renderMVFrame` 画到离屏 canvas，编码后由 mp4-muxer 封装
- 优先 `showSaveFilePicker` 流式写盘（不占内存、不会被 MOTW 锁定）

---

## 复现母带

```bash
# 1) 准备环境变量
cp .env.example .env
# 编辑 .env，填入 MIMO_API_KEY（https://mimo.mi.com/）

# 2) 安装依赖
pip install librosa soundfile numpy scipy pyloudnorm pyworld pytsmod demucs
# 需要 ffmpeg

# 3) 生成母带
python scripts/audio/render_master_v8.py
```

> 仓库不含音频文件（母带 / 分轨 / 实验 take 均已忽略），需按上述流程自行生成。

---

## 已知限制

- **WebCodecs 必需**：Safari 与旧版浏览器无法导出 MP4（但仍可播放）
- **导出较慢**：约 10 FPS 编码速度，整片 288 s 需 10–15 分钟
- **file:// 限制**：浏览器禁止 `fetch` 本地文件，因此母带音频通过 base64 伴生脚本
  （`vendor/master-audio.js`，15 MB，懒加载）或手动选择提供
- **角色为正面 2D 骨架**：CAST 骨架本身不支持连续偏航角，侧/背面用 `flip` + `sq` 近似

---

## 署名与许可

### 音乐

- 原曲：《老鼠爱大米》
- 词曲原作：**杨臣刚**（2004）
- 本作为非商业同人改编，改编歌词与演唱由 MiMo-V2.5-TTS 生成

### 角色

- 角色原型：**DeepSeek 鲸鱼娘**
- 女仆鲸鱼娘设计：**@ZipZipPipe**、**@这个刀子真甜**、**@polaris0**
- 本作在 [let-me-go-code-mv](https://github.com/beidou070/let-me-go-code-mv)（作者 polaris0 / beidou070）
  的角色形象基础上做了微调，特此致谢

### 许可

| 内容 | 许可 |
| --- | --- |
| 项目自有代码 | **AGPL-3.0**（见 [`LICENSE`](LICENSE)） |
| 角色衍生部分 | **CC BY-NC-SA 4.0**（署名 · 非商业 · 相同方式共享） |
| mp4-muxer | MIT |
| p5.js / p5.brush | LGPL-2.1 / MIT |

第三方组件与素材的完整权利清单见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

**本作为非商业同人作品。** 角色形象版权归原作者所有；二次使用请遵守上述许可并保留署名。

---

## 致谢

- **DeepSeek Harness desktop** —— 分镜、角色、场景与动画代码的主要开发环境
- **MiMo-V2.5-TTS** —— 歌唱音源合成
- **polaris0 / beidou070** —— [let-me-go-code-mv](https://github.com/beidou070/let-me-go-code-mv)
  提供了优秀的角色骨架与工程范式
- **Demucs / WORLD / pyloudnorm / mp4-muxer** —— 音频与封装基础设施
