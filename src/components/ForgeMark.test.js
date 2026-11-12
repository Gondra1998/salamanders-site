// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import ForgeMark from './ForgeMark.vue'

const source = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.js$/, '.vue'), 'utf8')
const style = source.slice(source.indexOf('<style'))
// The declarations of the first rule whose selector is exactly `selector`.
const rule = (selector) => {
  const at = style.indexOf(`\n${selector} {`)
  expect(at, `${selector} rule`).toBeGreaterThan(-1)
  return style.slice(at, style.indexOf('}', at))
}

describe('ForgeMark', () => {
  it('renders one decorative, unfocusable root', () => {
    const w = mount(ForgeMark)
    const root = w.element
    expect(root.classList.contains('forge-mark')).toBe(true)
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.getAttribute('focusable')).toBe('false')
    expect(w.findAll('.forge-mark')).toHaveLength(1)
  })

  it('is full strength and medium by default', () => {
    const root = mount(ForgeMark).get('.forge-mark')
    expect(root.classes()).not.toContain('is-muted')
    expect(root.classes()).not.toContain('is-sm')
  })

  it('muted adds is-muted', () => {
    expect(mount(ForgeMark, { props: { muted: true } }).get('.forge-mark').classes()).toContain('is-muted')
  })

  it('size="sm" adds is-sm', () => {
    expect(mount(ForgeMark, { props: { size: 'sm' } }).get('.forge-mark').classes()).toContain('is-sm')
  })

  it('keeps a parent class on the root', () => {
    const Parent = { render: () => h(ForgeMark, { class: 'hero-mark', muted: true }) }
    const classes = mount(Parent).get('.forge-mark').classes()
    expect(classes).toEqual(expect.arrayContaining(['forge-mark', 'hero-mark', 'is-muted']))
  })

  describe('the glow', () => {
    it('is one centred element, 36% wide, 1px of bar and 1px of spread each side', () => {
      const glows = mount(ForgeMark).findAll('.mark-glow')
      expect(glows).toHaveLength(1)
      const g = glows[0].attributes()
      expect(g.width).toBe('36%')
      expect(g.x).toBe('32%')
      expect(Number(g.height)).toBe(3)
      expect(Number(g.y)).toBe(-1)
    })

    it('is blurred by a filter the element names, and is ember at 55%', () => {
      const w = mount(ForgeMark)
      const filter = w.get('filter')
      expect(w.get('.mark-glow').attributes('filter')).toBe(`url(#${filter.attributes('id')})`)
      expect(filter.get('feGaussianBlur').attributes('stdDeviation')).toBe('5')
      expect(rule('.mark-glow')).toMatch(/fill:\s*color-mix\(in srgb, var\(--color-ember\) 55%, transparent\)/)
    })

    it('gives every mark its own filter id, so several on one page cannot collide', () => {
      const Page = { render: () => h('div', [h(ForgeMark), h(ForgeMark), h(ForgeMark, { size: 'sm' })]) }
      const ids = mount(Page)
        .findAll('filter')
        .map((f) => f.attributes('id'))
      expect(ids).toHaveLength(3)
      expect(new Set(ids).size).toBe(3)
    })

    it('is gone when muted: no glow and no filter', () => {
      const w = mount(ForgeMark, { props: { muted: true } })
      expect(w.find('.mark-glow').exists()).toBe(false)
      expect(w.find('filter').exists()).toBe(false)
    })
  })

  describe('the bar', () => {
    it('is one pixel tall, 160px wide at md and 96px at sm, a block that does not shrink', () => {
      expect(rule('.forge-mark')).toMatch(/\bwidth:\s*160px/)
      expect(rule('.forge-mark')).toMatch(/\bheight:\s*1px/)
      expect(rule('.forge-mark')).toMatch(/display:\s*block/)
      expect(rule('.forge-mark')).toMatch(/flex:\s*none/)
      expect(rule('.forge-mark.is-sm')).toMatch(/\bwidth:\s*96px/)
    })

    it('runs transparent, ash-2, ember, the core, ember, ash-2, transparent, in that order', () => {
      const gradient = rule('.forge-mark').match(/linear-gradient\(([^;]*?)\);/s)?.[1]
      expect(gradient).toBeDefined()
      const stops = gradient
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '90deg')
      expect(stops.map((s) => s.replace(/\s+\d+%$/, ''))).toEqual([
        'transparent',
        'var(--color-ash-2)',
        'var(--color-ember)',
        'var(--mark-core)',
        'var(--color-ember)',
        'var(--color-ash-2)',
        'transparent',
      ])
    })

    it('has its hot zone (ember to the core to ember) in the middle 30% and the core at the centre', () => {
      const at = (name) =>
        [...rule('.forge-mark').matchAll(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)%`, 'g'))].map((m) => Number(m[1]))
      expect(at('var(--color-ember)')).toEqual([35, 65])
      expect(at('var(--mark-core)')).toEqual([50])
      expect(at('var(--color-ash-2)')).toEqual([20, 80])
    })

    it('is white-hot at its heart, and only in the un-muted rule', () => {
      expect(rule('.forge-mark')).toMatch(/--mark-core:\s*var\(--color-whitehot\)/)
      expect(style.match(/whitehot/g)).toHaveLength(1)
      expect(rule('.forge-mark.is-muted')).not.toContain('whitehot')
    })

    it('cools to ember at 60% in the middle when muted', () => {
      expect(rule('.forge-mark.is-muted')).toMatch(/--mark-core:\s*color-mix\(in srgb, var\(--color-ember\) 60%, transparent\)/)
    })
  })

  it('uses tokens only: no hex or rgb colours', () => {
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(style).not.toMatch(/rgba?\(/)
  })

  it('has no animation of any kind in its source', () => {
    expect(source).not.toContain('@keyframes')
    expect(source).not.toContain('animation:')
    expect(source).not.toContain('transition')
  })
})
