import { describe, it, expect } from 'vitest'
import { ACCESS_KINDS, AREAS, LEGACY_ROLES, canEdit, mayOpen, resolveArea, tabsFor } from './areas'

const tabsOf = (area) => AREAS[area].tabs.map((t) => t.slug)

describe('AREAS', () => {
  it('lists the six areas in hub order', () => {
    expect(Object.keys(AREAS)).toEqual(['eventtracker', 'armouringhall', 'chronicles', 'hallofrelics', 'recruitment', 'administratum'])
  })

  it('lists the seven Event Tracker views in order', () => {
    expect(tabsOf('eventtracker')).toEqual([
      'standings',
      'kill-teams',
      'players',
      'honour-roll',
      'game-stats',
      'scoring',
      'archive',
    ])
  })

  it("lists the other areas' tabs in order", () => {
    expect(tabsOf('armouringhall')).toEqual(['standard', 'specialist', 'watch-command', 'restricted-wargear'])
    expect(tabsOf('chronicles')).toEqual([
      'hall-of-champions',
      'chamber-of-honor',
      'player-profiles',
      'in-memoriam',
      'operational-records',
    ])
    expect(tabsOf('administratum')).toEqual(['enter-mission', 'manage', 'checks', 'records', 'page-texts', 'access'])
  })

  it("carries each area's label, blurb and tabs", () => {
    expect(AREAS).toEqual({
      eventtracker: {
        label: 'Event Tracker',
        blurb: 'Track events, standings, and your kill team’s progress.',
        roles: ['deployment'],
        tabs: [
          { slug: 'standings', label: 'Standings' },
          { slug: 'kill-teams', label: 'Kill Teams' },
          { slug: 'players', label: 'Operatives' },
          { slug: 'honour-roll', label: 'Honour Roll' },
          { slug: 'game-stats', label: 'Game Stats' },
          { slug: 'scoring', label: 'Scoring' },
          { slug: 'archive', label: 'Archive' },
        ],
      },
      armouringhall: {
        label: 'Armouring Hall',
        blurb: 'Explore armour sets, chapter colours, and heraldry.',
        roles: ['command', 'deployment'],
        tabs: [
          { slug: 'standard', label: 'Standard', items: ['watchbrother', 'companyheraldry'] },
          { slug: 'specialist', label: 'Specialist', items: ['reclusiarc', 'librarium', 'apothecarion', 'mechanicus'] },
          { slug: 'watch-command', label: 'Watch Command', command: true, roles: ['command'], lock: 'Reserved for the Deathwatch Command.', items: ['watchsergeant', 'watchchaplain', 'watchlibrarian', 'watchapothecary', 'watchtechmarine'] },
          { slug: 'restricted-wargear', label: 'Restricted Wargear' },
        ],
      },
      chronicles: {
        label: 'Chronicles of Valor',
        blurb: 'Discover the deeds, victories, and honours of the Watch.',
        roles: ['command', 'deployment', 'xenosbane', 'vigilia'],
        tabs: [
          { slug: 'hall-of-champions', label: 'Hall of Champions' },
          { slug: 'chamber-of-honor', label: 'Chamber of Honor' },
          { slug: 'player-profiles', label: 'Player Profiles' },
          { slug: 'in-memoriam', label: 'In Memoriam' },
          { slug: 'operational-records', label: 'Operational Records' },
        ],
      },
      hallofrelics: {
        label: 'Hall of Relics',
        blurb: 'Honour the warriors who shaped the history of Ebonhold.',
        roles: ['legion', 'emissary'],
        tabs: [
          { slug: 'notable-members', label: 'Notable Members' },
          { slug: 'fortress-lore', label: 'Fortress Lore' },
        ],
      },
      recruitment: {
        label: 'Recruitment',
        blurb: 'Terms of Service and requirements for the Watch',
        roles: ['legion', 'emissary'],
        tabs: [
          { slug: 'terms-of-service', label: 'Terms of Service' },
          { slug: 'requirements', label: 'Requirements' },
        ],
      },
      administratum: {
        label: 'Administratum',
        blurb: "The Watch Commander's dashboard",
        roles: ['desk', 'admin'],
        tabs: [
          { slug: 'enter-mission', label: 'Enter mission', roles: ['desk'], lock: 'Reserved for the Watch Commander and the desk.' },
          { slug: 'manage', label: 'Manage' },
          { slug: 'checks', label: 'Checks' },
          { slug: 'records', label: 'Records' },
          { slug: 'page-texts', label: 'Page Texts' },
          { slug: 'access', label: 'Access' },
        ],
      },
    })
  })
})

