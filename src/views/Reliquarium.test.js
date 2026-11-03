// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { galleryItem, artItem } from '../test-utils/galleryItem'
import { forgetReloads } from '../lib/gallery/reloadOnce'

const state = vi.hoisted(() => ({ auth: null }))
vi.mock('../stores/auth', () => ({ useAuth: () => state.auth }))
vi.mock('../lib/gallery/api')
import { getMe, listClips, listArt, listMine, listReview } from '../lib/gallery/api'
import { useGallery } from '../stores/gallery'
import Reliquarium from './Reliquarium.vue'

const apiError = (status, message = 'nope') => Object.assign(new Error(message), { status })
const deferred = () => {
  let resolve
  const promise = new Promise((res) => (resolve = res))
  return { promise, resolve }
}
const member = () =>
  reactive({ token: 'tok', member: { id: '100000000000000001', isMember: true }, signedIn: true, signIn: vi.fn() })
const signedOut = () => reactive({ token: null, member: null, signedIn: false, signIn: vi.fn() })

const mounted = []
async function visit(path = '/reliquarium') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/reliquarium/:tab(clips|art|submit|mine|review)?', name: 'reliquarium', component: Reliquarium }],
  })
  router.push(path)
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const w = mount(Reliquarium, { global: { plugins: [pinia, router] }, attachTo: document.body })
  mounted.push(w)
  await flushPromises()
  await flushPromises()
  return { w, router }
}
const tabs = (w) => w.findAll('.rq-tab')
const tabNames = (w) => tabs(w).map((t) => t.text())

beforeEach(() => {
  vi.resetAllMocks()
  forgetReloads()
  state.auth = member()
  getMe.mockResolvedValue({ access: true, approver: false })
  listClips.mockResolvedValue({ items: [galleryItem('1', { title: 'A clip' })], next: null })
  listArt.mockResolvedValue({ items: [artItem('2', { title: 'A picture' })], next: null })
  listMine.mockResolvedValue({ items: [] })
  listReview.mockResolvedValue({ items: [], sync: { lastRunAt: null, lastOkAt: null, lastError: null } })
})
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

describe('Reliquarium: who gets in', () => {
  it('asks the server about a signed-in person, with the token, and shows nothing of the galleries meanwhile', async () => {
    const d = deferred()
    getMe.mockReturnValue(d.promise)
    const { w } = await visit()
    expect(getMe).toHaveBeenCalledWith('tok')
    expect(w.text()).toContain('Checking…')
    expect(w.find('[aria-busy="true"]').exists()).toBe(true)
    expect(tabs(w)).toHaveLength(0)
    expect(listClips).not.toHaveBeenCalled()
    d.resolve({ access: true, approver: false })
    await flushPromises()
    expect(w.text()).not.toContain('Checking…')
    expect(tabs(w).length).toBeGreaterThan(0)
  })

  it('asks a signed-out visitor to sign in, never asks the server, and brings them back to this tab', async () => {
    state.auth = signedOut()
    const { w } = await visit('/reliquarium/art')
    expect(getMe).not.toHaveBeenCalled()
    const signIn = w.findAll('button').find((b) => b.text() === 'Sign in with Discord')
    expect(signIn.classes()).toContain('btn-ember')
    expect(tabs(w)).toHaveLength(0)
    await signIn.trigger('click')
    expect(state.auth.signIn).toHaveBeenCalledWith({ returnTo: '/reliquarium/art' })
  })

  it('keeps out someone the server does not clear', async () => {
    getMe.mockResolvedValue({ access: false, approver: false })
    const { w } = await visit()
    expect(w.text()).toContain('Restricted to the XVIIIth Legion.')
    expect(tabs(w)).toHaveLength(0)
    expect(listClips).not.toHaveBeenCalled()
    expect(w.findAll('button')).toHaveLength(0)
  })

  it('says the Reliquarium could not be reached, and tries again when asked', async () => {
    getMe.mockRejectedValueOnce(apiError(503))
    const { w } = await visit()
    expect(w.find('[role="alert"]').text()).toBe("The Reliquarium couldn't be reached.")
    expect(tabs(w)).toHaveLength(0)
    getMe.mockResolvedValueOnce({ access: true, approver: false })
    await w.findAll('button').find((b) => b.text() === 'Retry').trigger('click')
    await flushPromises()
    expect(getMe).toHaveBeenCalledTimes(2)
    expect(tabs(w).length).toBeGreaterThan(0)
  })

  it('does not keep a list on screen while the store checks again', async () => {
    const { w } = await visit()
    expect(w.find('.rq-grid').exists()).toBe(true)
    const d = deferred()
    getMe.mockReturnValue(d.promise)
    useGallery().load('tok')
    await flushPromises()
    expect(w.find('.rq-grid').exists()).toBe(false)
    expect(tabs(w)).toHaveLength(0)
    d.resolve({ access: true, approver: false })
    await flushPromises()
  })

  it('goes back to asking for sign-in, with the galleries gone, when the person signs out', async () => {
    const { w } = await visit()
    expect(w.find('.rq-grid').exists()).toBe(true)
    state.auth.member = null
    state.auth.token = null
    await flushPromises()
    expect(w.find('.rq-grid').exists()).toBe(false)
    expect(w.text()).toContain('Sign in with Discord')
    expect(useGallery().clips.items).toEqual([])
  })
})

