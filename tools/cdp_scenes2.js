// 多时间点截图（用应用内部跳转 API）：node tools/cdp_scenes2.js <url> <outPrefix> <t1,t2,...>
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const fileUrl = process.argv[2];
const outPrefix = process.argv[3];
const times = (process.argv[4] || '92,212,244').split(',').map(Number);
const W = 1920, H = 1080;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9900 + Math.floor(Math.random() * 200);
const userDir = path.join(process.cwd(), 'proto', 'edge_s2_' + port);

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
  await send('Page.navigate', { url: fileUrl });

  let ok = false;
  for (let i = 0; i < 80; i++) {
    const r = await send('Runtime.evaluate', {
      expression: `typeof window.jumpToStanzaAndPlay === 'function'`, returnByValue: true
    });
    if (r.result.value) { ok = true; break; }
    await sleep(400);
  }
  if (!ok) { console.log(JSON.stringify({ fatal: 'jumpToStanzaAndPlay not ready', errors })); process.exit(1); }

  const shots = [];
  for (const t of times) {
    await send('Runtime.evaluate', { expression: `window.jumpToStanzaAndPlay(${t}); 'ok'`, returnByValue: true });
    await sleep(1400);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const fn = outPrefix + '_' + String(t).replace('.', 'p') + '.png';
    fs.writeFileSync(fn, Buffer.from(shot.data, 'base64'));
    shots.push(fn);
    const st = await send('Runtime.evaluate', {
      expression: `(()=>{const a=document.querySelector('#master-native-audio');return a?{t:a.currentTime,paused:a.paused}:null;})()`,
      returnByValue: true
    });
    console.log('t=' + t + ' audio=' + JSON.stringify(st.result.value));
  }
  console.log(JSON.stringify({ errors: errors.slice(0, 8), shots }, null, 2));
  ws.close(); edge.kill();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('FATAL', e.message); try { edge.kill(); } catch (_) {} process.exit(1); });
