// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import WeaponTree from './WeaponTree.vue'
import { usePerkCorrections } from '../stores/perkCorrections'
import { usePlanner } from '../stores/planner'
import * as perksApi from '../lib/perksApi'

// Only the network edge is mocked: saves go through the real store, so its
// optimistic apply and rollback reach the tree exactly as they do live.
vi.mock('../lib/perksApi', () => ({
  getCorrections: vi.fn(),
  getPrivileges: vi.fn(),
  submitCorrection: vi.fn(),
  revertCorrection: vi.fn(),
}))
vi.mock('../stores/auth', () => ({ useAuth: () => ({ token: 'tok' }) }))

const data = {
  budget: 5,
  perks: [
    { name: 'A', quality: 'Standard', description: 'a' },
    { name: 'B', quality: 'Standard', description: 'b' },
  ],
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

const baked = { ...data, source: 'baked' }
const emptyDoc = { version: 'v', classes: {}, weapons: {} }
function editorTree(treeData = baked) {
  const s = usePerkCorrections()
  s.doc = emptyDoc
  s.live = true
  s.privileges = { editor: true }
  return mount(WeaponTree, { props: { weapon: 'Test', data: treeData } })
}
const node = (w, name) => w.findAll('.wnode').find((n) => n.find('.wnode-name').text() === name)
const names = (w) => w.findAll('.wnode-name').map((n) => n.text())
const REVOKED = 'Your site privileges have been revoked.'

describe('WeaponTree with corrections', () => {
  it('keeps bake ids stable when an earlier perk is removed', async () => {
    const s = usePerkCorrections()
    s.doc = { version: 'v', classes: {}, weapons: { Test: [{ id: 1, op: 'remove', quality: 'Standard', perkName: 'A', description: null, createdAt: 't' }] } }
    const w = mount(WeaponTree, { props: { weapon: 'Test', data } })
    const nodes = w.findAll('.wnode')
    expect(nodes.map((n) => n.text())).toEqual(['B'])
    await nodes[0].trigger('click')
    // B was index 1 in the bake: its id must still end in -1.
    expect(Object.keys(usePlanner().weaponPerks.Test)).toEqual(['standard-b-1'])
  })

  it('tags corrected perks in the detail panel', async () => {
    const s = usePerkCorrections()
    s.doc = { version: 'v', classes: {}, weapons: { Test: [{ id: 1, op: 'edit', quality: 'Standard', perkName: 'B', description: 'fixed', createdAt: '2026-09-27T12:00:00.000Z' }] } }
    const w = mount(WeaponTree, { props: { weapon: 'Test', data } })
    await w.findAll('.wnode')[1].trigger('mouseenter')
    expect(w.find('.wdetail-desc').text()).toBe('fixed')
    expect(w.find('.corrected-tag').text()).toContain('Corrected in game')
  })

  it('frees budget held by a pick whose perk a correction removed, and restores it on revert', async () => {
    const tight = { budget: 2, perks: [...data.perks, { name: 'C', quality: 'Standard', description: 'c' }] }
    const planner = usePlanner()
    const s = usePerkCorrections()
    const w = mount(WeaponTree, { props: { weapon: 'Test', data: tight } })
    await w.findAll('.wnode')[0].trigger('click') // A
    await w.findAll('.wnode')[1].trigger('click') // B
    expect(w.find('.wtree-pts').text()).toBe('2 / 2 points')

    const original = s.doc
    s.doc = { version: 'v2', classes: {}, weapons: { Test: [{ id: 1, op: 'remove', quality: 'Standard', perkName: 'A', description: null, createdAt: 't' }] } }
    await w.vm.$nextTick()
    expect(w.find('.wtree-pts').text()).toBe('1 / 2 points')
    // The orphaned pick stays in storage so a revert can restore it.
    expect(planner.weaponPerks.Test).toHaveProperty('standard-a-0')

    const c = w.findAll('.wnode').find((n) => n.text() === 'C')
    await c.trigger('click')
    expect(planner.weaponPerks.Test).toHaveProperty('standard-c-2')
    expect(w.find('.wtree-pts').text()).toBe('2 / 2 points')

    s.doc = original
    await w.vm.$nextTick()
    const a = w.findAll('.wnode').find((n) => n.text() === 'A')
    expect(a.classes()).toContain('on')
  })

  it('live-updates the open detail panel when corrections change', async () => {
    const s = usePerkCorrections()
    const w = mount(WeaponTree, { props: { weapon: 'Test', data } })
    await w.findAll('.wnode')[1].trigger('mouseenter')
    expect(w.find('.wdetail-desc').text()).toBe('b')
    s.doc = { version: 'v2', classes: {}, weapons: { Test: [{ id: 1, op: 'edit', quality: 'Standard', perkName: 'B', description: 'fixed', createdAt: '2026-09-27T12:00:00.000Z' }] } }
    await w.vm.$nextTick()
    expect(w.find('.wdetail-desc').text()).toBe('fixed')
  })

  it('closes the detail panel when the inspected perk is removed', async () => {
    const s = usePerkCorrections()
    const w = mount(WeaponTree, { props: { weapon: 'Test', data } })
    await w.findAll('.wnode')[0].trigger('mouseenter')
    expect(w.find('.wdetail').exists()).toBe(true)
    s.doc = { version: 'v2', classes: {}, weapons: { Test: [{ id: 1, op: 'remove', quality: 'Standard', perkName: 'A', description: null, createdAt: 't' }] } }
    await w.vm.$nextTick()
    expect(w.find('.wdetail').exists()).toBe(false)
  })

  it('closes an open add panel when edit rights vanish', async () => {
    const s = usePerkCorrections()
    s.live = true
    s.privileges = { editor: true }
    const w = mount(WeaponTree, { props: { weapon: 'Test', data: { ...data, source: 'baked' } } })
    await w.get('button.wtier-add').trigger('click')
    expect(w.find('input.pe-name').exists()).toBe(true)
    s.privileges = { editor: false }
    await w.vm.$nextTick()
    expect(w.find('input.pe-name').exists()).toBe(false)
  })

  it.each(['wiki', 'offline', undefined])('no edit or add controls for a %s tree the server does not know, even for an editor', async (source) => {
    const s = usePerkCorrections()
    s.live = true
    s.privileges = { editor: true }
    const w = mount(WeaponTree, { props: { weapon: 'Test', data: { ...data, source } } })
    expect(w.find('button.wtier-add').exists()).toBe(false)
    await w.findAll('.wnode')[0].trigger('mouseenter')
    expect(w.find('.wdetail').exists()).toBe(true)
    expect(w.find('.pe').exists()).toBe(false)
  })

  it('a baked tree shows the edit and add controls to an editor', async () => {
    const s = usePerkCorrections()
    s.live = true
    s.privileges = { editor: true }
    const w = mount(WeaponTree, { props: { weapon: 'Test', data: { ...data, source: 'baked' } } })
    expect(w.find('button.wtier-add').exists()).toBe(true)
    await w.findAll('.wnode')[0].trigger('mouseenter')
    expect(w.find('.pe').exists()).toBe(true)
  })
})

describe('WeaponTree saves through the real store', () => {
  it('a refused remove shows the error and the perk comes back', async () => {
    perksApi.submitCorrection.mockRejectedValue(new Error(REVOKED))
    const w = editorTree()
    await node(w, 'A').trigger('click')
    await w.get('button.pe-remove').trigger('click')
    await w.get('button.pe-confirm').trigger('click')
    await flushPromises()
    expect(perksApi.submitCorrection).toHaveBeenCalledTimes(1)
    expect(names(w)).toEqual(['A', 'B'])
    expect(w.get('.pe-error').text()).toBe(REVOKED)
    expect(w.get('.wdetail-name').text()).toBe('A')
  })

  it('a successful remove takes the perk out and closes the panel', async () => {
    perksApi.submitCorrection.mockResolvedValue({
      version: 'v2',
      classes: {},
      weapons: { Test: [{ id: 7, op: 'remove', quality: 'Standard', perkName: 'A', description: null, createdAt: 't' }] },
    })
    const w = editorTree()
    await node(w, 'A').trigger('click')
    await w.get('button.pe-remove').trigger('click')
    await w.get('button.pe-confirm').trigger('click')
    await flushPromises()
    expect(names(w)).toEqual(['B'])
    expect(w.find('.wdetail').exists()).toBe(false)
  })

  it('a refused edit shows the error and keeps the typed draft', async () => {
    perksApi.submitCorrection.mockRejectedValue(new Error(REVOKED))
    const w = editorTree()
    await node(w, 'B').trigger('click')
    await w.get('button.pe-edit').trigger('click')
    await w.get('textarea').setValue('my better text')
    await w.get('input.pe-note').setValue('patch 14.1')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.get('.pe-error').text()).toBe(REVOKED)
    expect(w.get('textarea').element.value).toBe('my better text')
    expect(w.get('input.pe-note').element.value).toBe('patch 14.1')
    expect(w.get('.wdetail-desc').text()).toBe('b')
  })

  it('a successful edit shows the new text and returns the panel to idle', async () => {
    perksApi.submitCorrection.mockResolvedValue({
      version: 'v2',
      classes: {},
      weapons: { Test: [{ id: 8, op: 'edit', quality: 'Standard', perkName: 'B', description: 'new', createdAt: '2026-09-27T12:00:00.000Z' }] },
    })
    const w = editorTree()
    await node(w, 'B').trigger('click')
    await w.get('button.pe-edit').trigger('click')
    await w.get('textarea').setValue('new')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.get('.wdetail-desc').text()).toBe('new')
    expect(w.find('form').exists()).toBe(false)
    expect(w.find('button.pe-edit').exists()).toBe(true)
    expect(w.find('.pe-error').exists()).toBe(false)
  })
})