describe('Reliquarium: the tabs', () => {
  it('gives a member Clips, Artwork, Submit and Mine, and no Review', async () => {
    const { w } = await visit()
    expect(tabNames(w)).toEqual(['Clips', 'Artwork', 'Submit', 'Mine'])
  })

  it('gives an approver Review as well, with the number waiting', async () => {
    getMe.mockResolvedValue({ access: true, approver: true })
    listReview.mockResolvedValue({
      items: [artItem('3', { status: 'pending' }), artItem('4', { status: 'pending' })],
      sync: { lastRunAt: null, lastOkAt: null, lastError: null },
    })
    const { w } = await visit()
    expect(tabNames(w)).toEqual(['Clips', 'Artwork', 'Submit', 'Mine', 'Review 2'])
    expect(tabs(w)[4].find('.rq-badge').text()).toBe('2')
  })

  it('shows no number on Review when nothing is waiting', async () => {
    getMe.mockResolvedValue({ access: true, approver: true })
    const { w } = await visit()
    expect(tabNames(w)).toEqual(['Clips', 'Artwork', 'Submit', 'Mine', 'Review'])
    expect(w.find('.rq-badge').exists()).toBe(false)
  })

  it('links each tab to its own address, and marks the one that is open', async () => {
    getMe.mockResolvedValue({ access: true, approver: true })
    const { w } = await visit('/reliquarium/mine')
    expect(tabs(w).map((t) => t.attributes('href'))).toEqual([
      '/reliquarium/clips',
      '/reliquarium/art',
      '/reliquarium/submit',
      '/reliquarium/mine',
      '/reliquarium/review',
    ])
    expect(tabs(w).map((t) => t.attributes('aria-current'))).toEqual([undefined, undefined, undefined, 'page', undefined])
  })

  it('opens on Clips when no tab is in the address', async () => {
    const { w } = await visit('/reliquarium')
    expect(tabs(w)[0].attributes('aria-current')).toBe('page')
    expect(w.findAll('.rq-card')).toHaveLength(1)
    expect(w.text()).toContain('A clip')
  })

  it('opens the tab in the address', async () => {
    const art = await visit('/reliquarium/art')
    expect(art.w.text()).toContain('A picture')
    expect(art.w.text()).not.toContain('A clip')
    const submit = await visit('/reliquarium/submit')
    expect(submit.w.find('input[type="file"]').exists()).toBe(true)
  })

  it('moves to another tab when its link is followed, and keeps the lists it already has', async () => {
    const { w, router } = await visit('/reliquarium/clips')
    await router.push('/reliquarium/art')
    await flushPromises()
    expect(w.text()).toContain('A picture')
    expect(tabs(w)[1].attributes('aria-current')).toBe('page')
    await router.push('/reliquarium/clips')
    await flushPromises()
    expect(w.text()).toContain('A clip')
    expect(listClips).toHaveBeenCalledTimes(1)
  })
})

describe('Reliquarium: the Review tab', () => {
  it('shows a member the Clips instead, marked as the open tab, when they go to /review', async () => {
    const { w, router } = await visit('/reliquarium/review')
    expect(tabs(w)[0].attributes('aria-current')).toBe('page')
    expect(w.text()).toContain('A clip')
    expect(w.text()).not.toContain('Clips poll')
    expect(router.currentRoute.value.fullPath).toBe('/reliquarium/review')
    expect(listReview).not.toHaveBeenCalled()
  })

  it('shows an approver the queue at /review, with the poll line', async () => {
    getMe.mockResolvedValue({ access: true, approver: true })
    listReview.mockResolvedValue({
      items: [artItem('3', { status: 'pending', title: 'Waiting piece' })],
      sync: { lastRunAt: null, lastOkAt: null, lastError: null },
    })
    const { w } = await visit('/reliquarium/review')
    expect(tabs(w)[4].attributes('aria-current')).toBe('page')
    expect(w.text()).toContain('Waiting piece')
    expect(w.text()).toContain('Clips poll: last run never, last success never')
    expect(listReview).toHaveBeenCalledTimes(1)
  })

  it('fetches an approver\'s queue for the number on the tab even from another tab, and a member\'s never', async () => {
    getMe.mockResolvedValue({ access: true, approver: true })
    await visit('/reliquarium/clips')
    expect(listReview).toHaveBeenCalledWith('tok')
    expect(listReview).toHaveBeenCalledTimes(1)
    vi.clearAllMocks()
    getMe.mockResolvedValue({ access: true, approver: false })
    await visit('/reliquarium/clips')
    expect(listReview).not.toHaveBeenCalled()
  })

  it('does not fetch the queue a second time when an approver lands on it', async () => {
    getMe.mockResolvedValue({ access: true, approver: true })
    await visit('/reliquarium/review')
    expect(listReview).toHaveBeenCalledTimes(1)
  })
})

describe('Reliquarium: the lists wait for the check', () => {
  it('fetches Mine only once the person is cleared', async () => {
    const d = deferred()
    getMe.mockReturnValue(d.promise)
    await visit('/reliquarium/mine')
    expect(listMine).not.toHaveBeenCalled()
    d.resolve({ access: true, approver: false })
    await flushPromises()
    expect(listMine).toHaveBeenCalledWith('tok')
  })

  it('never fetches anything for someone refused', async () => {
    getMe.mockResolvedValue({ access: false, approver: false })
    await visit('/reliquarium/mine')
    for (const call of [listClips, listArt, listMine, listReview]) expect(call).not.toHaveBeenCalled()
  })
})
