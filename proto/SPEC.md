# 《肥鱼爱大米》角色建模细化 · 部件开发规范

> 本目录是一个**多 agent 并行开发的工作台**。每位 agent 只负责一个部件文件，互不冲突。
> 主控（父 agent）负责总装、集成进单文件 MV，并在真实浏览器中验收。

---

## 1. 角色与目标

- 角色：DeepSeek 鲸鱼娘「大肥鱼（深深）」，2.5 头身 Q 版水彩女仆。
- 参考原画：`../../参考三视图-深深.png`（3840×2143，正面 / 侧面 / 背面三视图）。
- 已裁切局部参考（直接 `read_image` 查看）：
  - `../ref_head_front.png` 正面头部特写
  - `../ref_head_side.png` 侧面头部特写
  - `../ref_front_full.png` 正面全身
  - `../ref_side_full.png` 侧面全身
  - `../ref_back_full.png` 背面全身
  - `../ref_body_front.png` 正面裙装
  - `../ref_body_side.png` 侧面裙装
- 目标：**深度细化**建模，达到“可以逐帧截图当手书原画”的完成度；任何视角（含 -78° 正侧、±135° 背侧）都不能出现穿帮。
- 已知严重 bug：旧版在 -78° 侧面时**只有脸盘、没有眼睛**。新部件必须在任意 yaw 下正确显示“近侧单眼 + 侧脸轮廓”。

---

## 2. 游戏规则（必须遵守）

1. **只改你被分配的文件**（见任务书），不要动 `00_util.js`、不要动 `肥鱼爱大米.html`、不要动其他部件文件。
2. 需要额外工具函数时，在你自己的部件文件里定义，并加前缀避免重名（例如 `head_makeEyePath`）。
3. 所有绘制必须**自包含**：不依赖 DOM、不依赖外部图片、不依赖其他部件函数。
4. 统一使用 `S` 状态对象（见 §4），禁止读取全局动画变量。
5. 画布为 Canvas 2D，坐标系见 §3；**不要自己 translate 到别的位置**，直接以传入的 ctx 原点作图。
6. 必须真实渲染截图并用 `read_image` 亲眼检查，至少迭代 3 轮。**没有截图证据 = 未完成**。

---

## 3. 坐标系与比例锚点

本地坐标，原点 `(0,0)` = 头部中心；**x 向右为正，y 向下为正**（与 canvas 一致）。

```
                 ahogeTop  -150
     hairTop  -112 ┌───────────────┐
                   │   刘海/发箍    │
      faceTop -58  │  ┌─────────┐  │
                   │  │ 眼睛 y=4 │  │
                   │  │ 嘴  y=37 │  │
        chinY  54  │  └─────────┘  │
                   │     脖子       │
   shoulderY  70   ├──── 肩 ───────┤
       waistY  98  │     腰         │
    skirtHemY 146  │    裙摆        │
       feetY  172  └──── 脚 ───────┘
```

统一比例常量已放在 `00_util.js` 的 `FISH` 对象里（直接引用，不要复制魔数）：

| 常量 | 值 | 含义 |
|---|---|---|
| `FISH.faceHalfW` | 42 | 脸颊半宽 |
| `FISH.faceTop` / `chinY` | -58 / 54 | 额头 / 下巴 |
| `FISH.eyeX` / `eyeY` | 21 / 4 | 眼中心 |
| `FISH.eyeW` / `eyeH` | 18 / 19 | 眼半宽 / 半高 |
| `FISH.noseY` / `mouthY` | 22 / 37 | 鼻 / 嘴 |
| `FISH.shoulderY` | 70 | 肩线 |
| `FISH.waistY` / `skirtHemY` | 98 / 146 | 腰 / 裙摆底 |
| `FISH.feetY` | 172 | 脚底 |
| `FISH.hairHalfW` | 86 | 头发最大半宽 |
| `FISH.hairTop` / `ahogeTop` | -112 / -150 | 发顶 / 呆毛尖 |
| `FISH.headR` | rx47 ry58 rz52 faceZ50 | 头部椭球 |

> 允许在 ±8% 内微调，但必须保持“头 : 身 ≈ 1 : 0.95”的 Q 版比例，且不得超出以上锚点太多。

### 2.5D 投影

`projFace(S, x, y, z)` 已实现：输入头部球面坐标（x 右正、y 下正、**z 朝向观察者为正**），
返回 `{x, y, z, k}`。`z <= 0` 表示该点已转到脑后不可见；`k` 是近大远小系数。

- 正面：`yaw=0`，`sinY=0, cosY=1`
- 3/4 侧：`yaw≈±28°`
- 正侧：`yaw=-78°`（角色面朝画面左侧，**近侧眼在左半边**）
- 背面：`yaw=180°`

眼睛用球面坐标大致为 `z ≈ 44~48`、`x = ±21`。示例：

```js
const near = projFace(S, -FISH.eyeX, FISH.eyeY, 46);  // 左眼
const far  = projFace(S,  FISH.eyeX, FISH.eyeY, 46);  // 右眼
```

在 `yaw=-78°` 时，`near.z` 约为 -15（不可见），`far.z` 约为 +30（可见，投影 x ≈ -33）。
**这就是正侧视图只画一只眼的数学依据。**

---

## 4. 状态对象 `S`（makeFishState 生成）

