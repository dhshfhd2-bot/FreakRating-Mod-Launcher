// Чистый лаунчер на базе файлов из freakrating-client-main.
// Модов внутри нет: они кладутся в папку mods рядом с установленной программой.
const { app } = require('electron')
const path = require('path')

try {
  app.setPath('userData', path.join(app.getPath('appData'), 'FreakRating'))
} catch (_) {}

require('./mod-loader.js')
require('./dist/main/main.js')
