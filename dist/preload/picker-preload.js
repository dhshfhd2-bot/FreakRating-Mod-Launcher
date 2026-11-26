"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// API окна выбора экрана (локальная страница dist/picker/picker.html).
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("screenPicker", Object.freeze({
    sources: () => electron_1.ipcRenderer.invoke("fc:picker:sources"),
    choose: (id) => electron_1.ipcRenderer.send("fc:picker:choose", id),
}));
