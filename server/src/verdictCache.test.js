import { afterEach, describe, it, expect, vi } from 'vitest'
import { createVerdictCache } from './verdictCache'

const req = (auth) => new Request('http://api.test/x', auth === null ? {} : { headers: { Authorization: auth } })

// Each lookup answers a new object naming the header and which lookup it was, so that `toBe` tells a stored
// verdict from a fresh one. `clock.t` is the cache's idea of now.
function setup(options = {}) {
  const clock = { t: 1_000 }
  const lookup = vi.fn(async (request) => ({ header: request.headers.get('Authorization'), n: lookup.mock.calls.length }))
  const cache = createVerdictCache({ lookup, now: () => clock.t, ...options })
  return { cache, lookup, clock }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('resolve', () => {
  it('asks lookup, with the request, and returns what it answers', async () => {
    const { cache, lookup } = setup()
    const request = req('Bearer a')
    expect(await cache.resolve(request)).toEqual({ header: 'Bearer a', n: 1 })
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith(request)
  })

  it('serves the stored verdict, not a new one, to the same Authorization header', async () => {
    const { cache, lookup } = setup()
    const first = await cache.resolve(req('Bearer a'))
    expect(await cache.resolve(req('Bearer a'))).toBe(first)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('serves a verdict for 30 seconds and looks again at 30 seconds', async () => {
    const { cache, lookup, clock } = setup()
    const first = await cache.resolve(req('Bearer a'))
    clock.t = 1_000 + 29_999
    expect(await cache.resolve(req('Bearer a'))).toBe(first)
    expect(lookup).toHaveBeenCalledTimes(1)
    clock.t = 1_000 + 30_000
    const second = await cache.resolve(req('Bearer a'))
    expect(second).not.toBe(first)
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('stores the new verdict for another full ttl after an old one lapsed', async () => {
    const { cache, lookup, clock } = setup({ ttlMs: 100 })
    await cache.resolve(req('Bearer a'))
    clock.t = 1_100
    const second = await cache.resolve(req('Bearer a'))
    clock.t = 1_199
    expect(await cache.resolve(req('Bearer a'))).toBe(second)
    expect(lookup).toHaveBeenCalledTimes(2)
    clock.t = 1_200
    await cache.resolve(req('Bearer a'))
    expect(lookup).toHaveBeenCalledTimes(3)
  })

  it('honours a different ttlMs', async () => {
    const { cache, lookup, clock } = setup({ ttlMs: 5 })
    await cache.resolve(req('Bearer a'))
    clock.t = 1_004
    await cache.resolve(req('Bearer a'))
    expect(lookup).toHaveBeenCalledTimes(1)
    clock.t = 1_005
    await cache.resolve(req('Bearer a'))
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('keeps a separate entry per whole header, even when two differ in one character or only in the scheme', async () => {
    const { cache, lookup } = setup()
    const headers = ['Bearer tok-a', 'Bearer tok-b', 'bearer tok-a', 'Basic tok-a']
    const first = []
    for (const h of headers) first.push(await cache.resolve(req(h)))
    expect(lookup).toHaveBeenCalledTimes(4)
    for (const [i, h] of headers.entries()) expect(await cache.resolve(req(h))).toBe(first[i])
    expect(lookup).toHaveBeenCalledTimes(4)
  })

  it('uses the default clock when none is given', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const lookup = vi.fn(async () => ({}))
    const cache = createVerdictCache({ lookup })
    await cache.resolve(req('Bearer a'))
    vi.setSystemTime(1_000_000 + 29_999)
    await cache.resolve(req('Bearer a'))
    expect(lookup).toHaveBeenCalledTimes(1)
    vi.setSystemTime(1_000_000 + 30_000)
    await cache.resolve(req('Bearer a'))
    expect(lookup).toHaveBeenCalledTimes(2)
  })
})

describe('what is never served from the cache', () => {
  it('lets fresh bypass the cache and leaves the stored verdict as it was', async () => {
    const { cache, lookup } = setup()
    const stored = await cache.resolve(req('Bearer a'))
    const fresh = await cache.resolve(req('Bearer a'), { fresh: true })
    expect(fresh).not.toBe(stored)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(await cache.resolve(req('Bearer a'))).toBe(stored)
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('does not store what a fresh call learned', async () => {
    const { cache, lookup } = setup()
    await cache.resolve(req('Bearer a'), { fresh: true })
    await cache.resolve(req('Bearer a'))
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('takes fresh: false as no option at all', async () => {
    const { cache, lookup } = setup()
    const first = await cache.resolve(req('Bearer a'), { fresh: false })
    expect(await cache.resolve(req('Bearer a'), { fresh: false })).toBe(first)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no Authorization header', null],
    ['an empty one', ''],
  ])('looks up every time, and stores nothing, for %s', async (_what, header) => {
    const { cache, lookup } = setup()
    const a = await cache.resolve(req(header))
    const b = await cache.resolve(req(header))
    expect(b).not.toBe(a)
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('does not store a null verdict', async () => {
    const lookup = vi.fn(async () => null)
    const { cache } = setup({ lookup })
    expect(await cache.resolve(req('Bearer a'))).toBeNull()
    expect(await cache.resolve(req('Bearer a'))).toBeNull()
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('fails with the lookup error, stores nothing, and answers once the lookup works again', async () => {
    const boom = new Error('upstream down')
    let down = true
    const lookup = vi.fn(async () => {
      if (down) throw boom
      return { ok: true }
    })
    const { cache } = setup({ lookup })
    await expect(cache.resolve(req('Bearer a'))).rejects.toBe(boom)
    await expect(cache.resolve(req('Bearer a'))).rejects.toBe(boom)
    expect(lookup).toHaveBeenCalledTimes(2)
    down = false
    expect(await cache.resolve(req('Bearer a'))).toEqual({ ok: true })
    expect(lookup).toHaveBeenCalledTimes(3)
  })

  it('keeps serving other headers after one failed', async () => {
    const lookup = vi.fn(async (request) => {
      if (request.headers.get('Authorization') === 'Bearer bad') throw new Error('nope')
      return {}
    })
    const { cache } = setup({ lookup })
    const good = await cache.resolve(req('Bearer good'))
    await expect(cache.resolve(req('Bearer bad'))).rejects.toThrow('nope')
    expect(await cache.resolve(req('Bearer good'))).toBe(good)
    expect(lookup).toHaveBeenCalledTimes(2)
  })
})

describe('forget', () => {
  it('drops every stored verdict', async () => {
    const { cache, lookup } = setup()
    const a = await cache.resolve(req('Bearer a'))
    const b = await cache.resolve(req('Bearer b'))
    cache.forget()
    expect(await cache.resolve(req('Bearer a'))).not.toBe(a)
    expect(await cache.resolve(req('Bearer b'))).not.toBe(b)
    expect(lookup).toHaveBeenCalledTimes(4)
  })

  it('stores again after a forget', async () => {
    const { cache, lookup } = setup()
    cache.forget()
    const first = await cache.resolve(req('Bearer a'))
    expect(await cache.resolve(req('Bearer a'))).toBe(first)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('does not remember a verdict that a forget overtook while it was being looked up', async () => {
    let answer
    const lookup = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    const { cache } = setup({ lookup })
    const inFlight = cache.resolve(req('Bearer a'))
    cache.forget() // while that lookup is still running
    answer({ story: 'told before the forget' })
    expect(await inFlight).toEqual({ story: 'told before the forget' }) // the caller who asked early still gets it
    lookup.mockImplementation(async () => ({ story: 'told after' }))
    expect(await cache.resolve(req('Bearer a'))).toEqual({ story: 'told after' }) // but it was not kept
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('remembers a verdict whose lookup began after the forget', async () => {
    let answer
    const lookup = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    const { cache } = setup({ lookup })
    cache.forget()
    const inFlight = cache.resolve(req('Bearer a'))
    answer({ story: 'told after the forget' })
    const verdict = await inFlight
    expect(await cache.resolve(req('Bearer a'))).toBe(verdict)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('does not remember a verdict that two forgets overtook', async () => {
    let answer
    const lookup = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    const { cache } = setup({ lookup })
    const inFlight = cache.resolve(req('Bearer a'))
    cache.forget()
    cache.forget()
    answer({})
    await inFlight
    lookup.mockImplementation(async () => ({}))
    await cache.resolve(req('Bearer a'))
    expect(lookup).toHaveBeenCalledTimes(2)
  })
})

describe('the size bound', () => {
  it('evicts the oldest entry once full', async () => {
    const { cache, lookup } = setup({ maxEntries: 2 })
    await cache.resolve(req('Bearer a'))
    await cache.resolve(req('Bearer b'))
    await cache.resolve(req('Bearer c')) // evicts a
    expect(lookup).toHaveBeenCalledTimes(3)
    await cache.resolve(req('Bearer b'))
    await cache.resolve(req('Bearer c'))
    expect(lookup).toHaveBeenCalledTimes(3)
    await cache.resolve(req('Bearer a')) // gone, looked up again
    expect(lookup).toHaveBeenCalledTimes(4)
  })

  it('does not evict while there is room', async () => {
    const { cache, lookup } = setup({ maxEntries: 3 })
    for (const h of ['Bearer a', 'Bearer b', 'Bearer c']) await cache.resolve(req(h))
    for (const h of ['Bearer a', 'Bearer b', 'Bearer c']) await cache.resolve(req(h))
    expect(lookup).toHaveBeenCalledTimes(3)
  })

  it('holds 1000 entries by default and evicts the oldest for the 1001st', async () => {
    const { cache, lookup } = setup()
    for (let i = 0; i < 1000; i++) await cache.resolve(req(`Bearer ${i}`))
    expect(lookup).toHaveBeenCalledTimes(1000)
    await cache.resolve(req('Bearer 0'))
    await cache.resolve(req('Bearer 999'))
    expect(lookup).toHaveBeenCalledTimes(1000)
    await cache.resolve(req('Bearer 1000')) // evicts Bearer 0
    expect(lookup).toHaveBeenCalledTimes(1001)
    await cache.resolve(req('Bearer 1'))
    expect(lookup).toHaveBeenCalledTimes(1001)
    await cache.resolve(req('Bearer 0'))
    expect(lookup).toHaveBeenCalledTimes(1002)
  })

  it('evicts nothing when a lapsed entry is stored again, and keeps it where it was in the order', async () => {
    const { cache, lookup, clock } = setup({ maxEntries: 2, ttlMs: 100 })
    await cache.resolve(req('Bearer a')) // t 1000, until 1100
    clock.t = 1_010
    const b = await cache.resolve(req('Bearer b')) // until 1110
    clock.t = 1_100
    const a = await cache.resolve(req('Bearer a')) // lapsed: looked up and stored again, until 1200
    expect(lookup).toHaveBeenCalledTimes(3)
    expect(await cache.resolve(req('Bearer b'))).toBe(b) // still there: nothing was evicted for it
    expect(lookup).toHaveBeenCalledTimes(3)
    clock.t = 1_101
    await cache.resolve(req('Bearer c')) // full: evicts the oldest stored, a, though a is the newer verdict
    expect(lookup).toHaveBeenCalledTimes(4)
    expect(await cache.resolve(req('Bearer b'))).toBe(b)
    expect(lookup).toHaveBeenCalledTimes(4)
    expect(await cache.resolve(req('Bearer a'))).not.toBe(a)
    expect(lookup).toHaveBeenCalledTimes(5)
  })
})
