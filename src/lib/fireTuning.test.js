// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { profileFor, profileKeyFor, routeProfiles } from './fireTuning'

describe('the Deathwatch volcano profile', () => {
  const deathwatch = () => routeProfiles['/deathwatch/*']

  it('is one profile for the hub and every page under it', () => {
    expect(deathwatch()).toBeDefined()
    for (const path of ['/deathwatch', '/deathwatch/eventtracker/standings', '/deathwatch/administratum/enter-mission']) {
      expect(profileFor(path), path).toBe(deathwatch())
    }
  })

  it('is a quieter mountain than the landing page, so a page of tables keeps its contrast', () => {
    expect(deathwatch().density).toBeLessThan(1)
    expect(deathwatch().scale).toBeLessThan(1)
  })

  it('covers the /deathwatch section only, not a path that merely starts with the same letters', () => {
    for (const path of ['/deathwatchful', '/deathwatch-x/y', '/x/deathwatch']) {
      expect(profileFor(path), path).toBe(routeProfiles['*'])
    }
  })

  it('leaves every other page as it was', () => {
    expect(routeProfiles['/']).toEqual({ bearing: 0, scale: 1, variance: 1, density: 1 }) // the landing page, exactly: do not tidy
    expect(profileFor('/')).toBe(routeProfiles['/'])
    expect(profileFor('/companies')).toBe(routeProfiles['/companies'])
    expect(profileFor('/roster')).toBe(routeProfiles['/roster'])
    expect(profileFor('/nowhere')).toBe(routeProfiles['*'])
  })

  it('answers something that is not a path with the catch-all', () => {
    for (const path of [undefined, null, '', 5, {}]) expect(profileFor(path), String(path)).toBe(routeProfiles['*'])
  })

  it('never takes a property of Object for a profile', () => {
    for (const path of ['__proto__', '/__proto__', 'constructor', '/constructor/x', '/toString']) {
      expect(profileFor(path), path).toBe(routeProfiles['*'])
    }
  })
})

describe('profileKeyFor', () => {
  it('names the entry that governs a path: its own, else its section, else the catch-all', () => {
    expect(profileKeyFor('/roster')).toBe('/roster')
    expect(profileKeyFor('/deathwatch')).toBe('/deathwatch/*')
    expect(profileKeyFor('/deathwatch/eventtracker/standings')).toBe('/deathwatch/*')
    expect(profileKeyFor('/nowhere')).toBe('*')
    expect(profileKeyFor(undefined)).toBe('*')
  })
})

describe('volcano route profiles', () => {
  it('/roster has its own profile instead of the unrouted fallback', () => {
    expect(routeProfiles['/roster']).toBeDefined()
    expect(profileFor('/roster')).not.toBe(routeProfiles['*'])
  })

  it('/roster is a calm, low horizon: a long reading page of panels must not sit under a glaring peak', () => {
    const { density, scale } = profileFor('/roster')
    expect(density).toBeLessThanOrEqual(0.6)
    expect(scale).toBeLessThanOrEqual(0.6)
  })
})
