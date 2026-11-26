"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NavigationPolicy = void 0;
exports.isExternalScheme = isExternalScheme;
exports.safeUrl = safeUrl;
exports.isWorldPath = isWorldPath;
// Куда окну можно ходить. Чистые функции — их проверяют тесты (test/navigation.test.mjs).
const config_1 = require("./config");
function hostMatches(host, list) {
    return list.some((h) => host === h || host.endsWith("." + h));
}
class NavigationPolicy {
    extraOrigins;
    /** Идёт вход через Twitch: страницы twitch.tv пускаем в окно до возврата на сайт. */
    oauthFlow = false;
    constructor(startUrl) {
        this.extraOrigins = new Set();
        const u = safeUrl(startUrl);
        // Дев-адрес (`--url=http://localhost:4000/world`) — тоже «свой».
        if (u && !hostMatches(u.hostname, config_1.APP_HOSTS))
            this.extraOrigins.add(u.origin);
    }
    isAppUrl(url) {
        const u = safeUrl(url);
        if (!u)
            return false;
        if (this.extraOrigins.has(u.origin))
            return true;
        return u.protocol === "https:" && hostMatches(u.hostname, config_1.APP_HOSTS);
    }
    /** Решение для перехода главного фрейма: пустить в окне или отдать системе. */
    decide(url) {
        const u = safeUrl(url);
        if (!u)
            return "deny";
        if (this.isAppUrl(url)) {
            this.oauthFlow = false;
            return "allow";
        }
        if (u.protocol === "https:" && hostMatches(u.hostname, config_1.OAUTH_START_HOSTS)) {
            this.oauthFlow = true;
            return "allow";
        }
        if (this.oauthFlow && u.protocol === "https:" && hostMatches(u.hostname, config_1.OAUTH_FLOW_HOSTS)) {
            return "allow";
        }
        return isExternalScheme(u) ? "external" : "deny";
    }
}
exports.NavigationPolicy = NavigationPolicy;
/** Что можно отдать системе: браузер, почта, Telegram, Discord. */
function isExternalScheme(u) {
    return ["https:", "http:", "mailto:", "tg:", "discord:"].includes(u.protocol);
}
function safeUrl(url) {
    try {
        return new URL(url);
    }
    catch {
        return null;
    }
}
/** Путь мира — его закрытие подтверждаем и на него возвращаемся после падения. */
function isWorldPath(url) {
    const u = safeUrl(url);
    return !!u && (u.pathname === "/world" || u.pathname.startsWith("/world/"));
}
