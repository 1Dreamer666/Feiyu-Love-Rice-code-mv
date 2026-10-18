    // ============================================================================
    // 10. MP4 视频导出（WebCodecs 离线逐帧渲染 + mp4-muxer 封装）
    //     - 画面：直接调用纯函数 renderMVFrame(ctx, t)，逐帧离线渲染，与播放完全一致
    //     - 音频：解码母带 MP3 → AudioData 分块 → AAC 编码
    //     - 封装：mp4-muxer（H.264 High + AAC-LC，fastStart）
    // ============================================================================
    let isExporting = false;
    let exportAbort = false;

    const sleepTick = (ms) => new Promise((r) => setTimeout(r, ms));

    function exportSupported() {
      return typeof VideoEncoder !== 'undefined'
        && typeof AudioEncoder !== 'undefined'
        && typeof window.Mp4Muxer !== 'undefined';
    }

    /** 弹出系统文件选择器，返回用户选中的音频 File（取消返回 null） */
    function pickAudioFile() {
      return new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'audio/mpeg,audio/mp3,audio/*,.mp3';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        let settled = false;
        const done = (v) => {
          if (settled) return;
          settled = true;
          inp.remove();
          resolve(v);
        };
        inp.addEventListener('change', () => {
          done(inp.files && inp.files[0] ? inp.files[0] : null);
        });
        // 用户取消时 change 不触发，用焦点回归兜底
        window.addEventListener('focus', () => {
          setTimeout(() => {
            if (!settled && (!inp.files || inp.files.length === 0)) done(null);
          }, 800);
        }, { once: true });
        inp.click();
      });
    }

    // ---- 母带音频的自动获取 ----------------------------------------------------
    // file:// 下浏览器禁止 fetch 本地文件，因此按以下顺序尝试，全部自动、无需用户干预：
    //   1) 显式传入的 File 对象
    //   2) fetch(母带 MP3)          —— 用 http(s) 提供服务时有效
    //   3) window.__MASTER_AUDIO_B64 —— 同目录伴生脚本内嵌的 base64（file:// 下可用）
    //   4) IndexedDB 里上次成功用过的音频
    //   5) 系统文件选择器            —— 最后兜底
    const AUDIO_DB_NAME = 'feiyu-mv-export';
    const AUDIO_DB_STORE = 'master-audio';
    const AUDIO_DB_KEY = 'default';

    function idbOpen() {
      return new Promise((resolve) => {
        let req;
        try { req = indexedDB.open(AUDIO_DB_NAME, 1); } catch (e) { return resolve(null); }
        req.onupgradeneeded = () => {
          try { req.result.createObjectStore(AUDIO_DB_STORE); } catch (_) {}
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      });
    }

    async function idbGetAudio() {
      const db = await idbOpen();
      if (!db) return null;
      try {
        return await new Promise((resolve) => {
          const tx = db.transaction(AUDIO_DB_STORE, 'readonly');
          const rq = tx.objectStore(AUDIO_DB_STORE).get(AUDIO_DB_KEY);
          rq.onsuccess = () => resolve(rq.result || null);
          rq.onerror = () => resolve(null);
        });
      } catch (e) {
        return null;
      } finally {
        try { db.close(); } catch (_) {}
      }
    }

    async function idbPutAudio(buf) {
      const db = await idbOpen();
      if (!db) return;
      try {
        await new Promise((resolve) => {
          const tx = db.transaction(AUDIO_DB_STORE, 'readwrite');
          tx.objectStore(AUDIO_DB_STORE).put(buf, AUDIO_DB_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        });
      } catch (e) {
        /* 缓存失败不影响导出 */
      } finally {
        try { db.close(); } catch (_) {}
      }
    }

    /** 懒加载 base64 母带伴生脚本（file:// 下唯一可用的零点击方案） */
    let audioSidecarPromise = null;
    function loadAudioSidecar() {
      if (window.__MASTER_AUDIO_B64) return Promise.resolve(true);
      if (audioSidecarPromise) return audioSidecarPromise;
      audioSidecarPromise = new Promise((resolve) => {
        const sc = document.createElement('script');
        sc.src = 'vendor/master-audio.js';
        sc.async = true;
        sc.onload = () => resolve(!!window.__MASTER_AUDIO_B64);
        sc.onerror = () => resolve(false);
        document.head.appendChild(sc);
        // 大文件兜底超时
        setTimeout(() => resolve(!!window.__MASTER_AUDIO_B64), 30000);
      });
      return audioSidecarPromise;
    }

    /** 解码内嵌的 base64 母带音频；没有则返回 null */
    function decodeEmbeddedAudio() {
      const b64 = window.__MASTER_AUDIO_B64;
      if (!b64 || typeof b64 !== 'string' || b64.length < 1024) return null;
      try {
        const bin = atob(b64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
      } catch (e) {
        return null;
      }
    }

    /** 依次尝试各种自动来源，返回 {ab, from} 或 {ab:null, from:null} */
    async function autoMasterAudio() {
      // 1) fetch（用 http(s) 提供服务时有效）
      const url = (audioEngine && audioEngine.masterAudioUrl) || 'feiyu_master_soundtrack.mp3';
      try {
        const res = await fetch(url);
        if (res.ok) {
          const ab = await res.arrayBuffer();
          if (ab && ab.byteLength > 1024) return { ab, from: 'fetch' };
        }
      } catch (e) {
        /* file:// 下必然失败，继续 */
      }
      // 2) 懒加载 base64 伴生脚本后再解码
      if (!window.__MASTER_AUDIO_B64) {
        const ok = await loadAudioSidecar();
        if (!ok) {
          // 3) IndexedDB 缓存
          const cached = await idbGetAudio();
          if (cached && cached.byteLength > 1024) return { ab: cached, from: 'cache' };
          return { ab: null, from: null };
        }
      }
      const emb = decodeEmbeddedAudio();
      if (emb) return { ab: emb, from: 'embedded' };
      // 4) IndexedDB 缓存
      const cached = await idbGetAudio();
      if (cached && cached.byteLength > 1024) return { ab: cached, from: 'cache' };
      return { ab: null, from: null };
    }

    /** 读取并解码母带音频，返回 AudioBuffer。失败时抛出可读错误。 */
    async function decodeMasterAudio(audioFile, onNeedPick) {
      let ab = null;
      if (audioFile) {
        ab = await audioFile.arrayBuffer();
      } else {
        const auto = await autoMasterAudio();
        ab = auto.ab;
        if (ab) {
          // 首次从内嵌/网络拿到时顺手缓存，下次更快
          if (auto.from !== 'cache') idbPutAudio(ab);
        } else {
          // 所有自动来源都不可用 —— 最后兜底：让用户手动选择
          if (typeof onNeedPick === 'function') onNeedPick();
          const f = await pickAudioFile();
          if (!f) {
            throw new Error('未选择母带音频文件。可先选择 MP3，或导出无音频的视频。');
          }
          ab = await f.arrayBuffer();
          idbPutAudio(ab);
        }
      }

      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      let buf;
      try {
        buf = await ac.decodeAudioData(ab);
      } catch (e) {
        try { await ac.close(); } catch (_) {}
        throw new Error('音频解码失败：' + e.message);
      }
      try { await ac.close(); } catch (_) {}

      if (Math.abs(buf.sampleRate - 44100) > 1) {
        const len = Math.ceil(buf.duration * 44100);
        const off = new OfflineAudioContext(2, len, 44100);
        const src = off.createBufferSource();
        src.buffer = buf;
        src.connect(off.destination);
        src.start();
        buf = await off.startRendering();
      }
      return buf;
    }

    /**
     * 导出 MP4。
     * @returns {Promise<{blob: Blob, bytes: number, frames: number}>}
     */
    async function exportMP4(opts) {
      const o = Object.assign({
        start: 0,
        end: SONG_DURATION,
        width: 1920,
        height: 1080,
        fps: FPS,
        videoBitrate: 8000000,
        audioBitrate: 192000,
        includeAudio: true,
        audioFile: null,
        fileHandle: null,
        onProgress: () => {}
      }, opts || {});

      if (isExporting) throw new Error('已有导出任务正在进行中');
      if (!exportSupported()) {
        throw new Error('当前浏览器不支持 WebCodecs 视频编码，请使用最新版 Edge / Chrome。');
      }

      const startT = clamp(o.start, 0, SONG_DURATION);
      const endT = clamp(o.end, startT + 0.05, SONG_DURATION);
      const span = endT - startT;
      const frames = Math.max(1, Math.round(span * o.fps));
      const W = o.width, H = o.height;

      isExporting = true;
      exportAbort = false;
      const wasPlaying = isPlaying;
      isPlaying = false;

      const report = (patch) => {
        try { o.onProgress(Object.assign({ startT, endT, frames, width: W, height: H }, patch)); } catch (_) {}
      };

      try {
        // ---------- 1. 离屏画布 ----------
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext('2d', { alpha: false, desynchronized: false });

        report({ phase: 'prep', message: '等待字体就绪…', progress: 0.01 });
        if (document.fonts && document.fonts.ready) {
          try { await document.fonts.ready; } catch (_) {}
        }

        // ---------- 2. 音频 ----------
        let audioBuf = null;
        let audioSkipped = null;
        if (o.includeAudio) {
          report({ phase: 'prep', message: '解码母带音频…', progress: 0.03 });
          try {
            audioBuf = await decodeMasterAudio(o.audioFile, () => {
              report({ phase: 'prep', message: '需要选择母带 MP3 文件…', progress: 0.03 });
            });
          } catch (e) {
            audioSkipped = e.message;
            report({ phase: 'prep', message: '音频跳过：' + e.message, progress: 0.04 });
          }
        }

        // ---------- 3. Muxer ----------
        let target = null;
        let writable = null;
        if (o.fileHandle) {
          writable = await o.fileHandle.createWritable();
          target = new Mp4Muxer.FileSystemWritableFileStreamTarget(writable);
        } else {
          target = new Mp4Muxer.ArrayBufferTarget();
        }

        const muxerOpts = {
          target,
          video: { codec: 'avc', width: W, height: H, frameRate: o.fps },
          fastStart: o.fileHandle ? false : 'in-memory'
        };
        if (audioBuf) {
          muxerOpts.audio = { codec: 'aac', numberOfChannels: 2, sampleRate: audioBuf.sampleRate };
        }
        const muxer = new Mp4Muxer.Muxer(muxerOpts);

        // ---------- 4. 视频编码 ----------
        let vErr = null;
        const vEnc = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => { vErr = e; }
        });
        vEnc.configure({
          codec: 'avc1.640028',
          width: W,
          height: H,
          bitrate: o.videoBitrate,
          framerate: o.fps,
          latencyMode: 'quality'
        });

        const sx = W / STAGE_W;
        const sy = H / STAGE_H;
        const keyEvery = Math.max(1, Math.round(o.fps * 2));
        const t0 = performance.now();

        for (let i = 0; i < frames; i++) {
          if (exportAbort) throw new Error('用户已取消导出');
          if (vErr) throw vErr;

          const t = startT + i / o.fps;
          ctx.setTransform(sx, 0, 0, sy, 0, 0);
          try {
            renderMVFrame(ctx, t);
          } catch (e) {
            throw new Error('渲染第 ' + i + ' 帧（t=' + t.toFixed(3) + 's）失败：' + e.message);
          }

          const vf = new VideoFrame(cv, {
            timestamp: Math.round((i / o.fps) * 1e6),
            duration: Math.round((1 / o.fps) * 1e6)
          });
          vEnc.encode(vf, { keyFrame: i % keyEvery === 0 });
          vf.close();

          while (vEnc.encodeQueueSize > 10) await sleepTick(1);

          if (i % 4 === 0 || i === frames - 1) {
            const el = (performance.now() - t0) / 1000;
            const fpsNow = (i + 1) / Math.max(el, 0.001);
            const eta = (frames - i - 1) / Math.max(fpsNow, 0.01);
            report({
              phase: 'video',
              progress: 0.05 + 0.72 * ((i + 1) / frames),
              frame: i + 1,
              message: '渲染画面 ' + (i + 1) + ' / ' + frames +
                '  ·  ' + fpsNow.toFixed(1) + ' fps  ·  剩余约 ' + Math.ceil(eta) + 's'
            });
            await sleepTick(0);
          }
        }
        await vEnc.flush();

        // ---------- 5. 音频编码 ----------
        if (audioBuf) {
          report({ phase: 'audio', progress: 0.78, message: '编码音频…' });
          const SR = audioBuf.sampleRate;
          const CH = 2;
          const ch0 = audioBuf.getChannelData(0);
          const ch1 = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : ch0;
          const s0 = Math.floor(startT * SR);
          const s1 = Math.min(audioBuf.length, Math.floor(endT * SR));

          let aErr = null;
          const aEnc = new AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
            error: (e) => { aErr = e; }
          });
          aEnc.configure({
            codec: 'mp4a.40.2',
            sampleRate: SR,
            numberOfChannels: CH,
            bitrate: o.audioBitrate
          });

          const BLOCK = 1024;
          const totalBlocks = Math.ceil((s1 - s0) / BLOCK);
          let bi = 0;
          for (let off = s0; off < s1; off += BLOCK) {
            if (exportAbort) throw new Error('用户已取消导出');
            if (aErr) throw aErr;
            const n = Math.min(BLOCK, s1 - off);
            const data = new Float32Array(n * CH);
            data.set(ch0.subarray(off, off + n), 0);
            data.set(ch1.subarray(off, off + n), n);
            const ad = new AudioData({
              format: 'f32-planar',
              sampleRate: SR,
              numberOfFrames: n,
              numberOfChannels: CH,
              timestamp: Math.round((off - s0) / SR * 1e6),
              data
            });
            aEnc.encode(ad);
            ad.close();
            while (aEnc.encodeQueueSize > 24) await sleepTick(1);
            if ((++bi) % 200 === 0) {
              report({
                phase: 'audio',
                progress: 0.78 + 0.16 * (bi / totalBlocks),
                message: '编码音频 ' + Math.round(100 * bi / totalBlocks) + '%'
              });
              await sleepTick(0);
            }
          }
          await aEnc.flush();
        }

        // ---------- 6. 封装 ----------
        report({ phase: 'mux', progress: 0.96, message: '封装 MP4…' });
        muxer.finalize();

        let blob = null;
        let bytes = 0;
        if (writable) {
          await writable.close();
          bytes = target.file?.size || 0;
          blob = null;
        } else {
          blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
          bytes = blob.size;
        }

        report({ phase: 'done', progress: 1, message: '导出完成', bytes });
        return { blob, bytes, frames, audioSkipped };
      } finally {
        isExporting = false;
        isPlaying = wasPlaying;
      }
    }

    // ---------------------------------------------------------------- UI
    function initExportUI() {
      const btn = document.getElementById('btn-export-mp4');
      const modal = document.getElementById('export-modal');
      if (!btn || !modal) return;

      const elStart = document.getElementById('export-start');
      const elEnd = document.getElementById('export-end');
      const elRes = document.getElementById('export-res');
      const elBar = document.getElementById('export-bar');
      const elPct = document.getElementById('export-pct');
      const elMsg = document.getElementById('export-msg');
      const elLog = document.getElementById('export-log');
      const btnGo = document.getElementById('export-go');
      const btnCancel = document.getElementById('export-cancel');
      const btnClose = document.getElementById('export-close');
      const btnPickAudio = document.getElementById('export-pick-audio');
      const elAudioName = document.getElementById('export-audio-name');

      let pickedAudio = null;

      // 打开面板时真实探测母带音频能否自动获取，避免「自动读取」误导用户
      const refreshAudioStatus = async () => {
        if (!elAudioName) return;
        if (pickedAudio) {
          elAudioName.textContent = pickedAudio.name;
          elAudioName.className = 'text-[11px] text-emerald-600 truncate';
          return;
        }
        elAudioName.textContent = '检测中…';
        elAudioName.className = 'text-[11px] text-slate-500 truncate';
        const auto = await autoMasterAudio();
        if (auto.ab) {
          const label = auto.from === 'fetch' ? '母带音频（自动读取）'
            : auto.from === 'embedded' ? '母带音频（内置）'
            : '母带音频（已缓存）';
          elAudioName.textContent = label + ' · ' + (auto.ab.byteLength / 1048576).toFixed(1) + ' MB';
          elAudioName.className = 'text-[11px] text-emerald-600 truncate';
        } else {
          elAudioName.textContent = '未能自动读取 · 导出前需选择 MP3';
          elAudioName.className = 'text-[11px] text-amber-600 truncate';
        }
      };

      const open = () => {
        modal.classList.remove('hidden');
        if (elStart) elStart.value = '0';
        if (elEnd) elEnd.value = String(Math.round(SONG_DURATION));
        refreshAudioStatus();
        if (!exportSupported()) {
          elLog.textContent = '⚠ 当前浏览器不支持 WebCodecs，无法导出。请使用最新版 Edge / Chrome。';
          btnGo.disabled = true;
        }
      };
      const close = () => modal.classList.add('hidden');

      btn.addEventListener('click', open);
      btnClose.addEventListener('click', close);

      if (btnPickAudio) {
        btnPickAudio.addEventListener('click', () => {
          const inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = 'audio/mpeg,audio/mp3,audio/*';
          inp.onchange = () => {
            pickedAudio = inp.files && inp.files[0] ? inp.files[0] : null;
            if (elAudioName) elAudioName.textContent = pickedAudio ? pickedAudio.name : '未选择';
          };
          inp.click();
        });
      }

      btnCancel.addEventListener('click', () => {
        exportAbort = true;
        elMsg.textContent = '正在取消…';
      });

      btnGo.addEventListener('click', async () => {
        const startT = parseFloat(elStart.value) || 0;
        const endT = parseFloat(elEnd.value) || SONG_DURATION;
        const [W, H] = (elRes.value || '1920x1080').split('x').map(Number);

        if (endT <= startT) {
          elLog.textContent = '⚠ 结束时间必须大于开始时间';
          return;
        }

        btnGo.disabled = true;
        btnCancel.disabled = false;
        elLog.textContent = '';

        // 始终优先「选择保存位置」并流式写盘：
        //  - 不占内存（整片 1080p 有几百 MB）
        //  - 文件由我们自己创建，不会被浏览器加上「来自 Internet」标记（否则 Windows 会拒绝打开）
        let fileHandle = null;
        if (window.showSaveFilePicker) {
          try {
            fileHandle = await window.showSaveFilePicker({
              suggestedName: '肥鱼爱大米_' + Math.round(startT) + '-' + Math.round(endT) + 's.mp4',
              types: [{ description: 'MP4 视频', accept: { 'video/mp4': ['.mp4'] } }]
            });
          } catch (e) {
            if (e && e.name === 'AbortError') {
              btnGo.disabled = false;
              elLog.textContent = '已取消保存位置选择。';
              return;
            }
            // 其他错误（如权限策略限制）不阻断，退回内存导出
            fileHandle = null;
          }
        }

        try {
          const res = await exportMP4({
            start: startT,
            end: endT,
            width: W,
            height: H,
            audioFile: pickedAudio,
            fileHandle,
            onProgress: (p) => {
              const pct = Math.round((p.progress || 0) * 100);
              elBar.style.width = pct + '%';
              elPct.textContent = pct + '%';
              if (p.message) elMsg.textContent = p.message;
            }
          });

          // 无音频必须在结果里显式喊出来，绝不能"静默无声"
          const audioWarn = res.audioSkipped
            ? '\n⚠⚠ 本片没有声音！原因：' + res.audioSkipped
              + '\n   请点「选择 MP3」选中同目录的「肥鱼爱大米_母带原声.mp3」后重新导出。'
            : '';

          if (res.blob) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(res.blob);
            a.download = '肥鱼爱大米_' + Math.round(startT) + '-' + Math.round(endT) + 's.mp4';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
            elLog.textContent = '✓ 导出完成：' + (res.bytes / 1048576).toFixed(1) + ' MB，共 ' + res.frames + ' 帧，已开始下载。'
              + audioWarn
              + '\n⚠ 浏览器下载的文件可能被 Windows 标记为「来自 Internet」而无法打开：'
              + '\n   右键文件 → 属性 → 勾选「解除锁定」；或在 PowerShell 执行 Unblock-File "文件路径"。'
              + '\n   推荐用面板里的「选择保存位置」导出，可直接写盘、不会被锁定。';
          } else {
            elLog.textContent = '✓ 导出完成：已写入所选文件（' + res.frames + ' 帧）。' + audioWarn;
          }
        } catch (e) {
          elLog.textContent = '✗ ' + (e && e.message ? e.message : e);
        } finally {
          btnGo.disabled = false;
          btnCancel.disabled = true;
        }
      });
    }

    window.__exportMP4 = exportMP4;
    window.__exportSupported = exportSupported;
    window.__isExporting = () => isExporting;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initExportUI);
    } else {
      setTimeout(initExportUI, 0);
    }
