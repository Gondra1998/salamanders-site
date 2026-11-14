// @vitest-environment jsdom
// The rebuilt Event Tracker and Manage views, mounted on the invented fixture data: each shows the original's
// headings and its data, links between the views carry the dev ?scene=, and the Manage pages write through the store.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
// Manage's side menu: opens the section with that label.
const section = (w, label) => w.findAll('.mg-item').find((b) => b.text() === label).trigger('click')
const R = () => calc(useDeathwatchData().teams)
// Manage's tour button (its label depends on whether an event is running), and an input by its label's text.
const tourButton = (w) => w.findAll('button').find((b) => ['Save tour name', 'Open new tour'].includes(b.text()))
const field = (w, label) => w.findAll('input').find((i) => i.element.parentElement.textContent.trim().startsWith(label))

describe('Event Tracker', () => {
  it('Standings: podium, table, chart and companies, leader first', async () => {
    const { w } = await mountPage('eventtracker/standings', { scene: 'commander' })
    expect(h2(w)).toEqual(['Standings', 'Points progression', 'Watch Companies'])
    expect(w.findAll('.pod-card')).toHaveLength(3)
    expect(w.find('tbody tr').text()).toContain(R().ts[0].n)
    expect(w.find('details').exists()).toBe(false) // the progression is always shown, on the totals as a table
    expect(w.find('.pc-svg').exists()).toBe(false)
    // A team link opens its profile and keeps the dev scene.
    expect(w.find('tbody a').attributes('href')).toMatch(/^\/deathwatch\/eventtracker\/kill-teams\?scene=commander&t=\d+$/)
  })

  it('heads itself like the Armouring Hall: the event as its line, its seven tabs, the open one marked', async () => {
    const { w } = await mountPage('eventtracker/standings')
    expect(w.get('.hh-title').text()).toBe('Event Tracker')
    expect(w.get('.hh-line').text()).toBe('Deathwatch Tour — Ember Moon')
    expect(w.findAll('a.hh-tab')).toHaveLength(7)
    expect(w.get('a.hh-tab[aria-current="page"]').text()).toBe('Standings')
  })

  it('heads itself "Deathwatch Tour" while the tour has no name, and stands while the data loads', async () => {
    const data = useDeathwatchData()
    const { cur_n, ...tx } = data.cfg.tx
    expect(cur_n).toBeTruthy()
    data.cfg = { ...data.cfg, tx }
    data.status = 'loading'
    const { w } = await mountPage('eventtracker/players')
    expect(w.get('.hh-line').text()).toBe('Deathwatch Tour')
    expect(w.get('a.hh-tab[aria-current="page"]').text()).toBe('Operatives')
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

  it('Standings: the progression opens on the totals as a table, and turns into the chart', async () => {
    const { w } = await mountPage('eventtracker/standings')
    expect(w.find('.pc-modes [aria-pressed="true"]').text()).toBe('Total')
    expect(w.findAll('table')).toHaveLength(3)
    await w.findAll('.pc-modes button').at(3).trigger('click')
    expect(w.findAll('table')).toHaveLength(2)
    expect(w.find('.pc-svg').exists()).toBe(true)
  })

  it('Standings: with no running event, points to the Archive', async () => {
    useDeathwatchData().teams = {}
    const { w } = await mountPage('eventtracker/standings')
    expect(w.find('.dw-empty').text()).toContain('No event is running')
  })

  it('Kill Teams: the team in ?t, with its players, weeks and missions', async () => {
    const { w } = await mountPage('eventtracker/kill-teams', { t: '2' })
    expect(h2(w)).toEqual(['Kill Team profile', 'Operatives', 'Points per week', 'Missions'])
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
    expect(h2(p)).toEqual(['Personnel Docket', 'Missions'])
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
    // The head names the archive, then the archived event open there: never the live tour.
    expect(w.get('.hh-line').text()).toBe('Event archive')
    const { w: e } = await mountPage('eventtracker/archive', { e: 'e1', v: 'honour-roll' })
    expect(h2(e)[0]).toBe('Deathwatch Tour — Ash Season')
    expect(e.get('.hh-line').text()).toBe(useDeathwatchData().archive.e1.name)
    expect(e.get('.hh-line').text()).not.toBe(useDeathwatchData().cfg.tx?.cur_n)
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
    const { w } = await mountPage('administratum/enter-mission')
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
    const { w } = await mountPage('administratum/enter-mission')
    const sel = w.findAll('select')
    await sel.at(4).setValue('1') // Gene-Seed
    // A Relic count over the cap is disabled in the picker.
    expect(sel.at(6).findAll('option').at(3).attributes('disabled')).toBeDefined()
  })

  it('Manage: one section at a time, picked in the side menu; it opens on the Kill Teams', async () => {
    const { w } = await mountPage('administratum/manage')
    expect(h2(w)).toEqual(['Kill Teams'])
    const shown = []
    for (const l of ['Tour', 'Scoring', 'Data & Archive']) {
      await section(w, l)
      shown.push(h2(w)[0])
    }
    expect(shown).toEqual(['Tour', 'Scoring', 'Data & Archive'])
    expect(w.find('.mg-item[aria-current="true"]').text()).toBe('Data & Archive')
  })

  it('Manage: a Kill Team row opens its editor, which saves the team and can be cancelled', async () => {
    const data = useDeathwatchData()
    const { w } = await mountPage('administratum/manage')
    expect(w.find('.mg-editor').exists()).toBe(false)
    expect(w.findAll('.mg-list tbody tr')).toHaveLength(Object.keys(data.teams).length)
    await w.find('.mg-row').trigger('click')
    const name = w.find('.mg-editor input')
    await name.setValue('Ember Wardens Reborn')
    await w.findAll('.mg-editor button').find((b) => b.text() === 'Cancel').trigger('click')
    expect(w.find('.mg-editor input').element.value).toBe(data.teams[1].n) // back to what is saved
    await w.find('.mg-editor input').setValue('Ember Wardens Reborn')
    await w.findAll('.mg-editor button').find((b) => b.text() === 'Save changes').trigger('click')
    await flushPromises()
    expect(data.teams[1].n).toBe('Ember Wardens Reborn')
    await w.find('.mg-x').trigger('click')
    expect(w.find('.mg-editor').exists()).toBe(false)
  })

  it('Manage: saves the tour name and the weights, and adds a Kill Team', async () => {
    const data = useDeathwatchData()
    const { w } = await mountPage('administratum/manage')
    await section(w, 'Tour')
    const pageText = data.cfg.tx.ts_h
    await w.find('input[placeholder="Deathwatch Tour"]').setValue('  Tour of the Ashen Gate ')
    await w.findAll('button').find((b) => b.text() === 'Save tour name').trigger('click')
    await flushPromises()
    expect(data.cfg.tx.cur_n).toBe('Tour of the Ashen Gate')
    expect(data.cfg.tx.ts_h).toBe(pageText) // the other page texts are kept
    await section(w, 'Scoring')
    await w.find('input[type="number"]').setValue('450')
    await w.findAll('button').find((b) => b.text() === 'Save scoring').trigger('click')
    await flushPromises()
    expect(data.cfg.s.base).toBe(450)

    const before = Object.keys(data.teams).length
    await section(w, 'Kill Teams')
    await w.findAll('button').find((b) => b.text() === '+ Add Kill Team').trigger('click')
    await flushPromises()
    expect(Object.keys(data.teams)).toHaveLength(before + 1)
    expect(w.find('.mg-editor input').element.value).toMatch(/^New Kill Team/) // straight into its editor

  })

  it('Manage: archive & reset keeps a copy, then clears the live event', async () => {
    const data = useDeathwatchData()
    const { w } = await mountPage('administratum/manage')
    await section(w, 'Data & Archive')
    await w.findAll('button').find((b) => b.text() === 'Archive & reset').trigger('click')
    const confirm = w.findAll('button').filter((b) => b.text() === 'Archive & reset').at(1)
    expect(confirm.attributes('disabled')).toBeDefined()
    await w.findAll('input').find((i) => i.element.parentElement.textContent.includes('Type RESET')).setValue('reset')
    await confirm.trigger('click')
    await flushPromises()
    expect(Object.keys(data.archive)).toHaveLength(2)
    expect(data.teams).toEqual({})
    expect(data.cfg.tx.cur_n).toBeUndefined() // the next tour starts unnamed
    // It says it is done, though the archive's own card has gone with the Kill Teams; the copy keeps the tour's name.
    expect(w.text()).toContain('Archived as “Deathwatch Tour — Ember Moon” and live event cleared ✓')
    expect(w.text()).not.toContain('Reset Kill Teams') // nothing left to reset
    expect(Object.values(data.archive).map((a) => a.name)).toContain('Deathwatch Tour — Ember Moon')
    await section(w, 'Tour')
    expect(w.text()).toContain('No event is running')

    // The next tour: opened by name, and its archive is named after it, not after the last one.
    expect(tourButton(w).text()).toBe('Open new tour')
    await w.find('input[placeholder="Deathwatch Tour"]').setValue('Tour of the Second Dawn')
    await tourButton(w).trigger('click')
    await flushPromises()
    await section(w, 'Kill Teams')
    await w.findAll('button').find((b) => b.text() === '+ Add Kill Team').trigger('click')
    await flushPromises()
    await section(w, 'Tour')
    expect(tourButton(w).text()).toBe('Save tour name')
    await section(w, 'Data & Archive')
    expect(field(w, 'Event name').element.value).toBe('Tour of the Second Dawn')
  })

  it('Manage: the tour name is refused empty, and a snapshot is named after the renamed tour and keeps it', async () => {
    const data = useDeathwatchData()
    const { w } = await mountPage('administratum/manage', { s: 'tour' })
    expect(tourButton(w).text()).toBe('Save tour name')
    for (const empty of ['', '   ']) {
      await w.find('input[placeholder="Deathwatch Tour"]').setValue(empty)
      await tourButton(w).trigger('click')
      await flushPromises()
      expect(w.text()).toContain('Enter a tour name.')
      expect(data.cfg.tx.cur_n).toBe('Deathwatch Tour — Ember Moon')
    }
    await w.find('input[placeholder="Deathwatch Tour"]').setValue('Tour of the Ashen Gate')
    await tourButton(w).trigger('click')
    await flushPromises()
    await section(w, 'Data & Archive')
    await w.findAll('button').find((b) => b.text() === 'Save snapshot').trigger('click')
    await flushPromises()
    const names = Object.values(data.archive).map((a) => a.name)
    expect(names).toEqual(expect.arrayContaining(['Deathwatch Tour — Ash Season', 'Tour of the Ashen Gate']))
    expect(names).toHaveLength(2)
    expect(data.cfg.tx.cur_n).toBe('Tour of the Ashen Gate') // a snapshot alone leaves the tour as it is
  })

  it('Manage: an archive name typed by hand stays when the tour is renamed', async () => {
    const data = useDeathwatchData()
    const { w } = await mountPage('administratum/manage', { s: 'data' })
    await field(w, 'Event name').setValue('Season of Embers, final')
    await section(w, 'Tour')
    await w.find('input[placeholder="Deathwatch Tour"]').setValue('Tour of the Ashen Gate')
    await tourButton(w).trigger('click')
    await flushPromises()
    await section(w, 'Data & Archive')
    expect(field(w, 'Event name').element.value).toBe('Season of Embers, final')
    await w.findAll('button').find((b) => b.text() === 'Save snapshot').trigger('click')
    await flushPromises()
    expect(Object.values(data.archive).map((a) => a.name)).toContain('Season of Embers, final')
  })

  describe('Manage: archive & reset failing part-way says what is done and how to finish', () => {
    afterEach(() => vi.restoreAllMocks())
    // The store's own write, except for the one document that fails.
    const failOn = (data, fails) => {
      const write = data.write
      vi.spyOn(data, 'write').mockImplementation((token, col, id, doc) => (fails(col, id, doc) ? Promise.reject(new Error('Vox fault')) : write(token, col, id, doc)))
    }
    const archiveAndReset = async (w) => {
      await w.findAll('button').find((b) => b.text() === 'Archive & reset').trigger('click')
      await field(w, 'Type RESET').setValue('RESET')
      await w.findAll('button').filter((b) => b.text() === 'Archive & reset').at(1).trigger('click')
      await flushPromises()
    }

    it('a snapshot: only that it was not saved', async () => {
      const data = useDeathwatchData()
      failOn(data, (col) => col === 'archive')
      const { w } = await mountPage('administratum/manage', { s: 'data' })
      await w.findAll('button').find((b) => b.text() === 'Save snapshot').trigger('click')
      await flushPromises()
      expect(w.findAll('p.dw-msg').map((p) => p.text())).toContain('Not completed: Vox fault')
    })

    it('an unnamed tour: there is no name to clear, so nothing more can fail', async () => {
      const data = useDeathwatchData()
      const { cur_n, ...tx } = data.cfg.tx
      expect(cur_n).toBeTruthy()
      data.cfg = { ...data.cfg, tx }
      failOn(data, (col, id) => col === 'cfg' && id === 'tx')
      const { w } = await mountPage('administratum/manage', { s: 'data' })
      await archiveAndReset(w)
      expect(data.teams).toEqual({})
      expect(w.text()).toContain('Archived as “Deathwatch Tour” and live event cleared ✓')
    })

    it('the copy: nothing is cleared', async () => {
      const data = useDeathwatchData()
      failOn(data, (col) => col === 'archive')
      const { w } = await mountPage('administratum/manage', { s: 'data' })
      const teams = Object.keys(data.teams).length
      await archiveAndReset(w)
      expect(Object.keys(data.teams)).toHaveLength(teams)
      expect(data.cfg.tx.cur_n).toBe('Deathwatch Tour — Ember Moon')
      expect(w.text()).toContain('Not completed: Vox fault The live event is only cleared after the archive copy is saved.')
    })

    it('a Kill Team: the copy is saved, the rest is cleared under "Reset Kill Teams"', async () => {
      const data = useDeathwatchData()
      const last = Math.max(...Object.values(data.teams).map((t) => t.id))
      failOn(data, (col, id) => col === 'teams' && id === last)
      const { w } = await mountPage('administratum/manage', { s: 'data' })
      await archiveAndReset(w)
      expect(Object.keys(data.archive)).toHaveLength(2)
      expect(Object.keys(data.teams)).toEqual([String(last)])
      expect(data.cfg.tx.cur_n).toBe('Deathwatch Tour — Ember Moon')
      expect(w.text()).toContain('Not completed: Vox fault The archive copy is saved, but some Kill Teams are still live: clear them under “Reset Kill Teams”.')
      expect(w.text()).not.toContain('only cleared after the archive copy is saved')
    })

    it('the tour name: archived and cleared, the new tour is named under "Tour"', async () => {
      const data = useDeathwatchData()
      failOn(data, (col, id) => col === 'cfg' && id === 'tx')
      const { w } = await mountPage('administratum/manage', { s: 'data' })
      await archiveAndReset(w)
      expect(Object.keys(data.archive)).toHaveLength(2)
      expect(data.teams).toEqual({})
      expect(w.text()).toContain(
        'Not completed: Vox fault The event is archived and its Kill Teams are cleared; only the old tour name is left. Name the new tour under “Tour”.',
      )
      expect(w.text()).not.toContain('only cleared after the archive copy is saved')
    })
  })

  it('Checks: every check with its count', async () => {
    const { w } = await mountPage('administratum/checks')
    expect(w.findAll('tbody tr')).toHaveLength(9)
  })

  it('Checks: a finding links to where it is fixed, and that page opens on it', async () => {
    const data = useDeathwatchData()
    const t = data.teams[1]
    data.teams = { ...data.teams, 1: { ...t, ro: t.ro.slice(0, 2) } } // an empty roster slot
    const { w } = await mountPage('administratum/checks', { scene: 'commander' })
    const link = w.findAll('a.dw-link').find((x) => x.text().startsWith(`${t.n} (2/3)`))
    expect(link.attributes('href')).toBe('/deathwatch/administratum/manage?scene=commander&t=1')

    const manage = (await mountPage('administratum/manage', { t: '1' })).w
    expect(manage.find('.mg-editor input').element.value).toBe(t.n)
  })
})

describe('the desk and admins', () => {
  const as = (roles) => useDeathwatch().$patch({ status: 'allowed', commander: false, roles })
  // Every control on the desk that could change something, in the section open. Opening a team to look at it, closing
  // the editor and exporting a backup change nothing.
  const changers = (w) =>
    w.findAll('.mg-main input, .mg-main select, .mg-main textarea, .mg-main button').filter((e) => !['mg-row', 'mg-x', 'mg-link'].some((c) => e.classes().includes(c)))
  const SECTION_LABELS = ['Tour', 'Kill Teams', 'Scoring', 'Data & Archive']
  // Whether a control is off as a browser has it: its own attribute, or a disabled fieldset around it.
  const off = (e) => e.element.matches(':disabled')

  it('shows an admin the whole desk, with every control that changes something disabled', async () => {
    as(['deployment', 'admin'])
    const { w } = await mountPage('administratum/manage')
    expect(w.text()).toContain('Read only: the Watch Commander and the desk make changes here.')
    await w.find('.mg-row').trigger('click') // a team opens, to be looked at
    expect(w.find('.mg-editor').exists()).toBe(true)
    expect(w.find('.mg-danger-item').exists()).toBe(false)
    for (const label of SECTION_LABELS) {
      await section(w, label)
      if (label === 'Kill Teams') await w.find('.mg-row').trigger('click')
      expect(changers(w).length, label).toBeGreaterThan(0)
      expect(changers(w).filter((e) => !off(e)).map((e) => e.html().slice(0, 60)), label).toEqual([])
    }
    expect(off(w.find('.mg-link'))).toBe(false) // Export backup
  })

  it('lets the desk change everything the Watch Commander can, without the read-only note', async () => {
    as(['deployment', 'desk'])
    const { w } = await mountPage('administratum/manage')
    expect(w.text()).not.toContain('Read only')
    await w.find('.mg-row').trigger('click')
    expect(w.find('.mg-danger-item').exists()).toBe(true)
    for (const label of SECTION_LABELS) {
      await section(w, label)
      if (label === 'Kill Teams') await w.find('.mg-row').trigger('click')
      expect(changers(w).filter((e) => off(e) && !e.classes().includes('danger')).map((e) => e.html().slice(0, 60)), label).toEqual([])
    }
  })

  it('offers "Delete from archive" to the desk, and not to an admin', async () => {
    const archived = Object.keys(useDeathwatchData().archive)[0]
    as(['deployment', 'desk'])
    const desk = (await mountPage('eventtracker/archive', { e: archived })).w
    expect(desk.findAll('button').map((b) => b.text())).toContain('Delete from archive')
    as(['deployment', 'admin'])
    const admin = (await mountPage('eventtracker/archive', { e: archived })).w
    expect(admin.findAll('button').map((b) => b.text())).not.toContain('Delete from archive')
  })
})
