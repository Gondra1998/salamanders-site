// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount, RouterLinkStub } from '@vue/test-utils'
import NotFound from './NotFound.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ fullPath: '/no/such/page' }) }))

const show = () => mount(NotFound, { global: { stubs: { RouterLink: RouterLinkStub } } })

describe('NotFound', () => {
  it('is the shared page header, centred, with the explanation in its slot', () => {
    const head = show().find('header.page-head')
    expect(head.exists()).toBe(true)
    expect(head.classes()).toContain('nf-head')
    expect(head.find('.eyebrow').text()).toBe('Off the map')
    expect(head.find('h1.page-title').text()).toBe('No such muster')
    const body = head.find('.nf-body')
    expect(body.text()).toBe('Nothing is filed under /no/such/page. Pick a destination below.')
    expect(body.find('code.nf-path').text()).toBe('/no/such/page')
  })

  it('offers the way home and the Perk Builder at full button size', () => {
    const links = show().findAllComponents(RouterLinkStub)
    expect(links.map((l) => [l.props('to'), l.text()])).toEqual([
      ['/', 'Back to the forge'],
      ['/planner', 'Perk Builder'],
    ])
    expect(links[0].classes()).toEqual(expect.arrayContaining(['btn-ember', 'nf-cta']))
    expect(links[1].classes()).toEqual(expect.arrayContaining(['btn-drake', 'nf-cta']))
  })

  it('names tokens, not literals', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'NotFound.vue'), 'utf8')
    const style = source.slice(source.indexOf('<style'))
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(style).not.toMatch(/font-size:\s*[\d.]+(rem|em)/)
    expect(style).not.toMatch(/border-radius:\s*\d+px/)
    expect(style).toMatch(/\.nf-head\s*\{[^}]*text-align:\s*center/)
  })
})
