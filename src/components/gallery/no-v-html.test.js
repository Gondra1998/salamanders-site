import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Reliquarium shows what members type (titles, notes, names) and what Discord sends (clip titles, link
// addresses), so all of it must only ever be shown by normal Vue interpolation, never turned into markup
// (`v-html`, `innerHTML` and friends). This scans the area's source (not tests) and also checks that it can
// actually find a violation, so it cannot pass by looking nowhere. Same guard as the Deathwatch area's.
const SRC = fileURLToPath(new URL('../../', import.meta.url))
const SCANNED = ['components/gallery', 'lib/gallery', 'stores/gallery.js', 'views/Reliquarium.vue']
const SINKS = ['v-html', 'innerHTML', 'outerHTML', 'insertAdjacentHTML']

const sourceFilesUnder = (path) => {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return /\.(vue|js)$/.test(path) && !/\.test\.js$/.test(path) ? [path] : []
  return readdirSync(path).flatMap((name) => sourceFilesUnder(join(path, name)))
}
const violations = (paths) =>
  paths.flatMap((file) => {
    const text = readFileSync(file, 'utf8')
    return SINKS.filter((sink) => text.includes(sink)).map((sink) => `${file}: ${sink}`)
  })

let scratch
afterEach(() => scratch && rmSync(scratch, { recursive: true, force: true }))

describe('no raw markup in the Reliquarium', () => {
  it('finds nothing in the area', () => {
    const files = SCANNED.flatMap((p) => sourceFilesUnder(join(SRC, p)))
    expect(files.length).toBeGreaterThan(8) // it is looking at real files: the page, its components, the lib and the store
    expect(files.some((f) => f.endsWith('Reliquarium.vue'))).toBe(true)
    expect(files.some((f) => f.endsWith('GalleryCard.vue'))).toBe(true)
    expect(violations(files)).toEqual([])
  })

  it('would find a violation if there were one', () => {
    scratch = mkdtempSync(join(tmpdir(), 'rq-guard-'))
    for (const sink of SINKS) writeFileSync(join(scratch, `${sink}.vue`), `<template><p ${sink}="x" /></template>`)
    writeFileSync(join(scratch, 'clean.vue'), '<template><p>{{ text }}</p></template>')
    const found = violations(sourceFilesUnder(scratch))
    expect(found).toHaveLength(SINKS.length)
    expect(found.join('\n')).not.toContain('clean.vue')
  })
})
