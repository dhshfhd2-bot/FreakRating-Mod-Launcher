"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyGpuSwitches = applyGpuSwitches;
exports.preferDiscreteGpuOnWindows = preferDiscreteGpuOnWindows;
// Флаги Chromium для графики и звука. Применяются только до `app.ready`,
// поэтому смена бэкенда = перезапуск клиента.
const electron_1 = require("electron");
const node_child_process_1 = require("node:child_process");
const settings_1 = require("./settings");
function applyGpuSwitches(settings, cliBackend) {
    const cl = electron_1.app.commandLine;
    const switches = [];
    const add = (name, value) => {
        if (value === undefined)
            cl.appendSwitch(name);
        else
            cl.appendSwitch(name, value);
        switches.push(value === undefined ? `--${name}` : `--${name}=${value}`);
    };
    // Чёрный список GPU Chromium выключает WebGL/ускорение на старых драйверах —
    // в мире это и есть «чёрный экран».
    add("ignore-gpu-blocklist");
    // Звук мира и голоса без клика по странице.
    add("autoplay-policy", "no-user-gesture-required");
    // Свёрнутое/закрытое другим окном окно не душим: голос и тик мира живут в фоне.
    add("disable-renderer-backgrounding");
    add("disable-background-timer-throttling");
    add("disable-backgrounding-occluded-windows");
    if (settings.preferDiscreteGpu) {
        // Ноутбуки с двумя видеокартами: просим мощную (ANGLE/D3D11 выбирает адаптер
        // по этому флагу). Плюс запись в реестр Windows — см. preferDiscreteGpuOnWindows.
    }
    const backend = (0, settings_1.isBackend)(cliBackend) ? cliBackend : settings.graphicsBackend;
    if (backend !== "auto")
        add("use-angle", backend);
    if (process.platform === "linux") {
        // Wayland, если он есть (Hyprland и т. п.), иначе X11.
        add("ozone-platform-hint", "auto");
    }
    return { backend, switches };
}
const GPU_PREF_KEY = "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences";
/**
 * Windows 10/11 «Настройки графики → Высокая производительность» для этого exe:
 * то же, что игрок сделал бы руками в «Параметры → Дисплей → Графика».
 * Действует на процессы, запущенные после записи, — GPU-процесс Chromium
 * стартует позже main и обычно подхватывает уже с первого запуска.
 */
function preferDiscreteGpuOnWindows(enabled) {
    if (process.platform !== "win32")
        return;
    const exe = process.execPath;
    const args = enabled
        ? ["add", GPU_PREF_KEY, "/v", exe, "/t", "REG_SZ", "/d", "GpuPreference=2;", "/f"]
        : ["delete", GPU_PREF_KEY, "/v", exe, "/f"];
    (0, node_child_process_1.execFile)("reg", args, { windowsHide: true }, () => {
    });
}
