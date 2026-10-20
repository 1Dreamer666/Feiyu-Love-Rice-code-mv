// Record one Suno song end-to-end in a single pass, without resetting currentTime after start.
// node tools/cdp_rec_song.js <songUrl> <outPath> [maxSec]
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const songUrl = process.argv[2];
  const outPath = path.resolve(process.argv[3]);
  const maxSec = parseFloat(process.argv[4] || '300');
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

  await send('Page.enable');
  await send('Page.navigate', { url: songUrl });
  console.log('navigated');
  await sleep(11000);

  // click the song's own play button to bind the blob
  const clicked = await ev(`(() => {
    const cands = [...document.querySelectorAll('button')];
    const byName = cands.find(x => /^Play "/.test(x.getAttribute('aria-label')||''));
    if (byName) { byName.click(); return 'named: ' + byName.getAttribute('aria-label'); }
    const exact = cands.find(x => (x.getAttribute('aria-label')||'').trim() === 'Play');
    if (exact) { exact.click(); return 'exact Play'; }
    const pbar = cands.find(x => /Playbar: Play button/i.test(x.getAttribute('aria-label')||''));
    if (pbar) { pbar.click(); return 'playbar'; }
    return 'none';
  })()`);
  console.log('play: ' + clicked);
  await sleep(6000);

  // if still no audio, try clicking the big play/pause button
  let dur0 = await ev(`(() => { const a = [...document.querySelectorAll('audio')].find(x => x.duration > 5); return a ? a.duration : 0; })()`);
  if (!(dur0 > 5)) {
    await ev(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Play\\/ pause/i.test(x.getAttribute('aria-label')||''));
      if (b) b.click();
      return 1;
    })()`);
    await sleep(6000);
  }

  const dur = await ev(`(() => { const a = [...document.querySelectorAll('audio')].find(x => x.duration > 5); return a ? a.duration : 0; })()`);
  console.log('duration=' + dur);
  if (!(dur > 5)) { console.log('NO AUDIO'); process.exit(1); }

  // start recorder WITHOUT seeking
  const started = await ev(`(async () => {
    const a = [...document.querySelectorAll('audio')].find(x => x.duration > 5);
    const stream = a.captureStream();
    const mime = ['audio/webm;codecs=opus','audio/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, mime ? {mimeType: mime, audioBitsPerSecond: 192000} : {audioBitsPerSecond: 192000});
    window.__chunks = []; window.__done = false;
    mr.ondataavailable = e => { if (e.data && e.data.size) window.__chunks.push(e.data); };
    mr.onstop = () => { window.__done = true; };
    mr.start(1000);
    window.__mr = mr; window.__el = a; window.__mime = mr.mimeType;
    await a.play().catch(()=>{});
    return 'rec from t=' + a.currentTime.toFixed(2) + ' mime=' + mr.mimeType;
  })()`, true);
  console.log(started);

  // wait until ended
  const t0 = Date.now();
  let last = 0;
  while ((Date.now() - t0) / 1000 < maxSec) {
    await sleep(3000);
    const s = JSON.parse(await ev(`(() => { const a = window.__el; return JSON.stringify({t:a.currentTime,d:a.duration,n:window.__chunks.length,done:!!window.__done,paused:a.paused}); })()`));
    const el = (Date.now() - t0) / 1000;
    if (el - last > 25) {
      console.log(`[${el.toFixed(0)}s] ${s.t.toFixed(1)}/${s.d.toFixed(1)} chunks=${s.n} paused=${s.paused}`);
      last = el;
    }
    if (s.done || s.t >= s.d - 1.2) break;
    if (s.paused && s.t > 2) {
      // try to resume
      await ev(`(() => { const a = window.__el; a.play().catch(()=>{}); return 1; })()`);
    }
  }

  await ev(`(() => { try { window.__mr.stop(); } catch(e){} return 1; })()`);
  await sleep(2500);

  const meta = JSON.parse(await ev(`(() => { window.__blob = new Blob(window.__chunks, {type: window.__mime}); return JSON.stringify({size: window.__blob.size, n: window.__chunks.length}); })()`));
  console.log('blob=' + JSON.stringify(meta));
  if (!meta.size) { console.log('EMPTY'); process.exit(1); }

  const CH = 768 * 1024;
  const fd = fs.openSync(outPath, 'w');
  let written = 0;
  for (let off = 0; off < meta.size; off += CH) {
    const b64 = await ev(`(async () => {
      const s = window.__blob.slice(${off}, ${Math.min(off + CH, meta.size)});
      const buf = await s.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = ''; const STEP = 0x8000;
      for (let i = 0; i < bytes.length; i += STEP) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
      return btoa(bin);
    })()`, true);
    const b = Buffer.from(b64, 'base64');
    fs.writeSync(fd, b);
    written += b.length;
  }
  fs.closeSync(fd);
  console.log('WROTE ' + outPath + ' ' + written);
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
