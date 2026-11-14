// THROWAWAY MOCK TOOL. Writes the baked pictures to ./baked/: runs bake.html in headless Chrome (one, at low
// priority), reads the pictures and their measurements out of the page, and saves them.
//
//   node dev-mock/hero2d/bake.mjs            (the mock's dev server must be up on 127.0.0.1:5191)
//
// Writes baked/baked.json and the pictures it names: mountain-desktop.webp, mountain-phone.webp, moon.webp. Anything
// else in baked/ from an earlier bake is removed.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const url = process.env.BAKE_URL || 'http://127.0.0.1:5191/dev-mock/hero2d/bake.html'
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p))
if (!chrome) throw new Error('Chrome not found: set CHROME to its path')

const dom = await new Promise((resolve, reject) => {
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--virtual-time-budget=120000', '--dump-dom', url], { stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
  } catch {
    // not fatal: it only keeps the machine responsive
  }
  const chunks = []
  let err = ''
  child.stdout.on('data', (c) => chunks.push(c))
  child.stderr.on('data', (c) => (err += c))
  const timer = setTimeout(() => {
    child.kill()
    reject(new Error('Chrome took more than 3 minutes'))
  }, 180000)
  child.on('error', reject)
  child.on('close', (code) => {
    clearTimeout(timer)
    const text = Buffer.concat(chunks).toString('utf8')
    if (!text.includes('<title>baked</title>')) reject(new Error(`the page did not finish baking (exit ${code}). ${err.slice(-400)}`))
    else resolve(text)
  })
})

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
