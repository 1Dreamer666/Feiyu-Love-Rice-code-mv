/* ============================================================================
 * 肥鱼爱大米 · 角色部件工作台共享工具库 (proto/parts/00_util.js)
 * 坐标系：角色本地坐标，原点 (0,0) = 头部中心（约两眼连线略上方）
 *        x 向右为正，y 向下为正。脸部大致 y ∈ [-56, +50]，身体 y ∈ [+40, +145]
 * 所有部件函数都接收 (ctx, S)，S 由 makeFishState() 生成。
 * ========================================================================== */

const INK = '#191b30';
const HAIR_DARK = '#253464';
const HAIR_MID = '#3c61ae';
const HAIR_BRIGHT = '#629be4';
const HAIR_TIP = '#92cbf9';
const HAIR_LIGHT = '#a8d6fb';
const DRESS_NAVY = '#1c2442';
const DRESS_MID = '#283661';
const GOLD = '#deb057';
const GOLD_DARK = '#b07e2c';
const GOLD_LIGHT = '#f2d491';
const CREAM = '#fbf8f3';
const RUFFLE_SHADOW = '#dfe5f2';
const SKIN = '#fff1ea';
const SKIN_SHADOW = '#f6d9cf';
const BLUSH = '#f58b95';
const BOW_BLUE = '#5ba7ee';
const BOW_BLUE_DARK = '#2f6fbf';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerpVal(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / ((e1 - e0) || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}
function detHash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
function detNoise1D(x, seed = 0) {
  const xi = Math.floor(x);
  const xf = x - xi;
  const u = xf * xf * (3.0 - 2.0 * xf);
  const a = detHash(xi + seed * 57.0);
  const b = detHash(xi + 1 + seed * 57.0);
  return a + (b - a) * u;
}

/* 水彩晕染块：三层叠加、天然毛边 */
function wcWashBlob(ctx, cx, cy, rx, ry, hexColor, alpha = 0.45, seed = 1, rot = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  const steps = 24;
  for (let pass = 0; pass < 3; pass++) {
    const scalePass = 1 + (2 - pass) * 0.07;
    ctx.globalAlpha = clamp(alpha * (pass === 0 ? 0.24 : pass === 1 ? 0.44 : 0.68), 0, 1);
    ctx.fillStyle = hexColor;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      const n = detNoise1D(i * 0.7 + pass * 3.1, seed) * 0.14 + 0.93;
      const px = Math.cos(theta) * rx * scalePass * n;
      const py = Math.sin(theta) * ry * scalePass * n;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* 双描边墨水线：主线 + 偏移淡线，模拟手绘铅笔抖动 */
function hbStrokePath(ctx, drawPathFn, color = INK, weight = 2.5, seed = 1) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.globalAlpha = 0.94;
  ctx.beginPath();
  drawPathFn(ctx, 0, 0);
  ctx.stroke();
  const ox = (detHash(seed * 17.3) - 0.5) * 1.1;
  const oy = (detHash(seed * 29.1) - 0.5) * 1.1;
  ctx.lineWidth = weight * 0.52;
  ctx.globalAlpha = 0.38;
  ctx.beginPath();
  drawPathFn(ctx, ox, oy);
  ctx.stroke();
  ctx.restore();
}

/* ---------------------------------------------------------------- 状态模型 */
function makeFishState(o = {}) {
  let yawDeg = 0;
  if (typeof o.yaw === 'number') yawDeg = o.yaw;
  else if (o.view === 'side') yawDeg = -78;
  else if (o.view === 'back') yawDeg = 180;
  else if (o.view === 'threeQuarter') yawDeg = 28;
  else yawDeg = Math.sin((o.t || 0) * 1.15) * 14;

  const radYaw = (yawDeg * Math.PI) / 180;
  const sinY = Math.sin(radYaw);
  const cosY = Math.cos(radYaw);
  const pitch = o.pitch || 0;
  const pitchRad = (pitch * Math.PI) / 180;
  const t = o.t || 0;
  const mouth = o.mouth || { openness: 0, vowel: 'closed' };
  const singBeat = mouth.openness > 0.05 ? Math.sin(t * 7.2) * 3.2 : 0;

  return {
    yaw: yawDeg, sinY, cosY, radYaw,
    pitch, pitchRad,
    profile: clamp(Math.abs(yawDeg) / 90, 0, 1.35),
    sideProfileFactor: Math.abs(sinY),
    isBack: Math.abs(yawDeg) > 115,
    faceShiftX: sinY * 22,
    expr: o.expr || 'normal',
    pose: o.pose || 'stand',
    t,
    breath: Math.sin(t * 2.8) * 2.4 + singBeat * 0.4,
    singBeat,
    walkBob: o.walkPhase ? Math.abs(Math.sin(o.walkPhase)) * -8 : 0,
    hairWave1: Math.sin(t * 2.2 + 0.4) * 3.8,
    hairWave2: Math.cos(t * 1.8 - 0.5) * 4.5,
    tailAngle: Math.sin(t * ((o.expr === 'sparkle' || o.expr === 'happy' || o.pose === 'eureka') ? 6.4 : 2.7)) *
      ((o.expr === 'sparkle' || o.expr === 'happy' || o.pose === 'eureka') ? 0.22 : 0.10),
    finFlap: Math.sin(t * ((o.expr === 'pout') ? 6.8 : 2.5)) * 0.09,
    ahogeBounce: Math.sin(t * 4.4) * 0.08 + (o.expr === 'sparkle' ? -0.14 : 0),
    mouth,
    isBlinking: ((t + 1.3) % 4.2) > 4.04 && o.expr !== 'sparkle' && o.expr !== 'pout',
    isExcited: (o.expr === 'sparkle' || o.expr === 'happy' || o.pose === 'eureka' || o.pose === 'shareRice' || mouth.openness > 0.2),
    lookX: o.lookX || 0,
    lookY: o.lookY || 0,
    flipX: !!o.flipX,
    walkPhase: o.walkPhase || 0,
    pal: { INK, HAIR_DARK, HAIR_MID, HAIR_BRIGHT, HAIR_TIP, HAIR_LIGHT, DRESS_NAVY, DRESS_MID, GOLD, GOLD_DARK, GOLD_LIGHT, CREAM, RUFFLE_SHADOW, SKIN, SKIN_SHADOW, BLUSH, BOW_BLUE, BOW_BLUE_DARK }
  };
}

/* 脸部特征点的 2.5D 投影：先俯仰(pitch)再偏航(yaw)。
 * 输入 (x,y,z) 为头部球面坐标：x 右正, y 下正, z 朝向观察者为正。
 * 返回 {x, y, z, k}，k 为近大远小透视系数；z <= 0 表示转到脑后不可见。*/
function projFace(S, x, y, z) {
  const cy = Math.cos(S.pitchRad), sy = Math.sin(S.pitchRad);
  const y1 = y * cy - z * sy;
  const z1 = y * sy + z * cy;
  const x1 = x * S.cosY + z1 * S.sinY;
  const z2 = -x * S.sinY + z1 * S.cosY;
  return { x: x1, y: y1, z: z2, k: 150 / (150 + Math.max(-70, z2) * 0.55) };
}

/* 头部椭球轮廓在给定 yaw 下的近似半宽（供发丝/配饰定位用） */
function headHalfWidth(S, y = 0) {
  const rx = 54;
  return rx * (0.78 + 0.22 * Math.abs(S.cosY));
}

/* 全角色统一比例锚点（依据三视图重新标定；所有部件必须遵守） */
const FISH = {
  faceHalfW: 42,        // 脸颊最宽处半宽
  faceTop: -58,         // 额头最高点（被刘海覆盖）
  chinY: 54,            // 下巴最低点
  eyeY: 4,              // 眼睛中心 y
  eyeX: 21,             // 单眼中心 x（左右对称）
  eyeW: 18, eyeH: 19,   // 眼睛半宽/半高
  browY: -22,
  noseY: 22,
  mouthY: 37,
  neckTop: 50, neckBot: 66,
  shoulderY: 70,
  waistY: 98,
  skirtHemY: 146,
  hipY: 108,
  feetY: 172,
  hairHalfW: 86,        // 头发最宽半宽
  hairTop: -112,        // 头发最高点
  ahogeTop: -150,
  headR: { rx: 47, ry: 58, rz: 52, faceZ: 50 }
};

/* 便捷：镜像绘制（sign=-1 左, +1 右） */
function withMirror(ctx, sign, fn) {
  ctx.save();
  ctx.scale(sign, 1);
  fn();
  ctx.restore();
}
