import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  BACKUP_KEEP_DAYS,
  OTHER_CLIPS_CAP_BYTES,
  PURGEABLE,
  PURGE_AFTER_DAYS,
  STORAGE_CAP_BYTES,
  capFor,
  clipStatus,
  fits,
} from './galleryPolicy.js'

describe('constants', () => {
  it('carry the decided values', () => {
    expect(STORAGE_CAP_BYTES).toBe(9_000_000_000)
    expect(OTHER_CLIPS_CAP_BYTES).toBe(7_000_000_000)
    expect(PURGE_AFTER_DAYS).toBe(30)
    expect(BACKUP_KEEP_DAYS).toBe(60)
    expect(PURGEABLE).toStrictEqual(['rejected', 'hidden', 'removed'])
  })

  it('leave R2 free-tier headroom above the cap for one more clip at the largest size', () => {
    // 10 GB is R2's free storage in either reading of GB; 100 MiB is the largest clip the poll copies.
    expect(STORAGE_CAP_BYTES + 104_857_600).toBeLessThan(10_000_000_000)
    expect(OTHER_CLIPS_CAP_BYTES).toBeLessThan(STORAGE_CAP_BYTES)
  })

  it('keeps a backup copy longer than the file stays in R2, so the purge only ever takes a backed-up file', () => {
    expect(BACKUP_KEEP_DAYS).toBeGreaterThan(PURGE_AFTER_DAYS)
  })

  it('cannot be changed at run time', () => {
    expect(Object.isFrozen(PURGEABLE)).toBe(true)
  })
})

describe('clipStatus: what a polled clip goes in as', () => {
  it('a #gameplay file or Medal link goes straight on the site', () => {
    expect(clipStatus({ gameplay: true })).toBe('approved')
    expect(clipStatus({ gameplay: true, host: 'medal' })).toBe('approved')
  })

  it('a YouTube or Twitch link waits for review even when tagged: nothing says the poster made it', () => {
    expect(clipStatus({ gameplay: true, host: 'youtube' })).toBe('pending')
    expect(clipStatus({ gameplay: true, host: 'twitch' })).toBe('pending')
  })

  it('anything untagged waits for review', () => {
    for (const host of [undefined, 'medal', 'youtube', 'twitch']) expect(clipStatus({ gameplay: false, host })).toBe('pending')
  })

  it('only gameplay === true counts as tagged: a truthy stand-in is not a tag', () => {
    for (const gameplay of [1, 'true', 'yes', {}, [], undefined, null]) expect(clipStatus({ gameplay })).toBe('pending')
  })

  it('a host it does not know is not a reason to skip review', () => {
    expect(clipStatus({ gameplay: true, host: 'vimeo' })).toBe('pending')
    expect(clipStatus({ gameplay: true, host: '' })).toBe('pending')
  })

  it('is approved for exactly the tagged files and tagged Medal links, over any row', () => {
    const host = fc.constantFrom(undefined, 'medal', 'youtube', 'twitch', 'vimeo', '')
    fc.assert(
      fc.property(fc.boolean(), host, (gameplay, h) => {
        const expected = gameplay && (h === undefined || h === 'medal') ? 'approved' : 'pending'
        expect(clipStatus({ gameplay, host: h })).toBe(expected)
      }),
    )
  })
})

describe('capFor: the most the store may hold once this file is in', () => {
  it('a #gameplay clip and art may use the whole cap; any other clip stops at the lower one', () => {
    expect(capFor({ kind: 'clip', gameplay: true })).toBe(STORAGE_CAP_BYTES)
    expect(capFor({ kind: 'art' })).toBe(STORAGE_CAP_BYTES)
    expect(capFor({ kind: 'clip', gameplay: false })).toBe(OTHER_CLIPS_CAP_BYTES)
    expect(capFor({ kind: 'clip' })).toBe(OTHER_CLIPS_CAP_BYTES)
    expect(capFor({ kind: 'clip', gameplay: 'true' })).toBe(OTHER_CLIPS_CAP_BYTES)
  })

  it('refuses a kind it does not know', () => {
    for (const kind of ['', 'Clip', 'video', undefined, null]) {
      expect(() => capFor({ kind })).toThrow(TypeError)
      expect(() => capFor({ kind })).toThrow(`capFor: not a gallery kind: ${String(kind)}`)
    }
  })
})

describe('fits: whether a file of `bytes` fits under `cap` with `stored` already held', () => {
  it('fits up to and including the cap, and not one byte past it', () => {
    expect(fits(0, 0, 0)).toBe(true)
    expect(fits(5, 5, 10)).toBe(true)
    expect(fits(5, 6, 10)).toBe(false)
    expect(fits(10, 0, 10)).toBe(true)
    expect(fits(11, 0, 10)).toBe(false)
    expect(fits(STORAGE_CAP_BYTES - 1, 1, STORAGE_CAP_BYTES)).toBe(true)
    expect(fits(STORAGE_CAP_BYTES - 1, 2, STORAGE_CAP_BYTES)).toBe(false)
  })

  it('agrees with stored + bytes <= cap over the whole domain', () => {
    const n = fc.integer({ min: 0, max: 20_000_000_000 })
    fc.assert(
      fc.property(n, n, n, (stored, bytes, cap) => {
        expect(fits(stored, bytes, cap)).toBe(stored + bytes <= cap)
      }),
    )
  })

  it('refuses a value that is not a finite number of bytes, naming which', () => {
    for (const bad of [-1, -0.5, NaN, Infinity, -Infinity, '5', null, undefined, 5n]) {
      expect(() => fits(bad, 0, 10)).toThrow(/stored/)
      expect(() => fits(0, bad, 10)).toThrow(/bytes/)
      expect(() => fits(0, 0, bad)).toThrow(/cap/)
      expect(() => fits(bad, 0, 10)).toThrow(TypeError)
    }
  })

  it('takes zero and fractions: a size Discord reports is not always whole', () => {
    expect(fits(0, 0.5, 1)).toBe(true)
    expect(fits(0.5, 0.6, 1)).toBe(false)
  })
})
