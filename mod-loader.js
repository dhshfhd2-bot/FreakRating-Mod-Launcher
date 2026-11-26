// Загрузчик модов: папка mods рядом с FreakRating Mods.exe.
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const MODS_DIR = path.join(path.dirname(process.execPath), 'mods')
const injected = new WeakSet()

function readMods() {
  try {
    fs.mkdirSync(MODS_DIR, { recursive: true })
    return fs.readdirSync(MODS_DIR)
      .filter((f) => f.endsWith('.js'))
      .sort()
      .map((f) => ({ name: f, code: fs.readFileSync(path.join(MODS_DIR, f), 'utf8') }))
  } catch (e) {
    return []
  }
}

function log(line) {
  try { fs.appendFileSync(path.join(MODS_DIR, '_inject.log'), line + '\n', 'utf8') } catch (_) {}
}

async function inject(wc) {
  if (wc.isDestroyed() || injected.has(wc)) return
  const url = wc.getURL()
  if (!url || url.startsWith('devtools://')) return
  let world = false
  try { world = new URL(url).pathname.startsWith('/world') } catch (_) {}
  if (!world) return
  injected.add(wc)
  const mods = readMods()
  log(new Date().toISOString() + ' → ' + (mods.map((m) => m.name).join(', ') || 'нет'))
  for (const m of mods) {
    try { await wc.executeJavaScript(m.code) }
    catch (err) { log('ОШИБКА ' + m.name + ': ' + err) }
  }
}

app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', () => void inject(wc))
  wc.on('dom-ready', () => setTimeout(() => void inject(wc), 1500))
})
