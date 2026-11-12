// The brief names this scripts/render-marks.test.js, but vitest.config.js only picks up
// scripts/**/*.test.mjs, so it carries the .mjs extension like every other script test here.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { skullSvg, ogSvg, manifest, pathBounds, fit, main, MOTTO } from './render-marks.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const count = (s, needle) => s.split(needle).length - 1

describe('pathBounds', () => {
  it('reads a polygon of absolute points', () => {
    expect(pathBounds('M10 20L30 5L15 40Z')).toEqual({ x0: 10, y0: 5, x1: 30, y1: 40 })
  })
  it('reads the circles the skull module draws as two semi-arcs on a horizontal diameter', () => {
    expect(pathBounds('M8 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0')).toEqual({ x0: 8, y0: 8, x1: 12, y1: 12 })
  })
  it('reads an ellipse the same way', () => {
    expect(pathBounds('M10 20a4 2 0 1 0 8 0a4 2 0 1 0 -8 0')).toEqual({ x0: 10, y0: 18, x1: 18, y1: 22 })
  })
  it('reads negative and fractional coordinates', () => {
    expect(pathBounds('M-1.5 2.25L3 -4Z')).toEqual({ x0: -1.5, y0: -4, x1: 3, y1: 2.25 })
  })
})

describe('fit', () => {
  it('centres the box in the square and pads its longer side by 6% each end', () => {
    const { scale, tx, ty } = fit({ x0: 20, y0: 0, x1: 120, y1: 200 }, 200)
    // The longer side is 200, padded to 224: the box fills 200/224 of the square.
    expect(scale).toBeCloseTo(200 / 224, 6)
    // The box centre (70, 100) lands on the square's centre (100, 100).
    expect(70 * scale + tx).toBeCloseTo(100, 6)
    expect(100 * scale + ty).toBeCloseTo(100, 6)
    // And the long edges stand 6% of the padded square from its edges.
    expect(0 * scale + ty).toBeCloseTo(200 * (0.06 / 1.12), 6)
    expect(200 * scale + ty).toBeCloseTo(200 - 200 * (0.06 / 1.12), 6)
  })
  it('scales to the size asked for', () => {
    expect(fit({ x0: 0, y0: 0, x1: 100, y1: 100 }, 500).scale).toBeCloseTo(500 / 112, 6)
  })
})

describe('skullSvg', () => {
  const svg = skullSvg()

  it('is a 200 x 200 svg', () => {
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox="0 0 200 200"')
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })
  it('cannot use gradients, filters or CSS variables, since a favicon has none of the page around it', () => {
    expect(svg).not.toContain('url(#')
    expect(svg).not.toContain('var(')
    expect(svg).not.toContain('<defs')
    expect(svg).not.toContain('<style')
    expect(svg).not.toContain('class=')
  })
  it('flattens the plaque gradients to the five literals', () => {
    for (const hex of ['#d9cfae', '#8c6a2e', '#efe6cf', '#1a1410', '#ff6a2b']) expect(svg).toContain(hex)
  })
  it('lays a full-bleed obsidian rect under the skull', () => {
    expect(svg).toMatch(/<rect width="200" height="200" fill="#050a08"\/>/)
  })
  it('draws every op as a path with a non-empty d', () => {
    const paths = svg.match(/<path [^>]*>/g)
    expect(paths.length).toBeGreaterThan(100)
    for (const p of paths) expect(p).toMatch(/ d="[^"]+"/)
  })
  it('puts a size on the svg only when asked', () => {
    expect(svg).not.toMatch(/<svg[^>]* width=/)
    expect(skullSvg(180)).toMatch(/<svg[^>]* width="180" height="180"/)
  })
  it('is exactly what is committed (run `node scripts/render-marks.mjs` to refresh it)', () => {
    expect(read('public/favicon.svg')).toBe(svg)
  })
})

describe('manifest', () => {
  const m = JSON.parse(manifest())
  it('names the site and sets its colours', () => {
    expect(m.name).toBe('Salamanders')
    expect(m.short_name).toBe('Salamanders')
    expect(m.theme_color).toBe('#050a08')
    expect(m.background_color).toBe('#050a08')
    expect(m.display).toBe('standalone')
  })
  it('lists the two png icons', () => {
    expect(m.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ])
  })
  it('is exactly what is committed', () => {
    expect(read('public/site.webmanifest')).toBe(manifest())
  })
})

