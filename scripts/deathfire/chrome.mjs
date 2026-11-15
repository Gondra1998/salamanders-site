// Runs a page of the dev server in headless Chrome and hands back what the page looked like when it had finished
// (its DOM, as text). One Chrome at a time, at low priority, so the machine stays usable. Used by the bake tool and
// the golden check, which both leave their results in the page for this to read.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'

const CHROMES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

/**
 * Open `url` in headless Chrome, let it run (up to `budgetMs` of the page's own time), and return its DOM as text.
 * The caller checks the page said it was done (a title it sets), since Chrome returns whatever is there when the
 * time is up.
 */
export function dumpDom(url, { budgetMs = 120000 } = {}) {
  const chrome = CHROMES.find((p) => p && existsSync(p))
  if (!chrome) throw new Error('Chrome not found: set CHROME to its path')
  return new Promise((resolve, reject) => {
    const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--virtual-time-budget=${budgetMs}`, '--dump-dom', url]
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] })
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
      if (!text) reject(new Error(`Chrome gave nothing back (exit ${code}). ${err.slice(-400)}`))
      else resolve(text)
    })
  })
}
