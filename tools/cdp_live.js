// Live CDP client for the persistent, user-logged-in browser on port 9222.
// Usage:
//   node tools/cdp_live.js eval  <exprFile.js>          -> evaluate expression, print result
//   node tools/cdp_live.js shot  <out.png> [w] [h]      -> screenshot of the active page
//   node tools/cdp_live.js nav   <url>                  -> navigate active page
//   node tools/cdp_live.js list                          -> list targets
//   node tools/cdp_live.js file  <inPath> <selector>    -> set files on <input type=file>
//   node tools/cdp_live.js click <x> <y>                -> real mouse click at viewport coords
//   node tools/cdp_live.js type  <text>                 -> type text into focused element
//   node tools/cdp_live.js key   <key>                  -> press key (Enter, Tab, ...)
const fs = require('fs');
const path = require('path');

const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pickTarget() {
  const list = await (await fetch(`${BASE}/json/list`)).json();
  const pages = list.filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!pages.length) throw new Error('no page target');
  // prefer a suno tab
  return pages.find((p) => p.url.includes('suno.com')) || pages[0];
}

async function connect() {
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
  return { send, ws, target: t, close: () => ws.close() };
}

(async () => {
  const cmd = process.argv[2];
  const c = await connect();
  try {
    if (cmd === 'list') {
      const list = await (await fetch(`${BASE}/json/list`)).json();
      console.log(
        list
          .filter((t) => t.type === 'page')
          .map((t) => `${t.id}  ${t.url}`)
          .join('\n')
      );
    } else if (cmd === 'eval') {
      const expr = fs.readFileSync(process.argv[3], 'utf8');
      const r = await c.send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
        timeout: 600000,
      });
      if (r.exceptionDetails)
        console.log('EXCEPTION: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      else console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 2));
    } else if (cmd === 'shot') {
      const out = process.argv[3] || 'build/tmp/shot.png';
      const w = parseInt(process.argv[4] || '1680', 10);
      const h = parseInt(process.argv[5] || '1050', 10);
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await sleep(400);
      const r = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
      console.log('wrote ' + out);
    } else if (cmd === 'nav') {
      await c.send('Page.enable');
      await c.send('Page.navigate', { url: process.argv[3] });
      await sleep(1500);
      console.log('navigated -> ' + process.argv[3]);
    } else if (cmd === 'file') {
      const abs = path.resolve(process.argv[3]);
      const sel = process.argv[4];
      const doc = await c.send('DOM.getDocument', { depth: -1, pierce: true });
      const q = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel });
      if (!q.nodeId) throw new Error('selector not found: ' + sel);
      await c.send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [abs] });
      console.log('set file ' + abs + ' on ' + sel);
    } else if (cmd === 'click') {
      const x = parseFloat(process.argv[3]);
      const y = parseFloat(process.argv[4]);
      for (const type of ['mousePressed', 'mouseReleased'])
        await c.send('Input.dispatchMouseEvent', {
          type,
          x,
          y,
          button: 'left',
          clickCount: 1,
          buttons: type === 'mousePressed' ? 1 : 0,
        });
      console.log('clicked ' + x + ',' + y);
    } else if (cmd === 'type') {
      await c.send('Input.insertText', { text: process.argv[3] });
      console.log('typed ' + process.argv[3].length + ' chars');
    } else if (cmd === 'key') {
      const key = process.argv[3];
      const map = {
        Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
        Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
        Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
        Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
      };
      const k = map[key] || { key, code: key };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
      console.log('key ' + key);
    } else {
      console.log('unknown cmd: ' + cmd);
    }
  } finally {
    c.close();
  }
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
