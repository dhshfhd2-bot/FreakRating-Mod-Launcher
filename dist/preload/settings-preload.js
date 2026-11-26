"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// API окна настроек клиента (локальная страница dist/settings/settings.html).
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("clientSettings", Object.freeze({
    get: () => electron_1.ipcRenderer.invoke("fc:getSettings"),
    setGraphicsBackend: (b) => electron_1.ipcRenderer.invoke("fc:setGraphicsBackend", b),
    setPreferDiscreteGpu: (on) => electron_1.ipcRenderer.invoke("fc:setPreferDiscreteGpu", on),
    setDj: (on) => electron_1.ipcRenderer.invoke("fc:setDj", on),
    capturePtt: () => electron_1.ipcRenderer.invoke("fc:capturePtt"),
    clearPtt: () => electron_1.ipcRenderer.invoke("fc:clearPtt"),
    relaunch: () => electron_1.ipcRenderer.invoke("fc:relaunch"),
    copyDiagnostics: () => electron_1.ipcRenderer.invoke("fc:copyDiagnostics"),
    openDumps: () => electron_1.ipcRenderer.invoke("fc:openDumps"),
    recordProfile: () => electron_1.ipcRenderer.invoke("fc:recordProfile"),
    onChanged: (cb) => {
        electron_1.ipcRenderer.on("fc:settingsChanged", (_e, s) => cb(s));
    },
}));
