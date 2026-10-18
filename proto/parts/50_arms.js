/* ============================================================================
 * 50_arms.js · 手臂与手势 drawArms(ctx, S)
 * ----------------------------------------------------------------------------
 * 《肥鱼爱大米》深深 · 2.5 头身 · 水彩 + 墨线
 *
 * 坐标系沿用 SPEC：本地原点 = 头部中心，x 右正、y 下正、z 朝向观察者为正
 *   肩点 (±30, 70)，上臂 26，前臂 24，小手半径 8
 *
 * 做法：
 *   1) 每个姿态在“角色本地 3D 空间”里定义 肩 / 肘 / 腕 / 指尖 四个点；
 *   2) 用 yaw 旋转投影到画面（x' = x·cosY + z·sinY, z' = -x·sinY + z·cosY）；
 *   3) 按投影深度排序，远侧手臂被近似躯干轮廓遮挡（只露出轮廓外的一小条）；
 *   4) 每段肢体 = 两侧贝塞尔曲线 + 两端圆弧关节，所以肘/肩永远圆润无接缝；
 *   5) 材质：泡泡短袖(藏青, 收口束带) + 白色宽翻边袖口(扇贝边 + 金线金扣)
 *            + 皮肤前臂 + 圆润小手套(3~4 根小手指 + 拇指)。
 *
 * 只依赖 00_util.js 的公共工具（INK/SKIN/hbStrokePath/wcWashBlob...），
 * 不读写 DOM，不调用其它部件函数。
 * ========================================================================== */

var ARMS_UP_LEN = 26;     // 上臂
var ARMS_FORE_LEN = 24;   // 前臂
var ARMS_HAND_R = 8;      // 手半径

/* ==========================================================================
 * 1. 投影 & 几何小工具
 * ========================================================================== */

/* 角色本地 3D 点 → 画面 2D 点（与头部 projFace 同一套偏航约定） */
function arms_proj(S, p) {
  const sy = S.sinY, cy = S.cosY;
  return {
    x: p[0] * cy + p[2] * sy,
    y: p[1],
    z: -p[0] * sy + p[2] * cy
  };
}

function arms_vadd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function arms_vlerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function arms_vlen(a) { return Math.hypot(a.x, a.y); }
function arms_vnorm(a) { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; }

/* 线段方向 & 法线（屏幕空间） */
function arms_frame(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-4;
  return { ux: dx / L, uy: dy / L, nx: -dy / L, ny: dx / L, L: L };
}

/* ==========================================================================
 * 2. 躯干/裙摆近似轮廓
 *    只用于“远侧手臂的遮挡裁切”。真实躯干由 40_body.js 绘制，
 *    这里取偏保守（略窄）的数值，宁可让手臂贴住身体，也不出现悬空缝隙。
 * ========================================================================== */

function arms_bodyHalfW(y) {
  /* 数值由 40_body.js 实际渲染逐行采样得到：肩 ±27 / 腰 ±23 / 裙摆 ±69 */
  if (y < 60) return 3.5 + Math.max(0, y - 44) * 1.15;        // 脖子
  if (y < 67) return 21.9 + (y - 60) * 0.72;                  // 领口→肩
  if (y < 92) return 27.2 - (y - 67) * 0.14;                  // 胸
  if (y < 97) return 23.7 - (y - 92) * 0.12;                  // 腰
  if (y < 104) return 23.1 + (y - 97) * 1.45;                 // 胯
  if (y < 112) return 33.2 + (y - 104) * 1.05;                // 裙摆起势
  if (y < 120) return 41.6 + (y - 112) * 1.15;
  if (y < 128) return 50.8 + (y - 120) * 0.62;
  if (y < 148) {
    const tt = (y - 128) / 20;
    return 55.8 + 13.4 * (tt * 0.55 + tt * tt * 0.45);
  }
  return 69.2;
}

/* 偏航下椭圆柱投影半宽：depthFactor 让正侧视时宽度收窄
 * （实测侧面躯干 ±19 / 正面 ±27 = 0.70；裙摆 ±44 / ±69 = 0.64） */
function arms_bodySilh(hx, y, S) {
  const df = y > 106 ? 0.655 : 0.70;
  return Math.hypot(hx * S.cosY, hx * df * S.sinY);
}

/* 闭合的躯干轮廓（偶数填充规则挖洞用） */
function arms_bodyOutline(c, S, ox, oy) {
  const y0 = 42, y1 = 152, step = 3;
  c.moveTo(ox, y0 + oy);
  for (let y = y0; y <= y1; y += step) {
    c.lineTo(arms_bodySilh(arms_bodyHalfW(y), y, S) + ox, y + oy);
  }
  c.lineTo(ox, y1 + oy);
  for (let y = y1; y >= y0; y -= step) {
    c.lineTo(-arms_bodySilh(arms_bodyHalfW(y), y, S) + ox, y + oy);
  }
  c.closePath();
}

