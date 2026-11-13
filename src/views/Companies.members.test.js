// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import companies from '../data/companies.json'
import fixture from '../data/roster.fixture.json'
import { publicRoster } from '../../server/src/rosterPublic.js'
import { buildRosterView } from '../lib/rosterView'
import { sceneOf } from '../lib/rosterScenes'

// The page loads these on demand; warm the module cache so a test waits on the page, not on the disk.
import '../components/company/CompanyRanks.vue'
import '../components/company/MusterSection.vue'
import '../components/roster/RosterBanner.vue'
import '../components/roster/RosterStatus.vue'
import '../components/roster/RosterInfirmary.vue'

let auth
vi.mock('../stores/auth', () => ({ useAuth: () => auth }))
vi.mock('../lib/rosterApi', () => ({ getRoster: vi.fn(), getInfirmary: vi.fn(), getPublicRoster: vi.fn() }))
import * as api from '../lib/rosterApi'
import { useRoster } from '../stores/roster'
import Companies from './Companies.vue'

const PUBLIC = { fetchedAt: fixture.roster.fetchedAt, stale: false, ...publicRoster(fixture.roster) }
const view = buildRosterView(fixture.roster)
const apiError = (status, message) => Object.assign(new Error(message), { status })
const legion = (id = '200000000000000001') => reactive({ token: 'tok', member: { id, isMember: true }, signedIn: true, signIn: vi.fn() })
const signedOut = () => reactive({ token: null, member: null, signedIn: false, signIn: vi.fn() })

const mounted = []
// the page and its async pieces have arrived: the bars (placeholders gone) and, for a member, the toolbar
const settle = async (w, { member = true } = {}) => {
  await vi.waitFor(() => expect(w.find('.rs-ranks-loading').exists()).toBe(false), { timeout: 5000 })
  if (member) await vi.waitFor(() => expect(w.find('.rs-status').exists()).toBe(true), { timeout: 5000 })
  await flushPromises()
  await flushPromises()
}
const render = async (opts) => {
  const w = mount(Companies, { attachTo: document.body })
  mounted.push(w)
  await settle(w, opts)
  return w
}
// jsdom has no scrolling: the tests record where each scroll went, and how, and put the prototype back after.
const savedScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
const savedScrollBy = Object.getOwnPropertyDescriptor(window, 'scrollBy')
const restore = (target, key, saved) => (saved ? Object.defineProperty(target, key, saved) : delete target[key])

// The page polls on a timer; unmounting clears it between tests.
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  vi.unstubAllEnvs()
  restore(Element.prototype, 'scrollIntoView', savedScroll)
  restore(window, 'scrollBy', savedScrollBy)
})

let scrolled
let behaviours
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  auth = legion()
  api.getRoster.mockResolvedValue(fixture.roster)
  api.getInfirmary.mockResolvedValue(fixture.infirmary)
  api.getPublicRoster.mockResolvedValue(PUBLIC)
  scrolled = []
  behaviours = []
  Element.prototype.scrollIntoView = function (options) {
    scrolled.push(this)
    behaviours.push(options?.behavior)
  }
  window.scrollBy = vi.fn()
  window.history.replaceState(null, '', '/companies')
})

const company3 = fixture.roster.branches.find((b) => b.key === 'company-3')
const brother = company3.rows.find((r) => r.rank.key === 'battle-brother').members[0].id
const inBranches = new Set(fixture.roster.branches.flatMap((b) => [...b.head.members, ...b.aside, ...b.rows.flatMap((r) => r.members)].map((m) => m.id)))
const bannerOnly = fixture.roster.highCommand.flatMap((r) => r.members).find((m) => !inBranches.has(m.id)).id
const asViewer = (id) => { auth = legion(id) }
const isOpen = (w, key) => w.find(`[data-jump="${key}"]`).attributes('data-open') !== undefined
const openCount = (w) => w.findAll('[data-open]').length

