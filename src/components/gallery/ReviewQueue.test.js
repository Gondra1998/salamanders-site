// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { artItem } from '../../test-utils/galleryItem'
import { forgetReloads } from '../../lib/gallery/reloadOnce'

const state = vi.hoisted(() => ({ auth: null }))
vi.mock('../../stores/auth', () => ({ useAuth: () => state.auth }))
vi.mock('../../lib/gallery/api')
import { listReview, listEvents, listTakedowns, approve, reject } from '../../lib/gallery/api'
import ReviewQueue from './ReviewQueue.vue'

const apiError = (status, message = 'nope') => Object.assign(new Error(message), { status })
const deferred = () => {
  let resolve
  const promise = new Promise((res) => (resolve = res))
  return { promise, resolve }
}
const SYNC = { lastRunAt: '2026-11-01T08:00:00.000Z', lastOkAt: '2026-11-01T07:00:00.000Z', lastError: null }
const pending = () => [artItem('1', { status: 'pending', title: 'First piece' }), artItem('2', { status: 'pending', title: 'Second piece' })]

const mounted = []
const queueWith = async (items = pending(), sync = SYNC) => {
  listReview.mockResolvedValue({ items, sync })
  const w = mount(ReviewQueue, { attachTo: document.body })
  mounted.push(w)
  await flushPromises()
  return w
}
const entries = (w) => w.findAll('.rq-review-item')
const button = (scope, text) => scope.findAll('button').find((b) => b.text() === text)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  forgetReloads()
  state.auth = reactive({ token: 'tok', member: { id: '100000000000000001', isMember: true } })
})
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

