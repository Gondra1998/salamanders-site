// @vitest-environment jsdom
// Manage → Access: the page access grid (roles × parts, saved as cfg `g`), and the grants: lists them, adds one only
// for a well-formed Discord id, revokes one after a confirm.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
vi.mock('../../../../lib/deathwatch/grants', () => ({ listGrants: vi.fn(), addGrant: vi.fn(), removeGrant: vi.fn() }))
import { addGrant, listGrants, removeGrant } from '../../../../lib/deathwatch/grants'
import { useDeathwatchData } from '../../../../stores/deathwatchData'
import { AREAS } from '../../../../lib/deathwatch/areas'
import Access from './access.vue'

const G = { discordId: '300000000000000101', grantedBy: '300000000000000001', grantedAt: '2026-10-02T18:00:00Z' }

// `cfg`: the area's settings, in memory (no server); none set by default.
async function mountAccess(cfg = {}) {
  const none = { render: () => null }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: none }] })
  await router.push('/deathwatch/administratum/access')
  const pinia = createPinia()
  setActivePinia(pinia)
  useDeathwatchData().$patch({ status: 'ready', local: true, cfg })
  const w = mount(Access, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return w
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(listGrants).mockReset().mockResolvedValue([G])
  vi.mocked(addGrant).mockReset().mockResolvedValue()
  vi.mocked(removeGrant).mockReset().mockResolvedValue()
})

const grantsTable = (w) => w.findAll('tbody').at(1)
const box = (w, role, area) => w.find(`input[aria-label="${role} opens ${AREAS[area].label}"]`)

describe('Manage → Access: page access', () => {
  it('ticks the defaults with nothing set, and the Watch Commander everywhere, fixed', async () => {
    const w = await mountAccess()
    expect(box(w, 'Deathwatch Deployment', 'eventtracker').element.checked).toBe(true)
    expect(box(w, 'Legion', 'eventtracker').element.checked).toBe(false)
    expect(box(w, 'Xenosbane Sigil', 'chronicles').element.checked).toBe(true)
    const wc = box(w, 'Watch Commander', 'recruitment')
    expect([wc.element.checked, wc.attributes('disabled')]).toEqual([true, ''])
    expect(w.text()).not.toContain('Kill-Marine') // a role checked elsewhere, not one that opens a part
    expect(w.findAll('button').find((b) => b.text() === 'Save page access').attributes('disabled')).toBeDefined() // nothing changed
  })

  it('saves the ticked roles per part, in the list order', async () => {
    const w = await mountAccess()
    await box(w, 'Legion', 'eventtracker').setValue(true)
    await box(w, 'Deathwatch Deployment', 'eventtracker').setValue(false)
    await box(w, 'Vigilia Mortis in Aeternum', 'hallofrelics').setValue(true)
    expect(w.text()).toContain('Unsaved changes')
    await w.findAll('button').find((b) => b.text() === 'Save page access').trigger('click')
    await flushPromises()
    const g = useDeathwatchData().cfg.g
    expect(g.eventtracker).toEqual(['legion'])
    expect(g.hallofrelics).toEqual(['legion', 'emissary', 'vigilia'])
    expect(g.armouringhall).toEqual(['deployment', 'command'])
    expect(g.manage).toBeUndefined()
  })

  it('reads a saved choice, and goes back to the defaults by deleting it', async () => {
    const w = await mountAccess({ g: { eventtracker: ['vigilia'] } })
    expect(box(w, 'Vigilia Mortis in Aeternum', 'eventtracker').element.checked).toBe(true)
    expect(box(w, 'Deathwatch Deployment', 'eventtracker').element.checked).toBe(false)
    await w.findAll('button').find((b) => b.text() === 'Back to defaults').trigger('click')
    await flushPromises()
    expect(useDeathwatchData().cfg.g).toBeUndefined()
    expect(box(w, 'Deathwatch Deployment', 'eventtracker').element.checked).toBe(true)
  })
})

describe('Manage → Access', () => {
  it('lists the grants', async () => {
    const w = await mountAccess()
    expect(grantsTable(w).text()).toContain(G.discordId)
  })

  it('refuses an id that is not 17 to 20 digits, and sends a good one', async () => {
    const w = await mountAccess()
    await w.find('form input').setValue('12345')
    await w.find('form').trigger('submit')
    expect(addGrant).not.toHaveBeenCalled()
    expect(w.find('.dw-msg.bad').exists()).toBe(true)
    await w.find('form input').setValue(' 300000000000000102 ')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(addGrant).mock.calls[0][1]).toBe('300000000000000102')
    expect(listGrants).toHaveBeenCalledTimes(2) // fetched again after the change
  })

  it('revokes only after the confirm', async () => {
    const w = await mountAccess()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    await grantsTable(w).find('button').trigger('click')
    expect(removeGrant).not.toHaveBeenCalled()
    await grantsTable(w).find('button').trigger('click')
    await flushPromises()
    expect(vi.mocked(removeGrant).mock.calls[0][1]).toBe(G.discordId)
  })

  it('shows the server error, with a retry', async () => {
    vi.mocked(listGrants).mockRejectedValue(new Error('Only the Watch Commander can do that.'))
    const w = await mountAccess()
    expect(w.find('[role="alert"]').text()).toContain('Only the Watch Commander can do that.')
  })
})
