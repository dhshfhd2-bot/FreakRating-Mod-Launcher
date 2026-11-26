// Чистый лаунчер. Моды лежат в папке mods:
//   mods\*.js        — внедряются в окно мира
//   mods\main\*.js   — подключаются в главном процессе (например TikTok)
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

app.commandLine.appendSwitch('no-proxy-server')

try {
  app.setPath('userData', path.join(app.getPath('appData'), 'FreakRating'))
} catch (_) {}

const MODS_DIR = path.join(__dirname, 'mods')
const MAIN_DIR = path.join(MODS_DIR, 'main')

function loadMainMods() {
  try {
    fs.mkdirSync(MAIN_DIR, { recursive: true })
    for (const f of fs.readdirSync(MAIN_DIR)) {
      if (!f.endsWith('.js')) continue
      try {
        require(path.join(MAIN_DIR, f))
        console.info('[launcher] main-мод:', f)
      } catch (err) {
        console.warn('[launcher] ошибка main-мода', f, err)
      }
    }
  } catch (err) {
    console.warn('[launcher] папка mods/main:', err)
  }
}

loadMainMods()
require('./mod-loader.js')
require('./dist/main/main.js')
