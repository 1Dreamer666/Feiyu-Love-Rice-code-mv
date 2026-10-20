// Set the browser download dir to a known path, then click the Download flow.
// node tools/cdp_setdl.js <dir>
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = path.resolve(process.argv[2]);
  fs.mkdirSync(dir, { recursive: true });

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
    if (m.method === 'Browser.downloadWillBegin') console.log('BEGIN ' + m.params.suggestedFilename + ' url=' + m.params.url.slice(0, 120));
    if (m.method === 'Browser.downloadProgress')
      console.log('PROG ' + m.params.state + ' ' + m.params.receivedBytes + '/' + m.params.totalBytes);
  };
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });

  for (const m of ['Browser.setDownloadBehavior', 'Page.setDownloadBehavior']) {
    try {
      await send(m, { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
      console.log('ok ' + m + ' -> ' + dir);
      break;
    } catch (e) {
      console.log('fail ' + m + ': ' + e.message);
    }
  }
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
