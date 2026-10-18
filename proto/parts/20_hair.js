/* ============================================================================
 * 肥鱼爱大米 · 头发  v2   (proto/parts/20_hair.js)
 * 入口：drawHairBack(ctx,S) / drawHairFront(ctx,S)
 *
 * 造型（对照 ref_head_front / ref_head_side / ref_back_full / ref_side_full）
 *   · 发根 #253464 → #3c61ae → #629be4 → 发梢 #92cbf9，冠部浅蓝高光斑
 *   · 后发：8 束大波浪（外层长绺，自头顶发旋呈放射状散开）+ 4 束内层短绺
 *   · 刘海：7 束尖细发绺，中分后向两侧扫，覆盖额头但不遮眼（眼中心 y=4，上眼睑顶 ≈ -17）
 *   · 鬓发：左右各一束主流 + 一束辅流，垂到 y≈70~85，发梢外翘
 *   · 呆毛：头顶一个大圆环卷，随 S.ahogeBounce 微动
 *
 * 2.5D：后发用「绕头背侧带」参数 (u,y) 投影：
 *      u = sinθ ∈ [-1,1]，u=0 为后脑正中；
 *      屏幕 x = Rx(y)·u·cosY + Rz(y)·(-√(1-u²))·sinY + shift(y)
 *      正/侧/背自动成立：侧面时后脑自动向画面后方鼓出，发梢自动收拢。
 * 刘海/鬓发用「前侧带」参数 θ 投影。
 * 背面（>104°）时 drawHairFront 会再补一层完整后发（盖住头部与身体），
 *      保证背面无五官、无刘海。
 * ========================================================================== */

/* ------------------------------------------------------------------ 参数 */
const HAIRC = {
  rx: 86,            // FISH.hairHalfW
  rzTop: 72,         // 颅顶前后深度
  rzCurt: 58,        // 发帘前后深度
  top: -112,         // FISH.hairTop
  ink: '#1c2442'
};

/* 高度方向轮廓系数（0 = 头顶收尖，1 = 最宽） */
const HAIR_PROF_KEYS = [
  [-115, 0.015], [-109, 0.19], [-102, 0.325], [-94, 0.45], [-85, 0.56],
  [-74, 0.655], [-62, 0.735], [-48, 0.80], [-32, 0.855], [-16, 0.90],
  [2, 0.932], [20, 0.958], [38, 0.98], [56, 0.995], [72, 1.0],
  [86, 0.99], [96, 0.968], [104, 0.936], [112, 0.89], [118, 0.835],
  [124, 0.76], [129, 0.665]
];

function hair_prof(y) {
  const K = HAIR_PROF_KEYS;
  if (y <= K[0][0]) return K[0][1];
  if (y >= K[K.length - 1][0]) return K[K.length - 1][1];
  for (let i = 0; i < K.length - 1; i++) {
    const y0 = K[i][0], v0 = K[i][1], y1 = K[i + 1][0], v1 = K[i + 1][1];
    if (y >= y0 && y <= y1) {
      const t = smoothstep(y0, y1, y);
      return v0 + (v1 - v0) * t;
    }
  }
  return 1;
}

function hair_rz(y) {
  return lerpVal(HAIRC.rzTop, HAIRC.rzCurt, smoothstep(-64, 52, y));
}

/* 发帘后移：侧面时让长发整体向后脑靠，避免糊到脸上 */
function hair_shift(S, y) {
  return -S.sinY * (22 * smoothstep(-74, 30, y) + 8 * smoothstep(58, 118, y));
}

/* 背侧带投影：u ∈ [-1,1] */
function hair_pt(S, u, y) {
  const pr = hair_prof(y);
  const rx = HAIRC.rx * pr;
  const rz = hair_rz(y) * pr;
  const ct = -Math.sqrt(Math.max(0, 1 - u * u));
  return {
    x: rx * u * S.cosY + rz * ct * S.sinY + hair_shift(S, y),
    y: y,
    z: -rx * u * S.sinY + rz * ct * S.cosY,
    pr: pr
  };
}

/* 背侧带在某个高度的屏幕左右边界（剪影） */
function hair_span(S, y) {
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i <= 44; i++) {
    const u = -1 + (2 * i) / 44;
    const x = hair_pt(S, u, y).x;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return { lo: lo, hi: hi };
}

/* 前侧带投影（刘海 / 鬓发）：theta 弧度，0 = 脸正前 */
function hair_frontPt(S, th, y, rx, rz) {
  const s = Math.sin(th), c = Math.cos(th);
  return {
    x: rx * s * S.cosY + rz * c * S.sinY,
    y: y,
    z: -rx * s * S.sinY + rz * c * S.cosY
  };
}

/* 发色渐变（全局纵向，所有发片共用，保证衔接一致） */
function hair_gradient(ctx) {
  const g = ctx.createLinearGradient(0, -118, 0, 134);
  g.addColorStop(0.00, '#2c3f78');
  g.addColorStop(0.14, '#334a8b');
  g.addColorStop(0.30, '#3c599c');
  g.addColorStop(0.46, '#466aad');
  g.addColorStop(0.62, '#537dbd');
  g.addColorStop(0.76, '#6694d2');
  g.addColorStop(0.88, '#82b6ea');
  g.addColorStop(0.96, '#9ad0f7');
  g.addColorStop(1.00, '#b2e3fe');
  return g;
}

