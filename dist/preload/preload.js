"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// window.freakClient — узкое API клиента для страницы мира. Контракт: docs/API.md.
// Preload работает в sandbox: только `electron`, никаких своих модулей.
const electron_1 = require("electron");
const API_VERSION = 1;
// Трафарет ставим ДО скриптов игры: иначе её window-capture слушатель
// вызовет stopImmediatePropagation() и Shift+Y не сработает.
try {
    const src = electron_1.ipcRenderer.sendSync("fc:stencil-source");
    console.info("[stencil] preload source", typeof src, src ? src.length : 0);
    if (src)
        electron_1.webFrame.executeJavaScript(src + "\n;0").then(() => console.info("[stencil] preload injected"), (err) => console.warn("[stencil] preload error", err));
}
catch (err) {
    console.warn("[stencil] preload catch", err);
}
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
/** Запуск HUD в главном мире. Всё, что не клонируется (объект HUD), наружу не возвращаем. */
const DJ_START = `(async () => {
  const h = window.__freakDJHost
  if (!h || !window.FreakDJ) return
  const bin = async (u) => {
    const b = await h.loadBinary(u)
    return b instanceof ArrayBuffer ? b : new Uint8Array(b).buffer
  }
  await window.FreakDJ.start({
    loadText: h.loadText,
    loadBinary: bin,
    libBase: h.libBase,
    hooks: window.FreakDJHooks,
    listSongs: h.listSongs,
    loadConverter: async () => { await h.loadConverter(); return window.FreakDJConvert },
  })
})()`;
function setupDj() {
    const init = electron_1.ipcRenderer.sendSync("fc:dj:init");
    if (!init)
        return;
    const source = (name) => electron_1.ipcRenderer.invoke("fc:dj:source", name);
    let converter = null;
    electron_1.contextBridge.exposeInMainWorld("__freakDJHost", Object.freeze({
        libBase: "freakdj://lib/",
        loadText: (url) => electron_1.ipcRenderer.invoke("fc:dj:text", String(url)),
        loadBinary: async (url) => toArrayBuffer(await electron_1.ipcRenderer.invoke("fc:dj:bytes", String(url))),
        listSongs: () => electron_1.ipcRenderer.invoke("fc:dj:songs"),
        // Конвертер GP: `var FreakDJConvert` становится глобальной переменной мира.
        loadConverter: () => (converter ||= source("converter").then(async (code) => {
            if (!code)
                throw new Error("конвертер недоступен");
            await electron_1.webFrame.executeJavaScript(`${code}\n;0`);
        })),
    }));
    // Перехват голоса — до кода игры, иначе отправитель микрофона уже создан и его не видно.
    void electron_1.webFrame.executeJavaScript(`${init.hook}\n;0`).catch((err) => console.error("[FreakRating DJ] hook", err));
    const boot = async () => {
        try {
            const hud = await source("hud");
            if (!hud)
                return;
            await electron_1.webFrame.executeJavaScript(`${hud}\n;0`);
            await electron_1.webFrame.executeJavaScript(DJ_START);
        }
        catch (err) {
            console.error("[FreakRating DJ] HUD", err);
            return;
        }
        try {
            const player = await source("player");
            if (!player)
                return;
            // Игра на игровой гитаре (ноты, ритм-игра). Как в userscript: ставим, если ещё не стоит.
            await electron_1.webFrame.executeJavaScript(`(async () => {
        if (window.guitarPlayer) return
        try {
          const __p = ${player}
          ;await __p
        } catch (e) { console.error('[FreakRating DJ] player', e) }
      })()`);
        }
        catch (err) {
            console.error("[FreakRating DJ] player", err);
        }
    };
    // HUD (131 КБ) и гитара — самые тяжёлые куски старта. Voice-hook уже стоит,
    // а остальное подключаем после того, как мир отрисовался. Если DJ нужен сразу —
    // window.__freakDJBoot() из консоли или по первому действию в DJ.
    let booted = false;
    const startBoot = () => { if (!booted) {
        booted = true;
        void boot();
    } };
    window.__freakDJBoot = startBoot;
    // Грузим HUD, только когда главный поток свободен: фиксированный таймер
    // создавал заметный лаг ровно в момент загрузки.
    const scheduleBoot = () => {
        const run = () => setTimeout(startBoot, 1500);
        const idle = window.requestIdleCallback;
        if (typeof idle === "function")
            idle(run, { timeout: 30000 });
        else
            setTimeout(run, 8000);
    };
    if (document.readyState === "loading")
        window.addEventListener("DOMContentLoaded", scheduleBoot, { once: true });
    else
        scheduleBoot();
}
/** Греем HTTP-кэш чанков карты, чтобы 3D-карта по M открывалась быстрее. */
function prefetchMap() {
    const run = () => {
        if (!location.pathname.startsWith('/world'))
            return;
        setTimeout(async () => {
            try {
                const html = await fetch(location.href, { cache: "force-cache" }).then((r) => r.text());
                const app = html.match(/assets\/app-[\w-]+\.js/)?.[0];
                if (!app)
                    return;
                const js = await fetch(new URL(app, location.origin).href, { cache: "force-cache" }).then((r) => r.text());
                const names = [...new Set(js.match(/assets\/[A-Za-z0-9_-]*(?:Map|map|Diorama|diorama)[A-Za-z0-9_-]*\.js/g) || [])];
                for (const n of names.slice(0, 60)) {
                    void fetch(new URL("/" + n, location.origin).href, { cache: "force-cache" }).catch(() => { });
                }
                console.info("[perf] prefetch карты:", names.length, "чанков");
            }
            catch (_) { /* карта и без этого загрузится */ }
        }, 20000);
    };
    if (document.readyState === "loading")
        window.addEventListener("DOMContentLoaded", run, { once: true });
    else
        run();
}
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
    setupDj();
    prefetchMap();
}
catch (err) {
    console.error("[FreakRating]", err);
}
