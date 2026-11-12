// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import * as buildsApi from '../lib/buildsApi'
import { useAuth } from '../stores/auth'
import Builds from './Builds.vue'

vi.mock('../lib/buildsApi', () => ({ listBuilds: vi.fn(), getModeratorStatus: vi.fn() }))

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)', component: { render: () => null } }] })

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.mocked(buildsApi.listBuilds).mockReset()
  vi.mocked(buildsApi.getModeratorStatus).mockReset().mockResolvedValue(false)
})

/** A visitor who is signed in when the page loads (the auth store reads this when it is created). */
function signInAs(token = 'token-abc') {
  localStorage.setItem(
    'salamanders-discord-member',
    JSON.stringify({ id: '300000000000000099', username: 'tester', isMember: false, checkedAt: Date.now(), accessToken: token, expiresAt: Date.now() + 3_600_000 }),
  )
  setActivePinia(createPinia())
}

/** A build as GET /builds returns it. `member` is left out entirely when undefined, as for a signed-out request. */
function aBuild(title, member) {
  const author = { id: '300000000000000001', displayName: 'Tester' }
  if (member !== undefined) author.member = member
  return { id: `id-${title}`, title, className: 'Tactical', level: 25, prestige: 0, perks: [], weapons: {}, author }
}

const signedOutList = () => [aBuild('Alpha'), aBuild('Beta'), aBuild('Gamma')]
const signedInList = () => [aBuild('Alpha', true), aBuild('Beta', false), aBuild('Gamma', true)]

// The heading text itself: SectionTitle puts the count in a second span beside it.
const headings = (w) => w.findAll('.section-title-text').map((h) => h.text())
const titlesIn = (w, heading) =>
  w
    .findAll('.b-section')
    .find((s) => s.find('.section-title-text').text() === heading)
    .findAll('.b-name')
    .map((n) => n.text())

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function open() {
  const wrapper = mount(Builds, { global: { plugins: [router], stubs: { BuildsPager: true } } })
  await router.isReady()
  await flushPromises()
  return wrapper
}

describe('Builds when the server cannot be reached', () => {
  it('says so in plain words instead of showing the browser error', async () => {
    buildsApi.listBuilds.mockRejectedValue(new TypeError('Failed to fetch'))
    const w = await open()
    const error = w.find('.b-error')
    expect(error.exists()).toBe(true)
    expect(error.text()).not.toContain('Failed to fetch')
    expect(error.text()).toContain('did not answer')
  })

  it('does the same when the API answers with a failure', async () => {
    buildsApi.listBuilds.mockRejectedValue(Object.assign(new Error('Request failed (500)'), { status: 500 }))
    const w = await open()
    expect(w.find('.b-error').text()).not.toContain('Request failed')
  })

  it('offers a Retry that loads again and clears the error', async () => {
    buildsApi.listBuilds.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce([])
    const w = await open()
    await w.find('.b-error button').trigger('click')
    await flushPromises()
    expect(buildsApi.listBuilds).toHaveBeenCalledTimes(2)
    expect(w.find('.b-error').exists()).toBe(false)
    expect(w.find('.b-empty').exists()).toBe(true)
  })
})

