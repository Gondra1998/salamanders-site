// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WeaponSlot from './WeaponSlot.vue'
import WeaponTree from './WeaponTree.vue'
import { usePlanner } from '../stores/planner'
import trees from '../data/weapon-trees.json'

let planner
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  planner = usePlanner()
})

const slotOf = (name, label) => mount(WeaponSlot, { props: { slot: name, label }, global: { stubs: { WeaponTree: true } } })
const slot = () => slotOf('melee', 'Melee')

describe('WeaponSlot', () => {
  it('says the perk tree is not published yet for a weapon without one', async () => {
    // The One-Handed Thunder Hammer is borrowed as the weapon whose perks the wiki has not published.
    const t = trees.weapons['One-Handed Thunder Hammer']
    const saved = { perks: t.perks, perksPending: t.perksPending }
    t.perks = []
    t.perksPending = true
    try {
      planner.setClass('Tactical')
      planner.setWeapon('melee', 'One-Handed Thunder Hammer')
      const w = slot()
      await w.find('.slot-toggle').trigger('click')
      await flushPromises()
      expect(w.find('.slot-pending').text()).toContain('not published yet')
      expect(w.findComponent(WeaponTree).exists()).toBe(false)
    } finally {
      t.perks = saved.perks
      if (saved.perksPending === undefined) delete t.perksPending
      else t.perksPending = saved.perksPending
    }
  })

  it('opens the One-Handed Thunder Hammer tree now that its perks are baked', async () => {
    planner.setClass('Tactical')
    planner.setWeapon('melee', 'One-Handed Thunder Hammer')
    const w = slot()
    await w.find('.slot-toggle').trigger('click')
    await flushPromises()
    expect(w.find('.slot-pending').exists()).toBe(false)
    expect(w.findComponent(WeaponTree).exists()).toBe(true)
  })

  it('still opens the tree for a weapon that has one', async () => {
    planner.setClass('Tactical')
    planner.setWeapon('melee', 'Chainsword')
    const w = slot()
    await w.find('.slot-toggle').trigger('click')
    await flushPromises()
    expect(w.find('.slot-pending').exists()).toBe(false)
    expect(w.findComponent(WeaponTree).exists()).toBe(true)
  })

  it('offers the Thunder Hammer under its two-handed name, keeping the key as the value', () => {
    planner.setClass('Assault')
    const option = slot().findAll('option').find((o) => o.element.value === 'Thunder Hammer')
    expect(option.text()).toBe('Two-Handed Thunder Hammer')
  })

  it('offers the One-Handed Thunder Hammer to Tactical, which has no two-handed one', () => {
    planner.setClass('Tactical')
    const values = slot().findAll('option').map((o) => o.element.value)
    expect(values).toContain('One-Handed Thunder Hammer')
    expect(values).not.toContain('Thunder Hammer')
  })

  it('offers Tactical the Bolt Rifle as a Secondary, and no other primary', () => {
    planner.setClass('Tactical')
    const values = slotOf('secondary', 'Secondary').findAll('option').map((o) => o.element.value)
    expect(values).toEqual(['', 'Bolt Pistol', 'Heavy Bolt Pistol', 'Plasma Pistol', 'Bolt Rifle'])
  })

  it('does not offer the Bolt Rifle as a Secondary to a class that cannot take it', () => {
    planner.setClass('Assault')
    const values = slotOf('secondary', 'Secondary').findAll('option').map((o) => o.element.value)
    expect(values).not.toContain('Bolt Rifle')
  })

  it('counts each slot’s own perks when the same weapon is in two slots', () => {
    planner.setClass('Tactical')
    planner.setWeapon('primary', 'Bolt Rifle')
    planner.setWeapon('secondary', 'Bolt Rifle')
    planner.toggleWeaponPerk('Bolt Rifle', 'a')
    planner.toggleWeaponPerk('Bolt Rifle', 'b')
    planner.toggleWeaponPerk('Bolt Rifle (Secondary)', 'x')

    expect(slotOf('primary', 'Primary').find('.slot-pts').text()).toBe('2 perks')
    expect(slotOf('secondary', 'Secondary').find('.slot-pts').text()).toBe('1 perk')
  })

  it('gives the open tree the slot’s own key', async () => {
    planner.setClass('Tactical')
    planner.setWeapon('primary', 'Bolt Rifle')
    planner.setWeapon('secondary', 'Bolt Rifle')
    const keyed = async (name, label) => {
      const w = slotOf(name, label)
      await w.find('.slot-toggle').trigger('click')
      await flushPromises()
      return w.findComponent(WeaponTree).props('stateKey')
    }

    expect(await keyed('primary', 'Primary')).toBe('Bolt Rifle')
    expect(await keyed('secondary', 'Secondary')).toBe('Bolt Rifle (Secondary)')
  })
})

describe('WeaponSlot styling', () => {
  // jsdom replaces the global URL class, which fs rejects, so go through a plain path string.
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'WeaponSlot.vue'), 'utf8')

  it('keeps raw colours and pixel corners out of the stylesheet', () => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}[^0-9a-f]|rgba?[(]/i)
    expect(source).not.toMatch(/border-radius:[ ]*[0-9]+px/)
  })
})
