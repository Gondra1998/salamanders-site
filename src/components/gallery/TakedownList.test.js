// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { artItem, galleryItem } from '../../test-utils/galleryItem'

const state = vi.hoisted(() => ({ auth: null }))
vi.mock('../../stores/auth', () => ({ useAuth: () => state.auth }))
vi.mock('../../lib/gallery/api')
import { eraseFile, listTakedowns } from '../../lib/gallery/api'
import TakedownList from './TakedownList.vue'

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

const mounted = []
const mountList = () => {
  const w = mount(TakedownList)
  mounted.push(w)
  return w
}
const toggle = (w) => w.find('.rq-takedowns-toggle')
const open = async (w) => {
  await toggle(w).trigger('click')
  await flushPromises()
}
const rows = (w) => w.findAll('.rq-mine-row')
const button = (row, text) => row.findAll('button').find((b) => b.text() === text)
const listOf = async (items) => {
  listTakedowns.mockResolvedValue({ items })
  const w = mountList()
  await open(w)
  return w
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  state.auth = reactive({ token: 'tok', member: { id: '100000000000000009', isMember: true } })
})
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

describe('TakedownList: shut until asked for', () => {
  it('asks the server for nothing until it is opened, and says so to a screen reader', async () => {
    const w = mountList()
    await flushPromises()
    expect(listTakedowns).not.toHaveBeenCalled()
    expect(toggle(w).text()).toBe('Taken down')
    expect(toggle(w).attributes('aria-expanded')).toBe('false')
    expect(toggle(w).attributes('aria-controls')).toBeUndefined()
  })

  it('loads once on the first open, with the token, and not again on the next', async () => {
    const w = await listOf([artItem('4', { status: 'hidden' })])
    expect(listTakedowns).toHaveBeenCalledWith('tok')
    expect(toggle(w).attributes('aria-expanded')).toBe('true')
    expect(toggle(w).attributes('aria-controls')).toBe('rq-takedowns-body')
    expect(w.find('#rq-takedowns-body').exists()).toBe(true)
    await open(w)
    expect(w.find('#rq-takedowns-body').exists()).toBe(false)
    await open(w)
    expect(listTakedowns).toHaveBeenCalledTimes(1)
  })

  it('says it is loading until the list arrives, and does not ask twice meanwhile', async () => {
    const d = deferred()
    listTakedowns.mockReturnValue(d.promise)
    const w = mountList()
    await open(w)
    expect(w.text()).toContain('Loading…')
    await open(w)
    await open(w)
    expect(listTakedowns).toHaveBeenCalledTimes(1)
    d.resolve({ items: [] })
    await flushPromises()
    expect(w.text()).not.toContain('Loading…')
  })

  it('asks again on the next open after a failure, and shows why it failed', async () => {
    listTakedowns.mockRejectedValueOnce(apiError(503, 'Discord is not answering.'))
    const w = mountList()
    await open(w)
    expect(w.find('[role="alert"]').text()).toBe('Discord is not answering.')
    expect(w.text()).not.toContain('Nothing taken down holds a file.')
    listTakedowns.mockResolvedValue({ items: [] })
    await open(w)
    await open(w)
    expect(listTakedowns).toHaveBeenCalledTimes(2)
    expect(w.text()).toContain('Nothing taken down holds a file.')
  })
})

