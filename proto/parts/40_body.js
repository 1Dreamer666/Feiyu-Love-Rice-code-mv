/* ============================================================================
 * 躯干与裙装 —— drawBody(ctx, S)  v1
 * 负责：脖子 / 白色彼得潘领 / 竖褶前襟 + 金扣 / 领口蝴蝶结 + 宝石胸针
 *       藏青女仆上身 / 白色荷叶边围裙 + 喷水蓝鲸刺绣 / 主裙 + 金线巴洛克刺绣
 *       双层百褶衬裙 / 裙摆蝴蝶结（正 2 侧 1 背 1 大）
 * 不画手臂（50_arms.js）、不画腿（60_legs_tail.js）。
 * 坐标锚点：肩 70 / 腰 98 / 裙摆 146 / 脚 172；原点 = 头部中心。
 * ========================================================================== */

const BODY_DEEP = '#12182e';
const BODY_INK = '#191b30';
const BODY_NAVY = '#1c2442';
const BODY_NAVY2 = '#26325a';
const BODY_NAVY3 = '#34457c';
const BODY_CREAM = '#fbf8f3';
const BODY_CREAM2 = '#f2eee6';
const BODY_RUFF = '#dfe5f2';
const BODY_LACE = '#e9eef8';
const BODY_GOLD = '#deb057';
const BODY_GOLD_D = '#b07e2c';
const BODY_GOLD_L = '#f2d491';

const BODY_WAIST = 98;
const BODY_HEM = 146.6;
const BODY_SKIRT_DY = BODY_HEM - BODY_WAIST;

/* ------------------------------ 2.5D 投影小工具 ---------------------------- */

/* 椭圆截面的屏幕支持半宽：正面 = rx，正侧 = rz（主裙 66 → 42） */
function body_halfW(rx, rz, S) {
  return Math.sqrt(Math.pow(rx * S.cosY, 2) + Math.pow(rz * S.sinY, 2));
}

/* 包在椭圆柱面上的点的屏幕 x（theta=0 为正前方） */
function body_surfX(theta, rx, rz, S) {
  return rx * Math.sin(theta) * S.cosY + rz * Math.cos(theta) * S.sinY;
}

/* 柱面上点是否朝向镜头（z>0 可见） */
function body_visible(x, z, S) {
  return (-x * S.sinY + z * S.cosY) > 0.5;
}

/* 正胸前平面图层：随 yaw 横向压缩 + 向面朝方向平移 */
function body_withFrontPlane(ctx, S, z, fn) {
  ctx.save();
  ctx.translate(z * S.sinY, 0);
  ctx.scale(Math.max(0.035, S.cosY), 1);
  fn();
  ctx.restore();
}

function body_fillPts(ctx, pts, fill, close) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close !== false) ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function body_strokePts(ctx, pts, color, weight, seed, closed, alpha) {
  if (!pts || pts.length < 2) return;
  const pathFn = (c, ox, oy) => {
    c.moveTo(pts[0].x + ox, pts[0].y + oy);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x + ox, pts[i].y + oy);
    if (closed) c.closePath();
  };
  if (weight >= 1.75) {
    hbStrokePath(ctx, pathFn, color, weight, seed || 1);
    return;
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.globalAlpha = alpha == null ? 0.95 : alpha;
  ctx.beginPath();
  pathFn(ctx, 0, 0);
  ctx.stroke();
  ctx.restore();
}

/* 沿着点列画渐变/细分金线（不加手绘双描边，保持纤细） */
function body_goldLine(ctx, pts, color, w, alpha) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

function body_quadPts(x0, y0, cx, cy, x1, y1, n, out) {
  const arr = out || [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, it = 1 - t;
    arr.push({
      x: it * it * x0 + 2 * it * t * cx + t * t * x1,
      y: it * it * y0 + 2 * it * t * cy + t * t * y1
    });
  }
  return arr;
}

/* 主裙与围裙共享的椭圆半径随高度的变化 */
function body_skirtRxAt(y) {
  const t = clamp((y - BODY_WAIST) / BODY_SKIRT_DY, 0, 1.2);
  return 25 + 41 * Math.pow(t, 1.35);
}
function body_skirtRzAt(y) {
  const t = clamp((y - BODY_WAIST) / BODY_SKIRT_DY, 0, 1.2);
  return 18.5 + 23.5 * Math.pow(t, 1.25);
}
function body_apronRxAt(y) {
  if (y <= BODY_WAIST) return lerpVal(23.2, 25.0, clamp((y - 92) / 6, 0, 1));
  const t = clamp((y - BODY_WAIST) / 9, 0, 1);
  return lerpVal(25.0, body_skirtRxAt(y) * 0.995, t);
}
function body_apronRzAt(y) {
  if (y <= BODY_WAIST) return lerpVal(16.4, 17.4, clamp((y - 92) / 6, 0, 1));
  const t = clamp((y - BODY_WAIST) / 9, 0, 1);
  return lerpVal(17.4, body_skirtRzAt(y) + 1.0, t);
}
function body_bodiceRxAt(y, S) {
  const t = clamp((y - 66) / 33, 0, 1);
  const bulge = Math.sin(clamp((y - 66) / 30, 0, 1) * Math.PI) * 1.45;
  return lerpVal(25.6, 21.4, smoothstep(0, 1, t)) + bulge +
    (S && S.breath ? S.breath * 0.055 : 0);
}

/* ---------------------------------- 脖子 ---------------------------------- */
function body_drawNeck(ctx, S) {
  const shift = -S.sinY * 9.6;              // 侧面时脖子偏后
  const yTop = 45.0, yBot = 70.6;
  const left = [], right = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    const y = yTop + (yBot - yTop) * t;
    const w = lerpVal(7.2, 9.5, Math.pow(t, 0.82));
    left.push({ x: shift - w, y });
    right.push({ x: shift + w, y });
  }
  const pts = left.concat(right.slice().reverse());
  body_fillPts(ctx, pts, '#fff1ea');

  // 下巴投影（上端深、下端渐淡）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(shift - 8.4, 45);
  ctx.lineTo(shift + 8.4, 45);
  ctx.lineTo(shift + 8.0, 56.5);
  ctx.quadraticCurveTo(shift, 61.5, shift - 8.0, 56.5);
  ctx.closePath();
  const chinGrad = ctx.createLinearGradient(0, 45, 0, 61);
  chinGrad.addColorStop(0, 'rgba(209,158,146,0.78)');
  chinGrad.addColorStop(0.5, 'rgba(232,190,177,0.48)');
  chinGrad.addColorStop(1, 'rgba(246,217,207,0)');
  ctx.fillStyle = chinGrad;
  ctx.fill();
  ctx.restore();

  // 侧向柔影
  ctx.save();
  const ng = ctx.createLinearGradient(shift - 10, 0, shift + 10, 0);
  ng.addColorStop(0, 'rgba(246,217,207,0.95)');
  ng.addColorStop(0.42, 'rgba(255,241,234,0)');
  ng.addColorStop(1, 'rgba(236,197,185,0.6)');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 只勾两侧与下端（上端藏在下巴后）
  const sidePts = left.concat(right.slice().reverse());
  body_strokePts(ctx, sidePts, BODY_INK, 1.3, 11, true, 0.55);
}