describe('resolveArea', () => {
  it.each([
    ['eventtracker', 'standings', ''],
    ['armouringhall', 'standard', 'watchbrother'],
    ['chronicles', 'hall-of-champions', ''],
    ['administratum', 'enter-mission', ''],
  ])('defaults %s to its first tab, %s', (area, first, sub) => {
    const canonical = `/deathwatch/${area}/${first}${sub ? `/${sub}` : ''}`
    expect(resolveArea({ area })).toEqual({ area, tab: first, sub, canonical })
  })

  it('opens an Armouring Hall tab without an item on its first uniform, and one without uniforms on none', () => {
    expect(resolveArea({ area: 'armouringhall', tab: 'specialist' }).canonical).toBe('/deathwatch/armouringhall/specialist/reclusiarc')
    expect(resolveArea({ area: 'armouringhall', tab: 'watch-command' }).canonical).toBe('/deathwatch/armouringhall/watch-command/watchsergeant')
    expect(resolveArea({ area: 'armouringhall', tab: 'restricted-wargear' })).toEqual({
      area: 'armouringhall',
      tab: 'restricted-wargear',
      sub: '',
      canonical: '/deathwatch/armouringhall/restricted-wargear',
    })
  })

  it('keeps a tab that exists, not only the first', () => {
    expect(resolveArea({ area: 'eventtracker', tab: 'players' })).toEqual({
      area: 'eventtracker',
      tab: 'players',
      sub: '',
      canonical: '/deathwatch/eventtracker/players',
    })
    expect(resolveArea({ area: 'chronicles', tab: 'in-memoriam' }).canonical).toBe('/deathwatch/chronicles/in-memoriam')
  })

  it('falls back to the first tab for an unknown or non-string tab', () => {
    for (const tab of ['nonsense', '', 'Players', 123, null, ['players'], {}]) {
      expect(resolveArea({ area: 'eventtracker', tab }).tab, String(tab)).toBe('standings')
    }
  })

  it('rejects an unknown area', () => {
    for (const area of ['nope', '', 'EventTracker', undefined]) {
      expect(resolveArea({ area }), String(area)).toBeNull()
    }
  })

  it('rejects missing params and a non-string area', () => {
    expect(resolveArea()).toBeNull()
    expect(resolveArea(null)).toBeNull()
    expect(resolveArea({})).toBeNull()
    // An array coerces to its text, which would otherwise find the area.
    for (const area of [123, ['eventtracker'], {}, null]) {
      expect(resolveArea({ area }), String(area)).toBeNull()
    }
  })

  it('survives prototype keys', () => {
    for (const area of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(resolveArea({ area }), area).toBeNull()
    }
    for (const tab of ['__proto__', 'constructor', 'toString']) {
      expect(resolveArea({ area: 'eventtracker', tab }).tab, tab).toBe('standings')
    }
    expect(resolveArea({ area: 'armouringhall', tab: 'standard', sub: '__proto__' }).sub).toBe('watchbrother')
  })

  it('keeps a sub-slug only when it is one of the tab\'s items', () => {
    expect(resolveArea({ area: 'armouringhall', tab: 'specialist', sub: 'librarium' })).toEqual({
      area: 'armouringhall',
      tab: 'specialist',
      sub: 'librarium',
      canonical: '/deathwatch/armouringhall/specialist/librarium',
    })
    for (const area of ['eventtracker', 'chronicles', 'administratum']) {
      const r = resolveArea({ area, sub: 'watchbrother' })
      expect(r.sub, area).toBe('')
      expect(r.canonical, area).not.toContain('watchbrother')
    }
  })

  // Every tab of the Armouring Hall, and what any address that does not name one of its items becomes.
  const FIRST = { standard: 'watchbrother', specialist: 'reclusiarc', 'watch-command': 'watchsergeant', 'restricted-wargear': '' }
  const NOT_AN_ITEM = [
    'nope', 'quatsch', 'a', 'a'.repeat(40), '../x', 'A B', '', 'a'.repeat(41), 'abc!', 'ABC', 'abc\n', 'a-b', 'a/b',
    123, 0, true, ['watchbrother'], { toString: () => 'watchbrother' }, null, undefined,
    '__proto__', 'constructor', 'toString', 'length',
  ]

  it.each(Object.entries(FIRST))('turns any sub-slug that is not one of %s\'s items into its first, %j', (tab, first) => {
    for (const sub of NOT_AN_ITEM) {
      const r = resolveArea({ area: 'armouringhall', tab, sub })
      expect(r.sub, String(sub)).toBe(first)
      expect(r.canonical, String(sub)).toBe(`/deathwatch/armouringhall/${tab}${first ? `/${first}` : ''}`)
    }
  })

  it('takes an item of another tab for an unknown one', () => {
    expect(resolveArea({ area: 'armouringhall', tab: 'standard', sub: 'librarium' }).sub).toBe('watchbrother')
    expect(resolveArea({ area: 'armouringhall', tab: 'specialist', sub: 'watchbrother' }).sub).toBe('reclusiarc')
    expect(resolveArea({ area: 'armouringhall', tab: 'restricted-wargear', sub: 'watchbrother' }).sub).toBe('')
  })

  it('sends the old Watch Specialist address, and a slug it never had, to the Watch Sergeant', () => {
    for (const sub of ['watchspecialist', 'watchmedic']) {
      const r = resolveArea({ area: 'armouringhall', tab: 'watch-command', sub })
      expect([r.sub, r.canonical], sub).toEqual(['watchsergeant', '/deathwatch/armouringhall/watch-command/watchsergeant'])
    }
  })
})

