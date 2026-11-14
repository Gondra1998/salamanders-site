// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { AREAS, resolveArea } from '../../lib/deathwatch/areas'
import DeathwatchNav from './DeathwatchNav.vue'

const router = () => createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
const mountNav = (props) => mount(DeathwatchNav, { props, global: { plugins: [router()] } })

describe('DeathwatchNav', () => {
  it.each(Object.keys(AREAS))('lists the %s tabs in order, as links', (area) => {
    const w = mountNav({ area, current: AREAS[area].tabs[0].slug, who: { commander: true, held: [] } })
    const tabLinks = w.findAll('a').slice(0, -1) // the last link goes back to the hub
    expect(tabLinks.map((a) => a.text())).toEqual(AREAS[area].tabs.map((t) => t.label))
    // Straight to the canonical address: one the guard would rewrite replaces the history entry, and Back skips a page.
    expect(tabLinks.map((a) => a.attributes('href'))).toEqual(AREAS[area].tabs.map((t) => resolveArea({ area, tab: t.slug }).canonical))
  })

  it('lists a Deathwatch Command tab only for Deathwatch Command, and Enter mission only for those who can change things', () => {
    const labels = (area, current, held) => mountNav({ area, current, who: { commander: false, held } }).findAll('a').map((a) => a.text())
    expect(labels('armouringhall', 'standard', ['deployment'])).toEqual(['Standard', 'Specialist', 'Restricted Wargear', 'Back to the Fortress'])
    expect(labels('armouringhall', 'standard', ['deployment', 'command'])).toEqual(['Standard', 'Specialist', 'Watch Command', 'Restricted Wargear', 'Back to the Fortress'])
    expect(labels('administratum', 'manage', ['admin'])).not.toContain('Enter mission')
    expect(labels('administratum', 'manage', ['desk'])).toContain('Enter mission')
  })

  it('lists nothing restricted with no viewer given', () => {
    const labels = mount(DeathwatchNav, { props: { area: 'armouringhall', current: 'standard' }, global: { plugins: [router()] } }).findAll('a').map((a) => a.text())
    expect(labels).not.toContain('Watch Command')
  })

  it('draws an icon on every link, from the original\'s set, hidden from assistive technology', () => {
    const w = mountNav({ area: 'eventtracker', current: 'standings' })
    const links = w.findAll('a')
    expect(links).toHaveLength(AREAS.eventtracker.tabs.length + 1)
    for (const a of links) {
      const svg = a.get('svg')
      expect(svg.attributes('aria-hidden')).toBe('true')
      expect(svg.attributes('viewBox')).toBe('0 0 24 24')
      expect(svg.findAll('path, circle, rect').length).toBeGreaterThan(0)
    }
    expect(links[0].get('path').attributes('d')).toBe('M3 21h18M6 21V11h4v10M10 21V5h4v16M14 21v-7h4v7')
  })

  it('draws the home icon on the way back', () => {
    const w = mountNav({ area: 'administratum', current: 'checks' })
    expect(w.findAll('a').at(-1).get('path').attributes('d')).toBe('M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5')
  })

  it('is a labelled navigation landmark for its area', () => {
    const w = mountNav({ area: 'eventtracker', current: 'standings' })
    expect(w.find('nav').attributes('aria-label')).toBe('Event Tracker sections')
    expect(mountNav({ area: 'chronicles', current: 'in-memoriam' }).find('nav').attributes('aria-label')).toBe('Chronicles of Valor sections')
  })

  it('marks the current tab, and only that one', () => {
    const w = mountNav({ area: 'eventtracker', current: 'players' })
    const current = w.findAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0].text()).toBe('Operatives')
  })

  it('ends with a way back to the fortress', () => {
    const w = mountNav({ area: 'eventtracker', current: 'standings' })
    const back = w.findAll('a').at(-1)
    expect(back.text()).toBe('Back to the Fortress')
    expect(back.attributes('href')).toBe('/deathwatch')
    expect(back.attributes('aria-current')).toBeUndefined()
  })

  it('says when a link was used, so a sheet around it can close', async () => {
    const w = mountNav({ area: 'eventtracker', current: 'standings' })
    await w.findAll('a')[2].trigger('click')
    await w.findAll('a').at(-1).trigger('click')
    expect(w.emitted('navigate')).toHaveLength(2)
  })
})