/* 把画面裁成“躯干轮廓之外”：远侧手臂只露出身体外缘的一条 */
function arms_clipOutsideBody(ctx, S) {
  ctx.beginPath();
  ctx.rect(-400, -320, 800, 900);
  arms_bodyOutline(ctx, S, 0, 0);
  ctx.clip('evenodd');
}

/* ==========================================================================
 * 3. 姿态表（角色本地 3D 坐标）
 *    style: relax | palmUp | palmIn | touch | fist | point | count | none
 * ========================================================================== */

function arms_getPose(S) {
  const t = S.t || 0;
  const pose = S.pose || 'stand';
  const br = S.breath || 0;
  const bob = -br * 0.35;                       // 呼吸：肩线轻微起伏
  const idle = Math.sin(t * 2.1) * 0.8;         // 站姿微摆
  const idle2 = Math.cos(t * 2.8 + 0.4) * 0.6;
  const sL = Math.sin(t * 5.2);                 // sing 摆动
  const sC = Math.cos(t * 4.4);

  const mir = (p) => [-p[0], p[1], p[2]];
  const sym = (A) => ({
    sh: mir(A.sh), el: mir(A.el), wr: mir(A.wr), tip: mir(A.tip),
    style: A.style, thumb: -A.thumb, noHand: !!A.noHand, side: -1
  });

  let R = null, L = null;

  switch (pose) {
    /* 自然垂手，手在裙侧 */
    case 'stand': {
      R = {
        sh: [30, 70, 0], el: [35.5, 94.5, 6], wr: [36.5, 116.5, 14], tip: [36.5, 125.5, 15],
        style: 'relax', thumb: -1
      };
      L = sym(R);
      R.wr[0] += idle * 0.45; R.tip[0] += idle * 0.55;
      L.wr[0] += idle2 * 0.45; L.tip[0] += idle2 * 0.55;
      break;
    }

    /* 右手抚胸，左手向外斜伸、掌心向上 */
    case 'sing': {
      R = {
        sh: [30, 70, 0], el: [37, 89, 12], wr: [20, 82, 23], tip: [14, 73, 24],
        style: 'touch', thumb: 1
      };
      L = {
        sh: [-30, 70, 0], el: [-50, 83, 9], wr: [-68, 70, 17], tip: [-76, 63, 18],
        style: 'palmUp', thumb: 1
      };
      R.wr[0] += sL * 1.0; R.wr[1] += sC * 0.8;
      R.tip[0] += sL * 0.7; R.tip[1] += sC * 0.55;
      L.wr[1] += Math.sin(t * 2.0 + 0.7) * 1.5;
      L.tip[1] += Math.sin(t * 2.0 + 0.55) * 1.9;
      break;
    }

    /* 双手向前捧碗：手 y≈94、x≈±20、掌心向上 */
    case 'holdBowl': {
      R = {
        sh: [30, 70, 0], el: [39, 93, 9], wr: [20, 94, 24], tip: [15, 86, 25],
        style: 'palmUp', thumb: 1
      };
      L = sym(R);
      R.wr[1] += Math.sin(t * 1.7) * 0.5;
      L.wr[1] += Math.sin(t * 1.7 + 0.6) * 0.5;
      break;
    }

    /* 双臂环抱，手在胸前护住（右手略高于左手，形成交叠） */
    case 'hugBowl': {
      R = {
        sh: [30, 70, 0], el: [34, 92, 5], wr: [15, 87, 20], tip: [9, 80, 21],
        style: 'palmIn', thumb: 1
      };
      L = {
        sh: [-30, 70, 0], el: [-34, 93, 4], wr: [-15, 92, 18.4], tip: [-9, 85, 19.4],
        style: 'palmIn', thumb: -1
      };
      R.wr[1] += Math.sin(t * 2.3) * 0.5;
      L.wr[1] += Math.sin(t * 2.3 + 0.8) * 0.5;
      break;
    }

    /* 双手叉腰，肘外张 */
    case 'poutHips': {
      R = {
        sh: [30, 70, 0], el: [46, 87, 2], wr: [27, 95, 7], tip: [18, 98, 8],
        style: 'fist', thumb: 1
      };
      L = sym(R);
      break;
    }

    /* 右手食指竖起（举到脸侧），左手叉腰 */
    case 'eureka': {
      R = {
        sh: [30, 70, 0], el: [43, 88, 4], wr: [54, 68, 14], tip: [59, 53, 15],
        style: 'point', thumb: 1
      };
      L = {
        sh: [-30, 70, 0], el: [-45, 88, 2], wr: [-26, 96, 7], tip: [-17, 99, 8],
        style: 'fist', thumb: 1
      };
      R.wr[1] += Math.sin(t * 4.4) * 0.6;
      R.tip[1] += Math.sin(t * 4.4 + 0.4) * 0.9;
      break;
    }

    /* 双手向前递出：比 holdBowl 更开、掌心向上、更温柔 */
    case 'shareRice': {
      R = {
        sh: [30, 70, 0], el: [39, 90, 10], wr: [26, 89, 28], tip: [25, 78, 30],
        style: 'palmUp', thumb: 1
      };
      L = sym(R);
      const bobR = Math.sin(t * 1.8) * 1.0;
      R.wr[1] += bobR; R.tip[1] += bobR * 1.2;
      L.wr[1] += Math.sin(t * 1.8 + 0.5) * 1.0;
      L.tip[1] += Math.sin(t * 1.8 + 0.5) * 1.2;
      break;
    }

    /* 伏在桌上：只画上臂 + 前臂，手被桌子挡住 */
    case 'sleepDesk': {
      R = {
        sh: [30, 70, 0], el: [33, 85, 17], wr: [18, 96, 36], tip: [16, 104, 40],
        style: 'none', noHand: true, thumb: 1
      };
      L = sym(R);
      break;
    }

    /* 右手在胸前数数，左手自然下垂 */
    case 'countToken': {
      R = {
        sh: [30, 70, 0], el: [38, 89, 10], wr: [20, 80, 24], tip: [17, 69, 25],
        style: 'count', thumb: 1
      };
      L = {
        sh: [-30, 70, 0], el: [-35.5, 94.5, 6], wr: [-36.5, 116, 13], tip: [-36.5, 125, 14],
        style: 'relax', thumb: 1
      };
      const wag = Math.sin(t * 6.4);
      R.wr[0] += wag * 1.1; R.tip[0] += wag * 1.35;
      R.wr[1] += Math.cos(t * 6.4) * 0.7;
      break;
    }

    default: {
      R = {
        sh: [30, 70, 0], el: [35.5, 94.5, 6], wr: [36.5, 116.5, 14], tip: [36.5, 125.5, 15],
        style: 'relax', thumb: -1
      };
      L = sym(R);
      break;
    }
  }

  R.side = 1; L.side = -1;
  /* 呼吸：整条手臂随肩线轻轻起伏 */
  [R, L].forEach((A) => {
    ['sh', 'el', 'wr', 'tip'].forEach((key) => {
      if (A[key]) A[key][1] += bob;
    });
  });
  return { L: L, R: R };
}

