import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../lib/gallery/api')
import {
  getMe,
  listClips,
  listArt,
  listMine,
  listReview,
  listEvents,
  submitArt,
  removeItem,
  approve,
  reject,
  hide,
} from '../lib/gallery/api'
import { useGallery } from './gallery'

const apiError = (status, message = 'nope') => Object.assign(new Error(message), { status })
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
// Let a call that is already running get as far as its API request.
const tick = () => new Promise((r) => setTimeout(r, 0))
// The id is invented, like every value here.
const item = (id, extra = {}) => ({ id: String(id), title: `Item ${id}`, status: 'approved', ...extra })

const INITIAL = {
  status: 'idle',
  approver: false,
  clips: { items: [], next: null, loading: false },
  art: { items: [], next: null, loading: false },
  mine: [],
  review: { items: [], sync: null },
  events: { items: [], next: null },
  error: '',
}

let s
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  s = useGallery()
})

describe('gallery store: who may see it', () => {
  it('starts idle with nothing in it', () => {
    expect(s.$state).toEqual(INITIAL)
  })

  it('does not keep an earlier approver while it checks again, not even for an instant', () => {
    s.$patch({ status: 'allowed', approver: true })
    getMe.mockReturnValue(deferred().promise)
    s.load('tok') // not awaited: the state straight after the call is what a render would see
    expect(s).toMatchObject({ status: 'checking', approver: false })
  })

  it('forgets an earlier error when it checks again', async () => {
    s.error = 'old trouble'
    getMe.mockResolvedValue({ access: true, approver: false })
    await s.load('tok')
    expect(s.error).toBe('')
    s.error = 'old trouble'
    await s.load(null)
    expect(s.error).toBe('')
  })

  it('sends someone with no token to sign in, without asking the server', async () => {
    for (const token of [null, undefined, '']) {
      s.$patch({ approver: true })
      await s.load(token)
      expect(s, String(token)).toMatchObject({ status: 'signin', approver: false })
    }
    expect(getMe).not.toHaveBeenCalled()
  })

  it('shows checking while it asks, then allowed', async () => {
    const d = deferred()
    getMe.mockReturnValue(d.promise)
    const p = s.load('tok')
    await tick()
    expect(s.status).toBe('checking')
    expect(getMe).toHaveBeenCalledWith('tok')
    d.resolve({ access: true, approver: false })
    await p
    expect(s).toMatchObject({ status: 'allowed', approver: false })
  })

  it('reports an approver only for someone who has access', async () => {
    getMe.mockResolvedValue({ access: true, approver: true })
    await s.load('tok')
    expect(s).toMatchObject({ status: 'allowed', approver: true })

    // the server contradicting itself must not make an approver of someone refused
    getMe.mockResolvedValue({ access: false, approver: true })
    await s.load('tok')
    expect(s).toMatchObject({ status: 'denied', approver: false })
  })

  it('fails closed on an answer that is not a plain yes', async () => {
    for (const body of [{}, null, undefined, { access: 'yes' }, { access: 1 }, { access: 'true', approver: true }]) {
      getMe.mockResolvedValue(body)
      await s.load('tok')
      expect(s, JSON.stringify(body)).toMatchObject({ status: 'denied', approver: false })
    }
    for (const approver of ['yes', 1, 'true', undefined]) {
      getMe.mockResolvedValue({ access: true, approver })
      await s.load('tok')
      expect(s, String(approver)).toMatchObject({ status: 'allowed', approver: false })
    }
  })

  it('answers 401 with signin, 403 with denied, and anything else with unavailable', async () => {
    getMe.mockRejectedValue(apiError(401))
    await s.load('tok')
    expect(s.status).toBe('signin')
    getMe.mockRejectedValue(apiError(403))
    await s.load('tok')
    expect(s.status).toBe('denied')
    for (const err of [apiError(500), apiError(503), new TypeError('Failed to fetch'), undefined]) {
      getMe.mockRejectedValue(err)
      await s.load('tok')
      expect(s.status, String(err)).toBe('unavailable')
    }
  })

  it('does not stay an approver after a failed check', async () => {
    getMe.mockResolvedValue({ access: true, approver: true })
    await s.load('tok')
    getMe.mockRejectedValue(apiError(503))
    await s.load('tok')
    expect(s).toMatchObject({ status: 'unavailable', approver: false })
  })

  it('reset() puts everything back as it was at the start', async () => {
    getMe.mockResolvedValue({ access: true, approver: true })
    await s.load('tok')
    s.$patch({
      clips: { items: [item(1)], next: '1', loading: true },
      art: { items: [item(2)], next: '2', loading: true },
      mine: [item(3)],
      review: { items: [item(4)], sync: { lastRunAt: 'x', lastOkAt: 'y', lastError: null } },
      error: 'broken',
    })
    s.reset()
    expect(s.$state).toEqual(INITIAL)
  })

  it('drops an answer that arrives after reset()', async () => {
    const d = deferred()
    getMe.mockReturnValue(d.promise)
    const p = s.load('tok')
    await tick()
    s.reset()
    d.resolve({ access: true, approver: true })
    await p
    expect(s.$state).toEqual(INITIAL)
  })

  it('drops a failure that arrives after reset()', async () => {
    const d = deferred()
    getMe.mockReturnValue(d.promise)
    const p = s.load('tok')
    await tick()
    s.reset()
    d.reject(apiError(503))
    await p
    expect(s.$state).toEqual(INITIAL)
  })

  it('drops an older answer that arrives after a newer load has finished', async () => {
    const slow = deferred()
    getMe.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ access: false, approver: false })
    const first = s.load('old')
    await tick()
    await s.load('new')
    expect(s.status).toBe('denied')
    slow.resolve({ access: true, approver: true })
    await first
    expect(s).toMatchObject({ status: 'denied', approver: false })
  })

  it('drops the answers of every earlier load after reset(), not only the latest one', async () => {
    const first = deferred()
    const second = deferred()
    getMe.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = s.load('a')
    await tick()
    const b = s.load('b')
    await tick()
    s.reset()
    first.resolve({ access: true, approver: true })
    await a
    expect(s.$state).toEqual(INITIAL)
    second.resolve({ access: true, approver: true })
    await b
    expect(s.$state).toEqual(INITIAL)
  })
})