/* ------------------------------------------------------------------ 路径 */
/* Catmull-Rom → 三次贝塞尔命令 */
function hair_smoothCmds(pts) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    out.push({
      t: 'c',
      c1x: p1.x + (p2.x - p0.x) / 6, c1y: p1.y + (p2.y - p0.y) / 6,
      c2x: p2.x - (p3.x - p1.x) / 6, c2y: p2.y - (p3.y - p1.y) / 6,
      x: p2.x, y: p2.y
    });
  }
  return out;
}

function hair_runCmds(ctx, cmds) {
  for (const c of cmds) {
    if (c.t === 'm') ctx.moveTo(c.x, c.y);
    else if (c.t === 'l') ctx.lineTo(c.x, c.y);
    else if (c.t === 'q') ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
    else ctx.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, c.x, c.y);
  }
}

/* 发丝线：细墨线（1.2~1.8），带一点手抖复描 */
function hair_line(ctx, cmds, color, w, seed, alpha) {
  if (alpha !== undefined && alpha <= 0.01) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha === undefined ? 0.72 : alpha;
  ctx.lineWidth = w;
  ctx.beginPath();
  hair_runCmds(ctx, cmds);
  ctx.stroke();
  const ox = (detHash(seed * 13.7) - 0.5) * 0.9;
  const oy = (detHash(seed * 23.1) - 0.5) * 0.9;
  ctx.globalAlpha *= 0.34;
  ctx.lineWidth = w * 0.5;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.beginPath();
  hair_runCmds(ctx, cmds);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

/* ------------------------------------------------------------------ 发束 */
/* 外层长发：三点贝塞尔中心线 (root → mid → tip)，u 为横向位置(±1)
 * curl > 0 表示发梢末端向上回勾（外卷） */
const HAIR_STRANDS = [
  // 左外 ← 发旋 ← 右外（左右不完全对称，更自然）
  { ur: -0.10, yr: -101, um: -0.95, ym: 18, ut: -1.00, yt: 113, w: 21, hook: -17, curl: 9, tone: 1, ph: 0.2 },
  { ur: -0.05, yr: -100, um: -0.70, ym: 34, ut: -0.83, yt: 121, w: 19, hook: -8, curl: 5, tone: -1, ph: 1.3 },
  { ur: 0.00, yr: -99, um: -0.41, ym: 46, ut: -0.50, yt: 106, w: 17, hook: -3, curl: 3, tone: 1, ph: 2.4 },
  { ur: -0.02, yr: -98, um: -0.12, ym: 50, ut: -0.13, yt: 119, w: 16, hook: -1, curl: 2, tone: -1, ph: 3.5 },
  { ur: 0.03, yr: -98, um: 0.20, ym: 48, ut: 0.25, yt: 109, w: 16, hook: 1, curl: 2, tone: 1, ph: 4.6 },
  { ur: 0.00, yr: -99, um: 0.47, ym: 44, ut: 0.58, yt: 122, w: 18, hook: 5, curl: 4, tone: -1, ph: 5.7 },
  { ur: -0.04, yr: -100, um: 0.73, ym: 32, ut: 0.86, yt: 107, w: 19, hook: 9, curl: 5, tone: 1, ph: 0.9 },
  { ur: -0.09, yr: -101, um: 0.95, ym: 15, ut: 1.00, yt: 116, w: 21, hook: 16, curl: 8, tone: -1, ph: 2.1 }
];

/* 内层短绺：叠在外层之上，形成第二层 */
const HAIR_STRANDS_MID = [
  { ur: -0.24, yr: -95, um: -0.60, ym: 22, ut: -0.67, yt: 93, w: 16, hook: -6, curl: 4, tone: 1, ph: 1.1 },
  { ur: -0.10, yr: -99, um: -0.26, ym: 32, ut: -0.28, yt: 102, w: 15, hook: -1, curl: 2, tone: -1, ph: 2.7 },
  { ur: 0.12, yr: -99, um: 0.31, ym: 34, ut: 0.35, yt: 97, w: 15, hook: 1, curl: 2, tone: 1, ph: 4.0 },
  { ur: 0.26, yr: -95, um: 0.63, ym: 24, ut: 0.69, yt: 89, w: 16, hook: 6, curl: 4, tone: -1, ph: 5.3 }
];

/* 单束几何 */
function hair_strandGeom(S, st, N) {
  N = N || 32;
  const L = [], R = [], C = [];
  const sway = (S.hairWave1 * 0.55 + S.hairWave2 * 0.35);
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const e = s;
    const y = (1 - e) * (1 - e) * st.yr + 2 * (1 - e) * e * st.ym + e * e * st.yt;
    let u = (1 - e) * (1 - e) * st.ur + 2 * (1 - e) * e * st.um + e * e * st.ut;
    u += (st.ph ? 0.012 * Math.sin(Math.PI * s * 2 + st.ph) * s * (1 - s) * 2.4 : 0);
    if (st.hook) u += 0;
    const p = hair_pt(S, u, y);
    const hook = (st.hook || 0) * Math.pow(smoothstep(0.66, 1.0, s), 1.45);
    const curl = (st.curl || 0) * Math.pow(smoothstep(0.80, 1.0, s), 1.3);
    const swayX = sway * Math.pow(s, 1.6) * 0.55;
    const px = p.x + hook + swayX;
    const py = p.y - curl;
    let nx = 0, ny = 1;
    if (prev) {
      let tx = px - prev.x, ty = py - prev.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      nx = -ty; ny = tx;
    }
    const taper = (0.52 + 0.56 * Math.sin(Math.PI * Math.pow(s, 0.78))) * Math.pow(1 - s, 0.30);
    const hw = st.w * taper;
    L.push({ x: px + nx * hw, y: py + ny * hw });
    R.push({ x: px - nx * hw, y: py - ny * hw });
    C.push({ x: px, y: py });
    prev = { x: px, y: py };
  }
  return { L, R, C };
}

