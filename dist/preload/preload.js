"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// window.freakClient — узкое API клиента для страницы мира. Контракт: docs/API.md.
// Preload работает в sandbox: только `electron`, никаких своих модулей.
const electron_1 = require("electron");
const API_VERSION = 1;
function subscribe(channel, cb) {
    if (typeof cb !== "function")
        throw new TypeError("callback must be a function");
    const listener = (_e, payload) => {
        try {
            cb(payload);
        }
        catch (err) {
            console.error("[freakClient]", channel, err);
        }
    };
    electron_1.ipcRenderer.on(channel, listener);
    return () => {
        electron_1.ipcRenderer.removeListener(channel, listener);
    };
}
// Событие о восстановлении приходит на did-finish-load — страница могла ещё не
// подписаться. Запоминаем и отдаём при подписке.
let lastRecovery = null;
electron_1.ipcRenderer.on("fc:crashRecovered", (_e, payload) => {
    lastRecovery = payload;
});
function onCrashRecovered(cb) {
    const unsubscribe = subscribe("fc:crashRecovered", cb);
    if (lastRecovery) {
        const payload = lastRecovery;
        queueMicrotask(() => cb(payload));
    }
    return unsubscribe;
}
// Окно свёрнуто или спрятано. Страница могла подписаться позже события — отдаём
// последнее «спрятано» при подписке.
let windowHidden = false;
electron_1.ipcRenderer.on("fc:windowVisibility", (_e, hidden) => {
    windowHidden = hidden === true;
});
function onWindowVisibility(cb) {
    const unsubscribe = subscribe("fc:windowVisibility", cb);
    if (windowHidden)
        queueMicrotask(() => cb(true));
    return unsubscribe;
}
const info = electron_1.ipcRenderer.sendSync("fc:info");
const api = {
    apiVersion: API_VERSION,
    clientVersion: info.clientVersion,
    platform: info.platform,
    /** Esc даёт странице пользовательскую активацию: после него можно снова захватить мышь. */
    escapeGesture: true,
    /** Рация глобальной клавишей: "down" — нажали, "up" — отпустили. */
    onPtt: (cb) => subscribe("fc:ptt", cb),
    /** Мир перезагружен после падения GPU/страницы. */
    onCrashRecovered,
    /** Окно свернули или спрятали (`true`) и вернули (`false`): не рисовать кадры, пока не видно. */
    onWindowVisibility,
    /** Настройки клиента поменялись (игрок что-то переключил в окне настроек). */
    onSettingsChanged: (cb) => subscribe("fc:settingsChanged", cb),
    /** Статус в Discord; null — убрать. */
    setPresence: (presence) => electron_1.ipcRenderer.send("fc:setPresence", presence ?? null),
    getDiagnostics: () => electron_1.ipcRenderer.invoke("fc:getDiagnostics"),
    getSettings: () => electron_1.ipcRenderer.invoke("fc:getSettings"),
    /** Сохранить графический бэкенд; применится после relaunch(). */
    setGraphicsBackend: (backend) => electron_1.ipcRenderer.invoke("fc:setGraphicsBackend", backend),
    /** Перезапустить клиент (после смены бэкенда). Вернёт мир на тот же адрес. */
    relaunch: () => electron_1.ipcRenderer.invoke("fc:relaunch"),
    /** Открыть окно настроек клиента. */
    openSettings: () => electron_1.ipcRenderer.invoke("fc:openSettings"),
    /** Нажать клавишу от имени клиента (доверенное событие для модов). */
    pressKey: (keyCode) => electron_1.ipcRenderer.invoke("fc:press-key", keyCode),
    /**
     * Показ экрана: getDisplayMedia работает, звук — `screenAudio`:
     * "loopback" — уже в дорожке getDisplayMedia, "virtual-mic" — взять startScreenAudio, "none" — нет.
     */
    screenShare: true,
    screenAudio: info.screenAudio,
    /** Linux: свести звук программ (кроме клиента) в микрофон; его метка для getUserMedia или null. */
    startScreenAudio: () => electron_1.ipcRenderer.invoke("fc:startScreenAudio"),
    stopScreenAudio: () => electron_1.ipcRenderer.invoke("fc:stopScreenAudio"),
};
electron_1.contextBridge.exposeInMainWorld("freakClient", Object.freeze(api));
// ---------- встроенный DJ ----------
// Раньше это был userscript для Tampermonkey. В клиенте код DJ лежит в dj/ и отдаётся главным
// процессом; в страницу он попадает через webFrame.executeJavaScript (главный мир, мимо CSP сайта).
// Сеть (семплы, alphaTab) — тоже через главный процесс: у страницы мира CORS закрыт.
// Страницу /world главный процесс определяет сам; на других страницах и при выключенном DJ вернёт null.
const toArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
/**
 * Прежняя раскладка в новой версии игры: список сверху, карта под ним.
 * Теперь это родная настройка карты в localStorage — никаких CSS-костылей.
 */
function setupOldMapLayout() {
    try {
        const key = "freakland:world-map";
        let cur = {};
        try {
            cur = JSON.parse(localStorage.getItem(key) || "{}");
        }
        catch { /* пусто */ }
        localStorage.setItem(key, JSON.stringify({
            ...cur,
            view: "iso",
            tab: "bottom",
            bottom: 0.55,
        }));
        console.info("[layout] список сверху, объёмная карта снизу");
    }
    catch (err) {
        console.warn("[layout] не задал раскладку", err);
    }
}
/** Приподнимаем карту над хотбаром, не меняя её внутренние размеры. */
function liftMapOffHotbar() {
    const add = () => {
        if (!document.head || document.getElementById("fr-map-lift"))
            return;
        const st = document.createElement("style");
        st.id = "fr-map-lift";
        st.textContent = ".tab-with-map.map-bottom{bottom:72px!important}" +
            ".tab-with-map.map-bottom .tab-map{margin-left:auto!important;margin-right:auto!important}";
        document.head.appendChild(st);
    };
    if (document.readyState === "loading")
        window.addEventListener("DOMContentLoaded", add, { once: true });
    else
        add();
}
try {
    setupOldMapLayout();
    liftMapOffHotbar();
}
catch (err) {
    console.error('[layout]', err);
}
