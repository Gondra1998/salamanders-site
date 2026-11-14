// @vitest-environment jsdom
// Administratum → Access: the people given access by hand. The Watch Commander finds a member by name or id and adds
// one kind; everyone who sees the page sees the list; only he removes. The server is stood in for by the people
// module (lib/deathwatch/people.js), with invented members only.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
vi.mock('../../../../lib/deathwatch/people', () => ({ searchMembers: vi.fn(), listAccess: vi.fn(), addAccess: vi.fn(), removeAccess: vi.fn() }))
import { addAccess, listAccess, removeAccess, searchMembers } from '../../../../lib/deathwatch/people'
import { useDeathwatch } from '../../../../stores/deathwatch'
import Access from './access.vue'

const VALEN = { id: '300000000000000201', name: 'Brother Valen', avatar: 'https://cdn.discordapp.com/avatars/300000000000000201/a.png' }
const OSTAR_A = { id: '300000000000001111', name: 'Brother Ostar', avatar: null }
const OSTAR_B = { id: '300000000000002222', name: 'Brother Ostar', avatar: 'https://evil.example/x.png' }
const row = (m, kind, over = {}) => ({ id: m.id, kind, name: m.name, avatar: m.avatar, grantedBy: 'Watch Commander Tor', grantedAt: '2026-06-01T12:00:00.000Z', ...over })

let held // what the stand-in server holds
async function mountAccess({ commander = true, roles = [] } = {}) {
  const none = { render: () => null }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: none }] })
  await router.push('/deathwatch/administratum/access')
  const pinia = createPinia()
  setActivePinia(pinia)
  useDeathwatch().$patch({ status: 'allowed', commander, roles })
  const w = mount(Access, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return w
}
const typeIn = async (w, q) => {
  await w.get('input[type="search"]').setValue(q)
  vi.advanceTimersByTime(250)
  await flushPromises()
}
const results = (w) => w.findAll('.ac-results li')
const listed = (w) => w.findAll('.ac-list tbody tr').map((tr) => tr.findAll('td').map((td) => td.text()))
const button = (el, text) => el.findAll('button').find((b) => b.text() === text)

