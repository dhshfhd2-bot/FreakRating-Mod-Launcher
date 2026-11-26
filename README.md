# FreakRating Mods — установщик на базе freakrating-client-main

Установщик ставит файлы из `E:\freakrating-client-dj\freakrating-client-main` **без модов**.
Это отдельная программа со своим `appId`, она не перезаписывает оригинальный FreakRating.
Профиль общий (`%APPDATA%\FreakRating`), поэтому вход не сбрасывается.

## Установка

1. Скачай `FreakRating-Mods-Setup-1.0.0.exe` из [Releases](../../releases) и запусти.
2. После установки рядом с `FreakRating Mods.exe` появится папка `mods`.
3. Скачай нужные `.js`-моды из репозиториев `FreakRating-Mod-*` и положи в `mods`.
4. Запусти лаунчер через ярлык **FreakRating Mods**.

Чтобы убрать мод — удали его `.js` из `mods`. Лог внедрения: `mods\_inject.log`.

Моды:
- https://github.com/dhshfhd2-bot/FreakRating-Mod-Optimization
- https://github.com/dhshfhd2-bot/FreakRating-Mod-Map
- https://github.com/dhshfhd2-bot/FreakRating-Mod-Guitar
- https://github.com/dhshfhd2-bot/FreakRating-Mod-Stencil
- https://github.com/dhshfhd2-bot/FreakRating-Mod-TikTok

Оригинальный лаунчер: https://github.com/Egorrko/freakrating-client