describe.each([
  ['clips', listClips, listArt],
  ['art', listArt, listClips],
])('gallery store: the %s list', (kind, list, otherList) => {
  const page = (ids, next) => ({ items: ids.map((id) => item(id)), next })

  it('refresh() empties the list at once, then fills it with the first page', async () => {
    s.$patch({ [kind]: { items: [item(9)], next: '9', loading: false } })
    const d = deferred()
    list.mockReturnValue(d.promise)
    const p = s.refresh(kind, 'tok')
    expect(s[kind]).toEqual({ items: [], next: null, loading: true })
    d.resolve(page([3, 2], '2'))
    await p
    expect(list).toHaveBeenCalledWith('tok', null)
    expect(s[kind]).toEqual({ items: [item(3), item(2)], next: '2', loading: false })
  })

  it('refresh() does not touch the other list', async () => {
    const other = kind === 'clips' ? 'art' : 'clips'
    s.$patch({ [other]: { items: [item(9)], next: '9', loading: false } })
    list.mockResolvedValue(page([1], null))
    await s.refresh(kind, 'tok')
    expect(s[other]).toEqual({ items: [item(9)], next: '9', loading: false })
  })

  it('more() asks for the page after the cursor and adds it to the end', async () => {
    s.$patch({ [kind]: { items: [item(3), item(2)], next: '2', loading: false } })
    list.mockResolvedValue(page([1], null))
    await s.more(kind, 'tok')
    expect(list).toHaveBeenCalledWith('tok', '2')
    expect(s[kind]).toEqual({ items: [item(3), item(2), item(1)], next: null, loading: false })
  })

  it('more() shows loading while it asks', async () => {
    s.$patch({ [kind]: { items: [item(3)], next: '3', loading: false } })
    const d = deferred()
    list.mockReturnValue(d.promise)
    const p = s.more(kind, 'tok')
    expect(s[kind].loading).toBe(true)
    d.resolve(page([2], '2'))
    await p
    expect(s[kind].loading).toBe(false)
  })

  it('more() does not ask twice while it is already asking', async () => {
    s.$patch({ [kind]: { items: [item(3)], next: '3', loading: false } })
    const d = deferred()
    list.mockReturnValue(d.promise)
    const a = s.more(kind, 'tok')
    const b = s.more(kind, 'tok')
    d.resolve(page([2], null))
    await Promise.all([a, b])
    expect(list).toHaveBeenCalledTimes(1)
    expect(s[kind].items).toEqual([item(3), item(2)])
  })

  it('reads an answer with no cursor as the end of the list, for refresh() and more() alike', async () => {
    list.mockResolvedValue({ items: [item(2)] })
    await s.refresh(kind, 'tok')
    expect(s[kind].next).toBeNull()
    s.$patch({ [kind]: { next: '2' } })
    await s.more(kind, 'tok')
    expect(s[kind].next).toBeNull()
  })

  it('more() does nothing at the end of the list, where it would only fetch the first page again', async () => {
    s.$patch({ [kind]: { items: [item(1)], next: null, loading: false } })
    await s.more(kind, 'tok')
    expect(list).not.toHaveBeenCalled()
    expect(s[kind].items).toEqual([item(1)])
  })

  it('more() that fails keeps what was there, stops loading, reports it and rethrows', async () => {
    s.$patch({ [kind]: { items: [item(3)], next: '3', loading: false } })
    list.mockRejectedValue(apiError(503, 'Discord is not answering.'))
    await expect(s.more(kind, 'tok')).rejects.toMatchObject({ status: 503 })
    expect(s[kind]).toEqual({ items: [item(3)], next: '3', loading: false })
    expect(s.error).toBe('Discord is not answering.')
  })

  it('refresh() that fails leaves the list empty, stops loading, reports it and rethrows', async () => {
    s.$patch({ [kind]: { items: [item(3)], next: '3', loading: false } })
    list.mockRejectedValue(apiError(500, 'Boom.'))
    await expect(s.refresh(kind, 'tok')).rejects.toMatchObject({ status: 500 })
    expect(s[kind]).toEqual({ items: [], next: null, loading: false })
    expect(s.error).toBe('Boom.')
  })

  // A page asked for before a reset() or a refresh() of the same list is out of date: it must not land in what
  // came after (sign-out empties the store; a refresh starts the list again from the first page).
  describe('a page that lands after the list has moved on', () => {
    const EMPTY = { items: [], next: null, loading: false }
    const loaded = { items: [item(3)], next: '3', loading: false }

    it('more() answered after reset() leaves the list empty', async () => {
      s.$patch({ [kind]: loaded })
      const d = deferred()
      list.mockReturnValue(d.promise)
      const p = s.more(kind, 'tok')
      s.reset()
      d.resolve(page([2], '2'))
      await p
      expect(s[kind]).toEqual(EMPTY)
    })

    it('refresh() answered after reset() leaves the list empty', async () => {
      const d = deferred()
      list.mockReturnValue(d.promise)
      const p = s.refresh(kind, 'tok')
      s.reset()
      d.resolve(page([2], '2'))
      await p
      expect(s[kind]).toEqual(EMPTY)
    })

    it('more() answered after a later refresh() is dropped, and the refresh lands', async () => {
      s.$patch({ [kind]: loaded })
      const stale = deferred()
      const fresh = deferred()
      list.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
      const more = s.more(kind, 'tok')
      const refresh = s.refresh(kind, 'tok')
      fresh.resolve(page([9], '9'))
      await refresh
      stale.resolve(page([2], '2'))
      await more
      expect(s[kind]).toEqual({ items: [item(9)], next: '9', loading: false })
    })

    it('more() answered while a later refresh() is still asking does not stop its loading', async () => {
      s.$patch({ [kind]: loaded })
      const stale = deferred()
      const fresh = deferred()
      list.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
      const more = s.more(kind, 'tok')
      const refresh = s.refresh(kind, 'tok')
      stale.resolve(page([2], '2'))
      await more
      expect(s[kind]).toEqual({ items: [], next: null, loading: true })
      fresh.resolve(page([9], null))
      await refresh
      expect(s[kind]).toEqual({ items: [item(9)], next: null, loading: false })
    })

    it('an older refresh() answered after a newer one is dropped', async () => {
      const old = deferred()
      const newer = deferred()
      list.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise)
      const a = s.refresh(kind, 'tok')
      const b = s.refresh(kind, 'tok')
      newer.resolve(page([9], '9'))
      await b
      old.resolve(page([1], null))
      await a
      expect(s[kind]).toEqual({ items: [item(9)], next: '9', loading: false })
    })

    it('a failure of such a page is dropped too: no error, no throw, no loading left on', async () => {
      s.$patch({ [kind]: loaded })
      const stale = deferred()
      const fresh = deferred()
      list.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
      const more = s.more(kind, 'tok')
      const refresh = s.refresh(kind, 'tok')
      stale.reject(apiError(503, 'Discord is not answering.'))
      await expect(more).resolves.toBeUndefined()
      expect(s.error).toBe('')
      expect(s[kind].loading).toBe(true) // the refresh is still asking
      fresh.resolve(page([9], null))
      await refresh
      expect(s[kind]).toEqual({ items: [item(9)], next: null, loading: false })
    })

    it('a page stays out of date however many resets and refreshes came after it', async () => {
      // Each of these only ever counts forward: none of them can bring an older generation back round.
      for (const steps of [['reset', 'refresh'], ['refresh', 'reset'], ['reset', 'reset'], ['refresh', 'refresh']]) {
        setActivePinia(createPinia())
        vi.resetAllMocks()
        const t = useGallery()
        t.$patch({ [kind]: loaded })
        const stale = deferred()
        const later = deferred()
        list.mockReturnValueOnce(stale.promise).mockReturnValue(later.promise)
        const more = t.more(kind, 'tok')
        const rest = steps.map((step) => (step === 'reset' ? t.reset() : t.refresh(kind, 'tok')))
        stale.resolve(page([2], '2'))
        await more
        expect(t[kind].items, steps.join(' then ')).not.toContainEqual(item(2))
        later.resolve(page([9], null))
        await Promise.all(rest)
      }
    })

    it('a refresh of the other list does not make this one out of date', async () => {
      s.$patch({ [kind]: loaded })
      const d = deferred()
      list.mockReturnValue(d.promise)
      otherList.mockResolvedValue(page([8], null))
      const more = s.more(kind, 'tok')
      await s.refresh(kind === 'clips' ? 'art' : 'clips', 'tok')
      d.resolve(page([2], null))
      await more
      expect(s[kind]).toEqual({ items: [item(3), item(2)], next: null, loading: false })
    })
  })
})

