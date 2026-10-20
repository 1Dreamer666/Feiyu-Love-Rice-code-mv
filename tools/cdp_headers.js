// Print response headers for a matching URL
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const needle = process.argv[2] || 'cloudfront.net';
  const list = await (await fetch(`${BASE}/json/list`)).json();
  const pages = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  const t = pages.find((p) => p.url.includes('suno.com')) || pages[0];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const seen = [];
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
    if (m.method === 'Network.responseReceived' && m.params.response.url.includes(needle)) {
      seen.push(m.params.response);
    }
  };
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  await send('Network.enable');
  await send('Runtime.evaluate', {
    expression: `(() => { const b = document.querySelector('button[aria-label*="Play"]'); if (b) b.click(); return 1; })()`,
    returnByValue: true,
    userGesture: true,
  });
  for (let i = 0; i < 30 && !seen.length; i++) await sleep(500);
  for (const s of seen.slice(0, 3)) {
    console.log('URL ' + s.url);
    console.log('status ' + s.status + ' mime ' + s.mimeType + ' encLen ' + s.encodedDataLength);
    console.log('headers ' + JSON.stringify(s.headers, null, 1).slice(0, 1200));
  }
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + e.message);
  process.exit(1);
});
