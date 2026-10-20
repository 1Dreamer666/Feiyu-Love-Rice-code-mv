// Inspect the Service Worker: does it decrypt? Can we see the response it produces?
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

  const r = await send('Runtime.evaluate', {
    expression: `(async () => {
      const out = [];
      const regs = await navigator.serviceWorker.getRegistrations();
      out.push('registrations=' + regs.length);
      for (const r of regs) {
        out.push('scope=' + r.scope);
        out.push('  active=' + (r.active && r.active.scriptURL));
      }
      const a = document.querySelector('audio');
      out.push('audio duration=' + (a && a.duration));
      out.push('audio src=' + (a && a.src ? a.src.slice(0,60) : 'none'));
      return out.join('\\n');
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(r.result.value);
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + e.message);
  process.exit(1);
});
