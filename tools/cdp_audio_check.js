// 在「真实双击 file://」条件下（不带 --allow-file-access-from-files）验证母带音频能否零点击自动获取
// node tools/cdp_audio_check.js <url>
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const url = process.argv[2];
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9800 + Math.floor(Math.random() * 150);
const userDir = path.join(process.cwd(), 'proto', 'edge_audio_' + port);

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  // 故意不加 --allow-file-access-from-files，模拟用户双击打开
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--window-size=1280,720', '--force-device-scale-factor=1',
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
  const logs = [];
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
    } else if (m.method === 'Runtime.consoleAPICalled') {
      logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      logs.push('EXC: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
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
      userGesture: true, timeout: 120000
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  try {
    console.log('--- 1) 页面是否加载 ---');
    console.log(await evalJS(`JSON.stringify({
      hasExport: typeof window.__exportMP4 === 'function',
      supported: typeof window.__exportSupported === 'function' ? window.__exportSupported() : null,
      masterAudioUrl: (window.audioEngine && window.audioEngine.masterAudioUrl) || null,
      hasSidecarGlobal: !!window.__MASTER_AUDIO_B64
    })`));

    console.log('--- 2) fetch 母带是否被拦（应为 true=被拦）---');
    console.log(await evalJS(`(async () => {
      try { const r = await fetch('肥鱼爱大米_母带原声.mp3'); return 'ok ' + r.status; }
      catch (e) { return 'blocked: ' + e.message; }
    })()`));

    console.log('--- 3) 零点击自动获取母带（走 sidecar 懒加载）---');
    const t0 = Date.now();
    console.log(await evalJS(`(async () => {
      try {
        const auto = await autoMasterAudio();
        return JSON.stringify({ from: auto.from, bytes: auto.ab ? auto.ab.byteLength : 0 });
      } catch (e) { return 'ERR ' + e.message; }
    })()`));
    console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1) + 's');

    console.log('--- 4) 解码成 AudioBuffer ---');
    console.log(await evalJS(`(async () => {
      try {
        const buf = await decodeMasterAudio(null, () => {});
        return JSON.stringify({ dur: +buf.duration.toFixed(3), sr: buf.sampleRate, ch: buf.numberOfChannels });
      } catch (e) { return 'ERR ' + e.message; }
    })()`));

    console.log('--- 5) 面板音频状态文案 ---');
    console.log(await evalJS(`(async () => {
      document.getElementById('btn-export-mp4').click();
      await new Promise(r => setTimeout(r, 4000));
      return JSON.stringify({
        text: document.getElementById('export-audio-name').textContent.trim(),
        cls: document.getElementById('export-audio-name').className
      });
    })()`));
  } catch (e) {
    console.log('TEST ERROR:', e.message);
  }

  if (logs.length) console.log('--- console ---\n' + logs.slice(-25).join('\n'));
  ws.close();
  try { edge.kill(); } catch (e) {}
  process.exit(0);
})();
