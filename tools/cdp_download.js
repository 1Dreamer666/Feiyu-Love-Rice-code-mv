// Download a URL through the browser's own network stack (with cookies + SW), saving via CDP.
// node tools/cdp_download.js <url> <outPath>
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const url = process.argv[2];
  const outPath = path.resolve(process.argv[3]);
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

  // fetch inside the page (inherits cookies), return base64
  let r;
  try {
    r = await send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          const resp = await fetch(${JSON.stringify(url)}, {credentials: 'include'});
          if (!resp.ok) return {err: 'HTTP ' + resp.status};
          const buf = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let bin = '';
          const CH = 0x8000;
          for (let i = 0; i < bytes.length; i += CH) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
          }
          return {b64: btoa(bin), size: bytes.length, ct: resp.headers.get('content-type')};
        } catch (e) {
          return {err: 'js: ' + e.message};
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
      timeout: 300000,
    });
  } catch (e) {
    console.log('CDP ERROR: ' + e.message);
    process.exit(1);
  }
  if (r.exceptionDetails) {
    console.log('EXCEPTION: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    process.exit(1);
  }
  const v = r.result.value;
  if (!v || v.err) {
    console.log('FAIL ' + JSON.stringify(v) + ' raw=' + JSON.stringify(r.result).slice(0, 300));
    process.exit(1);
  }
  fs.writeFileSync(outPath, Buffer.from(v.b64, 'base64'));
  console.log('saved ' + outPath + ' size=' + v.size + ' ct=' + v.ct);
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