/* ==========================================================================
 * 4. 基础形状
 * ========================================================================== */

/* 两侧贝塞尔 + 两端圆弧关节 = 圆润无接缝的肢体段 */
function arms_capsulePath(c, a, b, r0, r1, o) {
  o = o || {};
  const ox = o.ox || 0, oy = o.oy || 0;
  const f = arms_frame(a, b);
  const ax = a.x + ox, ay = a.y + oy;
  const bx = b.x + ox, by = b.y + oy;
  const bulge = o.bulge || 0;
  const bow = o.bow || 0;

  const nx = f.nx, ny = f.ny;
  const A1 = { x: ax + nx * r0, y: ay + ny * r0 };
  const A2 = { x: ax - nx * r0, y: ay - ny * r0 };
  const B1 = { x: bx + nx * r1, y: by + ny * r1 };
  const B2 = { x: bx - nx * r1, y: by - ny * r1 };

  const dx = bx - ax, dy = by - ay;
  const g1 = (r0 + bulge * 0.95 + bow);
  const g2 = (r1 + bulge * 0.60 + bow);
  const c1 = { x: ax + dx * 0.34 + nx * g1, y: ay + dy * 0.34 + ny * g1 };
  const c2 = { x: bx - dx * 0.34 + nx * g2, y: by - dy * 0.34 + ny * g2 };
  const c3 = { x: bx - dx * 0.34 - nx * g2, y: by - dy * 0.34 - ny * g2 };
  const c4 = { x: ax + dx * 0.34 - nx * g1, y: ay + dy * 0.34 - ny * g1 };

  const angN = Math.atan2(ny, nx);

  c.beginPath();
  c.moveTo(A1.x, A1.y);
  c.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, B1.x, B1.y);
  c.arc(bx, by, r1, angN, angN - Math.PI, true);      // 末端圆弧关节
  c.bezierCurveTo(c3.x, c3.y, c4.x, c4.y, A2.x, A2.y);
  c.arc(ax, ay, r0, angN + Math.PI, angN, true);      // 起点圆弧关节
  c.closePath();
}

/* 圆角矩形路径（局部坐标） */
function arms_rrectPath(c, x, y, w, h, r, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  r = Math.min(r, w / 2, h / 2);
  c.moveTo(x + r + ox, y + oy);
  c.lineTo(x + w - r + ox, y + oy);
  c.quadraticCurveTo(x + w + ox, y + oy, x + w + ox, y + r + oy);
  c.lineTo(x + w + ox, y + h - r + oy);
  c.quadraticCurveTo(x + w + ox, y + h + oy, x + w - r + ox, y + h + oy);
  c.lineTo(x + r + ox, y + h + oy);
  c.quadraticCurveTo(x + ox, y + h + oy, x + ox, y + h - r + oy);
  c.lineTo(x + ox, y + r + oy);
  c.quadraticCurveTo(x + ox, y + oy, x + r + ox, y + oy);
  c.closePath();
}

/* 固定光向（左上）下的明暗：返回“受光侧”法线 */
function arms_lightSide(n) {
  const Lx = -0.55, Ly = -0.84;
  return (n.x * Lx + n.y * Ly) >= 0 ? { x: n.x, y: n.y } : { x: -n.x, y: -n.y };
}

