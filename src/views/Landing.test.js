// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLASS_NAMES } from '../stores/planner'
import weapons from '../data/weapons.json'
import companies from '../data/companies.json'

// The builds count comes from the shared client. A call that has not answered yet is the "null fact" state.
vi.mock('../lib/buildsApi', () => ({ listBuilds: vi.fn() }))
import * as buildsApi from '../lib/buildsApi'
import Landing from './Landing.vue'
import HeroForge from '../components/HeroForge.vue'
import ForgeMark from '../components/ForgeMark.vue'

const WEAPON_TOTAL = Object.values(weapons.fallbackWeapons).reduce((n, list) => n + list.length, 0)

// Today's strings, byte for byte (the copy list comes later).
const MUSTER = [
  {
    to: '/planner',
    name: 'Perk Builder',
    line: 'Plan every class — Tactical to Sniper — and forge a build perk by perk.',
    fact: `${CLASS_NAMES.length} classes`,
  },
  {
    to: '/armoury',
    name: 'Weapon Armoury',
    line: 'Every weapon by slot — primary, secondary, melee — and the classes that bear it.',
    fact: `${WEAPON_TOTAL} weapons`,
  },
  {
    to: '/builds',
    name: 'Recommended Builds',
    line: 'Save your class loadouts, then apply or share them in a click.',
    fact: null,
  },
  {
    to: '/companies',
    name: 'Companies & Roster',
    line: 'Our companies, their sections, and the brothers who hold the line.',
    fact: `${companies.length} companies and sections`,
  },
]

// The view's single root is a div, so one mount holds the hero stub, the heading and the list.
function render() {
  return mount(Landing, {
    global: {
      stubs: { HeroForge: true, ForgeMark: true, RouterLink: RouterLinkStub },
    },
  })
}
const rowsOf = (w) => w.findAll('.muster-row')

beforeEach(() => {
  // Never answers: the builds fact stays null until a test settles it.
  vi.mocked(buildsApi.listBuilds).mockReset().mockReturnValue(new Promise(() => {}))
})

describe('Landing muster', () => {
  it('has the hero, the section heading and four rows', () => {
    const w = render()
    expect(w.findComponent({ name: 'HeroForge' }).exists()).toBe(true)
    expect(w.get('section.muster h2').text()).toBe('Muster the Chapter')
    expect(rowsOf(w)).toHaveLength(4)
  })

  it('lists the rows in order, each a link to its tool', () => {
    const w = render()
    const links = w.findAllComponents(RouterLinkStub)
    expect(links.map((l) => l.props('to'))).toEqual(MUSTER.map((m) => m.to))
    expect(links.every((l) => l.classes('muster-row'))).toBe(true)
    // a list of links, one per item
    expect(w.findAll('ul.muster-list > li')).toHaveLength(4)
    expect(w.findAll('ul.muster-list > li > .muster-row')).toHaveLength(4)
  })

  it('keeps the list semantics Safari drops from a list with no bullets', () => {
    expect(render().get('ul.muster-list').attributes('role')).toBe('list')
  })

  it('sets the rows on a dense panel, not straight on the volcano', () => {
    expect(render().get('ul.muster-list').classes()).toContain('surface')
  })

  it.each(MUSTER.map((m, i) => [m.name, i, m]))('%s keeps its title and line', (_, i, m) => {
    const row = rowsOf(render())[i]
    expect(row.get('.muster-name').text()).toBe(m.name)
    expect(row.get('.muster-line').text()).toBe(m.line)
  })

  it('shows the three static facts at once and none for builds while it is null', () => {
    const rows = rowsOf(render())
    MUSTER.forEach((m, i) => {
      if (m.fact === null) expect(rows[i].find('.muster-fact').exists(), m.to).toBe(false)
      else expect(rows[i].get('.muster-fact').text(), m.to).toBe(m.fact)
    })
  })

  it('adds the builds fact once the list has loaded', async () => {
    vi.mocked(buildsApi.listBuilds).mockResolvedValue([{ id: 1 }, { id: 2 }])
    const w = render()
    expect(rowsOf(w)[2].find('.muster-fact').exists()).toBe(false)
    await flushPromises()
    expect(rowsOf(w)[2].get('.muster-fact').text()).toBe('2 posted')
  })

  it('shows nothing for builds when none are posted', async () => {
    vi.mocked(buildsApi.listBuilds).mockResolvedValue([])
    const w = render()
    await flushPromises()
    expect(rowsOf(w)[2].find('.muster-fact').exists()).toBe(false)
    expect(w.text()).not.toContain('0 posted')
    expect(rowsOf(w)).toHaveLength(4)
  })

  it('shows nothing for builds when the call fails', async () => {
    vi.mocked(buildsApi.listBuilds).mockRejectedValue(new TypeError('Failed to fetch'))
    const w = render()
    await flushPromises()
    expect(rowsOf(w)[2].find('.muster-fact').exists()).toBe(false)
    expect(rowsOf(w)).toHaveLength(4)
  })

  it('asks the builds API once for the whole list', () => {
    render()
    expect(buildsApi.listBuilds).toHaveBeenCalledTimes(1)
    expect(buildsApi.listBuilds).toHaveBeenCalledWith(undefined, undefined)
  })

  it('drops the Enter arrows, the kickers and the old card markup', () => {
    const w = render()
    expect(w.text()).not.toContain('Enter')
    expect(w.text()).not.toContain('→')
    expect(w.find('.ops-kite').exists()).toBe(false)
    expect(w.find('.ops-card').exists()).toBe(false)
    expect(w.find('.eyebrow').exists()).toBe(false)
    expect(w.text()).not.toContain('Operations Planner')
  })
})