describe('gallery store: a list that does not exist', () => {
  it.each([['mine'], ['review'], ['status'], ['error'], ['constructor'], ['__proto__'], ['toString'], [''], [undefined], [null], [7]])(
    'more() and refresh() throw a TypeError for %j before touching anything',
    async (kind) => {
      s.$patch({ mine: [item(1)], error: 'earlier' })
      const before = JSON.parse(JSON.stringify(s.$state))
      const message = `There is no "${String(kind)}" gallery list.`
      const more = await s.more(kind, 'tok').catch((e) => e)
      const refresh = await s.refresh(kind, 'tok').catch((e) => e)
      for (const err of [more, refresh]) {
        expect(err).toBeInstanceOf(TypeError)
        expect(err.message).toBe(message)
      }
      expect(JSON.parse(JSON.stringify(s.$state))).toEqual(before)
      expect(listClips).not.toHaveBeenCalled()
      expect(listArt).not.toHaveBeenCalled()
    },
  )

  it('does not let a refused kind disturb the lists that do exist', async () => {
    await expect(s.refresh('mine', 'tok')).rejects.toBeInstanceOf(TypeError)
    listClips.mockResolvedValue({ items: [item(1)], next: null })
    await s.refresh('clips', 'tok')
    expect(s.clips.items).toEqual([item(1)])
  })
})