describe('ReviewQueue: the queue', () => {
  it('fetches the queue itself, with the token, and shows each pending piece as a card with Approve and Reject', async () => {
    const w = await queueWith()
    expect(listReview).toHaveBeenCalledWith('tok')
    expect(entries(w)).toHaveLength(2)
    expect(entries(w)[0].text()).toContain('First piece')
    expect(entries(w)[0].text()).toContain('Invented Marine')
    for (const entry of entries(w)) {
      expect(button(entry, 'Approve')).toBeTruthy()
      expect(button(entry, 'Reject')).toBeTruthy()
      // approvers hide from the galleries, not from the queue
      expect(entry.find('.rq-hide').exists()).toBe(false)
    }
  })

  it('says so when nothing is waiting', async () => {
    const w = await queueWith([])
    expect(w.text()).toContain('Nothing waiting for review.')
    expect(entries(w)).toHaveLength(0)
  })

  it('says it is loading until the queue arrives', async () => {
    const d = deferred()
    listReview.mockReturnValue(d.promise)
    const w = mount(ReviewQueue)
    mounted.push(w)
    expect(w.text()).toContain('Loading…')
    expect(w.text()).not.toContain('Nothing waiting')
    d.resolve({ items: [], sync: SYNC })
    await flushPromises()
    expect(w.text()).not.toContain('Loading…')
  })

  it('shows why the queue could not be fetched, and not the empty message', async () => {
    listReview.mockRejectedValue(apiError(403, 'Only approvers can do that.'))
    const w = mount(ReviewQueue)
    mounted.push(w)
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('Only approvers can do that.')
    expect(w.text()).not.toContain('Nothing waiting')
  })

  it('opens a piece full size from its card', async () => {
    const w = await queueWith()
    await entries(w)[0].find('img').trigger('click')
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('asks for the queue again, once, when a link has expired', async () => {
    const w = await queueWith()
    listReview.mockClear()
    await entries(w)[0].find('img').trigger('error')
    expect(listReview).toHaveBeenCalledTimes(1)
  })
})

describe('ReviewQueue: taken down', () => {
  it('has a "Taken down" list under the queue that loads nothing until it is tapped', async () => {
    const w = await queueWith()
    expect(w.find('.rq-takedowns-toggle').text()).toBe('Taken down')
    expect(listTakedowns).not.toHaveBeenCalled()
    listTakedowns.mockResolvedValue({ items: [artItem('8', { status: 'hidden' })] })
    await w.find('.rq-takedowns-toggle').trigger('click')
    await flushPromises()
    expect(listTakedowns).toHaveBeenCalledWith('tok')
    expect(w.find('.rq-takedowns').findAll('.rq-mine-row')).toHaveLength(1)
  })
})

describe('ReviewQueue: recent activity', () => {
  const logged = { id: '9', itemId: '1', action: 'approved', actor: { id: '2', username: 'invented' }, note: '', createdAt: '2026-11-01T08:00:00.000Z' }

  it('has a "Recent activity" button under the queue that loads nothing until it is tapped', async () => {
    const w = await queueWith()
    expect(w.find('.rq-events-toggle').text()).toBe('Recent activity')
    expect(listEvents).not.toHaveBeenCalled()
    expect(w.findAll('.rq-event')).toHaveLength(0)

    listEvents.mockResolvedValue({ events: [logged], next: null })
    await w.find('.rq-events-toggle').trigger('click')
    await flushPromises()
    expect(listEvents).toHaveBeenCalledWith('tok', null)
    expect(w.findAll('.rq-event')).toHaveLength(1)
  })

  it('is there when the queue is empty too', async () => {
    const w = await queueWith([])
    expect(w.text()).toContain('Nothing waiting for review.')
    expect(w.find('.rq-events-toggle').exists()).toBe(true)
  })
})

describe('ReviewQueue: the poll status line', () => {
  it('says when the clips poll last ran and last succeeded', async () => {
    const w = await queueWith()
    const line = w.find('.rq-sync').text()
    expect(line).toBe(
      `Clips poll: last run ${new Date(SYNC.lastRunAt).toLocaleString()}, last success ${new Date(SYNC.lastOkAt).toLocaleString()}`,
    )
    expect(w.find('.rq-sync-error').exists()).toBe(false)
  })

  it('says "never" for a poll that has not run or not succeeded', async () => {
    const w = await queueWith([], { lastRunAt: null, lastOkAt: null, lastError: null })
    expect(w.find('.rq-sync').text()).toBe('Clips poll: last run never, last success never')
  })

  it('shows the last error in red', async () => {
    const w = await queueWith([], { ...SYNC, lastError: 'Discord said 403: Missing Access' })
    const error = w.find('.rq-sync-error')
    expect(error.text()).toContain('Discord said 403: Missing Access')
    expect(error.classes()).toContain('rq-error')
  })

  it('shows the error as plain text', async () => {
    const w = await queueWith([], { ...SYNC, lastError: '<b>boom</b>' })
    expect(w.find('.rq-sync-error').text()).toContain('<b>boom</b>')
    expect(w.find('.rq-sync-error b').exists()).toBe(false)
  })
})

describe('ReviewQueue: Approve', () => {
  it('approves the piece by its id and fetches the queue again', async () => {
    const w = await queueWith()
    approve.mockResolvedValue({ item: {} })
    listReview.mockResolvedValue({ items: [pending()[1]], sync: SYNC })
    await button(entries(w)[0], 'Approve').trigger('click')
    await flushPromises()
    expect(approve).toHaveBeenCalledWith('1', 'tok')
    expect(entries(w)).toHaveLength(1)
    expect(entries(w)[0].text()).toContain('Second piece')
  })

  it('says what went wrong and leaves the piece in the queue', async () => {
    const w = await queueWith()
    approve.mockRejectedValue(apiError(409, 'That piece has already been decided.'))
    await button(entries(w)[0], 'Approve').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('That piece has already been decided.')
    expect(entries(w)).toHaveLength(2)
  })

  it('cannot be tapped twice while it is going through', async () => {
    const w = await queueWith()
    const d = deferred()
    approve.mockReturnValue(d.promise)
    await button(entries(w)[0], 'Approve').trigger('click')
    expect(button(entries(w)[0], 'Approve').attributes('disabled')).toBeDefined()
    await button(entries(w)[0], 'Approve').trigger('click')
    expect(approve).toHaveBeenCalledTimes(1)
    d.resolve({ item: {} })
    await flushPromises()
  })
})

describe('ReviewQueue: Reject', () => {
  const open = async (w, at = 0) => {
    await button(entries(w)[at], 'Reject').trigger('click')
    return entries(w)[at]
  }

  it('reveals a "Why?" box on that piece only, with a Confirm that waits for a reason', async () => {
    const w = await queueWith()
    const entry = await open(w)
    const why = entry.find('textarea')
    expect(why.exists()).toBe(true)
    expect(why.attributes('maxlength')).toBe('500')
    expect(why.element.closest('label').textContent).toContain('Why?')
    expect(button(entry, 'Confirm').attributes('disabled')).toBeDefined()
    expect(entries(w)[1].find('textarea').exists()).toBe(false)
    expect(reject).not.toHaveBeenCalled()
  })

  it('keeps Confirm disabled for spaces, and enables it for a real reason', async () => {
    const w = await queueWith()
    const entry = await open(w)
    await entry.find('textarea').setValue('    ')
    expect(button(entry, 'Confirm').attributes('disabled')).toBeDefined()
    await entry.find('textarea').setValue('  Too dark to see.  ')
    expect(button(entry, 'Confirm').attributes('disabled')).toBeUndefined()
    await entry.find('textarea').setValue('')
    expect(button(entry, 'Confirm').attributes('disabled')).toBeDefined()
  })

  it('does not send a rejection with no reason, even from the keyboard', async () => {
    const w = await queueWith()
    const entry = await open(w)
    await entry.find('form').trigger('submit')
    expect(reject).not.toHaveBeenCalled()
  })

  it('rejects with the trimmed reason and fetches the queue again', async () => {
    const w = await queueWith()
    reject.mockResolvedValue({ item: {} })
    listReview.mockResolvedValue({ items: [pending()[1]], sync: SYNC })
    const entry = await open(w)
    await entry.find('textarea').setValue('  Too dark to see.  ')
    await button(entry, 'Confirm').trigger('click')
    await flushPromises()
    expect(reject).toHaveBeenCalledWith('1', 'Too dark to see.', 'tok')
    expect(entries(w)).toHaveLength(1)
    expect(entries(w)[0].find('textarea').exists()).toBe(false)
  })

  it('goes back to Approve and Reject on Cancel, with nothing sent and the reason forgotten', async () => {
    const w = await queueWith()
    let entry = await open(w)
    await entry.find('textarea').setValue('Too dark.')
    await button(entry, 'Cancel').trigger('click')
    entry = entries(w)[0]
    expect(entry.find('textarea').exists()).toBe(false)
    expect(button(entry, 'Approve')).toBeTruthy()
    expect(reject).not.toHaveBeenCalled()
    entry = await open(w)
    expect(entry.find('textarea').element.value).toBe('')
  })

  it('moves the box to another piece when its Reject is tapped', async () => {
    const w = await queueWith()
    await open(w, 0)
    await open(w, 1)
    expect(entries(w)[0].find('textarea').exists()).toBe(false)
    expect(entries(w)[1].find('textarea').exists()).toBe(true)
  })

  it('keeps the box and the reason when the rejection fails, and says why', async () => {
    const w = await queueWith()
    reject.mockRejectedValue(apiError(409, 'That piece has already been decided.'))
    const entry = await open(w)
    await entry.find('textarea').setValue('Too dark.')
    await button(entry, 'Confirm').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('That piece has already been decided.')
    expect(entries(w)[0].find('textarea').element.value).toBe('Too dark.')
  })
})
