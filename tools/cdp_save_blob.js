// 导出 MP4 并通过 CDP 抓取 base64 存盘
// 用法: node tools/cdp_save_blob.js <url> <outMp4> <evalJs> [w] [h] [waitMs]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const out = process.argv[3];
const evalJs = process.argv[4] || 'window.__BLOB__';
const W = parseInt(process.argv[5] || '1280', 10);
const H = parseInt(process.argv[6] || '720', 10);
const waitMs = parseInt(process.argv[7] || '30000', 10);

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9500 + Math.floor(Math.random() * 300);
const userDir = path.join(process.cwd(), 'proto', 'edge_blob_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--window-size=' + W + ',' + H, '--force-device-scale-factor=1',
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let target;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      target = list.find(t => t.type === 'page');
      if (target) break;
    } catch (e) { }
    await sleep(250);
  }
  if (!target) throw new Error('no target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  const send = (m, p = {}) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method: m, params: p }));
  });
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push(m.params.entry.text);
    }
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate', { url });

  // 等待导出完成
  let result = null;
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    const r = await send('Runtime.evaluate', { expression: evalJs, returnByValue: true, awaitPromise: true });
    const v = r.result && r.result.value;
    if (v && v.ok !== undefined) { result = v; if (v.ok) break; else break; }
    if (v && v.size) { result = v; break; }
    await sleep(800);
  }
  console.log('RESULT', JSON.stringify(result));

  // 取 base64
  const r2 = await send('Runtime.evaluate', {
    expression: `(async()=>{const b=${evalJs}; if(!b) return null;
      const ab = await b.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let s=''; const CH=0x8000;
      for(let i=0;i<bytes.length;i+=CH){ s += String.fromCharCode.apply(null, bytes.subarray(i,i+CH)); }
      return btoa(s);})()`,
    returnByValue: true, awaitPromise: true
  });
  if (r2.result && r2.result.value) {
    const buf = Buffer.from(r2.result.value, 'base64');
    fs.writeFileSync(out, buf);
    console.log('WROTE', out, buf.length, 'bytes');
  } else {
    console.log('NO BLOB');
  }
  console.log('ERRORS', JSON.stringify(errors.slice(0, 6)));
  ws.close(); edge.kill();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('FATAL', e.message); try { edge.kill(); } catch (_) { } process.exit(1); });
