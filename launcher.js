// Чистый лаунчер: только загрузчик модов и клиент.
const { app } = require('electron')
app.commandLine.appendSwitch('no-proxy-server')
require('./mod-loader.js')
require('./dist/main/main.js')
