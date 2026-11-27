# FreakRating — чистая сборка + моды

Папка с клиентом: `FreakRating-Clean`. Запуск — `start.bat`.

## Куда ставить файлы модов

| Мод | Репозиторий | Файл | Куда положить |
|---|---|---|---|
| Художка (трафарет) | [Stencil](https://github.com/dhshfhd2-bot/FreakRating-Mod-Stencil) | `freakrating-stencil.user.js` | `mods\` |
| Оптимизация | [Optimization](https://github.com/dhshfhd2-bot/FreakRating-Mod-Optimization) | `optimization.js` | `mods\` |
| Гитара | [Guitar](https://github.com/dhshfhd2-bot/FreakRating-Mod-Guitar) | `guitar.js` | `mods\` |
| Карта | [Map](https://github.com/dhshfhd2-bot/FreakRating-Mod-Map) | `map.js` | `mods\` |
| TikTok | [TikTok](https://github.com/dhshfhd2-bot/FreakRating-Mod-TikTok) | `tiktok-phone.js` | корень клиента, рядом с `launcher.js`, плюс строка `load('./tiktok-phone.js')` в `launcher.js` |

`mods\*.js` внедряются в окно игры. `tiktok-phone.js` — мод главного процесса, поэтому он лежит в корне.

Лог внедрения: `mods\_inject.log`.

Оригинальный лаунчер: https://github.com/Egorrko/freakrating-client
