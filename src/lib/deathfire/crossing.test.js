import { describe, expect, it } from 'vitest'
import { CROSSING_KEY, CYCLE_MS, createSky, crossingBegan } from './crossing.js'
import { trialLength } from './trial.js'

const MIN = 60000
const START = 1_800_000_000_000 // the clock when each test begins

/** A sky on a clock the test moves, with a browser's storage stood in for by a map. */
function sky({ remembered, storage, random = 0.9, hold = null, fresh = false } = {}) {
  let clock = START
  const kept = new Map()
  if (remembered !== undefined) kept.set(CROSSING_KEY, String(remembered))
  const store = storage !== undefined ? storage : { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)) }
  const it = createSky({ now: () => clock, storage: store, random: () => random, hold, fresh })
  return {
    kept,
    startTrial: (tier) => it.startTrial(tier),
    endTrial: () => it.endTrial(),
    jump: (ms) => (clock += ms),
    /** Let `secs` seconds pass, a step at a time, and hand back every step's answer. */
    run(secs, { step = 1, live = true } = {}) {
      const out = []
      for (let i = 0; i < Math.round(secs / step); i++) {
        clock += step * 1000
        out.push(it.step(step, live))
      }
      return out
    },
  }
}

describe('when a crossing began', () => {
  const store = (value) => {
    const kept = new Map(value === undefined ? [] : [[CROSSING_KEY, value]])
    return { kept, getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)) }
  }

  it('is now, on a first visit, and is remembered', () => {
    const s = store()
    expect(crossingBegan(START, s)).toBe(START)
    expect(s.kept.get(CROSSING_KEY)).toBe(String(START))
  })

  it('is the remembered time while that crossing is still going on', () => {
    const s = store(String(START - 3 * MIN))
    expect(crossingBegan(START, s)).toBe(START - 3 * MIN)
    expect(s.kept.get(CROSSING_KEY)).toBe(String(START - 3 * MIN))
  })

  it('is now when asked to start afresh, whatever is remembered', () => {
    const s = store(String(START - 3 * MIN))
    expect(crossingBegan(START, s, true)).toBe(START)
    expect(s.kept.get(CROSSING_KEY)).toBe(String(START))
  })
})

describe('the visitor\'s own crossing', () => {
  it('begins on a first visit, with the moon at the start of its way', () => {
    const s = sky()
    expect(s.run(1)[0].phase).toBeLessThan(0.002)
    expect(Number(s.kept.get(CROSSING_KEY))).toBe(START)
  })

  it('goes on, on another page inside the 15 minutes', () => {
    const s = sky({ remembered: START - 3 * MIN })
    expect(s.run(1)[0].phase).toBeCloseTo(0.2 + 1 / 900, 6)
    expect(Number(s.kept.get(CROSSING_KEY))).toBe(START - 3 * MIN)
  })

  it('is a new one after 20 minutes away', () => {
    const s = sky({ remembered: START - 20 * MIN })
    expect(s.run(1)[0].phase).toBeLessThan(0.002)
    expect(Number(s.kept.get(CROSSING_KEY))).toBe(START)
  })

  it('is a new one when the remembered time is in the future', () => {
    const s = sky({ remembered: START + 5 * MIN })
    expect(s.run(1)[0].phase).toBeLessThan(0.002)
    expect(Number(s.kept.get(CROSSING_KEY))).toBe(START)
  })

  it.each(['rubbish', '', 'NaN'])('is a new one when what is remembered is rubbish (%j)', (junk) => {
    const s = sky({ remembered: junk })
    expect(s.run(1)[0].phase).toBeLessThan(0.002)
    expect(Number(s.kept.get(CROSSING_KEY))).toBe(START)
  })

  it.each([
    ['there is no storage', null],
    ['reading it throws', { getItem: () => { throw new Error('denied') }, setItem: () => {} }],
    ['writing it throws', { getItem: () => null, setItem: () => { throw new Error('full') } }],
  ])('still begins, and throws nothing, when %s', (_, storage) => {
    const s = sky({ storage })
    const steps = s.run(20)
    expect(steps[0].phase).toBeLessThan(0.002)
    expect(steps.every((a) => a.trial === 0)).toBe(true)
  })

  it('runs on into the next crossing on a page left open, and remembers that one', () => {
    const s = sky({ remembered: START - 14.9 * MIN })
    const steps = s.run(12)
    expect(steps.at(-1).phase).toBeLessThan(0.01)
    expect(Number(s.kept.get(CROSSING_KEY))).toBe(START - 14.9 * MIN + CYCLE_MS)
  })

  it('holds the moon where it is put by hand, and brings no trial', () => {
    const s = sky({ hold: 0.5 })
    const steps = s.run(10)
    expect(steps.every((a) => a.phase === 0.5 && a.trial === 0)).toBe(true)
    expect(s.kept.has(CROSSING_KEY)).toBe(false) // the clock is not read, nor a crossing begun
  })
})

