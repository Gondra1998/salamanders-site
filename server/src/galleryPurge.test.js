import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { parseManifest, purgeBackedUp } from './galleryPurge.js'
import { PURGE_AFTER_DAYS } from './galleryPolicy.js'

const line = (where, size, key) => `${where}\t${size}\t${key}`
const manifest = (...lines) => parseManifest(lines.join('\n') + '\n')

describe('parseManifest', () => {
  it('reads what R2 holds and what the backup holds, key → size', () => {
    const m = manifest(line('r2', 10, 'clips/1/2.mp4'), line('backup', 10, 'clips/1/2.mp4'), line('backup', 7, 'art/3.png'))
    expect([...m.r2]).toEqual([['clips/1/2.mp4', 10]])
    expect([...m.backup]).toEqual([
      ['clips/1/2.mp4', 10],
      ['art/3.png', 7],
    ])
  })

  it('takes an empty manifest (an empty bucket and backup), with or without a final newline', () => {
    for (const text of ['', '\n']) {
      const m = parseManifest(text)
      expect(m.r2.size).toBe(0)
      expect(m.backup.size).toBe(0)
    }
    expect([...parseManifest(line('r2', 1, 'k')).r2]).toEqual([['k', 1]])
  })

  it('takes a key with spaces and unicode, and a size of 0', () => {
    expect([...manifest(line('r2', 0, 'art/a b/é.png')).r2]).toEqual([['art/a b/é.png', 0]])
  })

  it.each([
    ['an unknown source', line('disk', 1, 'k'), 'manifest line 1: expected r2 or backup, a size and a key'],
    ['a missing key', 'r2\t1\t', 'manifest line 1: expected r2 or backup, a size and a key'],
    ['too few fields', 'r2\t1', 'manifest line 1: expected r2 or backup, a size and a key'],
    ['a tab in the key', 'r2\t1\ta\tb', 'manifest line 1: expected r2 or backup, a size and a key'],
    ['a negative size', line('r2', -1, 'k'), 'manifest line 1: the size is not a whole number of bytes'],
    ['a fractional size', line('r2', 1.5, 'k'), 'manifest line 1: the size is not a whole number of bytes'],
    ['an empty size', line('r2', '', 'k'), 'manifest line 1: the size is not a whole number of bytes'],
    ['a size with a sign', line('r2', '+1', 'k'), 'manifest line 1: the size is not a whole number of bytes'],
    ['a size in hex', line('r2', '0x1', 'k'), 'manifest line 1: the size is not a whole number of bytes'],
    ['a size past 2^53', line('r2', '9007199254740993', 'k'), 'manifest line 1: the size is not a whole number of bytes'],
    ['a blank line inside', `${line('r2', 1, 'a')}\n\n${line('r2', 1, 'b')}`, 'manifest line 2: expected r2 or backup, a size and a key'],
    ['a key twice from one source', `${line('r2', 1, 'a')}\n${line('r2', 1, 'a')}`, 'manifest line 2: r2 lists this key twice'],
    ['a carriage return', `${line('r2', 1, 'a')}\r\n`, 'manifest line 1: expected r2 or backup, a size and a key'],
  ])('refuses the whole manifest for %s, naming the line and never the key', (_, text, message) => {
    expect(() => parseManifest(text)).toThrow(message)
  })

  it('refuses what is not text', () => {
    for (const bad of [null, undefined, 7, Buffer.from('r2\t1\tk')]) expect(() => parseManifest(bad)).toThrow('manifest: not text')
  })

  it('reads back exactly the objects it was given, for any listing', () => {
    const key = fc.stringMatching(/^[a-z0-9/._ -]{1,40}$/).filter((k) => k.trim() !== '')
    const listing = fc.uniqueArray(fc.tuple(key, fc.nat({ max: 1e12 })), { selector: ([k]) => k, maxLength: 20 })
    fc.assert(
      fc.property(listing, listing, (inR2, inBackup) => {
        const text = [...inR2.map(([k, n]) => line('r2', n, k)), ...inBackup.map(([k, n]) => line('backup', n, k))].join('\n')
        const m = parseManifest(text)
        expect([...m.r2]).toEqual(inR2)
        expect([...m.backup]).toEqual(inBackup)
      }),
    )
  })
})

