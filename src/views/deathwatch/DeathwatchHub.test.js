// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useDeathwatch } from '../../stores/deathwatch'
import { useDeathwatchData } from '../../stores/deathwatchData'
import DeathwatchHub from './DeathwatchHub.vue'
import source from './DeathwatchHub.vue?raw'

// `g`: the gates as set in Manage → Access (the cfg document), none by default.
function mountHub({ commander = false, roles = ['legion', 'deployment', 'command'], g } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useDeathwatch().$patch({ status: 'allowed', commander, roles })
  useDeathwatchData().$patch({ status: 'ready', local: true, cfg: g ? { g } : {} })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
  return mount(DeathwatchHub, { global: { plugins: [pinia, router] } })
}
// The three areas' cards, then the card back to the Salamanders. The Manage entry is a separate button.
const cards = (w) => w.findAll('a.dw-card').map((a) => ({ title: a.find('.dw-card-title').text(), href: a.attributes('href') }))

beforeEach(() => setActivePinia(createPinia()))

describe('DeathwatchHub', () => {
  it('introduces the fortress under its crest', () => {
    const w = mountHub()
    expect(w.find('h1').text()).toBe('Watch Fortress Ebonhold')
    expect(w.text()).toContain('XVIIIth Legiones Astartes, The Salamanders')
    expect(w.text()).toContain('Suffer not the alien to live.')
    expect(w.text()).toContain('Choose your destination')
    const crest = w.find('img.dw-hub-crest')
    expect(crest.attributes('src')).toContain('crest-large')
    expect(crest.attributes('alt')).toBe('Deathwatch crest of Watch Fortress Ebonhold')
    expect(crest.attributes('width')).toBeTruthy()
    expect(crest.attributes('height')).toBeTruthy()
  })

  it('offers the four areas, each straight to its first tab', () => {
    expect(cards(mountHub({ commander: true }))).toEqual([
      { title: 'Event Tracker', href: '/deathwatch/eventtracker/standings' },
      { title: 'Armouring Hall', href: '/deathwatch/armouringhall/standard/watchbrother' },
      { title: 'Chronicles of Valor', href: '/deathwatch/chronicles/hall-of-champions' },
      { title: 'Hall of Relics', href: '/deathwatch/hallofrelics/notable-members' },
    ])
  })

  it('describes each area in one line', () => {
    const text = mountHub().text()
    expect(text).toContain('Track events, standings, and your kill team’s progress.')
    expect(text).toContain('Explore armour sets, chapter colours, and heraldry.')
    expect(text).toContain('Discover the deeds, victories, and honours of the Watch.')
    expect(text).toContain('Honour the warriors who shaped the history of Ebonhold.')
  })

  it('paints each area card with its own picture, dimensioned and lazy, with no alt text (the card names it)', () => {
    const arts = mountHub({ commander: true }).findAll('a.dw-card img.dw-card-art')
    expect(arts.map((i) => i.attributes('src').match(/card-[a-z]+/)[0])).toEqual(['card-tracker', 'card-armouring', 'card-chronicles', 'card-relics'])
    for (const img of arts) {
      expect(img.attributes('alt')).toBe('')
      expect(img.attributes('loading')).toBe('lazy')
      expect(img.attributes('width')).toBeTruthy()
      expect(img.attributes('height')).toBeTruthy()
    }
  })

  it('calls to enlist under the area cards, with a button to Recruitment', () => {
    const w = mountHub({ commander: true })
    const call = w.get('.dw-call')
    expect(call.get('.dw-call-t').text()).toBe('The Watch needs you')
    const btn = call.get('a.dw-call-btn')
    expect(btn.text()).toBe('Enlist now')
    expect(btn.attributes('href')).toBe('/deathwatch/recruitment/terms-of-service')
    expect(call.get('img').attributes('alt')).toBe('')
    expect(w.find('ul.dw-hub-cards').find('.dw-call').exists()).toBe(false)
  })

  it('leaves the fan-site disclaimer to the site footer', () => {
    expect(mountHub().find('.dw-legal').exists()).toBe(false)
  })

  it('shows the Administratum button to the Watch Commander, the desk and admins, and to nobody else', () => {
    for (const roles of [['legion', 'deployment', 'command'], ['legion']]) expect(mountHub({ roles }).find('a.dw-manage').exists()).toBe(false)
    const manage = mountHub({ commander: true }).find('a.dw-manage')
    expect(manage.text()).toBe('Administratum')
    expect(manage.attributes('href')).toBe('/deathwatch/administratum/enter-mission')
    expect(manage.find('svg').attributes('aria-hidden')).toBe('true')
    expect(mountHub({ roles: ['deployment', 'desk'] }).find('a.dw-manage').attributes('href')).toBe('/deathwatch/administratum/enter-mission')
    // An admin cannot enter a mission: the button opens the desk, to look at.
    expect(mountHub({ roles: ['deployment', 'admin'] }).find('a.dw-manage').attributes('href')).toBe('/deathwatch/administratum/manage')
    expect(cards(mountHub({ commander: true })).map((c) => c.title)).not.toContain('Administratum')
  })
})

