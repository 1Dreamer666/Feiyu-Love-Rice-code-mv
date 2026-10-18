/* ============================================================================
 * 头部与五官 v9 —— 《肥鱼爱大米》agent-head
 * drawHead(ctx, S)
 *
 *  1. 脸型：按 y 采样的单条轮廓，「正面椭圆」与「正侧月牙」两套 x 值插值。
 *     - 正面 / 3-4 侧：宽脸颊 + 小圆下巴（下半脸短，参考图 chibi 比例）
 *     - 正侧：额头→眉弓→小鼻尖→人中→上唇→下唇→下巴，后脑收口留给头发
 *  2. 眼睛：projFace 判定可见性(z>0)，屏幕位置做 Q 版压缩；正侧只留近侧一只大眼贴住脸前缘。
 *  3. |yaw|>115 背面完全不画脸。
 * 只依赖 00_util.js。
 * ========================================================================== */

/* ---------------- 脸型表：[y, 正面左缘x, 正侧前缘|x|] ---------------- */
const HEAD_FRONT_KEYS = [
  [-58.0,   0.0,  26.0],
  [-55.0,  -8.5,  30.0],
  [-51.0, -18.5,  34.0],
  [-46.0, -28.0,  37.0],
  [-41.0, -34.0,  40.0],
  [-36.0, -38.2,  42.5],
  [-31.0, -40.5,  44.3],
  [-26.0, -42.0,  45.2],
  [-22.0, -42.1,  45.5],   /* 眉弓 */
  [-18.0, -42.5,  44.2],
  [-13.0, -42.8,  43.2],   /* 鼻梁凹 */
  [-8.0,  -43.0,  43.1],
  [-3.0,  -43.0,  44.0],
  [2.0,   -42.8,  45.4],
  [6.0,   -42.5,  46.9],
  [10.0,  -41.8,  48.6],
  [13.5,  -40.8,  50.0],
  [16.5,  -39.6,  51.3],
  [19.0,  -38.5,  52.3],
  [21.0,  -37.6,  52.6],   /* 鼻尖 */
  [23.5,  -36.4,  49.2],   /* 鼻下 */
  [26.0,  -35.2,  46.8],   /* 人中 */
  [28.5,  -33.8,  49.6],   /* 上唇 */
  [31.0,  -32.2,  46.5],   /* 唇缝 */
  [34.0,  -30.0,  49.4],   /* 下唇 */
  [37.0,  -27.7,  48.2],
  [40.0,  -24.8,  46.6],
  [43.0,  -21.0,  44.3],
  [46.0,  -16.5,  41.0],
  [49.0,  -10.5,  36.0],
  [51.5,   -2.8,  27.0]    /* 下巴尖 */
];

/* 后缘（正侧被头发包住的收口）：[y, 正侧x] */
const HEAD_BACK_KEYS = [
  [-58.0,   0.0],
  [-52.0,  -7.0],
  [-46.0, -12.0],
  [-40.0, -15.5],
  [-34.0, -17.5],
  [-28.0, -17.5],
  [-22.0, -15.0],
  [-16.0, -10.5],
  [-10.0,  -6.0],
  [-4.0,   -1.5],
  [2.0,     2.0],
  [8.0,     2.5],
  [14.0,    2.0],
  [20.0,    0.5],
  [26.0,   -2.0],
  [32.0,   -5.0],
  [37.0,   -8.0],
  [42.0,  -12.0],
  [46.5,  -15.5],
  [49.5,  -19.0],
  [51.0,  -23.0]
];

