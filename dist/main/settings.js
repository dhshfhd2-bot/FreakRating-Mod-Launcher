"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKEND_LABELS = exports.DEFAULT_PTT = void 0;
exports.availableBackends = availableBackends;
exports.isBackend = isBackend;
exports.nextBackend = nextBackend;
exports.sanitize = sanitize;
exports.loadSettings = loadSettings;
exports.updateSettings = updateSettings;
// Настройки клиента: JSON в userData, без сторонних библиотек.
const electron_1 = require("electron");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/** F8: не печатается, в мире не занята, есть на любой клавиатуре. */
exports.DEFAULT_PTT = { type: "key", keycode: 66, label: "F8" };
exports.BACKEND_LABELS = {
    auto: "Авто",
    d3d11: "Direct3D 11",
    vulkan: "Vulkan",
    gl: "OpenGL",
};
/** Бэкенды ANGLE, которые есть смысл предлагать на этой ОС. */
function availableBackends(platform = process.platform, env = process.env) {
    if (platform === "win32")
        return ["auto", "d3d11", "vulkan", "gl"];
    // На Wayland Chromium с Vulkan не работает («not compatible with Vulkan»).
    if (platform === "linux" && (env.XDG_SESSION_TYPE === "wayland" || env.WAYLAND_DISPLAY))
        return ["auto", "gl"];
    return ["auto", "gl", "vulkan"];
}
function isBackend(value, platform = process.platform) {
    return typeof value === "string" && availableBackends(platform, {}).includes(value);
}
/** Следующий бэкенд по кругу — его предлагаем после падений подряд. */
/** null — предложить нечего (на Wayland есть только OpenGL). */
function nextBackend(current, platform = process.platform, env = process.env) {
    // «Авто» — это D3D11 на Windows и OpenGL на Linux: после него — следующий за ним.
    const order = availableBackends(platform, env).filter((b) => b !== "auto");
    if (order.length < 2)
        return null;
    const effective = current === "auto" ? order[0] : current;
    return order[(order.indexOf(effective) + 1) % order.length];
}
const DEFAULTS = {
    graphicsBackend: "auto",
    preferDiscreteGpu: true,
    ptt: exports.DEFAULT_PTT,
    dj: true,
};
function file() {
    return (0, node_path_1.join)(electron_1.app.getPath("userData"), "settings.json");
}
function sanitize(raw) {
    const s = { ...DEFAULTS };
    if (!raw || typeof raw !== "object")
        return s;
    const r = raw;
    if (isBackend(r.graphicsBackend))
        s.graphicsBackend = r.graphicsBackend;
    if (typeof r.preferDiscreteGpu === "boolean")
        s.preferDiscreteGpu = r.preferDiscreteGpu;
    if (typeof r.dj === "boolean")
        s.dj = r.dj;
    if (r.ptt === null)
        s.ptt = null;
    else if (isBinding(r.ptt))
        s.ptt = r.ptt;
    if (r.window && typeof r.window === "object")
        s.window = r.window;
    return s;
}
function isBinding(v) {
    if (!v || typeof v !== "object")
        return false;
    const b = v;
    if (typeof b.label !== "string")
        return false;
    if (b.type === "key")
        return Number.isInteger(b.keycode);
    if (b.type === "mouse")
        return Number.isInteger(b.button) && b.button >= 3;
    return false;
}
let current = null;
function loadSettings() {
    if (current)
        return current;
    try {
        current = sanitize(JSON.parse((0, node_fs_1.readFileSync)(file(), "utf8")));
    }
    catch {
        current = { ...DEFAULTS };
    }
    return current;
}
function updateSettings(patch) {
    current = sanitize({ ...loadSettings(), ...patch });
    const path = file();
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    (0, node_fs_1.writeFileSync)(path + ".tmp", JSON.stringify(current, null, 2));
    (0, node_fs_1.renameSync)(path + ".tmp", path);
    return current;
}