function arms_washInside(ctx, pathFn, seed, blobs) {
  ctx.save();
  ctx.beginPath();
  pathFn(ctx, 0, 0);
  ctx.clip();
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    wcWashBlob(ctx, b[0], b[1], b[2], b[3], b[4], b[5], seed + i * 3.7, b[6] || 0);
  }
  ctx.restore();
}

/* ==========================================================================
 * 5. 手（局部坐标：+y = 指尖方向，+x = 拇指侧；单位≈8px）
 * ========================================================================== */

/* 张开/半握的小手套：3~4 个指峰 + 侧面拇指，一个连续轮廓 */
function arms_mittenPath(c, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  c.moveTo(-5.4 + ox, -6.6 + oy);
  /* 左掌缘 */
  c.bezierCurveTo(-7.1 + ox, -5.2 + oy, -7.5 + ox, -0.9 + oy, -6.6 + ox, 3.0 + oy);
  /* 掌 → 指根 */
  c.bezierCurveTo(-6.2 + ox, 5.2 + oy, -6.1 + ox, 6.9 + oy, -5.2 + ox, 7.5 + oy);
  /* 小指 */
  c.quadraticCurveTo(-4.7 + ox, 9.4 + oy, -2.8 + ox, 8.7 + oy);
  /* 无名指 */
  c.quadraticCurveTo(-1.3 + ox, 10.3 + oy, 0.7 + ox, 8.9 + oy);
  /* 中指 */
  c.quadraticCurveTo(2.4 + ox, 10.2 + oy, 3.8 + ox, 8.4 + oy);
  /* 食指 */
  c.quadraticCurveTo(5.1 + ox, 9.4 + oy, 5.9 + ox, 7.3 + oy);
  /* 食指侧 → 拇指根 */
  c.bezierCurveTo(6.3 + ox, 6.3 + oy, 6.5 + ox, 5.6 + oy, 6.2 + ox, 5.0 + oy);
  /* 拇指外鼓 */
  c.bezierCurveTo(8.0 + ox, 4.5 + oy, 8.8 + ox, 2.3 + oy, 8.4 + ox, 0.2 + oy);
  c.bezierCurveTo(8.1 + ox, -1.6 + oy, 6.9 + ox, -2.6 + oy, 6.1 + ox, -1.9 + oy);
  /* 拇指根凹口 */
  c.bezierCurveTo(5.8 + ox, -1.1 + oy, 5.9 + ox, -3.0 + oy, 5.1 + ox, -4.7 + oy);
  /* 掌根 / 腕 */
  c.bezierCurveTo(4.3 + ox, -6.1 + oy, 2.2 + ox, -7.2 + oy, 0.0 + ox, -7.2 + oy);
  c.bezierCurveTo(-2.2 + ox, -7.2 + oy, -4.3 + ox, -7.1 + oy, -5.4 + ox, -6.6 + oy);
  c.closePath();
}

/* 小拳头（叉腰 / 数数基座） */
function arms_fistPath(c, ox, oy) {
  ox = ox || 0; oy = oy || 0;
  c.moveTo(-6.8 + ox, 0.4 + oy);
  c.bezierCurveTo(-7.1 + ox, -4.4 + oy, -4.2 + ox, -7.2 + oy, 0.0 + ox, -7.2 + oy);
  c.bezierCurveTo(4.4 + ox, -7.2 + oy, 7.1 + ox, -4.4 + oy, 7.0 + ox, 0.2 + oy);
  c.bezierCurveTo(6.9 + ox, 4.6 + oy, 4.2 + ox, 7.9 + oy, 0.0 + ox, 7.9 + oy);
  c.bezierCurveTo(-4.2 + ox, 7.9 + oy, -6.7 + ox, 4.8 + oy, -6.8 + ox, 0.4 + oy);
  c.closePath();
}

