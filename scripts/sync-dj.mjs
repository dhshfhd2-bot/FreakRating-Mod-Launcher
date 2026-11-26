// Обновить встроенный DJ из репозитория freakrating-dj:
//   node scripts/sync-dj.mjs ../freakrating-dj
// Копирует в dj/ HUD, проигрыватель, перехват голоса, конвертер GP и библиотеку песен.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

const from = process.argv[2]
if (!from || !existsSync(join(from, "src", "dj-hud.js"))) {
  console.error("Использование: node scripts/sync-dj.mjs <путь к freakrating-dj>")
  process.exit(1)
}
const to = "dj"
rmSync(to, { recursive: true, force: true })
mkdirSync(join(to, "lib", "sources"), { recursive: true })

for (const [src, dst] of [
  ["src/dj-hud.js", "dj-hud.js"],
  ["src/guitar-player.js", "guitar-player.js"],
  ["src/voice-hook.js", "voice-hook.js"],
  ["src/generated/gp-converter.js", "gp-converter.js"],
  ["lib/sources.json", "lib/sources.json"],
]) {
  cpSync(join(from, src), join(to, dst))
}
for (const name of readdirSync(join(from, "lib"))) {
  if (/^play-.*\.js$/i.test(name)) cpSync(join(from, "lib", name), join(to, "lib", name))
}
// Исходные GP (пластинки играют их всеми партиями); PDF-ноты не нужны.
for (const name of readdirSync(join(from, "lib", "sources"))) {
  if (!/\.pdf$/i.test(name)) cpSync(join(from, "lib", "sources", name), join(to, "lib", "sources", name))
}
console.log("DJ обновлён из", from)
