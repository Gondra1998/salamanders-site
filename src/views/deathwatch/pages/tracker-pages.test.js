// @vitest-environment jsdom
// The rebuilt Event Tracker and Manage views, mounted on the invented fixture data: each shows the original's
// headings and its data, links between the views carry the dev ?scene=, and the Manage pages write through the store.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
vi.mock('../../../lib/deathwatch/api', () => ({ getMe: vi.fn(), getData: vi.fn(), writeDoc: vi.fn() }))
import { getData } from '../../../lib/deathwatch/api'
import { fixtureData } from '../../../lib/deathwatch/fixtureData'
import { calc } from '../../../lib/deathwatch/tracker'
import { useDeathwatch } from '../../../stores/deathwatch'
import { useDeathwatchData } from '../../../stores/deathwatchData'

const PAGES = import.meta.glob('./*/*.vue', { eager: true })
let pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  // Fresh and in-memory, so the views neither fetch nor reach a server.
  useDeathwatchData().$patch({ status: 'ready', ...fixtureData(), local: true })
  useDeathwatch().$patch({ status: 'allowed', commander: true })
})

async function mountPage(key, query = {}) {
  const none = { render: () => null }
  // The app's route shape, so a view can read its area and tab from the params (TrackerState heads the Event Tracker).
  const routes = [{ path: '/deathwatch/:area/:tab?/:sub?', component: none }, { path: '/:p(.*)*', component: none }]
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ path: `/deathwatch/${key}`, query })
  const w = mount(PAGES[`./${key}.vue`].default, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { w, router }
}
const h2 = (w) => w.findAll('h2').map((h) => h.text())
const R = () => calc(useDeathwatchData().teams)