/* 发束发梢点（用于后发剪影底部波浪） */
function hair_strandTip(S, st) {
  const p = hair_pt(S, st.ut, st.yt);
  return { x: p.x + (st.hook || 0), y: st.yt - (st.curl || 0), z: p.z };
}

/* 画一束：填充 + 两侧发丝线（不描根部，融入发团） */
function hair_drawStrand(ctx, S, st, grad, opts) {
  opts = opts || {};
  const g = hair_strandGeom(S, st);
  const v = opts.alpha === undefined ? 1 : opts.alpha;
  if (v <= 0.01) return;
  const pathFn = () => {
    ctx.beginPath();
    ctx.moveTo(g.L[0].x, g.L[0].y);
    for (let i = 1; i < g.L.length; i++) ctx.lineTo(g.L[i].x, g.L[i].y);
    for (let i = g.R.length - 1; i >= 0; i--) ctx.lineTo(g.R[i].x, g.R[i].y);
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha = v;
  pathFn();
  ctx.fillStyle = grad;
  ctx.fill();

  // 束内轻阴影（靠内侧一条）+ 受光侧提亮
  ctx.save();
  pathFn();
  ctx.clip();
  ctx.globalAlpha = v * (opts.shade ? 0.34 : 0.22);
  ctx.fillStyle = '#18254f';
  ctx.beginPath();
  const k0 = Math.floor(g.C.length * 0.12);
  ctx.moveTo(g.L[k0].x, g.L[k0].y);
  for (let i = k0 + 1; i < g.C.length; i++) ctx.lineTo(g.L[i].x, g.L[i].y);
  for (let i = g.C.length - 1; i >= k0; i--) {
    ctx.lineTo(lerpVal(g.C[i].x, g.L[i].x, 0.42), lerpVal(g.C[i].y, g.L[i].y, 0.42));
  }
  ctx.closePath();
  ctx.fill();
  if (opts.light) {
    ctx.globalAlpha = v * 0.20;
    ctx.fillStyle = '#9fd3fa';
    ctx.beginPath();
    ctx.moveTo(g.R[k0].x, g.R[k0].y);
    for (let i = k0 + 1; i < g.C.length; i++) ctx.lineTo(g.R[i].x, g.R[i].y);
    for (let i = g.C.length - 1; i >= k0; i--) {
      ctx.lineTo(lerpVal(g.C[i].x, g.R[i].x, 0.55), lerpVal(g.C[i].y, g.R[i].y, 0.55));
    }
    ctx.closePath();
    ctx.fill();
  }
  // 明暗交替的束带（让 8 束更容易读出来）
  if (st.tone) {
    ctx.globalAlpha = v * 0.13;
    ctx.fillStyle = st.tone > 0 ? '#a6d8fb' : '#16224a';
    ctx.fillRect(-160, -170, 320, 360);
  }
  ctx.restore();

  // 两侧发丝线（最外侧的发束加粗外缘，接续剪影）
  const mk = (arr) => hair_smoothCmds(arr.map(p => ({ x: p.x, y: p.y })));
  const outerR = opts.thickOuter && st.ut > 0.8;
  const outerL = opts.thickOuter && st.ut < -0.8;
  hair_line(ctx, mk(g.L), HAIRC.ink, outerL ? 2.5 : 1.75, 101 + (st.ph || 0) * 7, (outerL ? 0.92 : 0.74) * v);
  hair_line(ctx, mk(g.R), HAIRC.ink, outerR ? 2.5 : 1.75, 137 + (st.ph || 0) * 5, (outerR ? 0.92 : 0.74) * v);
  // 受光侧浅色发丝
  const litCmds = hair_smoothCmds(g.R.slice(2, Math.max(3, g.R.length - 6)).map(p => ({ x: p.x, y: p.y })));
  hair_line(ctx, litCmds, HAIR_LIGHT, 1.2, 77 + (st.ph || 0) * 3, 0.30 * v);
  ctx.restore();
}

/* ------------------------------------------------------------------ 后发 */
/* 后发侧边剪影点（右 / 左，自下而上） */
function hair_backSides(S) {
  const ys = [-111, -104, -96, -87, -77, -66, -54, -41, -27, -12, 4, 20, 36, 51, 65, 78, 88];
  const wave = (y) => 1 + 0.012 * Math.sin((y - 4) * 0.135) * smoothstep(52, 72, y);
  const right = [], left = [];
  for (const y of ys) {
    const sp = hair_span(S, y);
    const mid = (sp.lo + sp.hi) * 0.5;
    const k = wave(y);
    right.push({ x: mid + (sp.hi - mid) * k, y: y });
    left.push({ x: mid + (sp.lo - mid) * k, y: y });
  }
  return { right: right, left: left };
}

/* 底层发团填充路径：顶部 → 右侧 → 底部随发梢起伏 → 左侧 */
function hair_backFillCmds(S, sides, tips) {
  const top = { x: 0, y: -114 };
  const cmds = [];
  cmds.push({ t: 'm', x: top.x, y: top.y });
  for (const c of hair_smoothCmds([top].concat(sides.right))) cmds.push(c);

  // 底边：发梢是尖角，梢间是浅圆凹（发梢高度差很大，边缘自然不齐）
  const tps = tips.slice().sort((A, B) => A.x - B.x);
  const rEnd = sides.right[sides.right.length - 1];
  const lEnd = sides.left[sides.left.length - 1];
  const tR = tps[tps.length - 1];
  const tL = tps[0];
  cmds.push({ t: 'q', cx: rEnd.x * 0.99 + tR.x * 0.01, cy: rEnd.y + 8, x: tR.x, y: tR.y });
  for (let k = tps.length - 1; k >= 1; k--) {
    const A = tps[k], B = tps[k - 1];
    const vx = A.x * 0.45 + B.x * 0.55;
    const vy = Math.min(A.y, B.y) - 4;
    cmds.push({ t: 'q', cx: vx + (A.x - vx) * 0.45, cy: vy + 3, x: vx, y: vy });
    cmds.push({ t: 'l', x: B.x, y: B.y });
  }
  cmds.push({ t: 'q', cx: lEnd.x * 0.99 + tL.x * 0.01, cy: lEnd.y + 8, x: lEnd.x, y: lEnd.y });
  const leftUp = sides.left.slice(0, sides.left.length - 1).reverse();
  for (const c of hair_smoothCmds([lEnd].concat(leftUp))) cmds.push(c);
  cmds.push({ t: 'q', cx: 0, cy: -114, x: top.x, y: top.y });
  return cmds;
}

/* 横向裁剪路径：侧边 + 很低的底边（发梢不裁） */
function hair_backClipCmds(S, sides) {
  const top = { x: 0, y: -114 };
  const cmds = [];
  cmds.push({ t: 'm', x: top.x, y: top.y });
  for (const c of hair_smoothCmds([top].concat(sides.right))) cmds.push(c);
  const rEnd = sides.right[sides.right.length - 1];
  const lEnd = sides.left[sides.left.length - 1];
  cmds.push({ t: 'l', x: rEnd.x, y: 143 });
  cmds.push({ t: 'l', x: lEnd.x, y: 143 });
  const leftUp = sides.left.slice(0, sides.left.length - 1).reverse();
  for (const c of hair_smoothCmds([lEnd].concat(leftUp))) cmds.push(c);
  cmds.push({ t: 'q', cx: 0, cy: -114, x: top.x, y: top.y });
  return cmds;
}

/* 外轮廓墨线：只描顶部与两侧（底部交给发梢自己的线） */
function hair_backContourCmds(S, sides) {
  const top = { x: 0, y: -114 };
  const lEnd = sides.left[sides.left.length - 1];
  const leftUp = sides.left.slice(0, sides.left.length - 1).reverse();
  const cmds = [];
  cmds.push({ t: 'm', x: lEnd.x, y: lEnd.y });
  for (const c of hair_smoothCmds([lEnd].concat(leftUp, [top]))) cmds.push(c);
  for (const c of hair_smoothCmds([top].concat(sides.right))) cmds.push(c);
  return cmds;
}

/* 后发整体（base + 发束 + 高光 + 描边） */
function hair_drawBackMass(ctx, S, opts) {
  opts = opts || {};
  const alpha = opts.alpha === undefined ? 1 : clamp(opts.alpha, 0, 1);
  if (alpha <= 0.01) return;

  const grad = hair_gradient(ctx);
  const sides = hair_backSides(S);
  const tips = HAIR_STRANDS.map(st => {
    const t = hair_strandTip(S, st);
    return { x: t.x, y: Math.min(t.y, 126) };
  }).sort((a, b) => a.x - b.x);
  const fillCmds = hair_backFillCmds(S, sides, tips);
  const clipCmds = hair_backClipCmds(S, sides);
  const sidesOnly = hair_backContourCmds(S, sides);

  ctx.save();
  ctx.globalAlpha = alpha;

  // 1) 底层发团
  ctx.beginPath();
  hair_runCmds(ctx, fillCmds);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(24,34,72,0.20)';
  ctx.fillRect(-150, -160, 300, 340);
  ctx.restore();

  // 2) 裁剪到发团（侧边限制 + 底部放开，发梢不被裁）
  ctx.save();
  ctx.beginPath();
  hair_runCmds(ctx, clipCmds);
  ctx.closePath();
  ctx.clip();

  ctx.globalAlpha = alpha;

  // 淡淡的横向水彩，打破平涂
  const wash1 = [[-0.62, -40, 22, 12, 11], [-0.10, -20, 26, 13, 12], [0.52, -6, 20, 12, 13], [0.80, 26, 14, 20, 14]];
  for (const w of wash1) {
    const p = hair_pt(S, w[0], w[1]);
    wcWashBlob(ctx, p.x, p.y, w[2], w[3], HAIR_BRIGHT, 0.18, w[4]);
  }

  // 3) 外层长绺，先远后近
  const long = HAIR_STRANDS.slice();
  long.sort((a, b) => hair_pt(S, (a.ur + a.ut) * 0.5, (a.yr + a.yt) * 0.5).z -
    hair_pt(S, (b.ur + b.ut) * 0.5, (b.yr + b.yt) * 0.5).z);
  long.forEach((st) => hair_drawStrand(ctx, S, st, grad, { shade: true, light: true, thickOuter: true }));

  // 4) 内层短绺压在外层之上（第二层）
  HAIR_STRANDS_MID.forEach((st) => hair_drawStrand(ctx, S, st, grad, { shade: true, light: true, alpha: 0.97 }));

  // 5) 冠部浅蓝高光斑
  hair_drawCrownHighlights(ctx, S);


  ctx.restore();

  // 7) 侧光：左亮右暗，给发团体积（裁到发团内，避免溢出）
  ctx.save();
  ctx.beginPath();
  hair_runCmds(ctx, fillCmds);
  ctx.closePath();
  ctx.clip();
  const lg = ctx.createLinearGradient(-92, 0, 92, 0);
  lg.addColorStop(0.00, 'rgba(176,219,253,0.26)');
  lg.addColorStop(0.34, 'rgba(150,200,246,0.10)');
  lg.addColorStop(0.58, 'rgba(90,130,190,0.00)');
  lg.addColorStop(0.82, 'rgba(18,26,64,0.18)');
  lg.addColorStop(1.00, 'rgba(14,20,54,0.30)');
  ctx.fillStyle = lg;
  ctx.fillRect(-150, -160, 300, 340);
  ctx.restore();

  // 8) 外轮廓墨线（整圈）
  ctx.globalAlpha = alpha;
  hbStrokePath(ctx, (c) => { hair_runCmds(c, fillCmds); c.closePath(); }, INK, 2.7, 120);
  ctx.restore();
}

/* 冠部高光 */
function hair_drawCrownHighlights(ctx, S) {
  const kx = 0.52 + 0.48 * Math.abs(S.cosY);
  const spots = [
    { u: -0.52, y: -88, rx: 13, ry: 7.0, a: 0.56, rot: -0.42 },
    { u: -0.32, y: -96, rx: 8, ry: 5.0, a: 0.46, rot: -0.24 },
    { u: -0.10, y: -86, rx: 10, ry: 6.0, a: 0.40, rot: 0.02 },
    { u: 0.22, y: -94, rx: 8, ry: 5.0, a: 0.40, rot: 0.20 },
    { u: 0.46, y: -82, rx: 11, ry: 6.5, a: 0.46, rot: 0.34 },
    { u: 0.74, y: -56, rx: 8, ry: 5.0, a: 0.32, rot: 0.5 },
    { u: -0.76, y: -52, rx: 7.5, ry: 5.0, a: 0.30, rot: -0.5 }
  ];
  spots.forEach((sp, i) => {
    const p = hair_pt(S, sp.u, sp.y);
    if (sp.y > -66 && p.z < -20) return;
    wcWashBlob(ctx, p.x, p.y, sp.rx * kx, sp.ry, HAIR_LIGHT, sp.a, 31 + i, sp.rot);
  });
  const streak = [
    { u: -0.42, y: -92, len: 16, a: 0.40 },
    { u: 0.10, y: -98, len: 14, a: 0.34 },
    { u: 0.52, y: -74, len: 18, a: 0.30 }
  ];
  streak.forEach((sk) => {
    const a = hair_pt(S, sk.u, sk.y);
    const b = hair_pt(S, sk.u + 0.06 * (S.cosY >= 0 ? 1 : -1), sk.y + sk.len);
    if (a.z < -20 && a.y > -70) return;
    ctx.save();
    ctx.globalAlpha = sk.a;
    ctx.strokeStyle = HAIR_LIGHT;
    ctx.lineWidth = 3.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) * 0.5 + 1.5, (a.y + b.y) * 0.5, b.x, b.y);
    ctx.stroke();
    ctx.restore();
  });
}

