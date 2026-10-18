// 在真实页面里调用 __exportMP4 导出，并把结果 blob 存盘
// node tools/cdp_export.js <url> <outMp4> <start> <end> [w] [h]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const out = process.argv[3];
const startT = parseFloat(process.argv[4] || '0');
const endT = parseFloat(process.argv[5] || '6');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9700 + Math.floor(Math.random() * 200);
const userDir = path.join(process.cwd(), 'proto', 'edge_exp_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--window-size=1920,1080', '--force-device-scale-factor=1',
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
  let id = 0; const pending = new Map(); const errors = []; const logs = [];
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
    } else if (m.method === 'Runtime.consoleAPICalled') {
      logs.push((m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push(m.params.entry.text);
    }
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate', { url });

  // 等 p5 初始化
  for (let i = 0; i < 80; i++) {
    const r = await send('Runtime.evaluate', {
      expression: `typeof window.__exportMP4 === 'function' && !!document.querySelector('canvas')`, returnByValue: true
    });
    if (r.result.value) break;
    await sleep(400);
  }

  console.log('EXPORT', startT, '->', endT);
  const t0 = Date.now();
  const r = await send('Runtime.evaluate', {
    expression: `(async () => {
      try {
        const res = await window.__exportMP4({
          start: ${startT}, end: ${endT}, width: 1920, height: 1080, includeAudio: true,
          onProgress: (p) => { window.__LAST_PROGRESS = p; }
        });
        window.__EXPORT_BLOB = res.blob;
        return { ok: true, bytes: res.bytes, frames: res.frames, audioSkipped: res.audioSkipped || null };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    })()`,
    awaitPromise: true, returnByValue: true, timeout: 900000
  });
  console.log('RESULT', JSON.stringify(r.result && r.result.value));
  console.log('ELAPSED', ((Date.now() - t0) / 1000).toFixed(1) + 's');

  const r2 = await send('Runtime.evaluate', {
    expression: `(async()=>{const b=window.__EXPORT_BLOB; if(!b) return null;
      const ab=await b.arrayBuffer(); const bytes=new Uint8Array(ab);
      let s=''; const CH=0x8000;
      for(let i=0;i<bytes.length;i+=CH){ s+=String.fromCharCode.apply(null,bytes.subarray(i,i+CH)); }
      return btoa(s);})()`,
    awaitPromise: true, returnByValue: true, timeout: 300000
  });
  if (r2.result && r2.result.value) {
    const buf = Buffer.from(r2.result.value, 'base64');
    fs.writeFileSync(out, buf);
    console.log('WROTE', out, buf.length);
  } else {
    console.log('NO BLOB');
  }
  console.log('ERRORS', JSON.stringify(errors.slice(0, 8)));
  console.log('LOGS', JSON.stringify(logs.slice(-12)));
  ws.close(); edge.kill();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('FATAL', e.message); try { edge.kill(); } catch (_) { } process.exit(1); });