describe('Companies: the order of battle for a Legion member', () => {
  it('shows High Command, twelve bars, and the Muster with Unassigned and Servitors', async () => {
    const w = await render()
    expect(w.find('.rs-high-command').text()).toContain('Lord of Drakes')
    expect(w.find('.rs-high-command').text()).toContain('Lord Chaplain')
    expect(w.findAll('.rs-branch')).toHaveLength(12)
    expect(w.find('#muster .rs-unassigned').exists()).toBe(true)
    expect(w.find('#muster .rs-servitors').text()).toContain('Servitors')
    expect(w.find('#muster .rs-servitors').text()).toContain('Smith-Servitor')
    expect(w.findAll('.c-chip').at(-1).text()).toContain('Muster')
  })

  it('shows a vacant head, an acting head, an aside slot and ordinal company tags', async () => {
    const w = await render()
    expect(w.find('[data-branch="company-6"] .rs-head').text()).toContain('Vacant')
    expect(w.find('[data-branch="company-2"] .rs-head').text()).toContain('Acting')
    expect(w.find('[data-branch="company-4"] .rs-aside').exists()).toBe(true)
    expect(w.find('[data-branch="forge"] .rs-tag').text()).toMatch(/^(1st|2nd|3rd|4th|5th|6th|7th)$/)
  })

  it('flags a name that disagrees with the roles', async () => {
    expect((await render()).text()).toContain('Check name')
  })

  it('says how many are on the roll, and when it is out of date', async () => {
    const w = await render()
    expect(w.find('.rs-status').text()).toContain(`${view.summary.total} on the roll`)
    expect(w.find('.rs-status').text()).not.toContain('out of date')
    api.getRoster.mockResolvedValue({ ...fixture.roster, stale: true })
    await useRoster().load('tok')
    await flushPromises()
    expect(w.find('.rs-status').text()).toContain('out of date')
  })

  it('shows an error notice but keeps the last roster when a refresh fails', async () => {
    const w = await render()
    api.getRoster.mockRejectedValue(apiError(503, 'down'))
    await useRoster().load('tok')
    await flushPromises()
    expect(w.text()).toContain('could not be refreshed')
    expect(w.findAll('.rs-branch')).toHaveLength(12)
  })

  it('puts the toolbar under the header, above High Command and the chips', async () => {
    const w = await render()
    const before = (a, b) => Boolean(a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(w.find('header.page-head'), w.find('.rs-status'))).toBe(true)
    expect(before(w.find('.rs-status'), w.find('.rs-high-command'))).toBe(true)
    expect(before(w.find('.rs-high-command'), w.find('nav.c-index'))).toBe(true)
  })

  it('shows a scene switcher only when the dev fixture is on', async () => {
    expect((await render()).find('.rs-dev-scenes').exists()).toBe(false)
    vi.stubEnv('VITE_ROSTER_FIXTURE', '1')
    const w = await render()
    expect(w.findAll('.rs-dev-scenes a').map((a) => a.text())).toEqual(['full', 'stale', 'empty', 'loading', 'signin', 'denied', 'error'])
    expect(w.find('.rs-dev-scenes a[href="?scene=denied"]').exists()).toBe(true)
  })
})

