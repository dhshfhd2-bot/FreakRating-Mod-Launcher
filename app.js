// Свой лаунчер поверх FreakRating. Не заменяет игру — просто открывает мир
// и внедряет моды из папки mods рядом с этим файлом.
const { app, BrowserWindow, shell, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const MODS_DIR = path.join(ROOT, 'mods')
const START_URL = 'https://freakrating.lol/world'

app.commandLine.appendSwitch('no-proxy-server')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

function readMods() {
  try {
    fs.mkdirSync(MODS_DIR, { recursive: true })
    return fs.readdirSync(MODS_DIR)
      .filter((f) => f.endsWith('.js'))
      .sort()
      .map((f) => ({ name: f, code: fs.readFileSync(path.join(MODS_DIR, f), 'utf8') }))
  } catch (e) {
    console.warn('[mods]', e.message)
    return []
  }
}

function log(line) {
  try { fs.appendFileSync(path.join(MODS_DIR, '_launcher.log'), line + '\n', 'utf8') } catch (_) {}
}

let win = null
const injected = new WeakSet()

async function inject(wc) {
  if (wc.isDestroyed() || injected.has(wc)) return
  const url = wc.getURL()
  log('URL ' + url)
  if (!url || url.startsWith('devtools://') || !new URL(url).pathname.startsWith('/world')) return
  injected.add(wc)
  const mods = readMods()
  const names = mods.map((m) => m.name).join(', ') || 'нет'
  log(new Date().toISOString() + ' → ' + names)
  console.info('[mods] внедряем:', names)
  for (const m of mods) {
    try { await wc.executeJavaScript(m.code) }
    catch (err) { log('ОШИБКА ' + m.name + ': ' + err); console.warn('[mods]', m.name, err) }
  }
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Мир • FreakRating (с модами)',
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })
  fs.mkdirSync(MODS_DIR, { recursive: true })
  log('START ' + new Date().toISOString())
  win.webContents.on('did-fail-load', (_e, code, desc) => log('FAIL ' + code + ' ' + desc))
  win.webContents.on('dom-ready', () => log('DOM ' + win.webContents.getURL()))
  win.webContents.on('did-finish-load', () => void inject(win.webContents))
  win.webContents.on('dom-ready', () => setTimeout(() => void inject(win.webContents), 1500))
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/.test(u)) void shell.openExternal(u)
    return { action: 'deny' }
  })
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta) && input.shift && input.key === 'F12') {
      e.preventDefault()
      win.webContents.toggleDevTools()
    }
  })
  win.webContents.on('did-navigate', (_e, u) => log('NAV ' + u))
  win.loadURL(START_URL).catch((err) => log('LOAD ERR ' + err))
  win.on('closed', () => { win = null })
})
