# FreakRating Mods — свой лаунчер поверх игры

Это не замена FreakRating. Лаунчер просто открывает мир и внедряет моды из папки `mods` рядом с ним.

## Запуск

Дважды кликни `start.bat` или ярлык **FreakRating Mods** на рабочем столе.

Лаунчер использует Electron из папки клиента:

```
E:\freakrating-client-dj\freakrating-client-main\node_modules\electron\dist\electron.exe
```

Если путь другой — поправь его в `start.bat`.

## Моды

Папка `mods` создаётся автоматически рядом с лаунчером. Положи туда `.js`-файлы модов и перезапусти лаунчер.

В папке `mods\_launcher.log` видно, какие моды внедрены.

Моды: https://github.com/dhshfhd2-bot/FreakRating-Mod-Optimization и другие репозитории `FreakRating-Mod-*`.
