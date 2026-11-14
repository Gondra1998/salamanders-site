import { describe, expect, it } from 'vitest'
import { PHONE_MAX, compose } from './compose.js'
import { LOOK } from './look.js'

const desktop = (more = {}) => compose({ w: 1596, h: 738, dpr: 1.5, path: '/', shows: true, ...more })
const phone = (more = {}) => compose({ w: 390, h: 844, dpr: 2, path: '/', shows: true, ...more })

describe('the approved look', () => {
  it('holds the drawing\'s numbers, and cannot be changed', () => {
    expect(LOOK).toEqual({
      peakH: 0.72, baseW: 1.35, crown: 1.25, rock: 1, columns: 1, planes: 0.55,
      ranges: 1, rangeH: 1, haze: 0.5,
      lavaTint: 0.5, lavaRed: 0.5, lavaHeat: 1.12,
      plume: 1.3, embers: 2.3, fog: 1,
      lake: 1, lakeCrust: 0.3, lakeHeat: 1,
      lakeStart: 0.3, lakeFill: 5, ash: 460,
    })
    expect(Object.keys(LOOK)).toHaveLength(21)
    expect(Object.isFrozen(LOOK)).toBe(true)
  })
})

describe('what to build for a window and a page', () => {
  it('on the home page of a desktop: the peak 14% across, the breach facing right, as it stands', () => {
    const c = desktop()
    expect(c.kind).toBe('desktop')
    expect(c.options).toEqual({ dpr: 1.5, phoneMax: 768, flip: true, faceX: 0.14, tune: LOOK })
    expect(c.options.tune).toBe(LOOK)
    expect(c.mirror).toBe(false)
    expect(c.quiet).toBe(false)
  })

  it('on another page of a desktop: the same scene, mirrored and quiet, with nothing to build again', () => {
    const c = desktop({ path: '/builds' })
    expect(c.mirror).toBe(true)
    expect(c.quiet).toBe(true)
    expect(c.options).toEqual(desktop().options)
    expect(c.key).toBe(desktop().key)
  })

  it('on the home page of a phone: the scene\'s own place for the peak, and the mountain under the hero\'s text', () => {
    const c = phone({ hero: { text: 361.6 } })
    expect(c.kind).toBe('phone')
    expect(c.options).toEqual({ dpr: 2, phoneMax: 768, flip: true, textBottom: 361.6, tune: LOOK })
    expect(c.mirror).toBe(false)
    expect(c.quiet).toBe(false)
  })

  it('on another page of a phone: never mirrored, quiet, and the home page\'s mountain', () => {
    const c = phone({ path: '/builds' })
    expect(c.mirror).toBe(false)
    expect(c.quiet).toBe(true)
    // no hero text was measured: the text edge is where the home page's falls on a phone of this height
    expect(c.options.textBottom).toBe(352)
    expect(c.key).toBe(phone({ hero: { text: 352 } }).key)
  })

  it('builds again when the hero\'s text has moved by a pixel, and not for less', () => {
    const at = (text) => phone({ hero: { text } }).key
    expect(at(352.3)).toBe(at(352))
    expect(at(353)).not.toBe(at(352))
  })

  it('draws the phone\'s mountain at 768 px wide, and the desktop\'s from 769', () => {
    expect(PHONE_MAX).toBe(768)
    expect(compose({ w: 768, h: 1024, dpr: 2, path: '/', shows: true }).kind).toBe('phone')
    expect(compose({ w: 769, h: 1024, dpr: 2, path: '/', shows: true }).kind).toBe('desktop')
  })

  it('builds again for another size or another pixel ratio', () => {
    expect(desktop({ w: 1600 }).key).not.toBe(desktop().key)
    expect(desktop({ h: 740 }).key).not.toBe(desktop().key)
    expect(desktop({ dpr: 1 }).key).not.toBe(desktop().key)
  })

  it('builds nothing where the mountain is not shown, or the window has no size', () => {
    expect(desktop({ shows: false })).toBeNull()
    expect(desktop({ w: NaN })).toBeNull()
    expect(desktop({ h: Infinity })).toBeNull()
    expect(desktop({ h: 1 })).toBeNull()
    expect(desktop({ w: 0 })).toBeNull()
  })
})
