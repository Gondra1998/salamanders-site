import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { avatarUrl, companiesInName, isServitorName, memberFacts, UNNAMED } from './rosterMember.js'

const GUILD = '1322056087792521269'
const UID = '200000000000000001'
const HASH = 'a'.repeat(32)
const OTHER = 'b'.repeat(32)

describe('avatarUrl', () => {
  it('prefers the server avatar', () => {
    expect(avatarUrl({ avatar: HASH, user: { id: UID, avatar: OTHER } }, GUILD)).toBe(
      `https://cdn.discordapp.com/guilds/${GUILD}/users/${UID}/avatars/${HASH}.png?size=64`,
    )
  })

  it('falls back to the account avatar', () => {
    expect(avatarUrl({ user: { id: UID, avatar: OTHER } }, GUILD)).toBe(
      `https://cdn.discordapp.com/avatars/${UID}/${OTHER}.png?size=64`,
    )
  })

  it('accepts animated (a_) hashes', () => {
    expect(avatarUrl({ user: { id: UID, avatar: `a_${OTHER}` } }, GUILD)).toContain(`/avatars/${UID}/a_${OTHER}.png`)
  })

  it('is null when there is no avatar at all', () => {
    expect(avatarUrl({ user: { id: UID, avatar: null } }, GUILD)).toBe(null)
    expect(avatarUrl({ user: { id: UID } }, GUILD)).toBe(null)
  })

  it.each(['', 'short', 'g'.repeat(32), 'A'.repeat(32), `${HASH}/../x`, `../${'a'.repeat(29)}`, 5, null, {}, []])(
    'rejects a malformed hash, so it can never inject into the URL (%j)',
    (bad) => {
      expect(avatarUrl({ avatar: bad, user: { id: UID, avatar: bad } }, GUILD)).toBe(null)
    },
  )

  it('rejects a single-element array that stringifies to a valid hash', () => {
    expect(avatarUrl({ user: { id: UID, avatar: [OTHER] } }, GUILD)).toBe(null)
    expect(avatarUrl({ avatar: [HASH], user: { id: UID } }, GUILD)).toBe(null)
  })

  it('rejects a single-element array that stringifies to a valid id', () => {
    expect(avatarUrl({ user: { id: [UID], avatar: OTHER } }, GUILD)).toBe(null)
    expect(avatarUrl({ avatar: HASH, user: { id: UID } }, [GUILD])).toBe(null)
  })

  it('skips the server avatar when the guild id is not a snowflake', () => {
    expect(avatarUrl({ avatar: HASH, user: { id: UID, avatar: OTHER } }, 'x/../y')).toBe(
      `https://cdn.discordapp.com/avatars/${UID}/${OTHER}.png?size=64`,
    )
    expect(avatarUrl({ avatar: HASH, user: { id: UID } }, undefined)).toBe(null)
  })

  it.each([null, undefined, {}, { user: null }, { user: { id: 'nope', avatar: OTHER } }, { user: { id: 5, avatar: OTHER } }])(
    'is null without a snowflake user id (%j)',
    (m) => expect(avatarUrl(m, GUILD)).toBe(null),
  )
})

describe('companiesInName', () => {
  it.each([
    ['Brother Pate, 2nd Co.', [2]],
    ['Brother Bread, 3rd Company', [3]],
    ['BB Orrin Vael | 6th Co CoF', [6]],
    ['Brother Gilgamesh 7th Co.', [7]],
    ['Sgt. Foo 1st/4th', [1, 4]],
    ['4th 1st 4th', [1, 4]],
    ['3RD CO', [3]],
    ['No tag here', []],
    ['8th Co.', []],
    ['0th Co.', []],
    ['11th Co.', []],
    ['13rd', []],
    ['3rdly', []],
    ['x3rd', []],
    ['３ｒｄ', []],
    ['', []],
  ])('%j → %j', (name, expected) => expect(companiesInName(name)).toEqual(expected))

  it('survives a non-string', () => {
    expect(companiesInName(undefined)).toEqual([])
    expect(companiesInName(null)).toEqual([])
  })

  it('always returns distinct ascending numbers from 1 to 7, whatever the text', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = companiesInName(s)
        expect(out).toEqual([...new Set(out)].sort((a, b) => a - b))
        for (const n of out) expect(n >= 1 && n <= 7).toBe(true)
      }),
    )
  })
})