/* 手：手腕处定位、按指尖方向旋转，可选镜像拇指侧 */
function arms_drawHand(ctx, S, wr, tip, A, k, seed) {
  const fdx = tip.x - wr.x, fdy = tip.y - wr.y;
  const fl = Math.hypot(fdx, fdy) || 1;
  const fx = fdx / fl, fy = fdy / fl;
  const style = A.style || 'relax';
  const off = (style === 'point' || style === 'count') ? 2.0 : 5.0;
  const hx = wr.x + fx * off * k;
  const hy = wr.y + fy * off * k;
  const ang = Math.atan2(fy, fx) - Math.PI / 2;

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  if (A.thumb < 0) ctx.scale(-1, 1);
  const hs = (style === 'fist' || style === 'point' || style === 'count') ? 0.92 : 0.9;
  ctx.scale(k * hs, k * hs);

  const isFist = (style === 'fist' || style === 'point' || style === 'count');
  const palmUp = (style === 'palmUp');

  /* --- 手掌底色 --- */
  if (isFist) {
    ctx.beginPath();
    arms_fistPath(ctx, 0, 0);
  } else {
    ctx.beginPath();
    arms_mittenPath(ctx, 0, 0);
  }
  const skinG = ctx.createLinearGradient(-6, -7, 7, 9);
  skinG.addColorStop(0, '#fff3ec');
  skinG.addColorStop(0.55, '#ffe9df');
  skinG.addColorStop(1, '#efc8bb');
  ctx.fillStyle = skinG;
  ctx.fill();

  /* --- 手心/手背细节（裁在手掌里） --- */
  ctx.save();
  ctx.beginPath();
  if (isFist) arms_fistPath(ctx, 0, 0); else arms_mittenPath(ctx, 0, 0);
  ctx.clip();
  if (palmUp) {
    ctx.fillStyle = 'rgba(255, 250, 246, 0.85)';
    ctx.beginPath();
    ctx.ellipse(0.1, 0.2, 4.5, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 160, 148, 0.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0.1, 0.2, 4.5, 5.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    /* 手背高光 */
    ctx.fillStyle = 'rgba(255, 252, 248, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-1.6, -0.8, 3.4, 4.0, -0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  /* 手腕处一条浅浅的阴影 */
  const wg = ctx.createLinearGradient(0, -7.4, 0, -1.8);
  wg.addColorStop(0, 'rgba(214, 158, 144, 0.62)');
  wg.addColorStop(1, 'rgba(214, 158, 144, 0)');
  ctx.fillStyle = wg;
  ctx.fillRect(-8, -8, 16, 6.4);
  /* 指根小腮红 */
  const bg = ctx.createRadialGradient(0, 5.2, 0.4, 0, 5.2, 5.6);
  bg.addColorStop(0, 'rgba(244, 158, 152, 0.28)');
  bg.addColorStop(1, 'rgba(244, 158, 152, 0)');
  ctx.fillStyle = bg;
  ctx.fillRect(-7, 0, 14, 11);
  ctx.restore();

  /* --- 手指分缝 / 指节 --- */
  ctx.lineCap = 'round';
  if (!isFist) {
    ctx.strokeStyle = 'rgba(25, 27, 48, 0.32)';
    ctx.lineWidth = 1.05;
    const crease = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2 + 0.3, (y1 + y2) / 2, x2, y2);
      ctx.stroke();
    };
    crease(-3.0, 8.6, -3.0, 6.4);
    crease(0.7, 8.8, 0.6, 6.6);
    /* 拇指根 */
    ctx.strokeStyle = 'rgba(25, 27, 48, 0.22)';
    ctx.beginPath();
    ctx.moveTo(5.9, -1.4);
    ctx.quadraticCurveTo(7.1, 0.0, 6.6, 2.0);
    ctx.stroke();
    if (palmUp) {
      ctx.strokeStyle = 'rgba(230, 178, 166, 0.5)';
      ctx.beginPath();
      ctx.moveTo(-3.4, -1.6);
      ctx.quadraticCurveTo(0.0, 1.0, 3.2, -1.2);
      ctx.stroke();
    }
  } else {
    /* 指节：3 个短弧 */
    ctx.strokeStyle = 'rgba(25, 27, 48, 0.38)';
    ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * 3.1, 2.6, 1.9, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
    /* 拇指压在小拳头上 */
    ctx.save();
    ctx.translate(4.7, 1.9);
    ctx.rotate(0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.8, 4.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffefe7';
    ctx.fill();
    ctx.restore();
  }

  /* --- 点 / 数数：伸出的手指（画在拳头之上） --- */
  if (style === 'point') {
    const fingerG = ctx.createLinearGradient(1, 0, 6, 0);
    fingerG.addColorStop(0, '#fff7f2');
    fingerG.addColorStop(1, '#f5d8cd');
    ctx.beginPath();
    arms_capsulePath(ctx, { x: 2.6, y: 2.0 }, { x: 3.4, y: 16.4 }, 2.5, 2.15, { bulge: 0.2 });
    ctx.fillStyle = fingerG;
    ctx.fill();
    hbStrokePath(ctx, (c, ox, oy) =>
      arms_capsulePath(c, { x: 2.6, y: 2.0 }, { x: 3.4, y: 16.4 }, 2.5, 2.15, { bulge: 0.2, ox: ox, oy: oy }),
      INK, 1.9, seed + 11);
    /* 指甲微光 */
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(3.1, 13.9, 0.9, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'count') {
    const fingerG = ctx.createLinearGradient(-3, 0, 6, 0);
    fingerG.addColorStop(0, '#fff7f2');
    fingerG.addColorStop(1, '#f4d6cb');
    const fingers = [
      { ax: -2.0, ay: 2.4, bx: -2.9, by: 13.2, r: 2.35 },
      { ax: 2.4, ay: 2.6, bx: 3.6, by: 12.6, r: 2.3 }
    ];
    fingers.forEach((fg, i) => {
      ctx.beginPath();
      arms_capsulePath(ctx, { x: fg.ax, y: fg.ay }, { x: fg.bx, y: fg.by }, fg.r, fg.r * 0.92, { bulge: 0.15 });
      ctx.fillStyle = fingerG;
      ctx.fill();
      hbStrokePath(ctx, (c, ox, oy) =>
        arms_capsulePath(c, { x: fg.ax, y: fg.ay }, { x: fg.bx, y: fg.by }, fg.r, fg.r * 0.92, { bulge: 0.15, ox: ox, oy: oy }),
        INK, 1.85, seed + 21 + i);
    });
    ctx.strokeStyle = 'rgba(25, 27, 48, 0.35)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0.2, 9.0);
    ctx.lineTo(0.4, 6.0);
    ctx.stroke();
  }

  /* --- 手掌轮廓墨线（最后描，不会被内部细节打断） --- */
  hbStrokePath(ctx, (c, ox, oy) => {
    if (isFist) arms_fistPath(c, ox, oy); else arms_mittenPath(c, ox, oy);
  }, INK, 2.05, seed + 5);

  /* --- 拇指（拳头状态）：叠在前面的小肉垫 --- */
  if (isFist) {
    ctx.save();
    ctx.translate(4.6, 2.0);
    ctx.rotate(0.52);
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.75, 4.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff2ea';
    ctx.fill();
    ctx.restore();
    hbStrokePath(ctx, (c, ox, oy) => {
      c.save();
      c.translate(4.6 + ox, 2.0 + oy);
      c.rotate(0.52);
      c.ellipse(0, 0, 2.75, 4.3, 0, 0, Math.PI * 2);
      c.restore();
    }, INK, 1.85, seed + 7);
  }

  ctx.restore();
}

/* ==========================================================================
 * 6. 白色宽翻边袖口 + 藏青收口束带
 * ========================================================================== */

function arms_drawCuff(ctx, elbow, f, k, seed) {
  /* 局部 +y = 前臂方向（向手腕），+x = 侧向 */
  const ang = Math.atan2(f.uy, f.ux) - Math.PI / 2;
  const cxE = elbow.x + f.ux * 1.5 * k;
  const cyE = elbow.y + f.uy * 1.5 * k;

  /* 藏青收口束带（略靠肩侧，露出袖口上沿） */
  ctx.save();
  ctx.translate(elbow.x - f.ux * 3.4 * k, elbow.y - f.uy * 3.4 * k);
  ctx.rotate(ang);
  ctx.scale(k, k);
  ctx.beginPath();
  arms_rrectPath(ctx, -7.4, -3.1, 14.8, 6.2, 2.9, 0, 0);
  const bandG = ctx.createLinearGradient(-8, 0, 8, 0);
  bandG.addColorStop(0, '#141c36');
  bandG.addColorStop(0.55, '#1c2442');
  bandG.addColorStop(1, '#2b3963');
  ctx.fillStyle = bandG;
  ctx.fill();
  hbStrokePath(ctx, (c, ox, oy) => arms_rrectPath(c, -7.4, -3.1, 14.8, 6.2, 2.9, ox, oy), INK, 1.8, seed + 31);
  /* 金色细线 */
  ctx.strokeStyle = 'rgba(222, 176, 87, 0.8)';
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(-6.5, -0.5);
  ctx.quadraticCurveTo(0, 0.9, 6.5, -0.5);
  ctx.stroke();
  ctx.restore();

  /* 白色宽翻边袖口 */
  ctx.save();
  ctx.translate(cxE, cyE);
  ctx.rotate(ang);
  ctx.scale(k, k);

  const w = 8.5, yTop = -5.3, yBot = 4.7;
  const cuffPath = (c, ox, oy) => {
    c.moveTo(-w * 0.92 + ox, yTop + 1.4 + oy);
    c.bezierCurveTo(-w * 1.07 + ox, yTop - 1.8 + oy, w * 1.07 + ox, yTop - 1.8 + oy, w * 0.92 + ox, yTop + 1.4 + oy);
    c.bezierCurveTo(w * 1.09 + ox, yTop + 4.4 + oy, w * 1.03 + ox, yBot - 1.6 + oy, w * 0.99 + ox, yBot + oy);
    /* 下沿三个小扇贝 */
    c.quadraticCurveTo(w * 0.64 + ox, yBot + 2.4 + oy, w * 0.32 + ox, yBot + 0.4 + oy);
    c.quadraticCurveTo(0 + ox, yBot + 2.8 + oy, -w * 0.32 + ox, yBot + 0.4 + oy);
    c.quadraticCurveTo(-w * 0.64 + ox, yBot + 2.4 + oy, -w * 0.99 + ox, yBot + oy);
    c.bezierCurveTo(-w * 1.03 + ox, yBot - 1.8 + oy, -w * 1.09 + ox, yTop + 4.4 + oy, -w * 0.92 + ox, yTop + 1.4 + oy);
    c.closePath();
  };

  ctx.beginPath();
  cuffPath(ctx, 0, 0);
  const cuffG = ctx.createLinearGradient(0, yTop, 0, yBot + 3);
  cuffG.addColorStop(0, '#ffffff');
  cuffG.addColorStop(0.55, '#fbf8f3');
  cuffG.addColorStop(1, '#e9ecf4');
  ctx.fillStyle = cuffG;
  ctx.fill();

  /* 翻边内侧阴影 + 水彩纸感 */
  arms_washInside(ctx, (c, ox, oy) => cuffPath(c, ox, oy), seed + 41, [
    [0.5, yTop + 1.5, 7.0, 1.6, '#c9d2e4', 0.5],
    [-2.6, yBot - 0.5, 2.8, 1.9, '#d4dbe9', 0.38]
  ]);
  /* 卷边折线 */
  ctx.strokeStyle = 'rgba(120, 130, 156, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.86, yTop + 1.1);
  ctx.quadraticCurveTo(0, yTop + 3.1, w * 0.86, yTop + 1.1);
  ctx.stroke();

  hbStrokePath(ctx, (c, ox, oy) => cuffPath(c, ox, oy), INK, 2.15, seed + 43);

  /* 金线 + 小金扣 */
  ctx.strokeStyle = 'rgba(222, 176, 87, 0.9)';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(-w * 0.7, yTop + 2.7);
  ctx.quadraticCurveTo(0, yTop + 4.6, w * 0.7, yTop + 2.7);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(w * 0.56, yTop + 3.1, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(w * 0.56, yTop + 3.1, 1.3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/* ==========================================================================
 * 7. 泡泡短袖 / 前臂
 * ========================================================================== */

function arms_drawSleeve(ctx, S, sh, el, k, seed) {
  const f = arms_frame(sh, el);
  const r0 = 5.9 * k, r1 = 6.35 * k;
  const bulge = 4.15 * k;
  const mid = arms_vlerp(sh, el, 0.52);
  const lit = arms_lightSide({ x: f.nx, y: f.ny });

  /* 藏青泡泡袖 */
  ctx.beginPath();
  arms_capsulePath(ctx, sh, el, r0, r1, { bulge: bulge });
  const g = ctx.createLinearGradient(
    mid.x + lit.x * 9, mid.y + lit.y * 9,
    mid.x - lit.x * 9, mid.y - lit.y * 9
  );
  g.addColorStop(0, '#304475');
  g.addColorStop(0.5, '#283661');
  g.addColorStop(1, '#19213d');
  ctx.fillStyle = g;
  ctx.fill();

  /* 水彩晕染 + 折痕 */
  arms_washInside(ctx, (c, ox, oy) => arms_capsulePath(c, sh, el, r0, r1, { bulge: bulge, ox: ox, oy: oy }), seed + 51, [
    [mid.x + lit.x * 2, mid.y + lit.y * 2, 5.0 * k, 9.5 * k, '#4d6aa8', 0.26],
    [sh.x + f.ux * 5, sh.y + f.uy * 5, 4.6 * k, 5.4 * k, '#0f1930', 0.30]
  ]);

  /* 受光边缘的浅色水线 */
  ctx.strokeStyle = 'rgba(110, 140, 196, 0.5)';
  ctx.lineWidth = 1.5 * k;
  ctx.beginPath();
  ctx.moveTo(sh.x + lit.x * (r0 * 0.62) + f.ux * 3, sh.y + lit.y * (r0 * 0.62) + f.uy * 3);
  ctx.quadraticCurveTo(
    mid.x + lit.x * (r0 * 0.92) + f.ux * 2, mid.y + lit.y * (r0 * 0.92) + f.uy * 2,
    el.x + lit.x * (r1 * 0.66), el.y + lit.y * (r1 * 0.66)
  );
  ctx.stroke();

  /* 袖口附近的 2 道短抓褶（只在收口处，避免格纹感） */
  ctx.strokeStyle = 'rgba(13, 20, 40, 0.30)';
  ctx.lineWidth = 1.05 * k;
  [0.62, 0.80].forEach((tt, i) => {
    const p = arms_vlerp(sh, el, tt);
    const off = (i - 0.5) * 3.4 * k;
    const rr = (r0 + (r1 - r0) * tt) + Math.sin(tt * Math.PI) * bulge * 0.72;
    ctx.beginPath();
    ctx.moveTo(p.x + f.nx * (rr * 0.72) + f.ux * off, p.y + f.ny * (rr * 0.72) + f.uy * off);
    ctx.quadraticCurveTo(
      p.x + f.ux * off + f.ux * 1.2 * k, p.y + f.uy * off + f.uy * 1.2 * k,
      p.x - f.nx * (rr * 0.7) + f.ux * off, p.y - f.ny * (rr * 0.7) + f.uy * off
    );
    ctx.stroke();
  });

  /* 外轮廓：肩山处裁到躯干轮廓之外，避免在胸口压出一圈“肩甲”墨线 */
  ctx.save();
  arms_clipOutsideBody(ctx, S);
  hbStrokePath(ctx, (c, ox, oy) =>
    arms_capsulePath(c, sh, el, r0, r1, { bulge: bulge, ox: ox, oy: oy }),
    INK, 2.3, seed + 53);
  ctx.restore();

  /* 白色宽翻边袖口 */
  arms_drawCuff(ctx, el, f, k, seed);
}

function arms_drawForearm(ctx, S, el, wr, k, seed) {
  const f = arms_frame(el, wr);
  const r0 = 6.4 * k, r1 = 5.5 * k;
  const mid = arms_vlerp(el, wr, 0.5);
  const lit = arms_lightSide({ x: f.nx, y: f.ny });

  /* 关节圆（保证肘/腕处无缝隙） */
  ctx.fillStyle = S.pal.SKIN || SKIN;
  ctx.beginPath();
  ctx.arc(el.x, el.y, r0 * 0.97, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(wr.x, wr.y, r1 * 0.95, 0, Math.PI * 2);
  ctx.fill();

  /* 皮肤色前臂 */
  ctx.beginPath();
  arms_capsulePath(ctx, el, wr, r0, r1, { bulge: 0.45 * k });
  const g = ctx.createLinearGradient(
    mid.x + lit.x * 8, mid.y + lit.y * 8,
    mid.x - lit.x * 8, mid.y - lit.y * 8
  );
  g.addColorStop(0, '#fff4ee');
  g.addColorStop(0.55, '#ffeae0');
  g.addColorStop(1, '#efccc0');
  ctx.fillStyle = g;
  ctx.fill();

  /* 水彩肤色晕染 + 受光边 */
  arms_washInside(ctx, (c, ox, oy) => arms_capsulePath(c, el, wr, r0, r1, { bulge: 0.45 * k, ox: ox, oy: oy }), seed + 61, [
    [mid.x + lit.x * 2.4, mid.y + lit.y * 2.4, 2.4 * k, 7.0 * k, '#fffdfb', 0.45],
    [mid.x - lit.x * 2.0, mid.y - lit.y * 2.0, 2.2 * k, 6.4 * k, '#eec4b7', 0.42]
  ]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 1.3 * k;
  ctx.beginPath();
  ctx.moveTo(el.x + lit.x * r0 * 0.5, el.y + lit.y * r0 * 0.5);
  ctx.quadraticCurveTo(
    mid.x + lit.x * r0 * 0.75, mid.y + lit.y * r0 * 0.75,
    wr.x + lit.x * r1 * 0.5, wr.y + lit.y * r1 * 0.5
  );
  ctx.stroke();

  /* 手腕/手肘的小褶线 */
  ctx.strokeStyle = 'rgba(196, 142, 130, 0.45)';
  ctx.lineWidth = 1.05 * k;
  const t1 = 0.24, t2 = 0.82;
  const p1 = arms_vlerp(el, wr, t1);
  const p2 = arms_vlerp(el, wr, t2);
  ctx.beginPath();
  ctx.moveTo(p1.x + f.nx * r0 * 0.55, p1.y + f.ny * r0 * 0.55);
  ctx.quadraticCurveTo(p1.x + f.ux * 1.8, p1.y + f.uy * 1.8, p1.x - f.nx * r0 * 0.5, p1.y - f.ny * r0 * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p2.x + f.nx * r1 * 0.5, p2.y + f.ny * r1 * 0.5);
  ctx.quadraticCurveTo(p2.x + f.ux * 1.5, p2.y + f.uy * 1.5, p2.x - f.nx * r1 * 0.45, p2.y - f.ny * r1 * 0.45);
  ctx.stroke();

  /* 外轮廓 */
  hbStrokePath(ctx, (c, ox, oy) =>
    arms_capsulePath(c, el, wr, r0, r1, { bulge: 0.45 * k, ox: ox, oy: oy }),
    INK, 2.2, seed + 63);
}

/* ==========================================================================
 * 8. 单臂 & 主入口
 * ========================================================================== */

function arms_drawArm(ctx, S, A, behind, k, seed) {
  const sh = arms_proj(S, A.sh);
  const el = arms_proj(S, A.el);
  const wr = arms_proj(S, A.wr);
  const tip = arms_proj(S, A.tip);

  ctx.save();
  if (behind) arms_clipOutsideBody(ctx, S);

  /* 前臂 + 小手先画，泡泡袖/袖口后画以便压住肘部接缝 */
  arms_drawForearm(ctx, S, el, wr, k, seed);
  if (!A.noHand) arms_drawHand(ctx, S, wr, tip, A, k, seed + 3);
  arms_drawSleeve(ctx, S, sh, el, k, seed);

  ctx.restore();
}

function drawArms(ctx, S) {
  if (!S) return;
  const P = arms_getPose(S);
  const list = [P.L, P.R].filter(Boolean);

  /* 深度：以肘/腕的投影 z 判定远近，先画远侧 */
  list.forEach((A) => {
    const el = arms_proj(S, A.el);
    const wr = arms_proj(S, A.wr);
    A._d = (el.z + wr.z * 2) / 3;
    const dz = (el.z + wr.z) * 0.5;
    A._k = 1 + clamp(dz, -34, 46) * 0.00155;
    A._behind = A._d < -2.5;
  });
  list.sort((a, b) => a._d - b._d);

  list.forEach((A) => {
    arms_drawArm(ctx, S, A, A._behind, A._k, 120 + A.side * 13);
  });
}
