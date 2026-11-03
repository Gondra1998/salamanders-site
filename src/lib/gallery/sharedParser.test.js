import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The site bundles server/src/galleryParse.js (through ./embed.js) so the page and the clips poll read links
// the same way. An import there would drag a server module (pg, node:crypto, a secret) into the browser bundle,
// or break the build, so the parser must stay free of imports and requires.
describe('the parser the site shares with the server', () => {
  const source = readFileSync(new URL('../../../server/src/galleryParse.js', import.meta.url), 'utf8')

  it('is the file embed.js imports', () => {
    const embed = readFileSync(new URL('./embed.js', import.meta.url), 'utf8')
    expect(embed).toContain("from '../../../server/src/galleryParse.js'")
    expect(source).toContain('export function embedOf(')
  })

  it('has no import or require lines', () => {
    const lines = source.split(/\r?\n/)
    expect(lines.filter((line) => /^\s*import[\s{*'"(]/.test(line))).toEqual([])
    expect(lines.filter((line) => line.includes('require('))).toEqual([])
    expect(source).not.toMatch(/\bimport\(/)
  })
})