describe('the Time of Trial', () => {
  it('comes when the closest pass is seen to happen', () => {
    const s = sky({ remembered: START - 7.5 * MIN + 4000 })
    const steps = s.run(12)
    expect(steps[0].trial).toBe(0)
    expect(steps.at(-1).trial).toBeGreaterThan(0)
    expect(steps.at(-1).tier).toBe(1)
  })

  it('does not come to a page that is not live', () => {
    const s = sky({ remembered: START - 7.5 * MIN + 4000 })
    expect(s.run(20, { live: false }).every((a) => a.trial === 0)).toBe(true)
  })

  it('does not meet a page opened in the middle of one: it opens calm', () => {
    const s = sky({ remembered: START - 7.7 * MIN })
    const steps = s.run(20)
    expect(steps[0].phase).toBeGreaterThan(0.5)
    expect(steps.every((a) => a.trial === 0)).toBe(true)
  })

  it('does not come for a pass that happened while the tab was away', () => {
    const s = sky({ remembered: START - 4.5 * MIN })
    expect(s.run(1)[0].phase).toBeCloseTo(0.3, 2)
    s.jump(6 * MIN)
    const steps = s.run(10)
    expect(steps[0].phase).toBeGreaterThan(0.56)
    expect(steps.every((a) => a.trial === 0)).toBe(true)
  })

  it.each([
    [0.04, 3],
    [0.2, 2],
    [0.9, 1],
  ])('is drawn by chance (a roll of %f gives tier %i)', (random, tier) => {
    const s = sky({ remembered: START - 7.5 * MIN + 2000, random })
    expect(s.run(5).at(-1).tier).toBe(tier)
  })

  it('is the moon\'s clock while it lasts', () => {
    const s = sky({ remembered: START - 3 * MIN })
    const before = s.run(1)[0].phase
    s.startTrial(1)
    s.jump(5 * MIN) // the wall clock leaps; the trial does not care
    const [a, b] = s.run(2)
    expect(a.phase).toBeCloseTo(before, 9)
    expect(b.phase - a.phase).toBeCloseTo(1 / 900, 9)
  })

  it('can be started by hand with the moon held, and is of the tier asked for', () => {
    const s = sky({ hold: 0.5 })
    s.run(3)
    s.startTrial(2)
    const steps = s.run(10)
    expect(steps.at(-1).tier).toBe(2)
    expect(steps.at(-1).trial).toBeCloseTo(0.8, 6)
  })

  it('ends, and the moon goes on by the visitor\'s clock', () => {
    const s = sky({ remembered: START - 3 * MIN })
    s.run(1)
    s.startTrial(1)
    const steps = s.run(trialLength(1) + 2)
    expect(steps.some((a) => a.trial > 0.5)).toBe(true)
    expect(steps.at(-1).trial).toBe(0)
    expect(steps.at(-1).phase).toBeCloseTo((3 * MIN + (trialLength(1) + 3) * 1000) / CYCLE_MS, 6)
  })

  it('can be ended at once', () => {
    const s = sky({ remembered: START - 3 * MIN })
    s.startTrial(3)
    expect(s.run(10).at(-1).trial).toBe(1)
    s.endTrial()
    expect(s.run(1)[0].trial).toBe(0)
  })

  it('keeps throwing blasts at its height: one every 1.3 seconds in a cataclysm', () => {
    const s = sky({ remembered: START - 3 * MIN })
    s.startTrial(3)
    s.run(10, { step: 0.1 }) // into the hold, at full strength
    const at = []
    s.run(13, { step: 0.1 }).forEach((a, i) => a.blast && at.push(i / 10))
    expect(at.length).toBeGreaterThanOrEqual(9)
    expect(at.length).toBeLessThanOrEqual(11)
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeCloseTo(1.3, 0)
  })

  it('throws none before it has risen, nor after it has gone', () => {
    const s = sky({ remembered: START - 3 * MIN })
    s.startTrial(1)
    expect(s.run(1, { step: 0.1 }).some((a) => a.blast)).toBe(false) // under a fifth of the way up
    s.run(trialLength(1))
    expect(s.run(10, { step: 0.1 }).some((a) => a.blast)).toBe(false)
  })
})
