// 在真实浏览器里验证「Let Me Go 声线版」音频：时长、分段响度、能否实际播放推进。
// node tools/cdp_audio_verify.js <url>
const { spawn } = require('child_process');
const path = require('path');

const url = process.argv[2];
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9960 + Math.floor(Math.random() * 120);
const userDir = path.join(process.cwd(), 'proto', 'edge_aud_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--window-size=1280,720', '--no-first-run', '--no-default-browser-check', 'about:blank'
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
  await sleep(5000);

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true, userGesture: true, timeout: 300000
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  console.log('--- 1) WAV 解码 + 分段响度 ---');
  try {
    console.log(await evalJS('(async () => JSON.stringify(await window.__probe(), null, 1))()'));
  } catch (e) { console.log('decodeAudioData 不可用（headless 无音频设备），跳过：' + e.message); }

  console.log('--- 2) MP3 媒体信息 ---');
  console.log(await evalJS('JSON.stringify(window.__mp3info())'));

  console.log('--- 3) MP3 真实播放，看时间轴是否推进 ---');
  console.log(await evalJS('(async () => JSON.stringify(await window.__play(document.getElementById("amp3"), 90, 3)))()'));

  console.log('--- 4) WAV 真实播放 ---');
  console.log(await evalJS('(async () => JSON.stringify(await window.__play(document.getElementById("awav"), 90, 3)))()'));

  ws.close();
  try { edge.kill(); } catch (e) {}
  process.exit(0);
})();
