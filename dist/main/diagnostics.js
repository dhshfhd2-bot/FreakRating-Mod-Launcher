"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordCrash = recordCrash;
exports.crashHistory = crashHistory;
exports.startCrashReporter = startCrashReporter;
exports.collectDiagnostics = collectDiagnostics;
// Диагностика для «У меня лагает»: процессы, полный GPU-info, падения, дампы.
const electron_1 = require("electron");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_os_1 = __importDefault(require("node:os"));
const crashes = [];
function recordCrash(e) {
    const ev = { at: new Date().toISOString(), ...e };
    crashes.push(ev);
    if (crashes.length > 50)
        crashes.shift();
    return ev;
}
function crashHistory() {
    return crashes.slice();
}
/** Дампы пишутся локально, никуда не отправляются. Вызывать до `app.ready`. */
function startCrashReporter() {
    electron_1.crashReporter.start({ uploadToServer: false, compress: true });
}
function dumpFiles() {
    const out = [];
    const walk = (dir, depth) => {
        let names;
        try {
            names = (0, node_fs_1.readdirSync)(dir);
        }
        catch {
            return;
        }
        for (const name of names) {
            const p = (0, node_path_1.join)(dir, name);
            try {
                const st = (0, node_fs_1.statSync)(p);
                if (st.isDirectory() && depth < 2)
                    walk(p, depth + 1);
                else if (name.endsWith(".dmp"))
                    out.push({ name, bytes: st.size, at: st.mtime.toISOString() });
            }
            catch { }
        }
    };
    walk(electron_1.app.getPath("crashDumps"), 0);
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
}
async function collectDiagnostics(extra) {
    let gpuInfo = null;
    try {
        gpuInfo = await electron_1.app.getGPUInfo("complete");
    }
    catch (e) {
        gpuInfo = { error: e.message };
    }
    return {
        collectedAt: new Date().toISOString(),
        client: {
            version: electron_1.app.getVersion(),
            packaged: electron_1.app.isPackaged,
            uptimeSec: Math.round(process.uptime()),
        },
        versions: {
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node,
            v8: process.versions.v8,
        },
        os: {
            platform: process.platform,
            arch: process.arch,
            release: node_os_1.default.release(),
            version: typeof node_os_1.default.version === "function" ? node_os_1.default.version() : undefined,
            cpu: node_os_1.default.cpus()[0]?.model,
            cpuCount: node_os_1.default.cpus().length,
            totalMemMb: Math.round(node_os_1.default.totalmem() / 2 ** 20),
            freeMemMb: Math.round(node_os_1.default.freemem() / 2 ** 20),
            session: process.env.XDG_SESSION_TYPE,
        },
        gpuFeatureStatus: electron_1.app.getGPUFeatureStatus(),
        gpuInfo,
        // CPU в процентах за интервал между вызовами, память в КБ — как отдаёт Electron.
        appMetrics: electron_1.app.getAppMetrics(),
        crashes: crashHistory(),
        crashDumps: { dir: electron_1.app.getPath("crashDumps"), files: dumpFiles() },
        ...extra,
    };
}
