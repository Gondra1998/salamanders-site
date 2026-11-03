// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { galleryItem, artItem } from '../../test-utils/galleryItem'
import { forgetReloads } from '../../lib/gallery/reloadOnce'

const state = vi.hoisted(() => ({ auth: null }))
vi.mock('../../stores/auth', () => ({ useAuth: () => state.auth }))
vi.mock('../../lib/gallery/api')
import { listClips, listArt, listReview, hide } from '../../lib/gallery/api'
import { useGallery } from '../../stores/gallery'
import GalleryGrid from './GalleryGrid.vue'

const apiError = (status, message = 'nope') => Object.assign(new Error(message), { status })
const deferred = () => {
  let resolve
  const promise = new Promise((res) => (resolve = res))
  return { promise, resolve }
}
const clips = (...ids) => ids.map((id) => galleryItem(id, { title: `Clip ${id}` }))

let gallery
const mounted = []
const mountGrid = async (kind = 'clips') => {
  const w = mount(GalleryGrid, { props: { kind }, attachTo: document.body })
  mounted.push(w)
  await flushPromises()
  return w
}
const cards = (w) => w.findAll('.rq-card')
const more = (w) => w.findAll('button').find((b) => b.text() === 'Load more')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  forgetReloads()
  state.auth = reactive({ token: 'tok', member: { id: '100000000000000001', isMember: true } })
  gallery = useGallery()
  gallery.$patch({ status: 'allowed' })
})
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

describe('GalleryGrid: filling', () => {
  it('fetches the first page of its own list when it has none, with the token', async () => {
    listClips.mockResolvedValue({ items: clips('1', '2'), next: null })
    const w = await mountGrid('clips')
    expect(listClips).toHaveBeenCalledWith('tok', null)
    expect(listArt).not.toHaveBeenCalled()
    expect(cards(w)).toHaveLength(2)
    expect(cards(w)[0].text()).toContain('Clip 1')
  })

  it('fetches the art list for the artwork tab', async () => {
    listArt.mockResolvedValue({ items: [artItem('9')], next: null })
    const w = await mountGrid('art')
    expect(listArt).toHaveBeenCalledWith('tok', null)
    expect(cards(w)).toHaveLength(1)
  })

  it('does not fetch again when it already holds some: switching tabs back keeps them', async () => {
    gallery.$patch({ clips: { items: clips('1'), next: null, loading: false } })
    const w = await mountGrid('clips')
    expect(listClips).not.toHaveBeenCalled()
    expect(cards(w)).toHaveLength(1)
  })

  it('shows the cards in a list, one list item each', async () => {
    gallery.$patch({ clips: { items: clips('1', '2', '3'), next: null, loading: false } })
    const w = await mountGrid()
    expect(w.findAll('ul.rq-grid > li')).toHaveLength(3)
  })

  it('says it is loading, then that there is nothing, then shows the cards', async () => {
    const d = deferred()
    listClips.mockReturnValue(d.promise)
    const w = await mountGrid()
    expect(w.text()).toContain('Loading…')
    expect(w.text()).not.toContain('Nothing here yet.')
    d.resolve({ items: [], next: null })
    await flushPromises()
    expect(w.text()).toContain('Nothing here yet.')
    expect(w.text()).not.toContain('Loading…')
  })

  it('shows why it could not be fetched, and not "Nothing here yet."', async () => {
    listClips.mockRejectedValue(apiError(503, 'The Reliquarium could not be reached.'))
    const w = await mountGrid()
    expect(w.find('[role="alert"]').text()).toBe('The Reliquarium could not be reached.')
    expect(w.text()).not.toContain('Nothing here yet.')
  })
})

describe('GalleryGrid: Load more', () => {
  it('is there only while the server has a next page', async () => {
    gallery.$patch({ clips: { items: clips('1'), next: null, loading: false } })
    expect(more(await mountGrid())).toBeUndefined()
    gallery.$patch({ clips: { items: clips('1'), next: '1', loading: false } })
    const w = await mountGrid()
    expect(more(w)).toBeTruthy()
    expect(more(w).attributes('disabled')).toBeUndefined()
  })

  it('asks for the page after the last one and adds it to the end', async () => {
    gallery.$patch({ clips: { items: clips('3', '2'), next: '2', loading: false } })
    listClips.mockResolvedValue({ items: clips('1'), next: null })
    const w = await mountGrid()
    await more(w).trigger('click')
    await flushPromises()
    expect(listClips).toHaveBeenCalledWith('tok', '2')
    expect(cards(w).map((c) => c.text().match(/Clip \d/)[0])).toEqual(['Clip 3', 'Clip 2', 'Clip 1'])
    expect(more(w)).toBeUndefined()
  })

  it('is disabled while a page is on its way', async () => {
    gallery.$patch({ clips: { items: clips('3'), next: '3', loading: false } })
    const d = deferred()
    listClips.mockReturnValue(d.promise)
    const w = await mountGrid()
    await more(w).trigger('click')
    expect(more(w).attributes('disabled')).toBeDefined()
    d.resolve({ items: [], next: null })
    await flushPromises()
  })

  it('says why a page could not be fetched and keeps what it has', async () => {
    gallery.$patch({ clips: { items: clips('3'), next: '3', loading: false } })
    listClips.mockRejectedValue(apiError(503, 'The Reliquarium could not be reached.'))
    const w = await mountGrid()
    await more(w).trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('The Reliquarium could not be reached.')
    expect(cards(w)).toHaveLength(1)
    expect(more(w)).toBeTruthy()
  })
})

