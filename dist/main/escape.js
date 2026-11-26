"use strict";
// Esc — жест пользователя (#321). Chromium не считает Esc пользовательской
// активацией, поэтому после Esc страница не может снова захватить мышь
// (`requestPointerLock` → NotAllowedError) — только кликом. Клиент придерживает
// каждое Esc-событие, даёт странице активацию (`executeJavaScript(…, true)`) и
// отдаёт событие заново доверенным вводом (`sendInputEvent`): обработчики
// страницы видят обычный keydown/keyup, но уже с активацией.
//
// Esc при захваченной мыши сюда не доходит: Chromium снимает захват раньше
// before-input-event и keydown съедает. Доходит только keyup — он тоже даёт
// активацию, и страница может вернуть захват после паузы самого Chromium (~1,25 с).
// Захват, взятый при нажатом Esc, Chromium снимет на отпускании — страница
// просит его на keyup (docs/API.md, «Esc и захват мыши»).
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscapeGesture = exports.GRANT_TIMEOUT_MS = void 0;
/** Не дождались активации (страница висит, уходит) — событие всё равно отдаём. */
exports.GRANT_TIMEOUT_MS = 500;
class EscapeGesture {
    target;
    timeoutMs;
    own = false;
    queue = Promise.resolve();
    constructor(target, timeoutMs = exports.GRANT_TIMEOUT_MS) {
        this.target = target;
        this.timeoutMs = timeoutMs;
    }
    /** `true` — событие придержано: вызывающий делает `preventDefault()`, отдадим сами. */
    handle(input) {
        if (input.key !== "Escape" || this.own)
            return false;
        if (input.type !== "keyDown" && input.type !== "keyUp")
            return false;
        const type = input.type;
        const modifiers = modifiersOf(input);
        const grant = !input.isAutoRepeat;
        // По очереди: keyup не обгоняет придержанный keydown.
        this.queue = this.queue.then(async () => {
            if (grant)
                await this.grant();
            this.own = true;
            try {
                this.target.resend(type, modifiers);
            }
            catch {
                // окно закрылось — отдавать некому
            }
            finally {
                this.own = false;
            }
        });
        return true;
    }
    /** Все придержанные события отданы (для тестов). */
    idle() {
        return this.queue;
    }
    async grant() {
        let timer;
        const timeout = new Promise((resolve) => {
            timer = setTimeout(resolve, this.timeoutMs);
        });
        try {
            await Promise.race([this.target.grantGesture().catch(() => { }), timeout]);
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.EscapeGesture = EscapeGesture;
function modifiersOf(input) {
    const out = [];
    if (input.shift)
        out.push("shift");
    if (input.control)
        out.push("control");
    if (input.alt)
        out.push("alt");
    if (input.meta)
        out.push("meta");
    if (input.isAutoRepeat)
        out.push("isautorepeat");
    return out;
}
