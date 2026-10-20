// Type into the focused element using CDP Input events (works with React/Lexical editors).
// node tools/cdp_typeinto.js <textFile>
const fs = require('fs');
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

  const text = fs.readFileSync(process.argv[2], 'utf8');

  // 1) scroll the editor into view, then click its center
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = [...document.querySelectorAll('[contenteditable="true"]')].find(n => {
        const rc = n.getBoundingClientRect();
        return rc.width > 200 && rc.height > 100;
      });
      if (!el) return null;
      el.scrollIntoView({block: 'center'});
      const rc = el.getBoundingClientRect();
      const cx = rc.x + rc.width / 2, cy = rc.y + rc.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return {x: cx, y: cy, hit: top ? top.tagName : 'none',
              isEditor: !!(top && (el === top || el.contains(top) || top.contains(el))),
              before: (el.innerText || '').length};
    })()`,
    returnByValue: true,
  });
  if (!r.result.value) {
    console.log('NO EDITOR');
    process.exit(1);
  }
  const { x, y, hit, isEditor, before } = r.result.value;
  console.log('clickTarget hit=' + hit + ' isEditor=' + isEditor + ' beforeLen=' + before);
  await sleep(300);
  for (const type of ['mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(300);

  // 2) select all, delete
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  await sleep(150);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await sleep(300);

  // 3) insert text in chunks
  const CH = 400;
  for (let i = 0; i < text.length; i += CH) {
    await send('Input.insertText', { text: text.slice(i, i + CH) });
    await sleep(150);
  }
  await sleep(800);

  const verify = `(() => {
    const el = [...document.querySelectorAll('[contenteditable="true"]')].find(n => {
      const rc = n.getBoundingClientRect();
      return rc.width > 200 && rc.height > 100;
    });
    const t = (el.innerText || '').trim();
    return {len: t.length, head: t.slice(0, 80), hasInstr: /\\[Instrumental\\]/i.test(t)};
  })()`;
  const after = await send('Runtime.evaluate', { expression: verify, returnByValue: true });
  const v = after.result.value;
  console.log('len=' + v.len + ' expected=' + text.trim().length);
  console.log('head=' + JSON.stringify(v.head));
  console.log('hasInstr=' + v.hasInstr);

  // 4) if it did not take, retry once with a focused DOM-level insertion
  if (Math.abs(v.len - text.trim().length) > 20) {
    console.log('MISMATCH -> retrying with execCommand after focus');
    const rr = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = [...document.querySelectorAll('[contenteditable="true"]')].find(n => {
          const rc = n.getBoundingClientRect();
          return rc.width > 200 && rc.height > 100;
        });
        el.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        const ok = document.execCommand('insertText', false, ${JSON.stringify(text)});
        el.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText'}));
        return {ok, len: (el.innerText || '').trim().length};
      })()`,
      returnByValue: true,
      userGesture: true,
    });
    console.log('retry=' + JSON.stringify(rr.result.value));
  }
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