function head_tblX(keys, y) {
  const n = keys.length;
  if (y <= keys[0][0]) return keys[0][1];
  if (y >= keys[n - 1][0]) return keys[n - 1][1];
  for (let i = 0; i < n - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (y >= a[0] && y <= b[0]) {
      const t = (y - a[0]) / ((b[0] - a[0]) || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return keys[n - 1][1];
}

const HEAD_XFV = HEAD_FRONT_KEYS.map(k => [k[0], k[1]]);
const HEAD_XPF = HEAD_FRONT_KEYS.map(k => [k[0], -k[2]]);

function head_frontXAt(y, pf) {
  return lerpVal(head_tblX(HEAD_XFV, y), head_tblX(HEAD_XPF, y), pf);
}
function head_frontMagAt(y, pf) { return -head_frontXAt(y, pf); }

/* 脸型控制点 */
function head_faceShape(S) {
  const a = Math.abs(S.yaw);
  const pf = smoothstep(46, 74, a);
  const pb = smoothstep(50, 78, a);
  const hide = smoothstep(95, 114, a);
  const sgn = S.yaw < 0 ? 1 : -1;
  const puff = S.expr === 'pout' ? 7.0 : 0.0;
  const cheek = (y) => puff * Math.exp(-Math.pow((y - 26) / 15, 2));

  const front = [];
  for (let i = 0; i < HEAD_FRONT_KEYS.length; i++) {
    const y = HEAD_FRONT_KEYS[i][0];
    const x = head_frontXAt(y, pf) - cheek(y) * (1 - pf * 0.5);
    front.push({ x: x, y: y });
  }
  const back = [];
  for (let i = 0; i < HEAD_BACK_KEYS.length; i++) {
    const y = HEAD_BACK_KEYS[i][0];
    const xp = HEAD_BACK_KEYS[i][1];
    const xfvBack = -head_tblX(HEAD_XFV, y);
    let x = lerpVal(xfvBack, xp, pb) + cheek(y) * (1 - pb * 0.6);
    if (hide > 0.001) x = lerpVal(x, head_frontXAt(y, pf), hide * 0.97);
    back.push({ x: x, y: y });
  }
  const backRev = back.slice().reverse();
  const all = front.concat(backRev);
  for (let i = 0; i < all.length; i++) all[i].x *= sgn;
  return { front: front, back: backRev, all: all, pf: pf, pb: pb, hide: hide, sgn: sgn };
}

/* ---------------- 平滑曲线 ---------------- */
function head_smoothClosed(c, pts) {
  const n = pts.length;
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
    const p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    c.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y
    );
  }
  c.closePath();
}
function head_smoothOpen(c, pts) {
  const n = pts.length;
  if (n < 2) return;
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i > 0 ? i - 1 : 0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < n ? i + 2 : n - 1];
    c.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y
    );
  }
}

/* ---------------- 眼睛几何 ----------------
 * 可见性用 projFace 判定（z>0 才画）；水平位置用 Q 版压缩布局：
 * 近侧眼由 +25.5 滑到 -26.5，远侧眼由 -25.5 滑到脸前缘并在 55° 前后淡出。
 * 远侧眼先画，允许被近侧眼盖住一部分（透视上缩在鼻梁后）。 */
function head_eyeGeom(S) {
  const a = Math.abs(S.yaw);
  const t = clamp(a / 90, 0, 1);
  const p = smoothstep(0, 1, t);
  const sgn = S.yaw < 0 ? 1 : -1;
  const s = Math.abs(S.sinY);
  const EW = 14.6;
  const EY = 4;

  const nearX = (25.5 - 52 * p) * sgn;
  const farX = -(25.5 + 13 * Math.min(1, p * 1.15)) * sgn;
  let farW = EW * (1 - 0.48 * Math.min(1, p * 1.15));
  farW *= 1 - 0.55 * smoothstep(44, 56, a);

  const zN = projFace(S, sgn * FISH.eyeX, EY, 37).z;
  const zF = projFace(S, -sgn * FISH.eyeX, EY, 37).z;
  const yN = projFace(S, sgn * FISH.eyeX, EY, 37).y;
  const yF = projFace(S, -sgn * FISH.eyeX, EY, 37).y;

  const hNear = 13.2 * (1 + 0.05 * s);
  const out = [];
  if (zF > 5 && farW > 4.2) {
    out.push({ x: farX, y: yF, w: farW, h: 12.6, cz: zF, near: false });
  }
  let nx = nearX;
  const wNear = EW * (1 - 0.10 * p);
  if (s > 0.80) {
    const shift = smoothstep(0.80, 0.995, s);
    const target = sgn * -(head_frontMagAt(yN, 1) - wNear - 4.4);
    nx = lerpVal(nearX, target, shift);
  }
  out.push({ x: nx, y: yN, w: wNear, h: hNear, cz: zN + 0.1, near: true });
  out.sort((u, v) => u.cz - v.cz);
  return out;
}

