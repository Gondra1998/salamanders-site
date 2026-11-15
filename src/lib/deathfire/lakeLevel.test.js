import { describe, expect, it } from 'vitest'
import { SPILL_SECS, createLakeLevel } from './lakeLevel.js'

/** Let `secs` seconds pass a second at a time and hand back where the lake stands. */
function after(lake, secs, stirred = 0, how = {}) {
  let last = null
  for (let i = 0; i < secs; i++) last = lake.step(1, stirred, how)
  return last
}

describe('the lake\'s level', () => {
  it('starts a third full and takes five minutes to fill, with the mountain at rest', () => {
    const lake = createLakeLevel()
    expect(lake.step(0, 0).level).toBeCloseTo(0.3, 9)
    expect(after(lake, 150).level).toBeCloseTo(0.65, 6)
    expect(after(lake, 150).level).toBe(1)
  })

  it('fills twice as fast when the mountain is as stirred as it gets', () => {
    const lake = createLakeLevel()
    expect(after(lake, 149, 1).level).toBeLessThan(1)
    expect(after(lake, 1, 1).level).toBe(1)
  })

  it('takes the same time from wherever it starts', () => {
    const lake = createLakeLevel(0.5)
    expect(lake.step(0, 0, { start: 0.5 }).level).toBeCloseTo(0.5, 9)
    expect(after(lake, 150, 0, { start: 0.5 }).level).toBeCloseTo(0.75, 6)
    expect(after(lake, 150, 0, { start: 0.5 }).level).toBe(1)
  })

  it('takes the time it is given', () => {
    const lake = createLakeLevel()
    expect(after(lake, 60, 0, { fillMinutes: 2 }).level).toBeCloseTo(0.65, 6)
  })

  it.each([0, NaN, -3])('treats a fill time of %s as half a minute, the shortest there is', (fillMinutes) => {
    const lake = createLakeLevel()
    expect(after(lake, 15, 0, { fillMinutes }).level).toBeCloseTo(0.65, 6)
    expect(after(lake, 15, 0, { fillMinutes }).level).toBe(1)
  })
})

describe('the spill', () => {
  it('is nothing until the lake is full', () => {
    const lake = createLakeLevel()
    expect(after(lake, 299).spill).toBe(0)
  })

  it('builds over a minute and a half once it is, and stops at its full', () => {
    const lake = createLakeLevel()
    after(lake, 300)
    expect(SPILL_SECS).toBe(90)
    expect(after(lake, 45).spill).toBeCloseTo(0.5, 6)
    expect(after(lake, 45).spill).toBe(1)
    expect(after(lake, 30)).toEqual({ level: 1, spill: 1 })
  })

  it('builds faster when the mountain is stirred', () => {
    const lake = createLakeLevel()
    after(lake, 300)
    expect(after(lake, 45, 1).spill).toBe(1)
  })
})