describe('Companies: holding places while the roster arrives', () => {
  it('holds the toolbar’s place for a signed-in member, above High Command, then swaps in the real one', async () => {
    const w = mount(Companies, { attachTo: document.body })
    mounted.push(w)
    expect(w.findAll('.rs-tools-loading')).toHaveLength(1)
    expect(w.find('.rs-status').exists()).toBe(false)
    const before = (a, b) => Boolean(a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(w.find('.rs-tools-loading'), w.find('.rs-hc-loading'))).toBe(true)
    await settle(w)
    expect(w.findAll('.rs-tools-loading')).toHaveLength(0)
    expect(w.find('.rs-status').exists()).toBe(true)
  })

  it('leaves nothing behind when the account turns out not to be in the Legion', async () => {
    api.getRoster.mockRejectedValue(apiError(403, 'The roster is open to the XVIIIth Legion.'))
    const w = await render({ member: false })
    expect(w.find('.rs-tools-loading').exists()).toBe(false)
    expect(w.find('.rs-hc-loading').exists()).toBe(false)
    expect(w.find('.rs-status').exists()).toBe(false)
  })

  it('holds no toolbar place for a signed-in account the Legion list does not know', async () => {
    auth = reactive({ token: 'tok', member: { id: '200000000000000009', isMember: false }, signedIn: true, signIn: vi.fn() })
    api.getRoster.mockRejectedValue(apiError(403, 'The roster is open to the XVIIIth Legion.'))
    const w = mount(Companies, { attachTo: document.body })
    mounted.push(w)
    expect(w.find('.rs-tools-loading').exists()).toBe(false)
    await settle(w, { member: false })
  })

  it('holds no toolbar place for a visitor who has not signed in', async () => {
    auth = signedOut()
    const w = mount(Companies, { attachTo: document.body })
    mounted.push(w)
    expect(w.find('.rs-tools-loading').exists()).toBe(false)
    await settle(w, { member: false })
  })
})

describe('Companies: the Infirmary', () => {
  it('shows the button to command only', async () => {
    expect((await render()).find('button.rs-infirmary-toggle').exists()).toBe(true)
    mounted.splice(0).forEach((w) => w.unmount())
    setActivePinia(createPinia())
    api.getRoster.mockResolvedValue({ ...fixture.roster, viewer: { infirmary: false } })
    expect((await render()).find('button.rs-infirmary-toggle').exists()).toBe(false)
  })

  it('swaps the page for the list, marking who still holds the Legion role, and swaps back', async () => {
    const w = await render()
    await w.find('button.rs-infirmary-toggle').trigger('click')
    await vi.waitFor(() => expect(w.find('.rs-infirmary li.rs-member').exists()).toBe(true))
    const list = w.find('.rs-infirmary')
    expect(list.findAll('.rs-member')).toHaveLength(fixture.infirmary.members.length)
    expect(list.text()).toContain('Still holds the Legion role')
    // the order of battle and the stories are out of the way; the toolbar and chips stay
    expect(w.find('.rs-high-command').exists()).toBe(false)
    expect(w.findAll('article.company')).toHaveLength(0)
    expect(w.find('#muster').exists()).toBe(false)
    expect(w.findAll('.c-chip').length).toBeGreaterThan(0)
    expect(w.find('.rs-status').exists()).toBe(true)
    await w.find('button.rs-infirmary-toggle').trigger('click')
    await flushPromises()
    expect(w.find('.rs-infirmary').exists()).toBe(false)
    expect(w.findAll('article.company')).toHaveLength(companies.length)
    expect(w.find('.rs-high-command').exists()).toBe(true)
  })

  it('goes back to the order first when a chip is used while it is open, then scrolls', async () => {
    const w = await render()
    await w.find('button.rs-infirmary-toggle').trigger('click')
    await flushPromises()
    expect(w.find('.rs-infirmary').exists()).toBe(true)
    scrolled.length = 0
    await w.findAll('.c-chip').find((c) => c.text().includes('3rd')).trigger('click')
    await vi.waitFor(() => expect(scrolled.map((el) => el.id)).toEqual(['third']))
    expect(w.find('.rs-infirmary').exists()).toBe(false)
    expect(w.find('article#third').exists()).toBe(true)
  })

  it('goes back to the order first when Find me is used while it is open', async () => {
    asViewer(brother)
    const w = await render()
    await w.find('button.rs-infirmary-toggle').trigger('click')
    await flushPromises()
    await w.find('.rs-find').trigger('click')
    await vi.waitFor(() => expect(isOpen(w, 'company-3')).toBe(true))
    expect(w.find('.rs-infirmary').exists()).toBe(false)
  })
})

