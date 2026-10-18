// 在真实页面里执行任意 JS 表达式（从文件读取，避免命令行引号问题）
// node tools/cdp_eval.js <url> <exprFile.js>
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const exprFile = process.argv[3];
const expr = fs.readFileSync(exprFile, 'utf8');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9600 + Math.floor(Math.random() * 60);
const userDir = path.join(process.cwd(), 'proto', 'edge_eval_' + port);

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

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(6000);

  const r = await send('Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true,
    userGesture: true, timeout: 600000
  });
  if (r.exceptionDetails) {
    console.log('EXCEPTION: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  } else {
    console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 2));
  }

  ws.close();
  try { edge.kill(); } catch (e) {}
  process.exit(0);
})();