describe('mayOpen', () => {
  const who = (held, commander = false) => ({ commander, held })

  it('opens a part to a holder of any one role it lists', () => {
    expect(mayOpen(['command', 'deployment'], who(['deployment']))).toBe(true)
    expect(mayOpen(['command', 'deployment'], who(['legion', 'command']))).toBe(true)
    expect(mayOpen(['command', 'deployment'], who(['legion', 'xenosbane']))).toBe(false)
    expect(mayOpen(['legion'], who([]))).toBe(false)
  })

  it('opens everything to the Watch Commander, a part that lists nothing included, and that to nobody else', () => {
    expect(mayOpen([], who([], true))).toBe(true)
    expect(mayOpen(['deployment'], who([], true))).toBe(true)
    expect(mayOpen([], who([...LEGACY_ROLES, 'desk', 'admin']))).toBe(false)
  })

  it('takes only a plain true for the Watch Commander', () => {
    for (const commander of ['true', 1, {}, undefined]) expect(mayOpen([], who([], commander)), String(commander)).toBe(false)
  })
})

describe('who opens what, by default', () => {
  const opens = (role) => ({
    ...Object.fromEntries(Object.entries(AREAS).map(([area, a]) => [area, a.roles.includes(role)])),
    watchCommand: AREAS.armouringhall.tabs.find((t) => t.slug === 'watch-command').roles.includes(role),
  })
  const row = (eventtracker, armouringhall, watchCommand, chronicles, hallofrelics, recruitment, administratum = false) => ({
    eventtracker, armouringhall, watchCommand, chronicles, hallofrelics, recruitment, administratum,
  })

  it.each([
    ['legion', row(false, false, false, false, true, true)],
    ['emissary', row(false, false, false, false, true, true)],
    ['deployment', row(true, true, false, true, false, false)],
    ['command', row(false, true, true, true, false, false)],
    ['xenosbane', row(false, false, false, true, false, false)],
    ['vigilia', row(false, false, false, true, false, false)],
    ['killmarine', row(false, false, false, false, false, false)], // checked elsewhere, opens no part
    // Given by hand, or an admin: the Administratum, and nothing else by itself (the server adds deployment to both).
    ['desk', row(false, false, false, false, false, false, true)],
    ['admin', row(false, false, false, false, false, false, true)],
  ])('%s', (role, want) => {
    expect(opens(role)).toEqual(want)
  })
})

