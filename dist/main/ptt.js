"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushToTalk = void 0;
exports.isWayland = isWayland;
// Рация глобальной клавишей: нажатие и отпускание, даже когда окно не в фокусе.
//
// Electron `globalShortcut` сообщает только нажатие — для «держи и говори» мало.
// Поэтому:
//  - Windows и Linux/X11 — uiohook-napi (системный хук клавиатуры и мыши,
//    готовые N-API-сборки, пересобирать под Electron не нужно);
//  - Linux/Wayland — хуки не работают (Wayland не отдаёт чужие нажатия), там
//    рацию в фоне шлёт сам композитор: бинды Hyprland/Sway пишут `down`/`up`
//    в именованный канал `$XDG_RUNTIME_DIR/freakrating-ptt` (README, «Linux»).
//    Канал открыт на всех Linux, не только на Wayland.
const node_events_1 = require("node:events");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_net_1 = require("node:net");
function isWayland(env = process.env) {
    return process.platform === "linux" && (env.XDG_SESSION_TYPE === "wayland" || !!env.WAYLAND_DISPLAY);
}
class PushToTalk extends node_events_1.EventEmitter {
    hook = null;
    hookStarted = false;
    binding = null;
    pressed = false;
    error = null;
    fifoPath = null;
    fifoSocket = null;
    capture = null;
    start(binding) {
        this.binding = binding;
        if (!isWayland())
            this.startHook();
        if (process.platform === "linux")
            this.startFifo();
    }
    setBinding(binding) {
        if (this.pressed)
            this.set(false);
        this.binding = binding;
    }
    status() {
        const mechanisms = [];
        if (this.hookStarted)
            mechanisms.push("uiohook");
        if (this.fifoSocket)
            mechanisms.push("fifo");
        return {
            available: mechanisms.length > 0,
            mechanisms,
            binding: this.binding,
            fifoPath: this.fifoPath,
            error: this.error,
        };
    }
    /** Ждёт следующую клавишу или боковую кнопку мыши — для «Назначить». Esc — отмена. */
    captureNext(timeoutMs = 10_000) {
        if (!this.hookStarted)
            return Promise.resolve(null);
        this.capture?.(null);
        return new Promise((resolve) => {
            const timer = setTimeout(() => done(null), timeoutMs);
            const done = (b) => {
                clearTimeout(timer);
                this.capture = null;
                resolve(b);
            };
            this.capture = done;
        });
    }
    stop() {
        if (this.hookStarted) {
            try {
                this.hook?.uIOhook.stop();
            }
            catch { }
            this.hookStarted = false;
        }
        this.fifoSocket?.destroy();
        this.fifoSocket = null;
        if (this.fifoPath) {
            try {
                (0, node_fs_1.unlinkSync)(this.fifoPath);
            }
            catch { }
        }
    }
    set(down) {
        if (down === this.pressed)
            return; // автоповтор клавиши
        this.pressed = down;
        this.emit(down ? "down" : "up");
    }
    startHook() {
        try {
            // Нативный модуль: грузим лениво, чтобы его поломка не роняла клиент.
            this.hook = require("uiohook-napi");
        }
        catch (e) {
            this.error = `uiohook-napi не загрузился: ${e.message}`;
            return;
        }
        const { uIOhook, UiohookKey } = this.hook;
        const keyNames = new Map();
        for (const [name, code] of Object.entries(UiohookKey))
            keyNames.set(code, name);
        uIOhook.on("keydown", (e) => {
            if (this.capture) {
                if (e.keycode === UiohookKey.Escape)
                    return this.capture(null);
                return this.capture({ type: "key", keycode: e.keycode, label: keyNames.get(e.keycode) ?? `Key ${e.keycode}` });
            }
            if (this.binding?.type === "key" && this.binding.keycode === e.keycode)
                this.set(true);
        });
        uIOhook.on("keyup", (e) => {
            if (this.binding?.type === "key" && this.binding.keycode === e.keycode)
                this.set(false);
        });
        uIOhook.on("mousedown", (e) => {
            const button = Number(e.button);
            // 1 и 2 — левая и правая: ими играют, на рацию не назначаем.
            if (this.capture && button >= 3)
                return this.capture({ type: "mouse", button, label: mouseLabel(button) });
            if (this.binding?.type === "mouse" && this.binding.button === button)
                this.set(true);
        });
        uIOhook.on("mouseup", (e) => {
            if (this.binding?.type === "mouse" && this.binding.button === Number(e.button))
                this.set(false);
        });
        try {
            uIOhook.start();
            this.hookStarted = true;
        }
        catch (e) {
            this.error = `uiohook не запустился: ${e.message}`;
        }
    }
    startFifo() {
        const dir = process.env.XDG_RUNTIME_DIR;
        if (!dir)
            return;
        const path = (0, node_path_1.join)(dir, "freakrating-ptt");
        try {
            try {
                if (!(0, node_fs_1.statSync)(path).isFIFO())
                    (0, node_fs_1.unlinkSync)(path);
            }
            catch { }
            try {
                (0, node_child_process_1.execFileSync)("mkfifo", ["-m", "600", path]);
            }
            catch {
                // уже есть (прошлый запуск упал) — переиспользуем
            }
            // O_RDWR: канал не закрывается, когда отключился очередной писатель;
            // net.Socket читает его без блокировки пула потоков.
            const fd = (0, node_fs_1.openSync)(path, node_fs_1.constants.O_RDWR | node_fs_1.constants.O_NONBLOCK);
            const sock = new node_net_1.Socket({ fd, readable: true, writable: false });
            let buf = "";
            sock.on("data", (chunk) => {
                buf += chunk.toString("utf8");
                let nl;
                while ((nl = buf.indexOf("\n")) >= 0) {
                    const cmd = buf.slice(0, nl).trim();
                    buf = buf.slice(nl + 1);
                    if (cmd === "down")
                        this.set(true);
                    else if (cmd === "up")
                        this.set(false);
                }
                if (buf.length > 256)
                    buf = "";
            });
            sock.on("error", (e) => {
                this.error = `канал рации: ${e.message}`;
            });
            this.fifoSocket = sock;
            this.fifoPath = path;
        }
        catch (e) {
            this.error = `канал рации не открылся: ${e.message}`;
        }
    }
}
exports.PushToTalk = PushToTalk;
function mouseLabel(button) {
    if (button === 3)
        return "Колёсико (кнопка мыши 3)";
    if (button === 4)
        return "Боковая кнопка мыши 4";
    if (button === 5)
        return "Боковая кнопка мыши 5";
    return `Кнопка мыши ${button}`;
}
