// Reload the page, wait, then install the tap + recorder in one shot (before the player binds).
// node tools/cdp_rec.js <seconds> <outRaw.json>
const fs = require('fs');
const path = require('path');
const PORT = process.env.CDP_PORT || 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const waitSec = parseFloat(process.argv[2] || '220');
  const outPath = path.resolve(process.argv[3]);

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

  // Install an early hook that taps whatever <audio> the app creates
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__REC = { chunks: [], sr: 0, started: false, peak: 0 };
      (function(){
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const origCreate = document.createElement.bind(document);
        document.createElement = function(tag, opts) {
          const el = origCreate(tag, opts);
          if (String(tag).toLowerCase() === 'audio') {
            try {
              const ac = new AC({sampleRate: 44100});
              window.__REC.ac = ac;
              const tap = ac.createMediaElementSource(el);
              tap.connect(ac.destination);
              const sp = ac.createScriptProcessor(4096, 1, 1);
              sp.onaudioprocess = (e) => {
                const d = e.inputBuffer.getChannelData(0);
                window.__REC.chunks.push(new Float32Array(d));
                window.__REC.sr = ac.sampleRate;
                for (let i=0;i<d.length;i+=32) {
                  const v = Math.abs(d[i]);
                  if (v > window.__REC.peak) window.__REC.peak = v;
                }
              };
              tap.connect(sp);
              sp.connect(ac.destination);
              window.__REC.el = el;
              window.__REC.tap = tap;
              window.__REC.sp = sp;
              el.addEventListener('play', () => { if (ac.state === 'suspended') ac.resume(); window.__REC.started = true; });
            } catch (err) {
              window.__REC.err = String(err);
            }
          }
          return el;
        };
      })();
    `,
  });

  // Reload so the hook applies to freshly created elements
  await send('Page.reload', { ignoreCache: false });
  console.log('reloaded; waiting for player');
  await sleep(9000);

  // report state
  const st = await send('Runtime.evaluate', {
    expression: `JSON.stringify({hasRec: !!window.__REC, err: window.__REC && window.__REC.err,
      el: !!(window.__REC && window.__REC.el), dur: window.__REC && window.__REC.el && window.__REC.el.duration,
      started: window.__REC && window.__REC.started, samples: window.__REC ? window.__REC.chunks.length : 0})`,
    returnByValue: true,
  });
  console.log('state=' + st.result.value);

  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log('FAIL: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
