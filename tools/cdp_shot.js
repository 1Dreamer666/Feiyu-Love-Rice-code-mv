// Headless Edge CDP 截图 + 控制台异常采集
// 用法: node tools/cdp_shot.js <fileUrl> <outPng> [waitMs] [evalJs] [width] [height]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const fileUrl = process.argv[2];
const outPng = process.argv[3];
const waitMs = parseInt(process.argv[4] || '4000', 10);
const evalJs = process.argv[5] || '';
const W = parseInt(process.argv[6] || '1920', 10);
const H = parseInt(process.argv[7] || '1080', 10);

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9300 + Math.floor(Math.random() * 300);
const userDir = path.join(process.cwd(), 'proto', 'edge_cdp_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + userDir,
  '--window-size=' + W + ',' + H,
  '--force-device-scale-factor=1',
  '--no-first-run', '--no-default-browser-check',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list');
      const list = await res.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch (e) { }
    await sleep(250);
  }
  throw new Error('CDP target not found');
}

(async () => {
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const logs = [];

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text || 'unknown exception');
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type));
      logs.push(msg.params.type + ': ' + args.join(' '));
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') errors.push(e.text + (e.url ? ' @' + e.url : ''));
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: fileUrl });
  await sleep(1200);

  if (evalJs) {
    try {
      const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        errors.push('EVAL: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      } else if (r.result && r.result.value !== undefined) {
        logs.push('EVAL_RESULT: ' + JSON.stringify(r.result.value));
      }
    } catch (e) {
      errors.push('EVAL_ERR: ' + e.message);
    }
  }

  await sleep(waitMs);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));

  // 额外状态
  let status = {};
  try {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const c = document.querySelector('canvas');
        const a = document.querySelector('#master-native-audio');
        return {
          canvas: c ? [c.width, c.height] : null,
          audio: a ? { src: a.getAttribute('src'), ready: a.readyState, dur: a.duration, t: a.currentTime, paused: a.paused, vol: a.volume, err: a.error && a.error.code } : null,
          frame: window.__lastFrameTime || null
        };
      })()`, returnByValue: true
    });
    status = r.result.value;
  } catch (e) { status = { error: e.message }; }

  console.log(JSON.stringify({ errors, logs: logs.slice(-40), status }, null, 2));
  ws.close();
  edge.kill();
  setTimeout(() => process.exit(0), 300);
})().catch(e => {
  console.error('FATAL', e.message);
  try { edge.kill(); } catch (_) { }
  process.exit(1);
});
