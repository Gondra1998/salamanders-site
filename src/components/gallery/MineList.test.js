// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { galleryItem, artItem } from '../../test-utils/galleryItem'

const state = vi.hoisted(() => ({ auth: null }))
vi.mock('../../stores/auth', () => ({ useAuth: () => state.auth }))
vi.mock('../../lib/gallery/api')
import { listMine, removeItem } from '../../lib/gallery/api'
import { useGallery } from '../../stores/gallery'
import MineList from './MineList.vue'

const apiError = (status, message = 'nope') => Object.assign(new Error(message), { status })
const deferred = () => {
  let resolve
  const promise = new Promise((res) => (resolve = res))
  return { promise, resolve }
}

const mounted = []
const mineWith = async (items) => {
  listMine.mockResolvedValue({ items })
  const w = mount(MineList)
  mounted.push(w)
  await flushPromises()
  return w
}
const rows = (w) => w.findAll('.rq-mine-row')
const button = (row, text) => row.findAll('button').find((b) => b.text() === text)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  state.auth = reactive({ token: 'tok', member: { id: '100000000000000001', isMember: true } })
})
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

describe('MineList: loading', () => {
  it('fetches the list on its own with the token, and says it is loading until it arrives', async () => {
    const d = deferred()
    listMine.mockReturnValue(d.promise)
    const w = mount(MineList)
    mounted.push(w)
    expect(listMine).toHaveBeenCalledWith('tok')
    expect(w.text()).toContain('Loading…')
    d.resolve({ items: [artItem('1', { status: 'pending' })] })
    await flushPromises()
    expect(w.text()).not.toContain('Loading…')
    expect(rows(w)).toHaveLength(1)
  })

  it('says there is nothing yet for someone who has posted nothing', async () => {
    const w = await mineWith([])
    expect(w.text()).toContain('Nothing here yet.')
    expect(rows(w)).toHaveLength(0)
  })

  it('shows why it failed, and not the empty message', async () => {
    listMine.mockRejectedValue(apiError(503, 'The Reliquarium is not set up yet.'))
    const w = mount(MineList)
    mounted.push(w)
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('The Reliquarium is not set up yet.')
    expect(w.text()).not.toContain('Nothing here yet.')
  })
})

describe('MineList: the status chips', () => {
  it('shows each item with its title, what it is, and a chip for where it stands', async () => {
    const w = await mineWith([
      artItem('1', { status: 'pending', title: 'Waiting piece' }),
      artItem('2', { status: 'approved', title: 'Shown piece' }),
      artItem('3', { status: 'rejected', title: 'Refused piece', reviewNote: 'Too dark to see' }),
      galleryItem('4', { status: 'hidden', title: 'Hidden clip' }),
      galleryItem('5', { status: 'removed', title: 'Gone clip' }),
    ])
    const chips = rows(w).map((r) => r.find('.rq-chip').text())
    expect(chips).toEqual(['Pending', 'Approved', 'Rejected: Too dark to see', 'Hidden', 'Removed'])
    expect(rows(w).map((r) => r.find('.rq-chip').attributes('data-status'))).toEqual([
      'pending',
      'approved',
      'rejected',
      'hidden',
      'removed',
    ])
    expect(rows(w)[0].text()).toContain('Waiting piece')
    expect(rows(w)[3].text()).toContain('Hidden clip')
  })

  it('says only "Rejected" when no reason was kept', async () => {
    const w = await mineWith([artItem('6', { status: 'rejected', reviewNote: null })])
    expect(rows(w)[0].find('.rq-chip').text()).toBe('Rejected')
  })

  it('names an untitled item by what it is', async () => {
    const w = await mineWith([artItem('7', { title: '' }), galleryItem('8', { title: '' })])
    expect(rows(w)[0].text()).toContain('Artwork')
    expect(rows(w)[1].text()).toContain('Clip')
  })

  it('shows names and reasons as plain text', async () => {
    const w = await mineWith([artItem('9', { status: 'rejected', title: '<b>Bold</b>', reviewNote: '<i>no</i>' })])
    expect(w.find('b').exists()).toBe(false)
    expect(w.find('i').exists()).toBe(false)
    expect(w.text()).toContain('<i>no</i>')
  })

  it('offers Remove on pending, approved and rejected items, and on no others', async () => {
    const w = await mineWith(['pending', 'approved', 'rejected', 'hidden', 'removed'].map((s, i) => artItem(`1${i}`, { status: s })))
    expect(rows(w).map((r) => Boolean(button(r, 'Remove')))).toEqual([true, true, true, false, false])
  })
})

