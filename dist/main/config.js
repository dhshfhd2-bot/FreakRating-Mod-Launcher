"use strict";
// Константы клиента и разбор флагов запуска.
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNRESPONSIVE_RELOAD_MS = exports.CRASH_STREAK_RESET_MS = exports.CRASH_STREAK_TO_SUGGEST = exports.OAUTH_FLOW_HOSTS = exports.OAUTH_START_HOSTS = exports.APP_HOSTS = exports.DISCORD_LARGE_IMAGE = exports.DISCORD_CLIENT_ID = exports.DEFAULT_URL = void 0;
exports.parseCli = parseCli;
/** Адрес мира по умолчанию. Переопределяется `--url=` или `FREAK_URL`. */
exports.DEFAULT_URL = "https://freakrating.lol/world";
/**
 * Discord Application ID для статуса в Discord (Rich Presence).
 * Пусто — статус молча выключен. Переопределяется `FREAK_DISCORD_CLIENT_ID`.
 * Завести: https://discord.com/developers/applications → New Application → Application ID.
 */
exports.DISCORD_CLIENT_ID = "";
/** Ключ картинки в Rich Presence (Art Assets приложения Discord). */
exports.DISCORD_LARGE_IMAGE = "logo";
/**
 * Хосты, по которым окно ходит само (главный фрейм). Всё остальное — в системный
 * браузер. Поддомены разрешены: `api.freakrating.lol` и т. п.
 */
exports.APP_HOSTS = ["freakrating.lol", "freakland.egorrko.ru"];
/**
 * Вход через Twitch OAuth: сначала `id.twitch.tv/oauth2/authorize`, оттуда —
 * страницы логина twitch.tv. Пускаем их в окно только внутри такого входа
 * (см. `navigation.ts`), иначе обычные ссылки на каналы открылись бы в клиенте.
 */
exports.OAUTH_START_HOSTS = ["id.twitch.tv"];
exports.OAUTH_FLOW_HOSTS = ["twitch.tv", "id.twitch.tv", "passport.twitch.tv", "www.twitch.tv"];
/** Сколько падений подряд — и предлагаем другой графический режим. */
exports.CRASH_STREAK_TO_SUGGEST = 2;
/** Столько мс без падений — и счётчик «подряд» обнуляется. */
exports.CRASH_STREAK_RESET_MS = 5 * 60_000;
/** Столько мс страница может не отвечать, прежде чем перезагрузим мир. */
exports.UNRESPONSIVE_RELOAD_MS = 10_000;
function parseCli(argv, env) {
    const flag = (name) => {
        const prefix = `--${name}=`;
        const hit = argv.find((a) => a.startsWith(prefix));
        return hit?.slice(prefix.length);
    };
    return {
        url: flag("url") ?? env.FREAK_URL ?? exports.DEFAULT_URL,
        backend: flag("graphics-backend") ?? env.FREAK_GRAPHICS_BACKEND,
        devtools: argv.includes("--devtools"),
    };
}
