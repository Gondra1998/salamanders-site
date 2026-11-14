// THROWAWAY MOCK TOOL. Writes the baked mountain to ./baked/: runs bake.html in headless Chrome (one, at low
// priority), reads the two pictures and their measurements out of the page, and saves them.
//
//   node dev-mock/hero2d/bake.mjs            (the mock's dev server must be up on 127.0.0.1:5191)
//
// Writes baked/mountain-desktop.webp, baked/mountain-phone.webp and baked/mountain.json.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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
for (const kind of Object.keys(meta)) {
  const m = dom.match(new RegExp(`<img id="${kind}"[^>]*src="data:image/webp;base64,([^"]+)"`))
  if (!m) throw new Error(`no picture for ${kind} in the page`)
  const bytes = Buffer.from(m[1], 'base64')
  writeFileSync(join(out, `mountain-${kind}.webp`), bytes)
  meta[kind].bytes = bytes.length
  const t = meta[kind].touches
  console.log(`${kind}: ${meta[kind].px.join(' x ')} px, ${(bytes.length / 1024).toFixed(1)} KB${t.left || t.right ? '  !! the mountain runs off the canvas' : ''}`)
}
writeFileSync(join(out, 'mountain.json'), JSON.stringify(meta, null, 2) + '\n')
console.log(`wrote ${out}`)
