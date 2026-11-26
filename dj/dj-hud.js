// FreakRating DJ — HUD проигрывателя: ящик с пластинками + проигрыватель в стиле Minecraft.
// Обычный скрипт без import/export: userscript выполняет его через new Function, превью — через import.
// API: window.FreakDJ.start({ listSongs, loadText, loadBinary, libBase, loadConverter, extraTracks }) → { addTrack, destroy }.
(() => {
  'use strict';
  window.FreakDJ?.destroy?.();

  const STORE = 'freakdj:v1';
  const KINDS = {
    guitar: { label: '#a974ff', dark: '#45208f', icon: 'guitar', name: 'Гитара', sub: 'в игре' },
    digital: { label: '#3fd8f6', dark: '#0a5a74', icon: 'digital', name: 'Цифра', sub: 'войс-чат' },
  };
  const ICONS = {
    guitar: ['.....##', '....##.', '...#...', '.###...', '####...', '###....', '.#.....'],
    digital: ['#######', '#.....#', '#.###.#', '#.#.#.#', '#.###.#', '#.....#', '#######'],
    note: ['..#####', '..#...#', '..#...#', '..#...#', '###.###', '###.###', '.#...#.'],
  };

  // ---------- Пиксельные спрайты (рисуются в canvas, масштабируются CSS без сглаживания) ----------
  const spriteCache = new Map();
  function sprite(key, w, h, draw) {
    if (spriteCache.has(key)) return spriteCache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d');
    const px = (x, y, color, ww = 1, hh = 1) => { g.fillStyle = color; g.fillRect(x, y, ww, hh); };
    draw(px);
    const url = canvas.toDataURL();
    spriteCache.set(key, url);
    return url;
  }
  const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

  function drawVinyl(px, ox, oy, size, kind) {
    const k = KINDS[kind] || KINDS.guitar, c = size / 2, R = size / 2, L = size * 0.23;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      if (d > R) continue;
      let col;
      if (d > R - 1) col = '#0b0a0f';
      else if (d < L) col = d > L - 1 ? k.dark : k.label;
      else {
        col = Math.floor(d) % 3 === 0 ? '#2a2733' : '#1c1a23';
        const a = Math.atan2(dy, dx);
        if (d > L + 1 && Math.abs(a + 2.3) < 0.3) col = '#4c4859';
        else if (d > L + 1 && Math.abs(a - 0.85) < 0.2) col = '#353140';
      }
      px(ox + x, oy + y, col);
    }
    if (size >= 21) ICONS[k.icon].forEach((row, iy) => [...row].forEach((ch, ix) => {
      if (ch === '#') px(ox + Math.floor(c) - 3 + ix, oy + Math.floor(c) - 3 + iy, k.dark);
    }));
  }
  function drawSleeve(px, ox, oy, size, hue) {
    const c = (s, l) => `hsl(${hue} ${s}% ${l}%)`, r = rng(hue * 7 + 3);
    px(ox, oy, '#0b0a0f', size, size);
    px(ox + 1, oy + 1, c(28, 21), size - 2, size - 2);
    for (let i = 0; i < size * 1.5; i++) px(ox + 2 + Math.floor(r() * (size - 4)), oy + 2 + Math.floor(r() * (size - 4)), c(30, 17 + r() * 9));
    px(ox + 1, oy + 1, c(45, 38), size - 2, 1);
    px(ox + 1, oy + 1, c(40, 31), 1, size - 2);
    px(ox + 1, oy + size - 2, c(30, 11), size - 2, 1);
    px(ox + size - 2, oy + 1, c(30, 13), 1, size - 2);
  }
  function drawCrate(px, ox, oy, w, h, seed, { back = false, note = true } = {}) {
    const r = rng(seed), half = Math.floor((h - 2) / 2);
    const tones = back
      ? [['#7a4c22', '#8d5c2d', '#64391a'], ['#6c421d', '#7e5127', '#56311a']]
      : [['#b47b42', '#c99055', '#93602f'], ['#a36d38', '#b9834a', '#86562a']];
    px(ox, oy, '#2a170a', w, h);
    tones.forEach(([base, lite, dark], i) => {
      const y0 = oy + 1 + i * (half + 1), hh = i ? h - 2 - half - 1 : half;
      px(ox + 1, y0, base, w - 2, hh);
      px(ox + 1, y0, lite, w - 2, 1);
      for (let n = 0; n < w * 0.7; n++) px(ox + 1 + Math.floor(r() * (w - 3)), y0 + 1 + Math.floor(r() * Math.max(1, hh - 1)), dark, 1 + Math.floor(r() * 4), 1);
    });
    px(ox + 1, oy + 1 + half, '#5a3416', w - 2, 1);
    if (back) return;
    const post = Math.max(3, Math.round(w * 0.075));
    for (const x of [ox + 1, ox + w - 1 - post]) {
      px(x, oy + 1, '#7b4a20', post, h - 2);
      px(x, oy + 1, '#93602f', post, 1);
      px(x + post - 1, oy + 1, '#5a3416', 1, h - 2);
      px(x + 1, oy + 3, '#2a170a');
      px(x + 1, oy + h - 4, '#2a170a');
    }
    if (note && w >= 60) ICONS.note.forEach((row, iy) => [...row].forEach((ch, ix) => {
      if (ch === '#') px(ox + Math.floor(w / 2) - 3 + ix, oy + Math.floor(h / 2) - 3 + iy, '#5a3416');
    }));
  }

  const SLEEVE = 29, VINYL = 27;
  const vinylSprite = kind => sprite('vinyl-' + kind, VINYL, VINYL, px => drawVinyl(px, 0, 0, VINYL, kind));
  const sleeveSprite = hue => sprite('sleeve-' + hue, SLEEVE, SLEEVE, px => drawSleeve(px, 0, 0, SLEEVE, hue));
  const crateFront = () => sprite('crate-front', 84, 18, px => drawCrate(px, 0, 0, 84, 18, 42));
  const drawPattern = (px, ox, oy, rows, color) => rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(ox + x, oy + y, color); }));
  // Планшет с листком и «+»: кнопка добавления пластинки.
  const clipboardSprite = () => sprite('clipboard', 12, 16, px => {
    px(0, 1, '#2a170a', 12, 15); px(1, 2, '#93602f', 10, 13); px(1, 2, '#b07a43', 10, 1);
    px(2, 4, '#efe6d2', 8, 10); px(2, 13, '#cfc4ad', 8, 1);
    px(3, 6, '#b8ad96', 6, 1); px(3, 8, '#b8ad96', 6, 1); px(3, 10, '#b8ad96', 3, 1);
    px(3, 0, '#0b0a0f', 6, 4); px(4, 1, '#b5b1bf', 4, 2); px(4, 1, '#e6e2ef', 4, 1);
    drawPattern(px, 6, 9, ['.#.', '###', '.#.'], '#8a4dff');
  });
  // Клавиша «Ё» + курсор: подсказка, как освободить мышь.
  const keycapSprite = () => sprite('keycap', 23, 14, px => {
    px(0, 0, '#0b0a0f', 13, 13); px(1, 1, '#e6e2ef', 11, 9); px(1, 1, '#ffffff', 11, 1); px(1, 10, '#8d8a96', 11, 2);
    drawPattern(px, 4, 2, ['.#.#.', '.....', '#####', '#....', '####.', '#....', '#####'], '#2a2733');
    drawPattern(px, 15, 2, ['#......', '##.....', '#O#....', '#OO#...', '#OOO#..', '#OOOO#.', '#OO###.', '#O#....', '##.....', '#......'].map(r => r.replace(/O/g, '.')), '#0b0a0f');
    drawPattern(px, 15, 2, ['.......', '.......', '.#.....', '.##....', '.###...', '.####..', '.##....', '.#.....'], '#ffffff');
  });
  // Листок со стрелкой: «приложить файл».
  const attachSprite = () => sprite('attach', 10, 12, px => {
    px(0, 0, '#0b0a0f', 10, 12); px(1, 1, '#efe6d2', 8, 10); px(6, 1, '#cfc4ad', 3, 3); px(6, 0, '#0b0a0f', 1, 4); px(6, 3, '#0b0a0f', 4, 1); px(7, 1, '#0b0a0f', 3, 2);
    drawPattern(px, 3, 4, ['.#.', '###', '.#.', '.#.', '.#.'], '#8a4dff');
  });
  // Лист с нотами (для режима нот).
  const sheetSprite = hue => sprite('sheet-' + hue, 23, 29, px => {
    const r = rng(hue * 13 + 5);
    px(0, 0, '#0b0a0f', 23, 29); px(1, 1, '#efe6d2', 21, 27); px(1, 27, '#cfc4ad', 21, 1);
    px(17, 1, '#cfc4ad', 5, 5); px(16, 0, '#0b0a0f', 1, 6); px(16, 6, '#0b0a0f', 7, 1); px(17, 1, '#0b0a0f', 1, 1); px(18, 1, '#0b0a0f', 4, 1);
    px(3, 3, `hsl(${hue} 45% 42%)`, 11, 2);
    for (const y0 of [9, 15, 21]) {
      for (const dy of [0, 2, 4]) px(2, y0 + dy, '#b8ad96', 19, 1);
      for (let n = 0; n < 4; n++) { const x = 3 + n * 4 + Math.floor(r() * 2), y = y0 + Math.floor(r() * 4); px(x, y, '#2a2733', 2, 1); px(x + 1, y - 3, '#2a2733', 1, 3); }
    }
  });
  // Пюпитр: подставка для нот.
  const standSprite = () => sprite('stand', 30, 26, px => {
    px(2, 0, '#2a170a', 26, 16); px(3, 1, '#7a4c22', 24, 14); px(3, 1, '#93602f', 24, 1);
    px(0, 14, '#2a170a', 30, 4); px(1, 15, '#b07a43', 28, 2); px(1, 15, '#c99055', 28, 1);
    px(13, 18, '#0b0a0f', 4, 5); px(14, 18, '#8d8a96', 2, 5);
    px(14, 22, '#0b0a0f', 2, 1);
    for (let i = 0; i < 4; i++) { px(13 - i * 2, 22 + i, '#0b0a0f', 3, 1); px(14 + i * 2, 22 + i, '#0b0a0f', 3, 1); px(14 - i * 2, 22 + i, '#8d8a96', 1, 1); px(15 + i * 2, 22 + i, '#8d8a96', 1, 1); }
  });
  // Громкоговоритель: тумблер трансляции в войс-чат.
  const speakerSprite = on => sprite('speaker-' + on, 12, 7, px => {
    const body = on ? '#c9a6ff' : '#8d8a96';
    drawPattern(px, 0, 0, ['....#', '...##', '#####', '#####', '#####', '...##', '....#'], body);
    px(0, 2, '#0b0a0f', 1, 3);
    if (on) { px(7, 2, '#a974ff', 1, 3); px(9, 1, '#a974ff'); px(10, 2, '#a974ff', 1, 3); px(9, 5, '#a974ff'); }
    else drawPattern(px, 7, 2, ['#.#', '.#.', '#.#'], '#ff7a8a');
  });
  // Микрофон: слышно ли твой голос.
  const micSprite = on => sprite('mic-' + on, 7, 10, px => {
    const c = on ? '#c9a6ff' : '#8d8a96';
    px(2, 0, '#0b0a0f', 3, 6); px(2, 0, c, 3, 5); px(3, 1, '#ffffff', 1, 2);
    [[1, 3], [1, 4], [5, 3], [5, 4], [2, 5], [3, 6], [4, 5]].forEach(([x, y]) => px(x, y, '#d9d5e2'));
    px(3, 7, '#d9d5e2', 1, 2); px(1, 9, '#d9d5e2', 5, 1);
    if (!on) for (let i = 0; i < 8; i++) px(i < 7 ? i : 6, 1 + i, '#ff7a8a');
  });
  // Дорожка с нотами: тумблер ритм-игры (число цветных нот = число дорожек, серые — выключено).
  const rhythmSprite = n => sprite('rhythm-' + n, 13, 12, px => {
    const cols = ['#3fe0a0', '#ff5f7e', '#ffd34d', '#4fb6ff', '#c58bff'];
    for (let y = 0; y < 12; y++) { const half = 3 + Math.floor(y / 3.4); px(6 - half, y, '#0b0a0f', half * 2 + 1, 1); px(7 - half, y, n ? '#2b2140' : '#24222b', half * 2 - 1, 1); }
    const k = n || 5, gems = [[1, 9], [3, 5], [2, 2], [4, 7], [0, 4]];
    for (let i = 0; i < k; i++) { const [lane, y] = gems[i], half = 3 + Math.floor(y / 3.4), x = 6 - half + 1 + Math.round(((lane + 0.5) / k) * (half * 2 - 1)) - 1; px(x, y, n ? cols[lane % 5] : '#6c6878', 2, 1); }
    px(1, 10, n ? '#f1ecff' : '#6c6878', 11, 1);
  });
  // Облачко с гитарой: «сядь за гитару».
  const bubbleSprite = () => sprite('bubble', 15, 14, px => {
    px(1, 0, '#0b0a0f', 13, 11); px(0, 1, '#0b0a0f', 15, 9);
    px(1, 1, '#f1ecff', 13, 9); px(2, 1, '#ffffff', 11, 1);
    px(3, 11, '#0b0a0f', 3, 1); px(3, 12, '#0b0a0f', 2, 1); px(3, 13, '#0b0a0f', 1, 1); px(4, 10, '#f1ecff', 1, 1); px(4, 11, '#f1ecff', 1, 1);
    drawPattern(px, 4, 2, ICONS.guitar, '#6a35d6');
  });
  const crateBack = () => sprite('crate-back', 84, 12, px => drawCrate(px, 0, 0, 84, 12, 7, { back: true }));
  const turntableBase = () => sprite('turntable', 44, 14, px => {
    const r = rng(5);
    px(0, 0, '#1f130a', 44, 14);
    px(1, 1, '#4a4650', 42, 4);
    px(1, 1, '#615c6b', 42, 1);
    px(1, 5, '#a06a36', 42, 8);
    px(1, 5, '#c48a4f', 42, 1);
    for (let n = 0; n < 26; n++) px(2 + Math.floor(r() * 39), 7 + Math.floor(r() * 5), '#86562a', 1 + Math.floor(r() * 3), 1);
    px(30, 8, '#1c1a23', 4, 3); px(35, 8, '#1c1a23', 4, 3);
    px(31, 9, '#615c6b', 2, 1); px(36, 9, '#615c6b', 2, 1);
    px(4, 9, '#1c1a23', 2, 2);
  });
  const tonearm = () => sprite('tonearm', 32, 9, px => {
    px(0, 2, '#0b0a0f', 6, 6); px(1, 3, '#d9d5e2', 4, 4); px(1, 6, '#8d8a96', 4, 1);
    px(5, 3, '#0b0a0f', 19, 3); px(5, 4, '#bdb9c6', 19, 1);
    px(23, 0, '#0b0a0f', 9, 9); px(24, 1, '#8d8a96', 7, 7); px(24, 1, '#b5b1bf', 7, 1); px(26, 3, '#3a3744', 3, 3);
  });

  // ---------- Утилиты ----------
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  const save = data => { try { localStorage.setItem(STORE, JSON.stringify(data)); return true; } catch { return false; } };
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const titleFromFile = file => file.replace(/^play-/i, '').replace(/\.js$/i, '').replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, ch => ch.toUpperCase());
  const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const norm = s => String(s).toLowerCase().replace(/[а-яё]/g, ch => TRANSLIT[ch]).replace(/[^a-z0-9]+/g, ' ').trim();
  const words = s => norm(s).split(' ').filter(Boolean);

  // Свои аудиофайлы храним в IndexedDB браузера (localStorage для них мал).
  const idb = (() => {
    let dbp;
    const open = () => dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('freakdj', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('files', mode), req = fn(t.objectStore('files'));
        t.oncomplete = () => res(req.result);
        t.onerror = () => rej(t.error);
      });
    };
    return { put: (k, v) => tx('readwrite', st => st.put(v, k)), get: k => tx('readonly', st => st.get(k)), del: k => tx('readwrite', st => st.delete(k)) };
  })();
  const ytId = text => {
    try {
      const u = new URL(text), h = u.hostname.replace(/^(www|m|music)\./, '');
      if (h === 'youtu.be') return /^\/[\w-]{11}/.test(u.pathname) ? u.pathname.slice(1, 12) : null;
      if (h === 'youtube.com' || h === 'youtube-nocookie.com') return u.searchParams.get('v')?.slice(0, 11) || u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] || null;
    } catch { /* не ссылка */ }
    return null;
  };

  let audioCtx;
  function sfx(type) {
    const P = { select: [880, 1320, 0.05, 'square', 0.025], eject: [320, 900, 0.16, 'triangle', 0.05], insert: [240, 80, 0.12, 'triangle', 0.07], needle: [1900, 500, 0.03, 'square', 0.03], add: [660, 1760, 0.22, 'sine', 0.05] }[type];
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = P[3];
      o.frequency.setValueAtTime(P[0], t);
      o.frequency.exponentialRampToValueAtTime(P[1], t + P[2]);
      g.gain.setValueAtTime(P[4], t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + P[2]);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + P[2] + 0.02);
    } catch { /* звук необязателен */ }
  }

  // ---------- Стили ----------
  const CSS = `
:host{all:initial}
*{box-sizing:border-box;margin:0}
img{image-rendering:pixelated;display:block;-webkit-user-drag:none;pointer-events:none}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.dj{--tx:#f1ecff;--mu:#a69fbd;--ac:#a974ff;--panel:rgba(20,16,30,.9);--box:rgba(16,12,24,.86);--line:rgba(196,178,236,.32);
  font:13px/1.25 'Pixelify Sans',ui-monospace,Menlo,monospace;color:var(--tx);user-select:none;-webkit-user-select:none;position:relative}
.dj.digital{--ac:#3fd8f6}
.dj{transition:opacity .15s,visibility .15s}
.dj.typing{opacity:0;visibility:hidden;pointer-events:none}
.panel{position:relative;display:flex;align-items:flex-end}
.drawer{position:relative;flex:none;width:34px;height:96px;transition:width .5s cubic-bezier(.2,.9,.3,1)}
.open .drawer{width:196px}
.drawer .inner{position:absolute;left:0;bottom:0;width:182px;transform:translate(-142px,16px) rotate(-6deg);transform-origin:0 100%;transition:transform .5s cubic-bezier(.2,.9,.3,1.25)}
.open .drawer .inner{transform:none}
.drawer .arrow,.drawer .label,.drawer .clipbtn{transition:opacity .25s}
.dj:not(.open) .drawer .arrow,.dj:not(.open) .drawer .label,.dj:not(.open) .drawer .clipbtn{opacity:0;pointer-events:none}
.dj:not(.open) .drawer .crate{cursor:pointer}
.float{filter:drop-shadow(0 3px 0 rgba(0,0,0,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.35))}
.addbox{position:absolute;left:0;width:260px;bottom:calc(100% + 4px);z-index:40;padding:8px;background:rgba(14,11,22,.96);border:2px solid var(--ac);border-radius:6px;box-shadow:0 0 0 2px #000a,0 0 18px color-mix(in srgb,var(--ac) 45%,transparent);animation:pop .22s cubic-bezier(.2,.9,.3,1.4)}
.addbox[hidden]{display:none}
.addbox .row{display:flex;gap:6px}
.addbox input{flex:1;min-width:0;font:inherit;font-size:13px;color:var(--tx);background:#0b0912;border:2px solid var(--line);border-radius:4px;padding:6px 7px;outline:none;user-select:text;-webkit-user-select:text}
.addbox input:focus{border-color:var(--ac)}
.addbox .attach{width:32px;flex:none;border:2px solid var(--line);border-radius:4px;display:grid;place-items:center;font-size:14px}
.addbox .attach img{width:20px;height:24px}
.addbox .attach:hover{border-color:var(--ac)}
.drop .crate{filter:drop-shadow(0 0 0 var(--ac)) drop-shadow(0 0 10px var(--ac))}
.addbox small{display:block;margin-top:5px;color:var(--mu);font-size:11px}
.crate{position:relative;height:122px;width:272px;zoom:.6667}
.bin{position:absolute;left:14px;right:14px;top:0;bottom:0;clip-path:inset(-60px 0 0 0)}
.bin .back{position:absolute;left:50%;bottom:30px;width:252px;height:36px;transform:translateX(-50%);z-index:1}
.bin .front{position:absolute;left:50%;bottom:0;width:252px;height:54px;transform:translateX(-50%);z-index:30;filter:drop-shadow(0 3px 0 rgba(0,0,0,.35))}
.records{position:absolute;inset:0;z-index:2}
.rec{position:absolute;left:50%;bottom:14px;width:87px;height:87px;margin-left:-43.5px;transition:transform .38s cubic-bezier(.2,.9,.3,1.25),opacity .3s,filter .3s;will-change:transform}
.rec .bob{position:absolute;inset:0;animation:bob 3.2s ease-in-out infinite;animation-delay:var(--d)}
.rec .sleeve{position:absolute;inset:0;width:87px;height:87px}
.rec .vin{position:absolute;left:3px;top:3px;width:81px;height:81px;transition:transform .3s cubic-bezier(.2,.9,.3,1.3),opacity .2s}
.rec.sel .vin{transform:translateY(-12px) rotate(-12deg)}
.rec.out .vin{opacity:0}
.rec:hover:not(.sel) .bob{transform:translateY(-5px)}
.rec .paper{position:absolute;left:9px;top:0;width:69px;height:87px;transition:opacity .2s}
.rec.out .paper{opacity:.25}
.rec.sel .paper,.rec.sel .sleeve{filter:drop-shadow(0 0 0 var(--ac)) drop-shadow(0 0 1px var(--ac)) drop-shadow(0 0 7px var(--ac))}
.rec.add{animation:insert .55s cubic-bezier(.2,.9,.3,1.3)}
.rec.wob .bob{animation:wob .45s cubic-bezier(.2,.9,.3,1.4)}
.empty{position:absolute;left:0;right:0;top:34px;text-align:center;color:var(--mu);font-size:12px}
.arrow{position:absolute;top:34px;z-index:35;width:18px;height:34px;display:grid;place-items:center;opacity:.8}
.arrow:hover{opacity:1}
.arrow i{width:12px;height:22px;background:var(--ac);clip-path:polygon(100% 0,100% 100%,0 50%);filter:drop-shadow(0 0 4px var(--ac))}
.arrow.r i{transform:scaleX(-1)}
.arrow.l{left:-2px}.arrow.r{right:-2px}
.table{position:relative;width:110px;height:80px;flex:none;perspective:220px;margin:0 0 4px 16px}
.table.loaded{cursor:pointer}
.tt,.st{position:absolute;inset:0}
.notes-mode .tt,.dj:not(.notes-mode) .st{display:none}
.st .stand{position:absolute;left:10px;bottom:0;width:90px;height:78px;z-index:1}
.st .sheet{position:absolute;left:32px;bottom:34px;width:46px;height:58px;z-index:2;opacity:0;transform:rotate(-2deg);transition:opacity .15s}
.table.loaded .st .sheet{opacity:1}
.st .head{position:absolute;left:36px;bottom:40px;width:2px;height:44px;z-index:3;background:var(--ac);box-shadow:0 0 6px var(--ac);display:none}
.on .st .head{display:block}
.notes-mode .bubble{left:70px;bottom:88px}
.ctrls{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin:0 0 6px 10px;align-self:flex-end}
.dj:not(.seated) .modes{display:none}
.modes{display:flex;gap:0;background:var(--box);border:2px solid var(--line);border-radius:6px;padding:2px}
.mode{width:30px;height:26px;display:grid;place-items:center;border-radius:4px;opacity:.55}
.mode:hover{opacity:.9}
.mode.on{opacity:1;background:rgba(169,116,255,.18);box-shadow:inset 0 0 0 2px var(--ac)}
.mode img{width:20px;height:20px}.mode .ic-sheet{width:16px;height:20px}
.audio{display:flex;align-items:center;gap:6px;padding:3px 6px;background:var(--box);border:2px solid var(--line);border-radius:6px}
.notes-mode .audio .spk,.notes-mode .audio .volr{display:none}
.rgb{display:none;width:26px;height:24px;flex:none}.rgb img{width:26px;height:24px}
.notes-mode .rgb{display:block}
.rgb.on{filter:drop-shadow(0 0 4px var(--ac))}
.rgb:hover{transform:translateY(-1px)}
.rg{--h:min(360px,50vh);position:fixed;left:50%;bottom:64px;height:var(--h);width:calc(var(--h)*.75);transform:translate(-50%,16px);pointer-events:none;z-index:40;opacity:0;transform:translateY(16px);transition:opacity .3s,transform .3s}
.rg.show{opacity:1;transform:translate(-50%,0)}
.rg canvas{width:100%;height:100%;image-rendering:pixelated;display:block;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5))}
.rg-score{position:absolute;left:calc(100% + 4px);bottom:18%;font-size:18px;font-weight:600;color:#fff;text-shadow:2px 2px 0 #2b1f40;white-space:nowrap}
.rg-mult{position:absolute;right:calc(100% + 4px);bottom:18%;min-width:34px;padding:2px 5px;text-align:center;font-size:16px;font-weight:600;color:#fff;background:#2b2140;border:2px solid #0b0a0f;box-shadow:inset 0 0 0 1px var(--line)}
.rg-mult.x2{background:#2f6b8f}.rg-mult.x3{background:#8f5a2f}.rg-mult.x4{background:#8a2fa0;box-shadow:0 0 10px #c58bff;animation:blink .6s steps(2) infinite}
.rg-combo{position:absolute;left:calc(100% + 4px);bottom:calc(18% + 26px);font-size:13px;color:var(--mu);text-shadow:1px 1px 0 #000}
.rg-judge{position:absolute;left:0;right:0;top:44%;text-align:center;font-size:16px;font-weight:600;opacity:0;text-shadow:2px 2px 0 #0b0a0f}
.rg-judge.p{color:#ffd34d}.rg-judge.g{color:#3fe0a0}.rg-judge.m{color:#ff7a8a}
.rg-judge.pop{animation:judge .6s ease-out forwards}
.rg-res{position:absolute;left:10px;right:10px;top:22%;padding:12px 8px;text-align:center;color:#fff;background:rgba(14,11,22,.95);border:2px solid var(--line);border-radius:6px;box-shadow:0 0 0 2px #0b0a0f}
.rg-res.pop{animation:pop .35s cubic-bezier(.2,.9,.3,1.4)}
.rg-res b{display:block;font-size:24px;margin:6px 0 2px;text-shadow:2px 2px 0 #2b1f40}
.rg-res em{display:block;font-style:normal;color:#ffd34d;font-size:13px;animation:blink .5s steps(2) 6}
.rg-res span{display:block;color:var(--mu);font-size:12px;margin-top:4px}
.stars{display:flex;justify-content:center;gap:4px}
.stars i{width:18px;height:18px;background:#3a3546;clip-path:polygon(50% 0,62% 36%,100% 38%,70% 60%,80% 100%,50% 76%,20% 100%,30% 60%,0 38%,38% 36%)}
.stars i.on{background:#ffd34d;filter:drop-shadow(0 0 4px #ffd34d)}
@keyframes judge{0%{opacity:0;transform:scale(.7)}15%{opacity:1;transform:scale(1.15)}30%{transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
.micb{width:14px;height:20px;flex:none}.micb img{width:14px;height:20px}
.micb.off{filter:drop-shadow(0 0 3px #ff7a8a)}
.spk{width:36px;height:21px;flex:none}.spk img{width:36px;height:21px}
.spk.on{filter:drop-shadow(0 0 4px var(--ac))}
.volr{-webkit-appearance:none;appearance:none;width:84px;height:16px;margin:0;background:transparent;cursor:pointer;--p:80%}
.volr::-webkit-slider-runnable-track{height:6px;background:linear-gradient(to right,var(--ac) var(--p),#1c1a23 var(--p));box-shadow:0 0 0 2px #0b0a0f}
.volr::-webkit-slider-thumb{-webkit-appearance:none;width:8px;height:14px;margin-top:-4px;background:#f1ecff;box-shadow:0 0 0 2px #0b0a0f}
.volr::-moz-range-track{height:6px;background:#1c1a23;box-shadow:0 0 0 2px #0b0a0f}
.volr::-moz-range-progress{height:6px;background:var(--ac)}
.volr::-moz-range-thumb{width:8px;height:14px;border:0;border-radius:0;background:#f1ecff;box-shadow:0 0 0 2px #0b0a0f}
.volr:focus{outline:none}
.screen{position:absolute;left:-11px;bottom:84px;width:132px;height:74px;z-index:4;display:none;background:#000;border:3px solid #2a170a;box-shadow:inset 0 0 0 1px #6b411d,0 3px 0 rgba(0,0,0,.45)}
.yt .screen{display:block}
.screen iframe{width:100%;height:100%;border:0;display:block;pointer-events:none}
.label{position:absolute;left:0;width:150px;bottom:calc(100% + 6px);z-index:31;text-align:center;font-weight:600;font-size:14px;line-height:18px;color:#fff;
  text-shadow:2px 2px 0 #2b1f40,0 0 3px rgba(0,0,0,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;letter-spacing:.02em}
.label.long{font-size:12px}
.tlabel{position:absolute;left:50%;width:190px;bottom:calc(100% + 6px);transform:translateX(-50%);z-index:8;text-align:center;font-weight:600;font-size:14px;line-height:18px;color:#fff;
  text-shadow:2px 2px 0 #2b1f40,0 0 3px rgba(0,0,0,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;letter-spacing:.02em;opacity:0;transition:opacity .25s}
.tlabel.long{font-size:12px}
.table.loaded .tlabel{opacity:1}
.notes-mode .tlabel{bottom:100px}
.yt .tlabel{bottom:166px}
.label.pop{animation:burn .35s steps(3)}
.clipbtn{position:absolute;right:2px;bottom:calc(100% - 4px);width:24px;height:32px;z-index:32}
.clipbtn img{width:24px;height:32px}
.clipbtn:hover{transform:translateY(-3px) rotate(-6deg);transition:transform .15s;filter:drop-shadow(0 0 5px var(--ac))}
.adding .clipbtn{transform:translateY(-3px) rotate(-6deg);filter:drop-shadow(0 0 5px var(--ac))}
.keycap{position:fixed;left:8px;bottom:150px;z-index:7;opacity:.85;width:46px;height:28px;display:none;animation:bob 1.6s ease-in-out infinite}
.locked .keycap{display:block}
.bubble{position:absolute;left:38px;bottom:66px;width:45px;height:42px;z-index:6;display:none;animation:bob 1s ease-in-out infinite}
.waiting .bubble{display:block}
.led{position:absolute;left:1px;bottom:9px;width:6px;height:6px;z-index:2;background:#1c1a23}
.loading .led,.waiting .led{background:#ffd36b;box-shadow:0 0 6px #ffd36b;animation:blink .8s steps(2) infinite}
.on .led{background:var(--ac);box-shadow:0 0 6px var(--ac)}
.strip{position:absolute;left:13px;bottom:13px;width:58px;height:6px;z-index:2;background:#1c1a23;box-shadow:0 0 0 2px #2a170a}
.strip i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--ac);box-shadow:0 0 6px var(--ac)}
.table .base{position:absolute;left:-11px;bottom:0;width:132px;height:42px;z-index:1}
.mat{position:absolute;left:8px;bottom:27px;width:72px;height:26px;z-index:2;border-radius:50%;background:#16141c;box-shadow:inset 0 -2px 0 #2c2936}
.platter{position:absolute;left:3px;bottom:22px;width:81px;height:81px;transform:rotateX(64deg);transform-origin:50% 100%;z-index:3}
.platter img{width:81px;height:81px;opacity:0;transition:opacity .15s}
.table.loaded .platter img{opacity:1}
.table.spin .platter img{animation:spin 1.8s linear infinite}
.table .arm{position:absolute;right:-6px;bottom:40px;width:64px;height:18px;transform-origin:56px 9px;transform:rotate(24deg);transition:transform .45s cubic-bezier(.3,.8,.3,1.2);z-index:5}
.table.armdown .arm{transform:rotate(-6deg)}
.notes{position:absolute;inset:-40px 0 30px;pointer-events:none;overflow:visible}
.note{position:absolute;bottom:0;font-size:20px;color:var(--ac);text-shadow:0 0 6px var(--ac),0 2px 0 #000;animation:float 1.9s ease-out forwards}
.toast{position:absolute;left:0;right:0;bottom:calc(100% + 4px);padding:6px 9px;background:rgba(14,11,22,.95);border:2px solid var(--line);border-radius:6px;font-size:12px;opacity:0;transform:translateY(4px);transition:.2s;pointer-events:none}
.toast.show{opacity:1;transform:none}
.dj.adding .toast{bottom:calc(100% + 74px)}
.toast.err{border-color:#ff7a8a}
.flyer{position:absolute;z-index:50;pointer-events:none;filter:drop-shadow(0 6px 4px rgba(0,0,0,.5))}
.spark{position:absolute;z-index:60;width:4px;height:4px;pointer-events:none;box-shadow:0 0 6px currentColor;background:currentColor}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes bob{0%,100%{translate:0 0}50%{translate:0 -2px}}
@keyframes wob{0%{transform:translateY(0) rotate(0)}40%{transform:translateY(-10px) rotate(-5deg)}70%{transform:translateY(-3px) rotate(3deg)}100%{transform:none}}
@keyframes insert{0%{transform:translateY(-70px) scale(.4);opacity:0}60%{opacity:1}}
@keyframes float{0%{transform:translate(0,0) scale(.6);opacity:0}15%{opacity:1}100%{transform:translate(var(--x),-58px) scale(1.1) rotate(var(--r));opacity:0}}
@keyframes eq{0%{height:3px}100%{height:12px}}
@keyframes pop{0%{transform:scale(.9);opacity:0}}
@keyframes blink{50%{opacity:.45}}
@keyframes burn{0%{opacity:.2}50%{opacity:.7}}
@keyframes wiggle{25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;

  // ---------- Состояние ----------
  const saved = load();
  const state = {
    all: [], tracks: [], sel: 0, mode: 'records', notesPref: saved.mode === 'notes', seated: false, broadcast: !!saved.broadcast, voice: saved.voice !== false, custom: Array.isArray(saved.custom) ? saved.custom : [],
    loaded: null,   // пластинка на проигрывателе
    flying: false,
    status: 'idle', // idle | loading | waiting | playing | paused
    hover: false,
    volume: Number.isFinite(saved.volume) ? saved.volume : 0.8,
    rhythm: [3, 4, 5].includes(saved.rhythm) ? saved.rhythm : 0,   // ритм-игра в режиме нот: 0 — выкл, иначе число дорожек
    best: saved.best && typeof saved.best === 'object' ? saved.best : {},
  };
  let hudOptions = {};
  const persist = () => save({ selId: state.tracks[state.sel]?.id, mode: state.notesPref ? 'notes' : 'records', broadcast: state.broadcast, voice: state.voice, volume: state.volume, rhythm: state.rhythm, best: state.best, custom: state.custom.map(({ el, _score, _song, _parts, ...t }) => t) });

  // ---------- DOM ----------
  const host = document.createElement('freakrating-dj');
  host.style.cssText = 'all:initial!important;position:fixed!important;left:0!important;bottom:0!important;z-index:2147483647!important;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>
<div class="dj">
  <section class="panel" aria-label="FreakRating DJ">
    <div class="addbox" hidden><div class="row"><button class="attach" title="Приложить GP или WAV"><img alt=""></button><input placeholder="Песня или ссылка YouTube" spellcheck="false"><input class="file" type="file" hidden multiple accept=".gp,.gp3,.gp4,.gp5,.gpx,.gtp,.wav,.mp3,.ogg,.m4a,.flac,audio/*"></div><small>Перетащи сюда GP или WAV</small></div>
    <div class="drawer"><div class="inner">
      <div class="crate float"><button class="arrow l" aria-label="Предыдущая"><i></i></button>
        <div class="bin"><img class="back" alt=""><div class="records"></div><img class="front" alt=""><div class="empty">Загружаю пластинки…</div></div>
        <button class="arrow r" aria-label="Следующая"><i></i></button></div>
      <div class="label"></div>
      <button class="clipbtn float" aria-label="Добавить пластинку"><img alt=""></button>
    </div></div>
    <div class="table float">
      <div class="tt"><div class="mat"></div><div class="platter"><img alt=""></div><img class="arm" alt=""><img class="base" alt=""><i class="led"></i><span class="strip"><i></i></span></div>
      <div class="st"><img class="stand" alt=""><img class="sheet" alt=""><i class="head"></i></div>
      <div class="tlabel"></div><img class="bubble" alt=""><div class="screen"></div><div class="notes"></div></div>
    <div class="ctrls">
      <div class="modes"><button class="mode" data-mode="records" title="Пластинки"><img class="ic-vinyl" alt=""></button><button class="mode" data-mode="notes" title="Ноты — играть на гитаре в игре"><img class="ic-sheet" alt=""></button></div>
      <div class="audio"><button class="spk" title="Трансляция в войс-чат"><img alt=""></button><button class="micb" title="Твой микрофон"><img alt=""></button><button class="rgb" title="Ритм-игра"><img alt=""></button><input class="volr" type="range" min="0" max="100" step="1" aria-label="Громкость"></div>
    </div>
    <div class="toast"></div>
  </section>
  <img class="keycap" alt="">
</div>`;
  const $ = sel => root.querySelector(sel);
  const dj = $('.dj'), panel = $('.panel'), recordsEl = $('.records'), table = $('.table'), addbox = $('.addbox'), input = $('.addbox input');
  $('.bin .back').src = crateBack();
  $('.bin .front').src = crateFront();
  $('.table .base').src = turntableBase();
  $('.table .arm').src = tonearm();
  $('.clipbtn img').src = clipboardSprite();
  $('.keycap').src = keycapSprite();
  $('.bubble').src = bubbleSprite();
  $('.addbox .attach img').src = attachSprite();
  const fileInput = $('.addbox .file');
  $('.st .stand').src = standSprite();
  $('.mode .ic-vinyl').src = vinylSprite('guitar');
  $('.mode .ic-sheet').src = sheetSprite(280);
  const volr = $('.volr');

  if (!document.querySelector('link[data-freakdj-font]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&display=swap';
    link.dataset.freakdjFont = '';
    document.head.append(link);
  }

  // ---------- Ритм-игра (режим нот, по желанию) ----------
  // Ноты песни падают по дорожке к линии удара, игрок жмёт D F J K L. Попал — нота звучит на игровой гитаре
  // (guitarPlayer.strike, её слышат все), промахнулся — нота выпадает из песни. Остальное гитара играет сама.
  const rhythm = (() => {
    const KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'], CAPS = ['D', 'F', 'J', 'K', 'L'];
    const COLORS = ['#3fe0a0', '#ff5f7e', '#ffd34d', '#4fb6ff', '#c58bff'];
    const DIFF = { 3: { gap: 0.42, look: 1.9, chords: false }, 4: { gap: 0.26, look: 1.6, chords: true }, 5: { gap: 0.17, look: 1.35, chords: true } };
    const LEAD = 2.4, PERFECT = 0.05, GREAT = 0.1, WINDOW = 0.14;
    const W = 120, H = 160, Y0 = 134, YTOP = 8, K = 2.6, LANE = 20;

    const el = document.createElement('div');
    el.className = 'rg';
    el.innerHTML = `<canvas width="${W}" height="${H}"></canvas><div class="rg-mult"></div><div class="rg-score">0</div><div class="rg-combo"></div><div class="rg-judge"></div><div class="rg-res" hidden></div>`;
    dj.append(el);
    const cv = el.querySelector('canvas'), g = cv.getContext('2d');
    const ui = { mult: el.querySelector('.rg-mult'), score: el.querySelector('.rg-score'), combo: el.querySelector('.rg-combo'), judge: el.querySelector('.rg-judge'), res: el.querySelector('.rg-res') };

    let phase = 'idle', s = null, raf = 0, resTimer = 0;

    const midiOf = n => {
      const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(n));
      return m ? 12 * (Number(m[3]) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : null;
    };

    // Чарт: мелодия (верхняя нота каждого удара), прореженная по сложности; аккорды — двумя дорожками.
    function build(score, bpm, lanes) {
      const cfg = DIFF[lanes], beat = 60 / bpm, items = [], byEvent = new Map();
      for (const e of score) {
        const at = Number(e.at), dur = Number(e.dur ?? 1);
        if (!Number.isFinite(at)) continue;
        const list = [];
        for (const n of (Array.isArray(e.notes) ? e.notes : [e.note]).filter(Boolean)) {
          const m = midiOf(n);
          if (m !== null) { const it = { n, m, at, dur, taken: false }; items.push(it); list.push(it); }
        }
        byEvent.set(e, list);
      }
      items.sort((a, b) => a.at - b.at);
      const groups = [];
      for (const it of items) { const last = groups.at(-1); if (last && (it.at - last.at) * beat < 0.03) last.items.push(it); else groups.push({ at: it.at, items: [it] }); }
      const gems = [];
      let lastT = -1e9;
      for (const grp of groups) {
        const t = grp.at * beat;
        if (t - lastT < cfg.gap) continue;
        lastT = t;
        const top = grp.items.reduce((a, b) => (b.m > a.m ? b : a));
        const chord = cfg.chords && new Set(grp.items.map(i => i.m)).size >= 3;
        const names = new Set(chord ? grp.items.map(i => i.n) : [top.n]);
        grp.items.forEach(i => { if (names.has(i.n)) i.taken = true; });
        gems.push({ t: t + LEAD, d: top.dur * beat, m: top.m, notes: [...names], chord });
      }
      // Дорожка по рисунку мелодии: выше нота — правее, в пределах соседних нот (±2.5 с).
      let prev = null;
      for (const gem of gems) {
        const near = gems.filter(x => Math.abs(x.t - gem.t) < 2.5).map(x => x.m);
        const lo = Math.min(...near), hi = Math.max(...near), span = hi - lo;
        let lane = span < lanes - 1 ? Math.round(gem.m - lo + (lanes - 1 - span) / 2) : Math.round(((gem.m - lo) / span) * (lanes - 1));
        if (prev) {
          if (gem.m === prev.m) lane = prev.lane;
          else if (gem.m > prev.m && lane <= prev.lane) lane = prev.lane + 1;
          else if (gem.m < prev.m && lane >= prev.lane) lane = prev.lane - 1;
        }
        gem.lane = Math.max(0, Math.min(lanes - 1, lane));
        gem.lanes = gem.chord ? [gem.lane, gem.lane >= 2 ? gem.lane - 2 : gem.lane + 2].sort((a, b) => a - b) : [gem.lane];
        prev = gem;
      }
      // Длинные ноты: держать клавишу. Не залезаем на следующую ноту той же дорожки.
      gems.forEach((gem, i) => {
        gem.sus = 0;
        if (gem.d < 0.5) return;
        const next = gems.slice(i + 1).find(x => x.lanes.some(l => gem.lanes.includes(l)));
        const sus = Math.min(gem.d, 4, next ? next.t - gem.t - 0.15 : 4);
        if (sus >= 0.4) gem.sus = sus;
      });
      const auto = [];
      for (const e of score) {
        const rest = (byEvent.get(e) || []).filter(i => !i.taken).map(i => i.n);
        if (!rest.length && !e.chord) continue;
        auto.push({ ...e, at: Number(e.at) + LEAD / beat, notes: rest });
      }
      const end = Math.max(0, ...gems.map(x => x.t + Math.max(x.sus, 0.2)));
      return { gems, auto, until: (end + 0.3) / beat, end, beat };
    }
    // Максимум очков (все ноты идеально, все длинные дотянуты) — для звёзд.
    function maxScore(gems) {
      let sc = 0, combo = 0;
      for (const gem of gems) { combo++; const m = mult(combo); sc += 100 * m + Math.round(gem.sus * 60) * m; }
      return Math.max(1, sc);
    }
    const mult = combo => 1 + Math.min(3, Math.floor(combo / 10));
    const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');   // у пиксельного шрифта нет узкого пробела ru-RU

    function arm(track, score, bpm, lanes) {
      abort();
      if (!DIFF[lanes] || !score?.length) return null;
      const c = build(score, bpm, lanes);
      if (!c.gems.length) return null;
      s = { ...c, track, lanes, look: DIFF[lanes].look, max: maxScore(c.gems), t0: 0, score: 0, combo: 0, best: 0, hits: 0, perfect: 0, miss: 0, ended: false, held: new Set(), flash: [0, 0, 0, 0, 0], sparks: [], judgeAt: 0 };
      phase = 'armed';
      return c;
    }
    function begin() {
      if (phase !== 'armed' || !s) return;
      phase = 'running';
      s.t0 = performance.now();
      ui.res.hidden = true;
      el.classList.add('show');
      renderStats();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
    function abort() {
      phase = 'idle';
      cancelAnimationFrame(raf);
      clearTimeout(resTimer);
      if (s) for (const gem of s.gems) gem.release?.();
      s = null;
      el.classList.remove('show');
      ui.res.hidden = true;
    }
    const now = () => (performance.now() - s.t0) / 1000;

    function press(lane) {
      const t = now();
      s.held.add(lane);
      s.flash[lane] = t;
      let best = null;
      for (const gem of s.gems) {
        if (gem.done || !gem.lanes.includes(lane) || gem.pressed?.has(lane)) continue;
        const dt = Math.abs(gem.t - t);
        if (dt <= WINDOW && (!best || dt < Math.abs(best.t - t))) best = gem;
        if (gem.t - t > WINDOW) break;
      }
      if (!best) return;
      (best.pressed ||= new Map()).set(lane, t);
      if (best.pressed.size === best.lanes.length) hit(best);
    }
    function release(lane) {
      s.held.delete(lane);
      const t = now();
      for (const gem of s.gems) if (gem.holding && gem.lanes.includes(lane)) {
        gem.holding = false;
        if (t < gem.t + gem.sus - 0.12) gem.release?.();   // отпустил рано — нота обрывается
      }
    }
    function hit(gem) {
      const err = Math.max(...[...gem.pressed.values()].map(x => Math.abs(x - gem.t)));
      gem.done = 'hit';
      s.combo++; s.hits++;
      s.best = Math.max(s.best, s.combo);
      const perfect = err <= PERFECT;
      if (perfect) s.perfect++;
      s.score += (perfect ? 100 : err <= GREAT ? 70 : 40) * mult(s.combo);
      judge(perfect ? 'Идеально' : err <= GREAT ? 'Отлично' : 'Норм', perfect ? 'p' : 'g');
      try { gem.release = window.guitarPlayer?.strike?.(gem.notes, (gem.sus || Math.min(gem.d, 1.2)) * 1000 + 40); } catch { /* гитара занята */ }
      if (gem.sus) { gem.holding = true; gem.holdFrom = gem.t; }
      for (const l of gem.lanes) sparks(l, 10);
      renderStats();
    }
    function miss(gem) {
      gem.done = 'miss';
      s.miss++;
      if (s.combo >= 10) judge('Серия прервана', 'm'); else judge('Мимо', 'm');
      s.combo = 0;
      renderStats();
    }
    function judge(text, cls) {
      ui.judge.textContent = text;
      ui.judge.className = `rg-judge ${cls}`;
      void ui.judge.offsetWidth;
      ui.judge.classList.add('pop');
    }
    function renderStats() {
      const m = mult(s.combo);
      ui.score.textContent = fmt(s.score);
      ui.mult.textContent = `×${m}`;
      ui.mult.className = `rg-mult x${m}`;
      ui.combo.textContent = s.combo >= 5 ? s.combo : '';
    }

    // ---- Отрисовка: пиксельная дорожка в перспективе ----
    const proj = sAhead => {
      const z = 1 + sAhead * K, sc = 1 / z;
      return { y: Y0 - (Y0 - YTOP) * (1 - sc) / (1 - 1 / (1 + K)), sc };
    };
    const laneX = (lane, sc) => W / 2 + (lane - (s.lanes - 1) / 2) * LANE * sc;
    function sparks(lane, n) {
      const x = laneX(lane, 1);
      for (let i = 0; i < n; i++) s.sparks.push({ x, y: Y0, vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 70, life: 0.45, c: COLORS[lane] });
    }
    let lastFrame = 0;
    function frame(ts) {
      if (phase !== 'running' || !s) return;
      if (document.hidden) { raf = requestAnimationFrame(frame); return; }
      const dtf = Math.min(0.05, (ts - (lastFrame || ts)) / 1000);
      lastFrame = ts;
      const t = now();
      for (const gem of s.gems) {
        if (!gem.done && t > gem.t + WINDOW) miss(gem);
        if (gem.holding) {
          const to = Math.min(t, gem.t + gem.sus);
          s.score += Math.round((to - gem.holdFrom) * 60) * mult(s.combo);
          gem.holdFrom = to;
          if (t >= gem.t + gem.sus) gem.holding = false;
          else if (Math.random() < 0.3) for (const l of gem.lanes) sparks(l, 1);
        }
      }
      if (s.gems.some(x => x.holding)) renderStats();
      draw(t, dtf);
      if ((s.ended || t > s.end + 1.5) && t > s.end + 0.6) return finish();
      raf = requestAnimationFrame(frame);
    }
    function draw(t, dtf) {
      g.clearRect(0, 0, W, H);
      const far = proj(1), near = proj(-0.06), half = (s.lanes * LANE) / 2;
      // полотно
      g.fillStyle = 'rgba(12,9,20,.82)';
      g.beginPath();
      g.moveTo(W / 2 - half * far.sc, far.y); g.lineTo(W / 2 + half * far.sc, far.y);
      g.lineTo(W / 2 + half * near.sc, near.y); g.lineTo(W / 2 - half * near.sc, near.y); g.fill();
      // доли
      g.fillStyle = 'rgba(196,178,236,.16)';
      const beat = s.beat;
      for (let k = Math.ceil((t - 0.1) / beat); k * beat < t + s.look; k++) {
        const p = proj((k * beat - t) / s.look);
        g.fillRect(Math.round(W / 2 - half * p.sc), Math.round(p.y), Math.round(half * 2 * p.sc), 1);
      }
      // разделители дорожек
      for (let l = 0; l <= s.lanes; l++) {
        const off = (l - s.lanes / 2) * LANE;
        g.strokeStyle = l === 0 || l === s.lanes ? 'rgba(169,116,255,.55)' : 'rgba(196,178,236,.14)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(W / 2 + off * far.sc, far.y); g.lineTo(W / 2 + off * near.sc, near.y); g.stroke();
      }
      // хвосты длинных нот
      for (const gem of s.gems) {
        if (!gem.sus || gem.t - t > s.look || gem.t + gem.sus < t - 0.1) continue;
        if (gem.done === 'hit' && !gem.holding) continue;
        const a = proj(Math.max(gem.holding ? 0 : -0.06, (gem.t - t) / s.look)), b = proj(Math.min(1, (gem.t + gem.sus - t) / s.look));
        for (const l of gem.lanes) {
          g.fillStyle = gem.done === 'miss' ? 'rgba(120,112,140,.5)' : COLORS[l] + (gem.holding ? 'ff' : 'aa');
          g.beginPath();
          g.moveTo(laneX(l, b.sc) - 1.5 * b.sc, b.y); g.lineTo(laneX(l, b.sc) + 1.5 * b.sc, b.y);
          g.lineTo(laneX(l, a.sc) + 2.5 * a.sc, a.y); g.lineTo(laneX(l, a.sc) - 2.5 * a.sc, a.y); g.fill();
        }
      }
      // линия удара и приёмники
      for (let l = 0; l < s.lanes; l++) {
        const x = Math.round(laneX(l, 1)), on = s.held.has(l), glow = Math.max(0, 1 - (t - s.flash[l]) / 0.15);
        g.fillStyle = '#0b0a0f'; g.fillRect(x - 8, Y0 - 3, 16, 7);
        g.fillStyle = COLORS[l]; g.globalAlpha = on ? 1 : 0.45 + glow * 0.5;
        g.fillRect(x - 7, Y0 - 2, 14, 5);
        g.fillStyle = '#0b0a0f'; g.globalAlpha = 1;
        if (!on) g.fillRect(x - 5, Y0 - 1, 10, 3);
        // клавиша под дорожкой
        g.fillStyle = '#0b0a0f'; g.fillRect(x - 5, Y0 + 8, 11, 11);
        g.fillStyle = on ? COLORS[l] : '#e6e2ef'; g.fillRect(x - 4, Y0 + 9, 9, on ? 9 : 7);
        g.fillStyle = on ? '#ffffff' : '#8d8a96'; if (!on) g.fillRect(x - 4, Y0 + 16, 9, 2);
        drawCap(CAPS[l], x - 2, Y0 + (on ? 11 : 10));
      }
      // ноты (дальние — первыми)
      for (let i = s.gems.length - 1; i >= 0; i--) {
        const gem = s.gems[i];
        if (gem.done === 'hit') continue;
        const ahead = (gem.t - t) / s.look;
        if (ahead > 1 || ahead < -0.12) continue;
        const p = proj(ahead), w = Math.max(3, Math.round(15 * p.sc)), h = Math.max(2, Math.round(6 * p.sc));
        for (const l of gem.lanes) {
          const x = Math.round(laneX(l, p.sc) - w / 2), y = Math.round(p.y - h / 2);
          g.fillStyle = '#0b0a0f'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
          g.fillStyle = gem.done === 'miss' ? '#5a5566' : COLORS[l]; g.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x, y, w, 1);
          if (gem.chord) { g.fillStyle = '#ffffff'; g.fillRect(x + Math.floor(w / 2) - 1, y + Math.floor(h / 2), 2, 1); }
        }
      }
      // искры
      for (const p of s.sparks) { p.life -= dtf; p.x += p.vx * dtf; p.y += p.vy * dtf; p.vy += 160 * dtf; g.fillStyle = p.c; g.globalAlpha = Math.max(0, p.life / 0.45); g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
      g.globalAlpha = 1;
      s.sparks = s.sparks.filter(p => p.life > 0);
      // прогресс песни по краю
      const prog = Math.min(1, Math.max(0, (t - LEAD) / Math.max(1, s.end - LEAD)));
      g.fillStyle = '#1c1a23'; g.fillRect(4, H - 3, W - 8, 2);
      g.fillStyle = '#a974ff'; g.fillRect(4, H - 3, Math.round((W - 8) * prog), 2);
    }
    const GLYPHS = { D: ['##.', '#.#', '#.#', '#.#', '##.'], F: ['###', '#..', '##.', '#..', '#..'], J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '##.', '#..', '##.', '#.#'], L: ['#..', '#..', '#..', '#..', '###'] };
    function drawCap(ch, x, y) {
      g.fillStyle = '#2a2733';
      GLYPHS[ch].forEach((row, iy) => [...row].forEach((c, ix) => c === '#' && g.fillRect(x + ix, y + iy, 1, 1)));
    }

    function finish() {
      phase = 'done';
      cancelAnimationFrame(raf);
      const total = s.gems.length, acc = total ? (s.perfect + (s.hits - s.perfect) * 0.7) / total : 0;
      const ratio = s.score / s.max, stars = [0.12, 0.3, 0.5, 0.7, 0.88].filter(x => ratio >= x).length;
      const key = `${s.track.id}|${s.lanes}`, prevBest = state.best[key] || 0, record = s.score > prevBest;
      if (record) { state.best[key] = s.score; persist(); }
      ui.res.innerHTML = `<div class="stars">${[0, 1, 2, 3, 4].map(i => `<i class="${i < stars ? 'on' : ''}"></i>`).join('')}</div>
        <b>${fmt(s.score)}</b>${record && prevBest ? '<em>рекорд!</em>' : ''}
        <span>${Math.round(acc * 100)}% · серия ${s.best} · ${s.hits}/${total}</span>`;
      ui.res.hidden = false;
      ui.res.classList.remove('pop'); void ui.res.offsetWidth; ui.res.classList.add('pop');
      if (stars >= 3) sfx('add');
      resTimer = setTimeout(() => { if (phase === 'done') abort(); }, 7000);
    }

    // Клавиши дорожек перехватываем раньше игры (её обработчики висят на document), иначе гитара сыграет их ещё раз.
    const onKey = e => {
      if (phase !== 'running' || !s || e.ctrlKey || e.metaKey || e.altKey) return;
      const lane = KEYS.indexOf(e.code);
      if (lane < 0 || lane >= s.lanes) return;
      const tgt = e.composedPath()[0];
      if (tgt instanceof HTMLElement && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === 'keydown') { if (!e.repeat) press(lane); } else release(lane);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', () => { if (s) for (const l of [...s.held]) release(l); });
    window.addEventListener('guitarplayer', e => {
      const st = e.detail?.state;
      if (st === 'playing') begin();
      else if (st === 'ended' && phase === 'running' && s) s.ended = true;
    });
    return {
      arm, abort,
      active: () => phase === 'running' || phase === 'armed',
      debug: () => s,
      destroy() { abort(); window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); },
    };
  })();

  // ---------- Рендер ящика ----------
  function slot(o) {
    const a = Math.abs(o), s = Math.sign(o);
    if (a === 0) return { t: 'translate(0,-16px) rotate(-2deg)', z: 20, op: 1, f: 'none' };
    const X = [0, 54, 88, 108][Math.min(a, 3)], R = [0, 7, 11, 14][Math.min(a, 3)], S = [1, 0.86, 0.75, 0.66][Math.min(a, 3)];
    return { t: `translate(${s * X}px,${a * 3}px) rotate(${s * R}deg) scale(${S})`, z: 20 - a, op: a > 2 ? 0 : 1, f: `brightness(${1 - a * 0.2})` };
  }
  function buildRecords() {
    recordsEl.textContent = '';
    state.tracks.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'rec';
      el.dataset.i = i;
      el.style.setProperty('--d', `${-(i * 0.37) % 3}s`);
      if (state.mode === 'notes') {
        el.innerHTML = `<div class="bob"><img class="paper" alt=""></div>`;
        el.querySelector('.paper').src = sheetSprite(hash(t.id) % 360);
      } else {
        el.innerHTML = `<div class="bob"><img class="sleeve" alt=""><img class="vin" alt=""></div>`;
        el.querySelector('.sleeve').src = sleeveSprite(hash(t.id) % 360);
        el.querySelector('.vin').src = vinylSprite(t.type);
      }
      el.title = t.title;
      t.el = el;
      recordsEl.append(el);
    });
    $('.empty').style.display = state.tracks.length ? 'none' : '';
    layout();
  }
  function layout() {
    state.tracks.forEach((t, i) => {
      const s = slot(i - state.sel), el = t.el;
      el.style.transform = s.t;
      el.style.zIndex = s.z;
      el.style.opacity = s.op;
      el.style.filter = s.f;
      el.style.pointerEvents = s.op ? '' : 'none';
      el.classList.toggle('sel', i === state.sel);
      el.classList.toggle('out', state.loaded === t);
    });
    const t = state.tracks[state.sel], label = $('.label');
    if (label.textContent !== (t?.title || '')) {
      label.textContent = t?.title || '';
      label.classList.toggle('long', !!t && t.title.length > 17);
      label.classList.remove('pop'); void label.offsetWidth; label.classList.add('pop');
    }
    const tl = $('.tlabel'), lt = state.loaded?.title || '';
    if (tl.textContent !== lt && lt) { tl.textContent = lt; tl.classList.toggle('long', lt.length > 20); }
    dj.classList.toggle('locked', !!document.pointerLockElement);
    dj.classList.toggle('digital', (state.loaded || t)?.type === 'digital');
  }
  function select(i, { sound = true } = {}) {
    if (!state.tracks.length) return;
    const n = state.tracks.length, next = ((i % n) + n) % n;
    if (next === state.sel) return;
    state.sel = next;
    layout();
    const el = state.tracks[next].el;
    el.classList.remove('wob'); void el.offsetWidth; el.classList.add('wob');
    if (sound) sfx('select');
    const r = rel(el.querySelector('.bob').firstElementChild);
    burst(r.x + r.w / 2, r.y + 10, 6);
    persist();
  }

  // ---------- Эффекты ----------
  function rel(el) {
    const a = el.getBoundingClientRect(), p = panel.getBoundingClientRect();
    return { x: a.left - p.left, y: a.top - p.top, w: a.width, h: a.height };
  }
  function burst(x, y, n = 8) {
    const color = getComputedStyle(dj).getPropertyValue('--ac');
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      s.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
      panel.append(s);
      const a = Math.random() * Math.PI * 2, d = 14 + Math.random() * 22;
      s.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d - 10}px) scale(.4)`, opacity: 0 }],
        { duration: 450 + Math.random() * 250, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => s.remove();
    }
  }
  // Полёт предмета из ящика на проигрыватель/пюпитр (back — обратно).
  function fly(fromEl, toEl, src, { back = false, spin = true } = {}) {
    return new Promise(resolve => {
      const s = rel(fromEl), t = rel(toEl);
      const img = document.createElement('img');
      img.className = 'flyer';
      img.src = src;
      const h = spin ? s.w : s.h;
      img.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${h}px`;
      panel.append(img);
      const dx = t.x + t.w / 2 - (s.x + s.w / 2), dy = t.y + t.h / 2 - (s.y + h / 2), kx = t.w / s.w, ky = t.h / h;
      const r = spin ? [0, -10, 170, 360] : [0, -12, 8, -2];
      let frames = [
        { transform: `translate(0,0) scale(1,1) rotate(${r[0]}deg)` },
        { transform: `translate(0,-28px) scale(1.06,1.06) rotate(${r[1]}deg)`, offset: 0.28 },
        { transform: `translate(${dx * 0.55}px,${Math.min(dy * 0.4, 0) - 34}px) scale(${(1 + kx) / 2},${(1 + ky) / 2}) rotate(${r[2]}deg)`, offset: 0.66 },
        { transform: `translate(${dx}px,${dy}px) scale(${kx},${ky}) rotate(${r[3]}deg)` },
      ];
      if (back) frames = frames.reverse().map((f, i, all) => ({ transform: f.transform, offset: i === 0 ? 0 : i === all.length - 1 ? 1 : 1 - (f.offset ?? 0) }));
      img.animate(frames, { duration: back ? 560 : 760, easing: 'cubic-bezier(.35,.7,.3,1)' }).onfinish = () => { img.remove(); resolve(); };
    });
  }
  const notesMode = () => state.mode === 'notes';
  const flyPair = t => notesMode()
    ? [t.el.querySelector('.paper'), $('.st .sheet'), sheetSprite(hash(t.id) % 360), false]
    : [t.el.querySelector('.vin'), $('.platter img'), vinylSprite(t.type), true];
  let noteTimer = 0;
  function spawnNote() {
    const n = document.createElement('span');
    n.className = 'note';
    n.textContent = Math.random() < 0.5 ? '♪' : '♫';
    n.style.left = `${8 + Math.random() * 60}px`;
    n.style.setProperty('--x', `${(Math.random() - 0.5) * 40}px`);
    n.style.setProperty('--r', `${(Math.random() - 0.5) * 40}deg`);
    $('.notes').append(n);
    n.addEventListener('animationend', () => n.remove());
  }

  // ---------- Рендер проигрывателя ----------
  function renderDeck() {
    const t = state.loaded, playing = state.status === 'playing';
    table.classList.toggle('loaded', !!t && !state.flying);
    table.classList.toggle('armdown', !!t && !state.flying && state.status !== 'idle');
    table.classList.toggle('spin', !!t && !state.flying && playing);
    dj.classList.toggle('on', playing);
    dj.classList.toggle('waiting', state.status === 'waiting');
    dj.classList.toggle('loading', state.status === 'loading');
    table.title = t ? t.title : '';
    if (t) { $('.platter img').src = vinylSprite(t.type); $('.st .sheet').src = sheetSprite(hash(t.id) % 360); }
    renderControls();
    clearInterval(noteTimer);
    if (playing && t) { spawnNote(); noteTimer = setInterval(spawnNote, 650); }
    layout();
    tick();
  }
  function renderControls() {
    root.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode));
    const spk = $('.spk');
    spk.classList.toggle('on', state.broadcast);
    spk.querySelector('img').src = speakerSprite(state.broadcast);
    spk.title = state.broadcast ? 'Трансляция в войс-чат: вкл' : 'Трансляция в войс-чат: выкл';
    const mb = $('.micb');
    mb.classList.toggle('off', !state.voice);
    mb.querySelector('img').src = micSprite(state.voice);
    mb.title = state.voice ? 'Твой микрофон: слышно' : 'Твой микрофон: выключен — другие слышат только музыку';
    const rb = $('.rgb');
    rb.classList.toggle('on', !!state.rhythm);
    rb.querySelector('img').src = rhythmSprite(state.rhythm);
    rb.title = state.rhythm ? `Ритм-игра: ${state.rhythm} дорожки (${['D', 'F', 'J', 'K', 'L'].slice(0, state.rhythm).join(' ')})` : 'Ритм-игра: выкл';
    volr.value = Math.round(state.volume * 100);
    volr.style.setProperty('--p', `${volr.value}%`);
  }
  function setVolume(v) {
    state.volume = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
    ctl.setVolume(state.volume);
    renderControls();
    persist();
  }
  function setBroadcast(v) {
    if (v && !mic.available()) { toast('Трансляция недоступна: переустанови скрипт Tampermonkey (версия 1.3+)', true); return; }
    mic.setActive(v);
    state.broadcast = v;
    renderControls();
    persist();
    sfx(v ? 'add' : 'select');
    mic.setMusic(v && state.status === 'playing' && ctl.broadcastable());
    window.dispatchEvent(new CustomEvent('freakdj:broadcast', { detail: { enabled: v } }));
    hudOptions.onBroadcast?.(v);
    if (state.loaded?.yt && state.status !== 'idle') ctl.switchYt(state.loaded);
    if (!v) return;
    if (!mic.senderCount()) toast('Включи голосовой чат в игре — музыка пойдёт в него');
    else if (mic.voiceMode() !== 'ptt') toast('Открытый микрофон: игра глушит паузы речи. Для музыки поставь в голосе режим «по кнопке»');
    else if (state.loaded && !state.loaded.yt && !ctl.broadcastable()) toast('Этот трек не транслируется: ссылки на чужие сайты браузер захватить не даёт', true);
  }
  function setVoice(v) {
    if (!mic.available()) { toast('Нужен скрипт Tampermonkey 1.3+', true); return; }
    mic.setVoice(v);
    state.voice = v;
    renderControls();
    persist();
    sfx(v ? 'add' : 'select');
    toast(v ? 'Твой микрофон снова слышно' : 'Микрофон выключен — тебя не слышно, музыка идёт');
  }
  // Ритм-игра: выкл → 3 → 4 → 5 дорожек → выкл. Включается со следующего запуска нот.
  function setRhythm(n) {
    state.rhythm = n;
    renderControls();
    persist();
    sfx(n ? 'add' : 'select');
    if (state.loaded && state.status !== 'idle' && notesMode()) toast(n ? 'Ритм-игра начнётся со следующей песни' : 'Ритм-игра выключится со следующей песни');
  }
  // Режим нот доступен только за гитарой; встал из-за гитары — снова пластинки.
  function setSeated(v) {
    if (state.seated === v) return;
    state.seated = v;
    dj.classList.toggle('seated', v);
    if (v && state.notesPref) setMode('notes', { pref: false });
    else if (!v && state.mode === 'notes') setMode('records', { pref: false });
  }
  const seatTimer = setInterval(() => {
    try { setSeated(!!(hudOptions.isAtGuitar ? hudOptions.isAtGuitar() : window.guitarPlayer?.seated?.())); } catch { /* игра ещё грузится */ }
    // typing теперь только по focusin/focusout — не дёргаем DOM каждый тик
  }, 1000);
  function setMode(m, { pref = true } = {}) {
    if (m === 'notes' && !state.seated) return;
    if (pref) state.notesPref = m === 'notes';
    if (state.mode === m) { persist(); return; }
    const keep = state.tracks[state.sel]?.id;
    state.loaded = null;
    ctl.stop();
    state.mode = m;
    dj.classList.toggle('notes-mode', m === 'notes');
    refreshView(keep);
    sfx('select');
    persist();
  }
  function refreshView(keepId) {
    state.tracks = state.all.filter(t => state.mode === 'records' || t.type === 'guitar');
    buildRecords();
    const i = state.tracks.findIndex(t => t.id === keepId);
    state.sel = i >= 0 ? i : Math.min(state.sel, Math.max(0, state.tracks.length - 1));
    layout();
    renderDeck();
  }
  function tick() {
    const d = ctl.duration(), e = state.loaded ? ctl.elapsed() : 0;
    const p = d ? Math.min(1, e / d) : 0;
    $('.strip i').style.width = `${p * 100}%`;
    $('.st .head').style.left = `${36 + p * 38}px`;
  }
  const tickTimer = setInterval(() => { if (state.status === 'playing' && !document.hidden) tick(); }, 500);

  async function start(t) {
    if (state.flying) return;
    const prev = state.loaded;
    state.loaded = t;
    state.flying = true;
    renderDeck();
    sfx('eject');
    ctl.play(t, state.mode);
    if (prev && prev !== t) prev.el?.classList.remove('out');
    const [from, to, src, spin] = flyPair(t);
    await fly(from, to, src, { spin });
    state.flying = false;
    sfx('insert');
    renderDeck();
    burst(rel(table).x + 40, rel(table).y + 50, 7);
    if (!notesMode()) setTimeout(() => state.loaded === t && sfx('needle'), 380);
  }
  async function eject() {
    const t = state.loaded;
    if (!t || state.flying) return;
    state.flying = true;
    renderDeck();
    if (t.el && t.el.isConnected) {
      sfx('eject');
      const [from, to, src, spin] = flyPair(t);
      await fly(from, to, src, { spin, back: true });
    }
    state.flying = false;
    if (state.loaded === t) state.loaded = null;
    renderDeck();
  }
  function setStatus(s) {
    if (s === state.status && s !== 'idle') return;
    state.status = s;
    mic.setMusic(s === 'playing' && state.broadcast && ctl.broadcastable());
    if (s === 'idle' && state.loaded && !state.flying) { eject(); return; }
    renderDeck();
  }

  // ---------- Трансляция в войс-чат ----------
  // Как виртуальный микрофон ИИ-бота в freakrating-client (aiMic.js): звук идёт в MediaStreamAudioDestinationNode,
  // рация «по кнопке» зажимается на время музыки, битрейт отправителя поднимается до 128 кбит/с.
  // Отличие: мы не подменяем getUserMedia (шумодав игры съел бы музыку), а подмешиваем музыку к уже
  // обработанному голосу на уровне RTCRtpSender — перехват ставит src/voice-hook.js до загрузки игры.
  let sharedCtx = null;
  const graphCtx = () => {
    sharedCtx ||= new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
    return sharedCtx;
  };
  const mic = (() => {
    let dest = null, bus = null, out = null, gameSrc = null, active = false, voice = true, mapped = false, release = null, releaseTimer = 0, holds = 0, keepTimer = 0;
    const hooks = () => hudOptions.hooks || window.FreakDJHooks;
    function ensure() {
      const c = graphCtx();
      if (!dest) { dest = c.createMediaStreamDestination(); bus = c.createGain(); out = dest.stream.getAudioTracks()[0]; }
      return c;
    }
    // Голос игрока (уже после шумодава игры) + музыка → одна дорожка для отправки.
    function mix(track) {
      const c = ensure();
      try { gameSrc?.disconnect(); } catch { /* уже отключён */ }
      gameSrc = null;
      if (track && track.readyState !== 'ended') { gameSrc = c.createMediaStreamSource(new MediaStream([track])); if (voice) gameSrc.connect(dest); }
      return out;
    }
    function tune(sender, tries = 0) {
      if (!sender?.getParameters) return;
      const retry = () => { if (tries < 40) setTimeout(() => tune(sender, tries + 1), 250); };
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) return retry();
        const enc = params.encodings[0];
        if (enc.maxBitrate === 128000) return;
        enc.maxBitrate = 128000; enc.priority = 'high'; enc.networkPriority = 'high';
        Promise.resolve(sender.setParameters(params)).catch(() => {});
      } catch { retry(); }
    }
    const voiceSettings = () => { try { return JSON.parse(localStorage.getItem('freakland:world-voice') ?? '{}') || {}; } catch { return {}; } };
    // Режим «по кнопке»: держим клавишу рации событиями на document, как игрок (voiceSfu: onKeyDown/onKeyUp).
    function holdPtt() {
      const v = voiceSettings();
      if (v.mode !== 'ptt') return () => {};
      const code = typeof v.key === 'string' && v.key ? v.key : 'KeyV', key = code.replace(/^Key/, '').toLowerCase();
      const send = type => document.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }));
      if (holds++ === 0) { send('keydown'); keepTimer = setInterval(() => send('keydown'), 3000); }
      let done = false;
      return () => { if (done) return; done = true; if (--holds === 0) { clearInterval(keepTimer); send('keyup'); } };
    }
    return {
      input() { ensure(); return bus; },
      available: () => !!hooks()?.rawReplace,
      voiceMode: () => voiceSettings().mode || 'open',
      senderCount() { let n = 0; for (const [, t] of hooks()?.senders || []) if (t) n++; return n; },
      sending() { for (const [sender] of hooks()?.senders || []) if (out && sender.track === out) return true; return false; },
      // Две ручки: active — музыка в войс-чат (громкоговоритель), voice — слышно ли твой микрофон.
      // Подменяем дорожку отправителя, только если нужна хотя бы одна из них (музыка или «без микрофона»).
      apply() {
        const h = hooks();
        if (!h?.rawReplace) return false;
        ensure();
        try { bus.disconnect(); } catch { /* не был подключён */ }
        if (active) bus.connect(dest);
        if (gameSrc) { try { gameSrc.disconnect(); } catch { /* уже отключён */ } if (voice) gameSrc.connect(dest); }
        const need = active || !voice;
        if (need && !mapped) {
          mapped = true;
          h.map = t => mix(t);
          h.onSender = sender => { if (active) tune(sender); };
          for (const [sender, t] of h.senders) if (t && sender.track !== out) Promise.resolve(h.rawReplace(sender, mix(t))).catch(() => {});
        } else if (!need && mapped) {
          mapped = false;
          h.map = null; h.onSender = null;
          for (const [sender, t] of h.senders) if (sender.track === out) Promise.resolve(h.rawReplace(sender, t)).catch(() => {});
          try { gameSrc?.disconnect(); } catch { /* уже отключён */ }
          gameSrc = null;
        }
        if (active) for (const [sender] of h.senders) tune(sender);
        else this.setMusic(false, true);
        return true;
      },
      setActive(on) { active = !!on; return this.apply(); },
      setVoice(on) { voice = !!on; return this.apply(); },
      setMusic(playing, now = false) {
        clearTimeout(releaseTimer);
        if (playing && active) { release ||= holdPtt(); return; }
        if (!release) return;
        const r = release;
        release = null;
        if (now) r(); else releaseTimer = setTimeout(r, 300);
      },
    };
  })();

  // ---------- Контроллер воспроизведения ----------
  const ctl = (() => {
    let current = null, curMode = 'records', pending = false, startedAt = 0, durationMs = 0, loop = false, audio = null, plainAudio = null, graphAudio = null, graphGain = null, opts = {}, yt = null, synth = null, actx = null;
    const codeCache = new Map(), fileUrls = new Map();
    async function fileUrl(id) {
      if (!fileUrls.has(id)) {
        const blob = await idb.get(id);
        if (!blob) throw new Error('Файл этой пластинки пропал — приложи его заново');
        fileUrls.set(id, URL.createObjectURL(blob));
      }
      return fileUrls.get(id);
    }
    // ---- Синтез гитары для пластинок (Web Audio) ----
    const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const freqOf = n => {
      const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(n));
      if (!m) return 0;
      const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      return 440 * 2 ** ((midi - 69) / 12);
    };
    const CHORDS = { Am: ['A2', 'E3', 'A3', 'C4', 'E4'], C: ['C3', 'E3', 'G3', 'C4', 'E4'], G: ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'], Em: ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'],
      Dm: ['D3', 'A3', 'D4', 'F4'], F: ['F2', 'C3', 'F3', 'A3', 'C4', 'F4'], E: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'], D: ['D3', 'A3', 'D4', 'F#4'] };
    const CHORD_BY_NUM = ['Am', 'C', 'G', 'Em', 'Dm', 'F', 'E', 'D'];
    function tabToScore(tab, columnsPerBeat = 8) {
      const tuning = { e: 64, B: 59, G: 55, D: 50, A: 45, E: 40 }, names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      let offset = 0;
      const score = [];
      for (const block of String(tab).trim().split(/\n\s*\n/)) {
        const at = {};
        for (const line of block.split('\n')) {
          const row = line.trim().match(/^([eBGDAE])\|(.*)\|$/);
          if (!row) continue;
          for (const m of row[2].matchAll(/\d+/g)) { const midi = tuning[row[1]] + Number(m[0]); (at[m.index] ??= []).push(names[midi % 12] + (Math.floor(midi / 12) - 1)); }
        }
        const points = Object.keys(at).map(Number).sort((a, b) => a - b);
        if (!points.length) continue;
        points.forEach((point, i) => score.push({ at: offset + point / columnsPerBeat, dur: ((points[i + 1] ?? point + columnsPerBeat) - point) / columnsPerBeat, notes: at[point] }));
        offset += (points.at(-1) + columnsPerBeat) / columnsPerBeat;
      }
      return score;
    }
    // Песни из lib вызывают guitarPlayer.play(score, {bpm}) — подменяем плеер на миг и забираем ноты.
    function extractScore(code) {
      const real = window.guitarPlayer;
      let got = null;
      const take = (score, o = {}) => { got = { score, bpm: Number(o.bpm) || 120 }; return Promise.resolve(); };
      window.guitarPlayer = { play: take, playTab: (tab, o = {}) => take(tabToScore(tab, o.columnsPerBeat), { bpm: o.bpm || 90 }), stop() {} };
      try { runScript(code)?.catch?.(() => {}); } finally { window.guitarPlayer = real; }
      return got;
    }
    async function getScore(t) {
      if (t.score) return { score: t.score, bpm: t.bpm || 120 };
      if (t.tab) return { score: tabToScore(t.tab), bpm: t.bpm || 90 };
      if (!t._score) {
        if (!codeCache.has(t.url)) codeCache.set(t.url, await opts.loadText(t.url));
        t._score = extractScore(codeCache.get(t.url));
      }
      if (!t._score?.score?.length) throw new Error('Не получилось прочитать ноты этой песни');
      return t._score;
    }
    function synthStart(t, score, bpm) {
      actx = graphCtx();
      const beat = 60 / bpm, events = [];
      for (const e of score) {
        const at = Number(e.at) * beat, dur = Number(e.dur ?? 1) * beat;
        for (const n of (Array.isArray(e.notes) ? e.notes : [e.note]).filter(Boolean)) events.push({ at, dur, f: freqOf(n) });
        const chord = typeof e.chord === 'number' ? CHORD_BY_NUM[e.chord - 1] : e.chord;
        (CHORDS[chord] || []).forEach((n, i) => events.push({ at: at + i * 0.012, dur, f: freqOf(n) }));
      }
      const list = events.filter(e => e.f > 0 && Number.isFinite(e.at)).sort((a, b) => a.at - b.at);
      const out = actx.createGain(), comp = actx.createDynamicsCompressor();
      out.gain.value = state.volume;
      out.connect(comp).connect(actx.destination);
      comp.connect(mic.input());
      const s = { out, comp, list, i: 0, t0: actx.currentTime + 0.1, end: Math.max(0, ...list.map(e => e.at + e.dur)), track: t };
      s.timer = setInterval(() => pump(s), 60);
      synth = s;
      durationMs = s.end * 1000;
      pump(s);
      setStatus('playing');
    }
    function pluck(s, ev) {
      const at = s.t0 + ev.at, f = ev.f, len = Math.min(Math.max(ev.dur + 0.15, 0.25), 2.6);
      const o1 = actx.createOscillator(), o2 = actx.createOscillator(), g2 = actx.createGain(), flt = actx.createBiquadFilter(), g = actx.createGain();
      o1.type = 'sawtooth'; o1.frequency.value = f;
      o2.type = 'triangle'; o2.frequency.value = f * 2; o2.detune.value = 5; g2.gain.value = 0.35;
      flt.type = 'lowpass'; flt.Q.value = 0.7;
      flt.frequency.setValueAtTime(Math.min(9000, f * 10), at);
      flt.frequency.exponentialRampToValueAtTime(Math.max(220, f * 1.6), at + 0.35);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.15, at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.055, at + 0.14);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o1.connect(flt); o2.connect(g2).connect(flt); flt.connect(g).connect(s.out);
      o1.start(at); o2.start(at); o1.stop(at + len + 0.05); o2.stop(at + len + 0.05);
    }
    function pump(s) {
      if (synth !== s) return;
      const horizon = actx.currentTime + 0.3;
      while (s.i < s.list.length && s.t0 + s.list[s.i].at < horizon) pluck(s, s.list[s.i++]);
      if (s.i >= s.list.length && actx.currentTime > s.t0 + s.end + 0.4) { synthStop(); current = null; setStatus('idle'); }
    }
    function synthStop() {
      const s = synth;
      if (!s) return;
      synth = null;
      clearInterval(s.timer);
      s.out.gain.setTargetAtTime(0, actx.currentTime, 0.03);
      setTimeout(() => { s.out.disconnect(); s.comp.disconnect(); }, 250);
    }

    // YouTube: обычный embed-плеер, управляем через postMessage (без загрузки скриптов YouTube в страницу).
    const ytPost = (func, args = []) => yt?.frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    function ytStart(t, startSec = 0) {
      const frame = document.createElement('iframe');
      frame.allow = 'autoplay; encrypted-media';
      frame.src = `https://www.youtube.com/embed/${t.yt}?enablejsapi=1&autoplay=1&playsinline=1&controls=0&rel=0&iv_load_policy=3${startSec > 1 ? `&start=${Math.floor(startSec)}` : ''}&origin=${encodeURIComponent(location.origin)}`;
      $('.screen').replaceChildren(frame);
      yt = { frame, track: t, time: 0, at: 0, dur: 0, ready: false };
      const hello = () => {
        if (yt?.frame !== frame || yt.ready) return;
        frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'freakdj', channel: 'widget' }), '*');
        setTimeout(hello, 500);
      };
      frame.addEventListener('load', hello);
      dj.classList.add('yt');
    }
    function ytStop() {
      if (!yt) return;
      yt.frame.remove();
      yt = null;
      dj.classList.remove('yt');
    }
    window.addEventListener('message', e => {
      if (!yt || e.source !== yt.frame.contentWindow) return;
      let d;
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (!d || current !== yt.track) return;
      if (!yt.ready && (d.event === 'onReady' || d.event === 'initialDelivery' || d.event === 'infoDelivery')) {
        yt.ready = true;
        ytPost('setVolume', [Math.round(state.volume * 100)]);
        ytPost('unMute');
        ytPost('playVideo');
      }
      if (d.event === 'onError') {
        current = null; ytStop(); setStatus('idle');
        toast(d.info === 101 || d.info === 150 ? 'Автор видео запретил проигрывать его вне YouTube' : 'YouTube не даёт проиграть это видео', true);
        return;
      }
      const info = d.info;
      let ps = d.event === 'onStateChange' ? info : undefined;
      if (info && typeof info === 'object') {
        if (typeof info.currentTime === 'number') { yt.time = info.currentTime; yt.at = performance.now(); }
        if (info.duration) yt.dur = info.duration;
        if (typeof info.playerState === 'number') ps = info.playerState;
        const title = info.videoData?.title;
        if (title && yt.track.titleAuto) { yt.track.title = title; delete yt.track.titleAuto; persist(); layout(); }
      }
      if (ps === 1) setStatus('playing');
      else if (ps === 2) setStatus('paused');
      else if (ps === 3) setStatus('loading');
      else if (ps === 0) { current = null; ytStop(); setStatus('idle'); }
    });
    const gp = () => window.guitarPlayer;
    async function waitPlayer() {
      for (let i = 0; i < 40 && !gp(); i++) await new Promise(r => setTimeout(r, 250));
      if (!gp()) throw new Error('Гитарный проигрыватель не загрузился. Открой мир и попробуй ещё раз.');
      return gp();
    }
    // Песни из lib — это async IIFE; перехватываем их промис, чтобы ловить ошибки.
    function runScript(code) {
      const holder = {};
      new Function('__dj', code.replace(/^\(async\b/m, '__dj.p=(async'))(holder);
      return holder.p;
    }
    // ---- Оригинальный GP настоящими инструментами ----
    // Все партии песни (songEvents из конвертера) играются семплами живых инструментов MusyngKite
    // (gleitz/midi-js-soundfonts — статичные файлы со встроенными mp3, кешируются в IndexedDB), ударные — семплами
    // акустической установки (Tone.js audio). Синтезаторные программы из GP заменяются живыми. Нет GP — прежний синтез.
    const SF_BASE = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/', SF_CACHE = 'sfm:';
    // Инструменты — как в файле. Исключения: партия вокала (мелодия певца, в табах её пишут синт-лидом) звучит
    // мягким голосом и тише; звуковые эффекты (дыхание, шум ладов, прибой…) не играем (-1).
    const VOCAL = /vocal|voice|vox|sing|melod|вокал|голос|мелоди/i, SYNTH = /synth|key|клав|синт/i;
    // Синт-лид без «synth/keys» в названии в табах почти всегда — мелодия вокала.
    const isVocal = (p, name = '') => VOCAL.test(name) || ([80, 81, 85].includes(p) && !SYNTH.test(name));
    const realProgram = (p, name = '') => {
      if (isVocal(p, name)) return 53;
      if (p >= 119) return -1;
      return p;
    };
    const DRUM_BASE = 'https://tonejs.github.io/audio/';
    // Ключ GM-ударных → семпл, скорость (высота), длина звучания, громкость.
    const DRUM_KIT = {
      kick: 'drum-samples/acoustic-kit/kick.mp3', snare: 'drum-samples/acoustic-kit/snare.mp3', hihat: 'drum-samples/acoustic-kit/hihat.mp3',
      tom1: 'drum-samples/acoustic-kit/tom1.mp3', tom2: 'drum-samples/acoustic-kit/tom2.mp3', tom3: 'drum-samples/acoustic-kit/tom3.mp3',
      crash: 'berklee/crash_cymbal1.mp3', ride: 'berklee/cymbal1.mp3', china: 'berklee/china_cymbal1.mp3',
    };
    const DRUM_MAP = {
      35: ['kick', 1, 0.6, 1], 36: ['kick', 1, 0.6, 1], 38: ['snare', 1, 0.5, 0.9], 40: ['snare', 1.05, 0.5, 0.9],
      37: ['snare', 1.4, 0.12, 0.35], 39: ['snare', 1.5, 0.2, 0.5], 41: ['tom3', 0.9, 0.7, 0.85], 43: ['tom3', 1, 0.7, 0.85],
      45: ['tom2', 1, 0.6, 0.85], 47: ['tom2', 1.08, 0.6, 0.85], 48: ['tom1', 1, 0.5, 0.85], 50: ['tom1', 1.1, 0.5, 0.85],
      42: ['hihat', 1, 0.08, 0.45], 44: ['hihat', 1, 0.06, 0.35], 46: ['hihat', 0.95, 0.45, 0.45], 54: ['hihat', 1.4, 0.15, 0.3],
      49: ['crash', 1, 2.5, 0.55], 57: ['crash', 1.06, 2.5, 0.55], 55: ['crash', 1.4, 1.2, 0.4], 52: ['china', 1, 2, 0.5],
      51: ['ride', 1, 1.5, 0.35], 59: ['ride', 1.05, 1.5, 0.35], 53: ['ride', 1.3, 1, 0.4], 56: ['tom1', 2.2, 0.15, 0.4],
    };
    let drumKitP = null;
    function drumKit() {
      drumKitP ||= (async () => {
        if (!opts.loadBinary) throw new Error('нет загрузки семплов');
        const c = graphCtx(), kit = {};
        await Promise.all(Object.entries(DRUM_KIT).map(async ([k, path]) => {
          let bytes = await idb.get(`dr:${path}`).catch(() => null);
          if (!(bytes instanceof ArrayBuffer)) { bytes = await opts.loadBinary(DRUM_BASE + path); idb.put(`dr:${path}`, bytes.slice(0)).catch(() => {}); }
          const buffer = await c.decodeAudioData(bytes.slice(0));
          kit[k] = { buffer, norm: loudnessNorm(buffer, { peak: true }) };
        }));
        return kit;
      })().catch(e => { drumKitP = null; throw e; });
      return drumKitP;
    }
    const SF_NOTE = /"([A-G]b?)(-?\d)":\s*"data:audio\/mp3;base64,([^"]+)"/g, SF_SEMI = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
    let gmNamesP = null, manifestP = null, gpp = null, noiseBuf = null;
    const instruments = new Map();
    const gmName = async program => {
      gmNamesP ||= opts.loadText(`${SF_BASE}names.json`).then(JSON.parse).catch(e => { gmNamesP = null; throw e; });
      return (await gmNamesP)[program] || 'acoustic_guitar_steel';
    };
    function instrument(name) {
      if (!instruments.has(name)) instruments.set(name, (async () => {
        let text = await idb.get(SF_CACHE + name).catch(() => null);
        if (typeof text !== 'string') { text = await opts.loadText(`${SF_BASE}${name}-mp3.js`); idb.put(SF_CACHE + name, text).catch(() => {}); }
        const notes = new Map();
        for (const m of text.matchAll(SF_NOTE)) notes.set(12 * (Number(m[2]) + 1) + SF_SEMI[m[1]], m[3]);
        if (!notes.size) throw new Error(`пустой банк ${name}`);
        return { notes, buffers: new Map() };
      })().catch(e => { instruments.delete(name); throw e; }));
      return instruments.get(name);
    }
    // Семплы банка записаны с разной громкостью: у баса ноты выше A4 тише на 15 дБ, глушёная гитара тише баса на 19 дБ.
    // Выравниваем каждую ноту к одной громкости по первым 0.4 с (RMS), ударные — по пику.
    function loudnessNorm(buffer, { peak = false, target = -22 } = {}) {
      const d = buffer.getChannelData(0), n = Math.min(d.length, Math.floor(buffer.sampleRate * 0.4));
      let sum = 0, max = 0;
      for (let i = 0; i < n; i++) { sum += d[i] * d[i]; max = Math.max(max, Math.abs(d[i])); }
      const level = peak ? max : Math.sqrt(sum / Math.max(1, n));
      if (level < 1e-5) return 1;
      // Не даём пику после выравнивания выйти за 0.9: резкая атака тихой ноты иначе бьёт лимитер.
      const gain = (peak ? 0.7 : 10 ** (target / 20)) / level;
      return Math.min(6, 0.9 / Math.max(max, 1e-5), Math.max(0.25, gain));
    }
    async function sampleFor(inst, midi) {
      let key = null, best = Infinity;
      for (const k of inst.notes.keys()) { const d = Math.abs(k - midi); if (d < best) { best = d; key = k; } }
      if (!inst.buffers.has(key)) {
        const bin = atob(inst.notes.get(key)), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        inst.buffers.set(key, graphCtx().decodeAudioData(bytes.buffer).then(buffer => ({ buffer, norm: loudnessNorm(buffer) })));
      }
      return { key, ...(await inst.buffers.get(key)) };
    }
    const libManifest = () => manifestP ||= Promise.resolve(opts.libBase ? opts.loadText(`${opts.libBase}sources.json`) : null)
      .then(t => (t ? JSON.parse(t) : null)).catch(() => { manifestP = null; return null; });
    async function gpBytes(t) {
      let bytes = null;
      if (t.gpFileId) {
        const blob = await idb.get(t.gpFileId).catch(() => null);
        if (blob) bytes = new Uint8Array(await new Response(blob).arrayBuffer());
      } else if (t.id?.startsWith('lib:') && opts.loadBinary) {
        const path = (await libManifest())?.[t.id.slice(4)];
        if (path) bytes = new Uint8Array(await opts.loadBinary(`${opts.libBase}${path}`));
      }
      return bytes;
    }
    async function loadSong(t) {
      if (t._song) return t._song;
      const bytes = await gpBytes(t);
      if (!bytes) return null;
      const conv = await getConverterModule();
      if (typeof conv.songEvents !== 'function') return null;
      t._song = conv.songEvents(bytes, t.title);
      return t._song;
    }
    async function prepareSong(song) {
      const parts = await Promise.all(song.tracks.map(async tr => {
        if (tr.percussion) return { drums: true, vol: tr.vol ?? 0.66, pan: tr.pan ?? 0, notes: tr.notes, kit: await drumKit().catch(err => { console.warn('[FreakRating DJ] ударные', err); return null; }) };
        const program = realProgram(tr.program ?? (tr.kind === 'stringed' ? 25 : 0), tr.name);
        if (program < 0) return null;
        const vocal = program === 53 && isVocal(tr.program, tr.name);
        const inst = await instrument(await gmName(program));
        const map = new Map();
        await Promise.all([...new Set(tr.notes.map(n => n.m))].map(async m => map.set(m, await sampleFor(inst, m))));
        return { notes: tr.notes, map, vol: (tr.vol ?? 0.66) * (vocal ? 0.6 : 1), pan: tr.pan ?? 0 };
      }));
      return parts.filter(Boolean);
    }
    function drum(c, out, at, key, v) {
      if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const env = (node, len, lvl) => { const g = c.createGain(); g.gain.setValueAtTime(lvl * v, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len); node.connect(g).connect(out); return g; };
      const tone = (f0, f1, len, lvl, type = 'sine') => { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + len); env(o, len, lvl); o.start(at); o.stop(at + len + 0.02); };
      const hiss = (len, lvl, type, freq, q = 0.7) => { const n = c.createBufferSource(); n.buffer = noiseBuf; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; n.connect(f); env(f, len, lvl); n.start(at, Math.random() * 0.5); n.stop(at + len + 0.02); };
      if (key === 35 || key === 36) tone(150, 45, 0.35, 1);                                        // бочка
      else if (key === 38 || key === 40) { tone(220, 140, 0.12, 0.5, 'triangle'); hiss(0.18, 0.6, 'highpass', 1500); } // малый
      else if (key === 37) hiss(0.05, 0.5, 'bandpass', 3000, 2);                                    // римшот
      else if (key === 39) hiss(0.15, 0.6, 'bandpass', 1500, 1);                                    // хлопок
      else if ([41, 43, 45, 47, 48, 50].includes(key)) { const f = 80 + (key - 41) * 12; tone(f * 1.6, f, 0.3, 0.8); } // томы
      else if (key === 42 || key === 44) hiss(0.05, 0.35, 'highpass', 7000);                       // хэт закрытый
      else if (key === 46) hiss(0.3, 0.3, 'highpass', 7000);                                        // хэт открытый
      else if ([49, 52, 55, 57].includes(key)) hiss(1.2, 0.35, 'highpass', 5000);                   // тарелки
      else if ([51, 53, 59].includes(key)) hiss(0.6, 0.2, 'bandpass', 6000, 1.5);                   // райд
      else hiss(0.08, 0.25, 'bandpass', 2500, 1);
    }
    function gpStart(t, song, parts) {
      actx = graphCtx();
      // Мягкий лимитер только от перегруза: компрессор по умолчанию (−24 дБ, 12:1) «качал» — громкие удары
      // давили всё остальное, и звук то пропадал, то возвращался.
      const out = actx.createGain(), comp = actx.createDynamicsCompressor();
      out.gain.value = state.volume;
      comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      out.connect(comp).connect(actx.destination);
      comp.connect(mic.input());
      const list = [];
      let partId = 0;
      for (const p of parts) {
        p.id = partId++;
        // Баланс оригинала из микшера GP; семплы ударных громче семплов инструментов — ведём их тише.
        const tg = actx.createGain(), panner = actx.createStereoPanner?.();
        tg.gain.value = (p.drums ? 0.28 : 0.38) * (p.vol ?? 0.8);
        if (panner) { panner.pan.value = Math.max(-1, Math.min(1, p.pan || 0)); tg.connect(panner).connect(out); } else tg.connect(out);
        for (const n of p.notes) list.push({ n, p, tg });
      }
      list.sort((a, b) => a.n.s - b.n.s);
      const s = { out, comp, list, i: 0, t0: actx.currentTime + 0.15, end: song.durationMs / 1000, track: t, voices: new Map() };
      s.timer = setInterval(() => gpPump(s), 60);
      gpp = s;
      durationMs = song.durationMs;
      gpPump(s);
      setStatus('playing');
    }
    function gpNote(s, { n, p, tg }) {
      const at = Math.max(actx.currentTime, s.t0 + n.s / 1000);
      if (p.drums) {
        const d = p.kit && DRUM_MAP[n.m], hit = d && p.kit[d[0]];
        if (!hit) return drum(actx, tg, at, n.m, n.v);   // нет семпла — синтезированный удар
        const src = actx.createBufferSource(), g = actx.createGain();
        src.buffer = hit.buffer;
        src.playbackRate.value = d[1];
        g.gain.setValueAtTime(n.v * d[3] * hit.norm, at);
        g.gain.setTargetAtTime(0, at + d[2], 0.06);
        src.connect(g).connect(tg);
        src.start(at);
        src.stop(at + d[2] + 0.5);
        src.onended = () => g.disconnect();
        return;
      }
      const smp = p.map.get(n.m);
      if (!smp?.buffer) return;
      const src = actx.createBufferSource(), g = actx.createGain();
      src.buffer = smp.buffer;
      src.playbackRate.value = 2 ** ((n.m - smp.key) / 12);
      let end = s.t0 + n.e / 1000;
      if (n.lr) end += 1.2;
      if (n.pm) end = Math.min(end, at + 0.18);
      if (n.d) end = at + 0.05;
      // Как на настоящей гитаре: новая нота на той же струне (или та же нота) глушит предыдущую — иначе звук копится.
      const key = `${p.id}:${n.st ?? `m${n.m}`}`, prev = s.voices.get(key);
      if (prev && prev.end > at) { prev.g.gain.cancelScheduledValues(at); prev.g.gain.setTargetAtTime(0, at, 0.015); }
      s.voices.set(key, { g, end: end + 0.5 });
      g.gain.setValueAtTime(n.v * (n.d ? 0.4 : 1) * smp.norm, at);
      g.gain.setTargetAtTime(0, end, n.pm || n.d ? 0.03 : 0.15);
      src.connect(g).connect(tg);
      src.start(at);
      src.stop(end + 0.8);
      src.onended = () => { g.disconnect(); if (s.voices.get(key)?.g === g) s.voices.delete(key); };
    }
    function gpPump(s) {
      if (gpp !== s) return;
      const horizon = actx.currentTime + 0.35;
      while (s.i < s.list.length && s.t0 + s.list[s.i].n.s / 1000 < horizon) gpNote(s, s.list[s.i++]);
      if (s.i >= s.list.length && actx.currentTime > s.t0 + s.end + 1) { gpStop(); current = null; setStatus('idle'); }
    }
    function gpStop() {
      const s = gpp;
      if (!s) return;
      gpp = null;
      clearInterval(s.timer);
      s.out.gain.setTargetAtTime(0, actx.currentTime, 0.03);
      setTimeout(() => { try { s.out.disconnect(); s.comp.disconnect(); } catch { /* уже отключено */ } }, 300);
    }

    // ---- alphaTab: готовый проигрыватель Guitar Pro ----
    // alphaTab (MPL-2.0) сам читает GP3–GP8 со всей техникой и микшером (громкость, панорама, mute/solo) и синтезирует
    // звук по SoundFont GeneralUser GS. Работаем без нот на экране и без воркеров: ScoreLoader → MidiFileGenerator →
    // AlphaSynth.exportAudio, а куски PCM (стерео 48 кГц) сами ставим в Web Audio — так звук идёт и в колонки, и в трансляцию.
    const AT_URL = 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.9.0/dist/alphaTab.min.js';
    const AT_SF_URL = 'https://cdn.jsdelivr.net/gh/spessasus/SpessaSynth@6f7505087eba09bdbf345c97f5cf573fc547412e/soundfonts/GeneralUserGS.sf3';
    let alphaTabP = null, atSoundFontP = null, atp = null;
    const cached = async (key, load) => {
      const hit = await idb.get(key).catch(() => null);
      if (hit != null) return hit;
      const value = await load();
      idb.put(key, value).catch(() => {});
      return value;
    };
    const getAlphaTab = () => alphaTabP ||= (async () => {
      if (window.alphaTab?.synth?.AlphaSynth) return window.alphaTab;
      const code = await cached('at:js:1.9.0', () => (opts.loadAlphaTab ? opts.loadAlphaTab(AT_URL) : opts.loadText(AT_URL)));
      const AT = new Function(`${code}\n;return typeof alphaTab !== 'undefined' ? alphaTab : globalThis.alphaTab;`).call(globalThis);
      if (!AT?.synth?.AlphaSynth) throw new Error('alphaTab не загрузился');
      return AT;
    })().catch(e => { alphaTabP = null; throw e; });
    const getAtSoundFont = () => atSoundFontP ||= cached('at:sf:gugs', async () => {
      if (!opts.loadBinary) throw new Error('нет загрузки банка');
      return new Uint8Array(await opts.loadBinary(AT_SF_URL));
    }).then(b => (b instanceof Uint8Array ? b : new Uint8Array(b))).catch(e => { atSoundFontP = null; throw e; });
    async function alphaPrepare(t) {
      const bytes = await gpBytes(t);
      if (!bytes) return null;
      const [AT, sf] = await Promise.all([getAlphaTab(), getAtSoundFont()]);
      const settings = new AT.Settings();
      const score = AT.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
      const midi = new AT.midi.MidiFile();
      const gen = new AT.midi.MidiFileGenerator(score, settings, new AT.midi.AlphaSynthMidiFileHandler(midi, true));
      gen.generate();
      return { AT, sf, midi, gen };
    }
    function alphaStart(t, prep) {
      const { AT, sf, midi, gen } = prep;
      const noop = () => {}, ev = { on: noop, off: noop };
      // AlphaSynth требует вывод; мы им не пользуемся — звук забираем экспортом.
      const stub = { sampleRate: 48000, open: noop, play: noop, destroy: noop, pause: noop, addSamples: noop, resetSamples: noop, activate: noop,
        ready: ev, samplesPlayed: ev, sampleRequest: ev, enumerateOutputDevices: async () => [], setOutputDevice: async () => {} };
      const options = new AT.synth.AudioExportOptions();
      options.sampleRate = 48000;
      options.soundFonts = [sf];
      options.masterVolume = 1;
      const exporter = new AT.synth.AlphaSynth(stub, 500).exportAudio(options, midi, gen.syncPoints || [], gen.transpositionPitches || new Map());
      actx = graphCtx();
      const out = actx.createGain(), comp = actx.createDynamicsCompressor();
      out.gain.value = state.volume * 0.8;
      comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      out.connect(comp).connect(actx.destination);
      comp.connect(mic.input());
      const t0 = actx.currentTime + 0.15;
      const s = { exporter, out, comp, t0, at: t0, nodes: new Set(), done: false, track: t };
      s.timer = setInterval(() => alphaPump(s), 100);
      atp = s;
      alphaPump(s);
      setStatus('playing');
    }
    function alphaPump(s) {
      if (atp !== s) return;
      // Рендер быстрый (10 с звука ≈ 40 мс), держим запас ~1.5 с.
      while (!s.done && s.at - actx.currentTime < 1.5) {
        const chunk = s.exporter.render(500);
        if (!chunk) { s.done = true; break; }
        durationMs = chunk.endTime;
        const frames = chunk.samples.length >> 1;
        if (!frames) continue;
        const buf = actx.createBuffer(2, frames, 48000), l = buf.getChannelData(0), r = buf.getChannelData(1), x = chunk.samples;
        for (let i = 0; i < frames; i++) { l[i] = x[2 * i]; r[i] = x[2 * i + 1]; }
        const src = actx.createBufferSource();
        src.buffer = buf;
        src.connect(s.out);
        src.start(s.at);
        s.at += buf.duration;
        s.nodes.add(src);
        src.onended = () => { s.nodes.delete(src); src.disconnect(); };
      }
      if (s.done && actx.currentTime > s.at + 0.2) { alphaStop(); current = null; setStatus('idle'); }
    }
    function alphaStop() {
      const s = atp;
      if (!s) return;
      atp = null;
      clearInterval(s.timer);
      for (const n of s.nodes) { try { n.stop(); } catch { /* уже закончился */ } }
      s.nodes.clear();
      s.out.gain.setTargetAtTime(0, actx.currentTime, 0.03);
      setTimeout(() => { try { s.out.disconnect(); s.comp.disconnect(); } catch { /* уже отключено */ } }, 300);
    }

    // ---- YouTube в трансляцию ----
    // Звук iframe YouTube странице недоступен (чужой источник), поэтому для трансляции два других пути:
    // 1) в клиенте FreakRating — его радио: yt-dlp + ffmpeg → PCM 48 кГц кусками (как радио бота, aiMic.radioFeed);
    // 2) в браузере — отдельное окно YouTube и штатный захват звука вкладки (getDisplayMedia), один раз за сессию.
    let ytMode = null;   // 'iframe' | 'client' | 'popup'
    const client = () => (typeof window.freakClient?.radioStart === 'function' ? window.freakClient : null);
    let radioAt = 0, radioGain = null, radioPending = false, radioHooked = false;
    const radioNodes = new Set();
    function radioFeed(bytes) {
      const c = graphCtx(), frames = Math.floor((bytes?.byteLength || 0) / 4);
      if (!frames) return;
      const view = new DataView(bytes.buffer, bytes.byteOffset, frames * 4), buf = c.createBuffer(2, frames, 48000);
      const l = buf.getChannelData(0), r = buf.getChannelData(1);
      for (let i = 0; i < frames; i++) { l[i] = view.getInt16(i * 4, true) / 32768; r[i] = view.getInt16(i * 4 + 2, true) / 32768; }
      if (!radioGain) { radioGain = c.createGain(); radioGain.gain.value = state.volume; radioGain.connect(c.destination); radioGain.connect(mic.input()); }
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(radioGain);
      const at = Math.max(radioAt, c.currentTime + 0.2);
      src.start(at);
      radioAt = at + buf.duration;
      radioNodes.add(src);
      src.onended = () => { radioNodes.delete(src); src.disconnect(); };
    }
    function radioReset() { for (const n of radioNodes) { try { n.stop(); } catch { /* уже закончился */ } } radioNodes.clear(); radioAt = 0; }
    function hookRadio(fc) {
      if (radioHooked) return;
      radioHooked = true;
      fc.onRadioPcm?.(chunk => { if (ytMode === 'client' && current?.yt) radioFeed(chunk); });
      fc.onRadioState?.(st => {
        if (ytMode !== 'client' || !current?.yt || !st) return;
        if (st.error) { current = null; radioReset(); toast(String(st.error), true); setStatus('idle'); return; }
        if (st.title && current.titleAuto) { current.title = st.title; delete current.titleAuto; persist(); layout(); }
        if (st.playing && !st.paused) { radioPending = false; startedAt ||= performance.now(); setStatus('playing'); }
        else if (st.paused) setStatus('paused');
        else if (!radioPending && !st.starting) { current = null; radioReset(); setStatus('idle'); }
      });
    }
    async function clientYt(fc, t) {
      hookRadio(fc);
      radioPending = true;
      const res = await fc.radioStart(`https://www.youtube.com/watch?v=${t.yt}`);
      if (!res?.ok) throw new Error(res?.error || 'Клиент FreakRating не запустил YouTube');
    }
    let ytWin = null, ytCap = null, ytCapNode = null, ytCapGain = null;
    const capLive = () => !!ytCap?.getAudioTracks().some(a => a.readyState === 'live');
    // Важно: getDisplayMedia и window.open вызываются синхронно, в том же клике, что и запуск трека.
    function popupYt(t, startSec = 0) {
      const url = `https://www.youtube.com/watch?v=${t.yt}${startSec > 1 ? `&t=${Math.floor(startSec)}s` : ''}`;
      let capP = null;
      if (!capLive()) {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Браузер не умеет захватывать звук вкладки');
        capP = navigator.mediaDevices.getDisplayMedia({ video: true, audio: { suppressLocalAudioPlayback: false }, preferCurrentTab: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'exclude', systemAudio: 'exclude' });
      }
      if (!ytWin || ytWin.closed) ytWin = window.open(url, 'freakdj-youtube', 'popup,width=520,height=340');
      else try { ytWin.location.href = url; } catch { ytWin = window.open(url, 'freakdj-youtube', 'popup,width=520,height=340'); }
      if (capP) toast(ytWin ? 'Выбери вкладку YouTube и включи «Поделиться звуком»' : 'Окно заблокировано: открой видео в соседней вкладке и выбери её');
      return (async () => {
        if (capP) {
          let stream;
          try { stream = await capP; } catch { throw new Error('Захват звука YouTube отменён'); }
          stream.getVideoTracks().forEach(v => v.stop());
          const track = stream.getAudioTracks()[0];
          if (!track) throw new Error('Звук не захвачен — включи «Поделиться звуком вкладки»');
          ytCap = stream;
          try { ytCapNode?.disconnect(); } catch { /* уже отключён */ }
          const c = graphCtx();
          ytCapNode = c.createMediaStreamSource(stream);
          ytCapGain ||= c.createGain();
          ytCapGain.gain.value = state.volume;
          ytCapNode.connect(ytCapGain);
          ytCapGain.connect(mic.input());   // в колонки не ведём: окно YouTube и так слышно
          track.addEventListener('ended', () => {
            ytCap = null;
            if (current?.yt && ytMode === 'popup') { current = null; toast('Захват звука YouTube остановлен'); setStatus('idle'); }
          });
        }
        if (current === t) { if (ytCapGain) ytCapGain.gain.value = state.volume; startedAt = performance.now() - startSec * 1000; setStatus('playing'); }
      })();
    }
    function closePopup() {
      try { ytWin?.close(); } catch { /* уже закрыто */ }
      ytWin = null;
      ytCap?.getTracks().forEach(x => x.stop());
      ytCap = null;
    }
    function halt() {
      pending = false;
      rhythm.abort();
      if (ytMode === 'client') { try { client()?.radioStop(); } catch { /* клиент закрывается */ } radioReset(); }
      if (ytCapGain) ytCapGain.gain.value = 0;   // захват вкладки молчит, пока YouTube не играет
      if (ytMode === 'popup' && ytWin && !ytWin.closed) { try { ytWin.location.href = 'about:blank'; } catch { /* окно закрыто */ } }
      ytMode = null;
      try { gp()?.stop(); } catch { /* ignore */ }
      for (const a of [plainAudio, graphAudio]) if (a?.getAttribute('src')) { a.onpause = null; a.pause(); a.removeAttribute('src'); a.load(); }
      audio = null;
      ytStop();
      synthStop();
      gpStop();
      alphaStop();
    }
    // Свои файлы (blob:) идут через Web Audio — их можно и слышать, и транслировать.
    // Чужие ссылки без CORS Web Audio не отдаст (будет тишина), поэтому они играют обычным <audio>.
    function makeAudio(graph) {
      const a = new Audio();
      a.preload = 'auto';
      if (graph) {
        const c = graphCtx(), node = c.createMediaElementSource(a);
        graphGain = c.createGain();
        graphGain.gain.value = state.volume;
        node.connect(graphGain);
        graphGain.connect(c.destination);
        graphGain.connect(mic.input());
      }
      a.addEventListener('playing', () => current?.type === 'digital' && setStatus('playing'));
      a.addEventListener('waiting', () => current?.type === 'digital' && setStatus('loading'));
      a.addEventListener('ended', () => { if (current?.type === 'digital') { current = null; setStatus('idle'); } });
      a.addEventListener('error', () => { if (current?.type === 'digital' && a.getAttribute('src')) { current = null; toast('Не получилось проиграть эту ссылку', true); setStatus('idle'); } });
      return a;
    }
    window.addEventListener('guitarplayer', e => {
      const d = e.detail || {};
      if (!current || current.type !== 'guitar' || curMode !== 'notes') return;
      if (d.state === 'waiting') { pending = false; setStatus('waiting'); }
      else if (d.state === 'playing') { pending = false; startedAt = performance.now(); durationMs = d.durationMs || 0; loop = !!d.loop; setStatus('playing'); }
      else if (d.state === 'ended' && !pending) { current = null; setStatus('idle'); }
    });
    async function play(t, mode = 'records', { startSec = 0 } = {}) {
      halt();
      current = t; curMode = mode; durationMs = 0; startedAt = 0;
      setStatus('loading');
      try {
        if (t.yt) {
          const fc = client();
          if (fc) { ytMode = 'client'; await clientYt(fc, t); return; }
          if (state.broadcast) { ytMode = 'popup'; await popupYt(t, startSec); return; }
          ytMode = 'iframe';
          ytStart(t, startSec);
          return;
        }
        if (t.type === 'digital') {
          const src = t.fileId ? await fileUrl(t.fileId) : t.url;
          if (current !== t) return;
          const graph = String(src).startsWith('blob:');
          audio = graph ? (graphAudio ||= makeAudio(true)) : (plainAudio ||= makeAudio(false));
          audio.volume = graph ? 1 : state.volume;
          if (graph) graphGain.gain.value = state.volume;
          audio.onpause = () => { if (current === t && !audio.ended && audio.getAttribute('src')) setStatus('paused'); };
          audio.src = src;
          await audio.play();
          return;
        }
        if (mode === 'records') {
          // 1) alphaTab + GeneralUser GS; 2) свои семплы MusyngKite; 3) простой синтез.
          let prep = null;
          const slowAt = setTimeout(() => current === t && toast('Загружаю проигрыватель и инструменты…'), 900);
          try { prep = await alphaPrepare(t); } catch (err) { console.warn('[FreakRating DJ] alphaTab', err); }
          finally { clearTimeout(slowAt); }
          if (current !== t) return;
          if (prep) { alphaStart(t, prep); return; }
          let song = null;
          try { song = await loadSong(t); } catch (err) { console.warn('[FreakRating DJ] GP', err); }
          if (current !== t) return;
          if (song) {
            const slow = setTimeout(() => current === t && toast('Загружаю инструменты…'), 900);
            try { t._parts ||= await prepareSong(song); } catch (err) { console.warn('[FreakRating DJ] инструменты', err); toast('Не загрузились инструменты — играю простым синтезом', true); }
            finally { clearTimeout(slow); }
            if (current !== t) return;
            if (t._parts) { gpStart(t, song, t._parts); return; }
          }
          const { score, bpm } = await getScore(t);
          if (current === t) synthStart(t, score, bpm);
          return;
        }
        const player = await waitPlayer();
        if (current !== t) return;
        if (state.rhythm && typeof player.strike === 'function') {
          const { score, bpm } = await getScore(t);
          if (current !== t) return;
          const chart = rhythm.arm(t, score, bpm, state.rhythm);
          if (chart) { pending = true; await player.play(chart.auto, { bpm, loop: false, until: chart.until }); return; }
        } else if (state.rhythm) toast('Для ритм-игры обнови скрипт Tampermonkey', true);
        pending = true;
        if (t.score) await player.play(t.score, { bpm: t.bpm || 120, loop: false });
        else if (t.tab) await player.playTab(t.tab, { bpm: t.bpm || 90 });
        else {
          if (!codeCache.has(t.url)) codeCache.set(t.url, await opts.loadText(t.url));
          if (current !== t) return;
          await runScript(codeCache.get(t.url));
        }
      } catch (err) {
        console.error('[FreakRating DJ]', err);
        if (current === t) { pending = false; current = null; toast(err?.message || 'Ошибка воспроизведения', true); setStatus('idle'); }
      }
    }
    return {
      setOptions: o => { opts = o; },
      play,
      stop() { halt(); current = null; setStatus('idle'); },
      broadcastable() {
        if (!current || curMode !== 'records') return false;
        if (current.yt) return ytMode === 'client' || (ytMode === 'popup' && capLive());
        return current.type === 'guitar' || (!!audio && audio === graphAudio);
      },
      // Включили/выключили трансляцию во время YouTube-трека в браузере: перезапускаем его в нужном режиме с той же секунды.
      switchYt(t) {
        if (!t?.yt || client() || current !== t) return;
        const sec = this.elapsed() / 1000;
        if (!state.broadcast) closePopup();
        play(t, 'records', { startSec: sec });
      },
      togglePause() { if (current?.type === 'digital' && audio) audio.paused ? audio.play() : audio.pause(); },
      setVolume(v) {
        if (audio && audio === plainAudio) audio.volume = v;
        if (graphGain) graphGain.gain.value = v;
        if (synth) synth.out.gain.setTargetAtTime(v, actx.currentTime, 0.03);
        if (gpp) gpp.out.gain.setTargetAtTime(v, actx.currentTime, 0.03);
        if (atp) atp.out.gain.setTargetAtTime(v * 0.8, actx.currentTime, 0.03);
        if (radioGain) radioGain.gain.value = v;
        if (ytCapGain && ytMode === 'popup') ytCapGain.gain.value = v;
        ytPost('setVolume', [Math.round(v * 100)]);
      },
      forgetFile(id) { const u = fileUrls.get(id); if (u) URL.revokeObjectURL(u); fileUrls.delete(id); },
      elapsed() {
        if (current?.yt && ytMode !== 'iframe') return startedAt ? performance.now() - startedAt : 0;
        if (current?.yt) return yt ? (yt.time + (state.status === 'playing' && yt.at ? (performance.now() - yt.at) / 1000 : 0)) * 1000 : 0;
        if (current?.type === 'digital' && audio) return audio.currentTime * 1000;
        if (synth) return Math.max(0, (actx.currentTime - synth.t0) * 1000);
        if (gpp) return Math.max(0, (actx.currentTime - gpp.t0) * 1000);
        if (atp) return Math.max(0, (actx.currentTime - atp.t0) * 1000);
        if (!startedAt) return 0;
        const e = performance.now() - startedAt;
        return loop && durationMs ? e % durationMs : Math.min(e, durationMs || e);
      },
      duration() { if (current?.yt) return (yt?.dur || 0) * 1000; return current?.type === 'digital' && audio ? (Number.isFinite(audio.duration) ? audio.duration * 1000 : 0) : durationMs; },
      destroy: halt,
    };
  })();

  // ---------- Добавление по тексту ----------
  let toastTimer = 0;
  function toast(text, err = false) {
    const el = $('.toast');
    el.textContent = text;
    el.classList.toggle('err', err);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function parseInput(raw) {
    const text = String(raw || '').trim();
    if (!text) return { error: 'Пусто' };
    const yid = ytId(text);
    if (yid) return { track: { type: 'digital', yt: yid, title: 'YouTube', titleAuto: true } };
    if (/^https?:\/\/\S+$/i.test(text)) {
      let url;
      try { url = new URL(text); } catch { return { error: 'Не получилось разобрать ссылку' }; }
      if (url.hostname === 'github.com' && url.pathname.includes('/blob/')) url = new URL(`https://raw.githubusercontent.com${url.pathname.replace('/blob/', '/')}`);
      const file = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname);
      if (/\.js$/i.test(file)) return { track: { type: 'guitar', title: titleFromFile(file), url: url.href } };
      return { track: { type: 'digital', title: file.replace(/\.[a-z0-9]{2,4}$/i, '') || url.hostname, url: url.href } };
    }
    if (/^[eBGDAE]\|.*\|\s*$/m.test(text)) {
      const name = text.split('\n').find(l => l.trim() && !/^[eBGDAE]\|/.test(l.trim()));
      return { track: { type: 'guitar', title: (name || 'Мой таб').trim().slice(0, 48), tab: text } };
    }
    const q = words(text);
    const hit = state.tracks.findIndex(t => { const w = norm(t.title); return q.every(x => w.includes(x)); });
    if (hit >= 0) return { select: hit };
    return { error: `Не нашёл «${text.slice(0, 32)}» — вставь ссылку YouTube или приложи GP/WAV` };
  }
  function addFromText(raw) {
    setOpen(true);
    scheduleClose(2500);
    const res = parseInput(raw);
    if (res.error) { toast(res.error, true); return false; }
    if (res.select !== undefined) { select(res.select); toast(`Нашёл: ${state.tracks[res.select].title}`); return true; }
    const dup = state.tracks.findIndex(t => (res.track.url && t.url === res.track.url) || (res.track.yt && t.yt === res.track.yt));
    if (dup >= 0) { select(dup); toast('Эта пластинка уже в ящике'); return true; }
    const track = addTrack(res.track);
    if (track.yt) fetchYtTitle(track);
    return true;
  }
  // Название YouTube-видео через oEmbed; если браузер не пустит — возьмём из плеера при запуске.
  function fetchYtTitle(track) {
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${track.yt}`)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.title && track.titleAuto) { track.title = d.title; delete track.titleAuto; persist(); layout(); } })
      .catch(() => {});
  }
  function addTrack(data, { temp = false } = {}) {
    const track = { ...data, id: `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, custom: true };
    if (!temp) state.custom.push(track);
    if (!persist()) toast('Пластинка добавлена, но не сохранится: мало места', true);
    insertTracks([track]);
    if (!state.tracks.includes(track)) setMode('records');
    state.sel = state.tracks.indexOf(track);
    layout();
    track.el.classList.add('add');
    sfx('add');
    const r = rel(track.el);
    setTimeout(() => burst(r.x + r.w / 2, r.y + 20, 12), 250);
    toast(`＋ ${track.title}`);
    return track;
  }
  // GP → конвертируем прямо в браузере; аудио → сохраняем в IndexedDB.
  const GP_RE = /\.(gp|gp3|gp4|gp5|gpx|gtp)$/i, AUDIO_RE = /\.(wav|mp3|ogg|oga|m4a|aac|flac|opus)$/i;
  let converterP = null;
  // loadConverter отдаёт модуль { convertGp, songEvents } (старый userscript — только функцию convertGp).
  const getConverterModule = () => converterP ||= Promise.resolve(hudOptions.loadConverter?.())
    .then(m => (typeof m === 'function' ? { convertGp: m } : m))
    .then(m => { if (typeof m?.convertGp !== 'function') throw new Error('конвертер GP недоступен'); return m; })
    .catch(err => { converterP = null; throw err; });
  const getConverter = () => getConverterModule().then(m => m.convertGp);
  async function addFiles(files) {
    setOpen(true);
    for (const file of files) {
      try {
        if (GP_RE.test(file.name)) {
          toast(`Конвертирую ${file.name}…`);
          const convert = await getConverter();
          const data = convert(new Uint8Array(await file.arrayBuffer()), file.name, 8);
          // Сам GP тоже сохраняем: пластинка играет его всеми партиями настоящими инструментами.
          const gpFileId = `g-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          const saved = await idb.put(gpFileId, file).then(() => true, () => false);
          addTrack({ type: 'guitar', title: data.title, score: data.score, bpm: data.bpm, ...(saved ? { gpFileId } : {}) });
        } else if (AUDIO_RE.test(file.name) || file.type.startsWith('audio/')) {
          const title = file.name.replace(/\.[^.]+$/, '');
          const fileId = `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          try {
            await idb.put(fileId, file);
            addTrack({ type: 'digital', title, fileId });
          } catch {
            addTrack({ type: 'digital', title, url: URL.createObjectURL(file) }, { temp: true });
            toast('Файл добавлен до перезагрузки: браузер не дал его сохранить', true);
          }
        } else toast(`${file.name}: нужен GP или WAV`, true);
      } catch (err) {
        console.error('[FreakRating DJ]', err);
        toast(`${file.name}: ${err?.message || 'не получилось добавить'}`, true);
      }
    }
    scheduleClose(2500);
  }
  function insertTracks(list) {
    const curId = state.tracks[state.sel]?.id;
    for (const t of list) { if (!KINDS[t.type]) t.type = 'guitar'; state.all.push(t); }
    refreshView(curId);
  }
  function removeSelected() {
    const t = state.tracks[state.sel];
    if (!t?.custom) return;
    if (state.loaded === t) ctl.stop();
    state.custom = state.custom.filter(c => c.id !== t.id);
    if (t.fileId) { ctl.forgetFile(t.fileId); idb.del(t.fileId).catch(() => {}); }
    if (t.gpFileId) idb.del(t.gpFileId).catch(() => {});
    state.all = state.all.filter(x => x !== t);
    state.loaded = state.loaded === t ? null : state.loaded;
    refreshView();
    persist();
    toast(`Убрал: ${t.title}`);
  }
  function openAdd(prefill = '') {
    addbox.hidden = false;
    setOpen(true);
    dj.classList.add('adding');
    input.value = prefill;
    input.focus();
    input.select();
  }
  const closeAdd = () => { addbox.hidden = true; dj.classList.remove('adding'); input.blur(); scheduleClose(1500); };
  // ---------- События ----------
  root.addEventListener('click', e => {
    const target = e.target.closest('button, .rec, .table');
    if (!target) return;
    if (target.matches('.clipbtn')) return addbox.hidden ? openAdd() : closeAdd();
    if (target.matches('.table')) { if (state.loaded && !state.flying) ctl.stop(); return; }
    if (target.matches('.arrow.l')) return select(state.sel - 1);
    if (target.matches('.arrow.r')) return select(state.sel + 1);
    if (target.matches('.attach')) return fileInput.click();
    if (target.matches('.mode')) return setMode(target.dataset.mode);
    if (target.matches('.spk')) return setBroadcast(!state.broadcast);
    if (target.matches('.micb')) return setVoice(!state.voice);
    if (target.matches('.rgb')) return setRhythm({ 0: 3, 3: 4, 4: 5, 5: 0 }[state.rhythm]);
    const i = target.matches('.rec') ? Number(target.dataset.i) : -1;
    if (i < 0 || !state.tracks[i]) return;
    if (i !== state.sel) return select(i);
    const t = state.tracks[i];
    if (state.loaded === t && state.status !== 'idle') ctl.stop();
    else start(t);
  });
  // ПКМ по выбранной своей пластинке — убрать её из ящика.
  recordsEl.addEventListener('contextmenu', e => {
    const rec = e.target.closest('.rec');
    if (!rec || Number(rec.dataset.i) !== state.sel || !state.tracks[state.sel]?.custom) return;
    e.preventDefault();
    removeSelected();
  });
  fileInput.addEventListener('change', () => { const files = [...fileInput.files]; fileInput.value = ''; if (files.length) { closeAdd(); addFiles(files); } });
  volr.addEventListener('input', () => setVolume(volr.value / 100));
  table.addEventListener('wheel', e => {
    if (notesMode()) return;
    e.preventDefault();
    setVolume(state.volume - Math.sign(e.deltaY) * 0.1);
  }, { passive: false });
  // Перетаскивание GP/WAV на HUD.
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  host.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); setOpen(true); dj.classList.add('drop'); });
  host.addEventListener('dragleave', e => { if (!host.contains(e.relatedTarget)) dj.classList.remove('drop'); });
  host.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dj.classList.remove('drop');
    addFiles([...e.dataTransfer.files]);
  });
  $('.crate').addEventListener('wheel', e => { e.preventDefault(); select(state.sel + Math.sign(e.deltaY || e.deltaX)); }, { passive: false });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { if (addFromText(input.value)) closeAdd(); }
    else if (e.key === 'Escape') closeAdd();
  });
  // Пока печатаем в поле, игра не должна получать нажатия.
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, e => { if (e.composedPath()[0] instanceof HTMLInputElement) e.stopPropagation(); });
  // Ящик спрятан за углом и выезжает, когда курсор тянется в левый нижний угол.
  let closeTimer = 0;
  function setOpen(v) {
    clearTimeout(closeTimer);
    if (dj.classList.contains('open') === v) return;
    dj.classList.toggle('open', v);
    if (v) sfx('select');
  }
  const scheduleClose = (ms = 700) => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (addbox.hidden && !state.flying && !inDrawer && !inDeck) setOpen(false); else scheduleClose(ms); }, ms);
  };
  let inDrawer = false, inDeck = false;
  // Наведение на проигрыватель тоже выдвигает ящик.
  table.addEventListener('pointerenter', () => { inDeck = true; setOpen(true); });
  table.addEventListener('pointerleave', () => { inDeck = false; scheduleClose(); });
  const drawer = $('.drawer');
  drawer.addEventListener('pointerenter', () => { inDrawer = true; setOpen(true); });
  drawer.addEventListener('pointerleave', () => { inDrawer = false; scheduleClose(); });
  const onCorner = e => {
    if (document.pointerLockElement) return;
    const near = e.clientX < 90 && e.clientY > window.innerHeight - 130;
    if (near) setOpen(true);
  };
  document.addEventListener('mousemove', onCorner, { passive: true });
  host.addEventListener('pointerenter', () => { state.hover = true; });
  host.addEventListener('pointerleave', () => { state.hover = false; });
  const onPaste = e => {
    if (e.composedPath()[0] === input) return;
    const editable = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.target.tagName));
    if (!state.hover || editable) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(files); return; }
    const text = e.clipboardData?.getData('text') || '';
    if (!text.trim()) return;
    e.preventDefault();
    if (!addFromText(text)) openAdd(text.trim());
  };
  document.addEventListener('paste', onPaste);
  // Игрок пишет в чат игры (Enter → поле чата в фокусе) — прячем весь HUD. Наше поле ввода — внутри host, его не считаем.
  const typingInGame = () => {
    const a = document.activeElement;
    return !!a && a !== host && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  };
  const onFocusChange = () => setTimeout(() => dj.classList.toggle('typing', typingInGame()), 0);
  document.addEventListener('focusin', onFocusChange, true);
  document.addEventListener('focusout', onFocusChange, true);
  const mount = () => {
    const parent = document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : document.body;
    if (parent && host.parentElement !== parent) parent.append(host);
  };
  document.addEventListener('fullscreenchange', mount);

  // ---------- Свободный курсор без паузы ----------
  // Ё/` освобождает курсор. Игра ставит паузу и выходит из гитары в обработчике pointerlockchange,
  // поэтому этот разлок мы перехватываем на window (capture) раньше игры. Повторное нажатие или клик по игре — назад.
  let suppressUnlock = false, lockTarget = null;
  const onLockChange = e => {
    if (suppressUnlock && !document.pointerLockElement) { suppressUnlock = false; e.stopImmediatePropagation(); }
    if (document.pointerLockElement) suppressUnlock = false;
    layout();
  };
  const onHotkey = e => {
    if (e.code !== 'Backquote' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.composedPath()[0];
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (document.pointerLockElement) {
      lockTarget = document.pointerLockElement;
      suppressUnlock = true;
      document.exitPointerLock();
    } else if (lockTarget?.isConnected) {
      try { lockTarget.requestPointerLock()?.catch?.(() => {}); } catch { /* ignore */ }
    }
  };
  window.addEventListener('pointerlockchange', onLockChange, true);
  window.addEventListener('keydown', onHotkey, true);

  // ---------- Публичный API ----------
  window.FreakDJ = {
    async start(options = {}) {
      ctl.setOptions(options);
      hudOptions = options;
      if (state.broadcast && !mic.setActive(true)) state.broadcast = false;
      if (!state.voice && !mic.setVoice(false)) state.voice = true;
      mount();
      renderDeck();
      let lib = [];
      try {
        lib = (await options.listSongs?.() || []).map(s => ({ id: `lib:${s.file}`, type: 'guitar', title: s.title || titleFromFile(s.file), url: s.url }));
      } catch (err) {
        console.error('[FreakRating DJ]', err);
        toast('Не загрузил библиотеку песен', true);
      }
      lib.sort((a, b) => a.title.localeCompare(b.title));
      insertTracks([...lib, ...(options.extraTracks || []).map((t, i) => ({ id: `x:${i}`, ...t })), ...state.custom]);
      const i = state.tracks.findIndex(t => t.id === saved.selId);
      state.sel = i >= 0 ? i : 0;
      if (!state.tracks.length) $('.empty').textContent = 'Ящик пуст — вставь ссылку (Ctrl+V)';
      layout();
      return this;
    },
    addTrack: addFromText,
    _rhythm: () => rhythm.debug(),
    destroy() {
      ctl.destroy();
      rhythm.destroy();
      clearInterval(tickTimer);
      clearInterval(seatTimer);
      clearInterval(noteTimer);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('focusin', onFocusChange, true);
      document.removeEventListener('focusout', onFocusChange, true);
      document.removeEventListener('mousemove', onCorner);
      window.removeEventListener('pointerlockchange', onLockChange, true);
      window.removeEventListener('keydown', onHotkey, true);
      document.removeEventListener('fullscreenchange', mount);
      host.remove();
      delete window.FreakDJ;
    },
  };
})();
