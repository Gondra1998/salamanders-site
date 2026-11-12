// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PublicShape from './PublicShape.vue'

const heat = { h: 'rgb(255,106,43)', hp: 'rgb(242,210,122)', hn: 'rgb(224,67,29)' }
const item = (s, label, count, extra = {}) => ({ s, key: label.toLowerCase(), label, count, heat, ...extra })
const ITEMS = [item(0, 'Lieutenant', 2), item(1, 'Sergeant', 6), item(2, 'Terminator', 1, { lateral: true }), item(3, 'Scout', 12)]
const person = (n, extra = {}) => ({ id: `pub-x-${n}`, name: `Head ${n}`, ...extra })
const render = (props = {}) => mount(PublicShape, { props: { items: ITEMS, extraHeads: null, branch: null, ...props } })

describe('PublicShape', () => {
  it('lists each rank with its count, in order, and names nobody', () => {
    const w = render()
    expect(w.findAll('.rs-shape-row').map((r) => [r.find('.rs-shape-label').text(), r.find('.rs-count').text()])).toEqual([
      ['Lieutenant', '2'], ['Sergeant', '6'], ['Terminator', '1'], ['Scout', '12'],
    ])
    expect(w.find('li.rs-member').exists()).toBe(false)
    expect(w.find('img').exists()).toBe(false)
  })

  it('marks each row with its rank key, and a lateral rank as lateral, and carries the heat colours', () => {
    const rows = render().findAll('.rs-shape-row')
    expect(rows[1].attributes('data-rank')).toBe('sergeant')
    expect(rows[1].attributes('data-lateral')).toBeUndefined()
    expect(rows[2].attributes('data-lateral')).toBeDefined()
    // three different colours, so a node and its two spine segments cannot be swapped unnoticed
    const style = rows[0].element.style
    expect(['--h', '--hp', '--hn'].map((v) => style.getPropertyValue(v))).toEqual(['rgb(255,106,43)', 'rgb(242,210,122)', 'rgb(224,67,29)'])
  })

  it('gives every row its own heat, not the first row\'s', () => {
    const ramp = (n) => ({ h: `rgb(${n},0,0)`, hp: `rgb(0,${n},0)`, hn: `rgb(0,0,${n})` })
    const rows = render({ items: [item(0, 'Sergeant', 6, { heat: ramp(1) }), item(1, 'Scout', 12, { heat: ramp(2) })] }).findAll('.rs-shape-row')
    expect(rows.map((r) => ['--h', '--hp', '--hn'].map((v) => r.element.style.getPropertyValue(v)))).toEqual([
      ['rgb(1,0,0)', 'rgb(0,1,0)', 'rgb(0,0,1)'],
      ['rgb(2,0,0)', 'rgb(0,2,0)', 'rgb(0,0,2)'],
    ])
  })

  it('names the extra heads, as chips and never with an image', () => {
    const extra = { rank: { key: 'venerable-dreadnought', label: 'Venerable Dreadnought', tier: 1 }, members: [person(3, { avatar: 'https://cdn.discordapp.com/x.png' }), person(4), person(5)] }
    const w = render({ extraHeads: extra, items: [] })
    const chips = w.findAll('.rs-shape-heads li.rs-member')
    expect(chips.map((c) => c.find('.rs-name').text())).toEqual(['Head 3', 'Head 4', 'Head 5'])
    expect(w.find('.rs-shape-heads .rs-rank-label').text()).toContain('Venerable Dreadnought')
    expect(w.find('img').exists()).toBe(false)
  })

  it('shows a name containing markup as text', () => {
    const extra = { rank: { key: 'k', label: 'K', tier: 1 }, members: [person(1, { name: '<b>x</b>' })] }
    const w = render({ extraHeads: extra })
    expect(w.find('.rs-shape-heads .rs-name').text()).toBe('<b>x</b>')
    expect(w.find('.rs-shape-heads b').exists()).toBe(false)
  })

  it('asks a Legion member to sign in, and says so by emitting sign-in', async () => {
    const w = render()
    expect(w.find('.rs-shape-signin').text()).toContain('Legion member?')
    await w.find('.rs-shape-signin button').trigger('click')
    expect(w.emitted('sign-in')).toHaveLength(1)
    expect(w.find('.rs-shape-signin button').text()).toBe('Sign in with Discord')
  })

  it('still shows the sign-in line when there are no rank rows', () => {
    const w = render({ items: [] })
    expect(w.findAll('.rs-shape-row')).toHaveLength(0)
    expect(w.find('.rs-shape-signin').exists()).toBe(true)
  })
})
