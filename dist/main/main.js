"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Точка входа: флаги графики, окно мира, падения, рация, Discord, IPC.
const electron_1 = require("electron");
const node_path_1 = require("node:path");
const config_1 = require("./config");
const gpu_1 = require("./gpu");
const settings_1 = require("./settings");
const navigation_1 = require("./navigation");
const diagnostics_1 = require("./diagnostics");
const profile_1 = require("./profile");
const ptt_1 = require("./ptt");
const discord_1 = require("./discord");
const tray_1 = require("./tray");
const visibility_1 = require("./visibility");
const escape_1 = require("./escape");
const screenShare_1 = require("./screenShare");
const screenAudio_1 = require("./screenAudio");
const dj_1 = require("./dj");
// ---------- до app.ready ----------
const cli = (0, config_1.parseCli)(process.argv, process.env);
const settings = (0, settings_1.loadSettings)();
const gpu = (0, gpu_1.applyGpuSwitches)(settings, cli.backend);
(0, diagnostics_1.startCrashReporter)();
if (!electron_1.app.requestSingleInstanceLock()) {
    electron_1.app.quit();
    process.exit(0);
}
// Twitch и прочие смотрят на User-Agent: «Electron/…» в нём выдаёт встроенный
// браузер. Оставляем обычный Chrome.
electron_1.app.userAgentFallback = electron_1.app.userAgentFallback.replace(/\s(Electron|freakrating-client|FreakRating)\/\S+/g, "");
const resumeUrl = process.argv.find((a) => a.startsWith("--resume-url="))?.slice("--resume-url=".length);
const policy = new navigation_1.NavigationPolicy(cli.url);
const startUrl = resumeUrl && policy.isAppUrl(resumeUrl) ? resumeUrl : cli.url;
const ptt = new ptt_1.PushToTalk();
const discord = new discord_1.DiscordPresence();
const screenAudio = new screenAudio_1.ScreenAudio();
const dj = new dj_1.DjHost();
let win = null;
/** Идёт «Записать замер» — второй не запускаем. */
let profiling = false;
/** Секунд до начала записи замера: вернуться в мир и играть. */
const PROFILE_LEAD_MS = 5000;
let settingsWin = null;
let quitting = false;
let lastAppUrl = startUrl;
// Падения: серия «подряд», сброс после спокойных минут.
let crashStreak = 0;
let lastCrashAt = 0;
let recovering = false;
let pendingRecovery = null;
let suggestedBackendThisSession = false;
let unresponsiveTimer = null;
const visibility = new visibility_1.WindowVisibility();
// ---------- окно мира ----------
function createWindow() {
    const saved = settings.window;
    const w = new electron_1.BrowserWindow({
        width: saved?.width ?? 1280,
        height: saved?.height ?? 800,
        x: saved?.x,
        y: saved?.y,
        minWidth: 800,
        minHeight: 500,
        backgroundColor: "#000000",
        title: "FreakRating",
        icon: (0, node_path_1.join)(__dirname, "../../assets/icon.png"),
        show: false,
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, "../preload/preload.js"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            webviewTag: false,
            spellcheck: false,
            backgroundThrottling: false,
            autoplayPolicy: "no-user-gesture-required",
        },
    });
    if (saved?.maximized)
        w.maximize();
    w.once("ready-to-show", () => w.show());
    guardContents(w.webContents);
    watchCrashes(w);
    watchVisibility(w);
    w.on("close", (e) => {
        saveWindowState(w);
        if (quitting)
            return;
        if (!(0, navigation_1.isWorldPath)(w.webContents.getURL()))
            return;
        const answer = electron_1.dialog.showMessageBoxSync(w, {
            type: "question",
            buttons: ["Выйти", "Остаться"],
            defaultId: 1,
            cancelId: 1,
            title: "FreakRating",
            message: "Выйти из мира?",
        });
        if (answer !== 0)
            e.preventDefault();
        else
            quitting = true;
    });
    w.on("closed", () => {
        win = null;
    });
    const wc = w.webContents;
    const escape = new escape_1.EscapeGesture({
        grantGesture: () => wc.executeJavaScript("0", true),
        resend: (type, modifiers) => {
            if (!wc.isDestroyed())
                wc.sendInputEvent({ type, keyCode: "Escape", modifiers });
        },
    });
    w.webContents.on("before-input-event", (event, input) => {
        // Esc — с активацией: страница вернёт захват мыши без клика (escape.ts).
        if (policy.isAppUrl(wc.getURL()) && escape.handle(input)) {
            event.preventDefault();
            return;
        }
        if (input.type !== "keyDown")
            return;
        // Ctrl+, — настройки клиента (меню нет, а трей есть не везде).
        if ((input.control || input.meta) && input.key === ",") {
            event.preventDefault();
            openSettingsWindow();
        }
        // F12 с Ctrl+Shift — инструменты разработчика (диагностика у игрока).
        if (input.control && input.shift && input.key === "F12") {
            event.preventDefault();
            w.webContents.toggleDevTools();
        }
    });
    void w.loadURL(startUrl);
    if (cli.devtools)
        w.webContents.openDevTools({ mode: "detach" });
    return w;
}
/** Свернули, спрятали в трей, вернули — странице `onWindowVisibility`. */
function watchVisibility(w) {
    const push = () => {
        if (w.isDestroyed())
            return;
        const hidden = visibility.update(w);
        if (hidden !== null)
            w.webContents.send("fc:windowVisibility", hidden);
    };
    w.on("minimize", push);
    w.on("restore", push);
    w.on("hide", push);
    w.on("show", push);
    // Перезагруженная страница начинает с «видно»: спрятанное окно ей напоминаем.
    w.webContents.on("did-finish-load", () => {
        if (visibility.current)
            w.webContents.send("fc:windowVisibility", true);
    });
}
function saveWindowState(w) {
    if (w.isDestroyed() || w.isMinimized() || w.isFullScreen())
        return;
    const maximized = w.isMaximized();
    const b = maximized ? (settings.window ?? w.getNormalBounds()) : w.getBounds();
    (0, settings_1.updateSettings)({ window: { x: b.x, y: b.y, width: b.width, height: b.height, maximized } });
}
/** Навигация только по allowlist; ссылки наружу — в системный браузер. */
function guardContents(wc) {
    const onNavigate = (e, url, isMainFrame = true) => {
        if (!isMainFrame)
            return;
        const verdict = policy.decide(url);
        if (verdict === "allow")
            return;
        e.preventDefault();
        if (verdict === "external")
            void electron_1.shell.openExternal(url);
    };
    wc.on("will-navigate", (e) => onNavigate(e, e.url, e.isMainFrame));
    wc.on("will-redirect", (e) => onNavigate(e, e.url, e.isMainFrame));
    wc.setWindowOpenHandler(({ url }) => {
        const u = (0, navigation_1.safeUrl)(url);
        if (u && (0, navigation_1.isExternalScheme)(u))
            void electron_1.shell.openExternal(url);
        return { action: "deny" };
    });
    wc.on("will-attach-webview", (e) => e.preventDefault());
    const remember = (url) => {
        if (policy.isAppUrl(url))
            lastAppUrl = url;
    };
    wc.on("did-navigate", (_e, url) => {
        remember(url);
        // Страница ушла или перезагрузилась — её показ кончился.
        screenAudio.stop();
    });
    wc.on("did-navigate-in-page", (_e, url, isMainFrame) => isMainFrame && remember(url));
    wc.on("did-finish-load", () => {
        if (pendingRecovery) {
            wc.send("fc:crashRecovered", pendingRecovery);
            pendingRecovery = null;
        }
    });
}
function setupPermissions() {
    const allowed = new Set([
        "media", // микрофон рации, веб-камера
        "pointerLock",
        "fullscreen",
        "keyboardLock",
        "clipboard-sanitized-write",
        "notifications",
        "speaker-selection",
    ]);
    const fromApp = (url) => !!url && policy.isAppUrl(url);
    electron_1.session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
        cb(allowed.has(permission) && fromApp(details.requestingUrl ?? wc.getURL()));
    });
    electron_1.session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => {
        return allowed.has(permission) && fromApp(origin);
    });
}
// ---------- падения ----------
function watchCrashes(w) {
    const wc = w.webContents;
    wc.on("render-process-gone", (_e, d) => {
        if (d.reason === "clean-exit")
            return;
        recover({ kind: "renderer", reason: d.reason, exitCode: d.exitCode });
    });
    wc.on("unresponsive", () => {
        if (unresponsiveTimer)
            return;
        unresponsiveTimer = setTimeout(() => {
            unresponsiveTimer = null;
            if (w.isDestroyed())
                return;
            recover({ kind: "unresponsive", reason: `не отвечает ${config_1.UNRESPONSIVE_RELOAD_MS / 1000} с` }, true);
        }, config_1.UNRESPONSIVE_RELOAD_MS);
    });
    wc.on("responsive", () => {
        if (unresponsiveTimer)
            clearTimeout(unresponsiveTimer);
        unresponsiveTimer = null;
    });
}
electron_1.app.on("child-process-gone", (_e, d) => {
    if (d.type !== "GPU" || d.reason === "clean-exit")
        return;
    recover({ kind: "gpu", reason: d.reason, exitCode: d.exitCode });
});
function recover(ev, killRenderer = false) {
    if (!win || win.isDestroyed())
        return;
    // GPU и страница часто падают парой — это одно падение.
    if (recovering)
        return;
    recovering = true;
    setTimeout(() => (recovering = false), 3_000);
    const now = Date.now();
    crashStreak = now - lastCrashAt > config_1.CRASH_STREAK_RESET_MS ? 1 : crashStreak + 1;
    lastCrashAt = now;
    const crash = (0, diagnostics_1.recordCrash)({ ...ev, url: lastAppUrl });
    pendingRecovery = { ...crash, streak: crashStreak };
    const wc = win.webContents;
    if (killRenderer)
        wc.forcefullyCrashRenderer();
    // Сразу после падения GPU-процесс ещё поднимается — чуть подождём.
    setTimeout(() => {
        if (!win || win.isDestroyed())
            return;
        void win.webContents.loadURL(lastAppUrl);
        if (crashStreak >= config_1.CRASH_STREAK_TO_SUGGEST)
            void suggestOtherBackend();
    }, 1_000);
}
async function suggestOtherBackend() {
    const next = (0, settings_1.nextBackend)(gpu.backend);
    if (suggestedBackendThisSession || !win || !next)
        return;
    suggestedBackendThisSession = true;
    const { response } = await electron_1.dialog.showMessageBox(win, {
        type: "warning",
        buttons: [`Переключить на ${settings_1.BACKEND_LABELS[next]} и перезапустить`, "Оставить как есть"],
        defaultId: 0,
        cancelId: 1,
        title: "FreakRating",
        message: `Мир падает уже ${crashStreak} раза подряд`,
        detail: `Сейчас графика: ${settings_1.BACKEND_LABELS[gpu.backend]}. Часто помогает другой графический режим. ` +
            "Сменить его можно и потом: Ctrl+, или значок в трее → Настройки.",
    });
    if (response === 0) {
        applySettings({ graphicsBackend: next });
        relaunch();
    }
}
// ---------- настройки ----------
function publicSettings() {
    const s = (0, settings_1.loadSettings)();
    return {
        graphicsBackend: s.graphicsBackend,
        /** Бэкенд, с которым клиент реально запущен (флаг запуска мог переопределить). */
        activeGraphicsBackend: gpu.backend,
        availableBackends: (0, settings_1.availableBackends)().map((id) => ({ id, label: settings_1.BACKEND_LABELS[id] })),
        restartRequired: s.graphicsBackend !== gpu.backend,
        preferDiscreteGpu: s.preferDiscreteGpu,
        dj: s.dj,
        ptt: ptt.status(),
        discord: { enabled: discord.enabled, connected: discord.status().connected },
    };
}
function applySettings(patch) {
    const before = (0, settings_1.loadSettings)();
    const s = (0, settings_1.updateSettings)(patch);
    if ("ptt" in patch)
        ptt.setBinding(s.ptt);
    if (patch.preferDiscreteGpu !== undefined && patch.preferDiscreteGpu !== before.preferDiscreteGpu) {
        (0, gpu_1.preferDiscreteGpuOnWindows)(s.preferDiscreteGpu);
    }
    const pub = publicSettings();
    for (const w of [win, settingsWin]) {
        if (w && !w.isDestroyed())
            w.webContents.send("fc:settingsChanged", pub);
    }
    tray?.refresh();
}
function relaunch() {
    const args = process.argv
        .slice(1)
        .filter((a) => !a.startsWith("--resume-url=") && !a.startsWith("--graphics-backend="));
    args.push(`--resume-url=${lastAppUrl}`);
    quitting = true;
    electron_1.app.relaunch({ args });
    electron_1.app.quit();
}
function openSettingsWindow() {
    if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.focus();
        return;
    }
    settingsWin = new electron_1.BrowserWindow({
        width: 520,
        height: 640,
        resizable: true,
        minimizable: false,
        title: "Настройки клиента FreakRating",
        backgroundColor: "#1a0a1f",
        parent: win ?? undefined,
        icon: (0, node_path_1.join)(__dirname, "../../assets/icon.png"),
        webPreferences: {
            preload: (0, node_path_1.join)(__dirname, "../preload/settings-preload.js"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            spellcheck: false,
        },
    });
    settingsWin.setMenu(null);
    settingsWin.webContents.on("will-navigate", (e) => e.preventDefault());
    settingsWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    settingsWin.on("closed", () => (settingsWin = null));
    void settingsWin.loadFile((0, node_path_1.join)(__dirname, "../settings/settings.html"));
}
// ---------- IPC ----------
function fromWorld(e) {
    return !!win && e.sender === win.webContents && !!e.senderFrame && policy.isAppUrl(e.senderFrame.url);
}
function fromSettings(e) {
    return !!settingsWin && e.sender === settingsWin.webContents;
}
function fromEither(e) {
    return fromWorld(e) || fromSettings(e);
}
async function diagnostics() {
    return (0, diagnostics_1.collectDiagnostics)({
        graphics: { ...publicSettings(), switches: gpu.switches },
        crashStreak,
        discord: discord.status(),
        url: lastAppUrl,
    });
}
function setupIpc() {
    electron_1.ipcMain.on("fc:info", (e) => {
        e.returnValue = { clientVersion: electron_1.app.getVersion(), platform: process.platform, screenAudio: (0, screenShare_1.screenAudioKind)(process.platform) };
    });
    electron_1.ipcMain.on("fc:setPresence", (e, presence) => {
        if (fromWorld(e))
            discord.set(presence);
    });
    electron_1.ipcMain.handle("fc:getDiagnostics", (e) => (fromEither(e) ? diagnostics() : null));
    electron_1.ipcMain.handle("fc:getSettings", (e) => (fromEither(e) ? publicSettings() : null));
    electron_1.ipcMain.handle("fc:setGraphicsBackend", (e, backend) => {
        if (!fromEither(e) || !(0, settings_1.isBackend)(backend))
            return null;
        applySettings({ graphicsBackend: backend });
        return publicSettings();
    });
    electron_1.ipcMain.handle("fc:relaunch", (e) => {
        if (fromEither(e))
            relaunch();
    });
    electron_1.ipcMain.handle("fc:openSettings", (e) => {
        if (fromWorld(e))
            openSettingsWindow();
    });
    electron_1.ipcMain.handle("fc:startScreenAudio", (e) => (fromWorld(e) ? screenAudio.start() : null));
    electron_1.ipcMain.handle("fc:stopScreenAudio", (e) => {
        if (fromWorld(e))
            screenAudio.stop();
    });
    // Доверенная клавиша от модов (синтетические KeyboardEvent игра игнорирует).
    // CDP Input даёт браузерное событие с isTrusted=true — надёжнее sendInputEvent.
    electron_1.ipcMain.handle("fc:press-key", async (e, keyCode) => {
        if (!fromWorld(e) || typeof keyCode !== "string" || keyCode.length > 16)
            return false;
        const keys = {
            m: { code: "KeyM", key: "m", vk: 77 },
            M: { code: "KeyM", key: "m", vk: 77 },
            Tab: { code: "Tab", key: "Tab", vk: 9 },
            i: { code: "KeyI", key: "i", vk: 73 },
        };
        const d = keys[keyCode] ?? { code: keyCode, key: keyCode, vk: keyCode.toUpperCase().charCodeAt(0) };
        try {
            const dbg = win?.webContents.debugger;
            if (dbg) {
                try {
                    if (!dbg.isAttached())
                        dbg.attach("1.3");
                }
                catch { /* уже подключён */ }
                const base = { modifiers: 0, code: d.code, key: d.key, windowsVirtualKeyCode: d.vk, nativeVirtualKeyCode: d.vk };
                await dbg.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", ...base });
                await dbg.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", ...base });
                return true;
            }
        }
        catch (err) {
            console.warn("[keys] CDP", keyCode, err);
        }
        try {
            win?.webContents.sendInputEvent({ type: "keyDown", keyCode });
            win?.webContents.sendInputEvent({ type: "keyUp", keyCode });
            return true;
        }
        catch (err) {
            console.warn("[keys] press", keyCode, err);
            return false;
        }
    });
    // Встроенный DJ: только окно мира, только страница /world, только если не выключен в настройках.
    const djAllowed = (e) => (0, settings_1.loadSettings)().dj && fromWorld(e) && !!e.senderFrame && (0, navigation_1.isWorldPath)(e.senderFrame.url);
    electron_1.ipcMain.on("fc:dj:init", (e) => {
        try {
            e.returnValue = djAllowed(e) ? { hook: dj.source("hook") } : null;
        }
        catch (err) {
            console.error("[dj] init", err);
            e.returnValue = null;
        }
    });
    electron_1.ipcMain.handle("fc:dj:source", (e, name) => {
        if (!djAllowed(e) || (name !== "hud" && name !== "player" && name !== "converter"))
            return null;
        return dj.source(name);
    });
    electron_1.ipcMain.handle("fc:dj:songs", (e) => (djAllowed(e) ? dj.songs() : []));
    electron_1.ipcMain.handle("fc:dj:text", (e, url) => {
        if (!djAllowed(e))
            throw new Error("DJ недоступен");
        return dj.text(url);
    });
    electron_1.ipcMain.handle("fc:dj:bytes", (e, url) => {
        if (!djAllowed(e))
            throw new Error("DJ недоступен");
        return dj.bytes(url);
    });
    electron_1.ipcMain.handle("fc:setDj", (e, on) => {
        if (!fromSettings(e) || typeof on !== "boolean")
            return null;
        applySettings({ dj: on });
        return publicSettings();
    });
    // Только окно настроек.
    electron_1.ipcMain.handle("fc:setPreferDiscreteGpu", (e, on) => {
        if (!fromSettings(e) || typeof on !== "boolean")
            return null;
        applySettings({ preferDiscreteGpu: on });
        return publicSettings();
    });
    electron_1.ipcMain.handle("fc:capturePtt", async (e) => {
        if (!fromSettings(e))
            return null;
        const binding = await ptt.captureNext();
        if (binding)
            applySettings({ ptt: binding });
        return publicSettings();
    });
    electron_1.ipcMain.handle("fc:clearPtt", (e) => {
        if (!fromSettings(e))
            return null;
        applySettings({ ptt: null });
        return publicSettings();
    });
    electron_1.ipcMain.handle("fc:copyDiagnostics", async (e) => {
        if (!fromSettings(e))
            return false;
        electron_1.clipboard.writeText(JSON.stringify(await diagnostics(), null, 2));
        return true;
    });
    // «Записать замер»: окно мира — вперёд, 5 с вернуться в игру, потом след и счётчики.
    electron_1.ipcMain.handle("fc:recordProfile", async (e) => {
        if (!fromSettings(e) || profiling)
            return null;
        profiling = true;
        try {
            if (win && !win.isDestroyed())
                win.focus();
            await new Promise((r) => setTimeout(r, PROFILE_LEAD_MS));
            const dir = await (0, profile_1.recordProfile)(diagnostics);
            electron_1.shell.showItemInFolder((0, node_path_1.join)(dir, "system.json"));
            return dir;
        }
        catch (error) {
            return { error: error.message };
        }
        finally {
            profiling = false;
        }
    });
    electron_1.ipcMain.handle("fc:openDumps", (e) => {
        if (fromSettings(e))
            void electron_1.shell.openPath(electron_1.app.getPath("crashDumps"));
    });
}
// ---------- старт ----------
let tray = null;
electron_1.app.on("second-instance", () => {
    if (!win)
        return;
    if (win.isMinimized())
        win.restore();
    win.show();
    win.focus();
});
electron_1.app.on("before-quit", () => {
    quitting = true;
});
electron_1.app.on("window-all-closed", () => {
    electron_1.app.quit();
});
electron_1.app.on("will-quit", () => {
    ptt.stop();
    discord.stop();
    screenAudio.stop();
});
void electron_1.app.whenReady().then(() => {
    // Меню нет: вместе с ним уходят Ctrl+R/F5 (перезагрузка), Ctrl+W (закрыть),
    // Ctrl+Shift+I и зум — их Electron вешает только на меню по умолчанию.
    electron_1.Menu.setApplicationMenu(null);
    setupPermissions();
    (0, screenShare_1.setupScreenShare)({ isAppOrigin: (origin) => policy.isAppUrl(origin), parent: () => win });
    setupIpc();
    if (settings.preferDiscreteGpu)
        (0, gpu_1.preferDiscreteGpuOnWindows)(true);
    win = createWindow();
    // Рация и Discord не нужны в момент загрузки worlds — не отбираем ресурсы
    // у первого рендера. Стартуем после того, как страница мира загрузилась.
    win.webContents.once("did-finish-load", () => {
        const t0 = Date.now();
        ptt.start(settings.ptt);
        ptt.on("down", () => win?.webContents.send("fc:ptt", "down"));
        ptt.on("up", () => win?.webContents.send("fc:ptt", "up"));
        discord.start();
        console.info("[perf] ptt+discord подключены за", Date.now() - t0, "мс");
    });
    tray = (0, tray_1.createTray)({
        show: () => {
            win?.show();
            win?.focus();
        },
        reload: () => void win?.webContents.loadURL(lastAppUrl),
        openSettings: openSettingsWindow,
        toggleDevTools: () => win?.webContents.toggleDevTools(),
        openDumps: () => void electron_1.shell.openPath(electron_1.app.getPath("crashDumps")),
        quit: () => {
            quitting = true;
            electron_1.app.quit();
        },
    });
});
