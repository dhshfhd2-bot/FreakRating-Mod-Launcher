"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DjHost = void 0;
// Встроенный DJ (проигрыватель, гитара, ритм-игра): код и библиотека лежат в dj/ внутри клиента,
// без Tampermonkey и GitHub. Главный процесс отдаёт странице исходники и ходит в сеть за семплами
// (у страницы мира CORS закрыт — раньше это делал GM_xmlhttpRequest).
const electron_1 = require("electron");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const dj_paths_1 = require("./dj-paths");
const FILES = {
    hook: "voice-hook.js",
    hud: "dj-hud.js",
    player: "guitar-player.js",
    converter: "gp-converter.js",
};
class DjHost {
    root;
    sources = new Map();
    constructor() {
        this.root = electron_1.app.isPackaged ? (0, node_path_1.join)(process.resourcesPath, "dj") : (0, node_path_1.join)(__dirname, "../../dj");
    }
    /** Исходник скрипта DJ. Небольшие файлы, читаем синхронно и запоминаем. */
    source(name) {
        let text = this.sources.get(name);
        if (text === undefined) {
            text = (0, node_fs_1.readFileSync)((0, node_path_1.join)(this.root, FILES[name]), "utf8");
            this.sources.set(name, text);
        }
        return text;
    }
    async songs() {
        const names = await (0, promises_1.readdir)((0, node_path_1.join)(this.root, "lib"));
        return names.filter(dj_paths_1.isSongFile).map((file) => ({ file, url: `${dj_paths_1.LIB_SCHEME}${file}` }));
    }
    async text(url) {
        return (await this.bytes(url)).toString("utf8");
    }
    async bytes(url) {
        const local = (0, dj_paths_1.libPath)(url, (0, node_path_1.join)(this.root, "lib"));
        if (local)
            return (0, promises_1.readFile)(local);
        if (!(0, dj_paths_1.remoteAllowed)(url))
            throw new Error(`Адрес не разрешён: ${String(url).slice(0, 120)}`);
        return this.remote(url);
    }
    async remote(url) {
        const res = await electron_1.net.fetch(url, { signal: AbortSignal.timeout(60_000) });
        // Редирект не должен уводить с разрешённых хостов.
        if (!(0, dj_paths_1.remoteAllowed)(res.url || url))
            throw new Error(`Редирект на неразрешённый адрес: ${url}`);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}: ${url}`);
        const declared = Number(res.headers.get("content-length") ?? 0);
        if (declared > dj_paths_1.MAX_REMOTE_BYTES)
            throw new Error(`Слишком большой файл: ${url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > dj_paths_1.MAX_REMOTE_BYTES)
            throw new Error(`Слишком большой файл: ${url}`);
        return buf;
    }
}
exports.DjHost = DjHost;
