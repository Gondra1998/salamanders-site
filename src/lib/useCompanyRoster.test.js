// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

let auth
vi.mock('../stores/auth', () => ({ useAuth: () => auth }))
vi.mock('./rosterApi', () => ({ getRoster: vi.fn(), getInfirmary: vi.fn(), getPublicRoster: vi.fn() }))
import * as api from './rosterApi'
import { useRoster } from '../stores/roster'
import { useRosterPublic } from '../stores/rosterPublic'
import { useCompanyRoster } from './useCompanyRoster'

const apiError = (status, message = 'nope') => Object.assign(new Error(message), { status })
const rank = { key: 'captain', label: 'Captain', tier: 1 }
const ROSTER = {
  fetchedAt: '2026-01-01T12:00:00.000Z',
  stale: false,
  viewer: { infirmary: false },
  highCommand: [],
  branches: [
    { key: 'company-3', kind: 'company', label: '3rd Battle Company', number: 3, head: { rank, members: [{ id: '900000000000000001', name: 'Cap', avatar: null, company: 3 }], vacant: false }, aside: [], rows: [] },
  ],
  unassigned: { rows: [] },
  servitors: [],
}
const PUBLIC = {
  fetchedAt: '2026-01-01T12:00:00.000Z',
  stale: false,
  highCommand: [],
  branches: [{ key: 'company-3', kind: 'company', label: '3rd Battle Company', number: 3, head: { rank, vacant: false, members: [{ name: 'Cap' }] }, aside: 0, rows: [{ rank: { key: 'sergeant', label: 'Sergeant', tier: 3 }, count: 4 }] }],
}

const hosts = []
function host({ infirmaryOpen = ref(false) } = {}) {
  let roster
  const w = mount({ setup() { roster = useCompanyRoster({ infirmaryOpen }); return () => null } })
  hosts.push(w)
  return { w, roster, infirmaryOpen }
}
const MINUTE = 60_000

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  auth = reactive({ token: 'tok', member: { id: '1' }, signedIn: true, signIn: vi.fn() })
  api.getRoster.mockResolvedValue(ROSTER)
  api.getInfirmary.mockResolvedValue({ count: 0, members: [] })
  api.getPublicRoster.mockResolvedValue(PUBLIC)
})
afterEach(() => {
  hosts.splice(0).forEach((w) => w.unmount())
  vi.useRealTimers()
})