describe('WeaponTree inspection: hover previews, click pins', () => {
  it('after a successful remove, hover works again on other perks', async () => {
    perksApi.submitCorrection.mockResolvedValue({
      version: 'v2',
      classes: {},
      weapons: { Test: [{ id: 7, op: 'remove', quality: 'Standard', perkName: 'A', description: null, createdAt: 't' }] },
    })
    const w = editorTree()
    await node(w, 'A').trigger('click')
    await w.get('button.pe-remove').trigger('click')
    await w.get('button.pe-confirm').trigger('click')
    await flushPromises()
    // A is removed, pinnedId should be cleared so hovering B works
    await node(w, 'B').trigger('mouseenter')
    expect(w.get('.wdetail-name').text()).toBe('B')
  })

  it('hover previews when nothing is pinned', async () => {
    const w = editorTree()
    await node(w, 'A').trigger('mouseenter')
    expect(w.get('.wdetail-name').text()).toBe('A')
    await node(w, 'B').trigger('mouseenter')
    expect(w.get('.wdetail-name').text()).toBe('B')
  })

  it('clicking pins the perk: hovering another does not retarget', async () => {
    const w = editorTree()
    await node(w, 'B').trigger('click')
    expect(usePlanner().weaponPerks.Test).toHaveProperty('standard-b-1')
    await node(w, 'A').trigger('mouseenter')
    expect(w.get('.wdetail-name').text()).toBe('B')
  })

  it('hover never retargets an open edit, even one opened from a hover preview', async () => {
    const w = editorTree()
    await node(w, 'B').trigger('mouseenter')
    await w.get('button.pe-edit').trigger('click')
    await w.get('textarea').setValue('draft')
    await node(w, 'A').trigger('mouseenter')
    await node(w, 'A').trigger('focus')
    expect(w.get('.wdetail-name').text()).toBe('B')
    expect(w.get('textarea').element.value).toBe('draft')
  })

  it('the close button clears the pin and the panel', async () => {
    const w = editorTree()
    await node(w, 'B').trigger('click')
    await w.get('button.wdetail-close').trigger('click')
    expect(w.find('.wdetail').exists()).toBe(false)
    await node(w, 'A').trigger('mouseenter')
    expect(w.get('.wdetail-name').text()).toBe('A')
  })
})