/**
 * The store's purge contract in memory: purgeFile re-checks the item, then removes and marks it; erasures are the
 * noted keys, dropErasure takes one off, expiredKeys are the files of items taken down 60 days ago.
 */
function fakeStore(candidates, { stillDue = () => true, erasures = [], expired = [] } = {}) {
  const s = {
    asked: [],
    marked: [],
    notes: [...erasures],
    async erasures() {
      return [...s.notes]
    },
    async dropErasure(key) {
      s.notes = s.notes.filter((k) => k !== key)
    },
    async expiredKeys() {
      return [...expired]
    },
    async purgeCandidates({ days }) {
      s.asked.push(days)
      return candidates
    },
    async purgeFile(id, remove) {
      const c = candidates.find((x) => String(x.id) === id)
      if (!c || !stillDue(c)) return false
      await remove(c.r2_key)
      s.marked.push(id)
      return true
    },
  }
  return s
}

function fakeR2({ fail = null } = {}) {
  const r2 = {
    removed: [],
    async remove(key) {
      if (fail) throw fail
      r2.removed.push(key)
    },
  }
  return r2
}

const item = (id, r2_key, bytes = '10') => ({ id, r2_key, bytes })

describe('purgeBackedUp', () => {
  it('asks only for items purgeable for the policy days', async () => {
    const store = fakeStore([])
    await purgeBackedUp({ store, r2: fakeR2(), manifest: manifest() })
    expect(store.asked).toEqual([PURGE_AFTER_DAYS])
  })

  it('removes a file the backup holds at the size R2 holds it, and marks it', async () => {
    const store = fakeStore([item(4, 'clips/1/2.mp4')])
    const r2 = fakeR2()
    const out = await purgeBackedUp({ store, r2, manifest: manifest(line('r2', 500, 'clips/1/2.mp4'), line('backup', 500, 'clips/1/2.mp4')) })
    expect(r2.removed).toEqual(['clips/1/2.mp4'])
    expect(store.marked).toEqual(['4'])
    expect(out).toEqual({ candidates: 1, purged: 1, gone: 0, waiting: 0, changed: 0, freedBytes: 500, erased: 0, cleared: 0, expire: [] })
  })

  it('leaves a file the backup does not hold yet, or holds at another size, for a later night', async () => {
    const store = fakeStore([item(1, 'a'), item(2, 'b')])
    const r2 = fakeR2()
    const out = await purgeBackedUp({
      store,
      r2,
      manifest: manifest(line('r2', 5, 'a'), line('r2', 5, 'b'), line('backup', 4, 'b')),
    })
    expect(r2.removed).toEqual([])
    expect(store.marked).toEqual([])
    expect(out).toEqual({ candidates: 2, purged: 0, gone: 0, waiting: 2, changed: 0, freedBytes: 0, erased: 0, cleared: 0, expire: [] })
  })

  it('removes and marks a file the backup holds that R2 no longer lists: removing it again is harmless', async () => {
    const store = fakeStore([item(3, 'art/3.png')])
    const r2 = fakeR2()
    const out = await purgeBackedUp({ store, r2, manifest: manifest(line('backup', 7, 'art/3.png')) })
    expect(r2.removed).toEqual(['art/3.png'])
    expect(store.marked).toEqual(['3'])
    expect(out).toEqual({ candidates: 1, purged: 1, gone: 0, waiting: 0, changed: 0, freedBytes: 0, erased: 0, cleared: 0, expire: [] })
  })

  it('marks a file in neither place without asking R2 to remove it: an upload that never landed holds no space', async () => {
    const store = fakeStore([item(9, 'art/9.png')])
    const r2 = fakeR2({ fail: new Error('must not be called') })
    const out = await purgeBackedUp({ store, r2, manifest: manifest() })
    expect(store.marked).toEqual(['9'])
    expect(out).toEqual({ candidates: 1, purged: 0, gone: 1, waiting: 0, changed: 0, freedBytes: 0, erased: 0, cleared: 0, expire: [] })
  })

  it('counts an item that stopped qualifying meanwhile (approved again, say) and leaves its file', async () => {
    const store = fakeStore([item(5, 'k')], { stillDue: () => false })
    const r2 = fakeR2()
    const out = await purgeBackedUp({ store, r2, manifest: manifest(line('r2', 1, 'k'), line('backup', 1, 'k')) })
    expect(r2.removed).toEqual([])
    expect(out).toEqual({ candidates: 1, purged: 0, gone: 0, waiting: 0, changed: 1, freedBytes: 0, erased: 0, cleared: 0, expire: [] })
  })

  it('the same for one in neither place', async () => {
    const store = fakeStore([item(5, 'k')], { stillDue: () => false })
    expect(await purgeBackedUp({ store, r2: fakeR2(), manifest: manifest() })).toMatchObject({ gone: 0, changed: 1 })
  })

  it('a dry run counts what it would do and changes nothing', async () => {
    const store = fakeStore([item(1, 'a'), item(2, 'b'), item(3, 'c'), item(4, 'd')])
    const r2 = fakeR2({ fail: new Error('must not be called') })
    const m = manifest(line('r2', 5, 'a'), line('backup', 5, 'a'), line('r2', 5, 'b'), line('backup', 6, 'c'))
    const out = await purgeBackedUp({ store, r2, manifest: m, dryRun: true })
    expect(store.marked).toEqual([])
    expect(out).toEqual({ candidates: 4, purged: 2, gone: 1, waiting: 1, changed: 0, freedBytes: 5, erased: 0, cleared: 0, expire: [] })
  })

  it('stops at the first failure and says nothing was lost: what it did stays done, the rest waits for the next run', async () => {
    const boom = new Error('R2 is unreachable.')
    const store = fakeStore([item(1, 'a'), item(2, 'b')])
    let calls = 0
    const r2 = {
      async remove() {
        calls++
        if (calls === 2) throw boom
      },
    }
    const m = manifest(line('r2', 1, 'a'), line('backup', 1, 'a'), line('r2', 1, 'b'), line('backup', 1, 'b'))
    await expect(purgeBackedUp({ store, r2, manifest: m })).rejects.toBe(boom)
    expect(store.marked).toEqual(['1'])
  })

  it('hands the store the id as text, whatever type Postgres gave it', async () => {
    const store = fakeStore([item('12', 'k')])
    await purgeBackedUp({ store, r2: fakeR2(), manifest: manifest(line('backup', 1, 'k')) })
    expect(store.marked).toEqual(['12'])
  })

  it('never removes a file the backup does not hold, over any mix of listings', async () => {
    const keys = ['a', 'b', 'c', 'd', 'e']
    const size = fc.option(fc.nat({ max: 3 }), { nil: undefined })
    fc.assert(
      fc.asyncProperty(fc.array(fc.tuple(size, size), { minLength: 5, maxLength: 5 }), fc.boolean(), async (sizes, dryRun) => {
        const lines = []
        sizes.forEach(([inR2, inBackup], i) => {
          if (inR2 !== undefined) lines.push(line('r2', inR2, keys[i]))
          if (inBackup !== undefined) lines.push(line('backup', inBackup, keys[i]))
        })
        const store = fakeStore(keys.map((k, i) => item(i + 1, k)))
        const r2 = fakeR2()
        const out = await purgeBackedUp({ store, r2, manifest: parseManifest(lines.join('\n')), dryRun })
        for (const key of r2.removed) {
          const [inR2, inBackup] = sizes[keys.indexOf(key)]
          expect(inBackup).not.toBeUndefined()
          if (inR2 !== undefined) expect(inBackup).toBe(inR2)
        }
        expect(out.purged + out.gone + out.waiting + out.changed).toBe(5)
        if (dryRun) expect(r2.removed).toEqual([])
      }),
    )
  })
})