describe('useCompanyRoster: who sees what', () => {
  it('a signed-out visitor gets the public view, and the member roster is never requested', async () => {
    auth.token = null
    auth.member = null
    const { roster } = host()
    expect(roster.mode.value).toBe('none')
    expect(roster.loading.value).toBe(true) // nothing decided before start
    roster.start()
    await flushPromises()
    expect(roster.mode.value).toBe('public')
    expect(roster.loading.value).toBe(false)
    expect(api.getRoster).not.toHaveBeenCalled()
    expect(api.getPublicRoster).toHaveBeenCalledTimes(1)
    expect(roster.view.value.branches[0].shape[0]).toMatchObject({ label: 'Sergeant', count: 4 })
    expect(roster.updated.value).toBe('')
    expect(roster.stale.value).toBe(false)
  })

  it('a Legion member gets the full roster and never asks for the public one', async () => {
    const { roster } = host()
    roster.start()
    await flushPromises()
    expect(roster.mode.value).toBe('full')
    expect(roster.loading.value).toBe(false)
    expect(roster.view.value.summary.total).toBe(1)
    expect(roster.view.value.branches[0].ladder).toBeDefined()
    expect(api.getPublicRoster).not.toHaveBeenCalled()
    expect(roster.updated.value).toMatch(/\d/)
    expect(roster.note.value).toBe('')
  })

  it('reports the snapshot as out of date', async () => {
    api.getRoster.mockResolvedValue({ ...ROSTER, stale: true })
    const { roster } = host()
    roster.start()
    await flushPromises()
    expect(roster.stale.value).toBe(true)
  })

  it('a signed-in account without the Legion role (403) gets the public view and is not asked again', async () => {
    vi.useFakeTimers()
    api.getRoster.mockRejectedValue(apiError(403, 'The roster is open to the XVIIIth Legion.'))
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.mode.value).toBe('public')
    expect(roster.note.value).toBe('')
    await vi.advanceTimersByTimeAsync(3 * MINUTE)
    expect(api.getRoster).toHaveBeenCalledTimes(1)
    expect(api.getPublicRoster).toHaveBeenCalledTimes(1)
  })

  it('when the server is down on the first load, shows the public view with a note, and keeps trying', async () => {
    vi.useFakeTimers()
    api.getRoster.mockRejectedValueOnce(apiError(503, 'down'))
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.mode.value).toBe('public')
    expect(roster.note.value).toBe('The live roster is unavailable. Showing the public view.')
    await vi.advanceTimersByTimeAsync(MINUTE) // the next poll succeeds
    expect(api.getRoster).toHaveBeenCalledTimes(2)
    expect(roster.mode.value).toBe('full')
    expect(roster.note.value).toBe('')
    expect(api.getPublicRoster).toHaveBeenCalledTimes(1) // fetched once, not per poll
  })

  it('keeps the note up while it retries, so the page does not shift by a line every minute', async () => {
    vi.useFakeTimers()
    api.getRoster.mockRejectedValueOnce(apiError(503, 'down'))
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.note.value).toBe('The live roster is unavailable. Showing the public view.')
    let answer
    api.getRoster.mockReturnValueOnce(new Promise((resolve, reject) => (answer = { resolve, reject })))
    await vi.advanceTimersByTimeAsync(MINUTE) // the retry is out, and has not come back
    expect(api.getRoster).toHaveBeenCalledTimes(2)
    expect(roster.note.value).toBe('The live roster is unavailable. Showing the public view.')
    answer.reject(apiError(503, 'still down'))
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.note.value).toBe('The live roster is unavailable. Showing the public view.')
    api.getRoster.mockReturnValueOnce(new Promise((resolve, reject) => (answer = { resolve, reject })))
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(roster.note.value).toBe('The live roster is unavailable. Showing the public view.')
    answer.resolve(ROSTER) // back: the full view, and the note goes with the answer
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.mode.value).toBe('full')
    expect(roster.note.value).toBe('')
  })

  it('on a return visit, with the public roster still in hand, shows no note before it has asked anything', async () => {
    auth.token = null
    auth.member = null
    await useRosterPublic().load() // the store outlives the page: this is the first visit's copy
    const { roster } = host()
    expect(roster.mode.value).toBe('public')
    expect(roster.note.value).toBe('')
    roster.start()
    await flushPromises()
    expect(roster.note.value).toBe('')
  })

  it('says nothing about a public view it does not have, when the public roster fails too', async () => {
    vi.useFakeTimers()
    api.getRoster.mockRejectedValue(apiError(503, 'down'))
    api.getPublicRoster.mockRejectedValue(apiError(503, 'down'))
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.mode.value).toBe('none')
    expect(roster.note.value).toBe('')
  })

  it('once the full view is back, a failed refresh keeps it with no note, though the public copy is still held', async () => {
    vi.useFakeTimers()
    api.getRoster.mockRejectedValueOnce(apiError(503, 'down'))
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.note.value).not.toBe('') // down: the public view, with the note
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(roster.mode.value).toBe('full')
    api.getRoster.mockRejectedValueOnce(apiError(503, 'down again'))
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(roster.mode.value).toBe('full')
    expect(roster.note.value).toBe('')
  })

  it('drops the note when a retry is refused: there is nothing unavailable about a refusal', async () => {
    vi.useFakeTimers()
    api.getRoster.mockRejectedValueOnce(apiError(503, 'down')).mockRejectedValueOnce(apiError(403, 'not Legion'))
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.note.value).toBe('The live roster is unavailable. Showing the public view.')
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(roster.mode.value).toBe('public')
    expect(roster.note.value).toBe('')
  })

  it('keeps the full view, with no note, when a refresh fails and a roster is in hand', async () => {
    vi.useFakeTimers()
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    api.getRoster.mockRejectedValue(apiError(503, 'down'))
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(useRoster().status).toBe('error')
    expect(roster.mode.value).toBe('full')
    expect(roster.note.value).toBe('')
    api.getRoster.mockResolvedValue(ROSTER)
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(useRoster().status).toBe('ready')
  })
})