/* 发梢提亮 + 冰蓝光泽 */
function hair_drawTipGlow(ctx, S) {
  for (let i = 0; i < HAIR_STRANDS.length; i++) {
    const st = HAIR_STRANDS[i];
    const tip = hair_strandTip(S, st);
    wcWashBlob(ctx, tip.x - (st.hook || 0) * 0.6, st.yt - 14, 9, 16, HAIR_TIP, 0.34, 200 + i, 0.16);
    wcWashBlob(ctx, tip.x - (st.hook || 0) * 0.6, st.yt - 6, 5, 8, '#bce8ff', 0.34, 300 + i);
  }
}

function drawHairBack(ctx, S) {
  if (!ctx || !S) return;
  hair_drawBackMass(ctx, S, { alpha: 1 });
}

/* --------------------------------------------------------------- 刘海 */
/* 刘海发缕：th0 发根角, th1 发梢角(度), y1 发梢高度, w 半宽 */
const HAIR_BANGS = [
  { th0: -9, th1: -78, y0: -106, yc: -66, y1: 1, w: 20, tone: 1, ph: 0.4 },
  { th0: -6, th1: -51, y0: -107, yc: -64, y1: -13, w: 19, tone: -1, ph: 1.5 },
  { th0: -4, th1: -23, y0: -108, yc: -60, y1: -22, w: 17, tone: 1, ph: 2.6 },
  { th0: 6, th1: 19, y0: -108, yc: -60, y1: -20, w: 17, tone: -1, ph: 3.4 },
  { th0: 8, th1: 46, y0: -107, yc: -64, y1: -12, w: 19, tone: 1, ph: 4.5 },
  { th0: 11, th1: 76, y0: -106, yc: -66, y1: 0, w: 20, tone: -1, ph: 5.6 }
];

