import { describe, expect, it } from 'vitest'
import { excitement, pickTier, trialLength, trialLevel } from './trial.js'

describe('the Time of Trial', () => {
  it('lasts a minute, and longer the greater it is', () => {
    expect(trialLength(1)).toBe(60)
    expect(trialLength(2)).toBe(78)
    expect(trialLength(3)).toBe(96)
  })

  it('eases in over six seconds, holds, and lets go slowly', () => {
    expect(trialLevel(0, 1)).toBe(0)
    expect(trialLevel(3, 1)).toBeCloseTo(0.275, 6)
    expect(trialLevel(6, 1)).toBeCloseTo(0.55, 6)
    expect(trialLevel(19.9, 1)).toBeCloseTo(0.55, 6)
    expect(trialLevel(40, 1)).toBeCloseTo(0.275, 6)
    expect(trialLevel(60, 1)).toBeCloseTo(0, 6)
  })

  it('rages harder the greater it is', () => {
    expect(trialLevel(10, 2)).toBeCloseTo(0.8, 6)
    expect(trialLevel(10, 3)).toBe(1)
  })

  it('is drawn by chance: one in twenty a cataclysm, a quarter a great trial, the rest a trial', () => {
    expect(pickTier(0.049)).toBe(3)
    expect(pickTier(0.05)).toBe(2)
    expect(pickTier(0.299)).toBe(2)
    expect(pickTier(0.3)).toBe(1)
    expect(pickTier(0.99)).toBe(1)
  })
})

describe('how stirred the mountain is', () => {
  it('is nothing for the outer half of the moon\'s crossing', () => {
    expect(excitement(0.1)).toBe(0)
    expect(excitement(0.25)).toBeLessThan(0.01)
  })

  it('rises to a half at the closest pass', () => {
    expect(excitement(0.5)).toBeCloseTo(0.5, 6)
  })

  it('takes a trial on top, and never passes one', () => {
    expect(excitement(0.5, 0.3)).toBeCloseTo(0.8, 6)
    expect(excitement(0.5, 1)).toBe(1)
  })
})