describe('WeaponTree duplicate names within a tier', () => {
  const dup = {
    budget: 5,
    source: 'baked',
    perks: [
      { name: 'Increased Capacity', quality: 'Relic', description: 'one' },
      { name: 'Increased Capacity', quality: 'Relic', description: 'two' },
      { name: 'Increased Capacity', quality: 'Heroic', description: 'three' },
    ],
  }

  it('offers edit controls only on the first occurrence of a name in a tier', async () => {
    const w = editorTree(dup)
    const nodes = w.findAll('.wnode')
    await nodes[0].trigger('mouseenter')
    expect(w.find('.pe').exists()).toBe(true)
    expect(w.find('.wdetail-dup').exists()).toBe(false)
    await nodes[1].trigger('mouseenter')
    expect(w.find('.pe').exists()).toBe(false)
    expect(w.get('.wdetail-dup').text()).toContain('Duplicate name')
    // Same name in another tier is its own first occurrence.
    await nodes[2].trigger('mouseenter')
    expect(w.find('.pe').exists()).toBe(true)
  })
})

describe('WeaponTree stateKey', () => {
  const tree = (props = {}) => mount(WeaponTree, { props: { weapon: 'Test', data, ...props } })
  const points = (w) => w.find('.wtree-pts').text()

  it('keeps picks, budget and reset apart from the same weapon without a stateKey', async () => {
    const planner = usePlanner()
    const primary = tree()
    const secondary = tree({ stateKey: 'Test (Secondary)' })

    await primary.findAll('.wnode')[0].trigger('click')
    expect(points(primary)).toBe('1 / 5 points')
    expect(points(secondary)).toBe('0 / 5 points')

    await secondary.findAll('.wnode')[1].trigger('click')
    expect(Object.keys(planner.weaponPerks.Test)).toHaveLength(1)
    expect(Object.keys(planner.weaponPerks['Test (Secondary)'])).toHaveLength(1)

    const budget = secondary.find('.wtree-budget input')
    budget.element.value = '2'
    await budget.trigger('change')
    expect(points(secondary)).toBe('1 / 2 points')
    expect(points(primary)).toBe('1 / 5 points')

    await secondary.find('.wtree-reset').trigger('click')
    expect(points(secondary)).toBe('0 / 2 points')
    expect(points(primary)).toBe('1 / 5 points')
  })

  it('shows a correction to the weapon in both copies', async () => {
    const s = usePerkCorrections()
    s.doc = { version: 'v', classes: {}, weapons: { Test: [{ id: 1, op: 'edit', quality: 'Standard', perkName: 'B', description: 'fixed', createdAt: '2026-09-27T12:00:00.000Z' }] } }
    for (const w of [tree(), tree({ stateKey: 'Test (Secondary)' })]) {
      await w.findAll('.wnode')[1].trigger('mouseenter')
      expect(w.find('.wdetail-desc').text()).toBe('fixed')
    }
  })
})