const HAIR_BANG_RX = 48, HAIR_BANG_RZ = 46;

/* 刘海底层发片：填住发绺间的缝隙（下缘约 -34，不遮眼） */
function hair_bangCapCmds(S) {
  const D2R = Math.PI / 180;
  const edge = [
    { y: -113, th: 4 }, { y: -108, th: 14 }, { y: -101, th: 26 }, { y: -93, th: 38 },
    { y: -84, th: 48 }, { y: -74, th: 58 }, { y: -64, th: 67 }, { y: -54, th: 75 },
    { y: -44, th: 81 }, { y: -34, th: 86 }
  ];
  const top = { x: 0, y: -113 };
  const rightPts = edge.map(e => hair_frontPt(S, e.th * D2R, e.y, HAIR_BANG_RX, HAIR_BANG_RZ));
  const cmds = [];
  cmds.push({ t: 'm', x: top.x, y: top.y });
  for (const c of hair_smoothCmds([top].concat(rightPts))) cmds.push(c);
  const bottom = [];
  for (let th = 86; th >= -86; th -= 8) {
    const a = th * D2R;
    const yy = -70 + 14 * Math.pow(Math.abs(Math.sin(a)), 2.3);
    bottom.push(hair_frontPt(S, a, yy, HAIR_BANG_RX, HAIR_BANG_RZ));
  }
  for (const c of hair_smoothCmds(bottom)) cmds.push(c);
  const leftPts = edge.slice().reverse().map(e => hair_frontPt(S, -e.th * D2R, e.y, HAIR_BANG_RX, HAIR_BANG_RZ));
  for (const c of hair_smoothCmds(leftPts)) cmds.push(c);
  cmds.push({ t: 'l', x: top.x, y: top.y });
  return cmds;
}