describe('gallery store: my items and the review queue', () => {
  it('loadMine() fills my items', async () => {
    listMine.mockResolvedValue({ items: [item(5, { status: 'pending' }), item(4)] })
    await s.loadMine('tok')
    expect(listMine).toHaveBeenCalledWith('tok')
    expect(s.mine).toEqual([item(5, { status: 'pending' }), item(4)])
  })

  it('loadReview() fills the queue and the poll status', async () => {
    const sync = { lastRunAt: '2026-01-01T00:00:00.000Z', lastOkAt: '2026-01-01T00:00:00.000Z', lastError: null }
    listReview.mockResolvedValue({ items: [item(6, { status: 'pending' })], sync })
    await s.loadReview('tok')
    expect(listReview).toHaveBeenCalledWith('tok')
    expect(s.review).toEqual({ items: [item(6, { status: 'pending' })], sync })
  })

  it('loadReview() keeps no poll status when the server sent none', async () => {
    s.$patch({ review: { items: [], sync: { lastRunAt: 'x', lastOkAt: 'y', lastError: null } } })
    listReview.mockResolvedValue({ items: [] })
    await s.loadReview('tok')
    expect(s.review.sync).toBeNull()
  })

  it.each([
    ['loadMine', () => s.loadMine('tok'), listMine],
    ['loadReview', () => s.loadReview('tok'), listReview],
  ])('%s() that fails reports it, rethrows and keeps what was there', async (_name, call, api) => {
    s.$patch({ mine: [item(1)], review: { items: [item(2)], sync: null } })
    api.mockRejectedValue(apiError(403, 'Only approvers can do that.'))
    await expect(call()).rejects.toMatchObject({ status: 403 })
    expect(s.error).toBe('Only approvers can do that.')
    expect(s.mine).toEqual([item(1)])
    expect(s.review.items).toEqual([item(2)])
  })

  describe('an answer that lands after reset()', () => {
    it.each([
      ['loadMine', 'mine', () => s.loadMine('tok'), listMine, { items: [item(1)] }],
      ['loadReview', 'review', () => s.loadReview('tok'), listReview, { items: [item(2)], sync: { lastRunAt: 'x', lastOkAt: 'y', lastError: null } }],
    ])('%s() leaves the cleared store as it is', async (_name, _slice, call, api, reply) => {
      const d = deferred()
      api.mockReturnValue(d.promise)
      const p = call()
      s.reset()
      d.resolve(reply)
      await p
      expect(s.$state).toEqual(INITIAL)
    })

    it.each([
      ['loadMine', () => s.loadMine('tok'), listMine],
      ['loadReview', () => s.loadReview('tok'), listReview],
    ])('%s() drops a failure that lands then: no error left behind, nothing thrown', async (_name, call, api) => {
      const d = deferred()
      api.mockReturnValue(d.promise)
      const p = call()
      s.reset()
      d.reject(apiError(503, 'Discord is not answering.'))
      await expect(p).resolves.toBeUndefined()
      expect(s.$state).toEqual(INITIAL)
    })

    it('loadMine() still lands when only another list action came after it', async () => {
      const d = deferred()
      listMine.mockReturnValue(d.promise)
      listReview.mockResolvedValue({ items: [], sync: null })
      const p = s.loadMine('tok')
      await s.loadReview('tok')
      d.resolve({ items: [item(1)] })
      await p
      expect(s.mine).toEqual([item(1)])
    })

    it('is dropped as well when a new load() has started, since the clearance is being checked again', async () => {
      const d = deferred()
      listMine.mockReturnValue(d.promise)
      getMe.mockResolvedValue({ access: true, approver: false })
      const p = s.loadMine('tok')
      await s.load('tok')
      d.resolve({ items: [item(1)] })
      await p
      expect(s.mine).toEqual([])
    })
  })

  it('clears an earlier error when the next action starts', async () => {
    s.error = 'old trouble'
    listMine.mockResolvedValue({ items: [] })
    await s.loadMine('tok')
    expect(s.error).toBe('')
  })

  it('has something to show for a failure that carries no message', async () => {
    listMine.mockRejectedValue(undefined)
    await expect(s.loadMine('tok')).rejects.toBeUndefined()
    expect(s.error).not.toBe('')
  })
})