describe('WeaponTree perk detail', () => {
  // jsdom replaces the global URL class, which fs rejects, so go through a plain path string.
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'WeaponTree.vue'), 'utf8')

  it('puts the quality in a stud before its label', async () => {
    const w = mount(WeaponTree, { props: { weapon: 'Test', data } })
    await node(w, 'A').trigger('click')
    expect(w.get('.wdetail').attributes('data-q')).toBe('standard')
    const first = w.get('.wdetail-top').element.firstElementChild
    expect(first.classList.contains('stud')).toBe(true)
    expect(first.classList.contains('wdetail-stud')).toBe(true)
    expect(first.getAttribute('aria-hidden')).toBe('true')
    expect(first.nextElementSibling.textContent).toBe('Standard')
  })

  it('gives the add-a-perk panel the same stud', async () => {
    const w = editorTree()
    await w.get('.wtier-add').trigger('click')
    const first = w.get('.wdetail-top').element.firstElementChild
    expect(first.classList.contains('wdetail-stud')).toBe(true)
    expect(first.nextElementSibling.textContent).toBe('Standard')
  })

  // The first rule that starts with the selector, up to its closing brace.
  const rule = (selector) => {
    const start = source.indexOf(selector)
    return start < 0 ? '' : source.slice(start, source.indexOf('}', start))
  }

  it('carries the quality colour in the stud and leaves the label pewter', () => {
    const studs = { standard: 'smoke', 'master-crafted': 'drake', artificer: 'cobalt', relic: 'violet', heroic: 'gold' }
    for (const [quality, colour] of Object.entries(studs)) {
      expect(rule(`.wdetail[data-q='${quality}'] .wdetail-stud {`), quality).toContain(`color: var(--color-${colour});`)
    }
    expect(rule('.wdetail-q {')).toContain('color: var(--color-pewter);')
  })

  it('keeps side borders and raw colours out of the stylesheet', () => {
    expect(source).not.toMatch(/border-left/)
    expect(source).not.toMatch(/#[0-9a-f]{3,8}[^0-9a-f]|rgba?[(]/i)
  })
})
