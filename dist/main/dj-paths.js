"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_REMOTE_BYTES = exports.REMOTE_HOSTS = exports.LIB_SCHEME = void 0;
exports.libPath = libPath;
exports.remoteAllowed = remoteAllowed;
exports.isSongFile = isSongFile;
// Чистая логика встроенного DJ без Electron — её проверяют тесты (test/units.test.mjs).
const node_path_1 = require("node:path");
/** Префикс адресов песен библиотеки: страница просит `freakdj://lib/<путь>`, клиент читает файл из dj/lib. */
exports.LIB_SCHEME = "freakdj://lib/";
/** Куда DJ можно ходить в сеть (семплы инструментов, alphaTab, банк звуков). Только https. */
exports.REMOTE_HOSTS = ["gleitz.github.io", "tonejs.github.io", "cdn.jsdelivr.net"];
/** Потолок размера ответа из сети: банк звуков GeneralUser GS — десятки МБ. */
exports.MAX_REMOTE_BYTES = 120 * 1024 * 1024;
/** Файл библиотеки по адресу `freakdj://lib/…` или null, если адрес чужой или выходит из папки. */
function libPath(url, libRoot) {
    if (typeof url !== "string" || !url.startsWith(exports.LIB_SCHEME))
        return null;
    let rel;
    try {
        rel = decodeURIComponent(url.slice(exports.LIB_SCHEME.length));
    }
    catch {
        return null;
    }
    if (!rel || rel.includes("\0"))
        return null;
    const root = (0, node_path_1.resolve)(libRoot);
    const full = (0, node_path_1.resolve)(root, rel);
    return full.startsWith(root + node_path_1.sep) ? full : null;
}
function remoteAllowed(url) {
    if (typeof url !== "string")
        return false;
    try {
        const u = new URL(url);
        return u.protocol === "https:" && exports.REMOTE_HOSTS.includes(u.hostname);
    }
    catch {
        return false;
    }
}
/** Песни библиотеки: `play-*.js`. */
function isSongFile(name) {
    return /^play-.*\.js$/i.test(name);
}
