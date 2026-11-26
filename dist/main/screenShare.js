"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourceMode = sourceMode;
exports.screenAudioKind = screenAudioKind;
exports.screenName = screenName;
exports.toPickerSources = toPickerSources;
exports.setupScreenShare = setupScreenShare;
// Показ экрана (getDisplayMedia страницы мира): какой экран или окно, и звук.
//
// Electron сам getDisplayMedia не обслуживает — без обработчика он всегда
// отклоняет. Источник:
//  - Linux/Wayland — системное окно выбора (xdg-desktop-portal): getSources
//    вызывает его сам и отдаёт один выбранный источник;
//  - Windows, Linux/X11 — своё окно выбора (src/picker) с превью экранов и окон.
// Звук:
//  - Windows — звук системы без звука самого клиента (loopbackWithoutChrome,
//    исключение процесса в WASAPI): иначе в показ попадут голоса мира, эхо;
//  - Linux — Chromium звук системы без себя не умеет, страница берёт
//    виртуальный микрофон venmic (screenAudio.ts) через startScreenAudio;
//  - macOS — без звука.
const electron_1 = require("electron");
const node_path_1 = require("node:path");
/** Как выбрать источник: системным окном портала или своим. */
function sourceMode(platform, env) {
    const wayland = env.XDG_SESSION_TYPE === "wayland" || !!env.WAYLAND_DISPLAY;
    return platform === "linux" && wayland ? "portal" : "picker";
}
function screenAudioKind(platform) {
    if (platform === "win32")
        return "loopback";
    if (platform === "linux")
        return "virtual-mic";
    return "none";
}
/** Звук системы без звука своего процесса — id устройства Chromium. В типах Electron его нет. */
const LOOPBACK_WITHOUT_SELF = "loopbackWithoutChrome";
/** Подпись экрана: Chromium зовёт их по-английски («Entire screen», «Screen 1»). */
function screenName(index, count) {
    return count > 1 ? `Экран ${index + 1}` : "Весь экран";
}
function toPickerSources(sources, hide) {
    const screens = sources.filter((s) => s.id.startsWith("screen:"));
    return sources
        .filter((s) => !hide.has(s.id) && !s.thumbnail.isEmpty())
        .map((s) => ({
        id: s.id,
        name: screens.includes(s) ? screenName(screens.indexOf(s), screens.length) : s.name,
        kind: s.id.startsWith("screen:") ? "screen" : "window",
        thumbnail: s.thumbnail.toDataURL(),
        icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
    }));
}
function setupScreenShare(opts) {
    const mode = sourceMode(process.platform, process.env);
    const audioKind = screenAudioKind(process.platform);
    let picking = false;
    electron_1.session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        if (!request.videoRequested || !opts.isAppOrigin(request.securityOrigin) || picking)
            return callback(null);
        picking = true;
        const choose = mode === "portal" ? fromPortal() : fromPicker(opts.parent());
        choose
            .then((source) => {
            if (!source)
                return callback(null);
            const streams = { video: source };
            if (request.audioRequested && audioKind === "loopback")
                streams.audio = LOOPBACK_WITHOUT_SELF;
            callback(streams);
        })
            .catch((err) => {
            console.error("[screenShare]", err);
            callback(null);
        })
            .finally(() => (picking = false));
    }, 
    // macOS 15+: системное окно выбора вместо нашего.
    { useSystemPicker: true });
}
async function fromPortal() {
    const [source] = await electron_1.desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 0, height: 0 } });
    return source ?? null;
}
async function fromPicker(parent) {
    const thumbs = { thumbnailSize: { width: 384, height: 216 }, fetchWindowIcons: true };
    let sources = await electron_1.desktopCapturer.getSources({ types: ["screen", "window"], ...thumbs });
    // X11: перечисление окон иногда падает, и Electron отдаёт пустой список целиком — тогда хотя бы экраны.
    if (sources.length === 0)
        sources = await electron_1.desktopCapturer.getSources({ types: ["screen"], ...thumbs });
    if (sources.length === 0)
        return null;
    const hide = new Set();
    if (parent && !parent.isDestroyed())
        hide.add(parent.getMediaSourceId());
    const cards = toPickerSources(sources, hide);
    const id = await showPicker(parent, cards);
    return sources.find((s) => s.id === id) ?? null;
}
function showPicker(parent, cards) {
    return new Promise((resolve) => {
        const w = new electron_1.BrowserWindow({
            width: 860,
            height: 600,
            minWidth: 480,
            minHeight: 360,
            title: "Что показать",
            backgroundColor: "#1a0a1f",
            parent: parent && !parent.isDestroyed() ? parent : undefined,
            modal: !!parent && process.platform !== "linux",
            minimizable: false,
            icon: (0, node_path_1.join)(__dirname, "../../assets/icon.png"),
            webPreferences: {
                preload: (0, node_path_1.join)(__dirname, "../preload/picker-preload.js"),
                contextIsolation: true,
                sandbox: true,
                nodeIntegration: false,
                spellcheck: false,
            },
        });
        w.setMenu(null);
        w.webContents.on("will-navigate", (e) => e.preventDefault());
        w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        let done = false;
        const finish = (id) => {
            if (done)
                return;
            done = true;
            electron_1.ipcMain.removeHandler("fc:picker:sources");
            electron_1.ipcMain.removeAllListeners("fc:picker:choose");
            resolve(id);
            if (!w.isDestroyed())
                w.close();
        };
        electron_1.ipcMain.handle("fc:picker:sources", (e) => (e.sender === w.webContents ? cards : null));
        electron_1.ipcMain.on("fc:picker:choose", (e, id) => {
            if (e.sender !== w.webContents)
                return;
            finish(typeof id === "string" && cards.some((c) => c.id === id) ? id : null);
        });
        w.on("closed", () => finish(null));
        void w.loadFile((0, node_path_1.join)(__dirname, "../picker/picker.html"));
    });
}