describe('gallery store: submitting art', () => {
  const form = { file: new File(['x'], 'a.png', { type: 'image/png' }), title: 'Banner', note: '' }

  it('sends the form and puts the new item first among mine', async () => {
    s.$patch({ mine: [item(1)] })
    const created = item(2, { status: 'pending' })
    submitArt.mockResolvedValue({ item: created })
    expect(await s.submit(form, 'tok')).toEqual(created)
    expect(submitArt).toHaveBeenCalledWith(form, 'tok')
    expect(s.mine).toEqual([created, item(1)])
  })

  it('leaves mine alone, reports the reason and rethrows when the server refuses', async () => {
    s.$patch({ mine: [item(1)] })
    submitArt.mockRejectedValue(apiError(415, 'That file is not a JPEG, PNG, WebP or GIF.'))
    await expect(s.submit(form, 'tok')).rejects.toMatchObject({ status: 415 })
    expect(s.mine).toEqual([item(1)])
    expect(s.error).toBe('That file is not a JPEG, PNG, WebP or GIF.')
  })
})

describe('gallery store: removing my own item', () => {
  it('removes it, then asks for my items again', async () => {
    removeItem.mockResolvedValue(null)
    listMine.mockResolvedValue({ items: [item(1)] })
    await s.remove('2', 'tok')
    expect(removeItem).toHaveBeenCalledWith('2', 'tok')
    expect(listMine).toHaveBeenCalledWith('tok')
    expect(s.mine).toEqual([item(1)])
  })

  it('takes it out of the galleries at once as well', async () => {
    s.$patch({
      clips: { items: [item(1), item(2)], next: null, loading: false },
      art: { items: [item(2), item(3)], next: null, loading: false },
    })
    removeItem.mockResolvedValue(null)
    listMine.mockResolvedValue({ items: [] })
    await s.remove('2', 'tok')
    expect(s.clips.items).toEqual([item(1)])
    expect(s.art.items).toEqual([item(3)])
  })

  it('reports it, rethrows and does not ask again when the server refuses', async () => {
    removeItem.mockRejectedValue(apiError(409, 'That item has already moved on.'))
    await expect(s.remove('2', 'tok')).rejects.toMatchObject({ status: 409 })
    expect(s.error).toBe('That item has already moved on.')
    expect(listMine).not.toHaveBeenCalled()
  })
})

