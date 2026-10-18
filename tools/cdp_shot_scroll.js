// 打开页面并滚动到指定位置截图（用于验证 README 中段）
// node tools/cdp_shot_scroll.js <url> <outPng> <scrollY> [waitMs]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const out = process.argv[3];
const scrollY = parseInt(process.argv[4] || '900', 10);
const waitMs = parseInt(process.argv[5] || '9000', 10);

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9350 + Math.floor(Math.random() * 80);
const userDir = path.join(process.cwd(), 'build', 'edge_scroll_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--window-size=1280,1500', '--force-device-scale-factor=1',
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let target = null;
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) {}
    await sleep(200);
  }
  if (!target) { console.log('FAIL'); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (m, p) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method: m, params: p || {} }));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(waitMs);

  // 先滚到底部触发懒加载，再回到目标位置
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)', returnByValue: true });
  await sleep(2000);
  await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${scrollY})`, returnByValue: true });
  await sleep(2500);

  const info = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ y: Math.round(window.scrollY), imgs: Array.from(document.images).filter(i=>i.src.includes('docs/images')||i.src.includes('images/')).map(i=>({s:i.currentSrc.split('/').pop(), ok:i.complete&&i.naturalWidth>0})) })`,
    returnByValue: true
  });
  console.log('INFO:', info.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SHOT', out, fs.statSync(out).size);

  ws.close();
  try { edge.kill(); } catch (e) {}
  process.exit(0);
})();