describe('Companies: who does not get the member tools', () => {
  it('a signed-in account without the Legion role sees the public view: no toolbar, no Muster, counts instead of ladders', async () => {
    api.getRoster.mockRejectedValue(apiError(403, 'The roster is open to the XVIIIth Legion.'))
    const w = await render({ member: false })
    expect(w.find('.rs-status').exists()).toBe(false)
    expect(w.find('#muster').exists()).toBe(false)
    expect(w.findAll('.c-chip').every((c) => !c.text().includes('Muster'))).toBe(true)
    expect(w.findAll('.rs-branch')).toHaveLength(12)
    expect(w.find('.rs-shape').exists()).toBe(true)
    expect(w.find('.rs-ladder').exists()).toBe(false)
    expect(w.find('.rs-high-command').exists()).toBe(true)
  })

  it('a signed-out visitor likewise, and the member roster is never asked for', async () => {
    auth = signedOut()
    const w = await render({ member: false })
    expect(api.getRoster).not.toHaveBeenCalled()
    expect(w.find('.rs-status').exists()).toBe(false)
    expect(w.find('#muster').exists()).toBe(false)
  })

  it('signing out on the page drops the tools and the ladders at once', async () => {
    auth = legion()
    const w = await render()
    expect(w.find('.rs-ladder').exists()).toBe(true)
    // what auth.signOut() does: drop the token and member, then reset the roster store
    auth.token = null
    auth.member = null
    useRoster().reset()
    await vi.waitFor(() => expect(w.find('.rs-status').exists()).toBe(false))
    await vi.waitFor(() => expect(w.find('.rs-shape').exists()).toBe(true))
    expect(w.find('.rs-ladder').exists()).toBe(false)
    expect(w.find('#muster').exists()).toBe(false)
    expect(w.findAll('.rs-branch')).toHaveLength(12)
    expect(api.getRoster).toHaveBeenCalledTimes(1)
  })
})

describe('Companies: search with the member tools', () => {
  it('hides the Muster while a search is active, and brings it back', async () => {
    const w = await render()
    expect(w.find('#muster').exists()).toBe(true)
    await w.find('.c-search').setValue('forge')
    expect(w.find('#muster').exists()).toBe(false)
    expect(w.findAll('.c-chip').every((c) => !c.text().includes('Muster'))).toBe(true)
    await w.find('.c-search').setValue('')
    expect(w.find('#muster').exists()).toBe(true)
  })
})

describe('Companies: hooks for the design pass and the tests', () => {
  it('marks each rank row with data-rank, and branch rows only with data-tier', async () => {
    const w = await render()
    const forge = w.find('[data-branch="forge"] [data-rank]')
    expect(forge.attributes('data-rank')).toBeTruthy()
    const company = w.findAll('[data-branch="company-1"] .rs-row')
    expect(company.length).toBeGreaterThan(1)
    company.forEach((row, i) => {
      expect(row.attributes('data-rank')).toBeTruthy()
      expect(row.attributes('data-tier')).toMatch(/^\d+$/)
      if (i > 0) expect(Number(row.attributes('data-tier'))).toBeGreaterThanOrEqual(Number(company[i - 1].attributes('data-tier')))
    })
    expect(w.findAll('.rs-high-command .rs-row').length).toBeGreaterThan(0)
    for (const row of [...w.findAll('.rs-high-command .rs-row'), ...w.findAll('.rs-unassigned .rs-row')]) {
      expect(row.attributes('data-rank')).toBeTruthy()
      expect(row.attributes('data-tier')).toBeUndefined()
    }
    expect(w.findAll('.rs-unassigned .rs-row').length).toBeGreaterThan(0)
  })

  it('marks only the Terminator row data-lateral', async () => {
    const w = await render()
    const lateral = w.findAll('[data-lateral]')
    expect(w.find('[data-branch="company-1"] [data-lateral]').exists()).toBe(true)
    expect(lateral.length).toBeGreaterThan(0)
    for (const row of lateral) expect(row.attributes('data-rank')).toBe('terminator')
    expect(w.find('[data-branch="company-1"] .rs-row:not([data-lateral])').exists()).toBe(true)
  })

  it('marks each branch with its data-kind', async () => {
    const w = await render()
    expect(w.find('[data-branch="company-1"]').attributes('data-kind')).toBe('company')
    expect(w.find('[data-branch="venerable-dreadnoughts"]').attributes('data-kind')).toBe('dreadnoughts')
    expect(w.find('[data-branch="forge"]').attributes('data-kind')).toBe('specialty')
  })

  it('carries the member id on each member row', async () => {
    const w = await render()
    const first = fixture.roster.highCommand[0].members[0]
    expect(w.find('.rs-high-command li.rs-member').attributes('data-id')).toBe(first.id)
    const ids = w.findAll('li.rs-member').map((li) => li.attributes('data-id'))
    expect(ids.every((id) => /^\d{17,20}$/.test(id))).toBe(true)
  })
})

