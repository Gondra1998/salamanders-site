// Cuts the site's marks from the drake skull on the archive plaque: public/favicon.svg, public/og.svg and
// public/site.webmanifest, and, when a rasteriser is already installed, the four PNGs (apple-touch-icon.png,
// icon-192.png, icon-512.png, og.png).
//
//   node scripts/render-marks.mjs
//
// The skull is not copied: its drawing ops come from src/components/archive/drakeSkull.js (the same seed the plaque
// uses), flattened here to single colours, since a favicon has no gradients, filters or CSS variables around it.
// The committed files are checked against these generators in render-marks.test.mjs.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { drakeSkull } from '../src/components/archive/drakeSkull.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const MOTTO = 'Into the fires of battle, unto the anvil of war.'
const OBSIDIAN = '#050a08'
const BONE_TEXT = '#e8efe9'
const PEWTER = '#c3d0c6'
const EMBER = '#ff6a2b'
const DISPLAY = "'Oswald Variable', Bahnschrift, 'DIN Condensed', 'Arial Narrow', sans-serif"
const SANS = "system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// The plaque paints these ids as gradients; a flat mark takes the one colour that stands for each.
const FLAT = {
  'url(#skull-bone)': '#d9cfae',
  'url(#skull-bronze)': '#8c6a2e',
  'url(#skull-tooth)': '#efe6cf',
  'url(#skull-soot)': '#1a1410',
  'url(#skull-glow)': EMBER,
}
const flat = (paint) => {
  if (!paint?.startsWith('url(')) return paint
  if (!(paint in FLAT)) throw new Error(`render-marks: no flat colour for ${paint}`)
  return FLAT[paint]
}

/**
 * The bounding box of an SVG path made of the commands the skull module writes: absolute M and L, Z, and the
 * relative `a` it uses to draw a circle or ellipse as two semi-arcs on a horizontal diameter. Any other command
 * throws, so a new one in the module cannot be measured wrongly without notice.
 */
export function pathBounds(d) {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g)
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  const add = (x, y) => {
    box.x0 = Math.min(box.x0, x)
    box.y0 = Math.min(box.y0, y)
    box.x1 = Math.max(box.x1, x)
    box.y1 = Math.max(box.y1, y)
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < tokens.length; ) {
    const cmd = tokens[i++]
    if (cmd === 'Z') continue
    if (cmd === 'M' || cmd === 'L') {
      // Every number up to the next letter is a point: "M0 0L1 1" and "M0 0 1 1" both end up at (1, 1).
      while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
        cx = Number(tokens[i++])
        cy = Number(tokens[i++])
        add(cx, cy)
      }
    } else if (cmd === 'a') {
      const [rx, ry, , , , dx, dy] = tokens.slice(i, i + 7).map(Number)
      i += 7
      const mx = cx + dx / 2
      const my = cy + dy / 2
      add(mx - rx, my)
      add(mx + rx, my)
      add(mx, my - ry)
      add(mx, my + ry)
      cx += dx
      cy += dy
    } else {
      throw new Error(`render-marks: cannot measure path command ${cmd}`)
    }
  }
  return box
}

/** The box that holds every op, stroke included. */
function opsBounds(ops) {
  const all = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const op of ops) {
    const b = pathBounds(op.d)
    const half = op.stroke ? (op.sw ?? 1) / 2 : 0
    all.x0 = Math.min(all.x0, b.x0 - half)
    all.y0 = Math.min(all.y0, b.y0 - half)
    all.x1 = Math.max(all.x1, b.x1 + half)
    all.y1 = Math.max(all.y1, b.y1 + half)
  }
  return all
}

/** Scale and offset that centre `box` in a `size` square, its longer side padded by 6% at each end. */
export function fit(box, size, pad = 0.06) {
  const side = Math.max(box.x1 - box.x0, box.y1 - box.y0)
  const scale = size / (side * (1 + 2 * pad))
  return {
    scale,
    tx: size / 2 - ((box.x0 + box.x1) / 2) * scale,
    ty: size / 2 - ((box.y0 + box.y1) / 2) * scale,
  }
}

const n = (v) => Math.round(v * 100) / 100
const attr = (name, value) => (value === undefined ? '' : ` ${name}="${value}"`)

