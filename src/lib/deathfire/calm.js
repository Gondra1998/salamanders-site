// The calm band. The drawing sits behind the page, so lava can run behind text and make it hard to read. Where
// reading text lies over the lava, the lava steps aside (the river roofs over, lights dim). This measures where the
// page's text is, and answers how calm the drawing must be at a point.
import { sm } from './noise.js'

// what counts as reading text: headings, paragraphs, controls
const TEXT = 'h1, h2, h3, p, li, label, button, a, dt, dd, input, textarea, select, td'
const CONTROL = /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/
const MOST = 80 // boxes: a page of small text has hundreds, and the nearest few dozen in the window are what matter
const REACH = 48 // px over which the calm eases out round a box

/**
 * Where the page's reading text is, as boxes in the window's own px.
 * `stacked`: the mountain stands below the hero's text (phones), so that text is not over the lava and is left out.
 * Returns the boxes, how far the page was scrolled when they were measured (they move with it), and where the nav
 * bar ends.
 */
export function measureCalm(doc, win, { stacked = false } = {}) {
  const w = win.innerWidth
  const h = win.innerHeight
  const rects = []
  const range = doc.createRange()
  scan: for (const el of doc.querySelectorAll(TEXT)) {
    if (el.closest('.deathfire')) continue
    if (stacked && el.closest('.hero')) continue
    // controls have a box of their own; for text, take the line boxes of the words themselves, since a centred line
    // sits in a block as wide as its container and the lava beside the words is not in their way
    let boxes
    if (CONTROL.test(el.tagName)) boxes = [el.getBoundingClientRect()]
    else {
      range.selectNodeContents(el)
      boxes = range.getClientRects ? range.getClientRects() : []
    }
    for (const r of boxes) {
      if (rects.length >= MOST) break scan
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue
      if (r.width * r.height > w * h * 0.2) continue // a whole card or panel: it has its own backing
      rects.push({ l: r.left, t: r.top, r: r.right, b: r.bottom })
    }
  }
  const nav = doc.querySelector('header.nav')
  return { rects, scrollY: win.scrollY, navBottom: nav ? nav.getBoundingClientRect().bottom : 0 }
}

/** How much of itself the drawing keeps at a point: 1 in the clear, 0.1 under text, easing out over 48 px. */
export function calmFactor(rects, x, y) {
  let k = 1
  for (const r of rects) {
    const d = Math.hypot(Math.max(r.l - x, 0, x - r.r), Math.max(r.t - y, 0, y - r.b))
    if (d < REACH) k = Math.min(k, 0.1 + 0.9 * sm(d / REACH))
  }
  return k
}