/* ------------------------------- 双层百褶衬裙 ------------------------------ */
function body_drawPettiBand(ctx, S, inner) {
  const N = 14;
  const yTop = inner ? 140.6 : 141.2;
  const yBot = inner ? 149.0 : 148.0;
  const wTop = body_halfW(inner ? 59.5 : 60.5, inner ? 38.0 : 38.6, S);
  const wBot = body_halfW(inner ? 71.4 : 70.4, inner ? 46.3 : 45.7, S);
  const edgeY = yBot - 2.2;

  // 底缘：14 个圆润褶瓣
  const bottom = [];
  for (let i = 0; i < N; i++) {
    const x0 = -wBot + (2 * wBot) * (i / N);
    const x1 = -wBot + (2 * wBot) * ((i + 1) / N);
    const xm = (x0 + x1) * 0.5;
    body_quadPts(x0, edgeY, xm, yBot + 0.6, x1, edgeY, 7, bottom);
  }

  const outline = [];
  body_quadPts(-wTop, yTop, -wBot * 0.995, (yTop + edgeY) * 0.5, -wBot, edgeY, 6, outline);
  for (let i = 1; i < bottom.length; i++) outline.push(bottom[i]);
  body_quadPts(wBot, edgeY, wBot * 0.995, (yTop + edgeY) * 0.5, wTop, yTop, 6, outline);

  const grad = ctx.createLinearGradient(0, 143, 0, yBot + 1);
  if (inner) {
    grad.addColorStop(0, '#e6eaf3');
    grad.addColorStop(0.55, '#dde3ef');
    grad.addColorStop(1, '#d2daeb');
  } else {
    grad.addColorStop(0, '#fffdf8');
    grad.addColorStop(0.42, '#faf5ec');
    grad.addColorStop(1, '#eceef6');
  }
  body_fillPts(ctx, outline, grad);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(outline[0].x, outline[0].y);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
  ctx.closePath();
  ctx.clip();

  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const bx0 = -wBot + 2 * wBot * t0;
    const bx1 = -wBot + 2 * wBot * t1;
    const tx0 = -wTop + 2 * wTop * t0;
    const tx1 = -wTop + 2 * wTop * t1;
    const xm = (bx0 + bx1) * 0.5;

    if (!inner) {
      // 每个褶：左侧浅灰蓝影，右侧奶油高光
      const g = ctx.createLinearGradient(0, 143, 0, yBot);
      g.addColorStop(0, 'rgba(176,167,205,0.10)');
      g.addColorStop(0.38, 'rgba(181,173,209,0.34)');
      g.addColorStop(0.78, 'rgba(204,200,226,0.50)');
      g.addColorStop(1, 'rgba(226,223,238,0.28)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(tx0, yTop);
      ctx.lineTo(bx0, edgeY);
      ctx.lineTo(xm, yBot + 0.4);
      ctx.lineTo((tx0 + tx1) * 0.5, yTop);
      ctx.closePath();
      ctx.fill();

      const g2 = ctx.createLinearGradient(0, 143, 0, yBot);
      g2.addColorStop(0, 'rgba(255,255,255,0.0)');
      g2.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      g2.addColorStop(1, 'rgba(255,255,255,0.62)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(xm, yTop);
      ctx.lineTo((bx0 + xm) * 0.5, edgeY);
      ctx.lineTo(bx1, edgeY);
      ctx.lineTo(tx1, yTop);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(152,165,196,0.18)';
      ctx.beginPath();
      ctx.moveTo(tx0, yTop);
      ctx.lineTo(bx0, edgeY);
      ctx.lineTo(xm, yBot + 0.4);
      ctx.lineTo((tx0 + tx1) * 0.5, yTop);
      ctx.closePath();
      ctx.fill();
    }

    // 褶线
    ctx.strokeStyle = inner ? 'rgba(140,153,184,0.38)' : 'rgba(151,160,192,0.85)';
    ctx.lineWidth = inner ? 0.9 : 1.25;
    ctx.beginPath();
    ctx.moveTo(tx0, yTop + 1.0);
    ctx.quadraticCurveTo((tx0 + bx0) * 0.5 - 0.3, (yTop + edgeY) * 0.5, bx0, edgeY - 0.3);
    ctx.stroke();
  }

  // 贴主裙底缘的投影
  const topShade = ctx.createLinearGradient(0, 143.2, 0, 147.5);
  topShade.addColorStop(0, 'rgba(76,88,122,0.42)');
  topShade.addColorStop(1, 'rgba(76,88,122,0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(-wBot - 2, 143.2, wBot * 2 + 4, 4.5);
  ctx.restore();

  // 外圈描边
  body_strokePts(ctx, outline, BODY_INK, inner ? 1.1 : 1.7, inner ? 33 : 32, true);

  if (!inner) {
    // 金色蕾丝：细金线贴着褶底 + 每个褶两枚小卷环
    const lace = [];
    for (let i = 0; i < N; i++) {
      const x0 = -wBot + (2 * wBot) * (i / N);
      const x1 = -wBot + (2 * wBot) * ((i + 1) / N);
      const xm = (x0 + x1) * 0.5;
      body_quadPts(x0, edgeY - 0.8, xm, yBot - 0.7, x1, edgeY - 0.8, 6, lace);
    }
    body_goldLine(ctx, lace, BODY_GOLD, 0.9, 0.95);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = BODY_GOLD;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.92;
    for (let i = 0; i < N; i++) {
      const xm = -wBot + (2 * wBot) * ((i + 0.5) / N);
      const loopY = yBot - 3.1;
      ctx.beginPath();
      ctx.arc(xm - 1.9, loopY, 1.0, Math.PI * 0.9, Math.PI * 2.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(xm + 1.9, loopY + 0.4, 0.8, Math.PI * 0.9, Math.PI * 2.4);
      ctx.stroke();
    }
    ctx.fillStyle = BODY_GOLD_L;
    for (let i = 0; i < N; i += 2) {
      const x = -wBot + (2 * wBot) * (i / N);
      ctx.beginPath();
      ctx.arc(x, yBot - 1.5, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------- 主裙 + 金绣 ------------------------------- */
function body_makeSkirtPoints(S) {
  const pts = [];
  const N = 26;
  const ySide = 143.3;
  const hwMax = body_halfW(66, 42, S);
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const y = BODY_WAIST + (ySide - BODY_WAIST) * s;
    const rx = 25 + 41 * Math.pow(s, 0.96);
    const rz = 18.5 + 23.5 * Math.pow(s, 0.9);
    pts.push({ x: -body_halfW(rx, rz, S), y });
  }
  // 裙摆底缘（中间略垂）
  const M = 30;
  for (let i = 1; i < M; i++) {
    const u = -1 + (2 * i) / M;
    pts.push({ x: u * hwMax, y: BODY_HEM - 3.6 * u * u });
  }
  for (let i = N; i >= 0; i--) {
    const s = i / N;
    const y = BODY_WAIST + (ySide - BODY_WAIST) * s;
    const rx = 25 + 41 * Math.pow(s, 0.96);
    const rz = 18.5 + 23.5 * Math.pow(s, 0.9);
    pts.push({ x: body_halfW(rx, rz, S), y });
  }
  // 腰口（被上身盖住）
  for (let i = 1; i < 8; i++) {
    const u = 1 - (2 * i) / 8;
    pts.push({ x: u * 25 * Math.abs(S.cosY), y: 98.3 + (1 - u * u) * 0.9 });
  }
  return pts;
}

function body_hemYAtU(u) {
  return BODY_HEM - 3.6 * u * u;
}

/* 巴洛克卷草纹样 A：卷涡 + 小玫瑰 + 叶（细金线，不堆金块） */
function body_goldMotifA(ctx) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = BODY_GOLD;
  ctx.lineWidth = 1.2;

  // 主卷涡
  ctx.beginPath();
  ctx.arc(0.2, -0.1, 2.15, Math.PI * 0.1, Math.PI * 1.64);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0.2, -0.1, 0.92, Math.PI * 0.7, Math.PI * 2.28);
  ctx.stroke();

  // 左藤蔓
  ctx.beginPath();
  ctx.moveTo(-1.9, 0.2);
  ctx.bezierCurveTo(-3.2, -1.2, -4.7, -1.1, -5.9, 0.0);
  ctx.bezierCurveTo(-4.6, 0.5, -3.4, 0.7, -2.0, 1.1);
  ctx.stroke();

  // 右叶
  ctx.beginPath();
  ctx.moveTo(2.1, 0.2);
  ctx.bezierCurveTo(3.6, -1.3, 5.3, -1.5, 6.6, -0.5);
  ctx.bezierCurveTo(5.3, 0.8, 3.6, 1.0, 2.3, 0.9);
  ctx.stroke();

  // 小玫瑰（两圈 + 细点）
  ctx.strokeStyle = BODY_GOLD_L;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(-4.1, -0.1, 1.0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-4.1, -0.1, 0.45, 0.4, Math.PI * 1.8);
  ctx.stroke();
  ctx.fillStyle = BODY_GOLD;
  ctx.beginPath();
  ctx.arc(-4.1, -0.1, 0.34, 0, Math.PI * 2);
  ctx.fill();

  // 暗部小勾
  ctx.strokeStyle = BODY_GOLD_D;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(4.2, 0.2);
  ctx.quadraticCurveTo(5.0, 0.8, 6.0, 0.7);
  ctx.stroke();

  ctx.fillStyle = BODY_GOLD_L;
  ctx.beginPath();
  ctx.arc(2.0, 1.05, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* 巴洛克卷草纹样 B：贝壳扇 + 双卷须 */
function body_goldMotifB(ctx) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = BODY_GOLD;
  ctx.lineWidth = 1.2;

  // 贝壳扇
  ctx.beginPath();
  ctx.arc(0, 1.45, 2.55, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * 1.24 + (i / 2) * Math.PI * 0.52;
    ctx.beginPath();
    ctx.moveTo(0, 1.4);
    ctx.lineTo(Math.cos(a) * 2.6, 1.4 + Math.sin(a) * 2.6);
    ctx.stroke();
  }
  ctx.fillStyle = BODY_GOLD_L;
  ctx.beginPath();
  ctx.arc(0, -1.15, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // 双卷须
  ctx.beginPath();
  ctx.arc(-4.1, -0.1, 1.7, Math.PI * 0.08, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(4.1, -0.1, 1.7, Math.PI * 1.5, Math.PI * 2.92);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-2.6, 0.9);
  ctx.quadraticCurveTo(-1.3, 1.85, 0, 1.9);
  ctx.quadraticCurveTo(1.3, 1.85, 2.6, 0.9);
  ctx.stroke();

  ctx.strokeStyle = BODY_GOLD_D;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-5.7, -1.0);
  ctx.quadraticCurveTo(-7.0, -1.9, -7.5, -1.2);
  ctx.moveTo(5.7, -1.0);
  ctx.quadraticCurveTo(7.0, -1.9, 7.5, -1.2);
  ctx.stroke();
  ctx.restore();
}

function body_drawSkirtGold(ctx, S, hwMax, a) {
  const hwBand = hwMax * 0.935;
  const nGroups = hwBand > 50 ? 7 : clamp(Math.round(6 * hwBand / 56), 4, 6);

  const topRail = [], botRail1 = [], botRail2 = [], beadPts = [];
  const N = 52;
  for (let i = 0; i <= N; i++) {
    const u = -0.95 + (1.9 * i) / N;
    const y = body_hemYAtU(u);
    const wob = (detNoise1D(i * 0.55, 7) - 0.5) * 0.3;
    topRail.push({ x: u * hwBand, y: y - 11.6 + wob });
    botRail1.push({ x: u * hwBand, y: y - 3.8 + wob * 0.6 });
    botRail2.push({ x: u * hwBand, y: y - 1.95 + wob * 0.6 });
    if (i % 3 === 0 && i > 2 && i < N - 2) beadPts.push({ x: u * hwBand, y: y - 5.0 });
  }
  // 刺绣带上沿
  body_goldLine(ctx, topRail, BODY_GOLD, 1.18, 0.98);
  // 底缘双轨滚边
  body_goldLine(ctx, botRail1, BODY_GOLD, 1.25, 1);
  body_goldLine(ctx, botRail2, BODY_GOLD, 0.85, 0.95);

  // 7~8 组卷草 / 贝壳 / 玫瑰（按可见宽度自动调整组数）
  for (let g = 0; g < nGroups; g++) {
    const t = (g + 0.5) / nGroups;
    const u = -0.85 + 1.70 * t;
    const x = u * hwBand;
    const y = body_hemYAtU(u) - 8.15;
    const isCenter = hwBand > 50 && g === 3;
    const s = clamp(hwBand / 80, 0.56, 0.78) * (isCenter ? 1.14 : 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    if (g % 2 === 1) ctx.scale(-1, 1);
    if (g % 2 === 0) body_goldMotifA(ctx);
    else body_goldMotifB(ctx);
    ctx.restore();
  }

  // 金色小珠列（夹在双轨之间）
  ctx.save();
  ctx.fillStyle = BODY_GOLD_L;
  beadPts.forEach((p) => {
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/* 藏青 + 金边蝴蝶结（裙摆用） */
function body_drawSkirtBow(ctx, x, y, s, tails) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  const loopPath = (sgn) => (c, ox, oy) => {
    c.moveTo(sgn * 1.3 + ox, -2.0 + oy);
    c.bezierCurveTo(sgn * 4.6 + ox, -8.2 + oy, sgn * 11.4 + ox, -8.6 + oy, sgn * 13.1 + ox, -2.6 + oy);
    c.bezierCurveTo(sgn * 14.3 + ox, 2.4 + oy, sgn * 9.1 + ox, 6.0 + oy, sgn * 4.9 + ox, 4.2 + oy);
    c.bezierCurveTo(sgn * 2.3 + ox, 3.2 + oy, sgn * 1.0 + ox, 1.0 + oy, sgn * 1.3 + ox, -2.0 + oy);
    c.closePath();
  };

  // 垂带
  if (tails !== false) {
    const tailPath = (sgn) => (c, ox, oy) => {
      c.moveTo(sgn * 1.7 + ox, 2.2 + oy);
      c.quadraticCurveTo(sgn * 4.2 + ox, 8.0 + oy, sgn * 6.2 + ox, 12.6 + oy);
      c.lineTo(sgn * 3.6 + ox, 14.8 + oy);
      c.lineTo(sgn * 2.9 + ox, 11.7 + oy);
      c.lineTo(sgn * 1.0 + ox, 14.0 + oy);
      c.quadraticCurveTo(sgn * 0.4 + ox, 7.6 + oy, sgn * 0.2 + ox, 2.4 + oy);
      c.closePath();
    };
    [1, -1].forEach((sgn) => {
      const p = tailPath(sgn);
      ctx.beginPath();
      p(ctx, 0, 0);
      ctx.fillStyle = '#1a2340';
      ctx.fill();
      hbStrokePath(ctx, p, BODY_INK, 1.25, sgn > 0 ? 71 : 72);
      ctx.strokeStyle = BODY_GOLD;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(sgn * 3.2, 5.4);
      ctx.quadraticCurveTo(sgn * 4.2, 8.4, sgn * 3.9, 11.2);
      ctx.stroke();
      ctx.strokeStyle = BODY_GOLD_D;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(sgn * 3.6, 8.8, 1.25, Math.PI * 0.9, Math.PI * 2.5);
      ctx.stroke();
      ctx.fillStyle = BODY_GOLD;
      ctx.beginPath();
      ctx.arc(sgn * 3.6, 8.8, 0.55, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  [1, -1].forEach((sgn) => {
    const p = loopPath(sgn);
    ctx.beginPath();
    p(ctx, 0, 0);
    const bg = ctx.createLinearGradient(0, -8, 0, 6);
    bg.addColorStop(0, '#3a4d88');
    bg.addColorStop(0.55, '#2b3a6b');
    bg.addColorStop(1, '#1d2848');
    ctx.fillStyle = bg;
    ctx.fill();
    hbStrokePath(ctx, p, BODY_INK, 1.4, sgn > 0 ? 74 : 75);
    // 金边
    ctx.save();
    ctx.strokeStyle = BODY_GOLD;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.96;
    ctx.beginPath();
    ctx.moveTo(sgn * 2.9, -2.4);
    ctx.bezierCurveTo(sgn * 6.2, -7.0, sgn * 11.0, -7.0, sgn * 12.2, -2.4);
    ctx.stroke();
    ctx.strokeStyle = BODY_GOLD_D;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(sgn * 3.3, 1.9);
    ctx.bezierCurveTo(sgn * 6.0, 3.8, sgn * 10.2, 3.3, sgn * 12.0, 0.4);
    ctx.stroke();
    ctx.restore();
    // 内侧金线
    ctx.save();
    ctx.strokeStyle = BODY_GOLD_L;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(sgn * 3.4, -3.6);
    ctx.quadraticCurveTo(sgn * 7.0, -5.2, sgn * 10.4, -3.2);
    ctx.stroke();
    ctx.restore();
    // 布面高光
    ctx.save();
    ctx.strokeStyle = 'rgba(150,170,235,0.4)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sgn * 3.3, -2.2);
    ctx.quadraticCurveTo(sgn * 6.8, -4.6, sgn * 9.9, -3.4);
    ctx.stroke();
    ctx.restore();
  });

  // 结心
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.5, 4.1, 0, 0, Math.PI * 2);
  const kg = ctx.createLinearGradient(0, -4, 0, 4);
  kg.addColorStop(0, '#3a4d88');
  kg.addColorStop(1, '#19213c');
  ctx.fillStyle = kg;
  ctx.fill();
  hbStrokePath(ctx, (c, ox, oy) => c.ellipse(ox, oy, 3.5, 4.1, 0, 0, Math.PI * 2), BODY_INK, 1.15, 76);
  // 金线束腰
  ctx.strokeStyle = BODY_GOLD;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-2.7, -0.9);
  ctx.quadraticCurveTo(0, 0.5, 2.7, -0.9);
  ctx.stroke();
  ctx.fillStyle = BODY_GOLD_D;
  ctx.beginPath();
  ctx.arc(0, 0.1, 1.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BODY_GOLD_L;
  ctx.beginPath();
  ctx.arc(-0.3, -0.25, 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* 背面大蝴蝶结 + 垂带 */
function body_drawBackBow(ctx, S) {
  const a = Math.abs(S.cosY);
  const y = 113.5;
  const rz = body_skirtRzAt(y);
  const bx = -rz * S.sinY;
  const sway = S.hairWave2 * 0.6;
  ctx.save();
  ctx.translate(bx, y);
  ctx.scale(Math.max(0.35, a), 1);

  // 垂带（两条长带，尾端燕尾剪口）
  const tail = (sgn) => (c, ox, oy) => {
    c.moveTo(sgn * 2.4 + ox, 3.6 + oy);
    c.bezierCurveTo(sgn * 11.2 + ox, 12.6 + oy, sgn * 12.4 + ox, 22.0 + oy, sgn * (11.0 + sway * 0.5) + ox, 29.2 + oy);
    c.lineTo(sgn * 6.6 + ox, 31.0 + oy);
    c.lineTo(sgn * 7.4 + ox, 26.2 + oy);
    c.lineTo(sgn * 4.0 + ox, 29.6 + oy);
    c.bezierCurveTo(sgn * 5.4 + ox, 19.0 + oy, sgn * 3.4 + ox, 10.8 + oy, sgn * 1.0 + ox, 4.4 + oy);
    c.closePath();
  };
  [1, -1].forEach((sgn) => {
    const p = tail(sgn);
    ctx.beginPath();
    p(ctx, 0, 0);
    const tg = ctx.createLinearGradient(0, 4, 0, 30);
    tg.addColorStop(0, '#222d54');
    tg.addColorStop(1, '#151c33');
    ctx.fillStyle = tg;
    ctx.fill();
    hbStrokePath(ctx, p, BODY_INK, 1.9, sgn > 0 ? 81 : 82);
    // 金色滚边与卷草
    ctx.strokeStyle = BODY_GOLD;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(sgn * 8.8, 13.0);
    ctx.bezierCurveTo(sgn * 10.4, 18.0, sgn * 9.8, 23.0, sgn * 9.4, 26.4);
    ctx.stroke();
    ctx.strokeStyle = BODY_GOLD_D;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.arc(sgn * 8.2, 19.2, 2.0, Math.PI * 0.7, Math.PI * 2.4);
    ctx.stroke();
    ctx.strokeStyle = BODY_GOLD_L;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(sgn * 8.2, 19.2, 0.85, Math.PI * 0.2, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = BODY_GOLD;
    ctx.beginPath();
    ctx.arc(sgn * 8.2, 19.2, 0.58, 0, Math.PI * 2);
    ctx.fill();
  });

  // 大蝴蝶结双环
  [1, -1].forEach((sgn) => {
    const p = (c, ox, oy) => {
      c.moveTo(sgn * 2.2 + ox, -2.6 + oy);
      c.bezierCurveTo(sgn * 10.0 + ox, -18.0 + oy, sgn * 27.0 + ox, -15.5 + oy, sgn * 30.0 + ox, -1.2 + oy);
      c.bezierCurveTo(sgn * 31.0 + ox, 10.0 + oy, sgn * 12.0 + ox, 12.0 + oy, sgn * 1.6 + ox, 3.6 + oy);
      c.closePath();
    };
    ctx.beginPath();
    p(ctx, 0, 0);
    const bg = ctx.createLinearGradient(0, -16, 0, 12);
    bg.addColorStop(0, '#263561');
    bg.addColorStop(0.6, '#1d2747');
    bg.addColorStop(1, '#151d35');
    ctx.fillStyle = bg;
    ctx.fill();
    hbStrokePath(ctx, p, BODY_INK, 2.0, sgn > 0 ? 83 : 84);

    // 金边（外缘）
    ctx.strokeStyle = BODY_GOLD;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(sgn * 5.5, -4.2);
    ctx.bezierCurveTo(sgn * 12.0, -12.0, sgn * 23.0, -11.2, sgn * 26.8, -2.4);
    ctx.stroke();
    ctx.strokeStyle = BODY_GOLD_D;
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(sgn * 5.5, 2.4);
    ctx.bezierCurveTo(sgn * 12.5, 7.0, sgn * 22.0, 7.4, sgn * 27.0, 2.4);
    ctx.stroke();

    // 布褶暗面
    ctx.fillStyle = 'rgba(18,24,46,0.32)';
    ctx.beginPath();
    ctx.moveTo(sgn * 7.0, -4.5);
    ctx.quadraticCurveTo(sgn * 16.0, -9.5, sgn * 23.5, -4.0);
    ctx.quadraticCurveTo(sgn * 15.5, 1.8, sgn * 7.0, -4.5);
    ctx.fill();
    // 高光
    ctx.strokeStyle = 'rgba(130,152,215,0.32)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(sgn * 8.0, -5.5);
    ctx.quadraticCurveTo(sgn * 16.0, -10.0, sgn * 23.0, -5.0);
    ctx.stroke();
  });

  // 结心 + 金扣
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.6, 6.4, 0, 0, Math.PI * 2);
  const kg = ctx.createLinearGradient(0, -6, 0, 6);
  kg.addColorStop(0, '#2b3a6b');
  kg.addColorStop(1, '#161e38');
  ctx.fillStyle = kg;
  ctx.fill();
  hbStrokePath(ctx, (c, ox, oy) => c.ellipse(ox, oy, 5.6, 6.4, 0, 0, Math.PI * 2), BODY_INK, 1.7, 85);
  ctx.strokeStyle = BODY_GOLD;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.6, 6.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 中心蓝宝石 + 金边
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.1, 3.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = BODY_GOLD;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 2.3, 3.0, 0, 0, Math.PI * 2);
  ctx.fillStyle = BODY_GOLD_D;
  ctx.fill();
  const gem = ctx.createLinearGradient(0, -3, 0, 3);
  gem.addColorStop(0, '#2f7ed6');
  gem.addColorStop(1, '#8fd0ff');
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.6, 2.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = gem;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(-0.5, -0.9, 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* --------------------------------- 主裙绘制 -------------------------------- */
function body_drawSkirt(ctx, S) {
  const a = Math.abs(S.sinY);
  const hwMax = body_halfW(66, 42, S);
  const pts = body_makeSkirtPoints(S);

  const grad = ctx.createLinearGradient(0, 98, 0, 147);
  grad.addColorStop(0, '#1b2340');
  grad.addColorStop(0.45, '#202a4d');
  grad.addColorStop(0.82, '#293763');
  grad.addColorStop(1, '#31406f');
  body_fillPts(ctx, pts, grad);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();

  // 水彩晕染
  wcWashBlob(ctx, -hwMax * 0.32, 118, hwMax * 0.55, 20, '#41558e', 0.20, 4);
  wcWashBlob(ctx, hwMax * 0.42, 128, hwMax * 0.42, 16, '#12182e', 0.30, 8);
  wcWashBlob(ctx, hwMax * 0.05, 138, hwMax * 0.7, 10, BODY_DEEP, 0.26, 12);

  // 纵向褶影
  const creaseRatios = [-0.82, -0.55, -0.28, 0.06, 0.34, 0.6, 0.84];
  creaseRatios.forEach((r, i) => {
    const topX = r * 24;
    const botX = r * hwMax;
    const wTop = 0.8 + (i % 2) * 0.5;
    const wBot = 2.4 + (i % 3) * 1.1;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(18,24,46,0.42)' : 'rgba(18,24,46,0.30)';
    ctx.beginPath();
    ctx.moveTo(topX - wTop, 100);
    ctx.quadraticCurveTo((topX + botX) * 0.5 - wTop, 120, botX - wBot, 145);
    ctx.lineTo(botX + wBot, 145);
    ctx.quadraticCurveTo((topX + botX) * 0.5 + wTop, 120, topX + wTop, 100);
    ctx.closePath();
    ctx.fill();
  });

  // 高光褶皱
  ctx.strokeStyle = 'rgba(120,150,215,0.20)';
  ctx.lineWidth = 2.2;
  [-0.66, -0.4, 0.22, 0.5].forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(r * 22, 104);
    ctx.quadraticCurveTo(r * hwMax * 0.9, 124, r * hwMax * 0.96, 142);
    ctx.stroke();
  });

  // 侧边暗部
  const sideGradL = ctx.createLinearGradient(-hwMax, 0, -hwMax * 0.55, 0);
  sideGradL.addColorStop(0, 'rgba(18,24,46,0.55)');
  sideGradL.addColorStop(1, 'rgba(18,24,46,0)');
  ctx.fillStyle = sideGradL;
  ctx.fillRect(-hwMax, 98, hwMax * 0.5, 50);
  const sideGradR = ctx.createLinearGradient(hwMax, 0, hwMax * 0.5, 0);
  sideGradR.addColorStop(0, 'rgba(18,24,46,0.5)');
  sideGradR.addColorStop(1, 'rgba(18,24,46,0)');
  ctx.fillStyle = sideGradR;
  ctx.fillRect(hwMax * 0.5, 98, hwMax * 0.5, 50);

  // 裙摆内侧阴影
  const hemShade = ctx.createLinearGradient(0, 132, 0, 147);
  hemShade.addColorStop(0, 'rgba(18,24,46,0)');
  hemShade.addColorStop(1, 'rgba(18,24,46,0.42)');
  ctx.fillStyle = hemShade;
  ctx.fillRect(-hwMax, 132, hwMax * 2, 16);

  ctx.restore();

  // 金线刺绣
  body_drawSkirtGold(ctx, S, hwMax, a);

  // 裙摆蝴蝶结（正 2 / 侧 1）
  const showFrontBows = !S.isBack && Math.abs(S.yaw) < 100;
  if (showFrontBows) {
    const yBow = 123.2;
    const rx = body_skirtRxAt(yBow);
    const rz = body_skirtRzAt(yBow);
    const th = 1.06;
    const pairs = [];
    [1, -1].forEach((sgn) => {
      const x = body_surfX(sgn * th, rx, rz, S);
      pairs.push({ x, theta: sgn * th });
    });
    let drawList = pairs;
    if (a > 0.74) {
      // 正侧只保留不被围裙挡住的那一个（靠近身体中线的一侧）
      pairs.sort((p, q) => p.x - q.x);
      drawList = S.sinY < 0 ? [pairs[pairs.length - 1]] : [pairs[0]];
    }
    drawList.forEach((p, i) => {
      body_drawSkirtBow(ctx, p.x, yBow, 0.92, true);
    });
  }

  // 背面大蝴蝶结
  if (S.isBack) body_drawBackBow(ctx, S);

  // 主裙勾边
  body_strokePts(ctx, pts, BODY_INK, 2.55, 31, true);
}

/* --------------------------------- 女仆上身 -------------------------------- */
function body_drawBodice(ctx, S) {
  const yTop = 65.8, yBot = 99.6;
  const pts = [];
  const hwTop = body_halfW(body_bodiceRxAt(67, S), 17.2, S);
  const hwBot = body_halfW(body_bodiceRxAt(99, S), 17.2, S);
  const N = 16;

  const xNeck = 10.5 * S.sinY;          // 领口前中随 yaw 偏转
  pts.push({ x: -hwTop, y: 67.4 });
  // 左肩 → 领口前中（2.5D：领口最低点跟随 sinY）
  body_quadPts(-hwTop, 67.4, -hwTop * 0.62, 66.8, -hwTop * 0.30, 68.4, 5, pts);
  body_quadPts(-hwTop * 0.30, 68.4, (-hwTop * 0.30 + xNeck) * 0.5, 71.4, xNeck, 71.3, 7, pts);
  body_quadPts(xNeck, 71.3, (hwTop * 0.30 + xNeck) * 0.5, 71.4, hwTop * 0.30, 68.4, 7, pts);
  body_quadPts(hwTop * 0.30, 68.4, hwTop * 0.62, 66.8, hwTop, 67.4, 5, pts);

  // 右侧腰线
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const y = 67.4 + (yBot - 67.4) * t;
    const rx = body_bodiceRxAt(y, S);
    pts.push({ x: body_halfW(rx, 17.2, S), y });
  }
  // 下摆（被裙子遮住）
  for (let i = 1; i < 8; i++) {
    const u = 1 - (2 * i) / 8;
    pts.push({ x: u * hwBot, y: yBot + 0.8 });
  }
  for (let i = N; i >= 1; i--) {
    const t = i / N;
    const y = 67.4 + (yBot - 67.4) * t;
    const rx = body_bodiceRxAt(y, S);
    pts.push({ x: -body_halfW(rx, 17.2, S), y });
  }

  const grad = ctx.createLinearGradient(0, 66, 0, 100);
  grad.addColorStop(0, '#27335c');
  grad.addColorStop(0.5, '#1f2a4d');
  grad.addColorStop(1, '#19213c');
  body_fillPts(ctx, pts, grad);

  // 内部明暗
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();

  wcWashBlob(ctx, -hwTop * 0.3, 82, hwTop * 0.8, 13, '#3b4c82', 0.18, 21);
  wcWashBlob(ctx, hwTop * 0.55, 90, hwTop * 0.55, 12, BODY_DEEP, 0.35, 23);

  // 胸下阴影
  const underBust = ctx.createLinearGradient(0, 84, 0, 99);
  underBust.addColorStop(0, 'rgba(18,24,46,0)');
  underBust.addColorStop(1, 'rgba(18,24,46,0.55)');
  ctx.fillStyle = underBust;
  ctx.fillRect(-hwTop - 2, 84, hwTop * 2 + 4, 16);

  // 侧影
  const sideL = ctx.createLinearGradient(-hwTop, 0, -hwTop * 0.45, 0);
  sideL.addColorStop(0, 'rgba(18,24,46,0.5)');
  sideL.addColorStop(1, 'rgba(18,24,46,0)');
  ctx.fillStyle = sideL;
  ctx.fillRect(-hwTop, 66, hwTop * 0.6, 35);
  const sideR = ctx.createLinearGradient(hwTop, 0, hwTop * 0.45, 0);
  sideR.addColorStop(0, 'rgba(18,24,46,0.46)');
  sideR.addColorStop(1, 'rgba(18,24,46,0)');
  ctx.fillStyle = sideR;
  ctx.fillRect(hwTop * 0.4, 66, hwTop * 0.6, 35);

  if (S.isBack) {
    // 背中缝与肩胛暗面
    ctx.strokeStyle = 'rgba(18,24,46,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 72);
    ctx.lineTo(0, 99);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(80,100,160,0.18)';
    ctx.lineWidth = 2.2;
    [-1, 1].forEach((sgn) => {
      ctx.beginPath();
      ctx.moveTo(sgn * hwTop * 0.55, 74);
      ctx.quadraticCurveTo(sgn * hwTop * 0.4, 88, sgn * hwTop * 0.45, 98);
      ctx.stroke();
    });
  }
  ctx.restore();

  body_strokePts(ctx, pts, BODY_INK, 2.5, 35, true);

  // 腰线
  ctx.save();
  ctx.strokeStyle = 'rgba(18,24,46,0.7)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-hwBot * 0.95, 97.2);
  ctx.quadraticCurveTo(0, 99.0, hwBot * 0.95, 97.2);
  ctx.stroke();
  ctx.restore();
}

/* --------------------------- 竖褶前襟 + 金扣 + 领口 ------------------------ */
function body_drawPlacket(ctx, S) {
  body_withFrontPlane(ctx, S, 16.6, () => {
    const yTop = 69.6, yBot = 91.0;
    const wTop = 11.9, wBot = 10.3;
    const pts = [];
    pts.push({ x: -wTop, y: yTop + 2.0 });
    body_quadPts(-wTop, yTop + 2.0, -wTop + 1.4, yTop, -wTop + 3.8, yTop, 4, pts);
    pts.push({ x: wTop - 3.8, y: yTop });
    body_quadPts(wTop - 3.8, yTop, wTop - 1.4, yTop, wTop, yTop + 2.0, 4, pts);
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      pts.push({ x: wTop + (wBot - wTop) * t, y: yTop + 2.0 + (yBot - yTop - 2.0) * t });
    }
    body_quadPts(wBot, yBot, 0, yBot + 2.4, -wBot, yBot, 8, pts);
    for (let i = 6; i >= 1; i--) {
      const t = i / 6;
      pts.push({ x: -wTop + (wBot - wTop) * t, y: yTop + 2.0 + (yBot - yTop - 2.0) * t });
    }
    body_fillPts(ctx, pts, BODY_CREAM);

    // 8 条风琴褶
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < 8; i++) {
      const xa = -wTop + i * (wTop * 2) / 8;
      const xb = -wBot + i * (wBot * 2) / 8;
      if (i % 2 === 0) {
        const g = ctx.createLinearGradient(0, yTop, 0, yBot);
        g.addColorStop(0, 'rgba(223,229,242,0.42)');
        g.addColorStop(1, 'rgba(223,229,242,0.72)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(xa, yTop);
        ctx.lineTo(xa + (wTop * 2) / 8, yTop);
        ctx.lineTo(xb + (wBot * 2) / 8, yBot + 1);
        ctx.lineTo(xb, yBot + 1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(164,178,205,0.9)' : 'rgba(184,195,216,0.75)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(xa, yTop + 1);
      ctx.quadraticCurveTo((xa + xb) * 0.5 + 0.4, (yTop + yBot) * 0.5, xb, yBot + 0.4);
      ctx.stroke();
    }
    // 淡蓝纵向水彩
    wcWashBlob(ctx, -3, 82, 8, 11, '#dfe5f2', 0.36, 27);
    ctx.restore();

    body_strokePts(ctx, pts, BODY_INK, 1.7, 41, true);

    // 三颗金色小圆扣
    [77.0, 81.6, 86.2].forEach((by) => {
      ctx.save();
      ctx.fillStyle = BODY_GOLD;
      ctx.beginPath();
      ctx.arc(0, by, 2.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = BODY_GOLD_D;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = BODY_GOLD_L;
      ctx.beginPath();
      ctx.arc(-0.55, by - 0.6, 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    // 扣子旁边的小珠点（参考图）
    ctx.save();
    ctx.fillStyle = 'rgba(255,253,247,0.9)';
    [[-6.2, 78.6], [6.2, 78.6], [-5.8, 83.2], [5.8, 83.2], [-5.1, 87.8], [5.1, 87.8]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(dx, dy, 0.7, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  });
}

/* 白色彼得潘圆领（左右两瓣，远端在侧面被头/颈遮住） */
function body_drawCollar(ctx, S) {
  body_withFrontPlane(ctx, S, 10.8, () => {
    const flap = (sgn, p) => {
      const cx = sgn * 9.8;
      const cy = 64.7;
      p.moveTo(cx - sgn * 9.0, cy - 2.2);
      p.bezierCurveTo(cx - sgn * 6.8, cy - 6.2, cx + sgn * 3.0, cy - 7.0, cx + sgn * 8.0, cy - 3.0);
      p.bezierCurveTo(cx + sgn * 9.6, cy + 1.0, cx + sgn * 5.2, cy + 5.2, cx + sgn * 1.9, cy + 4.4);
      p.bezierCurveTo(cx - sgn * 1.7, cy + 3.6, cx - sgn * 7.2, cy + 2.0, cx - sgn * 9.0, cy - 2.2);
      p.closePath();
    };

    // 领座（脖子根部一圈白边）
    ctx.beginPath();
    ctx.roundRect(-11.8, 59.8, 23.6, 5.8, 2.3);
    ctx.fillStyle = '#f7f3ea';
    ctx.fill();
    hbStrokePath(ctx, (c, ox, oy) => c.roundRect(-11.8 + ox, 59.8 + oy, 23.6, 5.8, 2.3), BODY_INK, 1.2, 45);

    [1, -1].forEach((sgn) => {
      // 半圆柱遮挡：只画朝向镜头的领瓣
      if (-sgn * 10.0 * S.sinY + 10.8 * S.cosY < 0) return;
      const pathFn = (c, ox, oy) => {
        c.save();
        c.translate(ox, oy);
        flap(sgn, c);
        c.restore();
      };
      ctx.beginPath();
      flap(sgn, ctx);
      const cg = ctx.createLinearGradient(sgn * 2, 58, sgn * 13, 70);
      cg.addColorStop(0, '#fffdf8');
      cg.addColorStop(1, '#f1ede4');
      ctx.fillStyle = cg;
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = 'rgba(199,205,220,0.9)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(sgn * 3.2, 60.8);
      ctx.quadraticCurveTo(sgn * 9.0, 62.0, sgn * 12.2, 66.4);
      ctx.stroke();
      ctx.restore();
      hbStrokePath(ctx, pathFn, BODY_INK, 1.45, sgn > 0 ? 43 : 44);
    });
  });
}

/* 围裙吊带：白色荷叶边缎带 */
function body_drawApronStraps(ctx, S) {
  [1, -1].forEach((sgn) => {
    const xBotC = sgn * 15.9, zBot = 14.2, yBot = 102.5;
    const xTopC = sgn * 22.2, zTop = 8.8, yTop = 65.8;
    const zCheck = -xTopC * S.sinY + zTop * S.cosY;
    if (zCheck < -1) return;

    const half = 3.9;
    const pts = [];
    const N = 13;
    // 外缘
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = lerpVal(xTopC + half, xBotC + half, t) + Math.sin(t * 9.2) * 0.45;
      const z = lerpVal(zTop, zBot, t);
      const y = lerpVal(yTop, yBot, t);
      pts.push({ x: x * S.cosY + z * S.sinY, y });
    }
    // 内缘
    for (let i = N; i >= 0; i--) {
      const t = i / N;
      const x = lerpVal(xTopC - half, xBotC - half, t) - Math.sin(t * 9.2) * 0.45;
      const z = lerpVal(zTop, zBot, t);
      const y = lerpVal(yTop, yBot, t);
      pts.push({ x: x * S.cosY + z * S.sinY, y });
    }
    // 顶部圆头（藏在肩线里）
    const innerTop = pts[pts.length - 1];
    const outerTop = pts[0];
    body_quadPts(innerTop.x, yTop, (innerTop.x + outerTop.x) * 0.5, yTop - 2.6, outerTop.x, yTop, 4, pts);

    const sg = ctx.createLinearGradient(innerTop.x, 0, outerTop.x + 6 * S.cosY, 0);
    sg.addColorStop(0, '#f4f0e7');
    sg.addColorStop(0.5, '#fffdf8');
    sg.addColorStop(1, '#f6f2ea');
    body_fillPts(ctx, pts, sg);
    body_strokePts(ctx, pts, BODY_INK, 1.3, sgn > 0 ? 51 : 52, true);

    // 内侧荷叶小滚边 + 中缝
    ctx.save();
    ctx.strokeStyle = 'rgba(199,208,226,0.9)';
    ctx.lineWidth = 0.85;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const y = lerpVal(yTop, yBot, t);
      const px = lerpVal(xTopC, xBotC, t) * S.cosY + lerpVal(zTop, zBot, t) * S.sinY;
      const wscreen = half * S.cosY;
      ctx.beginPath();
      ctx.moveTo(px - wscreen * 0.92, y + 0.8);
      ctx.quadraticCurveTo(px - wscreen * 0.6, y + 1.6, px, y + 1.2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(210,217,232,0.7)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    const midTopX = xTopC * S.cosY + zTop * S.sinY;
    const midBotX = xBotC * S.cosY + zBot * S.sinY;
    ctx.moveTo(midTopX, yTop + 3.4);
    ctx.quadraticCurveTo((midTopX + midBotX) * 0.5 + 0.4, (yTop + yBot) * 0.5, midBotX, yBot - 1.5);
    ctx.stroke();
    ctx.restore();
  });
}

/* ------------------------------- 围裙 + 鲸鱼 ------------------------------- */
function body_apronPts(S, mode) {
  const N = 160;
  const cy = 111.0, hy = 16.3;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const phi = (i / N) * Math.PI * 2;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    let u = (cs < 0 ? -1 : 1) * Math.pow(Math.abs(cs), 0.44);
    let v = (sn < 0 ? -1 : 1) * Math.pow(Math.abs(sn), 0.44);
    let y = cy + v * hy;
    let th1 = 0.70 + 0.10 * clamp((y - 95) / 32, 0, 1);
    let th = u * th1;
    if (mode === 'ruffle') {
      const wave = 0.5 + 0.5 * Math.cos(phi * 26);
      const off = (4.6 + 3.1 * wave) * (v < 0 ? 0.72 : 1);
      y = cy + v * (hy + off);
      th = u * th1 * (1.14 + 0.075 * wave);
    } else if (mode === 'inner') {
      y = cy + v * hy * 0.86;
      th = u * th1 * 0.86;
    }
    pts.push({ x: body_surfX(th, body_apronRxAt(y), body_apronRzAt(y), S), y: y });
  }
  return pts;
}

/* 喷水小蓝鲸刺绣（本地坐标：鲸身中心 = 0,0；头朝左、尾在右上） */
function body_drawWhale(ctx) {
  const outline = '#1b3f74';
  const bodyGrad = ctx.createLinearGradient(-16, -8, 13, 8);
  bodyGrad.addColorStop(0, '#1d4f9e');
  bodyGrad.addColorStop(0.5, '#3479d0');
  bodyGrad.addColorStop(1, '#63a9ef');
  const tailGrad = ctx.createLinearGradient(5, -6, 17, 6);
  tailGrad.addColorStop(0, '#2565b4');
  tailGrad.addColorStop(1, '#4b91dd');

  // 尾鳍（先画，被身体压住一部分）
  const tail = (c, ox, oy) => {
    c.moveTo(7.6 + ox, -1.8 + oy);
    c.bezierCurveTo(9.6 + ox, -4.6 + oy, 12.6 + ox, -7.4 + oy, 15.0 + ox, -7.9 + oy);
    c.bezierCurveTo(16.1 + ox, -8.1 + oy, 16.2 + ox, -6.4 + oy, 15.0 + ox, -4.8 + oy);
    c.bezierCurveTo(13.4 + ox, -2.4 + oy, 11.8 + ox, -0.8 + oy, 10.9 + ox, 0.2 + oy);
    c.bezierCurveTo(13.0 + ox, 1.5 + oy, 14.8 + ox, 3.5 + oy, 15.4 + ox, 4.9 + oy);
    c.bezierCurveTo(15.9 + ox, 6.4 + oy, 14.4 + ox, 6.8 + oy, 13.0 + ox, 5.5 + oy);
    c.bezierCurveTo(11.0 + ox, 3.7 + oy, 9.2 + ox, 2.4 + oy, 7.4 + ox, 1.6 + oy);
    c.closePath();
  };
  ctx.beginPath();
  tail(ctx, 0, 0);
  ctx.fillStyle = tailGrad;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.95;
  ctx.stroke();

  // 身体
  const bodyPath = (c, ox, oy) => {
    c.moveTo(-16.4 + ox, -4.8 + oy);
    c.bezierCurveTo(-14.2 + ox, -8.2 + oy, -8.6 + ox, -9.0 + oy, -2.4 + ox, -8.5 + oy);
    c.bezierCurveTo(3.0 + ox, -8.0 + oy, 7.6 + ox, -6.0 + oy, 9.4 + ox, -2.6 + oy);
    c.bezierCurveTo(10.0 + ox, -0.9 + oy, 10.0 + ox, 1.2 + oy, 9.2 + ox, 2.8 + oy);
    c.bezierCurveTo(6.0 + ox, 6.2 + oy, 0.0 + ox, 7.6 + oy, -5.6 + ox, 7.2 + oy);
    c.bezierCurveTo(-10.8 + ox, 6.8 + oy, -14.8 + ox, 3.6 + oy, -16.2 + ox, 0.2 + oy);
    c.bezierCurveTo(-16.8 + ox, -1.4 + oy, -17.0 + ox, -3.2 + oy, -16.4 + ox, -4.8 + oy);
    c.closePath();
  };

  // 背鳍（先画，尖端露出背线）
  ctx.beginPath();
  ctx.moveTo(0.6, -8.2);
  ctx.quadraticCurveTo(2.6, -12.6, 5.0, -9.6);
  ctx.quadraticCurveTo(3.4, -9.2, 3.1, -7.8);
  ctx.closePath();
  ctx.fillStyle = '#2a63b3';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.beginPath();
  bodyPath(ctx, 0, 0);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // 胸鳍
  ctx.beginPath();
  ctx.moveTo(-9.4, 4.6);
  ctx.bezierCurveTo(-12.2, 7.9, -10.6, 9.5, -8.6, 8.5);
  ctx.bezierCurveTo(-6.6, 7.5, -5.8, 5.7, -6.4, 4.8);
  ctx.closePath();
  ctx.fillStyle = '#2a66b7';
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.85;
  ctx.stroke();

  // 肚皮 + 白横纹（裁剪在肚皮内，避免边缘长“牙齿”）
  const belly = (c, ox, oy) => {
    c.moveTo(-15.9 + ox, 0.9 + oy);
    c.bezierCurveTo(-13.8 + ox, 4.5 + oy, -8.4 + ox, 7.2 + oy, -2.0 + ox, 7.3 + oy);
    c.bezierCurveTo(3.4 + ox, 7.3 + oy, 7.2 + ox, 5.8 + oy, 9.2 + ox, 3.0 + oy);
    c.bezierCurveTo(4.0 + ox, 4.3 + oy, -3.0 + ox, 4.4 + oy, -9.0 + ox, 3.0 + oy);
    c.bezierCurveTo(-12.6 + ox, 2.2 + oy, -15.2 + ox, 1.7 + oy, -15.9 + ox, 0.9 + oy);
    c.closePath();
  };
  ctx.save();
  ctx.beginPath();
  bodyPath(ctx, 0, 0);
  ctx.clip();
  ctx.beginPath();
  belly(ctx, 0, 0);
  ctx.fillStyle = '#f4fbff';
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  belly(ctx, 0, 0);
  ctx.clip();
  ctx.strokeStyle = '#5e9bd2';
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const y0 = 3.6 + i * 0.82;
    ctx.beginPath();
    ctx.moveTo(-14.8 + i * 0.28, y0);
    ctx.quadraticCurveTo(-8.0 + i * 0.35, y0 + 1.9 - i * 0.22, 0.4 - i * 0.7, y0 + 0.9 - i * 0.3);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  belly(ctx, 0, 0);
  ctx.strokeStyle = 'rgba(95,155,212,0.75)';
  ctx.lineWidth = 0.65;
  ctx.stroke();
  // 背部小斑点
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  [[-5.4, -5.0], [-2.6, -6.1], [0.4, -5.6], [3.2, -3.8], [2.2, -1.4]].forEach(([dx, dy], i) => {
    ctx.beginPath();
    ctx.arc(dx, dy, 0.5 + (i % 2) * 0.18, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // 轮廓
  ctx.beginPath();
  bodyPath(ctx, 0, 0);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.05;
  ctx.stroke();
  ctx.beginPath();
  tail(ctx, 0, 0);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.95;
  ctx.stroke();

  // 嘴
  ctx.strokeStyle = '#173a6b';
  ctx.lineWidth = 0.95;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-15.9, 1.1);
  ctx.quadraticCurveTo(-14.2, 2.5, -12.4, 1.7);
  ctx.stroke();

  // 眼
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-10.0, -2.7, 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#162c50';
  ctx.beginPath();
  ctx.arc(-10.2, -2.5, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-10.7, -3.1, 0.48, 0, Math.PI * 2);
  ctx.fill();

  // 腮红
  ctx.fillStyle = 'rgba(246,150,162,0.88)';
  ctx.beginPath();
  ctx.arc(-5.8, 0.8, 1.35, 0, Math.PI * 2);
  ctx.fill();

  // 头顶喷水：三颗水滴
  const drop = (dx, dy, r) => {
    ctx.beginPath();
    ctx.moveTo(dx, dy - r * 2.0);
    ctx.bezierCurveTo(dx + r * 1.2, dy - r * 0.7, dx + r * 1.0, dy + r * 0.9, dx, dy + r * 0.9);
    ctx.bezierCurveTo(dx - r * 1.0, dy + r * 0.9, dx - r * 1.2, dy - r * 0.7, dx, dy - r * 2.0);
    ctx.closePath();
    ctx.fillStyle = '#58a8f4';
    ctx.fill();
    ctx.strokeStyle = '#2c64a9';
    ctx.lineWidth = 0.65;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(dx - r * 0.35, dy - r * 0.1, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  };
  drop(-11.9, -11.0, 1.25);
  drop(-8.3, -13.3, 1.48);
  drop(-4.7, -10.9, 1.1);

  // 小金星
  const star = (cx, cy, R) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = BODY_GOLD_L;
    ctx.strokeStyle = BODY_GOLD_D;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? R : R * 0.36;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  star(-8.2, -16.0, 2.1);

  // 气泡
  ctx.fillStyle = 'rgba(120,180,240,0.72)';
  [[-1.4, -9.6, 0.55], [1.2, -7.6, 0.38], [-13.6, -8.6, 0.42]].forEach(([dx, dy, r]) => {
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function body_drawApron(ctx, S) {
  const bib = body_apronPts(S, 'bib');
  const ruffle = body_apronPts(S, 'ruffle');
  const inner = body_apronPts(S, 'inner');

  // 荷叶边外圈：外缘正向 + 内缘反向 → 环形
  const ring = ruffle.concat(bib.slice().reverse());
  const ringGrad = ctx.createLinearGradient(0, 90, 0, 129);
  ringGrad.addColorStop(0, '#f7f3ec');
  ringGrad.addColorStop(0.55, '#fbf8f2');
  ringGrad.addColorStop(1, '#f0ebe2');
  ctx.save();
  body_fillPts(ctx, ring, ringGrad);

  // 荷叶边褶影与扇形起伏
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ring[0].x, ring[0].y);
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
  ctx.closePath();
  ctx.clip();
  const nFold = 24;
  for (let i = 0; i < nFold; i++) {
    const idx = Math.floor((i / nFold) * bib.length) % bib.length;
    const idx2 = Math.floor(((i + 1) / nFold) * bib.length) % bib.length;
    const pIn = bib[idx];
    const pOut = ruffle[idx];
    if (i % 2 === 0) {
      const pOut2 = ruffle[idx2];
      const pIn2 = bib[idx2];
      ctx.fillStyle = 'rgba(195,191,214,0.7)';
      ctx.beginPath();
      ctx.moveTo(pIn.x, pIn.y);
      ctx.lineTo(pOut.x, pOut.y);
      ctx.lineTo(pOut2.x, pOut2.y);
      ctx.lineTo(pIn2.x, pIn2.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(172,177,202,0.95)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(pIn.x, pIn.y);
    ctx.lineTo(pOut.x, pOut.y);
    ctx.stroke();
  }
  ctx.restore();

  // 荷叶边外缘描边
  body_strokePts(ctx, ruffle, BODY_INK, 1.55, 61, true);

  // 围裙主体（圆角矩形围兜）
  ctx.save();
  ctx.shadowColor = 'rgba(22,30,54,0.32)';
  ctx.shadowBlur = 4.5;
  ctx.shadowOffsetY = 1.8;
  const apGrad = ctx.createLinearGradient(0, 94, 0, 128);
  apGrad.addColorStop(0, '#fffefa');
  apGrad.addColorStop(0.6, '#fdfaf4');
  apGrad.addColorStop(1, '#f3efe7');
  body_fillPts(ctx, bib, apGrad);
  ctx.restore();
  body_strokePts(ctx, bib, BODY_INK, 1.6, 62, true);

  // 围裙上的水彩淡影 + 褶痕
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(bib[0].x, bib[0].y);
  for (let i = 1; i < bib.length; i++) ctx.lineTo(bib[i].x, bib[i].y);
  ctx.closePath();
  ctx.clip();
  wcWashBlob(ctx, body_surfX(-0.45, body_apronRxAt(104), body_apronRzAt(104), S), 104, 15, 13, '#dfe5f2', 0.30, 63);
  wcWashBlob(ctx, body_surfX(0.5, body_apronRxAt(120), body_apronRzAt(120), S), 121, 14, 7, '#e3e7f0', 0.28, 64);

  // 中央柔褶
  const cx0 = body_surfX(0, body_apronRxAt(96), body_apronRzAt(96), S);
  const cx1 = body_surfX(0, body_apronRxAt(126), body_apronRzAt(126), S);
  ctx.strokeStyle = 'rgba(207,213,227,0.55)';
  ctx.lineWidth = 1.3;
  [-1, 1].forEach((sgn) => {
    ctx.beginPath();
    ctx.moveTo(cx0 + sgn * 10 * S.cosY, 99);
    ctx.quadraticCurveTo(cx0 * 0.5 + sgn * 18 * S.cosY, 114, cx1 + sgn * 24 * S.cosY, 125);
    ctx.stroke();
  });
  ctx.restore();

  // 金色细线内框 + 珠点（不画成金相框）
  body_goldLine(ctx, inner, BODY_GOLD, 1.0, 0.92);
  ctx.save();
  ctx.fillStyle = BODY_GOLD;
  for (let i = 0; i < 20; i++) {
    const p = inner[Math.floor((i / 20) * inner.length)];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.52, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 围裙腰部接缝
  ctx.save();
  ctx.strokeStyle = 'rgba(196,203,221,0.7)';
  ctx.lineWidth = 0.95;
  for (let row = 0; row < 2; row++) {
    const y0 = 100.2 + row * 2.0;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < bib.length; i++) {
      const p = bib[i];
      if (Math.abs(p.y - y0) < 0.9) {
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
    }
    if (started) ctx.stroke();
  }
  ctx.restore();

  // 喷水小蓝鲸（跟随 S.sinY 偏转）
  const zW = body_apronRzAt(116);
  const sx = S.cosY;
  if (sx > 0.10) {
    ctx.save();
    ctx.translate(zW * S.sinY, 0);
    ctx.scale(sx * 1.06, 1.06);
    ctx.translate(0, 109.4);
    body_drawWhale(ctx);
    ctx.restore();
  }

  ctx.restore();
}

/* ----------------------------- 领口蝴蝶结 + 胸针 ---------------------------- */
function body_drawNeckBow(ctx, S) {
  body_withFrontPlane(ctx, S, 13.4, () => {
    ctx.save();
    ctx.translate(0, 67.6);

    // 飘带（短、藏青蓝，燕尾剪口）
    const tailP = (sgn) => (c, ox, oy) => {
      c.moveTo(sgn * 1.0 + ox, 3.0 + oy);
      c.quadraticCurveTo(sgn * 2.0 + ox, 6.2 + oy, sgn * 4.0 + ox, 8.7 + oy);
      c.lineTo(sgn * 2.1 + ox, 9.4 + oy);
      c.lineTo(sgn * 1.5 + ox, 7.9 + oy);
      c.lineTo(sgn * 0.7 + ox, 9.0 + oy);
      c.quadraticCurveTo(sgn * 0.5 + ox, 5.4 + oy, sgn * 0.1 + ox, 3.2 + oy);
      c.closePath();
    };
    [1, -1].forEach((sgn) => {
      const p = tailP(sgn);
      ctx.beginPath();
      p(ctx, 0, 0);
      const tg = ctx.createLinearGradient(0, 3, 0, 11);
      tg.addColorStop(0, '#3a7fd0');
      tg.addColorStop(1, '#2a5fa8');
      ctx.fillStyle = tg;
      ctx.fill();
      hbStrokePath(ctx, p, BODY_INK, 1.25, sgn > 0 ? 91 : 92);
      ctx.strokeStyle = BODY_GOLD;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(sgn * 2.2, 5.0);
      ctx.quadraticCurveTo(sgn * 2.8, 6.6, sgn * 3.1, 8.0);
      ctx.stroke();
    });

    // 双环
    [1, -1].forEach((sgn) => {
      const p = (c, ox, oy) => {
        c.moveTo(sgn * 1.5 + ox, -1.0 + oy);
        c.bezierCurveTo(sgn * 4.0 + ox, -8.2 + oy, sgn * 12.0 + ox, -8.8 + oy, sgn * 15.6 + ox, -2.2 + oy);
        c.bezierCurveTo(sgn * 17.4 + ox, 1.7 + oy, sgn * 13.4 + ox, 6.4 + oy, sgn * 8.6 + ox, 5.8 + oy);
        c.bezierCurveTo(sgn * 4.0 + ox, 5.2 + oy, sgn * 1.0 + ox, 2.4 + oy, sgn * 1.5 + ox, -1.0 + oy);
        c.closePath();
      };
      ctx.beginPath();
      p(ctx, 0, 0);
      const bg = ctx.createLinearGradient(0, -9, 0, 7);
      bg.addColorStop(0, '#82c7fb');
      bg.addColorStop(0.5, '#5ba7ee');
      bg.addColorStop(1, '#3d84d6');
      ctx.fillStyle = bg;
      ctx.fill();
      hbStrokePath(ctx, p, BODY_INK, 1.45, sgn > 0 ? 93 : 94);

      // 布褶暗面
      ctx.save();
      ctx.strokeStyle = 'rgba(44,104,180,0.55)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(sgn * 3.4, 2.6);
      ctx.quadraticCurveTo(sgn * 9.4, 5.2, sgn * 14.2, 2.0);
      ctx.stroke();
      ctx.restore();

      // 金色包边（只走下半缘）
      ctx.save();
      ctx.strokeStyle = BODY_GOLD;
      ctx.lineWidth = 0.95;
      ctx.beginPath();
      ctx.moveTo(sgn * 3.5, 3.3);
      ctx.bezierCurveTo(sgn * 7.2, 5.6, sgn * 12.2, 5.2, sgn * 15.4, 1.2);
      ctx.stroke();
      ctx.restore();

      // 高光
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.62)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sgn * 4.6, -4.4);
      ctx.quadraticCurveTo(sgn * 9.0, -6.4, sgn * 13.0, -3.8);
      ctx.stroke();
      ctx.restore();
    });

    // 结心
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.0, 4.9, 0, 0, Math.PI * 2);
    const kg = ctx.createLinearGradient(0, -5, 0, 5);
    kg.addColorStop(0, '#5ba7ee');
    kg.addColorStop(1, '#2f6fbf');
    ctx.fillStyle = kg;
    ctx.fill();
    hbStrokePath(ctx, (c, ox, oy) => c.ellipse(ox, oy, 4.0, 4.9, 0, 0, Math.PI * 2), BODY_INK, 1.2, 95);

    // 金边椭圆蓝宝石胸针
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.0, 6.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = BODY_GOLD_D;
    ctx.fill();
    ctx.strokeStyle = BODY_INK;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.2, 5.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = BODY_GOLD;
    ctx.fill();
    // 四向爪镶
    ctx.fillStyle = BODY_GOLD_L;
    [[0, -5.9], [0, 5.9], [-4.6, 0], [4.6, 0]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(dx, dy, 0.62, 0, Math.PI * 2);
      ctx.fill();
    });
    const gem = ctx.createLinearGradient(0, -5, 0, 5);
    gem.addColorStop(0, '#1e5799');
    gem.addColorStop(0.55, '#2f7ed6');
    gem.addColorStop(1, '#68b8f8');
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.1, 4.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = gem;
    ctx.fill();
    ctx.strokeStyle = 'rgba(13,44,82,0.8)';
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(-1.0, -1.8, 0.9, 1.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(1.1, 1.5, 0.55, 0.8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/* --------------------------- 肩部蕾丝 / 后领口 ----------------------------- */
function body_drawShoulderLace(ctx, S) {
  body_withFrontPlane(ctx, S, 15.0, () => {
    [1, -1].forEach((sgn) => {
      const pts = [];
      const N = 4;
      const x0 = sgn * 18.4, x1 = sgn * 27.2;
      const arch = (t) => 67.6 + Math.sin(t * Math.PI) * 1.3;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const scallop = 1.0 + 0.7 * Math.abs(Math.sin(t * Math.PI * N));
        pts.push({ x: lerpVal(x0, x1, t), y: arch(t) - scallop });
      }
      for (let i = N; i >= 0; i--) {
        const t = i / N;
        pts.push({ x: lerpVal(x0, x1, t), y: arch(t) + 1.8 });
      }
      const g = ctx.createLinearGradient(0, 65, 0, 71);
      g.addColorStop(0, '#fffdf8');
      g.addColorStop(1, '#f1ece3');
      body_fillPts(ctx, pts, g);
      body_strokePts(ctx, pts, BODY_INK, 1.15, sgn > 0 ? 55 : 56, true);
      ctx.save();
      ctx.strokeStyle = 'rgba(203,211,228,0.9)';
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.5) / 4;
        const x = lerpVal(x0, x1, t);
        ctx.beginPath();
        ctx.arc(x, arch(t) - 0.9, 1.3, Math.PI * 0.15, Math.PI * 0.95);
        ctx.stroke();
      }
      ctx.restore();
    });
  });
}

function body_drawBackCollar(ctx, S) {
  const a = Math.abs(S.cosY);
  ctx.save();
  ctx.translate(-10 * S.sinY, 0);
  ctx.scale(Math.max(0.2, a), 1);
  const pts = [];
  pts.push({ x: -11.6, y: 60.6 });
  pts.push({ x: 11.6, y: 60.6 });
  pts.push({ x: 11.6, y: 64.2 });
  // 下缘扇贝
  const N = 5;
  for (let i = 0; i < N; i++) {
    const xa = 11.6 - (23.2 * i) / N;
    const xb = 11.6 - (23.2 * (i + 1)) / N;
    body_quadPts(xa, 64.2, (xa + xb) * 0.5, 67.2, xb, 64.2, 4, pts);
  }
  pts.push({ x: -11.6, y: 60.6 });
  const g = ctx.createLinearGradient(0, 60, 0, 67);
  g.addColorStop(0, '#fffdf8');
  g.addColorStop(1, '#f0ebe2');
  body_fillPts(ctx, pts, g);
  body_strokePts(ctx, pts, BODY_INK, 1.2, 46, true);
  ctx.restore();
}

/* ================================ 主入口 ================================= */
function drawBody(ctx, S) {
  const a = Math.abs(S.sinY);
  const frontFace = !S.isBack && S.cosY > 0.04;
  const showApron = !S.isBack && S.cosY > -0.03 && Math.abs(S.yaw) < 108;

  ctx.save();

  // 1. 脖子（被下巴与领口夹住，侧面偏后）
  body_drawNeck(ctx, S);

  // 2. 双层百褶衬裙（在主裙后/下方）
  body_drawPettiBand(ctx, S, true);
  body_drawPettiBand(ctx, S, false);

  // 3. 主裙 + 金线刺绣 + 裙摆蝴蝶结
  body_drawSkirt(ctx, S);

  // 4. 女仆上身
  body_drawBodice(ctx, S);

  // 5. 正面细节
  if (frontFace) {
    body_drawPlacket(ctx, S);
    body_drawApronStraps(ctx, S);
      body_drawCollar(ctx, S);
  } else if (S.cosY < -0.15) {
    body_drawBackCollar(ctx, S);
  }

  // 6. 围裙（只画前侧；背面不可见）
  if (showApron) body_drawApron(ctx, S);

  // 7. 领口天蓝蝴蝶结 + 蓝宝石胸针
  if (frontFace) body_drawNeckBow(ctx, S);

  ctx.restore();
}
