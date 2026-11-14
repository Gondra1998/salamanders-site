import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { useMemberSearch } from './memberSearch'

// Invented members only.
const VALEN = { id: '300000000000000201', name: 'Brother Valen', avatar: null }
const VARRO = { id: '300000000000000202', name: 'Brother Varro', avatar: null }

// A server stand-in whose answers the test releases one by one, in any order.
function server() {
  const asked = []
  const search = (q) =>
    new Promise((resolve, reject) => {
      asked.push({ q, resolve, reject })
    })
  return { asked, search, queries: () => asked.map((a) => a.q) }
}
const type = async (s, q) => {
  s.query.value = q
  await nextTick()
}
const settle = async () => {
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useMemberSearch', () => {
  it('starts idle, with nothing found and nothing to say', () => {
    const s = useMemberSearch(server().search)
    expect([s.query.value, s.results.value, s.state.value, s.message.value]).toEqual(['', [], 'idle', ''])
  })

  it('asks nothing for less than two characters, however long it waits', async () => {
    const srv = server()
    const s = useMemberSearch(srv.search)
    for (const q of ['v', ' v ', '  ', '\t']) {
      await type(s, q)
      vi.advanceTimersByTime(1000)
      expect(s.state.value, q).toBe('idle')
    }
    expect(srv.queries()).toEqual([])
  })

  it('asks once, 250 ms after the last keystroke, with the query trimmed', async () => {
    const srv = server()
    const s = useMemberSearch(srv.search)
    await type(s, 'va')
    vi.advanceTimersByTime(100)
    await type(s, 'val ')
    expect(s.state.value).toBe('loading')
    vi.advanceTimersByTime(249)
    expect(srv.queries()).toEqual([])
    vi.advanceTimersByTime(1)
    expect(srv.queries()).toEqual(['val'])
    srv.asked[0].resolve([VALEN])
    await settle()
    expect([s.results.value, s.state.value]).toEqual([[VALEN], 'ready'])
  })

  it('asks for a pasted id as it is, trimmed', async () => {
    const srv = server()
    const s = useMemberSearch(srv.search)
    await type(s, `  ${VALEN.id}  `)
    vi.advanceTimersByTime(250)
    expect(srv.queries()).toEqual([VALEN.id])
  })

  it('keeps the answer to the newest query when an older one arrives after it', async () => {
    const srv = server()
    const s = useMemberSearch(srv.search)
    await type(s, 'va')
    vi.advanceTimersByTime(250)
    await type(s, 'var')
    vi.advanceTimersByTime(250)
    srv.asked[1].resolve([VARRO])
    await settle()
    srv.asked[0].resolve([VALEN, VARRO])
    await settle()
    expect([s.results.value, s.state.value]).toEqual([[VARRO], 'ready'])
  })

  it('drops an answer that comes after the query was cleared, and empties what was found', async () => {
    const srv = server()
    const s = useMemberSearch(srv.search)
    await type(s, 'va')
    vi.advanceTimersByTime(250)
    srv.asked[0].resolve([VALEN])
    await settle()
    await type(s, 'var')
    vi.advanceTimersByTime(250)
    await type(s, '')
    srv.asked[1].resolve([VARRO])
    await settle()
    expect([s.results.value, s.state.value, s.message.value]).toEqual([[], 'idle', ''])
  })

  it('says when nothing matches', async () => {
    const srv = server()
    const s = useMemberSearch(srv.search)
    await type(s, 'zz')
    vi.advanceTimersByTime(250)
    srv.asked[0].resolve([])
    await settle()
    expect([s.results.value, s.state.value]).toEqual([[], 'empty'])
  })

  it('says the list is still loading on a 503, gives any other failure its words, and has a line of its own for none', async () => {
    for (const [err, want] of [
      [Object.assign(new Error('Busy'), { status: 503 }), 'The member list is still loading. Try again in a minute.'],
      [Object.assign(new Error('Only the Watch Commander can do that.'), { status: 403 }), 'Only the Watch Commander can do that.'],
      [new Error(''), 'The search did not work.'],
      [undefined, 'The search did not work.'],
    ]) {
      const srv = server()
      const s = useMemberSearch(srv.search)
      await type(s, 'va')
      vi.advanceTimersByTime(250)
      srv.asked[0].reject(err)
      await settle()
      expect([s.results.value, s.state.value, s.message.value]).toEqual([[], 'error', want])
    }
  })

  it('drops a failure to an older query', async () => {
    const srv = server()
    const s = useMemberSearch(srv.search)
    await type(s, 'va')
    vi.advanceTimersByTime(250)
    await type(s, 'var')
    vi.advanceTimersByTime(250)
    srv.asked[1].resolve([VARRO])
    await settle()
    srv.asked[0].reject(Object.assign(new Error('Busy'), { status: 503 }))
    await settle()
    expect([s.state.value, s.message.value]).toEqual(['ready', ''])
  })

  it('takes its own delay', async () => {
    const srv = server()
    const s = useMemberSearch(srv.search, { delayMs: 40 })
    await type(s, 'va')
    vi.advanceTimersByTime(39)
    expect(srv.queries()).toEqual([])
    vi.advanceTimersByTime(1)
    expect(srv.queries()).toEqual(['va'])
  })
})
