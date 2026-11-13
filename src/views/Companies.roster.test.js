// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import companies from '../data/companies.json'
import fixture from '../data/roster.fixture.json'
import { publicRoster } from '../../server/src/rosterPublic.js'

let auth
vi.mock('../stores/auth', () => ({ useAuth: () => auth }))
vi.mock('../lib/rosterApi', () => ({ getRoster: vi.fn(), getInfirmary: vi.fn(), getPublicRoster: vi.fn() }))
import * as api from '../lib/rosterApi'
import Companies from './Companies.vue'

const PUBLIC = { fetchedAt: fixture.roster.fetchedAt, stale: false, ...publicRoster(fixture.roster) }
const company3 = fixture.roster.branches.find((b) => b.key === 'company-3')
const apiError = (status, message = 'nope') => Object.assign(new Error(message), { status })
const signedOut = () => ({ token: null, member: null, signedIn: false, signIn: vi.fn() })
const legion = (id = '200000000000000001') => ({ token: 'tok', member: { id }, signedIn: true, signIn: vi.fn() })

const mounted = []
// The page and its async pieces (the ranks chunk, the High Command panel) have all arrived: the
// chunk is a dynamic import, which takes real time, so wait for the placeholders to go, not for ticks.
const settle = async (w) => {
  await vi.waitFor(() => expect(w.find('.rs-ranks-loading').exists()).toBe(false), { timeout: 5000 })
  await flushPromises()
  await flushPromises()
}
const render = async () => {
  const w = mount(Companies)
  mounted.push(w)
  await settle(w)
  return w
}
const rosterHtml = (w) => w.findAll('.rs-branch, .rs-high-command').map((el) => el.html()).join('')
const follows = (a, b) => Boolean(a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  auth = signedOut()
  api.getRoster.mockResolvedValue(fixture.roster)
  api.getInfirmary.mockResolvedValue(fixture.infirmary)
  api.getPublicRoster.mockResolvedValue(PUBLIC)
})
afterEach(() => mounted.splice(0).forEach((w) => w.unmount())) // the member page polls on a timer

describe('Companies with the roster: a Legion member', () => {
  beforeEach(() => {
    auth = legion()
  })

  it('has a collapsed Ranks bar under every company, in the story order', async () => {
    const w = await render()
    expect(w.findAll('.rs-branch')).toHaveLength(12)
    expect(w.findAll('[data-open]')).toHaveLength(0)
    for (const c of companies) {
      const article = w.find(`article#${c.id}`)
      const bar = article.find(`[data-branch="${c.branch}"]`)
      expect(bar.exists(), c.id).toBe(true)
      expect(bar.classes(), c.id).toContain('rs-embedded')
      expect(follows(article.find('.company-head'), bar), c.id).toBe(true)
      expect(follows(bar, article.find('.company-body')), c.id).toBe(true)
    }
    expect(w.find('.company .rs-sigil').exists()).toBe(false) // the company header already has the sigil
  })

  it('puts High Command first, above the chips, with its own chip', async () => {
    const w = await render()
    const hc = w.find('.rs-high-command')
    expect(hc.attributes('id')).toBe('high-command')
    expect(hc.text()).toContain('Lord of Drakes')
    expect(follows(hc, w.find('nav.c-index'))).toBe(true)
    const chips = w.findAll('.c-chip')
    expect(chips).toHaveLength(companies.length + 2) // every company, High Command first, and the Muster last for a member
    expect(chips[0].text()).toContain('High Command')
    expect(chips.at(-1).text()).toContain('Muster')
  })

  it('fills each bar from the full roster: names, avatars-ready chips and the ladder body', async () => {
    const w = await render()
    const bar = w.find('[data-branch="company-3"]')
    expect(bar.find('.rs-head').text()).toContain(company3.head.members[0].name)
    expect(bar.find('.rs-body .rs-ladder').exists()).toBe(true)
    expect(bar.find('li.rs-member').attributes('data-id')).toMatch(/^\d{17,20}$/)
  })

  it('opens and closes a bar from its button, and keeps the others as they are', async () => {
    const w = await render()
    await w.find('[data-branch="company-3"] button').trigger('click')
    expect(w.find('[data-jump="company-3"]').attributes('data-open')).toBeDefined()
    expect(w.findAll('[data-open]')).toHaveLength(1)
    await w.find('[data-branch="company-3"] button').trigger('click')
    expect(w.findAll('[data-open]')).toHaveLength(0)
  })

  it('marks the signed-in member’s own chip', async () => {
    auth = legion(company3.head.members[0].id)
    const w = await render()
    expect(w.find(`[data-branch="company-3"] li[data-id="${company3.head.members[0].id}"]`).classes()).toContain('rs-me')
  })

  it('falls back to the public view with a note when the live roster is down', async () => {
    api.getRoster.mockRejectedValue(apiError(503, 'down'))
    const w = await render()
    expect(w.find('.c-note').text()).toContain('The live roster is unavailable')
    expect(w.findAll('.rs-branch')).toHaveLength(12)
    expect(w.find('.rs-shape').exists()).toBe(true)
  })
})