function hair_bangGeom(S, st, N) {
  N = N || 24;
  const L = [], R = [], C = [];
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const e = Math.pow(s, 0.94);
    const y = (1 - e) * (1 - e) * st.y0 + 2 * (1 - e) * e * st.yc + e * e * st.y1;
    const th = ((1 - e) * (1 - e) * st.th0 + 2 * (1 - e) * e * ((st.th0 + st.th1) * 0.5) + e * e * st.th1) * Math.PI / 180;
    const p = hair_frontPt(S, th, y, HAIR_BANG_RX, HAIR_BANG_RZ);
    let nx = 0, ny = 1;
    if (prev) {
      let tx = p.x - prev.x, ty = p.y - prev.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      nx = -ty; ny = tx;
    }
    const taper = (0.46 + 0.72 * Math.sin(Math.PI * Math.pow(s, 0.58))) * Math.pow(1 - s, 0.40);
    const hw = st.w * taper;
    const sway = S.hairWave1 * 0.10 * s * s;
    L.push({ x: p.x + nx * hw + sway, y: p.y + ny * hw });
    R.push({ x: p.x - nx * hw + sway, y: p.y - ny * hw });
    C.push({ x: p.x, y: p.y });
    prev = { x: p.x, y: p.y };
  }
  return { L, R, C };
}

function hair_drawBangs(ctx, S) {
  const grad = ctx.createLinearGradient(0, -112, 0, -2);
  grad.addColorStop(0.00, '#33487f');
  grad.addColorStop(0.42, '#3f5c9b');
  grad.addColorStop(0.80, '#4c6fae');
  grad.addColorStop(1.00, '#5d88c6');

  // 底层发片
  const capCmds = hair_bangCapCmds(S);
  ctx.save();
  ctx.beginPath();
  hair_runCmds(ctx, capCmds);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(23,32,68,0.30)';
  ctx.fillRect(-90, -150, 180, 88);
  ctx.restore();
  ctx.restore();

  const list = [];
  for (const st of HAIR_BANGS) {
    const tip = hair_frontPt(S, (st.th1 * Math.PI) / 180, st.y1, HAIR_BANG_RX, HAIR_BANG_RZ);
    const mid = hair_frontPt(S, (((st.th0 + st.th1) * 0.5) * Math.PI) / 180, (st.y0 + st.y1) * 0.5, HAIR_BANG_RX, HAIR_BANG_RZ);
    list.push({ st, z: mid.z, tip });
  }
  list.sort((a, b) => a.z - b.z);
  for (const it of list) {
    const alpha = smoothstep(-9, 6, it.z);
    if (alpha <= 0.02) continue;
    const st = it.st;
    const g = hair_bangGeom(S, st);
    const pathFn = () => {
      ctx.beginPath();
      ctx.moveTo(g.L[0].x, g.L[0].y);
      for (let i = 1; i < g.L.length; i++) ctx.lineTo(g.L[i].x, g.L[i].y);
      for (let i = g.R.length - 1; i >= 0; i--) ctx.lineTo(g.R[i].x, g.R[i].y);
      ctx.closePath();
    };
    ctx.save();
    ctx.globalAlpha = alpha;
    pathFn();
    ctx.fillStyle = grad;
    ctx.fill();
    // 根部压暗 + 中部提亮
    ctx.save();
    pathFn();
    ctx.clip();
    ctx.globalAlpha = alpha * 0.15;
    ctx.fillStyle = '#a6d8fb';
    ctx.fillRect(-90, -160, 180, 200);
    // 发绺受光面（沿发流方向的椭圆光斑）
    const midIdx = Math.floor(g.C.length * 0.48);
    const a0 = g.C[Math.max(0, midIdx - 6)];
    const a1 = g.C[midIdx];
    const rot = Math.atan2(a1.y - a0.y, a1.x - a0.x) - Math.PI / 2;
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = '#b2e0ff';
    ctx.beginPath();
    ctx.ellipse(a1.x, a1.y, st.w * 0.55, 26, rot, 0, Math.PI * 2);
    ctx.fill();
    if (st.tone) {
      ctx.globalAlpha = alpha * 0.10;
      ctx.fillStyle = st.tone > 0 ? '#b7e2ff' : '#1a2752';
      ctx.fillRect(-90, -160, 180, 260);
    }
    ctx.globalAlpha = alpha * 0.50;
    ctx.fillStyle = HAIR_DARK;
    ctx.beginPath();
    ctx.ellipse(g.C[2].x, g.C[2].y - 4, st.w * 1.3, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.16;
    ctx.fillStyle = '#a9d9fb';
    ctx.beginPath();
    ctx.ellipse(g.C[Math.floor(g.C.length * 0.62)].x, g.C[Math.floor(g.C.length * 0.62)].y, st.w * 0.55, 18, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const mL = hair_smoothCmds(g.L.map(p => ({ x: p.x, y: p.y })));
    const mR = hair_smoothCmds(g.R.map(p => ({ x: p.x, y: p.y })));
    hair_line(ctx, mL, HAIRC.ink, 1.75, 210 + st.ph * 7, 0.80);
    hair_line(ctx, mR, HAIRC.ink, 1.75, 250 + st.ph * 5, 0.80);
    hair_line(ctx, hair_smoothCmds(g.R.slice(2, Math.max(3, g.R.length - 7)).map(p => ({ x: p.x, y: p.y }))), HAIR_LIGHT, 1.2, 280 + st.ph, 0.32);
    ctx.restore();
  }

  // 中分发缝（仅正面附近可见）
  const partA = Math.abs(S.yaw) < 55 ? 1 - smoothstep(28, 55, Math.abs(S.yaw)) : 0;
  if (partA > 0.02) {
    const pp = [];
    for (let i = 0; i <= 6; i++) {
      const yy = -104 + (i / 6) * 30;
      pp.push(hair_frontPt(S, 0, yy, HAIR_BANG_RX, HAIR_BANG_RZ));
    }
    ctx.save();
    ctx.globalAlpha = partA;
    ctx.lineCap = 'round';
    ctx.strokeStyle = HAIRC.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pp[0].x, pp[0].y);
    for (let i = 1; i < pp.length; i++) ctx.quadraticCurveTo(pp[i].x, pp[i].y, pp[i].x, pp[i].y);
    ctx.stroke();
    ctx.strokeStyle = HAIR_LIGHT;
    ctx.globalAlpha = partA * 0.4;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pp[0].x + 2, pp[0].y);
    for (let i = 1; i < pp.length; i++) ctx.lineTo(pp[i].x + 2, pp[i].y);
    ctx.stroke();
    ctx.restore();
  }
}

