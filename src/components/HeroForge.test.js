// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import HeroForge from './HeroForge.vue'
import { useAuth } from '../stores/auth'

const INVITE = 'https://discord.gg/salamanders'
// Opens the guild directly; an invite link shows members Discord's join screen.
const SERVER = 'https://discord.com/channels/1322056087792521269'

function render(member) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useAuth().member = member
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)', component: { render: () => null } }],
  })
  // FireText paints on a canvas jsdom doesn't have.
  const w = mount(HeroForge, { global: { plugins: [pinia, router], stubs: { FireText: true } } })
  return { discord: w.get('a.btn-ember'), planner: w.get('a.btn-planner') }
}

beforeEach(() => sessionStorage.clear())

describe('HeroForge Discord button', () => {
  it.each([
    ['signed out', null],
    ['signed in, not in the XVIIIth Legion', { id: '1', username: 'guest', isMember: false }],
    ['signed in, membership unknown', { id: '1', username: 'guest' }],
    ['isMember is truthy but not true', { id: '1', username: 'guest', isMember: 'true' }],
    ['isMember is 1, which only loosely equals true', { id: '1', username: 'guest', isMember: 1 }],
  ])('invites to join when %s', (_, member) => {
    const { discord } = render(member)
    expect(discord.text()).toBe('Join the Chapter')
    expect(discord.attributes('href')).toBe(INVITE)
  })

  it('sends members straight into the server instead of the invite', () => {
    const { discord } = render({ id: '1', username: 'brother', isMember: true })
    expect(discord.text()).toBe('Open the Discord')
    expect(discord.text()).not.toMatch(/join/i)
    expect(discord.attributes('href')).not.toBe(INVITE)
    expect(discord.attributes('target')).toBe('_blank')
    expect(discord.attributes('rel')).toContain('noopener')
  })

  it('the member button links to the Discord server channel URL built from the guild id', () => {
    // The guild id is the Discord server's id, public in every invite link.
    const member = render({ id: '1', username: 'brother', isMember: true }).discord
    expect(member.attributes('href')).toBe(SERVER)

    // Anyone who is not a confirmed member gets the invite, never the server URL.
    for (const visitor of [null, { id: '1', username: 'guest', isMember: false }]) {
      expect(render(visitor).discord.attributes('href')).toBe(INVITE)
    }
  })
})

describe('HeroForge planner button', () => {
  it('still goes to the planner, for members and guests alike', () => {
    for (const member of [null, { id: '1', username: 'brother', isMember: true }]) {
      const { planner } = render(member)
      expect(planner.attributes('href')).toBe('/planner')
      expect(planner.text()).toBe('Open the Perk Builder')
    }
  })
})

describe('HeroForge on a phone', () => {
  // The mountain behind the page stands under the hero's buttons on a phone (MountDeathfire measures where the lower
  // one ends), so the text block must start under the nav and close up, or there is no room for the mountain.
  const source = readFileSync(join(process.cwd(), 'src/components/HeroForge.vue'), 'utf8').replace(/\r\n/g, '\n')
  const phone = source.slice(source.indexOf('@media (max-width: 768px)'))
  const rule = (selector) => {
    const at = phone.indexOf(`${selector} {`)
    return at < 0 ? '' : phone.slice(at, phone.indexOf('}', at))
  }

  it('starts the text under the nav instead of centring it in the screen', () => {
    expect(rule('.hero')).toContain('align-items: flex-start;')
    expect(rule('.hero')).toContain('padding: 1.5rem 1.25rem 3rem;')
  })

  it('closes the block up a little, and leaves the buttons their size', () => {
    expect(rule('.hero-mark')).toContain('margin-top: 0.9rem;')
    expect(rule('.tagline')).toContain('margin-top: 0.6rem;')
    expect(rule('.cta-row')).toContain('margin-top: 1.4rem;')
    expect(rule('.cta-row')).toContain('gap: 0.6rem;')
    expect(phone).not.toMatch(/\.btn-(ember|drake|planner)[^{]*\{[^}]*(padding|font-size)/)
  })
})
