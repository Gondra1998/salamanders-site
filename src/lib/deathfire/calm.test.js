// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { calmFactor, measureCalm } from './calm.js'

describe('how calm the lava must be at a point', () => {
  const box = [{ l: 100, t: 100, r: 300, b: 140 }]

  it('is at its calmest under text', () => {
    expect(calmFactor(box, 200, 120)).toBeCloseTo(0.1, 9)
  })

  it('is not calmed at all 48 px away or more', () => {
    expect(calmFactor(box, 348, 120)).toBe(1)
    expect(calmFactor(box, 200, 400)).toBe(1)
  })

  it('eases between the two', () => {
    expect(calmFactor(box, 324, 120)).toBeCloseTo(0.55, 6)
    expect(calmFactor(box, 200, 76)).toBeCloseTo(0.55, 6)
  })

  it('takes the nearest text when there is more than one', () => {
    const two = [...box, { l: 330, t: 100, r: 500, b: 140 }]
    expect(calmFactor(two, 324, 120)).toBeLessThan(0.2)
  })

  it('is not calmed where there is no text', () => {
    expect(calmFactor([], 200, 120)).toBe(1)
  })
})

describe('measuring the page\'s text', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })
  /** An element with a box of its own, as a browser would lay it out (jsdom lays nothing out). */
  function boxed(html, rect, parent = document.body) {
    const holder = document.createElement('div')
    holder.innerHTML = html
    const el = holder.firstElementChild
    const full = { left: rect.l, top: rect.t, right: rect.r, bottom: rect.b, width: rect.r - rect.l, height: rect.b - rect.t }
    el.getBoundingClientRect = () => full
    parent.appendChild(el)
    return el
  }
  const win = { innerWidth: 1000, innerHeight: 800, scrollY: 40 }

  it('takes the boxes of controls, in the window\'s own px, and notes how far the page was scrolled', () => {
    boxed('<button>Join</button>', { l: 100, t: 200, r: 260, b: 244 })
    expect(measureCalm(document, win)).toEqual({ rects: [{ l: 100, t: 200, r: 260, b: 244 }], scrollY: 40, navBottom: 0 })
  })

  it('leaves out what is too small to read, what is off the window, and whole panels', () => {
    boxed('<button>.</button>', { l: 0, t: 0, r: 6, b: 6 })
    boxed('<button>below</button>', { l: 100, t: 900, r: 260, b: 944 })
    boxed('<a href="#">a whole card</a>', { l: 0, t: 0, r: 900, b: 700 })
    expect(measureCalm(document, win).rects).toEqual([])
  })

  it('leaves out anything inside the drawing itself', () => {
    const host = document.createElement('div')
    host.className = 'deathfire'
    document.body.appendChild(host)
    boxed('<button>x</button>', { l: 100, t: 200, r: 260, b: 244 }, host)
    expect(measureCalm(document, win).rects).toEqual([])
  })

  it('leaves out the hero\'s own text when the mountain stands below it', () => {
    const hero = document.createElement('section')
    hero.className = 'hero'
    document.body.appendChild(hero)
    boxed('<button>Join</button>', { l: 100, t: 200, r: 260, b: 244 }, hero)
    boxed('<button>Lower down</button>', { l: 100, t: 600, r: 260, b: 644 })
    expect(measureCalm(document, win).rects).toHaveLength(2)
    expect(measureCalm(document, win, { stacked: true }).rects).toEqual([{ l: 100, t: 600, r: 260, b: 644 }])
  })

  it('stops at 80 boxes', () => {
    for (let i = 0; i < 100; i++) boxed('<button>x</button>', { l: 10, t: 10 + i, r: 60, b: 40 + i })
    expect(measureCalm(document, win).rects).toHaveLength(80)
  })

  it('finds where the nav bar ends', () => {
    boxed('<header class="nav"></header>', { l: 0, t: 0, r: 1000, b: 61 })
    expect(measureCalm(document, win).navBottom).toBe(61)
  })
})
