// Extract window.__blob to a local file in chunks.
// node tools/cdp_getblob.js <outPath>
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;

(async () => {
  const outPath = path.resolve(process.argv[2]);
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

  const meta = JSON.parse(await ev(`(() => { window.__blob = new Blob(window.__chunks, {type: window.__mime}); return JSON.stringify({size: window.__blob.size, mime: window.__mime}); })()`));
  console.log('blob ' + meta.size + ' bytes, ' + meta.mime);
  if (!meta.size) process.exit(1);

  const CH = 768 * 1024;
  const fd = fs.openSync(outPath, 'w');
  let written = 0;
  for (let off = 0; off < meta.size; off += CH) {
    const b64 = await ev(
      `(async () => {
        const slice = window.__blob.slice(${off}, ${Math.min(off + CH, meta.size)});
        const buf = await slice.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        const STEP = 0x8000;
        for (let i = 0; i < bytes.length; i += STEP) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
        return btoa(bin);
      })()`,
      true
    );
    const b = Buffer.from(b64, 'base64');
    fs.writeSync(fd, b);
    written += b.length;
  }
  fs.closeSync(fd);
  console.log('WROTE ' + outPath + ' ' + written + ' bytes');
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
