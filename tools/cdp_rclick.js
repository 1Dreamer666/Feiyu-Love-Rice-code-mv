// Real (CDP Input) click by visible text — React apps ignore synthetic MouseEvents.
// node tools/cdp_rclick.js "<text>"     -> real click at the element's center
// node tools/cdp_rclick.js --xy <x> <y> -> real click at coords
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const list = await (await fetch(`${BASE}/json/list`)).json();
  const pages = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  const t = pages.find((p) => p.url.includes('suno.com')) || pages[0];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) =>
    new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
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

  let x, y, label;
  if (process.argv[2] === '--xy') {
    x = parseFloat(process.argv[3]);
    y = parseFloat(process.argv[4]);
    label = 'xy';
  } else {
    const want = process.argv[2];
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const want = ${JSON.stringify(want)};
        const norm = (s) => (s || '').replace(/\\s+/g,' ').trim();
        const rank = (n) => {
          const tag = n.tagName.toLowerCase();
          if (tag === 'button') return 0;
          if (tag === 'a') return 1;
          if (n.getAttribute('role') === 'button') return 2;
          if (tag === 'input' || tag === 'textarea') return 3;
          if (n.getAttribute('contenteditable') === 'true') return 4;
          if (tag === 'label') return 5;
          return 9;
        };
        const nodes = [...document.querySelectorAll('button,a,[role="button"],input,textarea,[contenteditable="true"],label')];
        const cands = [];
        for (const n of nodes) {
          const rc = n.getBoundingClientRect();
          if (rc.width < 2 || rc.height < 2) continue;
          if (rc.bottom < 0 || rc.top > innerHeight) continue;
          const label = norm(n.innerText || n.getAttribute('aria-label') || n.placeholder || '');
          if (!label) continue;
          if (label === want) cands.push([0 + rank(n), n]);
          else if (label.includes(want) && label.length < want.length + 40) cands.push([10 + rank(n), n]);
        }
        cands.sort((a, b) => a[0] - b[0]);
        if (!cands.length) return {err: 'NOTFOUND ' + want};
        const el = cands[0][1];
        el.scrollIntoView({block: 'center'});
        const rc = el.getBoundingClientRect();
        return {x: rc.x + rc.width / 2, y: rc.y + rc.height / 2,
                label: norm(el.innerText || el.getAttribute('aria-label') || '').slice(0, 60),
                tag: el.tagName};
      })()`,
      returnByValue: true,
    });
    const v = r.result.value;
    if (v.err) {
      console.log(v.err);
      process.exit(1);
    }
    x = v.x;
    y = v.y;
    label = v.tag + ' "' + v.label + '"';
    await sleep(250);
  }

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  console.log('rclick ' + label + ' @ ' + Math.round(x) + ',' + Math.round(y));
  ws.close();
  process.exit(0);
}
main().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
