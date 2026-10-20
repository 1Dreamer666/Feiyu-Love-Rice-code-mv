// Capture a network response body via CDP (works for the SW-decrypted stream if the request is visible).
// node tools/cdp_resp.js <urlSubstring> <outPath>
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const needle = process.argv[2];
  const outPath = path.resolve(process.argv[3]);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const list = await (await fetch(`${BASE}/json/list`)).json();
  const pages = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  const t = pages.find((p) => p.url.includes('suno.com')) || pages[0];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const matched = [];
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
      return;
    }
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response.url;
      if (u.includes(needle)) {
        matched.push({ requestId: m.params.requestId, url: u, mime: m.params.response.mimeType, status: m.params.response.status });
        console.log('MATCH ' + m.params.response.status + ' ' + m.params.response.mimeType + ' ' + u.slice(0, 130));
      }
    }
  };
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  await send('Network.enable', { maxTotalBufferSize: 200000000, maxResourceBufferSize: 200000000 });

  // start playback to force the media request
  await send('Runtime.evaluate', {
    expression: `(() => { const b = document.querySelector('button[aria-label*="Play"]'); if (b) b.click(); return 'play'; })()`,
    returnByValue: true,
    userGesture: true,
  });

  for (let i = 0; i < 40 && !matched.length; i++) await sleep(500);
  if (!matched.length) {
    console.log('NO MATCH for ' + needle);
    process.exit(1);
  }
  const target = matched[0];
  console.log('fetching body for ' + target.requestId);
  const body = await send('Network.getResponseBody', { requestId: target.requestId });
  const data = body.base64Encoded ? Buffer.from(body.body, 'base64') : Buffer.from(body.body, 'binary');
  fs.writeFileSync(outPath, data);
  console.log('saved ' + outPath + ' size=' + data.length);
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