describe('Event Tracker', () => {
  it('Standings: podium, table, chart and companies, leader first', async () => {
    const { w } = await mountPage('eventtracker/standings', { scene: 'commander' })
    expect(h2(w)).toEqual(['Standings', 'Points progression', 'Watch Companies'])
    expect(w.findAll('.pod-card')).toHaveLength(3)
    expect(w.find('tbody tr').text()).toContain(R().ts[0].n)
    expect(w.find('.pc-svg').exists()).toBe(true)
    // A team link opens its profile and keeps the dev scene.
    expect(w.find('tbody a').attributes('href')).toMatch(/^\/deathwatch\/eventtracker\/kill-teams\?scene=commander&t=\d+$/)
  })

  it('heads itself like the Armouring Hall: the event as its line, its seven tabs, the open one marked', async () => {
    const { w } = await mountPage('eventtracker/standings')
    expect(w.get('.hh-title').text()).toBe('Event Tracker')
    expect(w.get('.hh-line').text()).toBe(useDeathwatchData().cfg.tx?.cur_n || 'Deathwatch Tour')
    expect(w.findAll('a.hh-tab')).toHaveLength(7)
    expect(w.get('a.hh-tab[aria-current="page"]').text()).toBe('Standings')
  })

  it('Standings: tied teams share a rank, on the podium and in the table', async () => {
    const m = (gs) => [[1, 1, 1, 0, gs, 0, 0, '', [['x', 'Tactical', 0, 1, 0, 0, 0, 0, 0, 0, 0]]]]
    useDeathwatchData().teams = {
      1: { id: 1, n: 'Alpha', ro: [], m: m(0) },
      2: { id: 2, n: 'Beta', ro: [], m: m(1) },
      3: { id: 3, n: 'Gamma', ro: [], m: m(1) },
    }
    const { w } = await mountPage('eventtracker/standings')
    expect(w.findAll('.pod-card').map((c) => [c.get('.pod-name').text(), c.get('.pod-rank').text(), c.classes().at(-1)])).toEqual([
      ['Beta', '1', 'p1'],
      ['Gamma', '1', 'p1'],
      ['Alpha', '3', 'p3'],
    ])
    expect(w.findAll('tbody .rank').map((d) => d.text()).slice(0, 3)).toEqual(['1', '1', '3'])
  })

  it('Standings: the chart turns into a table', async () => {
    const { w } = await mountPage('eventtracker/standings')
    await w.findAll('.pc-modes button').at(3).trigger('click')
    expect(w.findAll('table')).toHaveLength(3)
  })

  it('Standings: with no running event, points to the Archive', async () => {
    useDeathwatchData().teams = {}
    const { w } = await mountPage('eventtracker/standings')
    expect(w.find('.dw-empty').text()).toContain('No event is running')
  })

  it('Kill Teams: the team in ?t, with its players, weeks and missions', async () => {
    const { w } = await mountPage('eventtracker/kill-teams', { t: '2' })
    expect(h2(w)).toEqual(['Kill Team profile', 'Players', 'Points per week', 'Missions'])
    expect(w.find('select').element.value).toBe('2')
    expect(w.findAll('table')).toHaveLength(3)
  })

  it('Kill Teams: picking another team changes ?t', async () => {
    const { w, router } = await mountPage('eventtracker/kill-teams')
    await w.find('select').setValue('3')
    await flushPromises()
    expect(router.currentRoute.value.query.t).toBe('3')
  })

  it('Players: ranked by MVP, and a profile in ?p', async () => {
    const { w } = await mountPage('eventtracker/players')
    expect(w.find('tbody tr').text()).toContain(R().pl[0].n)
    const name = R().pl[0].n
    const { w: p } = await mountPage('eventtracker/players', { p: name })
    expect(p.find('.ppn').text()).toBe(name)
    expect(h2(p)).toEqual(['Player profile', 'Missions'])
  })

  // A name or a class that matches a built-in property, and a played mission stored without its rows.
  describe('with awkward data', () => {
    const row = (name, cls, k) => [name, cls, 0, k, 0, 0, 0, 0, 0, 0, 0]
    beforeEach(() => {
      useDeathwatchData().teams = {
        1: {
          id: 1,
          n: 'Alpha',
          co: 'Primus',
          ro: ['constructor', '__proto__'],
          m: [
            [1, 1, 1, 0, 0, 0, 0, '', [row('constructor', 'toString', 40), row('__proto__', 'Sniper', 10)]],
            [1, 2, 1, 0, 0, 0, 0, '', [row('constructor', 'toString', 2), row('hasOwnProperty', 'Sniper', 5)]],
            [1, 3, 1, 0, 0, 0, 0, ''],
          ],
        },
      }
    })

    it('Kill Teams: counts each player under their own name, guests after the roster', async () => {
      const { w } = await mountPage('eventtracker/kill-teams', { t: '1' })
      const rows = w.findAll('tbody')[0].findAll('tr').map((r) => r.findAll('td').map((d) => d.text()))
      expect(rows.map((r) => [r[0], r[1], r[2]])).toEqual([
        ['constructor', '2', '42'],
        ['__proto__', '1', '10'],
        ['hasOwnPropertyGuest', '1', '5'],
      ])
      expect(Object.prototype).not.toHaveProperty('o')
    })

    it('Players: a profile counts every mission, and its classes by name', async () => {
      const { w } = await mountPage('eventtracker/players', { p: 'constructor' })
      expect(w.find('.ppn').text()).toBe('constructor')
      expect(w.text()).toContain('toString')
      const { w: p } = await mountPage('eventtracker/players', { p: '__proto__' })
      expect(p.find('.ppn').text()).toBe('__proto__')
      expect(p.text()).toContain('Sniper')
    })
  })

  it('Players: a fallen player carries the KIA tag', async () => {
    const { w } = await mountPage('eventtracker/kill-teams', { t: '4' })
    expect(w.find('.dw-tag.kia').text()).toBe('KIA W2')
  })

  it('Honour Roll: the champion and every award', async () => {
    const { w } = await mountPage('eventtracker/honour-roll')
    expect(h2(w)).toEqual(['Honour Roll', 'Kill Team awards'])
    expect(w.find('.dw-tile-who').text()).toBe(R().ts[0].n)
    expect(w.findAll('.dw-tile')).toHaveLength(1 + 8 + 8)
  })

  it('Game Stats: totals, per team and classes', async () => {
    const { w } = await mountPage('eventtracker/game-stats')
    expect(h2(w)).toEqual(['Game Stats', 'Per Kill Team', 'Classes', 'Class mix per Kill Team'])
  })

  it('Scoring: the rules from the weights, best mission included', async () => {
    useDeathwatchData().$patch({ cfg: { s: { base: 400 } } })
    const { w } = await mountPage('eventtracker/scoring')
    expect(h2(w)).toEqual(['Event points per mission', 'Best possible mission', 'MVP score per objective'])
    expect(w.find('.total').text()).toContain('875') // 400 + 200 + 100 + 75 + 100
  })

  it('Archive: the list, then an event with its own views', async () => {
    const { w } = await mountPage('eventtracker/archive')
    expect(w.findAll('.ev')).toHaveLength(1)
    const { w: e } = await mountPage('eventtracker/archive', { e: 'e1', v: 'honour-roll' })
    expect(h2(e)[0]).toBe('Deathwatch Tour — Ash Season')
    expect(e.find('nav.views [aria-current="page"]').text()).toBe('Honour Roll')
    expect(e.findAll('nav.views a').map((a) => a.attributes('href'))[1]).toBe('/deathwatch/eventtracker/archive?e=e1&v=kill-teams')
  })

  it('Archive: an unknown event shows the list', async () => {
    const { w } = await mountPage('eventtracker/archive', { e: '__proto__' })
    expect(h2(w)).toEqual(['Archive'])
  })

  it('shows the error with a retry when the data could not be loaded', async () => {
    getData.mockRejectedValueOnce(new Error('Restricted to the Deathwatch.'))
    useDeathwatchData().$patch({ status: 'idle', local: false })
    const { w } = await mountPage('eventtracker/players')
    expect(w.get('[role="alert"]').text()).toContain('Restricted to the Deathwatch.')
  })
})

