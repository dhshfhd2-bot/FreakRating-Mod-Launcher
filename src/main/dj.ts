// Встроенный DJ (проигрыватель, гитара, ритм-игра): код и библиотека лежат в dj/ внутри клиента,
// без Tampermonkey и GitHub. Главный процесс отдаёт странице исходники и ходит в сеть за семплами
// (у страницы мира CORS закрыт — раньше это делал GM_xmlhttpRequest).
import { app, net } from "electron"
import { readFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { LIB_SCHEME, MAX_REMOTE_BYTES, isSongFile, libPath, remoteAllowed } from "./dj-paths"

export type DjSource = "hook" | "hud" | "player" | "converter"

const FILES: Record<DjSource, string> = {
  hook: "voice-hook.js",
  hud: "dj-hud.js",
  player: "guitar-player.js",
  converter: "gp-converter.js",
}

export class DjHost {
  private readonly root: string
  private readonly sources = new Map<DjSource, string>()

  constructor() {
    this.root = app.isPackaged ? join(process.resourcesPath, "dj") : join(__dirname, "../../dj")
  }

  /** Исходник скрипта DJ. Небольшие файлы, читаем синхронно и запоминаем. */
  source(name: DjSource): string {
    let text = this.sources.get(name)
    if (text === undefined) {
      text = readFileSync(join(this.root, FILES[name]), "utf8")
      this.sources.set(name, text)
    }
    return text
  }

  async songs(): Promise<Array<{ file: string; url: string }>> {
    const names = await readdir(join(this.root, "lib"))
    return names.filter(isSongFile).map((file) => ({ file, url: `${LIB_SCHEME}${file}` }))
  }

  async text(url: unknown): Promise<string> {
    return (await this.bytes(url)).toString("utf8")
  }

  async bytes(url: unknown): Promise<Buffer> {
    const local = libPath(url, join(this.root, "lib"))
    if (local) return readFile(local)
    if (!remoteAllowed(url)) throw new Error(`Адрес не разрешён: ${String(url).slice(0, 120)}`)
    return this.remote(url)
  }

  private async remote(url: string): Promise<Buffer> {
    const res = await net.fetch(url, { signal: AbortSignal.timeout(60_000) })
    // Редирект не должен уводить с разрешённых хостов.
    if (!remoteAllowed(res.url || url)) throw new Error(`Редирект на неразрешённый адрес: ${url}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
    const declared = Number(res.headers.get("content-length") ?? 0)
    if (declared > MAX_REMOTE_BYTES) throw new Error(`Слишком большой файл: ${url}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_REMOTE_BYTES) throw new Error(`Слишком большой файл: ${url}`)
    return buf
  }
}
