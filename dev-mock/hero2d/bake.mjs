// THROWAWAY MOCK TOOL. Writes the baked pictures to ./baked/: runs bake.html in headless Chrome (one, at low
// priority), reads the pictures and their measurements out of the page, and saves them.
//
//   node dev-mock/hero2d/bake.mjs            (the mock's dev server must be up on 127.0.0.1:5191)
//
// Writes baked/baked.json and the pictures it names: mountain-desktop.webp, mountain-phone.webp, moon.webp. Anything
// else in baked/ from an earlier bake is removed.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dumpDom } from '../../scripts/deathfire/chrome.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const url = process.env.BAKE_URL || 'http://127.0.0.1:5191/dev-mock/hero2d/bake.html'

const dom = await dumpDom(url)
if (!dom.includes('<title>baked</title>')) throw new Error('the page did not finish baking: is the dev server up on 127.0.0.1:5191?')

const meta = JSON.parse(dom.match(/<script id="meta" type="application\/json">([\s\S]*?)<\/script>/)[1])
const out = join(here, 'baked')
mkdirSync(out, { recursive: true })
const written = new Set(['baked.json'])
let total = 0
/** Write the picture a manifest entry names, and note its weight on the entry. */
function save(entry) {
  const m = dom.match(new RegExp(`<img data-file="${entry.file}"[^>]*src="data:image/webp;base64,([^"]+)"`))
  if (!m) throw new Error(`no picture for ${entry.file} in the page`)
  const bytes = Buffer.from(m[1], 'base64')
  writeFileSync(join(out, entry.file), bytes)
  entry.bytes = bytes.length
  written.add(entry.file)
  total += bytes.length
  const t = entry.touches
  console.log(`${entry.file}: ${entry.px.join(' x ')} px, ${(bytes.length / 1024).toFixed(1)} KB${t && (t.left || t.right) ? '  !! the mountain runs off the canvas' : ''}`)
}
save(meta.moon)
for (const kind of ['desktop', 'phone']) save(meta[kind].mountain)
writeFileSync(join(out, 'baked.json'), JSON.stringify(meta, null, 2) + '\n')
// what the page itself noted while it painted
const log = dom.match(/<p id="log">([\s\S]*?)<\/p>/)
if (log) console.log(log[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
for (const name of readdirSync(out)) if (!written.has(name)) rmSync(join(out, name))
console.log(`wrote ${out} (${(total / 1024).toFixed(0)} KB of pictures in all; a browser fetches the moon and one mountain)`)
