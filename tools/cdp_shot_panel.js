// 真实 file:// 条件下打开导出面板并截图，用于视觉验收
// node tools/cdp_shot_panel.js <url> <outPng>
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const out = process.argv[3];

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9900 + Math.floor(Math.random() * 40);
const userDir = path.join(process.cwd(), 'proto', 'edge_panel_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--window-size=1600,1000', '--force-device-scale-factor=1',
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
  await sleep(6000);

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true, userGesture: true, timeout: 120000
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  console.log(await evalJS(`(async () => {
    document.getElementById('btn-export-mp4').click();
    await new Promise(r => setTimeout(r, 5000));
    return JSON.stringify({
      audioText: document.getElementById('export-audio-name').textContent.trim(),
      start: document.getElementById('export-start').value,
      end: document.getElementById('export-end').value,
      res: document.getElementById('export-res').value
    });
  })()`));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SHOT ' + out + ' (' + fs.statSync(out).size + ' bytes)');

  ws.close();
  try { edge.kill(); } catch (e) {}
  process.exit(0);
})();
