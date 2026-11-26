// Чистая логика встроенного DJ без Electron — её проверяют тесты (test/units.test.mjs).
import { resolve, sep } from "node:path"

/** Префикс адресов песен библиотеки: страница просит `freakdj://lib/<путь>`, клиент читает файл из dj/lib. */
export const LIB_SCHEME = "freakdj://lib/"

/** Куда DJ можно ходить в сеть (семплы инструментов, alphaTab, банк звуков). Только https. */
export const REMOTE_HOSTS = ["gleitz.github.io", "tonejs.github.io", "cdn.jsdelivr.net"]

/** Потолок размера ответа из сети: банк звуков GeneralUser GS — десятки МБ. */
export const MAX_REMOTE_BYTES = 120 * 1024 * 1024

/** Файл библиотеки по адресу `freakdj://lib/…` или null, если адрес чужой или выходит из папки. */
export function libPath(url: unknown, libRoot: string): string | null {
  if (typeof url !== "string" || !url.startsWith(LIB_SCHEME)) return null
  let rel: string
  try {
    rel = decodeURIComponent(url.slice(LIB_SCHEME.length))
  } catch {
    return null
  }
  if (!rel || rel.includes("\0")) return null
  const root = resolve(libRoot)
  const full = resolve(root, rel)
  return full.startsWith(root + sep) ? full : null
}

export function remoteAllowed(url: unknown): url is string {
  if (typeof url !== "string") return false
  try {
    const u = new URL(url)
    return u.protocol === "https:" && REMOTE_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}

/** Песни библиотеки: `play-*.js`. */
export function isSongFile(name: string): boolean {
  return /^play-.*\.js$/i.test(name)
}
