// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { routeLocationKey } from 'vue-router'
import DeathwatchShell from './DeathwatchShell.vue'

// The stylesheet itself is tested in deathwatch.css.test.js (plain Node, where the file can be read).
describe('DeathwatchShell', () => {
  it('renders its content inside the scoped .dw wrapper', () => {
    const w = mount(DeathwatchShell, { slots: { default: '<p class="inside">hello</p>' } })
    expect(w.classes()).toContain('dw')
    expect(w.find('.dw .inside').text()).toBe('hello')
  })

  it('names the area it is showing, so the stylesheet can paint that area\'s backdrop', () => {
    const at = (params) =>
      mount(DeathwatchShell, { global: { provide: { [routeLocationKey]: reactive({ params }) } } }).attributes('data-area')
    expect(at({ area: 'chronicles', tab: 'in-memoriam' })).toBe('chronicles')
    expect(at({ area: 'eventtracker' })).toBe('eventtracker')
    expect(at({ area: 'armouringhall', tab: 'standard', sub: 'helm' })).toBe('armouringhall')
    expect(at({ area: 'administratum' })).toBe('administratum')
  })

  it('is the hub for the front hall, an unknown area, a hostile one, or no router at all', () => {
    const at = (params) =>
      mount(DeathwatchShell, { global: { provide: { [routeLocationKey]: reactive({ params }) } } }).attributes('data-area')
    for (const params of [{}, { area: 'nope' }, { area: '__proto__' }, { area: 'constructor' }, { area: ['eventtracker'] }]) {
      expect(at(params), JSON.stringify(params)).toBe('hub')
    }
    expect(mount(DeathwatchShell).attributes('data-area')).toBe('hub')
  })

  it('has a decorative backdrop that assistive technology skips', () => {
    const w = mount(DeathwatchShell)
    const backdrop = w.find('.dw-backdrop')
    expect(backdrop.exists()).toBe(true)
    expect(backdrop.attributes('aria-hidden')).toBe('true')
    expect(backdrop.text()).toBe('')
  })
})
