/* ============================================================================
 * 60_legs_tail.js —— 「腿脚与鲸尾」专项
 *
 *   drawLegs(ctx, S)  短圆腿 + 白色过膝袜（浅蓝/金细边 + 淡粉阴影）
 *                     藏青圆头玛丽珍鞋（脚背横带 + 金色爱心扣 + 白色高光）
 *   drawTail(ctx, S)  从裙后腰 (0,108) 伸出的水平双叶鲸尾
 *                     深藏青 → 亮蓝 → 浅天蓝渐变，中轴脊线 + 鳍纹，
 *                     随 S.tailAngle 摆动，左右叶带相位差。
 *
 * 只使用 00_util.js 的公共工具；所有私有函数以 lt_ 前缀命名。
 * ========================================================================== */

/* ------------------------------------------------------------------ 常量 */
const LT_LEG_X = 16;          // 两腿中心距（正面）
const LT_SOCK_TOP = 133.5;    // 袜口（藏在裙下）
const LT_SOCK_BOT = 166.0;    // 袜底（塞进鞋里）
const LT_SHOW_TOP = 156.8;    // 鞋口高度
const LT_SHOW_SOLE = 171.5;   // 鞋底

/* ------------------------------------------------------------------ 小工具 */
function lt_heartPath(c, x, y, s, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  c.moveTo(x + ox, y + s * 0.82 + oy);
  c.bezierCurveTo(
    x - s * 1.12 + ox, y - s * 0.06 + oy,
    x - s * 0.78 + ox, y - s * 1.02 + oy,
    x + ox, y - s * 0.34 + oy
  );
  c.bezierCurveTo(
    x + s * 0.78 + ox, y - s * 1.02 + oy,
    x + s * 1.12 + ox, y - s * 0.06 + oy,
    x + ox, y + s * 0.82 + oy
  );
  c.closePath();
}

function lt_lerp2(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function lt_arcLine(c, x0, y0, cx, cy, x1, y1, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  c.moveTo(x0 + ox, y0 + oy);
  c.quadraticCurveTo(cx + ox, cy + oy, x1 + ox, y1 + oy);
}

/* ==========================================================================
 *  腿 / 袜 / 鞋
 * ========================================================================== */

/* 白袜外轮廓（上圆下直，脚踝略收） */
function lt_sockPath(c, x, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  const top = LT_SOCK_TOP, bot = LT_SOCK_BOT;
  const wT = 9.2, wB = 8.0;
  c.moveTo(x - wT + ox, top + 4.2 + oy);
  c.bezierCurveTo(
    x - wT + ox, top + 1.0 + oy,
    x - wT * 0.58 + ox, top - 0.6 + oy,
    x + ox, top - 0.7 + oy
  );
  c.bezierCurveTo(
    x + wT * 0.58 + ox, top - 0.6 + oy,
    x + wT + ox, top + 1.0 + oy,
    x + wT + ox, top + 4.2 + oy
  );
  c.bezierCurveTo(
    x + wT + 0.3 + ox, top + 12.0 + oy,
    x + wB + ox, bot - 9.0 + oy,
    x + wB + ox, bot + oy
  );
  c.lineTo(x - wB + ox, bot + oy);
  c.bezierCurveTo(
    x - wB + ox, bot - 9.0 + oy,
    x - wT - 0.3 + ox, top + 12.0 + oy,
    x - wT + ox, top + 4.2 + oy
  );
  c.closePath();
}

/* 袜子本体 + 淡粉阴影 + 袜口细边 */
function lt_drawSock(ctx, S, x, far) {
  const wT = 9.2;

  const g = ctx.createLinearGradient(x - wT, 0, x + wT, 0);
  g.addColorStop(0.0, '#ece6ee');
  g.addColorStop(0.20, '#fbf8f3');
  g.addColorStop(0.50, '#fffdfb');
  g.addColorStop(0.80, '#f4edf2');
  g.addColorStop(1.0, '#e4dce6');
  ctx.beginPath(); lt_sockPath(ctx, x); ctx.fillStyle = g; ctx.fill();

  ctx.save();
  ctx.beginPath(); lt_sockPath(ctx, x); ctx.clip();

  // 裙摆投影（袜口顶部最深）
  const gShadow = ctx.createLinearGradient(0, LT_SOCK_TOP - 1, 0, LT_SOCK_TOP + 10);
  gShadow.addColorStop(0, 'rgba(86,74,104,0.26)');
  gShadow.addColorStop(0.55, 'rgba(120,104,130,0.12)');
  gShadow.addColorStop(1, 'rgba(120,104,130,0)');
  ctx.fillStyle = gShadow;
  ctx.fillRect(x - wT - 1, LT_SOCK_TOP - 1, wT * 2 + 2, 11);

  // 淡粉水彩阴影带（袜口下方，参照三视图的暖粉横带）
  const gPink = ctx.createLinearGradient(0, 142.5, 0, 156.0);
  gPink.addColorStop(0.00, 'rgba(246,217,207,0.00)');
  gPink.addColorStop(0.12, 'rgba(246,201,190,0.95)');
  gPink.addColorStop(0.34, 'rgba(246,209,199,0.80)');
  gPink.addColorStop(0.58, 'rgba(246,217,207,0.46)');
  gPink.addColorStop(0.82, 'rgba(246,217,207,0.10)');
  gPink.addColorStop(1.00, 'rgba(246,217,207,0.00)');
  ctx.fillStyle = gPink;
  ctx.fillRect(x - wT - 1, 142.5, wT * 2 + 2, 13.5);

  // 侧面淡粉 + 紫灰阴影（外侧面，符合“袜子侧面淡粉阴影”）
  const gSide = ctx.createLinearGradient(x + wT * 0.02, 0, x + wT + 0.5, 0);
  gSide.addColorStop(0, 'rgba(246,217,207,0.00)');
  gSide.addColorStop(0.5, 'rgba(246,217,207,0.40)');
  gSide.addColorStop(1, 'rgba(206,184,201,0.48)');
  ctx.fillStyle = gSide;
  ctx.fillRect(x, LT_SOCK_TOP + 2, wT + 1, LT_SOCK_BOT - LT_SOCK_TOP);

  const gSide2 = ctx.createLinearGradient(x - wT - 0.5, 0, x - wT * 0.42, 0);
  gSide2.addColorStop(0, 'rgba(199,188,214,0.38)');
  gSide2.addColorStop(1, 'rgba(199,188,214,0)');
  ctx.fillStyle = gSide2;
  ctx.fillRect(x - wT, LT_SOCK_TOP + 4, wT, LT_SOCK_BOT - LT_SOCK_TOP);

  // 脚踝处压暗
  const gAnk = ctx.createLinearGradient(0, 155, 0, 166.0);
  gAnk.addColorStop(0, 'rgba(120,104,130,0)');
  gAnk.addColorStop(1, 'rgba(86,74,104,0.20)');
  ctx.fillStyle = gAnk;
  ctx.fillRect(x - wT, 155, wT * 2, 11);

  ctx.restore();

  // 袜口细边：浅蓝 → 金 → 浅蓝（1~2 圈）
  const circumferenceLine = (yy, color, lw, alpha, bow) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    lt_arcLine(
      ctx, x - wT + 0.6, yy + 0.55, x, yy + 1.15 + (bow || 0), x + wT - 0.6, yy + 0.55
    );
    ctx.stroke();
    ctx.restore();
  };
  circumferenceLine(144.6, '#a7cdec', 1.5, 0.95, 0.15);
  circumferenceLine(147.2, GOLD, 0.95, 0.94, 0.10);

  // 袜口小高光
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x - 2.8, 152.8, 1.8, 4.2, 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  hbStrokePath(ctx, function (c, ox, oy) { lt_sockPath(c, x, ox, oy); }, INK, 2.2, far ? 71 : 72);

  // 远腿压暗，和鞋子的前后层次一致
  if (far) {
    ctx.save();
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = '#1c2442';
    ctx.beginPath();
    lt_sockPath(ctx, x);
    ctx.fill();
    ctx.restore();
  }
}

