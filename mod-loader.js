// Загрузчик модов для исходной сборки: берёт все .js из ./mods и внедряет
// в окно мира. Пишет лог в mods\_inject.log.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const MODS_DIR = path.join(__dirname, 'mods');
const lastInject = new WeakMap();

function readMods() {
  try {
    fs.mkdirSync(MODS_DIR, { recursive: true });
    return fs.readdirSync(MODS_DIR)
      .filter((f) => f.endsWith('.js'))
      .sort()
      .map((f) => ({ name: f, code: fs.readFileSync(path.join(MODS_DIR, f), 'utf8') }));
  } catch (e) {
    console.warn('[mods] папка mods:', e.message);
    return [];
  }
}

function log(line) {
  try { fs.appendFileSync(path.join(MODS_DIR, '_inject.log'), line + '\n', 'utf8'); } catch (_) {}
}

async function inject(wc) {
  if (wc.isDestroyed()) return;
  const url = wc.getURL();
  log('URL ' + url);
  if (!url || url.startsWith('devtools://')) return;
  let isWorld = false;
  try { isWorld = new URL(url).pathname.startsWith('/world'); } catch (_) {}
  if (!isWorld) return;
  const now = Date.now();
  if (now - (lastInject.get(wc) || 0) < 1000) return;
  lastInject.set(wc, now);
  const mods = readMods();
  const names = mods.map((m) => m.name).join(', ') || 'нет';
  log(new Date().toISOString() + ' → ' + names);
  console.info('[mods] внедряем:', names);
  for (const m of mods) {
    try { await wc.executeJavaScript(m.code); }
    catch (err) { log('ОШИБКА ' + m.name + ': ' + err); console.warn('[mods]', m.name, err); }
  }
  try {
    log('FRStencil=' + await wc.executeJavaScript('!!window.FRStencil') +
      ' keys=' + await wc.executeJavaScript('Object.keys(window).filter(function(k){return /FRStencil/i.test(k)}).join(",")'))
  } catch (_) {}
  setTimeout(async () => {
    try { log('FRStencil@5s=' + await wc.executeJavaScript('!!window.FRStencil')) } catch (_) {}
  }, 5000);
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (_e, level, message) => {
    if (level >= 2 || /FR Stencil/.test(String(message))) log('CONSOLE ' + level + ' ' + message)
  });
  wc.on('did-finish-load', () => void inject(wc));
  wc.on('dom-ready', () => setTimeout(() => void inject(wc), 1500));
});