describe('TakedownList: the rows', () => {
  it('names each piece, what it is, who posted it, when, and how it was taken down, as plain text', async () => {
    const art = artItem('4', { status: 'hidden', title: 'A <b>bold</b> piece' })
    const clip = galleryItem('5', { status: 'rejected', title: '' })
    const removed = artItem('6', { status: 'removed', title: '' })
    const w = await listOf([art, clip, removed])
    const [a, c, r] = rows(w)
    expect(a.text()).toContain('A <b>bold</b> piece')
    expect(a.find('b').exists()).toBe(false)
    expect(a.text()).toContain('Artwork')
    expect(a.text()).toContain(art.author.name)
    expect(a.text()).toContain(new Date(art.postedAt).toLocaleDateString())
    expect(a.find('.rq-chip').text()).toBe('Hidden')
    expect(a.find('.rq-chip').attributes('data-status')).toBe('hidden')
    expect(c.find('.rq-title').text()).toBe('Clip')
    expect(c.find('.rq-chip').text()).toBe('Rejected')
    expect(r.find('.rq-title').text()).toBe('Artwork')
    expect(r.find('.rq-chip').text()).toBe('Removed')
  })

  it('shows a status it does not know as the server sent it', async () => {
    const w = await listOf([artItem('4', { status: 'quarantined' })])
    expect(rows(w)[0].find('.rq-chip').text()).toBe('quarantined')
  })
})

describe('TakedownList: Delete for good', () => {
  it('asks first, in the row, and Keep leaves the piece alone', async () => {
    const w = await listOf([artItem('4', { status: 'hidden' }), artItem('5', { status: 'removed' })])
    await button(rows(w)[0], 'Delete for good').trigger('click')
    expect(rows(w)[0].text()).toContain("Delete the file for good? It can't be brought back.")
    expect(rows(w)[1].text()).not.toContain('Delete the file for good?')
    await button(rows(w)[0], 'Keep').trigger('click')
    expect(rows(w)[0].text()).not.toContain('Delete the file for good?')
    expect(eraseFile).not.toHaveBeenCalled()
  })

  it('Delete deletes the file and the piece leaves the list', async () => {
    const w = await listOf([artItem('4', { status: 'hidden' }), artItem('5', { status: 'removed' })])
    eraseFile.mockResolvedValue(null)
    listTakedowns.mockResolvedValue({ items: [artItem('5', { status: 'removed' })] })
    await button(rows(w)[0], 'Delete for good').trigger('click')
    await button(rows(w)[0], 'Delete').trigger('click')
    await flushPromises()
    expect(eraseFile).toHaveBeenCalledWith('4', 'tok')
    expect(rows(w).map((r) => r.find('.rq-chip').text())).toEqual(['Removed'])
    expect(w.text()).not.toContain('Delete the file for good?')
  })

  it('holds both buttons while the delete is on its way, so it cannot be sent twice', async () => {
    const w = await listOf([artItem('4', { status: 'hidden' })])
    const d = deferred()
    eraseFile.mockReturnValue(d.promise)
    listTakedowns.mockResolvedValue({ items: [] })
    await button(rows(w)[0], 'Delete for good').trigger('click')
    await button(rows(w)[0], 'Delete').trigger('click')
    expect(button(rows(w)[0], 'Delete').attributes('disabled')).toBeDefined()
    expect(button(rows(w)[0], 'Keep').attributes('disabled')).toBeDefined()
    await button(rows(w)[0], 'Delete').trigger('click')
    expect(eraseFile).toHaveBeenCalledTimes(1)
    d.resolve(null)
    await flushPromises()
    expect(rows(w)).toHaveLength(0)
  })

  it('says why when the server refuses, and keeps the piece listed', async () => {
    const w = await listOf([artItem('4', { status: 'hidden' })])
    eraseFile.mockRejectedValue(apiError(409, 'That item has already moved on.'))
    await button(rows(w)[0], 'Delete for good').trigger('click')
    await button(rows(w)[0], 'Delete').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('That item has already moved on.')
    expect(rows(w)).toHaveLength(1)
    expect(button(rows(w)[0], 'Delete for good')).toBeTruthy()
  })

  it('says the delete went through when only the list could not be fetched again', async () => {
    const w = await listOf([artItem('4', { status: 'hidden' })])
    eraseFile.mockResolvedValue(null)
    listTakedowns.mockRejectedValue(apiError(503, 'Discord is not answering.'))
    await button(rows(w)[0], 'Delete for good').trigger('click')
    await button(rows(w)[0], 'Delete').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe("The change was saved, but the list couldn't be refreshed.")
    expect(rows(w)).toHaveLength(0)
  })
})