// jsdom lays nothing out, so these are held by the rules; the widths were measured in a browser at 320 to 500px.
describe('DeathwatchHub styles', () => {
  const style = source.slice(source.indexOf('<style'))
  const rule = (selector, at = 0) => {
    const from = style.indexOf(`${selector} {`, at)
    return from < 0 ? '' : style.slice(from, style.indexOf('}', from))
  }

  // The cards' corners are clipped, which also clips an outline drawn outside them.
  it("shows a card's keyboard focus ring inside its clipped corners", () => {
    const ring = rule('.dw-card:focus-visible')
    expect(ring).toMatch(/outline:\s*2px solid/)
    // Its outer edge, the offset less the width in, must clear the 10px chamfer: a corner at (d, d) is cut while 2d < 10.
    const inset = -Number(ring.match(/outline-offset:\s*(-?\d+)px/)?.[1]) - Number(ring.match(/outline:\s*(\d+)px/)?.[1])
    expect(2 * inset).toBeGreaterThanOrEqual(10)
    expect(rule('.dw-card')).toContain('clip-path')
  })

  it('gives the picture less of the card on a narrow phone, so the longest name fits beside the arrow', () => {
    const narrow = style.indexOf('@media (max-width: 420px)')
    expect(narrow).toBeGreaterThan(0)
    const wide = Number(rule('.dw-card').match(/grid-template-columns:\s*(\d+)%/)?.[1])
    const small = Number(rule('.dw-card', narrow).match(/grid-template-columns:\s*(\d+)%/)?.[1])
    expect(small).toBeLessThan(wide)
    expect(small).toBeLessThanOrEqual(38)
  })

  it('makes the Enlist button a full 44px tap target', () => {
    expect(rule('.dw-call-btn')).toMatch(/min-height:\s*44px/)
  })
})

