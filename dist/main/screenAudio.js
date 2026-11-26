"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenAudio = exports.SCREEN_AUDIO_LABEL = void 0;
// Звук показа экрана на Linux: виртуальный микрофон venmic (PipeWire), в
// который сведены все программы, кроме самого клиента. Chromium на Linux
// умеет только весь звук системы (монитор колонок) — туда попадает и звук мира
// с голосами, и зрители слышат себя эхом.
//
// Свой звук Chromium выводит из процесса «Audio Service» — его pid и исключаем.
// Страница берёт микрофон по метке через getUserMedia (docs/API.md,
// startScreenAudio).
const electron_1 = require("electron");
/** Метка устройства, под которой venmic создаёт микрофон. */
exports.SCREEN_AUDIO_LABEL = "vencord-screen-share";
class ScreenAudio {
    bay = null;
    linked = false;
    failed = false;
    /** Свести звук в микрофон. null — нельзя: не Linux, нет PipeWire или venmic. */
    start() {
        const bay = this.patchBay();
        if (!bay)
            return null;
        const pid = electron_1.app.getAppMetrics().find((p) => p.name === "Audio Service")?.pid;
        // Без pid своего звука не исключить — лучше без звука, чем с эхом.
        if (!pid)
            return null;
        this.stop();
        try {
            const ok = bay.link({
                exclude: [{ "application.process.id": String(pid) }],
                ignore_devices: true,
                only_speakers: true,
                only_default_speakers: true,
            });
            if (!ok)
                return null;
        }
        catch (err) {
            console.error("[screenAudio] link", err);
            return null;
        }
        this.linked = true;
        return { deviceLabel: exports.SCREEN_AUDIO_LABEL };
    }
    stop() {
        if (!this.linked || !this.bay)
            return;
        this.linked = false;
        try {
            this.bay.unlink();
        }
        catch (err) {
            console.error("[screenAudio] unlink", err);
        }
    }
    patchBay() {
        if (this.bay)
            return this.bay;
        if (process.platform !== "linux" || this.failed)
            return null;
        try {
            // Необязательная зависимость: есть только в сборке под Linux.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const venmic = require("@vencord/venmic");
            if (!venmic.PatchBay.hasPipeWire())
                throw new Error("нет PipeWire");
            this.bay = new venmic.PatchBay();
            return this.bay;
        }
        catch (err) {
            this.failed = true;
            console.error("[screenAudio] venmic", err);
            return null;
        }
    }
}
exports.ScreenAudio = ScreenAudio;