describe('purgeBackedUp: files deleted for good (gallery_erasures)', () => {
  it('takes a noted file out of R2 at once, without waiting for the backup to hold it', async () => {
    const store = fakeStore([], { erasures: ['art/4.png'] })
    const r2 = fakeR2()
    const out = await purgeBackedUp({ store, r2, manifest: manifest(line('r2', 40, 'art/4.png')) })
    expect(r2.removed).toEqual(['art/4.png'])
    expect(out).toMatchObject({ erased: 1, freedBytes: 40, cleared: 0, expire: [] })
    expect(store.notes).toEqual(['art/4.png'])
  })

  it('lists a noted file the backup holds for the backup run to delete, keeping the note until it is gone', async () => {
    const store = fakeStore([], { erasures: ['art/4.png'] })
    const r2 = fakeR2()
    const out = await purgeBackedUp({ store, r2, manifest: manifest(line('r2', 40, 'art/4.png'), line('backup', 40, 'art/4.png')) })
    expect(r2.removed).toEqual(['art/4.png'])
    expect(out.expire).toEqual(['art/4.png'])
    expect(store.notes).toEqual(['art/4.png'])
  })

  it('drops the note once neither R2 nor the backup holds the file', async () => {
    const store = fakeStore([], { erasures: ['art/4.png', 'clips/1/2.mp4'] })
    const r2 = fakeR2({ fail: new Error('must not be called') })
    const out = await purgeBackedUp({ store, r2, manifest: manifest(line('backup', 3, 'clips/1/2.mp4')) })
    expect(store.notes).toEqual(['clips/1/2.mp4'])
    expect(out).toMatchObject({ erased: 0, cleared: 1, expire: ['clips/1/2.mp4'] })
  })

  it('lists the files of items taken down 60 days ago that the backup still holds, and only those', async () => {
    const store = fakeStore([], { expired: ['art/1.png', 'art/2.png'] })
    const out = await purgeBackedUp({ store, r2: fakeR2(), manifest: manifest(line('backup', 9, 'art/1.png')) })
    expect(out.expire).toEqual(['art/1.png'])
  })

  it('lists a key once, in order, when it is both noted and expired', async () => {
    const store = fakeStore([], { erasures: ['b', 'a'], expired: ['b'] })
    const out = await purgeBackedUp({ store, r2: fakeR2(), manifest: manifest(line('backup', 1, 'b'), line('backup', 1, 'a')) })
    expect(out.expire).toEqual(['a', 'b'])
  })

  it('a dry run removes nothing and drops no note, but says what it would do', async () => {
    const store = fakeStore([], { erasures: ['a', 'b'] })
    const r2 = fakeR2({ fail: new Error('must not be called') })
    const out = await purgeBackedUp({ store, r2, manifest: manifest(line('r2', 5, 'a')), dryRun: true })
    expect(store.notes).toEqual(['a', 'b'])
    expect(out).toMatchObject({ erased: 1, cleared: 1, freedBytes: 5, expire: [] })
  })

  it('a failure removing a noted file ends the run, the note kept for the next night', async () => {
    const boom = new Error('R2 is unreachable.')
    const store = fakeStore([], { erasures: ['a'] })
    await expect(purgeBackedUp({ store, r2: fakeR2({ fail: boom }), manifest: manifest(line('r2', 1, 'a')) })).rejects.toBe(boom)
    expect(store.notes).toEqual(['a'])
  })

  it('never lists a file for the backup to delete unless it was noted or expired, over any listings', async () => {
    const keys = ['a', 'b', 'c', 'd']
    const pick = fc.subarray(keys)
    fc.assert(
      fc.asyncProperty(pick, pick, pick, pick, async (noted, expired, inR2, inBackup) => {
        const lines = [...inR2.map((k) => line('r2', 1, k)), ...inBackup.map((k) => line('backup', 1, k))]
        const store = fakeStore([], { erasures: noted, expired })
        const r2 = fakeR2()
        const out = await purgeBackedUp({ store, r2, manifest: parseManifest(lines.join('\n')) })
        for (const k of out.expire) {
          expect(noted.includes(k) || expired.includes(k)).toBe(true)
          expect(inBackup).toContain(k)
        }
        expect(r2.removed.every((k) => noted.includes(k) && inR2.includes(k))).toBe(true)
        expect(store.notes.every((k) => inR2.includes(k) || inBackup.includes(k))).toBe(true)
      }),
    )
  })
})
