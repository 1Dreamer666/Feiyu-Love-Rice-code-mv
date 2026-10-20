// Download via the browser's native download manager (bypasses CORS).
// node tools/cdp_dl_native.js <url> <outDir>
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const url = process.argv[2];
  const outDir = path.resolve(process.argv[3]);
  fs.mkdirSync(outDir, { recursive: true });

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
    if (m.method === 'Browser.downloadWillBegin') console.log('begin: ' + m.params.suggestedFilename);
    if (m.method === 'Browser.downloadProgress')
      console.log('progress: ' + m.params.state + ' ' + Math.round((m.params.receivedBytes / (m.params.totalBytes || 1)) * 100) + '%');
  };
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });

  try {
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir, eventsEnabled: true });
  } catch (e) {
    console.log('Browser.setDownloadBehavior failed: ' + e.message);
    await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir }).catch(() => {});
  }

  // Use a hidden iframe / anchor with download attribute to trigger the native download
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const a = document.createElement('a');
      a.href = ${JSON.stringify(url)};
      a.download = '';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      return 'clicked';
    })()`,
    returnByValue: true,
    userGesture: true,
  });
  console.log('trigger=' + (r.result && r.result.value));

  // wait for a file to appear
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const files = fs.readdirSync(outDir).filter((f) => !f.endsWith('.crdownload'));
    if (files.length) {
      const f = files.sort((a, b) => fs.statSync(path.join(outDir, b)).mtimeMs - fs.statSync(path.join(outDir, a)).mtimeMs)[0];
      const p = path.join(outDir, f);
      const sz = fs.statSync(p).size;
      if (sz > 500000) {
        console.log('DONE ' + p + ' size=' + sz);
        ws.close();
        process.exit(0);
      }
    }
  }
  console.log('TIMEOUT, dir contents: ' + fs.readdirSync(outDir).join(','));
  ws.close();
  process.exit(1);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