describe('Builds groups by the server\'s member flag', () => {
  it('signed out: one Community Builds section and no badge', async () => {
    buildsApi.listBuilds.mockResolvedValue(signedOutList())
    const w = await open()
    expect(headings(w)).toEqual(['Community Builds'])
    expect(titlesIn(w, 'Community Builds')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(w.find('.b-member-badge').exists()).toBe(false)
    expect(w.text()).not.toContain('Verified Members')
  })

  it('signed in: flagged authors are under Verified Members with the badge', async () => {
    signInAs()
    buildsApi.listBuilds.mockResolvedValue(signedInList())
    const w = await open()
    expect(headings(w)).toEqual(['Verified Members', 'Community Builds'])
    expect(titlesIn(w, 'Verified Members')).toEqual(['Alpha', 'Gamma'])
    expect(titlesIn(w, 'Community Builds')).toEqual(['Beta'])
    const [verified, community] = w.findAll('.b-section')
    expect(verified.findAll('.b-member-badge')).toHaveLength(2)
    expect(community.find('.b-member-badge').exists()).toBe(false)
  })

  it('signed in but nobody on the page is flagged: no Verified Members section', async () => {
    signInAs()
    buildsApi.listBuilds.mockResolvedValue([aBuild('Alpha', false), aBuild('Beta', false)])
    const w = await open()
    expect(headings(w)).toEqual(['Community Builds'])
    expect(w.find('.b-member-badge').exists()).toBe(false)
  })

  it('does not take a member flag that is not exactly true', async () => {
    signInAs()
    buildsApi.listBuilds.mockResolvedValue([aBuild('Alpha', 'true'), aBuild('Beta', 1), aBuild('Gamma', null)])
    const w = await open()
    expect(headings(w)).toEqual(['Community Builds'])
    expect(w.find('.b-member-badge').exists()).toBe(false)
  })

  it('signing out while the page is open reloads the list and the badges disappear', async () => {
    signInAs()
    // Like the server: the flag only comes back to a request that carries a token.
    buildsApi.listBuilds.mockImplementation(async (_className, token) => (token ? signedInList() : signedOutList()))
    const w = await open()
    expect(headings(w)).toEqual(['Verified Members', 'Community Builds'])
    expect(w.find('.b-member-badge').exists()).toBe(true)

    useAuth().signOut()
    await flushPromises()

    expect(headings(w)).toEqual(['Community Builds'])
    expect(titlesIn(w, 'Community Builds')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(w.find('.b-member-badge').exists()).toBe(false)
    expect(w.text()).not.toContain('Verified Members')
    expect(buildsApi.listBuilds.mock.calls.at(-1)[1]).toBeFalsy()
  })

  it('the list is requested with the token when signed in', async () => {
    signInAs('token-xyz')
    buildsApi.listBuilds.mockResolvedValue(signedInList())
    await open()
    expect(buildsApi.listBuilds).toHaveBeenCalledWith(undefined, 'token-xyz')
  })
})

// Requests can finish in any order. Only the most recent one may touch the page.
describe('Builds when answers arrive out of order', () => {
  /** Signed in with a flagged list still in flight, then sign out so a second, newer request starts. */
  async function signOutWhileFirstIsInFlight() {
    signInAs()
    const older = deferred()
    const newer = deferred()
    buildsApi.listBuilds.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const w = await open()
    useAuth().signOut()
    await flushPromises()
    return { w, older, newer }
  }

  it('an older answer arriving late never replaces a newer one', async () => {
    const { w, older, newer } = await signOutWhileFirstIsInFlight()
    newer.resolve(signedOutList())
    await flushPromises()
    expect(headings(w)).toEqual(['Community Builds'])

    older.resolve(signedInList())
    await flushPromises()

    expect(headings(w)).toEqual(['Community Builds'])
    expect(titlesIn(w, 'Community Builds')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(w.find('.b-member-badge').exists()).toBe(false)
    expect(w.text()).not.toContain('Verified Members')
  })

  it('an older error arriving late never replaces a newer list with an error banner', async () => {
    const { w, older, newer } = await signOutWhileFirstIsInFlight()
    newer.resolve(signedOutList())
    await flushPromises()

    older.reject(new TypeError('Failed to fetch'))
    await flushPromises()

    expect(w.find('.b-error').exists()).toBe(false)
    expect(headings(w)).toEqual(['Community Builds'])
    expect(titlesIn(w, 'Community Builds')).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('an older answer arriving while the newer one is still waiting does not end the loading state or show its list', async () => {
    const { w, older, newer } = await signOutWhileFirstIsInFlight()

    older.resolve(signedInList())
    await flushPromises()

    expect(w.text()).toContain('Loading builds')
    expect(w.findAll('.b-section')).toHaveLength(0)
    expect(w.find('.b-member-badge').exists()).toBe(false)
    expect(w.find('.b-empty').exists()).toBe(false)

    newer.resolve(signedOutList())
    await flushPromises()
    expect(w.text()).not.toContain('Loading builds')
    expect(headings(w)).toEqual(['Community Builds'])
  })

  it('an older error arriving while the newer one is still waiting does not show a banner or end the loading state', async () => {
    const { w, older, newer } = await signOutWhileFirstIsInFlight()

    older.reject(new TypeError('Failed to fetch'))
    await flushPromises()

    expect(w.text()).toContain('Loading builds')
    expect(w.find('.b-error').exists()).toBe(false)

    newer.resolve(signedOutList())
    await flushPromises()
    expect(w.find('.b-error').exists()).toBe(false)
    expect(headings(w)).toEqual(['Community Builds'])
  })

  it('the newest request failing still shows the banner, and an older good answer arriving later cannot hide it', async () => {
    const { w, older, newer } = await signOutWhileFirstIsInFlight()
    newer.reject(new TypeError('Failed to fetch'))
    await flushPromises()
    expect(w.find('.b-error').exists()).toBe(true)

    older.resolve(signedInList())
    await flushPromises()

    expect(w.find('.b-error').exists()).toBe(true)
    expect(w.find('.b-member-badge').exists()).toBe(false)
    expect(w.text()).not.toContain('Verified Members')
  })
})

// A list that carries member flags must not outlive the sign-out that made the flags stale.
describe('Builds while the list reloads after a sign-out', () => {
  async function flaggedListOnScreen() {
    signInAs()
    const refetch = deferred()
    buildsApi.listBuilds.mockResolvedValueOnce(signedInList()).mockReturnValueOnce(refetch.promise)
    const w = await open()
    expect(headings(w)).toEqual(['Verified Members', 'Community Builds'])
    expect(w.find('.b-member-badge').exists()).toBe(true)
    return { w, refetch }
  }

  it('signing out clears the flagged list at once, before the refetch answers', async () => {
    const { w } = await flaggedListOnScreen()

    useAuth().signOut()
    await flushPromises() // the refetch is still pending

    expect(w.find('.b-member-badge').exists()).toBe(false)
    expect(w.text()).not.toContain('Verified Members')
    expect(w.findAll('.b-section')).toHaveLength(0)
    expect(w.findAll('.b-name')).toHaveLength(0)
    expect(w.text()).toContain('Loading builds')
  })

  it('signing out when the refetch fails shows the error and none of the old flagged list', async () => {
    const { w, refetch } = await flaggedListOnScreen()

    useAuth().signOut()
    refetch.reject(new TypeError('Failed to fetch'))
    await flushPromises()

    expect(w.find('.b-error').exists()).toBe(true)
    expect(w.findAll('.b-name')).toHaveLength(0)
    expect(w.find('.b-member-badge').exists()).toBe(false)
    expect(w.text()).not.toContain('Verified Members')
  })
})

describe('Builds page frame', () => {
  it('opens with the shared page header and a lede that links to the Perk Builder', async () => {
    buildsApi.listBuilds.mockResolvedValue(signedOutList())
    const w = await open()
    const head = w.find('header.page-head')
    expect(head.find('.eyebrow').text()).toBe('Field-tested')
    expect(head.find('h1').text()).toBe('Recommended Builds')
    const lede = head.find('p.page-lede')
    expect(lede.text()).toContain('Builds the Chapter has posted.')
    expect(lede.find('a').attributes('href')).toBe('/planner')
    expect(lede.find('a').text()).toBe('Perk Builder')
  })

  it('counts the builds in each section heading', async () => {
    signInAs()
    buildsApi.listBuilds.mockResolvedValue(signedInList())
    const w = await open()
    expect(w.findAll('.section-title-count').map((c) => c.text())).toEqual(['2', '1'])
  })

  it('draws the search field and the class chips from the shared controls', async () => {
    buildsApi.listBuilds.mockResolvedValue(signedOutList())
    const w = await open()
    expect(w.find('input.b-search').classes()).toContain('field-forge')
    const chips = w.findAll('.b-chip')
    expect(chips.map((c) => c.text())).toEqual(['All 3', 'Tactical 3'])
    for (const chip of chips) expect(chip.classes()).toEqual(expect.arrayContaining(['tab-forge', 'rm-fade']))
    expect(chips.map((c) => c.classes('on'))).toEqual([true, false])

    await chips[1].trigger('click')
    expect(w.findAll('.b-chip').map((c) => c.classes('on'))).toEqual([false, true])
    await chips[1].trigger('click')
    expect(w.findAll('.b-chip').map((c) => c.classes('on'))).toEqual([true, false])
  })
})

describe('Builds states are the shared state panel', () => {
  it('loading: a status panel with the spinner and the loading copy', async () => {
    buildsApi.listBuilds.mockReturnValue(new Promise(() => {}))
    const w = await open()
    const panel = w.find('.state-panel.is-loading')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('role')).toBe('status')
    expect(panel.text()).toBe('Loading builds…')
  })

  it('load error: an alert panel that keeps b-error, with Retry in its action row', async () => {
    buildsApi.listBuilds.mockRejectedValue(new TypeError('Failed to fetch'))
    const w = await open()
    const panel = w.find('.state-panel.is-error')
    expect(panel.classes()).toContain('b-error')
    expect(panel.attributes('role')).toBe('alert')
    expect(panel.find('.state-body').text()).toBe('The builds server did not answer. Check your connection, then retry.')
    expect(panel.find('.state-actions button').text()).toBe('Retry')
  })

  it('no match: an empty panel with the no-match copy, and no sections', async () => {
    buildsApi.listBuilds.mockResolvedValue(signedOutList())
    const w = await open()
    await w.find('input.b-search').setValue('zzzz nothing')
    const panel = w.find('.state-panel.is-empty')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toBe('No builds match that search.')
    expect(panel.classes()).not.toContain('b-empty')
    expect(w.findAll('.b-section')).toHaveLength(0)
  })

  it('no builds yet: an empty panel that keeps b-empty, with the title, the body and the ember link', async () => {
    buildsApi.listBuilds.mockResolvedValue([])
    const w = await open()
    const panel = w.find('.state-panel.is-empty')
    expect(panel.classes()).toContain('b-empty')
    expect(panel.find('h2').text()).toBe('No builds posted yet')
    expect(panel.find('.state-body').text()).toBe(
      'Build a loadout in the Perk Builder, then hit Save to library in the Your Build panel. Sign in with Discord to post — everyone sees it here.',
    )
    const cta = panel.find('.state-actions a')
    expect(cta.text()).toBe('Open the Perk Builder')
    expect(cta.attributes('href')).toBe('/planner')
    expect(cta.classes()).toContain('btn-ember')
    // The page's one primary action keeps the full ember size, not the small row size.
    expect(cta.classes()).not.toContain('btn-sm')
  })

  it('a loaded list shows no state panel', async () => {
    buildsApi.listBuilds.mockResolvedValue(signedOutList())
    const w = await open()
    expect(w.find('.state-panel').exists()).toBe(false)
  })
})

// The page speaks the tokens: no raw hex, rgba, pixel radius or rem font size where a token exists.
describe('Builds styles use the tokens', () => {
  const styleOf = (file) =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), 'utf8').match(/<style[^>]*>([\s\S]*)<\/style>/)[1]
  const offToken = (css) =>
    [...css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\(|border-radius:[^;]*\dpx|font-size:[^;]*\d(\.\d+)?rem/gi)].map((m) => m[0])

  it.each(['./Builds.vue', '../components/BuildsPager.vue'])('%s', (file) => {
    expect(offToken(styleOf(file))).toEqual([])
  })

  it('leaves the rules the shared controls now carry out of the page', () => {
    const css = styleOf('./Builds.vue')
    for (const gone of ['.b-head', '.b-title', '.b-intro', '.b-none', '.b-section-title', '.b-empty-', '.b-error']) {
      expect(css, gone).not.toContain(gone)
    }
    expect(css).not.toMatch(/\.b-chip\s*\{/)
  })
})