describe('DeathwatchHub, locked cards', () => {
  const locked = (w) => w.findAll('.dw-card.is-locked').map((c) => c.find('.dw-card-title').text())

  // Chronicles and the Hall of Relics are the Watch Commander's alone (areas.js).
  const HIS = ['Chronicles of Valor', 'Hall of Relics']
  const ALL4 = ['Event Tracker', 'Armouring Hall', ...HIS]

  it('locks, on the hub, the card of every area the viewer may not open, and links the rest', () => {
    // A standing that opens no card at all still gets the hub, every card locked: never a dead end without a word.
    const legion = mountHub({ roles: ['legion'] })
    expect(locked(legion)).toEqual(ALL4)
    expect(cards(legion)).toEqual([])
    const deployed = mountHub({ roles: ['legion', 'deployment'] })
    expect(locked(deployed)).toEqual(HIS)
    expect(cards(deployed)).toEqual([
      { title: 'Event Tracker', href: '/deathwatch/eventtracker/standings' },
      { title: 'Armouring Hall', href: '/deathwatch/armouringhall/standard/watchbrother' },
    ])
    expect(locked(mountHub({ roles: ['emissary', 'xenosbane'] }))).toEqual(ALL4)
    expect(locked(mountHub({ roles: ['command'] }))).toEqual(['Event Tracker', ...HIS])
    expect(locked(mountHub({ roles: ['deployment'] }))).toEqual(HIS)
    const everything = ['legion', 'emissary', 'deployment', 'command', 'xenosbane', 'vigilia', 'killmarine', 'desk', 'admin']
    expect(locked(mountHub({ roles: everything }))).toEqual(HIS)
    const commander = mountHub({ commander: true, roles: [] })
    expect(locked(commander)).toEqual([])
    expect(cards(commander)).toHaveLength(4)
  })

  it('pays no heed to gates saved under the old Access page', () => {
    const opening = { eventtracker: ['legion'], chronicles: ['legion'], hallofrelics: ['legion'], recruitment: ['legion'] }
    expect(locked(mountHub({ roles: ['legion'], g: opening }))).toEqual(ALL4)
    expect(mountHub({ roles: ['legion'], g: opening }).find('.dw-call').classes()).toContain('is-locked')
    const closing = { eventtracker: [], armouringhall: [] }
    expect(locked(mountHub({ roles: ['deployment'], g: closing }))).toEqual(HIS)
  })

  it('gives a locked card no link and the lock over it, and an open one neither lock nor blur', () => {
    const w = mountHub({ roles: ['legion', 'command'] })
    const card = w.find('.dw-card.is-locked')
    expect(card.element.tagName).toBe('DIV')
    expect(card.attributes('href')).toBeUndefined()
    expect(card.find('.dw-lock.is-overlay .dw-lock-msg').text()).toBe('Access restricted to Enlisted Brothers Only.') // the Event Tracker keeps its own words
    expect(card.find('.dw-lock-ghost').exists()).toBe(false)
    const open = w.find('a.dw-card')
    expect(open.classes()).not.toContain('is-locked')
    expect(open.find('.dw-lock').exists()).toBe(false)
  })

  it('blurs a locked card and hides its arrow', () => {
    expect(source).toMatch(/\.dw-card\.is-locked \.dw-card-art,\s*\.dw-card\.is-locked \.dw-card-text,[^{]*\{[^}]*filter: blur\(/)
    expect(source).toMatch(/\.dw-card\.is-locked \.dw-card-go \{\s*visibility: hidden;/)
  })
})

describe('DeathwatchHub, the call to enlist', () => {
  it('opens to the Watch Commander alone, as Recruitment does', () => {
    const w = mountHub({ commander: true, roles: [] })
    expect(w.find('.dw-call').classes()).not.toContain('is-locked')
    expect(w.find('a.dw-call-btn').attributes('href')).toBe('/deathwatch/recruitment/terms-of-service')
    expect(w.find('.dw-call .dw-lock').exists()).toBe(false)
  })

  it('is locked for anyone else, with no link, while the hub and its cards stay', () => {
    const everything = ['legion', 'emissary', 'deployment', 'command', 'xenosbane', 'vigilia', 'killmarine', 'desk', 'admin']
    for (const roles of [['legion'], ['emissary'], ['deployment'], ['command'], ['xenosbane'], everything]) {
      const w = mountHub({ roles })
      const call = w.find('.dw-call')
      expect(call.classes(), roles[0]).toContain('is-locked')
      expect(call.find('a').exists()).toBe(false)
      expect(call.find('.dw-call-btn').text()).toBe('Enlist now')
      expect(call.find('.dw-lock.is-overlay .dw-lock-msg').text()).toBe('Access restricted.')
      expect(w.findAll('.dw-card')).toHaveLength(4)
    }
  })

  it('blurs a locked call, all but its lock', () => {
    expect(source).toMatch(/\.dw-call\.is-locked > :not\(\.dw-lock\) \{[^}]*filter: blur\(/)
  })
})
