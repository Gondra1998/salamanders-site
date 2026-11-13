// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mount } from '@vue/test-utils'
import StatePanel from './StatePanel.vue'

const stubs = { ForgeMark: true }
const panel = (props, slots) => mount(StatePanel, { props, slots, global: { stubs } })

afterEach(() => vi.restoreAllMocks())

describe('StatePanel', () => {
  it('is a .surface panel marked with its kind', () => {
    const w = panel({ kind: 'empty' })
    expect(w.classes()).toEqual(expect.arrayContaining(['state-panel', 'surface', 'is-empty']))
  })

  it('error: role alert, an ember stud, no ForgeMark', () => {
    const w = panel({ kind: 'error', title: 'Could not load' })
    expect(w.attributes('role')).toBe('alert')
    expect(w.attributes('aria-busy')).toBeUndefined()
    expect(w.find('.state-stud').exists()).toBe(true)
    expect(w.find('.state-stud').classes()).toContain('stud')
    expect(w.find('forge-mark-stub').exists()).toBe(false)
    expect(w.find('.spinner').exists()).toBe(false)
  })

  it('loading: role status without aria-busy, a spinner, and no title when none is given', () => {
    const w = panel({ kind: 'loading' })
    expect(w.attributes('role')).toBe('status')
    expect(w.attributes('aria-busy')).toBeUndefined()
    expect(w.find('.spinner').exists()).toBe(true)
    expect(w.find('.state-title').exists()).toBe(false)
    expect(w.find('.state-body').exists()).toBe(false)
    expect(w.find('forge-mark-stub').exists()).toBe(false)
    expect(w.find('.state-stud').exists()).toBe(false)
  })

  it('empty: a ForgeMark and no role', () => {
    const w = panel({ kind: 'empty' })
    expect(w.find('forge-mark-stub').exists()).toBe(true)
    expect(w.attributes('role')).toBeUndefined()
    expect(w.attributes('aria-busy')).toBeUndefined()
    expect(w.find('.spinner').exists()).toBe(false)
    expect(w.find('.state-stud').exists()).toBe(false)
  })

  it('prompt: a ForgeMark and no role', () => {
    const w = panel({ kind: 'prompt' })
    expect(w.find('forge-mark-stub').exists()).toBe(true)
    expect(w.attributes('role')).toBeUndefined()
  })

  it('passes muted to the ForgeMark', () => {
    const w = mount(StatePanel, { props: { kind: 'empty' } })
    expect(w.get('svg.forge-mark').classes()).toContain('is-muted')
  })

  it('gate: no mark at all and no role', () => {
    const w = panel({ kind: 'gate', title: 'Members only' })
    expect(w.find('.spinner').exists()).toBe(false)
    expect(w.find('.state-stud').exists()).toBe(false)
    expect(w.find('forge-mark-stub').exists()).toBe(false)
    expect(w.attributes('role')).toBeUndefined()
  })

  it('renders title and body only when given', () => {
    const w = panel({ kind: 'empty', title: 'Nothing here', body: 'Try another class.' })
    expect(w.get('h2.state-title').text()).toBe('Nothing here')
    expect(w.get('p.state-body').text()).toBe('Try another class.')
    const bare = panel({ kind: 'empty' })
    expect(bare.find('.state-title').exists()).toBe(false)
    expect(bare.find('.state-body').exists()).toBe(false)
  })

  it('renders the default slot in .state-actions, and nothing without it', () => {
    const w = panel({ kind: 'error', title: 'Failed' }, { default: '<button class="retry">Retry</button>' })
    expect(w.get('.state-actions .retry').text()).toBe('Retry')
    expect(panel({ kind: 'error', title: 'Failed' }).find('.state-actions').exists()).toBe(false)
  })

  it('orders mark, title, body, actions', () => {
    const w = panel({ kind: 'error', title: 'T', body: 'B' }, { default: '<i />' })
    expect([...w.element.children].map((el) => el.className.split(' ')[0])).toEqual([
      'stud',
      'state-title',
      'state-body',
      'state-actions',
    ])
  })

  it('warns on a kind outside the five', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    panel({ kind: 'bogus' })
    expect(warn.mock.calls.flat().join(' ')).toMatch(/Invalid prop: custom validator check failed for prop "kind"/)
  })

  it('gives a role only to error and loading, never from the prototype chain', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const kind of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(panel({ kind }).attributes('role'), kind).toBeUndefined()
    }
  })

  it('does not warn on any of the five kinds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const kind of ['empty', 'error', 'gate', 'loading', 'prompt']) panel({ kind })
    expect(warn).not.toHaveBeenCalled()
  })

  it('lets a long unbroken string in the body wrap instead of overflowing', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'StatePanel.vue'), 'utf8')
    const rule = source.match(/\.state-body\s*\{[^}]*\}/)[0]
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
