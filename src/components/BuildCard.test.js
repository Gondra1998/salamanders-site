// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import BuildCard from './BuildCard.vue'

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)', component: { render: () => null } }] })
const build = (author) => ({
  id: 1, title: 'Melta Bulwark', className: 'Bulwark', level: 25, prestige: 0, role: '', notes: '',
  weapons: {}, perks: [], author,
})
const byline = (author) => mount(BuildCard, { props: { build: build(author) }, global: { plugins: [router] } }).find('.b-author').text()

describe('BuildCard byline', () => {
  it("shows the author's Discord display name", () => {
    expect(byline({ id: '1', displayName: 'Vulkan' })).toBe('by Vulkan')
  })

  it('never shows a username, even if one arrives', () => {
    expect(byline({ id: '1', displayName: 'Vulkan', username: 'secret-handle' })).not.toContain('secret-handle')
    expect(byline({ id: '1', username: 'secret-handle' })).toBe('by Community Member')
  })

  it.each([undefined, null, ''])('falls back to Community Member for a missing name (%s)', (displayName) => {
    expect(byline({ id: '1', displayName })).toBe('by Community Member')
  })
})

describe('BuildCard weapon names', () => {
  it('shows the two-handed Thunder Hammer by its in-game name and still links by its key', () => {
    const b = { ...build({ id: '1', displayName: 'Vulkan' }), weapons: { melee: 'Thunder Hammer' } }
    const link = mount(BuildCard, { props: { build: b }, global: { plugins: [router] } }).find('.b-weapon')
    expect(link.text()).toBe('Two-Handed Thunder Hammer')
    expect(link.attributes('href')).toBe('/armoury?w=Thunder+Hammer')
  })
})

describe('BuildCard pre-15.0 chip', () => {
  const author = { id: '1', displayName: 'Vulkan' }
  const chip = (over) =>
    mount(BuildCard, { props: { build: { ...build(author), className: 'Tactical', ...over } }, global: { plugins: [router] } }).find('.b-stale')
  const at7 = (name) => [null, null, null, null, null, null, null, name]

  it('flags a Tactical build holding a perk the patch replaced', () => {
    const c = chip({ perks: at7('Signal Jammer') })
    expect(c.exists()).toBe(true)
    expect(c.text()).toBe('Needs review')
  })

  it('does not flag the same build with the new perk', () => {
    expect(chip({ perks: at7('Tactical Reserve') }).exists()).toBe(false)
  })

  it('flags a reworked perk on a build made before the patch', () => {
    expect(chip({ perks: at7('Marked for Death'), createdAt: '2026-09-20T00:00:00Z' }).exists()).toBe(true)
    expect(chip({ perks: at7('Marked for Death'), createdAt: '2026-10-05T00:00:00Z' }).exists()).toBe(false)
  })

  it('flags a replaced prestige pick', () => {
    expect(chip({ prestigePicks: ['Exigency Charge', null, null, null] }).exists()).toBe(true)
  })

  it('leaves a build with no perks, prestige picks or date alone', () => {
    expect(chip({}).exists()).toBe(false)
    expect(chip({ prestigePicks: null }).exists()).toBe(false)
  })

  it('does not flag another class holding the same names', () => {
    expect(chip({ className: 'Vanguard', perks: at7('Signal Jammer') }).exists()).toBe(false)
  })
})

// The card speaks the tokens: no raw hex, rgba, pixel radius or rem font size where a token exists.
describe('BuildCard styles use the tokens', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'BuildCard.vue'), 'utf8').match(/<style[^>]*>([\s\S]*)<\/style>/)[1]

  it('has no raw colour, pixel radius or rem font size', () => {
    const off = [...css.matchAll(/#[0-9a-f]{3,8}\b|rgba?\(|border-radius:[^;]*\dpx|font-size:[^;]*\d(\.\d+)?rem/gi)].map((m) => m[0])
    expect(off).toEqual([])
  })

  it('rounds to the medium corner and reads in pewter', () => {
    expect(css).toMatch(/\.b-card\s*\{[^}]*border-radius:\s*var\(--radius-md\)/)
    expect(css.match(/var\(--color-pewter\)/g)).toHaveLength(2)
  })
})