/* --------------------------------------------------------------------------
 * 鞋：2D 参数化剪影，随 |sinY| 在“正面圆头”与“侧面长头”之间连续变形。
 * 脚趾朝向 = S.sinY 的符号；鞋口/横带/爱心扣在背面自动隐藏。
 * ------------------------------------------------------------------------ */
function lt_shoeQ(S, x, legSign) {
  const s = S.sinY;
  const a = Math.abs(s);
  const toeSign = a < 0.04 ? 0 : (s < 0 ? -1 : 1);
  const ankleX = x - toeSign * (1.4 + 1.0 * a);   // 鞋口向脚跟侧偏移

  const side = (sg) => {
    const isToe = toeSign !== 0 && sg === toeSign;
    const upperX = x + sg * (11.35 + (isToe ? 4.7 : 0.5) * a);
    const upperY = 163.0 + (isToe ? 1.8 : -1.6) * a;
    const botX = x + sg * (11.55 + (isToe ? 4.7 : 0.4) * a);
    return {
      upperX: upperX, upperY: upperY,
      botX: botX, botY: LT_SHOW_SOLE
    };
  };
  const L = side(-1), R = side(1);
  return {
    x: x, legSign: legSign, a: a, s: s,
    toeSign: toeSign,
    ankleX: ankleX,
    topY: LT_SHOW_TOP, sole: LT_SHOW_SOLE,
    L: L, R: R,
    topHalf: 8.6 + 0.2 * a
  };
}

function lt_shoePath(c, q, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  const y0 = q.topY, y1 = q.sole;
  const tlx = q.ankleX - q.topHalf, trx = q.ankleX + q.topHalf;
  const L = q.L, R = q.R;

  c.moveTo(tlx + ox, y0 + oy);
  c.bezierCurveTo(
    tlx - 1.0 + ox, y0 + 3.0 + oy,
    L.upperX - 0.5 + ox, L.upperY - 2.5 + oy,
    L.upperX + ox, L.upperY + oy
  );
  c.bezierCurveTo(
    L.upperX - 0.15 + ox, L.upperY + 3.8 + oy,
    L.botX + 1.2 + ox, y1 - 4.8 + oy,
    L.botX + 0.3 + ox, y1 - 1.2 + oy
  );
  c.quadraticCurveTo(L.botX - 0.5 + ox, y1 + 0.5 + oy, L.botX + 3.4 + ox, y1 + 0.5 + oy);
  c.bezierCurveTo(
    L.botX * 0.35 + R.botX * 0.65 + ox, y1 + 0.8 + oy,
    L.botX * 0.65 + R.botX * 0.35 + ox, y1 + 0.8 + oy,
    R.botX - 3.4 + ox, y1 + 0.5 + oy
  );
  c.quadraticCurveTo(R.botX + 0.5 + ox, y1 + 0.5 + oy, R.botX - 0.3 + ox, y1 - 1.2 + oy);
  c.bezierCurveTo(
    R.botX - 1.2 + ox, y1 - 4.8 + oy,
    R.upperX + 0.15 + ox, R.upperY + 3.8 + oy,
    R.upperX + ox, R.upperY + oy
  );
  c.bezierCurveTo(
    R.upperX + 0.5 + ox, R.upperY - 2.5 + oy,
    trx + 1.0 + ox, y0 + 3.0 + oy,
    trx + ox, y0 + oy
  );
  c.quadraticCurveTo(q.ankleX + ox, y0 - 1.0 + oy, tlx + ox, y0 + oy);
  c.closePath();
}

