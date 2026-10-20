// Click / inspect by text, from inside the page (no coordinate math).
// node tools/cdp_click.js "<text>"        -> click first element whose text/aria-label matches
// node tools/cdp_click.js --list          -> list clickable elements with index
// node tools/cdp_click.js --at <x> <y>    -> click at viewport coords (CSS px)
const fs = require('fs');
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;

async function pickTarget() {
  const list = await (await fetch(`${BASE}/json/list`)).json();
  const pages = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  return pages.find((p) => p.url.includes('suno.com')) || pages[0];
}

async function main() {
  const t = await pickTarget();
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

  const arg = process.argv[2];
  if (arg === '--list') {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const out = [];
        const nodes = [...document.querySelectorAll('button,a,[role="button"],input,textarea,[contenteditable="true"]')];
        for (const n of nodes) {
          const rc = n.getBoundingClientRect();
          if (rc.width < 2 || rc.height < 2) continue;
          const label = (n.innerText || n.getAttribute('aria-label') || n.placeholder || n.type || '').trim().replace(/\\s+/g,' ').slice(0,70);
          if (!label) continue;
          out.push(n.tagName + (n.type ? '[' + n.type + ']' : '') + ' "' + label + '"');
        }
        return out.join('\\n');
      })()`,
      returnByValue: true,
    });
    console.log(r.result.value);
  } else if (arg === '--at') {
    const x = parseFloat(process.argv[3]);
    const y = parseFloat(process.argv[4]);
    for (const type of ['mousePressed', 'mouseReleased'])
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
    console.log('clicked ' + x + ',' + y);
  } else {
    const want = arg;
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const want = ${JSON.stringify(want)};
        const norm = (s) => (s || '').replace(/\\s+/g,' ').trim();
        // prefer real controls over wrapper divs
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
          const label = norm(n.innerText || n.getAttribute('aria-label') || n.placeholder || '');
          if (!label) continue;
          if (label === want) cands.push([0 + rank(n), n]);
          else if (label.includes(want) && label.length < want.length + 40) cands.push([10 + rank(n), n]);
        }
        cands.sort((a, b) => a[0] - b[0]);
        const el = cands.length ? cands[0][1] : null;
        if (!el) return 'NOTFOUND: ' + want;
        el.scrollIntoView({block:'center'});
        const rc = el.getBoundingClientRect();
        for (const type of ['pointerdown','mousedown','pointerup','mouseup','click']) {
          el.dispatchEvent(new MouseEvent(type, {bubbles:true, cancelable:true, view:window, clientX: rc.x + rc.width/2, clientY: rc.y + rc.height/2}));
        }
        return 'clicked ' + el.tagName + ' "' + norm(el.innerText || el.getAttribute('aria-label') || '').slice(0,60) + '"';
      })()`,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    console.log(r.result.value);
  }
  ws.close();
  process.exit(0);
}
main().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
