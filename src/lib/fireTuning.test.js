import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as tuning from './fireTuning'

describe('the title\'s fire', () => {
  it('is all this module holds: the numbers the hero\'s burning title is drawn with', () => {
    expect(Object.keys(tuning).sort()).toEqual(['DEFAULTS', 'fireTuning'])
    expect(tuning.DEFAULTS).toEqual({ text: { pixel: 1, speed: 1.45, maxHeight: 0.8, variation: 0.95, intensity: 1.3, base: 0.35 } })
    expect(tuning.fireTuning.text).toEqual(tuning.DEFAULTS.text)
  })

  it('keeps its own copy, so nothing that changes it changes the defaults', () => {
    expect(tuning.fireTuning.text).not.toBe(tuning.DEFAULTS.text)
  })
})

describe('the dev tuner', () => {
  // It was a slider panel (the URL switch tune=1) for the old volcano and the title. The look is settled and it is
  // gone: this keeps it from coming back by halves.
  const src = fileURLToPath(new URL('..', import.meta.url))
  it('is gone, with everything that switched it on', () => {
    expect(existsSync(join(src, 'components/FireTuner.vue'))).toBe(false)
    const files = readdirSync(src, { recursive: true })
      .map((f) => String(f).replaceAll('\\', '/'))
      .filter((f) => /\.(vue|js)$/.test(f) && !/\.test\.js$/.test(f))
    const offenders = files.filter((f) => /FireTuner|tuningEnabled|sal-tune|[?&]tune=/.test(readFileSync(join(src, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
