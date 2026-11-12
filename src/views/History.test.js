// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import History from './History.vue'

vi.mock('../lib/perksApi', () => ({
  getHistory: vi.fn(),
  revokePrivileges: vi.fn(),
  reinstatePrivileges: vi.fn(),
}))

vi.mock('../stores/auth', () => ({
  useAuth: vi.fn(() => ({
    token: 'tok',
    signedIn: true,
    member: { id: '1', username: 'test' },
  })),
}))

vi.mock('../stores/perkCorrections', () => ({
  usePerkCorrections: vi.fn(() => ({
    privileges: { revoker: true },
    revert: vi.fn(),
  })),
}))

describe('History.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('drops stale responses: second load wins over first', async () => {
    const { getHistory } = await import('../lib/perksApi')
    let resolve1, resolve2
    const promise1 = new Promise((r) => {
      resolve1 = r
    })
    const promise2 = new Promise((r) => {
      resolve2 = r
    })

    getHistory.mockImplementation(() => promise1)
    const wrapper = mount(History)

    // Change filter to trigger second load
    await wrapper.vm.$nextTick()
    getHistory.mockImplementationOnce(() => promise2)
    wrapper.vm.subject = 'perk_correction'

    // Resolve second (newer) response first
    resolve2({
      events: [{ id: '2', subject: 'perk_correction', action: 'created', actor: { id: '1', username: 'test' }, snapshot: { perkName: 'New' } }],
      revocations: [],
      next: null,
    })
    await new Promise((r) => setTimeout(r, 0))

    // Resolve first (older) response
    resolve1({
      events: [{ id: '1', subject: 'perk_correction', action: 'created', actor: { id: '1', username: 'test' }, snapshot: { perkName: 'Old' } }],
      revocations: [],
      next: null,
    })
    await new Promise((r) => setTimeout(r, 0))

    // Second response should be displayed (ID '2', not '1')
    expect(wrapper.vm.events).toHaveLength(1)
    expect(wrapper.vm.events[0].id).toBe('2')
  })

  it('disables Older button while loading', async () => {
    const { getHistory } = await import('../lib/perksApi')
    let resolve1
    const promise1 = new Promise((r) => {
      resolve1 = r
    })

    getHistory.mockReturnValueOnce(promise1)
    const wrapper = mount(History)
    resolve1({
      events: [],
      revocations: [],
      next: 'cursor123',
    })
    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    // Now trigger a second load with a pending promise
    let resolve2
    const promise2 = new Promise((r) => {
      resolve2 = r
    })
    getHistory.mockReturnValueOnce(promise2)

    wrapper.vm.load(true)
    await wrapper.vm.$nextTick()

    // Loading state should be true while request is pending
    expect(wrapper.vm.loading).toBe(true)

    resolve2({
      events: [],
      revocations: [],
      next: null,
    })
    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    // Loading state should be false after request completes
    expect(wrapper.vm.loading).toBe(false)
  })

  async function mountWith(events) {
    const { getHistory } = await import('../lib/perksApi')
    getHistory.mockReset()
    getHistory.mockResolvedValue({ events, revocations: [], next: null })
    const wrapper = mount(History)
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    return wrapper
  }
  const correction = (id, snapshot) => ({
    id,
    subject: 'perk_correction',
    subjectId: String(id),
    action: 'created',
    actor: { id: '9', username: 'tm' },
    createdAt: '2026-09-27T00:00:00Z',
    snapshot,
    note: null,
  })

  it('an expanded edit shows what it replaced, as plain text', async () => {
    const wrapper = await mountWith([
      correction(5, { op: 'edit', perkName: 'PV', description: 'new <b>text</b>', before: { name: 'PV', description: 'old text' } }),
    ])
    await wrapper.find('.hist-line').trigger('click')
    const change = wrapper.find('.hist-change')
    expect(change.text()).toContain('Before: old text')
    expect(change.text()).toContain('After: new <b>text</b>')
    expect(change.find('b').exists()).toBe(false)
  })

  it('a remove reads "After: removed"; a missing before description reads "—"', async () => {
    const wrapper = await mountWith([correction(6, { op: 'remove', perkName: 'PV', description: null, before: { name: 'PV', description: null } })])
    await wrapper.find('.hist-line').trigger('click')
    expect(wrapper.find('.hist-change').text()).toContain('Before: —')
    expect(wrapper.find('.hist-change').text()).toContain('After: removed')
  })

  it("hides Revoke on the caller's own entries, using the id from /privileges/me", async () => {
    const { usePerkCorrections } = await import('../stores/perkCorrections')
    usePerkCorrections.mockReturnValueOnce({ privileges: { revoker: 'forge', id: '9' }, revert: vi.fn() })
    const wrapper = await mountWith([
      correction(8, { op: 'add', perkName: 'HH', description: 'd', before: null }),
      { ...correction(9, { op: 'add', perkName: 'X', description: 'd', before: null }), actor: { id: '42', username: 'other' } },
    ])
    const lines = wrapper.findAll('.hist-line')
    await lines[0].trigger('click')
    expect(wrapper.text()).not.toContain('Revoke tm')
    await lines[1].trigger('click')
    expect(wrapper.text()).toContain('Revoke other')
  })

  it('no before/after block when the snapshot has no before (adds, older events)', async () => {
    const wrapper = await mountWith([correction(7, { op: 'add', perkName: 'HH', description: 'd', before: null })])
    await wrapper.find('.hist-line').trigger('click')
    expect(wrapper.find('.hist-change').exists()).toBe(false)
    expect(wrapper.find('.hist-snap').exists()).toBe(true)
  })

  it('opens with the shared page header', async () => {
    const wrapper = await mountWith([])
    const head = wrapper.find('header.page-head')
    expect(head.find('.eyebrow').text()).toBe('The Forge')
    expect(head.find('h1').text()).toBe('Version History')
    expect(head.find('.page-lede').text()).toBe('Every perk correction, deleted build and privilege change. Nothing here is ever removed.')
  })

  it('sets the filters as the shared tab and lights the chosen one with .on', async () => {
    const wrapper = await mountWith([])
    const tabs = wrapper.findAll('.hist-filter')
    expect(tabs.map((t) => t.text())).toEqual(['All', 'Perks', 'Builds', 'Privileges'])
    for (const t of tabs) expect(t.classes()).toEqual(expect.arrayContaining(['tab-forge', 'rm-fade']))
    expect(tabs[0].classes()).toContain('on')
    await tabs[2].trigger('click')
    expect(wrapper.findAll('.hist-filter')[2].classes()).toContain('on')
    expect(wrapper.findAll('.hist-filter')[0].classes()).not.toContain('on')
  })

  it('sets the search box as the shared field', async () => {
    const wrapper = await mountWith([])
    expect(wrapper.find('input.hist-search').classes()).toContain('field-forge')
  })

  it('leads every entry with a stud, so the category colour is not a side border', async () => {
    const wrapper = await mountWith([
      correction(1, { op: 'add', perkName: 'A', description: 'd', before: null }),
      { ...correction(2, { title: 'T', author: { username: 'a' } }), subject: 'build' },
      { ...correction(3, { username: 'u', reason: 'r' }), subject: 'privilege', action: 'revoked' },
    ])
    const items = wrapper.findAll('.hist-item')
    expect(items.map((i) => i.attributes('data-subject'))).toEqual(['perk_correction', 'build', 'privilege'])
    for (const item of items) {
      const first = item.find('.hist-line').element.firstElementChild
      expect(first.classList.contains('stud')).toBe(true)
      expect(first.classList.contains('hist-stud')).toBe(true)
      expect(first.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('says so in a state panel when there is nothing yet', async () => {
    const wrapper = await mountWith([])
    const panel = wrapper.find('.state-panel.is-empty.hist-empty')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('Nothing yet.')
  })

  it('does not say "Nothing yet." while the first load is still in flight', async () => {
    const { getHistory } = await import('../lib/perksApi')
    getHistory.mockReset()
    let resolve
    getHistory.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const wrapper = mount(History)
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.loading).toBe(true)
    expect(wrapper.find('.hist-empty').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Nothing yet.')

    resolve({ events: [], revocations: [], next: null })
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const panel = wrapper.find('.state-panel.is-empty.hist-empty')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('Nothing yet.')
  })

  it('shows a refusal in an alert state panel', async () => {
    const { getHistory } = await import('../lib/perksApi')
    getHistory.mockReset()
    getHistory.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
    const wrapper = mount(History)
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const panel = wrapper.find('.state-panel.is-error.hist-error')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('role')).toBe('alert')
    expect(panel.text()).toContain('Version History is restricted to the forge and Legion leadership.')
    expect(wrapper.find('.hist-empty').exists()).toBe(false)
  })
})

// The page-layer rules, read off the source: category colour in a stud (never a side border), tokens for
// colour, size and radius, and no press squeeze on the list row.
describe('History.vue styles', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'History.vue'), 'utf8')
  const style = source.slice(source.indexOf('<style'))

  it('has no side border, raw colour, literal radius or literal font size', () => {
    expect(style).not.toMatch(/border-left/)
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(style).not.toMatch(/rgba?\(/)
    expect(style).not.toMatch(/border-radius:\s*\d+px/)
    expect(style).not.toMatch(/font-size:\s*[\d.]+rem/)
  })

  it('leaves the shared tab and buttons to style.css', () => {
    expect(style).not.toMatch(/\.hist-filter/)
    expect(style).not.toMatch(/\.hist button/)
  })

  it('gives the list row no press squeeze', () => {
    expect(style).not.toMatch(/\.hist-line[^{]*:active/)
  })
})

describe('History.vue when signed out', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('offers a Sign in button, not just the instruction', async () => {
    const signIn = vi.fn()
    const { useAuth } = await import('../stores/auth')
    useAuth.mockReturnValueOnce({ token: null, signedIn: false, member: null, signIn })
    const wrapper = mount(History)
    expect(wrapper.find('.hist-empty').text()).toContain('Sign in with Discord to view the history.')
    await wrapper.find('.hist-empty button').trigger('click')
    expect(signIn).toHaveBeenCalledOnce()
    expect(wrapper.find('.hist-tools').exists()).toBe(false)
  })

  it('sets the sign-in prompt as a gate state panel', async () => {
    const { useAuth } = await import('../stores/auth')
    useAuth.mockReturnValueOnce({ token: null, signedIn: false, member: null, signIn: vi.fn() })
    const wrapper = mount(History)
    const panel = wrapper.find('.state-panel.is-gate.hist-empty')
    expect(panel.exists()).toBe(true)
    expect(panel.find('button').classes()).toEqual(expect.arrayContaining(['btn-ember', 'btn-md']))
  })
})