describe('MineList: Remove', () => {
  const pending = () => [artItem('20', { status: 'pending', title: 'Waiting piece' }), artItem('21', { status: 'approved' })]

  it('asks first, in the row, and removes nothing yet', async () => {
    const w = await mineWith(pending())
    await button(rows(w)[0], 'Remove').trigger('click')
    expect(rows(w)[0].text()).toContain('Remove for good?')
    expect(rows(w)[0].text()).toContain('It goes from the Reliquarium entirely, file and all.')
    expect(button(rows(w)[0], 'Yes')).toBeTruthy()
    expect(button(rows(w)[0], 'No')).toBeTruthy()
    expect(button(rows(w)[0], 'Remove')).toBeUndefined()
    expect(rows(w)[1].text()).not.toContain('Remove for good?')
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('goes back to the Remove button on No, with nothing removed', async () => {
    const w = await mineWith(pending())
    await button(rows(w)[0], 'Remove').trigger('click')
    await button(rows(w)[0], 'No').trigger('click')
    expect(button(rows(w)[0], 'Remove')).toBeTruthy()
    expect(rows(w)[0].text()).not.toContain('Remove for good?')
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('removes the item on Yes, and the list is fetched again', async () => {
    const w = await mineWith(pending())
    removeItem.mockResolvedValue(null)
    listMine.mockResolvedValue({ items: [artItem('20', { status: 'removed', title: 'Waiting piece' }), artItem('21', { status: 'approved' })] })
    await button(rows(w)[0], 'Remove').trigger('click')
    await button(rows(w)[0], 'Yes').trigger('click')
    await flushPromises()
    expect(removeItem).toHaveBeenCalledWith('20', 'tok')
    expect(rows(w)[0].find('.rq-chip').text()).toBe('Removed')
    expect(button(rows(w)[0], 'Remove')).toBeUndefined()
    expect(rows(w)[0].text()).not.toContain('Remove for good?')
  })

  it('says what went wrong, keeps the item, and closes the question', async () => {
    const w = await mineWith(pending())
    removeItem.mockRejectedValue(apiError(404, 'That item is not yours to remove.'))
    await button(rows(w)[0], 'Remove').trigger('click')
    await button(rows(w)[0], 'Yes').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('That item is not yours to remove.')
    expect(rows(w)).toHaveLength(2)
    expect(button(rows(w)[0], 'Remove')).toBeTruthy()
  })

  it('cannot be sent twice while it is being removed', async () => {
    const w = await mineWith(pending())
    const d = deferred()
    removeItem.mockReturnValue(d.promise)
    await button(rows(w)[0], 'Remove').trigger('click')
    await button(rows(w)[0], 'Yes').trigger('click')
    expect(button(rows(w)[0], 'Yes').attributes('disabled')).toBeDefined()
    await button(rows(w)[0], 'Yes').trigger('click')
    expect(removeItem).toHaveBeenCalledTimes(1)
    d.resolve(null)
    await flushPromises()
  })

  it('clears an old complaint when the next removal starts', async () => {
    const w = await mineWith(pending())
    removeItem.mockRejectedValueOnce(apiError(500, 'Try again.'))
    await button(rows(w)[0], 'Remove').trigger('click')
    await button(rows(w)[0], 'Yes').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').exists()).toBe(true)
    removeItem.mockResolvedValue(null)
    await button(rows(w)[0], 'Remove').trigger('click')
    await button(rows(w)[0], 'Yes').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('MineList: a stale list', () => {
  it('shows nothing from before the sign-in being checked: the store was reset', async () => {
    const w = await mineWith([artItem('30', { status: 'pending' })])
    useGallery().reset()
    await flushPromises()
    expect(rows(w)).toHaveLength(0)
  })
})
