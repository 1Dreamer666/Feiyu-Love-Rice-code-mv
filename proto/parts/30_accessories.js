/* ============================================================================
 * 配饰专项 v2 · 肥鱼爱大米 / 深深（2.5 头身水彩鲸鱼娘女仆）
 * 文件：proto/parts/30_accessories.js
 * 入口：drawAccessories(ctx, S)
 *
 * 对照参考三视图的造型要点：
 *   · 白蕾丝荷叶边发箍（喀秋莎）：环在头顶的冠状蕾丝带，内缘压在发旋上，
 *     外缘一圈扁平扇贝荷叶边 + 小孔蕾丝 + 粉紫阴影 #e8d7ea + 藏青细带。
 *   · 左右天蓝缎带蝴蝶结在发箍两端（眼睛高度略上、耳鳍上方），
 *     中心金色立体爱心扣；侧面只显示近侧，背面两侧都显示。
 *   · 双层鲸鳍耳在蝴蝶结下方：上层深藏青流线鳍，下层白色羽状鳍（4 根扇骨）。
 *
 * 2.5D：发箍用「冠状面超椭圆环」建模（宽度贴合后发轮廓），再经 projFace
 * 投影；后发本身在侧视时会后移，发箍用同样的 shift 跟随。
 * 自包含：不调用其它部件函数（仅用 00_util.js 的公共工具）。
 * ========================================================================== */

/* ------------------------------------------------------------------ 参数 */
const ACC_CFG = {
  // 发箍环：超椭圆 |x/Rx|^n + |(y-cy)/Ry|^n = 1，躺在头顶冠状面里
  band: {
    rx: 86, ry: 99, cy: -18, n: 1.42,
    z0: 3, tilt: 24,
    a0: 14, a1: 166, segs: 15,
    inW: 4.9, outW: 8.1,
    col: CREAM, scallopT: 0.62, scallopR: 0.40
  },
  bow: { x: 81, y: -32, z: 8 },
  ear: { x: 74, y: -8, z: 2, len: 58 }
};

const ACC_LACE_SHADOW = '#e8d7ea';
const ACC_LACE_DEEP = '#cfb4d8';
const ACC_INK = '#191b30';

/* 后发轮廓（高度 → 半宽系数），用于发箍贴合与遮挡判断。
 * 数值按 20_hair.js 的 HAIR_PROF_KEYS 拟合，仅本文件内部使用。 */
const ACC_HAIR_PROF = [
  [-116, 0.015], [-109, 0.19], [-102, 0.325], [-94, 0.45], [-85, 0.565],
  [-74, 0.665], [-62, 0.745], [-48, 0.815], [-32, 0.872], [-16, 0.915],
  [2, 0.948], [20, 0.975], [38, 0.994], [56, 1.0], [86, 0.984],
  [104, 0.932], [118, 0.835]
];

function acc_hairProf(y) {
  const K = ACC_HAIR_PROF;
  if (y <= K[0][0]) return 0;
  if (y >= K[K.length - 1][0]) return K[K.length - 1][1];
  for (let i = 0; i < K.length - 1; i++) {
    const y0 = K[i][0], v0 = K[i][1], y1 = K[i + 1][0], v1 = K[i + 1][1];
    if (y >= y0 && y <= y1) return v0 + (v1 - v0) * smoothstep(y0, y1, y);
  }
  return 1;
}

/* 后发侧向平移（与头发一致的背移） */
function acc_hairShift(S, y) {
  return -S.sinY * (22 * smoothstep(-74, 30, y) + 8 * smoothstep(58, 118, y));
}

/* ------------------------------------------------------------------ 工具 */
function acc_hb(ctx, pathFn, color, weight, seed, alpha) {
  const a = clamp(alpha, 0, 1) * 0.94;
  if (a <= 0.01) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.globalAlpha = a;
  ctx.beginPath();
  pathFn(ctx, 0, 0);
  ctx.stroke();
  const ox = (detHash(seed * 17.3) - 0.5) * 1.1;
  const oy = (detHash(seed * 29.1) - 0.5) * 1.1;
  ctx.lineWidth = weight * 0.5;
  ctx.globalAlpha = a * 0.4;
  ctx.beginPath();
  pathFn(ctx, ox, oy);
  ctx.stroke();
  ctx.restore();
}