```js
S = {
  yaw, sinY, cosY, radYaw,        // 偏航
  pitch, pitchRad,                // 俯仰（-15..15）
  profile,                        // |yaw|/90，0 正 1 侧
  sideProfileFactor,              // |sinY|
  isBack,                         // |yaw|>115
  faceShiftX,                     // sinY*22（旧版遗留，可选用）
  expr,                           // normal|sparkle|pout|smug|focused|brace|happy|sleepy
  pose,                           // stand|sing|holdBowl|hugBowl|poutHips|eureka|shareRice|sleepDesk|countToken
  t,                              // 秒
  breath, singBeat, walkBob,
  hairWave1, hairWave2,           // 发丝摆动
  tailAngle, finFlap, ahogeBounce,
  mouth: { openness, vowel },     // 歌唱口型：openness 0..1, vowel a/o/e/i/u/closed
  lookX, lookY,                   // 眼珠视线偏移（-1..1）
  pal: { INK, HAIR_*, DRESS_*, GOLD*, CREAM, ... }
}
```

表情语义：
- `normal` 平静；`sparkle` 双眼星星高光 + 张嘴笑；`pout` 鼓腮撅嘴（腮帮外扩 8px）；
- `smug` 得意（半眯眼 + 嘴角上扬）；`focused` 专注（眉压低压，眼神锐利）；
- `brace` 咬牙护碗（眉紧、嘴闭紧）；`happy` 弯眼笑（^ ^）；`sleepy` 困倦（半闭眼 + 小泪泡）。

---

## 5. 美术风格

- **水彩纸感 + 手绘墨线**：大面积色块用 `wcWashBlob()` 做天然毛边晕染，轮廓用 `hbStrokePath()` 双描边。
- 参考图是干净赛璐璐，本片是水彩手书风——**取参考图的造型比例与花纹，用本片的水彩笔触表现**。
- 色板严格用 `S.pal` / 全局常量，不要自创高饱和色。
- 线条：外轮廓 2.4~2.8，内部结构线 1.4~2.2，阴影不用黑，用深藏青 `#1c2442` 半透明。
- 高光：头发用浅天蓝椭圆斑（`HAIR_LIGHT`），眼睛用水滴/方形高光。
- 不要描死黑边、不要用纯灰阴影、不要用 CSS 滤镜。

### 关键造型要点（务必对照参考图）

**正面**
- 眼睛巨大（半宽 ≈ 18），上眼睑粗黑上扬，外眼角有 2~3 根睫毛；虹膜上深藏青、中钴蓝、下荧光冰蓝月牙；左上大椭圆高光 + 底部浅蓝圆光。
- 眉毛细短，**画在刘海之上**（参考图如此）。
- 鼻子几乎不可见（一个小点），嘴极小（一条 3~5px 的短线）。
- 刘海分多束，发梢尖细；鬓发垂到下巴以下；头顶呆毛是一个大圆环卷。
- 发箍是白色蕾丝荷叶边（喀秋莎），前缘压住刘海根部，两侧各一个天蓝缎带蝴蝶结 + 金色爱心扣。
- 鲸鳍耳在眼睛高度两侧水平伸出：上层深藏青流线鳍，下层白色羽状鳍（4 根扇骨）。

**侧面（-78°，重点）**
- 脸只剩一条月牙：额头 → 眉弓 → 小鼻尖 → 人中 → 小嘴 → 下巴 → 下颌线，后脑全部被头发包住。
- **近侧单眼必须完整可见**，位于脸部前缘，眼白/虹膜/睫毛齐全；远侧眼完全不可见。
- 鼻子是脸缘上的一个小凸起（2~3px），嘴唇微微前突。
- 鬓发从耳前垂下，遮住脸颊后半部；发箍沿头顶前后走向，蝴蝶结在耳侧。

**背面**
- 全是头发的体积与分束，发箍像光环，无五官。

---

## 6. 你的工作流

### 6.1 预览

共享检视台：`proto/harness.html`，参数：

- `part`：`head` | `hair` | `accessories` | `body` | `arms` | `legs` | `tail` | `full`
- `yaws`：逗号分隔角度，默认 `-78,-40,0,40,78,180`
- `expr`：表情；`pose`：动作；`t`：时间秒；`pitch`：俯仰；`scale`：缩放

示例（正面/3⁄4/侧面/背面 8 个角度）：

```
file:///D:/Datum/nuclearBomb/Motion/肥鱼爱大米/proto/harness.html?part=head&yaws=-90,-78,-45,0,45,78,90,180
```

### 6.2 截图（Windows，headless Edge）

```bash
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=2400,1100 \
  --screenshot="D:\\Datum\\nuclearBomb\\Motion\\肥鱼爱大米\\proto\\shot_head.png" \
  "file:///D:/Datum/nuclearBomb/Motion/肥鱼爱大米/proto/harness.html?part=head&yaws=-90,-78,-45,0,45,78,90,180"
```

然后用 `read_image` 打开 `proto/shot_head.png` 亲眼检查。**每轮必须看图。**

---### 6.3 迭代标准

1. 先搭“能看”的结构（剪影、比例、位置）。
2. 再补细节（睫毛、高光、蕾丝、刺绣、褶皱）。
3. 每轮至少检查：正面 0°、3/4 侧 ±45°、正侧 -78°、背面 180°。
4. 侧面必须能一眼看出“这是同一个人”，且眼睛不缺。
5. 表情 `normal / sparkle / pout / happy / sleepy / brace` 至少各截一张，不能穿模。

---

## 7. 交付物

- 你的部件 JS 文件（只改这一个）。
- 最终截图：`proto/shot_<part>_<角度组>.png`（至少 3 张：多角度、正面特写、侧面特写）。
- 一段简短中文总结：实现了什么、与参考图的对应关系、已知限制。
- 如果你开了子 agent 做孙部件，请在总结里说明分工与最终采用版本。

禁止：修改 `肥鱼爱大米.html`、修改其他部件文件、修改 `00_util.js`、删除他人的截图。