function lt_drawShoe(ctx, S, x, legSign, far) {
  const q = lt_shoeQ(S, x, legSign);
  const c = S.cosY;
  const frontVis = smoothstep(-0.34, 0.18, c);
  const backVis = smoothstep(0.30, 0.85, -c);

  // ---- 鞋体
  const g = ctx.createLinearGradient(0, q.topY, 0, q.sole + 1);
  g.addColorStop(0.00, '#4a649a');
  g.addColorStop(0.15, '#394f82');
  g.addColorStop(0.45, '#2a3c6a');
  g.addColorStop(0.78, '#1b2445');
  g.addColorStop(1.00, '#0f1428');
  ctx.beginPath(); lt_shoePath(ctx, q); ctx.fillStyle = g; ctx.fill();

  ctx.save();
  ctx.beginPath(); lt_shoePath(ctx, q); ctx.clip();

  // 顶面亮部
  const gTop = ctx.createRadialGradient(
    q.ankleX - 1.5, q.topY + 1.2, 1,
    q.ankleX - 0.5, q.topY + 4.5, 17
  );
  gTop.addColorStop(0, 'rgba(170,208,247,0.45)');
  gTop.addColorStop(0.5, 'rgba(98,144,203,0.16)');
  gTop.addColorStop(1, 'rgba(60,90,140,0)');
  ctx.fillStyle = gTop;
  ctx.fillRect(x - 34, q.topY - 3, 68, 28);

  // 外侧面暗部
  const gSide = ctx.createLinearGradient(x - 5, 0, x + 16, 0);
  gSide.addColorStop(0, 'rgba(8,12,26,0.00)');
  gSide.addColorStop(0.52, 'rgba(8,12,26,0.10)');
  gSide.addColorStop(1, 'rgba(8,12,26,0.42)');
  ctx.fillStyle = gSide;
  ctx.fillRect(x - 34, q.topY - 2, 68, 24);

  // 鞋头冷蓝反光
  const gToe = ctx.createLinearGradient(0, q.sole - 7, 0, q.sole + 1);
  gToe.addColorStop(0, 'rgba(110,164,226,0.00)');
  gToe.addColorStop(0.70, 'rgba(110,164,226,0.17)');
  gToe.addColorStop(1, 'rgba(65,110,175,0.24)');
  ctx.fillStyle = gToe;
  ctx.fillRect(x - 28, q.sole - 9, 56, 11);

  // 鞋底压暗
  const gSole = ctx.createLinearGradient(0, q.sole - 3.4, 0, q.sole + 1.5);
  gSole.addColorStop(0, 'rgba(8,11,24,0)');
  gSole.addColorStop(1, 'rgba(8,11,24,0.94)');
  ctx.fillStyle = gSole;
  ctx.fillRect(x - 28, q.sole - 3.4, 56, 5.4);

  // 鞋底上方的石青反光
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = '#667fb0';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(q.L.botX + 3.8, q.sole - 3.2);
  ctx.quadraticCurveTo(x, q.sole - 2.55, q.R.botX - 3.8, q.sole - 3.2);
  ctx.stroke();
  ctx.restore();

  // ---- 鞋口里的白袜
  if (frontVis > 0.02) {
    ctx.save();
    ctx.globalAlpha = frontVis;
    const ox = q.ankleX - q.toeSign * 0.4;
    const oy = q.topY + 3.7;
    const rx = 7.25 + 0.1 * (1 - q.a);
    const ry = 2.75 + 0.15 * q.a;
    ctx.beginPath();
    ctx.ellipse(ox, oy, rx + 0.5, ry + 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0e1324';
    ctx.fill();
    const gs = ctx.createLinearGradient(0, oy - ry, 0, oy + ry);
    gs.addColorStop(0, '#e2d9e3');
    gs.addColorStop(0.5, '#fdfaf6');
    gs.addColorStop(1, '#fffdfb');
    ctx.beginPath();
    ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = gs;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ox, oy - ry * 0.62, rx * 0.9, ry * 0.55, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,104,130,0.24)';
    ctx.fill();
    ctx.restore();
  }

  // ---- 脚背横带 + 金色爱心扣
  if (frontVis > 0.02) {
    ctx.save();
    ctx.globalAlpha = frontVis;

    const front = {
      a: { x: x - 10.3, y: q.topY + 6.55 },
      b: { x: x + 10.3, y: q.topY + 6.55 },
      c: { x: x, y: q.topY + 7.65 }
    };
    // 侧视：由脚跟上方斜跨到脚背前方（toeSign 指向鞋头）
    const side = {
      a: { x: q.ankleX - q.toeSign * 2.4, y: q.topY + 1.3 },
      b: { x: q.ankleX + q.toeSign * 9.0, y: q.topY + 6.4 },
      c: { x: q.ankleX + q.toeSign * 3.8, y: q.topY + 2.9 }
    };
    const A = lt_lerp2(front.a, side.a, q.a);
    const B = lt_lerp2(front.b, side.b, q.a);
    const C = lt_lerp2(front.c, side.c, q.a);

    // 带下阴影
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(7,10,22,0.45)';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y + 0.8);
    ctx.quadraticCurveTo(C.x, C.y + 0.8, B.x, B.y + 0.8);
    ctx.stroke();
    // 带子
    ctx.strokeStyle = '#223158';
    ctx.lineWidth = 2.75;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.quadraticCurveTo(C.x, C.y, B.x, B.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(140,176,226,0.72)';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(A.x - 0.2, A.y - 0.95);
    ctx.quadraticCurveTo(C.x, C.y - 1.0, B.x + 0.2, B.y - 0.95);
    ctx.stroke();

    // 金色爱心扣：正面在脚外侧；侧面在横带靠鞋头的一端
    const heartFront = { x: x + q.legSign * 9.75, y: q.topY + 6.55 };
    const heartSide = { x: B.x + q.legSign * 0.1, y: B.y - 0.55 };
    const H = lt_lerp2(heartFront, heartSide, q.a);
    const hs = 3.0;
    ctx.save();
    ctx.translate(H.x, H.y);
    ctx.rotate(-0.06 + q.toeSign * q.a * 0.12);
    // 扣座
    ctx.beginPath();
    ctx.ellipse(0, 0.35, hs * 1.2, hs * 0.78, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,14,28,0.5)';
    ctx.fill();
    ctx.beginPath();
    lt_heartPath(ctx, 0, 0, hs, 0, 0);
    ctx.fillStyle = '#0f1426';
    ctx.globalAlpha = frontVis * 0.55;
    ctx.fill();
    ctx.globalAlpha = frontVis;
    ctx.translate(0.0, -0.3);
    // 金色心形环
    ctx.beginPath();
    lt_heartPath(ctx, 0, 0, hs * 0.94, 0, 0);
    const gh = ctx.createLinearGradient(0, -hs, 0, hs);
    gh.addColorStop(0, GOLD_LIGHT);
    gh.addColorStop(0.55, GOLD);
    gh.addColorStop(1, GOLD_DARK);
    ctx.fillStyle = gh;
    ctx.fill();
    ctx.strokeStyle = 'rgba(58,40,16,0.65)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    // 心形环中心镂空
    ctx.beginPath();
    lt_heartPath(ctx, 0, 0.15, hs * 0.56, 0, 0);
    ctx.fillStyle = '#223158';
    ctx.fill();
    ctx.globalAlpha = frontVis * 0.9;
    ctx.fillStyle = '#fff4d8';
    ctx.beginPath();
    ctx.ellipse(-0.75, -1.0, 0.72, 0.55, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---- 白色高光
  ctx.save();
  ctx.globalAlpha = 0.66 * frontVis;
  ctx.strokeStyle = '#f4fbff';
  ctx.lineWidth = 1.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (q.toeSign === 0) {
    ctx.moveTo(x - 7.2, q.topY + 9.7);
    ctx.quadraticCurveTo(x - 3.6, q.topY + 11.7, x + 1.0, q.topY + 11.5);
  } else {
    const tx = q.toeSign > 0 ? q.R.botX : q.L.botX;
    ctx.moveTo(tx - q.toeSign * 7.6, q.sole - 5.6);
    ctx.quadraticCurveTo(tx - q.toeSign * 3.8, q.sole - 8.2, tx + q.toeSign * 1.0, q.sole - 8.9);
  }
  ctx.stroke();
  ctx.restore();

  if (q.a < 0.62 && frontVis > 0.03) {
    ctx.save();
    ctx.globalAlpha = (1 - q.a / 0.62) * 0.85 * frontVis;
    ctx.fillStyle = '#f6fcff';
    const sgn = q.legSign;
    ctx.beginPath();
    ctx.ellipse(x - 0.6 + sgn * 0.5, q.topY + 11.6, 1.1, 0.95, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 2.8 + sgn * 0.5, q.topY + 12.1, 0.68, 0.62, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 鞋口上缘白边
  ctx.save();
  ctx.globalAlpha = 0.30 + 0.25 * frontVis;
  ctx.strokeStyle = '#bcd4ef';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(q.ankleX - q.topHalf + 0.6, q.topY + 0.15);
  ctx.quadraticCurveTo(q.ankleX, q.topY - 0.75, q.ankleX + q.topHalf - 0.6, q.topY + 0.15);
  ctx.stroke();
  ctx.restore();

  // ---- 背面：鞋跟亮部（参考图背面是干净圆润的鞋跟）
  if (backVis > 0.02) {
    ctx.save();
    ctx.globalAlpha = backVis;
    ctx.strokeStyle = 'rgba(120,158,206,0.30)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(q.ankleX - 6.4, q.topY + 2.9);
    ctx.quadraticCurveTo(q.ankleX, q.topY + 1.1, q.ankleX + 6.4, q.topY + 2.9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(9,12,24,0.30)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(q.ankleX - 4.8, q.topY + 9.2);
    ctx.quadraticCurveTo(q.ankleX, q.topY + 10.2, q.ankleX + 4.8, q.topY + 9.2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore(); // unclip

  hbStrokePath(ctx, function (c, ox, oy) { lt_shoePath(c, q, ox, oy); }, INK, 2.35, far ? 81 : 82);

  // 鞋底墨线
  ctx.save();
  ctx.strokeStyle = '#0b0f1e';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(q.L.botX + 4.6, q.sole + 0.5);
  ctx.quadraticCurveTo(x, q.sole + 0.95, q.R.botX - 4.6, q.sole + 0.5);
  ctx.stroke();
  ctx.restore();

  if (far) {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#1c2442';
    ctx.beginPath();
    lt_shoePath(ctx, q);
    ctx.fill();
    ctx.restore();
  }
}

/* --------------------------------------------------------------------------
 * 单条腿 / drawLegs
 * ------------------------------------------------------------------------ */
function lt_drawLeg(ctx, S, legSign, x, far, lift) {
  ctx.save();
  ctx.translate(0, -lift);
  lt_drawSock(ctx, S, x, far);
  lt_drawShoe(ctx, S, x, legSign, far);
  ctx.restore();
}

function drawLegs(ctx, S) {
  const c = S.cosY, s = S.sinY;
  const a = Math.abs(s);
  const sideView = a > 0.8;

  const nearSign = Math.abs(s) < 0.06 ? 1 : (s < 0 ? 1 : -1);

  const legs = [];
  if (sideView) {
    legs.push({ sign: nearSign, near: true });
  } else {
    legs.push({ sign: -nearSign, near: false });
    legs.push({ sign: nearSign, near: true });
  }

  let phase = 0;
  if (S.walkPhase) phase = S.walkPhase;
  const idle = S.pose === 'poutHips' ? 1 : 0;
  const farFade = 1 - smoothstep(0.70, 0.80, a);

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const x = leg.sign * LT_LEG_X * c + (idle ? leg.sign * 0.8 : 0);
    let lift = 0;
    if (phase) {
      const ph = phase + (leg.sign > 0 ? 0 : Math.PI);
      lift = Math.max(0, Math.sin(ph)) * 2.2;
    }
    if (!leg.near) {
      if (farFade < 0.02) continue;
      ctx.save();
      ctx.globalAlpha = farFade;
      lt_drawLeg(ctx, S, leg.sign, x, true, lift);
      ctx.restore();
    } else {
      lt_drawLeg(ctx, S, leg.sign, x, false, lift);
    }
  }
}

/* ==========================================================================
 *  鲸尾
 * ========================================================================== */

function lt_cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  };
}
function lt_cubicD(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  };
}

/* 尾柄：从身体基部到尾鳍根的渐宽曲带 */
function lt_tailStockPath(c, p0, p1, p2, p3, w0, w1, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  const N = 20;
  const left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = lt_cubic(p0, p1, p2, p3, t);
    const d = lt_cubicD(p0, p1, p2, p3, t);
    const len = Math.hypot(d.x, d.y) || 1;
    const nx = -d.y / len, ny = d.x / len;
    const w = lerpVal(w0, w1, smoothstep(0, 1, t)) * (1 + 0.08 * Math.sin(Math.PI * t));
    left.push({ x: p.x + nx * w * 0.5, y: p.y + ny * w * 0.5 });
    right.push({ x: p.x - nx * w * 0.5, y: p.y - ny * w * 0.5 });
  }
  c.moveTo(left[0].x + ox, left[0].y + oy);
  for (let i = 1; i <= N; i++) c.lineTo(left[i].x + ox, left[i].y + oy);
  for (let i = N; i >= 0; i--) c.lineTo(right[i].x + ox, right[i].y + oy);
  // 基部圆头（藏进身体，检视台下也不会露出截断的布带口）
  const d0 = lt_cubicD(p0, p1, p2, p3, 0);
  const dl = Math.hypot(d0.x, d0.y) || 1;
  c.quadraticCurveTo(
    p0.x - (d0.x / dl) * w0 * 0.62 + ox,
    p0.y - (d0.y / dl) * w0 * 0.62 + oy,
    left[0].x + ox, left[0].y + oy
  );
  c.closePath();
}

/* 尾叶几何：以鳍根 O 为中心，两叶在 ±spread 方向展开；
 * 叶根有一小段 baseHalf 宽的“掌部”，使双叶连成完整鲸尾。 */
function lt_flukeGeometry(O, bisAng, sign, spread, L, W, baseHalf) {
  const ang = bisAng + sign * spread;
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const perp = { x: -Math.sin(bisAng), y: Math.cos(bisAng) };
  const base = { x: O.x + perp.x * baseHalf * sign, y: O.y + perp.y * baseHalf * sign };
  const out = { x: -sn * sign, y: cs * sign };  // 远离中轴的方向
  const P = (u, v) => ({ x: base.x + cs * u + out.x * v, y: base.y + sn * u + out.y * v });
  return { ang: ang, cs: cs, sn: sn, out: out, base: base, P: P };
}

/* 单片尾叶的控制点 */
function lt_flukeLobePts(g, L, W, O, bisAng, notchD, spread, sign) {
  const tip = g.P(L * 0.97, W * 0.10);
  const lead = { c1: g.P(L * 0.16, W * 0.56), c2: g.P(L * 0.55, W * 1.02) };
  const N = {
    x: O.x + Math.cos(bisAng) * notchD,
    y: O.y + Math.sin(bisAng) * notchD
  };
  const inner = {
    c3: g.P(L * 0.70, W * 0.30),
    c4: { x: N.x + (tip.x - N.x) * 0.42, y: N.y + (tip.y - N.y) * 0.42 }
  };
  return { tip: tip, lead: lead, inner: inner, N: N };
}

/* 整个尾鳍：一条“不封底边”的开放路径（底边由尾柄覆盖）
 * spreadA / spreadB 分开传入，让左右叶能各自带相位差摆动 */
function lt_flukeOutline(c, O, bisAng, spreadA, spreadB, LA, LB, WA, WB, baseHalf, notchD, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  const gA = lt_flukeGeometry(O, bisAng, +1, spreadA, LA, WA, baseHalf);
  const gB = lt_flukeGeometry(O, bisAng, -1, spreadB, LB, WB, baseHalf);
  const A = lt_flukeLobePts(gA, LA, WA, O, bisAng, notchD, spreadA, +1);
  const B = lt_flukeLobePts(gB, LB, WB, O, bisAng, notchD, spreadB, -1);
  const BL = gA.base;   // 左/上侧叶根
  const BR = gB.base;

  c.moveTo(BL.x + ox, BL.y + oy);
  c.bezierCurveTo(A.lead.c1.x + ox, A.lead.c1.y + oy,
    A.lead.c2.x + ox, A.lead.c2.y + oy,
    A.tip.x + ox, A.tip.y + oy);
  c.bezierCurveTo(A.inner.c3.x + ox, A.inner.c3.y + oy,
    A.inner.c4.x + ox, A.inner.c4.y + oy,
    A.N.x + ox, A.N.y + oy);
  c.bezierCurveTo(B.inner.c4.x + ox, B.inner.c4.y + oy,
    B.inner.c3.x + ox, B.inner.c3.y + oy,
    B.tip.x + ox, B.tip.y + oy);
  c.bezierCurveTo(B.lead.c2.x + ox, B.lead.c2.y + oy,
    B.lead.c1.x + ox, B.lead.c1.y + oy,
    BR.x + ox, BR.y + oy);
  // 底边不画线：填充时自动闭合，描边时保持开放
}

/* 视图参数：三类视角的平滑混合 */
function lt_tailInfo(S) {
  const s = S.sinY, c = S.cosY;
  const wF = Math.max(0, c);
  const wB = Math.max(0, -c);
  const wS = Math.abs(s);
  const sum = (wF + wB + wS) || 1;
  const fK = wF / sum, bK = wB / sum, sK = wS / sum;
  const behindDir = -s;

  // 尾鳍根（相对身体基部 (0,108)）
  const rf = { x: 50, y: 10 };
  const rs = { x: behindDir * 29, y: 7 };
  const rb = { x: 0, y: 12 };
  const root = {
    x: rf.x * fK + rs.x * sK + rb.x * bK,
    y: rf.y * fK + rs.y * sK + rb.y * bK
  };

  // 中轴方向（由尾柄指向鳍面内部）
  const vf = { x: 0.97, y: -0.24 };
  const vsl = Math.hypot(behindDir * 0.86, 0.51) || 1;
  const vs = { x: behindDir * 0.86 / vsl, y: -0.51 / vsl };
  const vb = { x: 0, y: 1 };     // 背面：尾巴垂向下方
  let bx = vf.x * fK + vs.x * sK + vb.x * bK;
  let by = vf.y * fK + vs.y * sK + vb.y * bK;

  // 正/3-4 视角：让鲸尾稳定落在角色右侧（参考图正面构图），
  // 不跟着“身后方向”一起转到围裙正中央；侧/背视角不受影响。
  const frontPull = smoothstep(0.18, 0.95, c);
  if (frontPull > 0.001) {
    root.x = lerpVal(root.x, 64, frontPull * 0.82);
    bx = lerpVal(bx, 0.93, frontPull * 0.60);
    by = lerpVal(by, -0.37, frontPull * 0.60);
  }

  const bl = Math.hypot(bx, by) || 1;
  bx /= bl; by /= bl;
  const bisAng = Math.atan2(by, bx);

  const spread = 0.84 * fK + 0.78 * sK + 0.62 * bK;
  const lenA = 41 * fK + 40 * sK + 45 * bK;
  const lenB = 36 * fK + 35 * sK + 41 * bK;
  const widA = 18.5 * fK + 14.5 * sK + 19 * bK;
  const widB = 16.5 * fK + 12.5 * sK + 16 * bK;
  const notchD = 15 * fK + 14 * sK + 18 * bK;
  const baseHalf = 4.6 * fK + 4.3 * sK + 5.5 * bK;

  return {
    root: root, bisAng: bisAng, spread: spread,
    lenA: lenA, lenB: lenB, widA: widA, widB: widB,
    notchD: notchD, baseHalf: baseHalf,
    fK: fK, sK: sK, bK: bK, behindDir: behindDir
  };
}

/* --------------------------------------------------------------------------
 * drawTail / drawTailBehind / drawTailOver
 *
 * 总装把尾巴拆成两段：
 *   drawTailBehind —— 只在身后层画“尾柄根段”（被裙子/头发遮住的部分）
 *   drawTailOver   —— 画完整的尾鳍（露在裙外/发外的可见部分）
 * drawTail 保留为两者之和，供 part=tail 检视台使用。
 * ------------------------------------------------------------------------ */
function lt_drawTailCore(ctx, S, mode) {
  const info = lt_tailInfo(S);
  const sway = S.tailAngle * 1.45;

  // 左右叶相位差
  const lag = Math.sin(S.t * 2.7 + 0.9) * 0.06;
  const lobeSway = S.tailAngle * 0.18;
  const spreadA = info.spread + lag + lobeSway;
  const spreadB = info.spread - lag * 0.9 - lobeSway * 0.42;

  const breath = 1 + Math.sin(S.t * 2.2 + 0.3) * 0.018;
  const LA = info.lenA * breath;
  const LB = info.lenB * (1 + Math.sin(S.t * 2.2 + 1.1) * 0.02);

  const r = info.root;
  const bend = 8.5 * info.fK + info.behindDir * 5.5 * info.sK + 7.0 * info.bK;
  const c1 = { x: r.x * 0.15 + bend, y: r.y * 0.10 - 4.0 };
  const c2 = { x: r.x * 0.62 + bend * 0.55, y: r.y * 0.60 - 2.6 };
  // 尾柄末端稍微伸进鳍面内部，由鳍面盖住断口
  const rEnd = {
    x: r.x + Math.cos(info.bisAng) * 3.0,
    y: r.y + Math.sin(info.bisAng) * 3.0
  };

  const maxL = Math.max(LA, LB) * 1.02;
  const grad = ctx.createRadialGradient(r.x, r.y, 1, r.x, r.y, maxL);
  grad.addColorStop(0.00, '#142342');
  grad.addColorStop(0.14, '#20426f');
  grad.addColorStop(0.32, '#2f6cae');
  grad.addColorStop(0.52, '#4b95d8');
  grad.addColorStop(0.72, '#78c0f0');
  grad.addColorStop(0.90, '#a5ddfb');
  grad.addColorStop(1.00, '#ccf0ff');

  ctx.save();
  ctx.translate(0, 108);
  ctx.rotate(sway);

  if (mode !== 'over') {
  // ---- 尾柄
  ctx.beginPath();
  lt_tailStockPath(ctx, { x: 0, y: 0 }, c1, c2, rEnd, 8.8, 16.1);
  const gs = ctx.createLinearGradient(0, 0, r.x + 8, r.y + 8);
  gs.addColorStop(0.00, '#16233f');
  gs.addColorStop(0.55, '#233f68');
  gs.addColorStop(1.00, '#315e97');
  ctx.fillStyle = gs;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  lt_tailStockPath(ctx, { x: 0, y: 0 }, c1, c2, rEnd, 8.8, 16.1);
  ctx.clip();
  const gsHi = ctx.createLinearGradient(0, -9, 0, 9);
  gsHi.addColorStop(0, 'rgba(140,198,245,0.28)');
  gsHi.addColorStop(0.5, 'rgba(140,198,245,0.02)');
  gsHi.addColorStop(1, 'rgba(10,18,40,0.36)');
  ctx.fillStyle = gsHi;
  ctx.fillRect(-36, -24, 150, 70);

  const mid0 = lt_cubic({ x: 0, y: 0 }, c1, c2, rEnd, 0.08);
  const mid1 = lt_cubic({ x: 0, y: 0 }, c1, c2, rEnd, 0.52);
  const mid2 = lt_cubic({ x: 0, y: 0 }, c1, c2, rEnd, 0.97);
  ctx.strokeStyle = 'rgba(9,19,42,0.58)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(mid0.x, mid0.y);
  ctx.quadraticCurveTo(mid1.x, mid1.y, mid2.x, mid2.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(166,216,250,0.40)';
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(mid0.x + 1.3, mid0.y - 1.2);
  ctx.quadraticCurveTo(mid1.x + 1.4, mid1.y - 1.4, mid2.x + 1.0, mid2.y - 1.0);
  ctx.stroke();
  ctx.restore();

  hbStrokePath(ctx, function (c, ox, oy) {
    lt_tailStockPath(c, { x: 0, y: 0 }, c1, c2, rEnd, 8.8, 16.1, ox, oy);
  }, INK, 2.3, 91);
  }

  if (mode !== 'behind') {
  // ---- 尾鳍
  ctx.beginPath();
  lt_flukeOutline(ctx, r, info.bisAng, spreadA, spreadB, LA, LB,
    info.widA, info.widB, info.baseHalf, info.notchD);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  lt_flukeOutline(ctx, r, info.bisAng, spreadA, spreadB, LA, LB,
    info.widA, info.widB, info.baseHalf, info.notchD);
  ctx.clip();

  // 根部暗
  const gShade = ctx.createLinearGradient(
    r.x, r.y,
    r.x + Math.cos(info.bisAng) * maxL, r.y + Math.sin(info.bisAng) * maxL
  );
  gShade.addColorStop(0, 'rgba(8,16,36,0.45)');
  gShade.addColorStop(0.30, 'rgba(8,16,36,0.14)');
  gShade.addColorStop(1, 'rgba(8,16,36,0)');
  ctx.fillStyle = gShade;
  ctx.fillRect(r.x - maxL * 1.5, r.y - maxL * 1.5, maxL * 3, maxL * 3);

  // 叶尖浅蓝水彩
  const gA = lt_flukeGeometry(r, info.bisAng, +1, spreadA, LA, info.widA, info.baseHalf);
  const gB = lt_flukeGeometry(r, info.bisAng, -1, spreadB, LB, info.widB, info.baseHalf);
  const tipWash = (g, L, W, seed) => {
    const tx = g.base.x + g.cs * L * 0.78, ty = g.base.y + g.sn * L * 0.78;
    wcWashBlob(ctx, tx, ty, W * 0.95, W * 0.60, '#9bd6fb', 0.34, seed, g.ang);
    wcWashBlob(ctx, tx + g.cs * L * 0.10, ty + g.sn * L * 0.10,
      W * 0.52, W * 0.34, '#d3f0ff', 0.36, seed + 2, g.ang);
  };
  tipWash(gA, LA, info.widA, 88);
  tipWash(gB, LB, info.widB, 89);

  // 中轴脊线：尾鳍根 → 凹口
  const bc = Math.cos(info.bisAng), bs = Math.sin(info.bisAng);
  const notchPt = { x: r.x + bc * info.notchD, y: r.y + bs * info.notchD };
  ctx.strokeStyle = 'rgba(9,18,40,0.62)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r.x + bc * 3.0, r.y + bs * 3.0);
  ctx.quadraticCurveTo(
    r.x + bc * info.notchD * 0.55 - bs * 1.1,
    r.y + bs * info.notchD * 0.55 + bc * 1.1,
    notchPt.x, notchPt.y
  );
  ctx.stroke();
  ctx.strokeStyle = 'rgba(186,230,255,0.40)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(r.x + bc * 3.0 - bs * 1.2, r.y + bs * 3.0 + bc * 1.2);
  ctx.quadraticCurveTo(
    r.x + bc * info.notchD * 0.55 - bs * 2.3,
    r.y + bs * info.notchD * 0.55 + bc * 2.3,
    notchPt.x - bs * 1.3, notchPt.y + bc * 1.3
  );
  ctx.stroke();

  // 每叶 2 条鳍纹，从尾柄基部放射
  const finStripe = (g, L, W, u1, v1, cu, cv, alpha, lw) => {
    const start = { x: r.x + g.cs * 2.2 + g.out.x * 0.6, y: r.y + g.sn * 2.2 + g.out.y * 0.6 };
    const mid = g.P(cu * L, cv * W);
    const end = g.P(u1 * L, v1 * W);
    ctx.strokeStyle = 'rgba(8,18,42,' + alpha + ')';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(mid.x, mid.y, end.x, end.y);
    ctx.stroke();
    // 鳍纹旁的一道浅蓝湿边，水彩感
    const dx = g.out.x * 1.25, dy = g.out.y * 1.25;
    ctx.strokeStyle = 'rgba(168,220,252,0.14)';
    ctx.lineWidth = lw * 0.58;
    ctx.beginPath();
    ctx.moveTo(start.x + dx, start.y + dy);
    ctx.quadraticCurveTo(mid.x + dx, mid.y + dy, end.x + dx, end.y + dy);
    ctx.stroke();
  };
  finStripe(gA, LA, info.widA, 0.80, 0.66, 0.42, 0.42, 0.58, 1.25);
  finStripe(gA, LA, info.widA, 0.60, 0.30, 0.32, 0.16, 0.50, 1.1);
  finStripe(gA, LA, info.widA, 0.84, 0.34, 0.50, 0.10, 0.40, 0.9);
  finStripe(gB, LB, info.widB, 0.80, 0.66, 0.42, 0.42, 0.58, 1.25);
  finStripe(gB, LB, info.widB, 0.60, 0.30, 0.32, 0.16, 0.50, 1.1);
  finStripe(gB, LB, info.widB, 0.84, 0.34, 0.50, 0.10, 0.40, 0.9);

  // 外侧叶缘湿边高光
  const edgeGlow = (g, L, W) => {
    const p0 = g.P(L * 0.30, W * 0.88);
    const p1 = g.P(L * 0.52, W * 0.99);
    const p2 = g.P(L * 0.70, W * 0.76);
    ctx.strokeStyle = 'rgba(196,234,255,0.48)';
    ctx.lineWidth = 1.55;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    ctx.stroke();
  };
  edgeGlow(gA, LA, info.widA);
  edgeGlow(gB, LB, info.widB);

  ctx.restore();

  // 尾鳍墨线（开放底边）
  hbStrokePath(ctx, function (c, ox, oy) {
    lt_flukeOutline(c, r, info.bisAng, spreadA, spreadB, LA, LB,
      info.widA, info.widB, info.baseHalf, info.notchD, ox, oy);
  }, INK, 2.35, 94);

  // ---- 尾鳍根部深藏青“掌部”：把双叶和尾柄连成一体
  // over 层不画掌部：尾巴悬在裙子/头发上时，深色椭圆会变成一块黑斑。
  if (mode !== 'over') {
    const padC = { x: r.x + bc * 0.6, y: r.y + bs * 0.6 };
    const padRx = info.notchD * 0.34 + 2.2;
    const padRy = info.baseHalf * 2.05 + 1.8;
    ctx.save();
    // 掌部只压暗尾鳍内部，避免在裙子/头发上留下一个黑色圆斑
    ctx.beginPath();
    lt_flukeOutline(ctx, r, info.bisAng, spreadA, spreadB, LA, LB,
      info.widA, info.widB, info.baseHalf, info.notchD);
    ctx.clip();
    const gPad = ctx.createRadialGradient(
      padC.x - bc * 1.2, padC.y - bs * 1.2, 1,
      padC.x, padC.y, Math.max(padRx, padRy)
    );
    gPad.addColorStop(0.00, 'rgba(12,21,42,0.94)');
    gPad.addColorStop(0.55, 'rgba(14,25,48,0.88)');
    gPad.addColorStop(0.82, 'rgba(17,31,58,0.62)');
    gPad.addColorStop(1.00, 'rgba(20,36,66,0.00)');
    ctx.fillStyle = gPad;
    ctx.beginPath();
    ctx.ellipse(padC.x, padC.y, padRx, padRy, info.bisAng, 0, Math.PI * 2);
    ctx.fill();

    // 掌部上的中轴脊 + 冷光
    ctx.strokeStyle = 'rgba(5,10,23,0.68)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(r.x - bc * 2.5, r.y - bs * 2.5);
    ctx.quadraticCurveTo(
      r.x + bc * info.notchD * 0.28 - bs * 0.8,
      r.y + bs * info.notchD * 0.28 + bc * 0.8,
      r.x + bc * (info.notchD * 0.62), r.y + bs * (info.notchD * 0.62)
    );
    ctx.stroke();
    ctx.strokeStyle = 'rgba(146,202,246,0.14)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(r.x - bc * 2.5 - bs * 1.1, r.y - bs * 2.5 + bc * 1.1);
    ctx.quadraticCurveTo(
      r.x + bc * info.notchD * 0.28 - bs * 1.7,
      r.y + bs * info.notchD * 0.28 + bc * 1.7,
      r.x + bc * info.notchD * 0.55 - bs * 1.0,
      r.y + bs * info.notchD * 0.55 + bc * 1.0
    );
    ctx.stroke();
    ctx.restore();
  }

  // 凹口处补一笔，强调鲸尾中缝
  ctx.save();
  ctx.strokeStyle = 'rgba(10,19,40,0.72)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  const nx = r.x + bc * info.notchD, ny = r.y + bs * info.notchD;
  ctx.beginPath();
  ctx.moveTo(nx - Math.cos(info.bisAng + spreadA) * 2.1,
    ny - Math.sin(info.bisAng + spreadA) * 2.1);
  ctx.quadraticCurveTo(nx + bc * 1.6, ny + bs * 1.6,
    nx - Math.cos(info.bisAng - spreadB) * 2.1,
    ny - Math.sin(info.bisAng - spreadB) * 2.1);
  ctx.stroke();
  ctx.restore();
  } // end fluke

  ctx.restore();
}

function drawTail(ctx, S) { lt_drawTailCore(ctx, S, 'full'); }
function drawTailBehind(ctx, S) { lt_drawTailCore(ctx, S, 'behind'); }
function drawTailOver(ctx, S) { lt_drawTailCore(ctx, S, 'over'); }
