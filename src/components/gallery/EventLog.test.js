// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const state = vi.hoisted(() => ({ auth: null }))
vi.mock('../../stores/auth', () => ({ useAuth: () => state.auth }))
vi.mock('../../lib/gallery/api')
import { listEvents } from '../../lib/gallery/api'
import EventLog from './EventLog.vue'

const apiError = (status, message = 'nope') => Object.assign(new Error(message), { status })
const deferred = () => {
  let resolve
  const promise = new Promise((res) => (resolve = res))
  return { promise, resolve }
}
// Invented ids and names only.
const event = (id, extra = {}) => ({
  id: String(id),
  itemId: '1',
  action: 'approved',
  actor: { id: '100000000000000001', username: 'invented' },
  note: '',
  createdAt: '2026-11-01T08:00:00.000Z',
  ...extra,
})

const mounted = []
const mountLog = () => {
  const w = mount(EventLog)
  mounted.push(w)
  return w
}
const toggle = (w) => w.find('.rq-events-toggle')
const open = async (w) => {
  await toggle(w).trigger('click')
  await flushPromises()
}
const lines = (w) => w.findAll('.rq-event')
const more = (w) => w.findAll('button').find((b) => b.text() === 'Load more')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  state.auth = reactive({ token: 'tok', member: { id: '100000000000000001', isMember: true } })
})
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

describe('EventLog: before it is opened', () => {
  it('is one button, "Recent activity", closed, and loads nothing', async () => {
    const w = mountLog()
    await flushPromises()
    expect(toggle(w).text()).toBe('Recent activity')
    expect(toggle(w).attributes('aria-expanded')).toBe('false')
    expect(listEvents).not.toHaveBeenCalled()
    expect(lines(w)).toHaveLength(0)
  })
})

