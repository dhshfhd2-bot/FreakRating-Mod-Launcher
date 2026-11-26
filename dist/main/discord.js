"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordPresence = void 0;
exports.sanitizePresence = sanitizePresence;
// Статус в Discord (Rich Presence). Без client id или без запущенного Discord —
// молча ничего не делаем. Что показывать, решает страница (`setPresence`).
const config_1 = require("./config");
const RETRY_MS = 30_000;
class DiscordPresence {
    client = null;
    ready = false;
    presence = null;
    retry = null;
    clientId;
    constructor(clientId = process.env.FREAK_DISCORD_CLIENT_ID || config_1.DISCORD_CLIENT_ID) {
        this.clientId = clientId;
    }
    get enabled() {
        return /^\d{5,}$/.test(this.clientId);
    }
    status() {
        return { enabled: this.enabled, connected: this.ready, presence: this.presence };
    }
    start() {
        if (!this.enabled)
            return;
        void this.connect();
    }
    set(presence) {
        this.presence = presence ? sanitizePresence(presence) : null;
        void this.push();
    }
    stop() {
        if (this.retry)
            clearTimeout(this.retry);
        this.retry = null;
        const c = this.client;
        this.client = null;
        this.ready = false;
        void c?.destroy().catch(() => { });
    }
    async connect() {
        try {
            const { Client } = await Promise.resolve().then(() => __importStar(require("@xhayper/discord-rpc")));
            const client = new Client({ clientId: this.clientId });
            client.on("disconnected", () => {
                this.ready = false;
                this.schedule();
            });
            await client.login();
            this.client = client;
            this.ready = true;
            await this.push();
        }
        catch {
            // Discord не запущен — попробуем позже.
            this.ready = false;
            this.schedule();
        }
    }
    schedule() {
        if (this.retry || !this.enabled)
            return;
        this.retry = setTimeout(() => {
            this.retry = null;
            void this.connect();
        }, RETRY_MS);
    }
    async push() {
        if (!this.ready || !this.client?.user)
            return;
        try {
            if (!this.presence)
                return void (await this.client.user.clearActivity());
            const p = this.presence;
            await this.client.user.setActivity({
                details: p.details,
                state: p.state,
                startTimestamp: p.startTimestamp,
                partySize: p.partySize,
                partyMax: p.partyMax,
                largeImageKey: config_1.DISCORD_LARGE_IMAGE,
                largeImageText: p.largeImageText ?? "FreakRating",
                buttons: p.buttonLabel && p.buttonUrl ? [{ label: p.buttonLabel, url: p.buttonUrl }] : undefined,
                instance: false,
            });
        }
        catch {
            // Discord ответил ошибкой (например, лимит частоты) — следующий setPresence исправит.
        }
    }
}
exports.DiscordPresence = DiscordPresence;
const str = (v, max) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
const int = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined;
/** Страница — недоверенный источник: только известные поля, строки урезаны. */
function sanitizePresence(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const r = raw;
    const p = {
        details: str(r.details, 128),
        state: str(r.state, 128),
        startTimestamp: int(r.startTimestamp),
        partySize: int(r.partySize),
        partyMax: int(r.partyMax),
        largeImageText: str(r.largeImageText, 128),
    };
    const url = str(r.buttonUrl, 512);
    if (url && /^https:\/\/([a-z0-9-]+\.)*freakrating\.lol(\/|$)/i.test(url)) {
        p.buttonUrl = url;
        p.buttonLabel = str(r.buttonLabel, 32) ?? "FreakRating";
    }
    // Discord не принимает строки короче двух символов.
    if (p.state?.length === 1)
        p.state += " ";
    if (p.details?.length === 1)
        p.details += " ";
    return p;
}