describe('Companies: Find me, Expand all, status links and deep links', () => {
  it("Find me opens the viewer's branch and centres their chip", async () => {
    asViewer(brother)
    const w = await render()
    await w.find('.rs-find').trigger('click')
    await flushPromises()
    expect(isOpen(w, 'company-3')).toBe(true)
    expect(w.find('[role="status"]').text()).toBe('')
    expect(scrolled.some((el) => el.dataset?.id === brother)).toBe(true)
    expect(w.find(`li[data-id="${brother}"]`).classes()).toContain('rs-me')
  })

  it('Find me with an id that is not on the roll says so, and opens nothing', async () => {
    asViewer('1')
    const w = await render()
    await w.find('.rs-find').trigger('click')
    await flushPromises()
    expect(w.find('.rs-find-msg').text()).toBe('You are not on the roll. Check your Legion and rank roles in Discord.')
    expect(openCount(w)).toBe(0)
  })

  it('Find me for a High Command-only member scrolls to High Command and opens nothing', async () => {
    asViewer(bannerOnly)
    const w = await render()
    await w.find('.rs-find').trigger('click')
    await flushPromises()
    expect(scrolled.some((el) => el.classList.contains('rs-high-command'))).toBe(true)
    expect(openCount(w)).toBe(0)
    expect(w.find('.rs-find-msg').text()).toBe('')
  })

  it('Expand all opens every openable bar and Unassigned, and Collapse all closes them', async () => {
    const w = await render()
    await w.find('.rs-expand-all').trigger('click')
    await flushPromises()
    expect(openCount(w)).toBe(view.openableKeys.length)
    expect(w.find('.rs-expand-all').text()).toBe('Collapse all')
    await w.find('.rs-expand-all').trigger('click')
    await flushPromises()
    expect(openCount(w)).toBe(0)
    expect(w.find('.rs-expand-all').text()).toBe('Expand all')
  })

  it('a status link opens its branch', async () => {
    const w = await render()
    const vacant = w.findAll('.rs-status button').find((b) => b.text().includes('vacant post'))
    await vacant.trigger('click')
    await flushPromises()
    expect(isOpen(w, 'company-6')).toBe(true)
  })

  it('a /companies#third link scrolls to that company and opens its bar once the roster arrives', async () => {
    window.history.replaceState(null, '', '/companies#third')
    const w = await render()
    await vi.waitFor(() => expect(isOpen(w, 'company-3')).toBe(true))
    expect(openCount(w)).toBe(1)
    expect(scrolled.some((el) => el.id === 'third')).toBe(true)
  })

  it('a link to a company with nothing to open only scrolls', async () => {
    window.history.replaceState(null, '', '/companies#dreadnoughts')
    const w = await render()
    expect(openCount(w)).toBe(0)
    expect(scrolled.some((el) => el.id === 'dreadnoughts')).toBe(true)
  })

  it('a /companies#muster link opens Unassigned and scrolls to the Muster, which loads after the story', async () => {
    window.history.replaceState(null, '', '/companies#muster')
    const w = await render()
    await vi.waitFor(() => expect(isOpen(w, 'unassigned')).toBe(true))
    expect(openCount(w)).toBe(1)
    await vi.waitFor(() => expect(scrolled.some((el) => el.id === 'muster')).toBe(true))
  })

  it('a /companies#high-command link scrolls to High Command once it has arrived, and opens nothing', async () => {
    window.history.replaceState(null, '', '/companies#high-command')
    const w = await render()
    await vi.waitFor(() => expect(scrolled.some((el) => el.id === 'high-command')).toBe(true))
    expect(openCount(w)).toBe(0)
  })

  it.each([
    ['the sign-in fragment', '#access_token=abc&expires_in=3600'],
    ['an unknown key', '#nope'],
    ['an old branch key (the redirect rewrites these before they get here)', '#company-3'],
  ])('ignores %s in the URL', async (_, hash) => {
    window.history.replaceState(null, '', '/companies' + hash)
    const w = await render()
    await flushPromises()
    expect(openCount(w)).toBe(0)
    expect(scrolled).toHaveLength(0)
    expect(w.findAll('.rs-branch')).toHaveLength(12)
  })

  it('keeps bars open when a new snapshot arrives', async () => {
    const w = await render()
    await w.find('[data-branch="company-3"] button').trigger('click')
    expect(isOpen(w, 'company-3')).toBe(true)
    api.getRoster.mockResolvedValue({ ...fixture.roster, fetchedAt: '2026-01-01T12:05:00.000Z' })
    await useRoster().load('tok')
    await flushPromises()
    expect(isOpen(w, 'company-3')).toBe(true)
  })

  it('shrugs off a branch that stops being openable while open', async () => {
    const w = await render()
    await w.find('[data-branch="company-1"] button').trigger('click')
    const trimmed = { ...fixture.roster, fetchedAt: '2026-01-01T12:06:00.000Z', branches: fixture.roster.branches.map((b) => (b.key === 'company-1' ? { ...b, aside: [], rows: [] } : b)) }
    api.getRoster.mockResolvedValue(trimmed)
    await useRoster().load('tok')
    await flushPromises()
    expect(w.find('[data-branch="company-1"] button').exists()).toBe(false)
    expect(isOpen(w, 'company-1')).toBe(false)
    await w.find('.rs-expand-all').trigger('click')
    await flushPromises()
    expect(openCount(w)).toBe(buildRosterView(trimmed).openableKeys.length)
  })

  it('renders an empty roster: no High Command, nobody on the roll, nothing to open', async () => {
    api.getRoster.mockResolvedValue(sceneOf(fixture, 'empty').roster)
    const w = await render()
    expect(w.find('.rs-high-command').exists()).toBe(false)
    expect(w.find('.rs-status').text()).toContain('0 on the roll')
    expect(w.findAll('.rs-branch')).toHaveLength(12)
    expect(w.findAll('.rs-branch button')).toHaveLength(0)
    expect(w.find('.rs-expand-all').exists()).toBe(false)
    expect(w.find('#muster').exists()).toBe(false)
  })

  it('stops listening for the tab coming back when it unmounts', async () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const w = await render()
    w.unmount()
    mounted.splice(mounted.indexOf(w), 1)
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    remove.mockRestore()
  })

  it('does not start another request while one is still pending', async () => {
    vi.useFakeTimers()
    try {
      api.getRoster.mockReturnValue(new Promise(() => {}))
      const w = mount(Companies)
      mounted.push(w)
      await vi.advanceTimersByTimeAsync(180_000)
      expect(api.getRoster).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['prefers reduced motion', true, 'auto'],
    ['welcomes motion', false, 'smooth'],
  ])('when the visitor %s, Find me scrolls the matching way', async (_, reduced, behavior) => {
    window.matchMedia = vi.fn(() => ({ matches: reduced }))
    try {
      asViewer(brother)
      const w = await render()
      await w.find('.rs-find').trigger('click')
      await flushPromises()
      expect(behaviours.length).toBeGreaterThan(0)
      expect(behaviours.every((b) => b === behavior)).toBe(true)
    } finally {
      delete window.matchMedia
    }
  })
})
