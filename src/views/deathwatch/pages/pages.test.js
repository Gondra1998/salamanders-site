// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

// The views not yet ported are skeletons: the original's real headings and labels over shimmer where the content
// will be. This is the contract each one keeps until its port replaces it. A page lists exactly what it may say, so
// a real name can never slip in: whatever text is left after the allowed labels are removed must be nothing.
// A ported view leaves this list for PORTED; tracker-pages.test.js and armour-pages.test.js
// say what the real views contain.
const PORTED = [
  'eventtracker/standings',
  'eventtracker/kill-teams',
  'eventtracker/players',
  'eventtracker/honour-roll',
  'eventtracker/game-stats',
  'eventtracker/scoring',
  'eventtracker/archive',
  'administratum/enter-mission',
  'administratum/manage',
  'administratum/checks',
  'administratum/access',
  'armouringhall/standard',
  'armouringhall/specialist',
  'armouringhall/watch-command',
  'armouringhall/restricted-wargear',
  'hallofrelics/notable-members',
  'hallofrelics/fortress-lore',
  'recruitment/terms-of-service',
  'recruitment/requirements',
]
const ALL = import.meta.glob('./*/*.vue', { eager: true })
const MODULES = Object.fromEntries(Object.entries(ALL).filter(([k]) => !PORTED.includes(k.slice(2, -4))))

const NOTE = 'This view is being rebuilt.'

// h2/h3: every heading, in order; tables: every table's column labels; labels: every tile and field label.
const PAGES = {
  'chronicles/hall-of-champions': {
    h2: ['Hall of Champions', 'Past Champions', 'How to earn this honor?'],
    labels: ['Requirements', 'Award', 'Accolade Duration', 'Legacy'],
  },
  'chronicles/chamber-of-honor': {
    h2: ['Chamber of Honor', 'Battle-Brother Honours'],
    labels: ['MVP', 'Executioner', 'Terminator', 'Blade Master', 'Marksman', 'Scavenger', 'Guardian Angel', 'Gene-Seed Hunter'],
  },
  'chronicles/player-profiles': {
    h2: ['Player Profiles'],
    tables: [['#', 'Player', 'Tours', 'Missions', 'MVP', 'Kills', 'Special', 'Melee', 'Ranged', 'Items', 'Dmg taken', 'Incaps', 'Revives', 'Seed']],
  },
  'chronicles/in-memoriam': { h2: ['In Memoriam'] },
  'chronicles/operational-records': { h2: ['Operational Records', 'Current Kill-Team Standings'], tables: [['#', 'Kill Team', 'Points']] },
  'administratum/records': { h2: ['New operational record', 'Records created here'], h3: ['Kill Teams', 'Top Operatives'] },
  'administratum/page-texts': { h2: ['Page Texts'] },
}

const mountPage = (key) => mount(MODULES[`./${key}.vue`].default)

describe('the view skeletons', () => {
  it('are exactly the pages listed here, and every other view is a ported one', () => {
    expect(Object.keys(MODULES).map((k) => k.slice(2, -4)).sort()).toEqual(Object.keys(PAGES).sort())
    expect(Object.keys(ALL)).toHaveLength(PORTED.length + Object.keys(PAGES).length)
  })

  for (const [key, want] of Object.entries(PAGES)) {
    describe(key, () => {
      it('says it is being rebuilt, as a status', () => {
        const w = mountPage(key)
        expect(w.get('[role="status"]').text()).toBe(NOTE)
      })

      it('has the original headings, in order, as plaques', () => {
        const w = mountPage(key)
        expect(w.findAll('h2').map((h) => h.text())).toEqual(want.h2)
        expect(w.findAll('h3').map((h) => h.text())).toEqual(want.h3 ?? [])
      })

      it('has the original column labels and tile and field labels', () => {
        const w = mountPage(key)
        expect(w.findAll('table').map((t) => t.findAll('th').map((th) => th.text()))).toEqual(want.tables ?? [])
        expect(w.findAll('.sk-label').map((l) => l.text())).toEqual(want.labels ?? [])
      })

      it('has the podium, chart and figure placeholders it should, and no others', () => {
        const w = mountPage(key)
        expect(w.findAll('.sk-podium')).toHaveLength(want.podium ? 1 : 0)
        expect(w.findAll('.sk-chart')).toHaveLength(want.chart ? 1 : 0)
        expect(w.findAll('.sk-figure')).toHaveLength(want.figure ? 1 : 0)
      })

      it('says nothing but its labels (no names, no data)', () => {
        const allowed = [NOTE, ...want.h2, ...(want.h3 ?? []), ...(want.tables ?? []).flat(), ...(want.labels ?? [])]
        let rest = mountPage(key).text()
        for (const s of allowed.filter(Boolean).sort((a, b) => b.length - a.length)) rest = rest.replaceAll(s, '')
        expect(rest.trim()).toBe('')
      })

      it('offers nothing to press or type into', () => {
        expect(mountPage(key).findAll('input, select, textarea, button, a')).toHaveLength(0)
      })
    })
  }

  it('hides the heading of a page whose original had none, but keeps it for assistive technology', () => {
    for (const key of ['chronicles/hall-of-champions', 'chronicles/in-memoriam', 'chronicles/player-profiles']) {
      const first = mountPage(key).get('h2')
      expect(first.classes(), key).toContain('dw-sr-only')
      expect(first.classes(), key).not.toContain('dw-plaque')
    }
  })
})
