// 真实 file:// 条件下（不带 --allow-file-access-from-files）完整导出并落盘，用于验证音频是否真的进了 MP4
// node tools/cdp_export_real.js <url> <outMp4> <start> <end>
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const out = process.argv[3];
const startT = parseFloat(process.argv[4] || '0');
const endT = parseFloat(process.argv[5] || '6');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9950 + Math.floor(Math.random() * 40);
const userDir = path.join(process.cwd(), 'proto', 'edge_real_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  // 不加 --allow-file-access-from-files，模拟用户双击打开
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--window-size=1920,1080', '--force-device-scale-factor=1',
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
  const errs = [];
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
    } else if (m.method === 'Runtime.exceptionThrown') {
      errs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(6000);

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true,
      userGesture: true, timeout: 1800000
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  const t0 = Date.now();
  try {
    const resStr = await evalJS(`(async () => {
      try {
        const r = await window.__exportMP4({
          start: ${startT}, end: ${endT}, width: 1920, height: 1080,
          includeAudio: true, audioFile: null,
          onProgress: (p) => { window.__lastMsg = p.message || ''; }
        });
        const buf = new Uint8Array(await r.blob.arrayBuffer());
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < buf.length; i += CH) {
          bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
        }
        return JSON.stringify({
          bytes: r.bytes, frames: r.frames,
          audioSkipped: r.audioSkipped || null,
          b64: btoa(bin)
        });
      } catch (e) { return 'ERR ' + (e && e.stack ? e.stack : e); }
    })()`);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (typeof resStr !== 'string' || resStr.startsWith('ERR')) {
      console.log('EXPORT FAILED:', resStr);
    } else {
      const r = JSON.parse(resStr);
      fs.writeFileSync(out, Buffer.from(r.b64, 'base64'));
      console.log('RESULT ' + JSON.stringify({
        bytes: r.bytes, frames: r.frames, audioSkipped: r.audioSkipped
      }));
      console.log('SAVED ' + out + ' (' + fs.statSync(out).size + ' bytes)');
    }
    console.log('ELAPSED ' + elapsed + 's');
  } catch (e) {
    console.log('TEST ERROR:', e.message);
  }
  if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(-10).join('\n'));

  ws.close();
  try { edge.kill(); } catch (e) {}
  process.exit(0);
})();
