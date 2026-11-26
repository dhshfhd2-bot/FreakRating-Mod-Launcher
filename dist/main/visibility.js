"use strict";
// Видно ли окно мира. backgroundThrottling выключен, поэтому Page Visibility в
// свёрнутом окне врёт («visible»), а мир рисует кадры дальше. Клиент сам следит
// за minimize/hide/restore/show и говорит странице `onWindowVisibility`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowVisibility = void 0;
/** Помнит последнее отправленное состояние: событие — только при смене. */
class WindowVisibility {
    hidden = false;
    get current() {
        return this.hidden;
    }
    /** Новое состояние окна; `null` — не поменялось. */
    update(w) {
        const hidden = w.isMinimized() || !w.isVisible();
        if (hidden === this.hidden)
            return null;
        this.hidden = hidden;
        return hidden;
    }
}
exports.WindowVisibility = WindowVisibility;
