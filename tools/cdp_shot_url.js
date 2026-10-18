// 打开 GitHub 仓库页面并截图，验证 README 图片是否正常渲染
// node tools/cdp_shot_url.js <url> <outPng> [waitMs] [fullPage]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const out = process.argv[3];
const waitMs = parseInt(process.argv[4] || '6000', 10);
const fullPage = process.argv[5] === 'full';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9200 + Math.floor(Math.random() * 100);
const userDir = path.join(process.cwd(), 'build', 'edge_url_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--window-size=1280,1400', '--force-device-scale-factor=1',
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
  if (!target) { console.log('FAIL: no target'); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
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

  // 滚动触发懒加载
  await send('Runtime.evaluate', {
    expression: 'window.scrollTo(0, 0); document.body.scrollHeight',
    returnByValue: true
  });
  await sleep(1500);
  await send('Runtime.evaluate', {
    expression: 'window.scrollTo(0, 900)',
    returnByValue: true
  });
  await sleep(2000);
  await send('Runtime.evaluate', {
    expression: 'window.scrollTo(0, 0)',
    returnByValue: true
  });
  await sleep(1500);

  // 检查图片是否真的加载成功
  const imgInfo = await send('Runtime.evaluate', {
    expression: `JSON.stringify(Array.from(document.images).slice(0, 12).map(i => ({
      src: i.currentSrc.split('/').slice(-2).join('/'),
      w: i.naturalWidth, h: i.naturalHeight, ok: i.complete && i.naturalWidth > 0
    })))`,
    returnByValue: true
  });
  console.log('IMAGES:', imgInfo.result.value);

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: fullPage
  });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SHOT', out, fs.statSync(out).size, 'bytes');

  ws.close();
  try { edge.kill(); } catch (e) {}
  process.exit(0);
})();
