// Универсальный проигрыватель для гитары Forest.
// Вставлять в Chrome DevTools Console, находясь за гитарой.
// Score: [{at: beat, dur: beats, notes: ['A4', 'C5'], chord:'Am'}]. Поддерживаются ноты, аккорды и ASCII-табы.
(async () => {
  const performanceEngine = performance.getEntriesByType('resource').map(e=>e.name).find(n=>/\/assets\/engine-[^/]+\.js/.test(n));
  let engineUrl=performanceEngine;
  if(!engineUrl){
    const app=[...document.scripts].map(s=>s.src).find(src=>/\/assets\/app-/.test(src));
    const appText=await (await fetch(app)).text();
    const worldPath=appText.match(/assets\/WorldPage-[\w-]+\.js/)[0];
    const worldUrl=new URL('/'+worldPath,location.origin);
    const worldText=await (await fetch(worldUrl)).text();
    engineUrl=new URL('/'+worldText.match(/assets\/engine-[\w-]+\.js/)[0],location.origin).href;
  }
  const {WorldEngine}=await import(engineUrl);
  const proto=WorldEngine.prototype;
  if(!proto.__guitarTap){
    const frame=proto.frame;
    proto.frame=function(...args){
      const result=frame.apply(this,args), found=this.room?.guitar;
      window.__forestGuitar=found?.onKey&&found?.onKeyUp?found:null;
      return result;
    };
    proto.__guitarTap=true;
  }
  let guitar;
  const findGuitar = () => window.__forestGuitar?.playing ? window.__forestGuitar : null;
  const up = key => guitar.onKeyUp(key);
  const wait = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  const active = new Map(), activeChords = new Map();
  // События для HUD: waiting → playing({durationMs, loop}) → ended.
  const emit = (state, extra = {}) => { try { window.dispatchEvent(new CustomEvent('guitarplayer', {detail:{state, ...extra}})); } catch {} };
  let serial = 0;

  const stop = () => {
    window.__stopSong = true;
    serial++;
    for (const code of active.keys()) up(code);
    for (const code of activeChords.keys()) up(code);
    active.clear();
    activeChords.clear();
  };
  const previous = window.__songDone;
  window.guitarPlayer?.stop();
  stop();
  await Promise.resolve(previous).catch(() => {});

  // Гитара Forest (обновление ноя 2026): с клавиатуры только белые клавиши A S D F G H J (E4…D5),
  // Shift — октава выше, Ctrl — ниже. Сам звук и сеть принимают любую ноту 40…86, поэтому ноты подаём
  // прямо в гитару так же, как это делает её onKey (notes → sound.noteOn → queue), — с диезами.
  // Если внутренности гитары поменяются, откатываемся на клавиши (диезы тогда округляются).
  const LOW = 40, HIGH = 86;
  const pitch = note => {
    const m = /^([A-G])([#b]?)(-?[0-9])$/.exec(note);
    if (!m) throw new Error(`Неверная нота: ${note}`);
    const semitone = {C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 12 * (Number(m[3]) + 1) + semitone;
  };
  const fit = midi => { while (midi < LOW) midi += 12; while (midi > HIGH) midi -= 12; return midi; };
  const direct = () => guitar?.notes instanceof Map && typeof guitar.sound?.noteOn === 'function' && typeof guitar.queue === 'function';
  const WHITE = [['KeyA',64],['KeyS',65],['KeyD',67],['KeyF',69],['KeyG',71],['KeyH',72],['KeyJ',74]];
  const viaKeys = midi => {
    let best = null;
    for (const [code, base] of WHITE) for (const [shift, ctrl, d] of [[false,false,0],[true,false,12],[false,true,-12]]) {
      const dist = Math.abs(base + d - midi);
      if (!best || dist < best.dist) best = {code, mods:{shift, ctrl}, dist};
    }
    return best;
  };
  // Держим не больше 8 нот: при переполнении отпускаем самую старую.
  const room = key => { if (active.size >= 8 && !active.has(key)) { const [old] = active.keys(); up(old); active.delete(old); } };
  const noteOn = (note, id) => {
    const midi = fit(pitch(note));
    if (direct()) {
      const key = `dj:${midi}`;
      if (active.has(key)) { up(key); active.delete(key); }
      room(key);
      guitar.notes.set(key, midi);
      guitar.sound.noteOn(midi);
      guitar.kick = 1;
      guitar.queue(midi, 3);
      // Не дёргаем refreshHud() на каждую ноту — игра перерисовывает весь HUD
      // и начинает подтормаживать. Свой HUD нот мод рисует сам.
      active.set(key, id);
      return key;
    }
    const k = viaKeys(midi);
    if (active.has(k.code)) { up(k.code); active.delete(k.code); }
    room(k.code);
    guitar.onKey(k.code, k.mods);
    active.set(k.code, id);
    return k.code;
  };
  // Аккорды: старые номера 1–8 из песен (Am C G Em Dm F E D) или имена вида Am, F#, C#m.
  const CHORD_BY_NUM = ['Am','C','G','Em','Dm','F','E','D'];
  const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const chordOf = chord => {
    const name = typeof chord === 'number' ? CHORD_BY_NUM[chord - 1] : String(chord);
    const m = /^([A-G])([#b]?)(m?)$/.exec(name || '');
    if (!m) return null;
    let root = NAMES.indexOf(m[1]) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    root = (root + 12) % 12;
    return root + (m[3] ? 12 : 0);
  };
  const chordOn = (chord, id) => {
    const n = chordOf(chord), key = 'dj:chord';
    if (n === null || typeof guitar.strike !== 'function') return null;
    if (activeChords.has(key)) { up(key); activeChords.delete(key); }
    guitar.strike(key, n);
    activeChords.set(key, id);
    return key;
  };

  // until (в долях) — не завершать раньше этой доли: ритм-игра доигрывает свои ноты сама через strike().
  const play = async (score, {bpm=120, loop=false, humanizeMs=4, until=0}={}) => {
    const previous = window.__songDone;
    stop();
    await Promise.resolve(previous).catch(() => {});
    window.__stopSong = false;
    const seek = serial;
    emit('waiting');
    console.info('Жду гитару Forest: сними паузу и сядь за гитару.');
    while (!window.__stopSong && seek === serial && !(guitar = findGuitar())) await wait(300);
    if (window.__stopSong || seek !== serial) { emit('ended'); return; }
    for (let i = 0; guitar.mode !== 'melody' && i < 3; i++) guitar.onKey('KeyR');
    console.info('Гитара найдена, начинаю проигрывание.');
    const run = ++serial, beatMs = 60000 / bpm, actions = [];
    let noteId = 0;
    for (const e of score) {
      const notes = Array.isArray(e.notes) ? e.notes : [e.note];
      for (const note of notes.filter(Boolean)) {
        const id = ++noteId, at = Number(e.at), dur = Number(e.dur ?? 1);
        if (!Number.isFinite(at) || at < 0 || !Number.isFinite(dur) || dur <= 0) throw new Error(`Неверный ритм у ноты ${note}`);
        actions.push({at, kind:'on', note, id});
        actions.push({at:at+dur, kind:'off', id});
      }
      if(e.chord){
        const chord=e.chord,at=Number(e.at),dur=Number(e.dur??1);
        if(chordOf(chord)===null)throw new Error(`Неизвестный аккорд: ${e.chord}`);
        const id=++noteId;
        actions.push({at,kind:'chordOn',chord,id},{at:at+dur,kind:'chordOff',id});
      }
    }
    actions.sort((a,b) => {
      if(a.at!==b.at)return a.at-b.at;
      const aOff=a.kind==='off'||a.kind==='chordOff',bOff=b.kind==='off'||b.kind==='chordOff';
      return aOff===bOff?0:aOff?-1:1;
    });
    const endBeat = Math.max(actions.at(-1)?.at ?? 0, Number(until) || 0);
    emit('playing', {durationMs: endBeat * beatMs, loop});
    const task = (async () => {
      const ids = new Map();
      try {
        do {
          const start = performance.now();
          for (const a of actions) {
            if (window.__stopSong || run !== serial) break;
            const jitter = a.kind === 'on' ? (Math.random()*2-1)*humanizeMs : 0;
            await wait(start + a.at*beatMs + jitter - performance.now());
            if (window.__stopSong || run !== serial) break;
            if (a.kind === 'on') {
              ids.set(a.id, {code:noteOn(a.note, a.id),kind:'note'});
            } else if(a.kind==='chordOn'){
              const code=chordOn(a.chord,a.id);
              if(code)ids.set(a.id,{code,kind:'chord'});
            } else {
              const held = ids.get(a.id), code = held?.code;
              if (held?.kind==='note' && code && active.get(code) === a.id) { up(code); active.delete(code); }
              if (held?.kind==='chord' && code && activeChords.get(code)===a.id) { up(code); activeChords.delete(code); }
              ids.delete(a.id);
            }
          }
          if (!loop || window.__stopSong || run !== serial) {
            while (!loop && !window.__stopSong && run === serial && performance.now() - start < endBeat * beatMs) await wait(Math.min(200, start + endBeat * beatMs - performance.now()));
            break;
          }
          await wait((actions.at(-1)?.at ?? 0)*beatMs + beatMs - (performance.now()-start));
        } while (!window.__stopSong && run === serial);
      } finally {
        for (const code of active.keys()) up(code);
        for (const code of activeChords.keys()) up(code);
        active.clear();
        activeChords.clear();
        emit('ended');
      }
    })();
    window.__songDone = task;
    return task;
  };

  const playTab = (tab, {columnsPerBeat=8, ...options}={}) => {
    const tuning={e:64,B:59,G:55,D:50,A:45,E:40}, names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    let offset=0;
    const score=[];
    for(const block of String(tab).trim().split(/\n\s*\n/)){
      const at={};
      for(const line of block.split('\n')){
        const row=line.trim().match(/^([eBGDAE])\|(.*)\|$/);
        if(!row)continue;
        for(const m of row[2].matchAll(/\d+/g)){
          const midi=tuning[row[1]]+Number(m[0]);
          const note=names[midi%12]+(Math.floor(midi/12)-1);
          (at[m.index]??=[]).push(note);
        }
      }
      const points=Object.keys(at).map(Number).sort((a,b)=>a-b);
      if(!points.length)continue;
      points.forEach((point,i)=>{
        const next=points[i+1]??point+columnsPerBeat;
        score.push({at:offset+point/columnsPerBeat,dur:(next-point)/columnsPerBeat,notes:at[point]});
      });
      offset+=(points.at(-1)+columnsPerBeat)/columnsPerBeat;
    }
    return play(score,options);
  };

  // strike(notes, durMs) — сыграть ноты прямо сейчас (ритм-игра HUD: попал по ноте — она звучит).
  // Возвращает функцию, которая отпускает ноты раньше (отпустил длинную ноту).
  let strikeId = 0;
  const strike = (notes, durMs = 250) => {
    const found = findGuitar();
    if (!found || window.__stopSong) return () => {};
    guitar = found;
    const id = `s${++strikeId}`, codes = [];
    for (const note of notes || []) {
      try {
        codes.push(noteOn(note, id));
      } catch { /* нота вне диапазона гитары */ }
    }
    let done = false;
    const release = () => { if (done) return; done = true; for (const code of codes) if (active.get(code) === id) { up(code); active.delete(code); } };
    setTimeout(release, Math.max(60, durMs));
    return release;
  };

  // seated() — сидит ли игрок за гитарой Forest прямо сейчас (для HUD: режим нот).
  window.guitarPlayer = {play, playTab, stop, strike, seated: () => !!findGuitar()};
  console.info('Гитарный проигрыватель готов: guitarPlayer.play(score,{bpm,loop}) или guitarPlayer.playTab(tab,{bpm,loop})');
})();