describe('ogSvg', () => {
  const svg = ogSvg()
  it('is a 1200 x 630 card', () => {
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('width="1200" height="630"')
    expect(svg).toContain('viewBox="0 0 1200 630"')
  })
  it('says SALAMANDERS once and the motto once', () => {
    expect(count(svg, 'SALAMANDERS')).toBe(1)
    expect(MOTTO).toBe('Into the fires of battle, unto the anvil of war.')
    expect(count(svg, MOTTO)).toBe(1)
  })
  it('sets the wordmark in the display stack, bold', () => {
    expect(svg).toContain(`font-family="'Oswald Variable', Bahnschrift, 'DIN Condensed', 'Arial Narrow', sans-serif"`)
    expect(svg).toMatch(/font-weight="700"[^>]*>SALAMANDERS</)
  })
  it('is flat obsidian with one ember hairline and the skull', () => {
    expect(svg).toMatch(/<rect width="1200" height="630" fill="#050a08"\/>/)
    expect(count(svg, '<line ')).toBe(1)
    expect(svg).toMatch(/<line [^>]*stroke="#ff6a2b"/)
    expect(svg).not.toContain('url(#')
    expect(svg).not.toContain('var(')
    expect(svg.match(/<path /g).length).toBeGreaterThan(100)
  })
  it('keeps the skull in the left half and the words in the right', () => {
    const [, tx] = svg.match(/<g transform="translate\(([\d.-]+) /)
    expect(Number(tx)).toBeLessThan(200)
    const [, x] = svg.match(/<text x="(\d+)"/)
    expect(Number(x)).toBeGreaterThan(520)
  })
  it('is exactly what is committed', () => {
    expect(read('public/og.svg')).toBe(svg)
  })
})

describe('index.html', () => {
  const html = read('index.html')
  it('keeps the svg icon and links the rest of the set', () => {
    expect(html).toContain('<link rel="icon" type="image/png" sizes="48x48" href="/icon-48.png" />')
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />')
  })
  it('carries the share card tags', () => {
    expect(html).toContain('<meta property="og:title" content="Salamanders" />')
    expect(html).toContain(`<meta property="og:description" content="${MOTTO}" />`)
    expect(html).toContain('<meta property="og:image" content="https://sm2salamanders.site/og.png" />')
    expect(html).toContain('<meta property="og:type" content="website" />')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
  })
})

describe('main', () => {
  let dir, logs
  const log = (s) => logs.push(s)
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'marks-'))
    mkdirSync(join(dir, 'public'))
    mkdirSync(join(dir, 'node_modules'))
    logs = []
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  // Rasteriser stand-ins that return bytes naming the size they were asked for.
  const fakeSharp = `
    module.exports = () => {
      const call = {}
      return {
        resize(w, h) { call.w = w; call.h = h; return this },
        png() { return this },
        toBuffer: async () => Buffer.from('sharp ' + call.w + 'x' + call.h),
      }
    }`
  const fakeResvg = `
    exports.Resvg = class {
      constructor(svg, opts) { this.width = opts.fitTo.value; this.mode = opts.fitTo.mode }
      render() { const w = this.width; return { asPng: () => Buffer.from('resvg ' + w) } }
    }`
  const install = (pkgDir, src) => {
    mkdirSync(join(dir, 'node_modules', pkgDir), { recursive: true })
    writeFileSync(join(dir, 'node_modules', pkgDir, 'package.json'), '{"name":"fake","main":"index.js"}')
    writeFileSync(join(dir, 'node_modules', pkgDir, 'index.js'), src)
  }
  const png = (n) => readFileSync(join(dir, `public/${n}.png`), 'utf8')

  it('writes the three vector files and says so when no rasteriser is installed', async () => {
    await main({ root: dir, log })
    expect(readFileSync(join(dir, 'public/favicon.svg'), 'utf8')).toBe(skullSvg())
    expect(readFileSync(join(dir, 'public/og.svg'), 'utf8')).toBe(ogSvg())
    expect(readFileSync(join(dir, 'public/site.webmanifest'), 'utf8')).toBe(manifest())
    for (const n of ['apple-touch-icon', 'icon-192', 'icon-512', 'og']) expect(existsSync(join(dir, `public/${n}.png`))).toBe(false)
    expect(logs).toContain('PNGs: none rendered (no rasteriser installed); render in Chrome')
  })

  it('renders the four PNGs with sharp when it is installed', async () => {
    install('sharp', fakeSharp)
    await main({ root: dir, log })
    expect(png('apple-touch-icon')).toBe('sharp 180x180')
    expect(png('icon-192')).toBe('sharp 192x192')
    expect(png('icon-512')).toBe('sharp 512x512')
    expect(png('og')).toBe('sharp 1200x630')
    expect(logs.join('\n')).not.toContain('none rendered')
  })

  it('renders the four PNGs with resvg when only that is installed', async () => {
    install('@resvg/resvg-js', fakeResvg)
    await main({ root: dir, log })
    expect(png('apple-touch-icon')).toBe('resvg 180')
    expect(png('icon-192')).toBe('resvg 192')
    expect(png('icon-512')).toBe('resvg 512')
    expect(png('og')).toBe('resvg 1200')
  })

  it('prefers sharp when both are installed', async () => {
    install('sharp', fakeSharp)
    install('@resvg/resvg-js', fakeResvg)
    await main({ root: dir, log })
    expect(png('icon-192')).toBe('sharp 192x192')
  })
})