function acc_depthK(z) { return clamp(1 + z * 0.0022, 0.74, 1.22); }

/* 侧面元素（蝴蝶结/鳍耳）可见度：正面两侧可见、侧面只剩近侧、背面两侧恢复 */
function acc_sideVis(S, z) {
  let v = smoothstep(-9, 7, z);
  v = Math.max(v, smoothstep(163, 177, Math.abs(S.yaw)));
  return v;
}

/* 后发剪影遮挡：位于脑后（z'<0）且投影落进头发轮廓内 → 不可见 */
function acc_hairOccludes(S, p) {
  if (p.z > -1) return false;
  if (p.y < -116 || p.y > 122) return false;
  const pr = acc_hairProf(p.y);
  if (pr <= 0.02) return false;
  const rz = lerpVal(72, 58, smoothstep(-64, 52, p.y));
  const hw = pr * Math.hypot(86 * S.cosY, rz * S.sinY);
  const shiftX = acc_hairShift(S, p.y);
  return Math.abs(p.x - shiftX) < hw - 0.6;
}

/* 超椭圆环上的点（局部） */
function acc_ringLocal(cfg, aRad) {
  const cx = Math.cos(aRad);
  const sy = Math.sin(aRad);
  const ex = 2 / cfg.n;
  return {
    x: cfg.rx * (cx >= 0 ? 1 : -1) * Math.pow(Math.abs(cx), ex),
    y: cfg.cy - cfg.ry * (sy >= 0 ? 1 : -1) * Math.pow(Math.abs(sy), ex),
    z: cfg.z0 + cfg.tilt * sy
  };
}

/* 投影后的发箍环采样 */
function acc_ringPt(S, aDeg, cfg) {
  const a = (aDeg * Math.PI) / 180;
  const loc = acc_ringLocal(cfg, a);
  const wob = Math.sin(a * 3.1 + S.t * 1.5 + 0.5) * 1.1 + S.hairWave1 * 0.26;
  const p = projFace(S, loc.x + wob * 0.4, loc.y + wob * 0.9, loc.z);
  p.x += acc_hairShift(S, loc.y);
  return p;
}

/* 一圈发箍的几何：中心线 / 内外缘 / 屏幕法线 / 可见性 */
function acc_bandGeo(S, cfg) {
  const N = cfg.segs;
  const c = projFace(S, 0, cfg.cy, cfg.z0 + cfg.tilt);
  const g = { pts: [], nrm: [], ins: [], outs: [], vis: [], N };
  for (let i = 0; i <= N; i++) {
    const a = cfg.a0 + ((cfg.a1 - cfg.a0) * i) / N;
    const p = acc_ringPt(S, a, cfg);
    let dx = p.x - c.x;
    let dy = p.y - c.y;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    const wsc = 1 + clamp(p.z, -60, 60) * 0.0014;
    g.pts.push(p);
    g.nrm.push({ x: dx, y: dy });
    g.ins.push({ x: p.x - dx * cfg.inW * wsc, y: p.y - dy * cfg.inW * wsc });
    g.outs.push({ x: p.x + dx * cfg.outW * wsc, y: p.y + dy * cfg.outW * wsc });
    g.vis.push(!acc_hairOccludes(S, p));
  }
  return g;
}

/* 发箍带身多边形（连续可见区各一条闭合路径） */
function acc_bandBody(ctx, g) {
  const N = g.N;
  let i = 0;
  while (i < N) {
    if (!(g.vis[i] && g.vis[i + 1])) { i++; continue; }
    let j = i;
    while (j + 2 <= N && g.vis[j + 1] && g.vis[j + 2]) j++;
    ctx.moveTo(g.outs[i].x, g.outs[i].y);
    for (let k = i + 1; k <= j + 1; k++) ctx.lineTo(g.outs[k].x, g.outs[k].y);
    for (let k = j + 1; k >= i; k--) ctx.lineTo(g.ins[k].x, g.ins[k].y);
    ctx.closePath();
    i = j + 1;
  }
}

