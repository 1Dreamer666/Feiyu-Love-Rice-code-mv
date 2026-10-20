// Record what the Suno player actually decodes, using HTMLMediaElement.captureStream + MediaRecorder.
// Real-time. Saves webm/opus to disk.
// node tools/cdp_record.js <songUrl> <outPath> [maxSeconds]
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const songUrl = process.argv[2];
  const outPath = path.resolve(process.argv[3]);
  const maxSec = parseFloat(process.argv[4] || '260');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const list = await (await fetch(`${BASE}/json/list`)).json();
  const pages = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  const t = pages.find((p) => p.url.includes('suno.com')) || pages[0];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (m, p) =>
    new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method: m, params: p || {} }));
    });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  };
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });

  const ev = async (expr, awaitP = false) => {
    const r = await send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: awaitP,
      returnByValue: true,
      userGesture: true,
      timeout: 900000,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  };

  // 1) navigate
  await send('Page.enable');
  await send('Page.navigate', { url: songUrl });
  console.log('navigating...');
  await sleep(10000);

  // 2) wait for an audio element with a real duration
  let dur = 0;
  for (let i = 0; i < 40; i++) {
    dur = await ev(`(() => { const a = document.querySelector('audio'); return a && isFinite(a.duration) ? a.duration : 0; })()`);
    if (dur > 5) break;
    await sleep(1000);
  }
  console.log('audio duration = ' + dur);
  if (!(dur > 5)) {
    console.log('NO PLAYABLE AUDIO ELEMENT');
    process.exit(1);
  }

  // 3) start MediaRecorder on captureStream
  const started = await ev(`(async () => {
    const a = document.querySelector('audio');
    if (!a) return 'no el';
    if (!a.captureStream) return 'no captureStream';
    const stream = a.captureStream();
    const mime = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 });
    window.__mrChunks = [];
    window.__mrDone = false;
    window.__mrMime = mr.mimeType;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) window.__mrChunks.push(e.data); };
    mr.onstop = () => { window.__mrDone = true; };
    mr.start(1000);
    window.__mr = mr;
    window.__recEl = a;
    a.currentTime = 0;
    await a.play().catch(e => {});
    return 'recording mime=' + mr.mimeType + ' tracks=' + stream.getAudioTracks().length;
  })()`, true);
  console.log(started);

  // 4) poll progress
  const t0 = Date.now();
  let lastLog = 0;
  while ((Date.now() - t0) / 1000 < maxSec + 30) {
    await sleep(3000);
    const st = await ev(`(() => { const a = window.__recEl; return JSON.stringify({t: a ? a.currentTime : -1, d: a ? a.duration : -1, chunks: window.__mrChunks ? window.__mrChunks.length : 0, done: !!window.__mrDone}); })()`);
    const s = JSON.parse(st);
    const el = (Date.now() - t0) / 1000;
    if (el - lastLog > 20) {
      console.log(`[${el.toFixed(0)}s] played=${s.t.toFixed(1)}/${s.d.toFixed(1)} chunks=${s.chunks}`);
      lastLog = el;
    }
    if (s.t >= s.d - 1.5 || s.done) break;
  }

  // 5) stop and pull bytes in chunks
  await ev(`(() => { try { window.__mr.stop(); } catch(e){} return 1; })()`);
  await sleep(2500);

  const meta = JSON.parse(await ev(`(() => JSON.stringify({done: !!window.__mrDone, n: window.__mrChunks.length, mime: window.__mrMime}))()`));
  console.log('stopped: ' + JSON.stringify(meta));
  if (!meta.n) {
    console.log('NO CHUNKS RECORDED');
    process.exit(1);
  }

  const total = await ev(`(() => { window.__blob = new Blob(window.__mrChunks, {type: window.__mrMime}); return window.__blob.size; })()`);
  console.log('blob size = ' + total);

  const CH = 512 * 1024;
  const fd = fs.openSync(outPath, 'w');
  let written = 0;
  for (let off = 0; off < total; off += CH) {
    const b64 = await ev(`(async () => {
      const slice = window.__blob.slice(${off}, ${Math.min(off + CH, total)});
      const buf = await slice.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      const STEP = 0x8000;
      for (let i = 0; i < bytes.length; i += STEP) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
      return btoa(bin);
    })()`, true);
    const b = Buffer.from(b64, 'base64');
    fs.writeSync(fd, b);
    written += b.length;
  }
  fs.closeSync(fd);
  console.log('WROTE ' + outPath + ' bytes=' + written);
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