describe('Manage', () => {
  it('Enter mission: saves a new mission into its slot and moves on', async () => {
    const data = useDeathwatchData()
    const team = Object.values(data.teams)[0]
    const free = [1, 2, 3, 4].flatMap((wk) => [1, 2, 3, 4].map((o) => [wk, o])).find(([wk, o]) => !team.m.some((m) => m[0] === wk && m[1] === o))
    const { w } = await mountPage('manage/enter-mission')
    const btn = w.findAll('.grid button').find((b) => b.attributes('title').startsWith(`W${free[0]} · O${free[1]}`))
    await btn.trigger('click')
    await w.find('input[list="dw-players"]').setValue('Brother Newcomer')
    await w.findAll('button').find((b) => b.text() === 'Save mission').trigger('click')
    await flushPromises()
    const saved = data.teams[team.id].m.find((m) => m[0] === free[0] && m[1] === free[1])
    expect(saved[8][0][0]).toBe('Brother Newcomer')
    expect(w.text()).toContain('Saved ✓')
    expect(w.find('.dw-tag.guest').exists()).toBe(true)
  })

  it('Enter mission: refuses more than three carry slots', async () => {
    const { w } = await mountPage('manage/enter-mission')
    const sel = w.findAll('select')
    await sel.at(4).setValue('1') // Gene-Seed
    // A Relic count over the cap is disabled in the picker.
    expect(sel.at(6).findAll('option').at(3).attributes('disabled')).toBeDefined()
  })

  it('Manage: saves the weights, adds a Kill Team and renames a player', async () => {
    const data = useDeathwatchData()
    const { w } = await mountPage('manage/manage')
    expect(h2(w)).toEqual(['Scoring', 'Rename or merge player', 'Tour', 'Kill Teams', 'Restore from backup', 'Event archive', 'Reset Kill Teams'])
    const pageText = data.cfg.tx.ts_h
    await w.find('input[placeholder="Deathwatch Tour"]').setValue('  Tour of the Ashen Gate ')
    await w.findAll('button').find((b) => b.text() === 'Save tour name').trigger('click')
    await flushPromises()
    expect(data.cfg.tx.cur_n).toBe('Tour of the Ashen Gate')
    expect(data.cfg.tx.ts_h).toBe(pageText) // the other page texts are kept
    await w.find('input[type="number"]').setValue('450')
    await w.findAll('button').find((b) => b.text() === 'Save scoring').trigger('click')
    await flushPromises()
    expect(data.cfg.s.base).toBe(450)

    const before = Object.keys(data.teams).length
    await w.findAll('button').find((b) => b.text() === 'Add Kill Team').trigger('click')
    await flushPromises()
    expect(Object.keys(data.teams)).toHaveLength(before + 1)

    const [a, b] = w.findAll('input[list="dw-names"]')
    await a.setValue('Brother Ashkar')
    await b.setValue('Brother Ashkarr')
    await w.findAll('button').find((x) => x.text() === 'Check').trigger('click')
    await w.findAll('button').find((x) => x.text() === 'Rename everywhere').trigger('click')
    await flushPromises()
    expect(data.teams[1].ro).toContain('Brother Ashkarr')
    expect(data.archive.e1.teams[0].ro).toContain('Brother Ashkarr')
  })

  it('Manage: archive & reset keeps a copy, then clears the live event', async () => {
    const data = useDeathwatchData()
    const { w } = await mountPage('manage/manage')
    await w.findAll('button').find((b) => b.text() === 'Archive & reset').trigger('click')
    const confirm = w.findAll('button').filter((b) => b.text() === 'Archive & reset').at(1)
    expect(confirm.attributes('disabled')).toBeDefined()
    await w.findAll('input').find((i) => i.element.parentElement.textContent.includes('Type RESET')).setValue('reset')
    await confirm.trigger('click')
    await flushPromises()
    expect(Object.keys(data.archive)).toHaveLength(2)
    expect(data.teams).toEqual({})
    expect(data.cfg.tx.cur_n).toBeUndefined() // the next tour starts unnamed
    expect(w.text()).toContain('No event is running')
  })

  it('Checks: every check with its count', async () => {
    const { w } = await mountPage('manage/checks')
    expect(w.findAll('tbody tr')).toHaveLength(5)
  })
})