describe('the Administratum: the Watch Commander, the desk and admins', () => {
  const who = (held, commander = false) => ({ commander, held })
  const slugs = (area, w) => tabsFor(area, w).map((t) => t.slug)

  it('opens to the Watch Commander, the desk and admins, and to no other standing', () => {
    expect(mayOpen(AREAS.administratum.roles, who([], true))).toBe(true)
    expect(mayOpen(AREAS.administratum.roles, who(['desk']))).toBe(true)
    expect(mayOpen(AREAS.administratum.roles, who(['admin']))).toBe(true)
    expect(mayOpen(AREAS.administratum.roles, who(LEGACY_ROLES))).toBe(false)
  })

  it('lets the Watch Commander and the desk change things, and nobody else, admins included', () => {
    expect(canEdit(who([], true))).toBe(true)
    expect(canEdit(who(['deployment', 'desk']))).toBe(true)
    expect(canEdit(who(['deployment', 'admin']))).toBe(false)
    expect(canEdit(who(LEGACY_ROLES))).toBe(false)
    expect(canEdit(who(['desk'], 'true'))).toBe(true)
    expect(canEdit(who(['Desk'], 'true'))).toBe(false)
  })

  it('lists Enter mission only to those who can change things', () => {
    const all = AREAS.administratum.tabs.map((t) => t.slug)
    expect(slugs('administratum', who([], true))).toEqual(all)
    expect(slugs('administratum', who(['desk']))).toEqual(all)
    expect(slugs('administratum', who(['admin']))).toEqual(all.filter((t) => t !== 'enter-mission'))
  })

  it('lists the Watch Command tab only to Deathwatch Command and the Watch Commander', () => {
    expect(slugs('armouringhall', who(['deployment']))).not.toContain('watch-command')
    expect(slugs('armouringhall', who(['deployment', 'command']))).toContain('watch-command')
    expect(slugs('armouringhall', who([], true))).toContain('watch-command')
  })

  it('names what each restricted tab is reserved for', () => {
    const lock = (area, slug) => AREAS[area].tabs.find((t) => t.slug === slug).lock
    expect(lock('armouringhall', 'watch-command')).toBe('Reserved for the Deathwatch Command.')
    expect(lock('administratum', 'enter-mission')).toBe('Reserved for the Watch Commander and the desk.')
  })

  it('takes a server from before the standings as every part but the Administratum', () => {
    expect(LEGACY_ROLES).toEqual(['legion', 'emissary', 'deployment', 'command', 'xenosbane', 'vigilia'])
    expect(mayOpen(AREAS.administratum.roles, who(LEGACY_ROLES))).toBe(false)
    for (const a of ['eventtracker', 'armouringhall', 'chronicles', 'hallofrelics', 'recruitment']) expect(mayOpen(AREAS[a].roles, who(LEGACY_ROLES)), a).toBe(true)
  })

  it('offers three kinds of access, in the order the Access page shows them', () => {
    expect(ACCESS_KINDS).toEqual([
      ['desk', 'Desk'],
      ['watchcommand', 'Watch Command'],
      ['deathwatch', 'Deathwatch'],
    ])
  })
})