describe('gallery store: what an approver does', () => {
  beforeEach(() => {
    listReview.mockResolvedValue({ items: [item(9, { status: 'pending' })], sync: null })
  })

  it('approve() approves, then asks for the review queue again', async () => {
    approve.mockResolvedValue({ item: item(1) })
    s.$patch({ art: { items: [item(1)], next: null, loading: false } })
    await s.approve('1', 'tok')
    expect(approve).toHaveBeenCalledWith('1', 'tok')
    expect(listReview).toHaveBeenCalledWith('tok')
    expect(s.review.items).toEqual([item(9, { status: 'pending' })])
    expect(s.art.items).toEqual([item(1)])
  })

  it('reject() sends the reason, then asks for the review queue again', async () => {
    reject.mockResolvedValue({ item: item(1, { status: 'rejected' }) })
    await s.reject('1', 'Too blurry', 'tok')
    expect(reject).toHaveBeenCalledWith('1', 'Too blurry', 'tok')
    expect(listReview).toHaveBeenCalledWith('tok')
  })

  it('hide() sends the note, drops the item from both galleries and asks for the queue again', async () => {
    s.$patch({
      clips: { items: [item(1), item(2)], next: '1', loading: false },
      art: { items: [item(2), item(3)], next: null, loading: false },
    })
    hide.mockResolvedValue({ item: item(2, { status: 'hidden' }) })
    await s.hide('2', 'Off topic', 'tok')
    expect(hide).toHaveBeenCalledWith('2', 'Off topic', 'tok')
    expect(s.clips).toEqual({ items: [item(1)], next: '1', loading: false })
    expect(s.art).toEqual({ items: [item(3)], next: null, loading: false })
    expect(listReview).toHaveBeenCalledWith('tok')
  })

  it('hide() still drops the item when the queue cannot be fetched again, and says so', async () => {
    s.$patch({ clips: { items: [item(2)], next: null, loading: false } })
    hide.mockResolvedValue({ item: item(2, { status: 'hidden' }) })
    listReview.mockRejectedValue(apiError(503, 'Discord is not answering.'))
    await expect(s.hide('2', '', 'tok')).rejects.toMatchObject({ status: 503 })
    expect(s.clips.items).toEqual([])
    expect(s.error).toBe('Discord is not answering.')
  })

  it.each([
    ['approve', () => s.approve('1', 'tok'), approve],
    ['reject', () => s.reject('1', 'why', 'tok'), reject],
    ['hide', () => s.hide('1', 'why', 'tok'), hide],
  ])('%s() that is refused reports it, rethrows and changes nothing', async (_name, call, api) => {
    s.$patch({
      clips: { items: [item(1)], next: null, loading: false },
      review: { items: [item(1, { status: 'pending' })], sync: null },
    })
    api.mockRejectedValue(apiError(409, 'That item has already moved on.'))
    await expect(call()).rejects.toMatchObject({ status: 409 })
    expect(s.error).toBe('That item has already moved on.')
    expect(listReview).not.toHaveBeenCalled()
    expect(s.clips.items).toEqual([item(1)])
    expect(s.review.items).toEqual([item(1, { status: 'pending' })])
  })
})