describe('Companies with the roster: everyone else', () => {
  it('shows the head by name and the ranks as counts, with no ladder', async () => {
    const w = await render()
    expect(api.getRoster).not.toHaveBeenCalled()
    expect(w.findAll('.rs-branch')).toHaveLength(12)
    const bar = w.find('[data-branch="company-3"]')
    expect(bar.find('.rs-head').text()).toContain(company3.head.members[0].name)
    expect(bar.findAll('.rs-shape-row').length).toBeGreaterThan(0)
    expect(bar.find('.rs-ladder').exists()).toBe(false)
    expect(w.find('.rs-high-command').text()).toContain('Lord of Drakes')
  })

  it('has no Discord id, avatar, image or rank-and-file name anywhere in the roster markup', async () => {
    const w = await render()
    const html = rosterHtml(w)
    expect(html).not.toMatch(/\d{17,20}/)
    expect(html).not.toContain('cdn.discordapp.com')
    expect(html).not.toContain('<img')
    const sergeant = company3.rows.flatMap((r) => r.members).find(Boolean)
    expect(html).not.toContain(sergeant.name)
    expect(w.findAll('.rs-body li.rs-member').every((li) => li.element.closest('.rs-shape-heads'))).toBe(true)
  })

  it('offers the sign-in from inside an opened bar', async () => {
    const w = await render()
    await w.find('[data-branch="company-3"] button').trigger('click')
    await w.find('[data-branch="company-3"] .rs-shape-signin button').trigger('click')
    expect(auth.signIn).toHaveBeenCalledTimes(1)
  })

  it('keeps the stories and chips, with no bars and no error, when the public roster is unavailable', async () => {
    api.getPublicRoster.mockRejectedValue(apiError(503, 'The roster is not available yet. Try again.'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = await render()
    expect(w.findAll('article.company')).toHaveLength(companies.length)
    expect(w.findAll('.c-chip')).toHaveLength(companies.length)
    expect(w.findAll('.rs-branch')).toHaveLength(0)
    expect(w.find('.rs-high-command').exists()).toBe(false)
    expect(w.find('.rs-ranks-loading').exists()).toBe(false)
    expect(w.find('.rs-hc-loading').exists()).toBe(false) // no roster, so no place held for it either
    expect(w.find('.c-note').exists()).toBe(false)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('holds each bar’s place until the roster code and data arrive', async () => {
    const w = mount(Companies)
    mounted.push(w)
    expect(w.findAll('.rs-ranks-loading')).toHaveLength(companies.length)
    expect(w.findAll('.rs-branch')).toHaveLength(0)
    await settle(w)
    expect(w.findAll('.rs-ranks-loading')).toHaveLength(0)
    expect(w.findAll('.rs-branch')).toHaveLength(12)
  })

  it('holds High Command’s place too, above the chips, so nothing below it jumps when it arrives', async () => {
    const w = mount(Companies)
    mounted.push(w)
    expect(w.findAll('.rs-hc-loading')).toHaveLength(1)
    expect(w.find('.rs-high-command').exists()).toBe(false)
    expect(follows(w.find('.rs-hc-loading'), w.find('nav.c-index'))).toBe(true)
    await settle(w)
    await vi.waitFor(() => expect(w.find('.rs-high-command').exists()).toBe(true))
    expect(w.findAll('.rs-hc-loading')).toHaveLength(0)
    expect(w.findAll('.rs-high-command')).toHaveLength(1)
  })

  it('does not hold a place for High Command while a search is narrowing the page', async () => {
    const w = mount(Companies)
    mounted.push(w)
    await w.find('.c-search').setValue('forge')
    expect(w.find('.rs-hc-loading').exists()).toBe(false)
    await settle(w)
  })
})

describe('Companies with the roster: search', () => {
  it('narrows to the matching company, and High Command only when it matches too', async () => {
    const w = await render()
    await w.find('.c-search').setValue('forge')
    expect(w.findAll('article.company').map((a) => a.attributes('id'))).toContain('armoury')
    expect(w.find('.rs-high-command').exists()).toBe(false)
    expect(w.findAll('.c-chip').every((c) => !c.text().includes('High Command'))).toBe(true)
    await w.find('.c-search').setValue('chaplain')
    expect(w.find('.rs-high-command').exists()).toBe(true)
    expect(w.findAll('.c-chip')[0].text()).toContain('High Command')
  })

  it('says so when nothing matches, High Command included', async () => {
    const w = await render()
    await w.find('.c-search').setValue('zzzzzz')
    expect(w.find('.c-empty').text()).toBe('No companies match “zzzzzz”.')
    expect(w.find('.rs-high-command').exists()).toBe(false)
  })
})

describe('Companies with a public roster it cannot read', () => {
  it.each([
    ['no branches', { fetchedAt: 'x', stale: false, highCommand: [] }],
    ['null branches', { fetchedAt: 'x', stale: false, highCommand: [], branches: null }],
    ['a branch without a head', { fetchedAt: 'x', stale: false, highCommand: [], branches: [{ key: 'company-3', kind: 'company', label: 'x', aside: 0, rows: [] }] }],
  ])('keeps every story, shows no bars and throws nothing for %s', async (_, payload) => {
    api.getPublicRoster.mockResolvedValue(payload)
    const errors = []
    const w = mount(Companies, { global: { config: { errorHandler: (e) => errors.push(e) } } })
    mounted.push(w)
    await settle(w)
    for (const c of companies) expect(w.find(`article#${c.id}`).exists(), c.id).toBe(true)
    expect(w.findAll('.rs-branch')).toHaveLength(0)
    expect(errors).toEqual([])
  })
})