describe('Landing muster style source', () => {
  const source = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.js$/, '.vue'), 'utf8')
  const style = source.slice(source.indexOf('<style'))
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(style)?.[1] ?? ''
  }

  it('gives a row the tap height', () => {
    expect(rule('.muster-row')).toContain('min-height: var(--tap)')
  })

  it('does not squeeze or lift a row: no scale, no transform', () => {
    expect(style).not.toContain('scale(0.97)')
    expect(style).not.toMatch(/(?<![\w-])transform\b/)
    expect(style).not.toContain('translate')
  })

  it('fades the name colour on hover, behind a real pointer', () => {
    expect(style).toContain('@media (hover: hover) and (pointer: fine)')
    expect(style).toMatch(/\.muster-row:hover \.muster-name\s*\{[^}]*color:\s*var\(--color-drake\)/)
    expect(rule('.muster-name')).toContain('transition: color var(--dur-state) var(--ease-forge)')
  })

  it('keeps the line on its own second row on phones and moves it beside the name on wide screens', () => {
    // phone: name and fact share the first row, the line spans both columns of the second
    expect(rule('.muster-line')).toMatch(/grid-column:\s*1 \/ -1;[^}]*grid-row:\s*2/)
    // wide: a fixed name column, a flexible line column, then the fact
    expect(style).toMatch(/@media \(min-width: 50rem\)\s*\{[^@]*grid-template-columns:\s*13rem minmax\(0, 1fr\) fit-content\(7rem\)/)
  })

  it('has no ops styles left', () => {
    expect(style).not.toMatch(/\.ops\b|\.ops-/)
  })

  it('sets the facts in mono pewter with tabular figures, right aligned', () => {
    const fact = rule('.muster-fact')
    expect(fact).toContain('font-family: var(--font-mono)')
    expect(fact).toContain('color: var(--color-pewter)')
    expect(fact).toContain('font-variant-numeric: tabular-nums')
    expect(fact).toContain('text-align: right')
  })
})

// HeroForge.test.js pins the buttons; the divider under the title is pinned here, with the page that carries it.
describe('Landing hero divider', () => {
  const heroSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'HeroForge.vue'),
    'utf8',
  )
  const heroStyle = heroSource.slice(heroSource.indexOf('<style'))

  function renderHero() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)', component: { render: () => null } }],
    })
    // FireText paints on a canvas jsdom doesn't have.
    return mount(HeroForge, { global: { plugins: [pinia, router], stubs: { FireText: true } } })
  }

  it('puts the ForgeMark under the title in place of the three diamonds', () => {
    const w = renderHero()
    const mark = w.findComponent(ForgeMark)
    expect(mark.exists()).toBe(true)
    expect(mark.classes()).toContain('hero-mark')
    expect(w.find('.ember-rule').exists()).toBe(false)
    // title, then mark, then tagline
    const order = w.get('.hero-inner').element.children
    expect([...order].map((el) => el.getAttribute('class').split(' ')[0])).toEqual([
      'eyebrow',
      'wordmark',
      'forge-mark',
      'tagline',
      'cta-row',
    ])
  })

  it('centres the mark on its own margins and drops the ember-rule styles and their hex', () => {
    expect(heroStyle).toMatch(/\.hero-mark\s*\{[^}]*display:\s*block;[^}]*margin:\s*1\.3rem auto 0\.2rem/)
    expect(heroStyle).not.toContain('ember-rule')
    expect(heroStyle).not.toMatch(/#ffb066/i)
  })

  it('leaves the authored wordmark and tagline sizes where they were, marked as authored', () => {
    expect(heroStyle).toContain('font-size: clamp(2.5rem, 12.5vw, 9.5rem)')
    expect(heroStyle).toContain('font-size: clamp(1rem, 2.4vw, 1.3rem)')
    expect(heroStyle.match(/authored, see DESIGN\.md Typography/gi)).toHaveLength(2)
  })
})