describe('GalleryGrid: Hide', () => {
  const hideButtons = (w) => w.findAll('.rq-hide')
  // Hide asks "Hide for everyone?" in the card; this taps Hide on the first card and then Yes.
  const hideFirst = async (w) => {
    await hideButtons(w)[0].trigger('click')
    await cards(w)[0].findAll('button').find((b) => b.text() === 'Yes').trigger('click')
  }

  it('hides nothing until the question is answered Yes', async () => {
    gallery.$patch({ clips: { items: clips('1', '2'), next: null, loading: false }, approver: true })
    const w = await mountGrid()
    await hideButtons(w)[0].trigger('click')
    expect(hide).not.toHaveBeenCalled()
    await cards(w)[0].findAll('button').find((b) => b.text() === 'No').trigger('click')
    await flushPromises()
    expect(hide).not.toHaveBeenCalled()
    expect(cards(w)).toHaveLength(2)
  })

  it('is on the cards of an approver only', async () => {
    gallery.$patch({ clips: { items: clips('1', '2'), next: null, loading: false }, approver: false })
    expect(hideButtons(await mountGrid())).toHaveLength(0)
    gallery.$patch({ approver: true })
    expect(hideButtons(await mountGrid())).toHaveLength(2)
  })

  it('hides the item for everyone: it leaves the list at once', async () => {
    gallery.$patch({ clips: { items: clips('1', '2'), next: null, loading: false }, approver: true })
    hide.mockResolvedValue({ item: {} })
    listReview.mockResolvedValue({ items: [], sync: null })
    const w = await mountGrid()
    await hideFirst(w)
    await flushPromises()
    expect(hide).toHaveBeenCalledWith('1', '', 'tok')
    expect(cards(w)).toHaveLength(1)
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })

  it('says the change was saved when only the refresh afterwards failed', async () => {
    gallery.$patch({ clips: { items: clips('1', '2'), next: null, loading: false }, approver: true })
    hide.mockResolvedValue({ item: {} })
    listReview.mockRejectedValue(apiError(503, 'The Reliquarium could not be reached.'))
    const w = await mountGrid()
    await hideFirst(w)
    await flushPromises()
    expect(cards(w)).toHaveLength(1)
    expect(w.find('[role="alert"]').text()).toBe("The change was saved, but the list couldn't be refreshed.")
  })

  it('says what went wrong, as it was said, when the item could not be hidden', async () => {
    gallery.$patch({ clips: { items: clips('1', '2'), next: null, loading: false }, approver: true })
    hide.mockRejectedValue(apiError(409, 'That item has already been decided.'))
    const w = await mountGrid()
    await hideFirst(w)
    await flushPromises()
    expect(cards(w)).toHaveLength(2)
    expect(w.find('[role="alert"]').text()).toBe('That item has already been decided.')
  })

  it('takes an earlier complaint away when the next try starts', async () => {
    gallery.$patch({ clips: { items: clips('1', '2'), next: null, loading: false }, approver: true })
    hide.mockRejectedValueOnce(apiError(500, 'Try again.'))
    const w = await mountGrid()
    await hideFirst(w)
    await flushPromises()
    expect(w.find('[role="alert"]').exists()).toBe(true)
    hide.mockResolvedValue({ item: {} })
    listReview.mockResolvedValue({ items: [], sync: null })
    await hideFirst(w)
    await flushPromises()
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('GalleryGrid: links that expire', () => {
  it('fetches the list again, once, when a clip will not play, and says so if it still will not', async () => {
    gallery.$patch({ clips: { items: clips('1'), next: null, loading: false } })
    listClips.mockResolvedValue({ items: clips('1'), next: null })
    const w = await mountGrid()
    await cards(w)[0].find('video').trigger('error')
    await flushPromises()
    expect(listClips).toHaveBeenCalledTimes(1)
    expect(listClips).toHaveBeenCalledWith('tok', null)

    // the list was rebuilt: the card is new, and the same clip failing again is not asked for a second time
    await cards(w)[0].find('video').trigger('error')
    await flushPromises()
    expect(listClips).toHaveBeenCalledTimes(1)
    expect(cards(w)[0].text()).toContain("This clip couldn't load.")
  })
})

describe('GalleryGrid: full size', () => {
  it('opens a picture in the lightbox and closes it again', async () => {
    gallery.$patch({ art: { items: [artItem('9', { title: 'Dusk' })], next: null, loading: false } })
    const w = await mountGrid('art')
    expect(w.find('[role="dialog"]').exists()).toBe(false)
    await w.find('.rq-card img').trigger('click')
    expect(w.find('[role="dialog"]').exists()).toBe(true)
    expect(w.find('[role="dialog"]').text()).toContain('Dusk')
    await w.find('[role="dialog"] button').trigger('click')
    expect(w.find('[role="dialog"]').exists()).toBe(false)
  })
})