/* --------------------------------------------------------------- 鬓发 */
const HAIR_SIDEBURN = {
  th0: 58, th1: 84, y0: -66, y1: 84, rx: 63, rz: 52,
  w: 10, bend: 4
};

function hair_sideburnGeom(S, sign, scaleW, N) {
  N = N || 22;
  const base = HAIR_SIDEBURN;
  const L = [], R = [], C = [];
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const y = base.y0 + (base.y1 - base.y0) * s;
    const th = ((base.th0 + (base.th1 - base.th0) * Math.pow(s, 0.9) + (base.bend || 0) * Math.sin(Math.PI * s)) * Math.PI) / 180;
    const p = hair_frontPt(S, th, y, base.rx, base.rz);
    const px = p.x * sign;
    let nx = 0, ny = 1;
    if (prev) {
      let tx = px - prev.x, ty = p.y - prev.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      nx = -ty; ny = tx;
    }
    const taper = (0.66 + 0.48 * Math.sin(Math.PI * Math.pow(s, 0.8))) * Math.pow(1 - s, 0.28);
    const hw = base.w * scaleW * taper;
    L.push({ x: px + nx * hw, y: p.y + ny * hw });
    R.push({ x: px - nx * hw, y: p.y - ny * hw });
    C.push({ x: px, y: p.y });
    prev = { x: px, y: p.y };
  }
  // 发梢外翘（屏幕空间，向外侧）
  for (let i = 0; i < C.length; i++) {
    const s = i / (C.length - 1);
    const fk = Math.pow(smoothstep(0.58, 1.0, s), 1.35) * 17 * sign;
    L[i].x += fk; R[i].x += fk; C[i].x += fk;
  }
  return { L, R, C };
}

