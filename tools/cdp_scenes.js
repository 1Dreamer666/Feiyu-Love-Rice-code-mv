// 多时间点截图：node tools/cdp_scenes.js <fileUrl> <outPrefix> <t1,t2,...> [w] [h]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const fileUrl = process.argv[2];
const outPrefix = process.argv[3];
const times = (process.argv[4] || '2,40,96,130,180,245,275').split(',').map(Number);
const W = parseInt(process.argv[5] || '1920', 10);
const H = parseInt(process.argv[6] || '1080', 10);

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9600 + Math.floor(Math.random() * 300);
const userDir = path.join(process.cwd(), 'proto', 'edge_cdps_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + userDir,
  '--window-size=' + W + ',' + H,
  '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list');
      const list = await res.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch (e) { }
    await sleep(250);
  }
  throw new Error('no target');
}

(async () => {
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push(m.params.entry.text);
    }
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: fileUrl });

  // 等按钮出现
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const r = await send('Runtime.evaluate', {
      expression: `!!document.querySelector('#btn-overlay-start')`, returnByValue: true
    });
    if (r.result.value) { ready = true; break; }
    await sleep(500);
  }
  if (!ready) { console.log(JSON.stringify({ fatal: 'button never appeared', errors })); process.exit(1); }

  await send('Runtime.evaluate', { expression: `document.querySelector('#btn-overlay-start').click(); 'clicked'`, returnByValue: true });
  await sleep(2500);

  const shots = [];
  for (const t of times) {
    await send('Runtime.evaluate', {
      expression: `(()=>{const a=document.querySelector('#master-native-audio'); if(a){a.pause(); a.currentTime=${t};} return a? a.currentTime : null;})()`,
      returnByValue: true
    });
    await sleep(900);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const fn = outPrefix + '_' + String(t).replace('.', 'p') + '.png';
    fs.writeFileSync(fn, Buffer.from(shot.data, 'base64'));
    shots.push(fn);
  }

  const st = await send('Runtime.evaluate', {
    expression: `(()=>{const a=document.querySelector('#master-native-audio');const c=document.querySelector('canvas');return {audio:a?{paused:a.paused,t:a.currentTime,dur:a.duration,ready:a.readyState}:null,canvas:c?[c.width,c.height]:null};})()`,
    returnByValue: true
  });
  console.log(JSON.stringify({ errors: errors.slice(0, 10), shots, status: st.result.value }, null, 2));
  ws.close(); edge.kill();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('FATAL', e.message); try { edge.kill(); } catch (_) {} process.exit(1); });
