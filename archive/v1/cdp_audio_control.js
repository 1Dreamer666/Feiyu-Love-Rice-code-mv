// 音频解码对照测试：已知可用的旧母带 vs 新声线版
// node tools/cdp_audio_control.js <url>
const { spawn } = require('child_process');
const path = require('path');

const url = process.argv[2];
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9970 + Math.floor(Math.random() * 100);
const userDir = path.join(process.cwd(), 'proto', 'edge_ctl_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let target = null;
  for (let i = 0; i < 100; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = l.find((t) => t.type === 'page');
      if (target) break;
    } catch (e) {}
    await sleep(200);
  }
  if (!target) { console.log('FAIL: no target'); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (m, p) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(4000);

  const r = await send('Runtime.evaluate', {
    expression: '(async () => JSON.stringify(await window.__tryAll(), null, 1))()',
    awaitPromise: true, returnByValue: true, timeout: 180000
  });
  console.log(r.exceptionDetails ? 'ERR ' + r.exceptionDetails.text : r.result.value);

  ws.close();
  try { edge.kill(); } catch (e) {}
  process.exit(0);
})();