function hair_drawSideburn(ctx, S, sign) {
  const grad = hair_gradient(ctx);
  const probe = hair_frontPt(S, ((HAIR_SIDEBURN.th0 + HAIR_SIDEBURN.th1) * 0.5 * Math.PI) / 180, 20, HAIR_SIDEBURN.rx, HAIR_SIDEBURN.rz);
  const alpha = smoothstep(-10, 5, probe.z);
  if (alpha <= 0.02) return 0;
  const g = hair_sideburnGeom(S, sign, 1);
  const gi = hair_sideburnGeom(S, sign, 0.55);
  const drawRibbon = (geom, fill) => {
    ctx.beginPath();
    ctx.moveTo(geom.L[0].x, geom.L[0].y);
    for (let i = 1; i < geom.L.length; i++) ctx.lineTo(geom.L[i].x, geom.L[i].y);
    for (let i = geom.R.length - 1; i >= 0; i--) ctx.lineTo(geom.R[i].x, geom.R[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ctx.save();
  ctx.globalAlpha = alpha;

  // 辅流稍微偏外侧
  const g2 = {
    L: gi.L.map(p => ({ x: p.x + sign * 5, y: p.y + 6 })),
    R: gi.R.map(p => ({ x: p.x + sign * 5, y: p.y + 6 }))
  };
  drawRibbon(g2, '#4b7cc4');
  hair_line(ctx, hair_smoothCmds(g2.L), HAIRC.ink, 1.4, 330, 0.45);
  hair_line(ctx, hair_smoothCmds(g2.R), HAIRC.ink, 1.4, 340, 0.45);

  drawRibbon(g, grad);
  // 根部阴影
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g.L[0].x, g.L[0].y);
  for (let i = 1; i < g.L.length; i++) ctx.lineTo(g.L[i].x, g.L[i].y);
  for (let i = g.R.length - 1; i >= 0; i--) ctx.lineTo(g.R[i].x, g.R[i].y);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = alpha * 0.40;
  ctx.fillStyle = HAIR_DARK;
  ctx.beginPath();
  ctx.ellipse(g.C[4].x, g.C[4].y - 6, 15, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 下半段提亮（参考图鬓发梢偏亮）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g.L[0].x, g.L[0].y);
  for (let i = 1; i < g.L.length; i++) ctx.lineTo(g.L[i].x, g.L[i].y);
  for (let i = g.R.length - 1; i >= 0; i--) ctx.lineTo(g.R[i].x, g.R[i].y);
  ctx.closePath();
  ctx.clip();
  const tg = ctx.createLinearGradient(0, 30, 0, 92);
  tg.addColorStop(0, 'rgba(168,214,251,0.0)');
  tg.addColorStop(1, 'rgba(168,214,251,0.34)');
  ctx.fillStyle = tg;
  ctx.fillRect(-120, 20, 240, 90);
  ctx.restore();
  hair_line(ctx, hair_smoothCmds(g.L), HAIRC.ink, 1.85, 350, 0.72);
  hair_line(ctx, hair_smoothCmds(g.R), HAIRC.ink, 1.85, 360, 0.72);
  hair_line(ctx, hair_smoothCmds(g.R.slice(2, g.R.length - 4)), HAIR_LIGHT, 1.2, 370, 0.30);
  ctx.restore();
  return alpha;
}

/* --------------------------------------------------------------- 呆毛 */
function hair_drawAhoge(ctx, S) {
  const bounce = S.ahogeBounce || 0;
  const flip = S.cosY < 0 ? -1 : 1;
  const rootX = (-S.sinY * 8 + S.hairWave1 * 0.12) * 1;
  const sx = (0.48 + 0.52 * Math.abs(S.cosY)) * flip;
  ctx.save();
  ctx.translate(rootX - 4, -99);
  ctx.rotate(bounce * 0.6 + S.hairWave2 * 0.0035);
  ctx.scale(sx, 1);

  // 中心线（局部坐标，根部在 (0,0) 附近，顶点约 -50）
  const spine = [
    { x: -4, y: 0 }, { x: -1, y: -8 }, { x: -3, y: -18 }, { x: -9, y: -27 },
    { x: -17, y: -36 }, { x: -21, y: -45 }, { x: -18, y: -53 }, { x: -9, y: -57 },
    { x: 2, y: -55 }, { x: 10, y: -49 }, { x: 15, y: -39 }, { x: 16, y: -29 },
    { x: 12, y: -19 }, { x: 7, y: -10 }, { x: 2, y: 2 }
  ];
  const widths = [2.2, 3.4, 4.6, 5.0, 5.0, 4.7, 4.3, 3.9, 3.5, 3.1, 2.6, 2.1, 1.6, 1.0, 0.2];
  const N = spine.length;
  const L = [], R = [];
  for (let i = 0; i < N; i++) {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(N - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const w = widths[i];
    L.push({ x: spine[i].x + nx * w, y: spine[i].y + ny * w });
    R.push({ x: spine[i].x - nx * w, y: spine[i].y - ny * w });
  }
  const grad = ctx.createLinearGradient(0, -54, 0, 12);
  grad.addColorStop(0, '#557fc0');
  grad.addColorStop(0.4, '#34528f');
  grad.addColorStop(1, '#202f5e');

  ctx.beginPath();
  ctx.moveTo(L[0].x, L[0].y);
  for (let i = 1; i < N; i++) ctx.quadraticCurveTo(spine[i].x, spine[i].y, L[i].x, L[i].y);
  for (let i = N - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  hair_line(ctx, hair_smoothCmds(L.slice(1, L.length - 1)), HAIRC.ink, 1.7, 410, 0.85);
  hair_line(ctx, hair_smoothCmds(R.slice(2)), HAIRC.ink, 1.7, 420, 0.85);
  // 环内高光
  hair_line(ctx, hair_smoothCmds(L.slice(4, 9).map(p => ({ x: p.x * 0.88, y: p.y * 0.9 }))), HAIR_LIGHT, 1.5, 430, 0.38);
  ctx.restore();
}

/* --------------------------------------------------------------- 正面 */
function drawHairFront(ctx, S) {
  if (!ctx || !S) return;

  // 1) 背面：把整团后发再画一遍，盖住头部/五官/身体（背面完整覆盖、无刘海）
  const backCover = smoothstep(104, 148, Math.abs(S.yaw));
  if (backCover > 0.01) {
    hair_drawBackMass(ctx, S, { alpha: backCover });
  }

  // 2) 鬓发（先远后近；侧转时远侧自然淡出）
  const sb = [];
  for (let s = -1; s <= 1; s += 2) {
    sb.push({ s: s, z: hair_frontPt(S, ((HAIR_SIDEBURN.th0 + HAIR_SIDEBURN.th1) * 0.5 * Math.PI) / 180, 20, HAIR_SIDEBURN.rx, HAIR_SIDEBURN.rz).z });
  }
  sb.sort((a, b) => a.z - b.z);
  sb.forEach(e => hair_drawSideburn(ctx, S, e.s));

  // 3) 刘海
  hair_drawBangs(ctx, S);

  // 4) 呆毛
  hair_drawAhoge(ctx, S);
}