describe('isServitorName', () => {
  it.each([
    'Smith-Servitor',
    'Kestrel Viewing Servitor',
    'Garrow’s Servo Skull',
    'holt’s servo skull',
    'SERVO-SKULL',
    'servoskull',
    'The Servitors',
    '(servitor)',
    'servo-skulls',
  ])('matches %j', (n) => expect(isServitorName(n)).toBe(true))

  it.each(['Servitorial', 'Observo-Skulls', 'Preservitor', 'servo', 'skull', 'Servo Skullcap', 'Servitor2', 'Brother Tester', '', 'ervitor'])(
    'does not match %j',
    (n) => expect(isServitorName(n)).toBe(false),
  )

  it('never throws', () => {
    fc.assert(fc.property(fc.string(), (s) => typeof isServitorName(s) === 'boolean'))
  })
})

describe('memberFacts', () => {
  const raw = (over = {}) => ({ nick: 'Brother Tester', roles: ['1', '2'], user: { id: UID, username: 'tester', global_name: null }, ...over })

  it.each([null, undefined, 5, 'x', [], {}, { user: {} }, { user: { id: 5 } }, { user: { id: '123' } }, { user: { id: `${UID}0000` } }])(
    'is null without a snowflake user id (%j)',
    (m) => expect(memberFacts(m, GUILD)).toBe(null),
  )

  it('is null when the id is a single-element array that stringifies to a snowflake', () => {
    expect(memberFacts({ roles: [], user: { id: [UID] } }, GUILD)).toBe(null)
  })

  it('reads id, name, avatar, bot, roles and when they joined', () => {
    const f = memberFacts(raw({ avatar: HASH, joined_at: '2025-03-04T05:06:07.000000+00:00', user: { id: UID, username: 't', bot: true } }), GUILD)
    expect(f).toEqual({
      id: UID,
      name: 'Brother Tester',
      avatar: `https://cdn.discordapp.com/guilds/${GUILD}/users/${UID}/avatars/${HASH}.png?size=64`,
      bot: true,
      roles: new Set(['1', '2']),
      joinedAt: '2025-03-04T05:06:07.000000+00:00',
    })
  })

  it('has no join date unless Discord gave one as a string', () => {
    for (const joined_at of [undefined, null, 1735689600000, {}, ['2025-01-01']]) expect(memberFacts(raw({ joined_at }), GUILD).joinedAt).toBe(null)
  })

  it('is a bot only when the flag is exactly true', () => {
    for (const bot of ['true', 1, {}, null, undefined, false]) expect(memberFacts(raw({ user: { id: UID, bot } }), GUILD).bot).toBe(false)
  })

  it('keeps only string roles, and tolerates missing or non-array roles', () => {
    expect([...memberFacts(raw({ roles: ['1', 2, null, {}, '3'] }), GUILD).roles]).toEqual(['1', '3'])
    for (const roles of [undefined, null, 'x', 5, {}]) expect(memberFacts(raw({ roles }), GUILD).roles.size).toBe(0)
  })

  it('names an unnameable member "Unnamed Member"', () => {
    expect(memberFacts({ roles: [], user: { id: UID } }, GUILD).name).toBe(UNNAMED)
    expect(UNNAMED).toBe('Unnamed Member')
  })

  it('never throws on arbitrary input', () => {
    fc.assert(fc.property(fc.anything(), (x) => {
      const f = memberFacts(x, GUILD)
      return f === null || (typeof f.id === 'string' && f.roles instanceof Set)
    }))
  })
})