beforeEach(() => {
  vi.useFakeTimers()
  held = [row(VALEN, 'desk')]
  vi.mocked(listAccess).mockReset().mockImplementation(async () => held.map((r) => ({ ...r })))
  vi.mocked(searchMembers).mockReset().mockResolvedValue([OSTAR_A, OSTAR_B])
  vi.mocked(addAccess).mockReset().mockImplementation(async (_t, id, kind) => {
    const m = [VALEN, OSTAR_A, OSTAR_B].find((x) => x.id === id)
    held.push(row(m, kind))
  })
  vi.mocked(removeAccess).mockReset().mockImplementation(async (_t, id, kind) => {
    held = held.filter((r) => !(r.id === id && r.kind === kind))
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Administratum → Access, as the Watch Commander', () => {
  it('says that roles still open the Deathwatch, and lists who was given what by hand', async () => {
    const w = await mountAccess()
    expect(w.text()).toContain('Discord roles still open the Deathwatch by themselves. Here are the people given access by hand.')
    expect(listed(w)).toEqual([['Brother Valen', 'Desk', expect.stringMatching(/^1 Jun 2026 · by Watch Commander Tor$/), 'Remove']])
  })

  it('finds members as he types, telling two of one name apart by the end of their id', async () => {
    const w = await mountAccess()
    await typeIn(w, 'ostar')
    expect(vi.mocked(searchMembers).mock.lastCall[1]).toBe('ostar')
    expect(results(w).map((li) => li.find('.ac-name').text())).toEqual(['Brother Ostar', 'Brother Ostar'])
    expect(results(w).map((li) => li.find('.ac-id').text())).toEqual(['…1111', '…2222'])
  })

  it("shows a member's picture only from Discord's own address, else their initials", async () => {
    vi.mocked(searchMembers).mockResolvedValue([VALEN, OSTAR_B])
    const w = await mountAccess()
    await typeIn(w, 'br')
    const [valen, ostar] = results(w)
    expect(valen.find('img').attributes('src')).toBe(VALEN.avatar)
    expect(ostar.find('img').exists()).toBe(false)
    expect(ostar.find('.dw-av').attributes('data-i')).toBe('BO')
    expect(w.html()).not.toContain('evil.example')
  })

  it('adds a kind with one click, and the person joins the list', async () => {
    const w = await mountAccess()
    await typeIn(w, 'ostar')
    await button(results(w)[0], 'Watch Command').trigger('click')
    await flushPromises()
    expect(held.map((r) => [r.id, r.kind])).toEqual([
      [VALEN.id, 'desk'],
      [OSTAR_A.id, 'watchcommand'],
    ])
    expect(w.text()).toContain('Brother Ostar added: Watch Command.')
    expect(listed(w).map((r) => r.slice(0, 2))).toEqual([
      ['Brother Valen', 'Desk'],
      ['Brother Ostar', 'Watch Command'],
    ])
    expect(button(results(w)[0], 'Added').attributes('disabled')).toBeDefined()
  })

  it('shows a kind someone already holds as added', async () => {
    vi.mocked(searchMembers).mockResolvedValue([VALEN])
    const w = await mountAccess()
    await typeIn(w, 'val')
    expect(results(w)[0].findAll('button').map((b) => [b.text(), b.attributes('disabled') !== undefined])).toEqual([
      ['Added', true],
      ['Watch Command', false],
      ['Deathwatch', false],
    ])
  })

  it("says what went wrong when the server refuses, in the server's words", async () => {
    vi.mocked(addAccess).mockRejectedValue(Object.assign(new Error('Not in the server.'), { status: 404 }))
    const w = await mountAccess()
    await typeIn(w, 'ostar')
    await button(results(w)[1], 'Desk').trigger('click')
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toBe('Not in the server.')
    expect(held).toHaveLength(1)
  })

  it('removes after a confirm naming the person and the kind, and keeps them if he says no', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const w = await mountAccess()
    await button(w.get('.ac-list'), 'Remove').trigger('click')
    await flushPromises()
    expect(held).toHaveLength(1)
    expect(listed(w)).toHaveLength(1)
    await button(w.get('.ac-list'), 'Remove').trigger('click')
    await flushPromises()
    expect(ask.mock.lastCall).toEqual(["Remove Brother Valen's Desk access?"])
    expect(held).toEqual([])
    expect(w.text()).toContain('Brother Valen removed: Desk.')
    expect(w.text()).toContain('Nobody has been given access by hand.')
  })

  it('shows the id of someone the server could not name yet', async () => {
    held = [row(VALEN, 'deathwatch', { name: null, avatar: null })]
    const w = await mountAccess()
    expect(listed(w)[0][0]).toBe(VALEN.id)
    expect(w.find('.ac-list .dw-av').attributes('data-i')).toBe('?')
  })

  it('says when nothing matches, and when the member list is still loading', async () => {
    vi.mocked(searchMembers).mockResolvedValueOnce([]).mockRejectedValueOnce(Object.assign(new Error('x'), { status: 503 }))
    const w = await mountAccess()
    await typeIn(w, 'zz')
    expect(w.text()).toContain('No member matches.')
    await typeIn(w, 'zzz')
    expect(w.text()).toContain('The member list is still loading. Try again in a minute.')
  })

  it('says the list is not available yet on an API from before it, and gives any other failure its words', async () => {
    vi.mocked(listAccess).mockRejectedValueOnce(Object.assign(new Error('Not found.'), { status: 404 }))
    expect((await mountAccess()).get('[role="alert"]').text()).toBe('The access list is not available yet.')
    vi.mocked(listAccess).mockRejectedValueOnce(Object.assign(new Error('Discord could not be reached. Try again.'), { status: 503 }))
    expect((await mountAccess()).get('[role="alert"]').text()).toBe('Discord could not be reached. Try again.')
  })
})

describe('Administratum → Access, for the desk and admins', () => {
  it.each([
    ['the desk', ['deployment', 'desk']],
    ['an admin', ['deployment', 'admin']],
  ])('shows %s the list, with no search and no Remove', async (_, roles) => {
    const w = await mountAccess({ commander: false, roles })
    expect(w.find('input[type="search"]').exists()).toBe(false)
    expect(listed(w)).toEqual([['Brother Valen', 'Desk', expect.stringMatching(/by Watch Commander Tor$/)]])
    expect(w.findAll('button')).toHaveLength(0)
  })
})
