// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { CLASS_NAMES } from '../stores/planner'
import weapons from '../data/weapons.json'
import companies from '../data/companies.json'

// The default listBuilds is the real client; this stand-in keeps a test that forgets to pass one off the network.
vi.mock('./buildsApi', () => ({ listBuilds: vi.fn() }))
import * as buildsApi from './buildsApi'
import { useMusterFacts } from './useMusterFacts'

// The static facts are worked out here from the same data files, so a weekly data sync that adds a weapon or a
// company does not break the test.
const WEAPON_TOTAL = Object.values(weapons.fallbackWeapons).reduce((n, list) => n + list.length, 0)

const hosts = []
// Mount a throwaway component that calls the composable the way a view does, inside setup.
function host(options) {
  let muster
  const w = mount({
    setup() {
      muster = useMusterFacts(options)
      return () => null
    },
  })
  hosts.push(w)
  return { muster, w }
}
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }))

beforeEach(() => {
  vi.mocked(buildsApi.listBuilds).mockReset().mockResolvedValue([])
})
afterEach(() => {
  hosts.splice(0).forEach((w) => w.unmount())
  vi.restoreAllMocks()
})

describe('useMusterFacts static facts', () => {
  it('counts the classes, the armoury weapons and the companies from the data files', () => {
    const { muster } = host({ listBuilds: vi.fn().mockReturnValue(new Promise(() => {})) })
    expect(muster.facts.value['/planner']).toBe(`${CLASS_NAMES.length} classes`)
    expect(muster.facts.value['/armoury']).toBe(`${WEAPON_TOTAL} weapons`)
    expect(muster.facts.value['/companies']).toBe(`${companies.length} companies and sections`)
  })

  it('has real numbers behind them, not an empty data file', () => {
    // Guards the three equalities above from passing as "0 classes" against an empty import.
    expect(CLASS_NAMES.length).toBeGreaterThan(0)
    expect(WEAPON_TOTAL).toBeGreaterThan(0)
    expect(companies.length).toBeGreaterThan(0)
  })

  it('keeps them while the builds count is still on its way', () => {
    const { muster } = host({ listBuilds: vi.fn().mockReturnValue(new Promise(() => {})) })
    expect(Object.keys(muster.facts.value)).toEqual(['/planner', '/armoury', '/builds', '/companies'])
  })
})

describe('useMusterFacts builds count', () => {
  it('is null before the call resolves, then says how many are posted', async () => {
    const answer = deferred()
    const listBuilds = vi.fn().mockReturnValue(answer.promise)
    const { muster } = host({ listBuilds })
    expect(muster.facts.value['/builds']).toBeNull()

    answer.resolve(rows(2))
    await flushPromises()
    expect(muster.facts.value['/builds']).toBe('2 posted')
  })

  it('counts whatever the list holds', async () => {
    const { muster } = host({ listBuilds: vi.fn().mockResolvedValue(rows(17)) })
    await flushPromises()
    expect(muster.facts.value['/builds']).toBe('17 posted')
  })

  it('says nothing when none are posted: a zero persuades nobody', async () => {
    const { muster } = host({ listBuilds: vi.fn().mockResolvedValue([]) })
    await flushPromises()
    expect(muster.facts.value['/builds']).toBeNull()
    // the other three facts are still there
    expect(muster.facts.value['/planner']).toBe(`${CLASS_NAMES.length} classes`)
  })

  it('stays null when the call rejects, and says nothing in the console', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const answer = deferred()
    const { muster } = host({ listBuilds: vi.fn().mockReturnValue(answer.promise) })

    answer.reject(Object.assign(new Error('Request failed (500)'), { status: 500 }))
    await flushPromises()
    expect(muster.facts.value['/builds']).toBeNull()
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('stays null when the call throws before it returns a promise', async () => {
    const { muster } = host({
      listBuilds: vi.fn(() => {
        throw new TypeError('not a function')
      }),
    })
    await flushPromises()
    expect(muster.facts.value['/builds']).toBeNull()
  })

  it('stays null for an answer that is not a list', async () => {
    for (const answer of [null, undefined, {}, { length: 3 }, 'three']) {
      const { muster } = host({ listBuilds: vi.fn().mockResolvedValue(answer) })
      await flushPromises()
      expect(muster.facts.value['/builds'], String(answer)).toBeNull()
    }
  })

  it('ignores an answer that arrives after the page has gone', async () => {
    const answer = deferred()
    const { muster, w } = host({ listBuilds: vi.fn().mockReturnValue(answer.promise) })
    w.unmount()
    answer.resolve(rows(5))
    await flushPromises()
    expect(muster.facts.value['/builds']).toBeNull()
  })
})

describe('useMusterFacts request', () => {
  it('asks once, at creation, for the whole list with no class and no token', () => {
    const listBuilds = vi.fn().mockResolvedValue([])
    host({ listBuilds })
    expect(listBuilds).toHaveBeenCalledTimes(1)
    expect(listBuilds.mock.calls[0]).toHaveLength(2)
    expect(listBuilds).toHaveBeenCalledWith(undefined, undefined)
  })

  it('does not ask again when the facts are read', async () => {
    const listBuilds = vi.fn().mockResolvedValue(rows(1))
    const { muster } = host({ listBuilds })
    await flushPromises()
    void muster.facts.value
    void muster.facts.value['/builds']
    expect(listBuilds).toHaveBeenCalledTimes(1)
  })

  it('uses the shared builds client when no listBuilds option is given', async () => {
    vi.mocked(buildsApi.listBuilds).mockResolvedValue(rows(3))
    const { muster } = host()
    await flushPromises()
    expect(buildsApi.listBuilds).toHaveBeenCalledTimes(1)
    expect(buildsApi.listBuilds).toHaveBeenCalledWith(undefined, undefined)
    expect(muster.facts.value['/builds']).toBe('3 posted')
  })

  it('takes an options object and returns one with facts in it', () => {
    const { muster } = host({ listBuilds: vi.fn().mockReturnValue(new Promise(() => {})) })
    expect(Object.keys(muster)).toEqual(['facts'])
  })
})
