"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTray = createTray;
// Значок в трее: настройки и служебное, раз меню у окна нет.
const electron_1 = require("electron");
const node_path_1 = require("node:path");
function createTray(actions) {
    let tray = null;
    try {
        tray = new electron_1.Tray(electron_1.nativeImage.createFromPath((0, node_path_1.join)(__dirname, "../../assets/tray.png")));
    }
    catch {
        // Нет трея (часть Linux-окружений) — настройки остаются по Ctrl+,.
        return { refresh() { } };
    }
    tray.setToolTip("FreakRating");
    const build = () => electron_1.Menu.buildFromTemplate([
        { label: "Открыть мир", click: actions.show },
        { label: "Перезагрузить мир", click: actions.reload },
        { type: "separator" },
        { label: "Настройки клиента…  (Ctrl+,)", click: actions.openSettings },
        {
            label: "Диагностика",
            submenu: [
                { label: "Папка с дампами падений", click: actions.openDumps },
                { label: "Инструменты разработчика  (Ctrl+Shift+F12)", click: actions.toggleDevTools },
            ],
        },
        { type: "separator" },
        { label: "Выход", click: actions.quit },
    ]);
    tray.setContextMenu(build());
    tray.on("click", actions.show);
    return {
        refresh() {
            tray?.setContextMenu(build());
        },
    };
}
