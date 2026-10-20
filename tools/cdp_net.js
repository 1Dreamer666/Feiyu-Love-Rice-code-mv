// Capture network responses while playing a track, then print any audio URLs.
// node tools/cdp_net.js <seconds>
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
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
  const hits = [];
  const jsonHits = [];
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
      const ct = (m.params.response.mimeType || '').toLowerCase();
      if (/\.mp3|\.m4a|\.wav|audio\//.test(u) || ct.startsWith('audio')) hits.push(u);
      if (/api|feed|clip/.test(u) && ct.includes('json')) jsonHits.push(u);
    }
  };
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  await send('Network.enable');
  await send('Runtime.enable');

  // click the first track's play button via DOM
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = [...document.querySelectorAll('button')];
      const play = btns.find(b => /play/i.test(b.getAttribute('aria-label') || ''));
      if (play) { play.click(); return 'clicked ' + (play.getAttribute('aria-label')||''); }
      const audio = document.querySelector('audio');
      if (audio) { audio.play(); return 'audio.play()'; }
      return 'nothing';
    })()`,
    returnByValue: true,
    userGesture: true,
  }).then((r) => console.log('trigger=' + r.result.value));

  await sleep(parseInt(process.argv[2] || '12000', 10));

  console.log('--- audio hits ---');
  console.log([...new Set(hits)].join('\n'));
  console.log('--- json api hits ---');
  console.log([...new Set(jsonHits)].slice(0, 15).join('\n'));
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