describe('useCompanyRoster: polling', () => {
  it('refreshes the member roster every minute', async () => {
    vi.useFakeTimers()
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.getRoster).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2 * MINUTE)
    expect(api.getRoster).toHaveBeenCalledTimes(3)
  })

  it('drops to the public view and stops when the token goes bad on a poll', async () => {
    vi.useFakeTimers()
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.mode.value).toBe('full')
    api.getRoster.mockRejectedValue(apiError(401, 'Sign in with Discord.'))
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(roster.mode.value).toBe('public')
    expect(useRoster().roster).toBeNull()
    await vi.advanceTimersByTimeAsync(3 * MINUTE)
    expect(api.getRoster).toHaveBeenCalledTimes(2)
  })

  it('holds the places, not a blank page, while the public view loads after the token goes bad on a poll', async () => {
    vi.useFakeTimers()
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.mode.value).toBe('full')
    let release
    api.getPublicRoster.mockReturnValue(new Promise((resolve) => (release = resolve)))
    api.getRoster.mockRejectedValue(apiError(401, 'Sign in with Discord.'))
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(roster.mode.value).toBe('none')
    expect(roster.loading.value).toBe(true)
    release(PUBLIC)
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.mode.value).toBe('public')
    expect(roster.loading.value).toBe(false)
  })

  it('stops holding the places when the public view fails too, as for a visitor whose first load failed', async () => {
    vi.useFakeTimers()
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    api.getPublicRoster.mockRejectedValue(apiError(503, 'down'))
    api.getRoster.mockRejectedValue(apiError(403, 'The roster is open to the XVIIIth Legion.'))
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(roster.mode.value).toBe('none')
    expect(roster.loading.value).toBe(false)
  })

  it('fetches the Infirmary too while it is open', async () => {
    const infirmaryOpen = ref(true)
    const { roster } = host({ infirmaryOpen })
    roster.start()
    await flushPromises()
    expect(api.getInfirmary).toHaveBeenCalledWith('tok')
    api.getInfirmary.mockClear()
    infirmaryOpen.value = false
    await roster.loadMember()
    expect(api.getInfirmary).not.toHaveBeenCalled()
    expect(api.getRoster).toHaveBeenCalledTimes(2)
  })

  it('stop() ends the polling; so does the host unmounting', async () => {
    vi.useFakeTimers()
    const a = host()
    a.roster.start()
    await vi.advanceTimersByTimeAsync(0)
    a.roster.stop()
    await vi.advanceTimersByTimeAsync(3 * MINUTE)
    expect(api.getRoster).toHaveBeenCalledTimes(1)

    const b = host()
    b.roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.getRoster).toHaveBeenCalledTimes(2)
    b.w.unmount()
    hosts.splice(hosts.indexOf(b.w), 1) // already gone; afterEach must not unmount it twice
    await vi.advanceTimersByTimeAsync(3 * MINUTE)
    expect(api.getRoster).toHaveBeenCalledTimes(2)
  })
})

describe('useCompanyRoster: signing out, and a public failure', () => {
  it('signing out on the page switches to the public view at once and stops asking for the roster', async () => {
    vi.useFakeTimers()
    const { roster } = host()
    roster.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.mode.value).toBe('full')
    // what auth.signOut() does: drop the token and member, then reset the roster store
    auth.token = null
    auth.member = null
    useRoster().reset()
    await vi.advanceTimersByTimeAsync(0)
    expect(roster.mode.value).toBe('public')
    expect(api.getRoster).toHaveBeenCalledTimes(1)
    expect(api.getPublicRoster).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3 * MINUTE)
    expect(api.getRoster).toHaveBeenCalledTimes(1)
  })

  it('shows nothing, and does not throw, when the public roster cannot be had', async () => {
    auth.token = null
    auth.member = null
    api.getPublicRoster.mockRejectedValue(apiError(503, 'The roster is not available yet. Try again.'))
    const { roster } = host()
    roster.start()
    await flushPromises()
    expect(roster.mode.value).toBe('none')
    expect(roster.loading.value).toBe(false)
    expect(roster.view.value).toBeNull()
    expect(useRosterPublic().status).toBe('error')
  })
})