describe('EventLog: opening', () => {
  it('loads the newest page, with the token, the first time it is opened', async () => {
    listEvents.mockResolvedValue({ events: [event(2), event(1)], next: null })
    const w = mountLog()
    await open(w)
    expect(listEvents).toHaveBeenCalledTimes(1)
    expect(listEvents).toHaveBeenCalledWith('tok', null)
    expect(toggle(w).attributes('aria-expanded')).toBe('true')
    expect(lines(w)).toHaveLength(2)
  })

  it('says it is loading until the page arrives', async () => {
    const d = deferred()
    listEvents.mockReturnValue(d.promise)
    const w = mountLog()
    await toggle(w).trigger('click')
    expect(w.text()).toContain('Loading…')
    d.resolve({ events: [event(1)], next: null })
    await flushPromises()
    expect(w.text()).not.toContain('Loading…')
    expect(lines(w)).toHaveLength(1)
  })

  it('does not load it again when it is closed and opened again', async () => {
    listEvents.mockResolvedValue({ events: [event(1)], next: null })
    const w = mountLog()
    await open(w)
    await toggle(w).trigger('click')
    expect(lines(w)).toHaveLength(0)
    expect(toggle(w).attributes('aria-expanded')).toBe('false')
    await open(w)
    expect(lines(w)).toHaveLength(1)
    expect(listEvents).toHaveBeenCalledTimes(1)
  })

  it('says so when nothing has been recorded', async () => {
    listEvents.mockResolvedValue({ events: [], next: null })
    const w = mountLog()
    await open(w)
    expect(w.text()).toContain('Nothing recorded yet.')
  })

  it('says why it could not load, and asks again the next time it is opened', async () => {
    listEvents.mockRejectedValueOnce(apiError(403, 'Only approvers can do that.'))
    const w = mountLog()
    await open(w)
    expect(w.find('[role="alert"]').text()).toBe('Only approvers can do that.')
    expect(w.text()).not.toContain('Nothing recorded yet.')

    await toggle(w).trigger('click')
    listEvents.mockResolvedValueOnce({ events: [event(1)], next: null })
    await open(w)
    expect(listEvents).toHaveBeenCalledTimes(2)
    expect(lines(w)).toHaveLength(1)
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('EventLog: a line per event', () => {
  it('says what was done, by whom and when, in that order', async () => {
    const at = '2026-11-01T08:30:00.000Z'
    listEvents.mockResolvedValue({ events: [event(5, { action: 'rejected', actor: { id: '2', username: 'brother_x' }, createdAt: at })], next: null })
    const w = mountLog()
    await open(w)
    const line = lines(w)[0].text()
    expect(line).toContain('Rejected')
    expect(line).toContain('brother_x')
    expect(line).toContain(new Date(at).toLocaleString())
    expect(line.indexOf('Rejected')).toBeLessThan(line.indexOf('brother_x'))
    expect(line.indexOf('brother_x')).toBeLessThan(line.indexOf(new Date(at).toLocaleString()))
  })

  it('has a plain word for each action the server records, and the raw word for one it does not know', async () => {
    const actions = ['stored', 'submitted', 'approved', 'rejected', 'hidden', 'removed', 'discord_deleted', 'something_new']
    listEvents.mockResolvedValue({ events: actions.map((action, i) => event(i + 1, { action })), next: null })
    const w = mountLog()
    await open(w)
    expect(lines(w).map((l) => l.find('.rq-event-action').text())).toEqual([
      'Stored',
      'Submitted',
      'Approved',
      'Rejected',
      'Hidden',
      'Removed',
      'Deleted on Discord',
      'something_new',
    ])
  })

  it('shows the note when there is one, and nothing in its place when there is not', async () => {
    listEvents.mockResolvedValue({ events: [event(2, { note: 'Too dark to see.' }), event(1, { note: '' }), event(3, { note: null })], next: null })
    const w = mountLog()
    await open(w)
    expect(lines(w)[0].text()).toContain('Too dark to see.')
    expect(lines(w)[0].find('.rq-event-note').exists()).toBe(true)
    expect(lines(w)[1].find('.rq-event-note').exists()).toBe(false)
    expect(lines(w)[2].find('.rq-event-note').exists()).toBe(false)
  })

  it('shows names and notes as plain text', async () => {
    listEvents.mockResolvedValue({ events: [event(1, { note: '<b>bold</b>', actor: { id: '2', username: '<i>sneaky</i>' } })], next: null })
    const w = mountLog()
    await open(w)
    expect(w.text()).toContain('<b>bold</b>')
    expect(w.text()).toContain('<i>sneaky</i>')
    expect(w.find('.rq-events b').exists()).toBe(false)
    expect(w.find('.rq-events i').exists()).toBe(false)
  })
})

describe('EventLog: Load more', () => {
  it('is hidden when there is no next page', async () => {
    listEvents.mockResolvedValue({ events: [event(1)], next: null })
    const w = mountLog()
    await open(w)
    expect(more(w)).toBeUndefined()
  })

  it('is there while there is a next page, and adds the page after the cursor to the end', async () => {
    listEvents.mockResolvedValueOnce({ events: [event(3), event(2)], next: '2' })
    const w = mountLog()
    await open(w)
    expect(more(w)).toBeTruthy()
    listEvents.mockResolvedValueOnce({ events: [event(1)], next: null })
    await more(w).trigger('click')
    await flushPromises()
    expect(listEvents).toHaveBeenLastCalledWith('tok', '2')
    expect(lines(w)).toHaveLength(3)
    expect(more(w)).toBeUndefined()
  })

  it('is disabled while a page is on its way', async () => {
    listEvents.mockResolvedValueOnce({ events: [event(2)], next: '2' })
    const w = mountLog()
    await open(w)
    const d = deferred()
    listEvents.mockReturnValueOnce(d.promise)
    await more(w).trigger('click')
    expect(more(w).attributes('disabled')).toBeDefined()
    d.resolve({ events: [event(1)], next: null })
    await flushPromises()
  })

  it('says why a page could not be fetched and keeps the log it has', async () => {
    listEvents.mockResolvedValueOnce({ events: [event(2)], next: '2' })
    const w = mountLog()
    await open(w)
    listEvents.mockRejectedValueOnce(apiError(503, 'The Reliquarium could not be reached.'))
    await more(w).trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('The Reliquarium could not be reached.')
    expect(lines(w)).toHaveLength(1)
    expect(more(w)).toBeTruthy()
  })
})
