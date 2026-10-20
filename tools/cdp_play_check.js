// 真实播放验收：新声线版 MP3 能否在浏览器里推进时间轴并正确播放
// node tools/cdp_play_check.js <url>
const { spawn } = require('child_process');
const path = require('path');

const url = process.argv[2];
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9880 + Math.floor(Math.random() * 90);
const userDir = path.join(process.cwd(), 'proto', 'edge_play_' + port);

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

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true, userGesture: true, timeout: 180000
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  console.log('--- 新声线版 MP3：从 90s 起播 4 秒，观察时间轴 ---');
  console.log(await evalJS(`(async () => {
    const A = document.getElementById('amp3');
    A.currentTime = 90;
    await A.play();
    await new Promise(r => setTimeout(r, 4000));
    const out = { advancedTo: +A.currentTime.toFixed(2), paused: A.paused, readyState: A.readyState,
                  duration: +A.duration.toFixed(2), playbackRate: A.playbackRate };
    A.pause();
    return JSON.stringify(out);
  })()`));

  console.log('--- 旧母带 MP3：同样条件对照 ---');
  console.log(await evalJS(`(async () => {
    const A = new Audio('/build/audio_takes/%E8%82%A5%E9%B1%BC%E7%88%B1%E5%A4%A7%E7%B1%B3_%E6%AF%8D%E5%B8%A6%E5%8E%9F%E5%A3%B0.mp3');
    A.preload = 'auto';
    document.body.appendChild(A);
    await new Promise(r => A.addEventListener('canplay', r, { once: true }));
    A.currentTime = 90;
    await A.play();
    await new Promise(r => setTimeout(r, 4000));
    const out = { advancedTo: +A.currentTime.toFixed(2), paused: A.paused, readyState: A.readyState,
                  duration: +A.duration.toFixed(2) };
    A.pause();
    return JSON.stringify(out);
  })()`));

  ws.close();
  try { edge.kill(); } catch (e) {}
  process.exit(0);
})();
