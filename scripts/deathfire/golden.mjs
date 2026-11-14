// The golden check: proves that a change to the hero drawing's code moved no pixel.
//
//   node scripts/deathfire/golden.mjs            compare with the recorded hashes (the dev server must be up on 127.0.0.1:5191)
//   node scripts/deathfire/golden.mjs --write    record them (only when a change to the picture is meant, and looked at)
//
// It runs golden.html in headless Chrome: fixed scenes, seeded chance, fixed frames, one hash per picture.
//
// The hashes hold for one machine and one Chrome. After a Chrome update they may all change with no change to the
// code: check out a commit known to be good, run this with --write, and come back.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dumpDom } from './chrome.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const file = join(here, 'golden.json')
const url = process.env.GOLDEN_URL || 'http://127.0.0.1:5191/scripts/deathfire/golden.html'

const dom = await dumpDom(url)
if (!dom.includes('<title>golden</title>')) {
  const log = dom.match(/<p id="log">([\s\S]*?)<\/p>/)
  console.error(`golden: the page did not finish. ${log ? log[1].slice(0, 600) : 'Is the dev server up on 127.0.0.1:5191?'}`)
  process.exit(2)
}
const now = JSON.parse(dom.match(/<script id="golden" type="application\/json">([\s\S]*?)<\/script>/)[1])
const names = Object.keys(now)

if (process.argv.includes('--write')) {
  writeFileSync(file, JSON.stringify(now, null, 2) + '\n')
  console.log(`golden: recorded ${names.length} cases`)
  process.exit(0)
}
if (!existsSync(file)) {
  console.error('golden: nothing recorded yet (run with --write)')
  process.exit(2)
}
const was = JSON.parse(readFileSync(file, 'utf8'))
const differ = [...new Set([...names, ...Object.keys(was)])].filter((k) => now[k] !== was[k])
if (differ.length) {
  console.error(`golden: ${differ.length} of ${names.length} differ`)
  for (const k of differ) console.error(`  ${k}: was ${was[k] ?? 'not recorded'}, now ${now[k] ?? 'missing'}`)
  process.exit(1)
}
console.log(`golden: ${names.length} match`)