/* 眼形（局部坐标 +x = 外眼角） */
function head_eyeShapePath(c, w, h) {
  c.beginPath();
  c.moveTo(-w * 1.00, h * 0.10);
  c.bezierCurveTo(-w * 0.96, -h * 0.56, -w * 0.48, -h * 1.00, w * 0.10, -h * 0.98);
  c.bezierCurveTo(w * 0.62, -h * 0.96, w * 0.98, -h * 0.60, w * 1.02, -h * 0.04);
  c.bezierCurveTo(w * 1.00, h * 0.54, w * 0.55, h * 1.00, -w * 0.02, h * 1.00);
  c.bezierCurveTo(-w * 0.56, h * 0.98, -w * 0.98, h * 0.56, -w * 1.00, h * 0.10);
  c.closePath();
}

function head_drawEye(c, S, g) {
  const w = g.w, h = g.h;
  const side = g.x >= 0 ? 1 : -1;
  const expr = S.expr;
  const blink = S.isBlinking;

  if (expr === 'happy' || blink) {
    c.save();
    c.translate(g.x, g.y);
    if (side < 0) c.scale(-1, 1);
    const up = expr === 'happy' ? 1 : 0.55;
    c.lineCap = 'round';
    c.strokeStyle = '#171528';
    c.lineWidth = Math.max(2.4, w * 0.19);
    c.beginPath();
    c.moveTo(-w * 1.02, h * 0.10);
    c.quadraticCurveTo(0, -h * (0.60 + 0.30 * up), w * 1.04, h * 0.02);
    c.stroke();
    c.lineWidth = Math.max(1.5, w * 0.11);
    c.beginPath();
    c.moveTo(w * 0.88, -h * 0.18); c.quadraticCurveTo(w * 1.04, -h * 0.40, w * 1.12, -h * 0.46);
    c.moveTo(w * 1.00, h * 0.02); c.lineTo(w * 1.14, 0);
    c.stroke();
    c.strokeStyle = 'rgba(150,90,100,0.32)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-w * 0.5, h * 0.45);
    c.quadraticCurveTo(w * 0.2, h * 0.66, w * 0.72, h * 0.40);
    c.stroke();
    c.restore();
    return;
  }

  let lidDrop = 0;
  if (expr === 'smug') lidDrop = 0.34;
  else if (expr === 'sleepy') lidDrop = 0.52;
  else if (expr === 'focused') lidDrop = 0.13;
  else if (expr === 'brace') lidDrop = 0.09;
  else if (expr === 'pout') lidDrop = 0.05;
  const skin = '#fff2ec';

  c.save();
  c.translate(g.x, g.y);
  if (side < 0) c.scale(-1, 1);

  /* 眼白 */
  head_eyeShapePath(c, w, h);
  c.fillStyle = '#fffdfd';
  c.fill();

  c.save();
  head_eyeShapePath(c, w, h);
  c.clip();

  const sh = c.createLinearGradient(0, -h * 1.05, 0, h * 0.35);
  sh.addColorStop(0, 'rgba(126,156,204,0.42)');
  sh.addColorStop(0.55, 'rgba(160,186,224,0.08)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sh;
  c.fillRect(-w * 1.4, -h * 1.4, w * 2.8, h * 2.8);

  /* 虹膜：深藏青 → 钴蓝 → 冰蓝 */
  const irx = w * 0.84, iry = h * 0.87;
  const ix = S.lookX * w * 0.14;
  const iy = h * 0.08 + S.lookY * h * 0.10;
  const ig = c.createLinearGradient(0, iy - iry, 0, iy + iry);
  ig.addColorStop(0.00, '#121f4c');
  ig.addColorStop(0.32, '#1d438f');
  ig.addColorStop(0.58, '#367fd6');
  ig.addColorStop(0.80, '#7fcaf7');
  ig.addColorStop(0.93, '#b9e9ff');
  ig.addColorStop(1.00, '#dcf8ff');
  c.fillStyle = ig;
  c.beginPath();
  c.ellipse(ix, iy, irx, iry, 0, 0, Math.PI * 2);
  c.fill();

  /* 底部月牙亮带 */
  c.strokeStyle = 'rgba(205,246,255,0.9)';
  c.lineWidth = Math.max(1.5, w * 0.13);
  c.beginPath();
  c.ellipse(ix, iy, irx * 0.80, iry * 0.80, 0, Math.PI * 0.14, Math.PI * 0.86);
  c.stroke();
  /* 底部奶白反光 */
  c.fillStyle = 'rgba(253,244,231,0.92)';
  c.beginPath();
  c.ellipse(ix + irx * 0.02, iy + iry * 0.60, irx * 0.30, iry * 0.22, 0, 0, Math.PI * 2);
  c.fill();

  c.strokeStyle = 'rgba(14,26,66,0.6)';
  c.lineWidth = Math.max(0.9, w * 0.055);
  c.beginPath();
  c.ellipse(ix, iy, irx, iry, 0, 0, Math.PI * 2);
  c.stroke();

  /* 瞳孔（竖长深蓝） */
  c.fillStyle = '#101c3e';
  c.beginPath();
  c.ellipse(ix, iy - iry * 0.04, irx * 0.31, iry * 0.45, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(40,86,170,0.5)';
  c.beginPath();
  c.ellipse(ix, iy + iry * 0.30, irx * 0.22, iry * 0.16, 0, 0, Math.PI * 2);
  c.fill();

  /* 高光：左上大椭圆 + 右上小点 + 底部微光 */
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.ellipse(ix - irx * 0.32, iy - iry * 0.44, irx * 0.27, iry * 0.20, -0.32, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(ix + irx * 0.20, iy - iry * 0.40, irx * 0.10, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 0.6;
  c.beginPath();
  c.arc(ix - irx * 0.16, iy + iry * 0.52, irx * 0.07, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;

  if (expr === 'sparkle' || (S.mouth && S.mouth.openness > 0.66)) {
    c.save();
    c.translate(ix + irx * 0.26, iy - iry * 0.30);
    const sc = 1 + Math.sin(S.t * 10) * 0.16;
    c.scale(sc, sc);
    c.fillStyle = '#fff8c8';
    c.beginPath();
    for (let k = 0; k < 8; k++) {
      const rr = (k % 2 === 0 ? 6.0 : 1.8) * (w / 14.6);
      const ang = (k * Math.PI) / 4 - Math.PI / 2;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    c.restore();
  }
  c.restore(); /* 眼形裁剪 */

  /* 内/外眼角暖棕 */
  c.fillStyle = 'rgba(109,52,48,0.9)';
  c.beginPath();
  c.moveTo(-w * 1.01, h * 0.12);
  c.quadraticCurveTo(-w * 0.74, -h * 0.06, -w * 0.46, h * 0.34);
  c.quadraticCurveTo(-w * 0.76, h * 0.40, -w * 1.01, h * 0.12);
  c.fill();
  c.beginPath();
  c.moveTo(w * 1.03, -h * 0.06);
  c.quadraticCurveTo(w * 0.84, -h * 0.30, w * 0.62, h * 0.14);
  c.quadraticCurveTo(w * 0.86, h * 0.18, w * 1.03, -h * 0.06);
  c.fill();

  /* 粗黑上眼睑（外眼角最粗，带睫毛尖） */
  c.beginPath();
  c.moveTo(-w * 1.00, h * 0.10);
  c.bezierCurveTo(-w * 0.96, -h * 0.60, -w * 0.48, -h * 1.12, w * 0.12, -h * 1.08);
  c.bezierCurveTo(w * 0.66, -h * 1.04, w * 1.04, -h * 0.66, w * 1.12, -h * 0.20);
  c.lineTo(w * 1.28, -h * 0.40);      /* 睫毛尖 1 */
  c.lineTo(w * 1.12, -h * 0.10);
  c.lineTo(w * 1.26, h * 0.04);       /* 睫毛尖 2 */
  c.lineTo(w * 1.04, h * 0.18);
  c.lineTo(w * 0.96, h * 0.32);
  c.bezierCurveTo(w * 0.92, -h * 0.20, w * 0.56, -h * 0.66, w * 0.10, -h * 0.68);
  c.bezierCurveTo(-w * 0.44, -h * 0.70, -w * 0.86, -h * 0.40, -w * 0.92, h * 0.10);
  c.closePath();
  c.fillStyle = '#100e1c';
  c.fill();

  /* 双眼皮 */
  c.strokeStyle = 'rgba(122,92,102,0.38)';
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(-w * 0.56, -h * 1.02);
  c.quadraticCurveTo(w * 0.12, -h * 1.30, w * 0.64, -h * 0.98);
  c.stroke();

  /* 下眼睑 */
  c.strokeStyle = 'rgba(150,92,100,0.34)';
  c.lineWidth = 1.15;
  c.beginPath();
  c.moveTo(-w * 0.04, h * 0.99);
  c.quadraticCurveTo(w * 0.58, h * 0.96, w * 0.90, h * 0.46);
  c.stroke();

  /* 半闭眼 */
  if (lidDrop > 0.01) {
    const ly = -h + lidDrop * 2 * h * 0.55;
    c.save();
    head_eyeShapePath(c, w, h);
    c.clip();
    c.fillStyle = skin;
    c.fillRect(-w * 1.4, -h * 1.45, w * 2.9, (ly + h * 1.45));
    c.restore();
    c.strokeStyle = '#100e1c';
    c.lineCap = 'round';
    c.lineWidth = Math.max(2.2, w * 0.15);
    const lw = w * 0.98;
    c.beginPath();
    c.moveTo(-lw, h * 0.30 + ly * 0.10);
    c.quadraticCurveTo(0, ly + h * 0.16, lw, h * 0.06);
    c.stroke();
    c.lineWidth = Math.max(1.3, w * 0.08);
    c.beginPath();
    c.moveTo(lw * 0.92, h * 0.08); c.lineTo(lw * 1.16, h * 0.16);
    c.stroke();
  }
  c.restore();
}

/* ---------------- 眉毛（细短，压在刘海之上） ---------------- */
function head_drawBrow(c, S, browX, browY, w) {
  const expr = S.expr;
  const side = browX >= 0 ? 1 : -1;
  let tilt = 0.04, lift = 0, thin = 1;
  switch (expr) {
    case 'focused': tilt = -0.34; lift = 2.6; break;
    case 'brace': tilt = -0.30; lift = 2.0; break;
    case 'pout': tilt = 0.22; lift = 1.0; break;
    case 'smug': tilt = -0.18; lift = -1.0; break;
    case 'sparkle': lift = -2.2; break;
    case 'happy': lift = -1.6; break;
    case 'sleepy': tilt = 0.26; lift = 1.8; thin = 0.85; break;
  }
  const L = w * 0.46;
  c.save();
  c.translate(browX, browY - lift);
  if (side < 0) c.scale(-1, 1);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const drawB = (off) => {
    c.beginPath();
    c.moveTo(-L, 1.3 + tilt * 2.0 + off);
    c.quadraticCurveTo(0, -2.0 + off, L, 0.7 - tilt * 2.8 + off);
  };
  c.strokeStyle = '#7d4448';
  c.globalAlpha = 0.9;
  c.lineWidth = 2.0 * thin;
  drawB(0);
  c.stroke();
  c.globalAlpha = 0.26;
  c.lineWidth = 0.9;
  drawB(1.0);
  c.stroke();
  c.restore();
  c.globalAlpha = 1;
}

/* ---------------- 嘴 ---------------- */
function head_drawMouth(c, S) {
  const mouth = S.mouth || { openness: 0, vowel: 'closed' };
  const open = clamp(mouth.openness || 0, 0, 1);
  const expr = S.expr;
  const pm = projFace(S, 0, 32.5, 44);
  const pfM = smoothstep(40, 74, Math.abs(S.yaw));
  const mx = pm.x + (pm.x < 0 ? 1.2 : -1.2) * pfM;
  const my = pm.y;
  const side = mx >= 0 ? 1 : -1;
  const sc = lerpVal(1, 0.92, pfM);

  c.save();
  c.translate(mx, my);
  c.scale(sc * (side < 0 ? -1 : 1), sc);

  if (open > 0.07 && expr !== 'pout') {
    let mw = 2.8 + 1.9 * open, mh = 1.0 + 5.2 * open;
    const v = mouth.vowel;
    if (v === 'a') { mw += 1.3; mh *= 1.10; }
    else if (v === 'o' || v === 'u') { mw *= 0.80; mh *= 1.05; }
    else if (v === 'i' || v === 'e') { mw *= 1.16; mh *= 0.72; }
    c.fillStyle = '#8d2f40';
    c.beginPath();
    c.ellipse(0, mh * 0.28, mw, mh, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e08e9c';
    c.beginPath();
    c.ellipse(0, mh * 0.70, mw * 0.58, mh * 0.34, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(120,52,62,0.7)';
    c.lineWidth = 1.0;
    c.beginPath();
    c.moveTo(-mw, mh * 0.26);
    c.quadraticCurveTo(0, -mh * 0.35, mw, mh * 0.26);
    c.stroke();
  } else if (expr === 'pout') {
    c.strokeStyle = '#b4586a';
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-2.4, 0.4);
    c.quadraticCurveTo(-1.1, -1.9, 0, 0.2);
    c.quadraticCurveTo(1.1, -1.7, 2.4, 0.4);
    c.stroke();
  } else if (expr === 'smug') {
    c.strokeStyle = '#a95a63';
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-2.4, 0.8);
    c.quadraticCurveTo(0.4, 1.6, 2.8, -1.2);
    c.stroke();
  } else if (expr === 'brace') {
    c.strokeStyle = '#a95a63';
    c.lineWidth = 1.8;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-2.2, 0.4); c.lineTo(0, 0.8); c.lineTo(2.2, 0.4);
    c.stroke();
  } else if (expr === 'sparkle' || expr === 'happy') {
    c.fillStyle = '#9a3546';
    c.beginPath();
    c.ellipse(0, 1.2, 3.2, 2.2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e79aa6';
    c.beginPath();
    c.ellipse(0, 2.1, 1.9, 0.9, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.strokeStyle = '#a9565f';
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-2.2, 0.1);
    c.quadraticCurveTo(0, 1.5, 2.2, 0.1);
    c.stroke();
  }
  c.restore();
}

/* ---------------- 主体 ---------------- */
function drawHead(ctx, S) {
  if (S.yaw > 115 || S.yaw < -115) return;   /* 背面不画脸 */

  const shape = head_faceShape(S);
  const pf = shape.pf, pb = shape.pb, sgn = shape.sgn;
  const a = Math.abs(S.yaw);

  /* 脸盘 */
  const faceGrad = ctx.createLinearGradient(0, -58, 0, 56);
  faceGrad.addColorStop(0, '#fff7f2');
  faceGrad.addColorStop(0.45, '#fff1ea');
  faceGrad.addColorStop(1, '#fde6dc');

  ctx.save();
  ctx.beginPath();
  head_smoothClosed(ctx, shape.all);
  ctx.fillStyle = faceGrad;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  head_smoothClosed(ctx, shape.all);
  ctx.clip();

  /* 刘海投影 */
  const hg = ctx.createLinearGradient(0, -60, 0, -22);
  hg.addColorStop(0, 'rgba(212,170,162,0.40)');
  hg.addColorStop(0.7, 'rgba(212,170,162,0.09)');
  hg.addColorStop(1, 'rgba(212,170,162,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-72, -74);
  ctx.lineTo(72, -74);
  ctx.bezierCurveTo(52, -50, 38, -38, 22, -46);
  ctx.bezierCurveTo(11, -53, 3, -36, -9, -42);
  ctx.bezierCurveTo(-20, -49, -32, -38, -44, -47);
  ctx.bezierCurveTo(-54, -55, -64, -50, -72, -74);
  ctx.closePath();
  ctx.fill();

  /* 后缘（头发侧）一丝柔和阴影，衔接鬓发 */
  if (pb > 0.1) {
    ctx.save();
    ctx.globalAlpha = 0.045 * pb;
    ctx.strokeStyle = '#c58a7e';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 18 - i * 5;
      ctx.beginPath();
      head_smoothOpen(ctx, shape.back);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 下颌阴影 */
  ctx.save();
  ctx.globalAlpha = 0.08;
  const jg = ctx.createLinearGradient(0, 20, 0, 54);
  jg.addColorStop(0, 'rgba(214,158,150,0)');
  jg.addColorStop(1, 'rgba(206,140,132,1)');
  ctx.fillStyle = jg;
  ctx.fillRect(-72, 22, 144, 36);
  ctx.restore();

  /* 腮红：跟着脸的球面走，正侧时远侧自然被脸缘裁掉 */
  for (let i = 0; i < 2; i++) {
    const se = i === 0 ? -1 : 1;
    const pp = projFace(S, se * 27, 26, 40);
    if (pp.z < 8) continue;
    const fade = 1 - smoothstep(40, 78, a) * (se * sgn > 0 ? 0.15 : 0.85);
    wcWashBlob(ctx, pp.x, pp.y, lerpVal(10.0, 8.0, pf), lerpVal(5.6, 5.0, pf), BLUSH, 0.42 * fade, 62 + i);
  }

  /* 眼 */
  const eyes = head_eyeGeom(S);
  for (let i = 0; i < eyes.length; i++) head_drawEye(ctx, S, eyes[i]);

  /* 鼻：正面小弧点 / 侧面鼻翼线 */
  const pn = projFace(S, 0, 21, 47);
  if (pf < 0.72) {
    ctx.save();
    ctx.globalAlpha = (1 - smoothstep(0.2, 0.72, pf)) * 0.8;
    ctx.strokeStyle = '#b96f6a';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pn.x - 1.5, pn.y - 0.6);
    ctx.quadraticCurveTo(pn.x, pn.y + 1.2, pn.x + 1.5, pn.y - 0.6);
    ctx.stroke();
    ctx.restore();
  }
  if (pf > 0.2) {
    ctx.save();
    ctx.globalAlpha = smoothstep(0.2, 0.68, pf) * 0.8;
    const ex = head_frontMagAt(pn.y, pf);
    ctx.strokeStyle = 'rgba(196,132,124,0.9)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sgn * (ex - 4.4), 21.4);
    ctx.quadraticCurveTo(sgn * (ex - 2.7), 23.2, sgn * (ex - 5.6), 22.7);
    ctx.stroke();
    ctx.restore();
  }

  /* 嘴 */
  head_drawMouth(ctx, S);

  ctx.restore(); /* 取消脸型裁剪 */

  /* 脸部墨线 */
  hbStrokePath(ctx, (c, ox, oy) => {
    c.translate(ox, oy);
    head_smoothOpen(c, shape.front);
    c.translate(-ox, -oy);
  }, INK, 2.6, 64);

  const backAlpha = 1 - smoothstep(0.55, 0.95, pb) * 0.72;
  if (backAlpha > 0.02) {
    hbStrokePath(ctx, (c, ox, oy) => {
      c.translate(ox, oy);
      head_smoothOpen(c, shape.back);
      c.translate(-ox, -oy);
    }, 'rgba(25,27,48,' + (backAlpha).toFixed(3) + ')', 2.2, 65);
  }

  /* 眉毛：最后画（刘海之上） */
  for (let i = 0; i < eyes.length; i++) {
    const g = eyes[i];
    const bw = Math.min(g.w * 0.92, 13.0 * (1 - 0.14 * Math.abs(S.sinY)));
    const bx = lerpVal(g.x, sgn * -30.5, pf * 0.95);
    const by = lerpVal(g.y - g.h - 5.6, -20.5, pf);
    head_drawBrow(ctx, S, bx, by, bw);
  }
}