// The plaque dims the ember layers with the volcano's breath (opacity: heat * 0.4); a flat mark holds them at
// the middle of that range.
const EMBER_OPACITY = 0.55

const SKULL_OPS = drakeSkull(5)
const SKULL_BOX = opsBounds(SKULL_OPS)

/** The skull as a <g> that fills a `size` square whose corner sits at (x, y). */
function skullGroup(size, x = 0, y = 0) {
  const { scale, tx, ty } = fit(SKULL_BOX, size)
  const paths = SKULL_OPS.map((op) => {
    const opacity = op.cls === 'skull-ember' ? EMBER_OPACITY : op.opacity
    return (
      `<path d="${op.d}" fill="${flat(op.fill) ?? 'none'}"` +
      attr('stroke', flat(op.stroke)) +
      attr('stroke-width', op.sw) +
      attr('opacity', opacity) +
      '/>'
    )
  })
  return `<g transform="translate(${n(x + tx)} ${n(y + ty)}) scale(${Math.round(scale * 1e5) / 1e5})" stroke-linejoin="round" stroke-linecap="round">${paths.join('')}</g>`
}

/** The favicon: the skull on a full-bleed obsidian square. `size` adds width and height, for rasterising. */
export function skullSvg(size) {
  const dims = size ? ` width="${size}" height="${size}"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"${dims}><rect width="200" height="200" fill="${OBSIDIAN}"/>${skullGroup(200)}</svg>\n`
}

/** The share card: skull left, wordmark right, an ember hairline, the motto under it. */
export function ogSvg() {
  const x = 560
  const w = 580
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">' +
    `<rect width="1200" height="630" fill="${OBSIDIAN}"/>` +
    skullGroup(500, 40, 65) +
    `<text x="${x}" y="318" font-family="${DISPLAY}" font-weight="700" font-size="112" letter-spacing="4" fill="${BONE_TEXT}" textLength="${w}" lengthAdjust="spacingAndGlyphs">SALAMANDERS</text>` +
    `<line x1="${x}" y1="352" x2="${x + w}" y2="352" stroke="${EMBER}" stroke-width="3"/>` +
    `<text x="${x}" y="410" font-family="${SANS}" font-size="26" fill="${PEWTER}" textLength="${w}" lengthAdjust="spacingAndGlyphs">${MOTTO}</text>` +
    '</svg>\n'
  )
}

/** The web app manifest, as JSON text. */
export function manifest() {
  return `${JSON.stringify(
    {
      name: 'Salamanders',
      short_name: 'Salamanders',
      description: MOTTO,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: OBSIDIAN,
      background_color: OBSIDIAN,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  )}\n`
}

/**
 * A function (svg, width, height) -> PNG bytes from whichever rasteriser is already in node_modules (sharp first,
 * then resvg-js), or null. Nothing is installed for this.
 */
function rasteriser(root) {
  const modules = join(root, 'node_modules')
  const need = createRequire(join(root, 'package.json'))
  if (existsSync(join(modules, 'sharp'))) {
    const sharp = need('sharp')
    return (svg, w, h) => sharp(Buffer.from(svg)).resize(w, h).png().toBuffer()
  }
  if (existsSync(join(modules, '@resvg', 'resvg-js'))) {
    const { Resvg } = need('@resvg/resvg-js')
    return (svg, w) => new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng()
  }
  return null
}

export async function main({ root = ROOT, log = console.log } = {}) {
  const pub = join(root, 'public')
  mkdirSync(pub, { recursive: true })
  for (const [name, text] of [
    ['favicon.svg', skullSvg()],
    ['og.svg', ogSvg()],
    ['site.webmanifest', manifest()],
  ]) {
    writeFileSync(join(pub, name), text)
    log(`wrote public/${name}`)
  }

  const raster = rasteriser(root)
  if (!raster) {
    log('PNGs: none rendered (no rasteriser installed); render in Chrome')
    return
  }
  for (const [name, svg, w, h] of [
    ['apple-touch-icon.png', skullSvg(180), 180, 180],
    ['icon-192.png', skullSvg(192), 192, 192],
    ['icon-512.png', skullSvg(512), 512, 512],
    ['og.png', ogSvg(), 1200, 630],
  ]) {
    writeFileSync(join(pub, name), await raster(svg, w, h))
    log(`wrote public/${name}`)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