describe('gallery store: the activity log', () => {
  // The audit rows for approvers, newest first, a page at a time. Ids are invented.
  const event = (id, extra = {}) => ({
    id: String(id),
    itemId: '1',
    action: 'approved',
    actor: { id: '100000000000000001', username: 'invented' },
    note: '',
    createdAt: '2026-11-01T08:00:00.000Z',
    ...extra,
  })

  it('loadEvents() fills the first page and its cursor', async () => {
    listEvents.mockResolvedValue({ events: [event(9), event(8)], next: '8' })
    await s.loadEvents('tok')
    expect(listEvents).toHaveBeenCalledWith('tok', null)
    expect(s.events).toEqual({ items: [event(9), event(8)], next: '8' })
  })

  it('loadEvents() starts again from the newest: it replaces what was there', async () => {
    s.$patch({ events: { items: [event(5)], next: '5' } })
    listEvents.mockResolvedValue({ events: [event(9)], next: null })
    await s.loadEvents('tok')
    expect(s.events).toEqual({ items: [event(9)], next: null })
  })

  it('treats a reply with no cursor as the end of the log', async () => {
    listEvents.mockResolvedValue({ events: [event(1)] })
    await s.loadEvents('tok')
    expect(s.events.next).toBeNull()
  })

  it('moreEvents() asks for the page after the cursor and adds it to the end', async () => {
    s.$patch({ events: { items: [event(9), event(8)], next: '8' } })
    listEvents.mockResolvedValue({ events: [event(7)], next: null })
    await s.moreEvents('tok')
    expect(listEvents).toHaveBeenCalledWith('tok', '8')
    expect(s.events).toEqual({ items: [event(9), event(8), event(7)], next: null })
  })

  it('moreEvents() with no cursor asks for nothing: that is the end, and a first page would repeat the log', async () => {
    s.$patch({ events: { items: [event(9)], next: null } })
    await s.moreEvents('tok')
    expect(listEvents).not.toHaveBeenCalled()
    expect(s.events.items).toEqual([event(9)])
  })

  it('moreEvents() asked twice for the same page adds it once', async () => {
    s.$patch({ events: { items: [event(9)], next: '9' } })
    const d = deferred()
    listEvents.mockReturnValue(d.promise)
    const first = s.moreEvents('tok')
    const second = s.moreEvents('tok')
    d.resolve({ events: [event(8)], next: null })
    await Promise.all([first, second])
    expect(s.events.items).toEqual([event(9), event(8)])
  })

  it('moreEvents() drops its page when the log was started again meanwhile', async () => {
    s.$patch({ events: { items: [event(9)], next: '9' } })
    const d = deferred()
    listEvents.mockReturnValueOnce(d.promise)
    const more = s.moreEvents('tok')
    listEvents.mockResolvedValueOnce({ events: [event(20), event(19)], next: '19' })
    await s.loadEvents('tok')
    d.resolve({ events: [event(8)], next: null })
    await more
    expect(s.events).toEqual({ items: [event(20), event(19)], next: '19' })
  })

  it.each([
    ['loadEvents', () => s.loadEvents('tok')],
    ['moreEvents', () => s.moreEvents('tok')],
  ])('%s() that fails reports it, rethrows and keeps the log as it was', async (_name, call) => {
    s.$patch({ events: { items: [event(9)], next: '9' } })
    listEvents.mockRejectedValue(apiError(403, 'Only approvers can do that.'))
    await expect(call()).rejects.toMatchObject({ status: 403 })
    expect(s.error).toBe('Only approvers can do that.')
    expect(s.events).toEqual({ items: [event(9)], next: '9' })
  })

  describe('an answer that lands after reset() or a new load()', () => {
    it.each([
      ['loadEvents', () => s.loadEvents('tok')],
      ['moreEvents', () => s.moreEvents('tok')],
    ])('%s() leaves the cleared store as it is', async (name, call) => {
      if (name === 'moreEvents') s.$patch({ events: { items: [event(9)], next: '9' } })
      const d = deferred()
      listEvents.mockReturnValue(d.promise)
      const p = call()
      s.reset()
      d.resolve({ events: [event(1)], next: null })
      await p
      expect(s.$state).toEqual(INITIAL)
    })

    it('drops a failure that lands then: no error left behind, nothing thrown', async () => {
      const d = deferred()
      listEvents.mockReturnValue(d.promise)
      const p = s.loadEvents('tok')
      s.reset()
      d.reject(apiError(503, 'Discord is not answering.'))
      await expect(p).resolves.toBeUndefined()
      expect(s.$state).toEqual(INITIAL)
    })

    it('is dropped as well when a new load() has started, since the clearance is being checked again', async () => {
      const d = deferred()
      listEvents.mockReturnValue(d.promise)
      getMe.mockResolvedValue({ access: true, approver: true })
      const p = s.loadEvents('tok')
      await s.load('tok')
      d.resolve({ events: [event(1)], next: null })
      await p
      expect(s.events).toEqual({ items: [], next: null })
    })
  })
})
