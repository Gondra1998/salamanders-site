import { describe, it, expect } from 'vitest'
import { SCENES, sceneOf } from './scenes'
import { AREAS, mayOpen } from './areas'

describe('SCENES', () => {
  it('names the everyday member, the Commander, one scene per standing, the gate states and the two data scenes', () => {
    expect(SCENES).toEqual([
      'allowed', 'commander', 'legion', 'emissary', 'deployment', 'command', 'accolade',
      'denied', 'signin', 'checking', 'unavailable', 'empty', 'active-event',
    ])
  })
})

describe('sceneOf', () => {
  it.each([
    ['allowed', 'allowed', false, false, ['legion', 'deployment']],
    ['commander', 'allowed', true, true, []],
    ['legion', 'allowed', false, false, ['legion']],
    ['emissary', 'allowed', false, false, ['emissary']],
    ['deployment', 'allowed', false, false, ['legion', 'deployment']],
    ['command', 'allowed', false, true, ['legion', 'deployment', 'command']],
    ['accolade', 'allowed', false, false, ['legion', 'xenosbane']],
    ['denied', 'denied', false, false, []],
    ['signin', 'signin', false, false, []],
    ['checking', 'checking', false, false, []],
    ['unavailable', 'unavailable', false, false, []],
    ['empty', 'allowed', true, true, []],
    ['active-event', 'allowed', true, true, []],
  ])('turns the %s scene into status %s (commander: %s, command: %s, roles: %j)', (name, status, commander, command, roles) => {
    expect(sceneOf(name)).toEqual({ _fixture: true, scene: name, status, commander, command, roles })
  })

  it('gives the allowed scene for an unknown or non-string name', () => {
    for (const name of ['bogus', '', '1', '__proto__', 'constructor', undefined, null, 5, ['denied']]) {
      expect(sceneOf(name), String(name)).toEqual({
        _fixture: true,
        scene: 'allowed',
        status: 'allowed',
        commander: false,
        command: false,
        roles: ['legion', 'deployment'],
      })
    }
  })
})

describe('the access list, scene by scene', () => {
  // What each scene opens, read through the same rules the pages use (areas.js), against the list as given: Legion is
  // every member's base, so each scene but the guest's (emissary) opens the Hall of Relics and Enlist Now too.
  const opens = (name) => {
    const s = sceneOf(name)
    const who = { commander: s.commander, held: s.roles }
    const tab = (area, slug) => AREAS[area].tabs.find((t) => t.slug === slug)
    return {
      eventTracker: mayOpen(AREAS.eventtracker.roles, who),
      armouringHall: mayOpen(AREAS.armouringhall.roles, who),
      watchCommand: mayOpen(tab('armouringhall', 'watch-command').roles, who),
      chronicles: mayOpen(AREAS.chronicles.roles, who),
      hallOfRelics: mayOpen(AREAS.hallofrelics.roles, who),
      enlistNow: mayOpen(AREAS.recruitment.roles, who),
      manage: mayOpen(AREAS.administratum.roles, who),
    }
  }
  const row = (eventTracker, armouringHall, watchCommand, chronicles, hallOfRelics, enlistNow, manage = false) => ({
    eventTracker, armouringHall, watchCommand, chronicles, hallOfRelics, enlistNow, manage,
  })

  it.each([
    ['legion', row(false, false, false, false, true, true)],
    ['emissary', row(false, false, false, false, true, true)],
    ['deployment', row(true, true, false, true, true, true)],
    ['command', row(true, true, true, true, true, true)],
    ['accolade', row(false, false, false, true, true, true)],
    ['commander', row(true, true, true, true, true, true, true)],
  ])('%s', (name, want) => {
    expect(opens(name)).toEqual(want)
  })
})
