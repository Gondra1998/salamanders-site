// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import companies from '../data/companies.json'
import { TEXT, contrast, over } from '../test-utils/contrast'
// The page also shows the roster (Companies.roster.test.js); these tests are about the story, so no roster is available.
vi.mock('../stores/auth', () => ({ useAuth: () => ({ token: null, member: null, signedIn: false, signIn: vi.fn() }) }))
vi.mock('../lib/rosterApi', () => ({ getRoster: vi.fn(), getInfirmary: vi.fn(), getPublicRoster: vi.fn(() => Promise.reject(new Error('no roster here'))) }))
import Companies from './Companies.vue'
// the story's styles, including the scrim rule, live with the article
import source from '../components/company/CompanyArticle.vue?raw'

beforeEach(() => setActivePinia(createPinia()))
const render = () => mount(Companies)

describe('Companies', () => {
  it('shows the REDACTED Deathwatch banner, once, straight under the header', () => {
    const w = render()
    const banners = w.findAll('a.dw-banner')
    expect(banners).toHaveLength(1)
    expect(banners[0].attributes('href')).toBe('/deathwatch')
    expect(w.find('header.page-head').element.nextElementSibling).toBe(banners[0].element)
  })

  it('uses the shared page header', () => {
    const w = render()
    const header = w.find('header.page-head')
    expect(header.classes()).toContain('c-head')
    expect(header.find('.eyebrow').text()).toBe('The Chapter')
    expect(header.find('h1').text()).toBe('Companies & Sections')
    expect(header.find('.page-lede').text()).toContain('forged from many hearths')
  })

  it('keeps the search box in the header, and it still filters', async () => {
    const w = render()
    const all = w.findAll('article.company').length
    expect(all).toBe(companies.length)
    expect(w.find('header .c-search').exists()).toBe(true)
    await w.find('.c-search').setValue('firedrakes')
    const left = w.findAll('article.company')
    expect(left.length).toBeGreaterThan(0)
    expect(left.length).toBeLessThan(all)
    expect(left[0].find('.company-title').text()).toContain('Firedrakes')
    await w.find('.c-search').setValue('zzzzzz')
    expect(w.findAll('article.company')).toHaveLength(0)
    expect(w.find('.c-empty').text()).toBe('No companies match “zzzzzz”.')
  })

  describe('jumping about the page', () => {
    // jsdom has no scrolling: record where each scroll went, and how, then put the prototype back as it was.
    const saved = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
    const mounted = []
    let scrolled
    beforeEach(() => {
      scrolled = []
      Element.prototype.scrollIntoView = function (options) { scrolled.push([this.id, options?.behavior]) }
    })
    afterEach(() => {
      mounted.splice(0).forEach((w) => w.unmount())
      if (saved) Object.defineProperty(Element.prototype, 'scrollIntoView', saved)
      else delete Element.prototype.scrollIntoView
      delete window.matchMedia
    })
    // the jump looks the article up in the document
    const attached = () => {
      const w = mount(Companies, { attachTo: document.body })
      mounted.push(w)
      return w
    }
    const MOTION = [
      ['prefers reduced motion', true, 'auto'],
      ['welcomes motion', false, 'smooth'],
    ]

    it.each(MOTION)('when the visitor %s, a chip jumps to its company the matching way', async (_, reduced, behavior) => {
      window.matchMedia = vi.fn(() => ({ matches: reduced }))
      await attached().findAll('.c-chip')[2].trigger('click')
      expect(scrolled).toEqual([[companies[2].id, behavior]])
    })

    it.each(MOTION)('when the visitor %s, "↑ Index" goes back to the chip row the matching way, and moves focus there', async (_, reduced, behavior) => {
      window.matchMedia = vi.fn(() => ({ matches: reduced }))
      const w = attached()
      expect(w.find('nav.c-index').attributes('id')).toBe('company-index')
      expect(w.find('nav.c-index').attributes('tabindex')).toBe('-1')
      await w.findAll('article.company')[3].find('button.c-top').trigger('click')
      expect(scrolled).toEqual([['company-index', behavior]])
      expect(document.activeElement).toBe(w.find('nav.c-index').element)
    })
  })

  it('puts each text block on the readable surface', () => {
    const blocks = render().findAll('.block')
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((b) => b.classes().includes('surface'))).toBe(true)
  })

  it('on wide screens, a left scrim keeps text readable wherever the text runs', () => {
    // The text column is at most 62ch (about 60% of the page); the scrim must hold 4.5:1 against
    // the brightest lava all the way across it, then fade out over the empty right half.
    const rule = source.match(/\.block\.surface\s*\{([^}]*)\}/)
    expect(rule, 'a .block.surface rule for wide screens').not.toBeNull()
    const stops = [...rule[1].matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)\s*(\d+)%/g)].map((m) => ({ rgb: [m[1], m[2], m[3]], alpha: Number(m[4]), at: Number(m[5]) }))
    expect(stops.length).toBeGreaterThanOrEqual(2)
    const covering = stops.filter((s) => s.at <= 62)
    expect(covering.length).toBeGreaterThanOrEqual(2)
    for (const s of covering) expect(contrast(over(s.rgb, s.alpha), TEXT), `${s.at}%`).toBeGreaterThanOrEqual(4.5)
    expect(Math.max(...stops.map((s) => s.at))).toBeGreaterThanOrEqual(62)
  })
})