/* ------------------------------------------------------- 荷叶边蕾丝发箍 */
function acc_drawLaceBand(ctx, S, cfg, alpha, seed) {
  const a = clamp(alpha, 0, 1);
  if (a <= 0.01) return;
  const g = acc_bandGeo(S, cfg);
  const N = cfg.segs;

  /* 0. 压在头发上的接触阴影 */
  ctx.save();
  ctx.globalAlpha = a * 0.28;
  ctx.strokeStyle = '#b9a2c8';
  ctx.lineWidth = 6.0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let run = false;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    if (!g.vis[i]) { run = false; continue; }
    const px = g.ins[i].x - g.nrm[i].x * 2.2;
    const py = g.ins[i].y - g.nrm[i].y * 2.2;
    if (!run) { ctx.moveTo(px, py); run = true; } else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  /* 1. 扇贝：扁椭圆（横向宽、径向矮），沿外缘一圈 */
  const scal = [];
  for (let i = 0; i < N; i++) {
    if (!(g.vis[i] && g.vis[i + 1])) { scal.push(null); continue; }
    let nx = g.nrm[i].x + g.nrm[i + 1].x;
    let ny = g.nrm[i].y + g.nrm[i + 1].y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const mx = (g.outs[i].x + g.outs[i + 1].x) * 0.5;
    const my = (g.outs[i].y + g.outs[i + 1].y) * 0.5;
    const span = Math.hypot(
      g.outs[i + 1].x - g.outs[i].x,
      g.outs[i + 1].y - g.outs[i].y
    );
    const zAvg = (g.pts[i].z + g.pts[i + 1].z) * 0.5;
    scal.push({
      x: mx, y: my, nx, ny,
      rT: clamp(span * cfg.scallopT, 2.6, 11),
      rR: clamp(span * cfg.scallopR, 2.0, 6.8),
      i, ang: Math.atan2(ny, nx), z: zAvg
    });
  }
  const order = scal.map((s, k) => k).filter((k) => scal[k])
    .sort((A, B) => scal[A].z - scal[B].z);

  /* 2. 扇贝底色（整椭圆，内侧会被带身盖住） */
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = cfg.col;
  order.forEach((k) => {
    const s = scal[k];
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, s.rT, s.rR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  /* 2b. 夹在扇贝之间的翻折花瓣（荷叶边的第二层） */
  for (let k = 1; k < order.length; k += 4) {
    const s = scal[order[k]];
    ctx.save();
    ctx.translate(s.x + s.nx * s.rR * 0.7, s.y + s.ny * s.rR * 0.7);
    ctx.rotate(s.ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, s.rT * 0.9, s.rR * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fdf9fc';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  /* 3. 带身（连续可见段） */
  let topY = 1e9, botY = -1e9;
  for (let i = 0; i <= N; i++) {
    topY = Math.min(topY, g.outs[i].y, g.ins[i].y);
    botY = Math.max(botY, g.outs[i].y, g.ins[i].y);
  }
  const bodyGrad = ctx.createLinearGradient(0, topY, 0, botY + 1);
  bodyGrad.addColorStop(0, '#fffefc');
  bodyGrad.addColorStop(0.42, cfg.col);
  bodyGrad.addColorStop(1, '#f0e4ee');
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  acc_bandBody(ctx, g);
  ctx.fill();

  /* 3b. 水彩：带身内粉紫晕染 */
  ctx.save();
  ctx.beginPath();
  acc_bandBody(ctx, g);
  ctx.clip();
  for (let k = 0; k <= N; k += 3) {
    if (!g.vis[k]) continue;
    const pt = g.pts[k];
    wcWashBlob(ctx, pt.x + g.nrm[k].x * 1.5, pt.y + g.nrm[k].y * 1.5, 9, 5, ACC_LACE_SHADOW, 0.5, 60 + k);
  }
  ctx.restore();
  ctx.restore();

  /* 4. 扇贝外缘墨线（由远到近） */
  order.forEach((k) => {
    const s = scal[k];
    acc_hb(ctx, (c, ox, oy) => {
      c.save();
      c.translate(s.x + ox, s.y + oy);
      c.rotate(s.ang);
      c.ellipse(0, 0, s.rT, s.rR, 0, -Math.PI * 0.52, Math.PI * 0.52);
      c.restore();
    }, ACC_INK, 2.25, seed + s.i * 1.7, a);
  });

  /* 5. 粉紫阴影：扇贝根部软阴影 */
  ctx.save();
  ctx.globalAlpha = a * 0.55;
  ctx.strokeStyle = ACC_LACE_SHADOW;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  order.forEach((k) => {
    const s = scal[k];
    ctx.save();
    ctx.translate(s.x - s.nx * 1.2, s.y - s.ny * 1.2);
    ctx.rotate(s.ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, s.rT * 0.78, s.rR * 0.78, 0, -Math.PI * 0.42, Math.PI * 0.42);
    ctx.stroke();
    ctx.restore();
  });
  ctx.restore();

  /* 6. 小孔蕾丝：每片扇贝一枚孔眼 + 两枚小孔 + 孔眼外圈细弧 */
  ctx.save();
  ctx.globalAlpha = a * 0.95;
  order.forEach((k) => {
    const s = scal[k];
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ang);
    ctx.fillStyle = ACC_LACE_SHADOW;
    ctx.beginPath();
    ctx.ellipse(-s.rR * 0.18, 0, 1.75, 1.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fdf9fc';
    ctx.beginPath();
    ctx.arc(-s.rR * 0.18 - 0.3, -0.35, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ACC_LACE_DEEP;
    for (let q = -1; q <= 1; q += 2) {
      ctx.beginPath();
      ctx.arc(s.rR * 0.05, q * s.rT * 0.44, 0.82, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = a * 0.55;
    ctx.strokeStyle = ACC_LACE_SHADOW;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.ellipse(-s.rR * 0.18, 0, 3.0, 2.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
  /* 6b. 内缘一串小孔 */
  for (let k = 1; k < N; k += 2) {
    if (!g.vis[k]) continue;
    const px = g.pts[k].x - g.nrm[k].x * (cfg.inW - 1.4);
    const py = g.pts[k].y - g.nrm[k].y * (cfg.inW - 1.4);
    ctx.fillStyle = ACC_LACE_SHADOW;
    ctx.beginPath();
    ctx.arc(px, py, 1.0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* 7. 藏青细带：贴着蕾丝内缘 */
  ctx.save();
  ctx.globalAlpha = a * 0.94;
  ctx.strokeStyle = DRESS_NAVY;
  ctx.lineWidth = 2.9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  run = false;
  ctx.beginPath();
  for (let k = 0; k <= N; k++) {
    if (!g.vis[k]) { run = false; continue; }
    const off = cfg.inW - 1.0;
    const px = g.pts[k].x - g.nrm[k].x * off;
    const py = g.pts[k].y - g.nrm[k].y * off;
    if (!run) { ctx.moveTo(px, py); run = true; } else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------- 蝴蝶结 */
function acc_bowWingPath(c, sgn, ox, oy) {
  const s = sgn;
  c.moveTo(s * 0.9 + ox, -0.6 + oy);
  c.bezierCurveTo(s * 3.4 + ox, -9.0 + oy, s * 9.6 + ox, -12.4 + oy, s * 14.6 + ox, -9.2 + oy);
  c.bezierCurveTo(s * 18.2 + ox, -6.9 + oy, s * 17.8 + ox, -1.0 + oy, s * 14.2 + ox, 1.8 + oy);
  c.bezierCurveTo(s * 9.8 + ox, 5.2 + oy, s * 4.0 + ox, 3.6 + oy, s * 0.8 + ox, 1.2 + oy);
  c.closePath();
}

function acc_bowTails(c, ox, oy) {
  c.moveTo(-2.9 + ox, 2.0 + oy);
  c.bezierCurveTo(-3.9 + ox, 6.2 + oy, -6.2 + ox, 9.4 + oy, -9.2 + ox, 12.8 + oy);
  c.lineTo(-5.4 + ox, 12.2 + oy);
  c.bezierCurveTo(-4.0 + ox, 8.8 + oy, -1.6 + ox, 5.4 + oy, 0.7 + ox, 2.8 + oy);
  c.closePath();
  c.moveTo(2.9 + ox, 2.0 + oy);
  c.bezierCurveTo(3.9 + ox, 6.2 + oy, 6.2 + ox, 9.4 + oy, 9.2 + ox, 12.8 + oy);
  c.lineTo(5.4 + ox, 12.2 + oy);
  c.bezierCurveTo(4.0 + ox, 8.8 + oy, 1.6 + ox, 5.4 + oy, -0.7 + ox, 2.8 + oy);
  c.closePath();
}

function acc_heartPath(c, s, ox, oy) {
  c.moveTo(ox + 0, oy + 5.4 * s);
  c.bezierCurveTo(ox - 1.8 * s, oy + 3.5 * s, ox - 6.3 * s, oy + 1.3 * s, ox - 6.3 * s, oy - 2.2 * s);
  c.bezierCurveTo(ox - 6.3 * s, oy - 5.0 * s, ox - 2.7 * s, oy - 5.7 * s, ox + 0, oy - 2.9 * s);
  c.bezierCurveTo(ox + 2.7 * s, oy - 5.7 * s, ox + 6.3 * s, oy - 5.0 * s, ox + 6.3 * s, oy - 2.2 * s);
  c.bezierCurveTo(ox + 6.3 * s, oy + 1.3 * s, ox + 1.8 * s, oy + 3.5 * s, ox + 0, oy + 5.4 * s);
  c.closePath();
}

/* 金色立体爱心扣：侧厚度 + 金渐变 + 高光 + 深色描边 */
function acc_drawGoldHeart(ctx, x, y, s, alpha, seed) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.save();
  ctx.translate(x + 0.8 * s, y + 0.9 * s);
  ctx.fillStyle = GOLD_DARK;
  ctx.beginPath();
  acc_heartPath(ctx, s, 0, 0);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  const hg = ctx.createLinearGradient(-5 * s, -6 * s, 4 * s, 6 * s);
  hg.addColorStop(0, GOLD_LIGHT);
  hg.addColorStop(0.40, GOLD);
  hg.addColorStop(1, '#bd8a30');
  ctx.fillStyle = hg;
  ctx.beginPath();
  acc_heartPath(ctx, s, 0, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,225,0.96)';
  ctx.beginPath();
  ctx.ellipse(-2.1 * s, -2.5 * s, 1.85 * s, 1.3 * s, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(2.1 * s, -3.4 * s, 0.65 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,236,180,0.6)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0.5 * s, 4.1 * s, Math.PI * 0.2, Math.PI * 0.7);
  ctx.stroke();
  acc_hb(ctx, (c, ox, oy) => acc_heartPath(c, s, ox, oy), '#7d5516', 1.55, seed, 1);
  ctx.restore();
  ctx.restore();
}

function acc_drawBow(ctx, S, side, p, vis) {
  if (vis <= 0.02) return;
  const sc = 0.92 * acc_depthK(p.z);
  ctx.save();
  ctx.globalAlpha = clamp(vis, 0, 1);
  ctx.translate(p.x, p.y + S.hairWave2 * 0.10);
  ctx.rotate(side * 0.06 + S.finFlap * 0.5 + S.hairWave1 * 0.004);
  ctx.scale(sc * (side < 0 ? -1 : 1), sc);

  /* 飘带（在结后面） */
  const tailGrad = ctx.createLinearGradient(0, 2, 0, 14);
  tailGrad.addColorStop(0, BOW_BLUE);
  tailGrad.addColorStop(1, BOW_BLUE_DARK);
  ctx.fillStyle = tailGrad;
  ctx.beginPath();
  acc_bowTails(ctx, 0, 0);
  ctx.fill();
  acc_hb(ctx, (c, ox, oy) => acc_bowTails(c, ox, oy), ACC_INK, 2.0, 121 + side, vis);

  /* 两片翅膀 */
  const wingGrad = ctx.createLinearGradient(-16, -12, 16, 5);
  wingGrad.addColorStop(0, '#93cdf8');
  wingGrad.addColorStop(0.42, BOW_BLUE);
  wingGrad.addColorStop(1, '#3d84d3');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  acc_bowWingPath(ctx, -1, 0, 0);
  acc_bowWingPath(ctx, 1, 0, 0);
  ctx.fill();

  /* 下缘褶皱 + 外侧翻折暗面 + 布纹高光 */
  ctx.save();
  ctx.globalAlpha = clamp(vis, 0, 1) * 0.66;
  ctx.fillStyle = BOW_BLUE_DARK;
  [-1, 1].forEach((sg) => {
    ctx.beginPath();
    ctx.moveTo(sg * 0.6, 1.2);
    ctx.quadraticCurveTo(sg * 7.0, 4.6, sg * 13.6, 2.0);
    ctx.quadraticCurveTo(sg * 9.6, 6.0, sg * 3.4, 4.2);
    ctx.closePath();
    ctx.fill();
  });
  ctx.globalAlpha = clamp(vis, 0, 1) * 0.5;
  [-1, 1].forEach((sg) => {
    ctx.beginPath();
    ctx.moveTo(sg * 13.0, -8.2);
    ctx.quadraticCurveTo(sg * 17.4, -6.0, sg * 15.4, 0.4);
    ctx.quadraticCurveTo(sg * 13.6, -1.6, sg * 12.4, -3.4);
    ctx.closePath();
    ctx.fill();
  });
  ctx.globalAlpha = clamp(vis, 0, 1) * 0.5;
  ctx.strokeStyle = '#d5ecff';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  [-1, 1].forEach((sg) => {
    ctx.beginPath();
    ctx.moveTo(sg * 4.2, -8.4);
    ctx.quadraticCurveTo(sg * 9.6, -10.8, sg * 13.6, -8.2);
    ctx.stroke();
  });
  ctx.restore();
  acc_hb(ctx, (c, ox, oy) => {
    acc_bowWingPath(c, -1, ox, oy);
    acc_bowWingPath(c, 1, ox, oy);
  }, ACC_INK, 2.25, 123 + side, vis);

  /* 中间结 */
  const knotGrad = ctx.createLinearGradient(0, -4, 0, 5);
  knotGrad.addColorStop(0, BOW_BLUE);
  knotGrad.addColorStop(1, BOW_BLUE_DARK);
  ctx.fillStyle = knotGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0.6, 3.6, 4.2, 0.1, 0, Math.PI * 2);
  ctx.fill();
  acc_hb(ctx, (c, ox, oy) => {
    c.ellipse(ox, 0.6 + oy, 3.6, 4.2, 0.1, 0, Math.PI * 2);
  }, ACC_INK, 1.9, 125 + side, vis);

  /* 金色爱心扣 */
  acc_drawGoldHeart(ctx, 0, -0.8, 0.74, vis, 127 + side);
  ctx.restore();
}

/* --------------------------------------------------------- 双层鲸鳍耳 */
function acc_darkFinPath(c, ox, oy) {
  c.moveTo(0 + ox, -12 + oy);
  c.bezierCurveTo(10 + ox, -18 + oy, 26 + ox, -20 + oy, 40 + ox, -15.6 + oy);
  c.bezierCurveTo(50 + ox, -12.4 + oy, 58 + ox, -7.6 + oy, 59 + ox, -2.6 + oy);
  c.bezierCurveTo(55 + ox, 0.2 + oy, 48 + ox, 2.0 + oy, 41 + ox, 3.0 + oy);
  c.quadraticCurveTo(36 + ox, 2.0 + oy, 31 + ox, 5.6 + oy);
  c.quadraticCurveTo(25 + ox, 4.4 + oy, 18 + ox, 9.0 + oy);
  c.quadraticCurveTo(8 + ox, 11.6 + oy, 2 + ox, 10.4 + oy);
  c.bezierCurveTo(-1 + ox, 8.0 + oy, -1 + ox, -3 + oy, 0 + ox, -12 + oy);
  c.closePath();
}

function acc_whiteFinPath(c, ox, oy) {
  c.moveTo(1 + ox, -1 + oy);
  c.bezierCurveTo(12 + ox, 7.4 + oy, 26 + ox, 11.6 + oy, 37 + ox, 11.4 + oy);
  c.quadraticCurveTo(47 + ox, 11.4 + oy, 54 + ox, 7.2 + oy);
  c.quadraticCurveTo(52 + ox, 13.4 + oy, 48.5 + ox, 19.6 + oy);
  c.quadraticCurveTo(45.5 + ox, 14.0 + oy, 41.5 + ox, 14.6 + oy);
  c.quadraticCurveTo(38.5 + ox, 19.6 + oy, 33.5 + ox, 23.2 + oy);
  c.quadraticCurveTo(31.5 + ox, 17.2 + oy, 27.5 + ox, 17.0 + oy);
  c.quadraticCurveTo(23.5 + ox, 21.4 + oy, 18.0 + ox, 23.8 + oy);
  c.quadraticCurveTo(16.0 + ox, 17.8 + oy, 12.0 + ox, 17.8 + oy);
  c.quadraticCurveTo(8.5 + ox, 21.4 + oy, 4.0 + ox, 20.6 + oy);
  c.quadraticCurveTo(1.4 + ox, 11.0 + oy, 0 + ox, 3.0 + oy);
  c.closePath();
}

function acc_drawEarFin(ctx, S, side, sv) {
  if (sv <= 0.02) return;
  const base3 = projFace(S, side * ACC_CFG.ear.x, ACC_CFG.ear.y, ACC_CFG.ear.z);
  const len = ACC_CFG.ear.len;
  const tip3 = projFace(
    S,
    side * (ACC_CFG.ear.x + len * 0.86),
    ACC_CFG.ear.y - 3,
    ACC_CFG.ear.z - len * 0.50
  );
  const dxRaw = tip3.x - base3.x;
  const dyRaw = tip3.y - base3.y;
  const flip = dxRaw < 0 ? -1 : 1;
  const plen = Math.hypot(dxRaw, dyRaw);
  if (plen < 3) return;
  const ang = Math.atan2(dyRaw, dxRaw * flip);
  const sc = clamp(plen / 54, 0.5, 1.3) * acc_depthK(base3.z);

  ctx.save();
  ctx.globalAlpha = clamp(sv, 0, 1);
  ctx.translate(base3.x, base3.y + S.hairWave2 * 0.10);
  ctx.rotate(ang + S.finFlap * 1.9);
  ctx.scale(flip * sc, sc);

  /* 下层白色羽状鳍 */
  const wg = ctx.createLinearGradient(0, 4, 28, 22);
  wg.addColorStop(0, '#f9fdff');
  wg.addColorStop(0.55, '#e9f3ff');
  wg.addColorStop(1, '#cfdef4');
  ctx.beginPath();
  acc_whiteFinPath(ctx, 0, 0);
  ctx.fillStyle = wg;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  acc_whiteFinPath(ctx, 0, 0);
  ctx.clip();
  wcWashBlob(ctx, 30, 17, 15, 5.5, '#dccbe7', 0.34, 141);
  wcWashBlob(ctx, 24, 9, 15, 5, '#ffffff', 0.5, 142);
  ctx.restore();
  /* 4 根浅蓝扇骨 */
  ctx.save();
  ctx.globalAlpha = clamp(sv, 0, 1) * 0.9;
  ctx.strokeStyle = '#a6c6e8';
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  const rays = [[50, 13], [38, 18.6], [25, 19.6], [10, 18.4]];
  rays.forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(3.0, 3.0);
    ctx.quadraticCurveTo(r[0] * 0.52, r[1] * 0.60 + 2.5, r[0], r[1]);
    ctx.stroke();
  });
  ctx.strokeStyle = 'rgba(150,175,210,0.5)';
  ctx.lineWidth = 1.1;
  [[45.5, 18.5], [36.5, 21.0], [23.5, 21.6], [8.5, 20.0]].forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(r[0] - 1.2, r[1] - 4.4);
    ctx.lineTo(r[0], r[1] - 1.5);
    ctx.stroke();
  });
  ctx.restore();
  acc_hb(ctx, (c, ox, oy) => acc_whiteFinPath(c, ox, oy), ACC_INK, 2.05, 144 + side, sv);

  /* 上层深藏青流线鲸鳍 */
  const fg = ctx.createLinearGradient(0, -14, 52, 8);
  fg.addColorStop(0, '#1b2b56');
  fg.addColorStop(0.48, '#2f5591');
  fg.addColorStop(1, '#5b95e0');
  ctx.beginPath();
  acc_darkFinPath(ctx, 0, 0);
  ctx.fillStyle = fg;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  acc_darkFinPath(ctx, 0, 0);
  ctx.clip();
  wcWashBlob(ctx, 27, -5, 21, 7.5, '#8fc4f7', 0.34, 146);
  wcWashBlob(ctx, 12, 2, 13, 6.5, '#141f45', 0.28, 147);
  wcWashBlob(ctx, 47, 0, 9, 4, '#a8d6fb', 0.32, 148);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = clamp(sv, 0, 1) * 0.55;
  ctx.strokeStyle = '#9ecff8';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(2.5, -10.5);
  ctx.bezierCurveTo(14, -17.5, 30, -19.0, 43, -14.4);
  ctx.stroke();
  ctx.restore();
  acc_hb(ctx, (c, ox, oy) => acc_darkFinPath(c, ox, oy), ACC_INK, 2.3, 150 + side, sv);

  /* 鳍根投影 */
  ctx.globalAlpha = clamp(sv, 0, 1) * 0.34;
  ctx.fillStyle = DRESS_NAVY;
  ctx.beginPath();
  ctx.ellipse(-0.5, 0, 5.0, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* --------------------------------------- 发箍后方的白色小荷叶边（背面用） */
function acc_drawBackRuffles(ctx, S, backF) {
  const a = clamp(backF, 0, 1) * 0.92;
  if (a <= 0.02) return;
  for (let side = -1; side <= 1; side += 2) {
    const base = projFace(S, side * 72, -26, -6);
    const vis = Math.min(1, acc_sideVis(S, base.z) * 0.8 + backF * 0.6);
    if (vis <= 0.03) continue;
    ctx.save();
    ctx.globalAlpha = clamp(a * vis, 0, 1);
    ctx.translate(base.x, base.y + 6);
    ctx.rotate(side * 0.25);
    ctx.scale(side < 0 ? -1 : 1, 1);
    for (let k = 0; k < 4; k++) {
      const r = 4.4 - k * 0.5;
      ctx.beginPath();
      ctx.arc(k * 3.4 - 4, k * 4.2, r, Math.PI * 0.15, Math.PI * 1.85);
      ctx.fillStyle = k % 2 ? '#f7eef5' : CREAM;
      ctx.fill();
      ctx.strokeStyle = 'rgba(25,27,48,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = ACC_LACE_SHADOW;
      ctx.beginPath();
      ctx.arc(k * 3.4 - 3.4, k * 4.2 + 0.4, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ================================================================== 主入口 */
function drawAccessories(ctx, S) {
  if (!ctx || !S) return;

  const backF = smoothstep(104, 148, Math.abs(S.yaw));
  const sway = S.hairWave1 * 0.0040 + S.hairWave2 * 0.0016;

  ctx.save();
  // 整体随头发轻微摆动（绕头部中心）
  ctx.translate(0, -16);
  ctx.rotate(sway);
  ctx.translate(S.hairWave2 * 0.10, 16 + S.hairWave2 * 0.06);

  /* 0. 背面发箍后方的白色小荷叶边 */
  if (backF > 0.02) acc_drawBackRuffles(ctx, S, backF);

  /* 1. 双耳鳍：先远后近 */
  const ears = [];
  for (let s = -1; s <= 1; s += 2) {
    const bp = projFace(S, s * ACC_CFG.ear.x, ACC_CFG.ear.y, ACC_CFG.ear.z);
    ears.push({ s, p: bp, v: acc_sideVis(S, bp.z) });
  }
  ears.sort((A, B) => A.p.z - B.p.z);
  ears.forEach((e) => acc_drawEarFin(ctx, S, e.s, e.v));

  /* 2. 蕾丝发箍 */
  acc_drawLaceBand(ctx, S, ACC_CFG.band, 1, 20);

  /* 3. 两侧蝴蝶结 + 金心扣：先远后近 */
  const bows = [];
  for (let s = -1; s <= 1; s += 2) {
    const bp = projFace(S, s * ACC_CFG.bow.x, ACC_CFG.bow.y, ACC_CFG.bow.z);
    bows.push({ s, p: bp, v: acc_sideVis(S, bp.z) });
  }
  bows.sort((A, B) => A.p.z - B.p.z);
  bows.forEach((b) => acc_drawBow(ctx, S, b.s, b.p, b.v));

  ctx.restore();
}
