import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { departed, joinedBefore, rejoinedSince, searchMembers } from './deathwatchPeople.js'

// Invented ids and names only.
const id = (n) => String(300000000000000000n + BigInt(n))
const person = (n, name, over = {}) => ({ id: id(n), name, avatar: null, joinedAt: '2025-01-01T00:00:00.000Z', ...over })

const EARLY = '2025-01-01T00:00:00.000Z'
const LATE = '2026-01-01T00:00:00.000Z'
// Anything that is not a Date or a parseable date string. new Date(null) is the epoch, so null must never count.
const UNPARSEABLE = [null, undefined, '', 'garbage', 0, 1735689600000, NaN, {}, [], true, new Date('nope')]

describe('joinedBefore and rejoinedSince', () => {
  it('a member who joined before the access was given still counts', () => {
    expect(joinedBefore(EARLY, LATE)).toBe(true)
    expect(rejoinedSince(EARLY, LATE)).toBe(false)
  })

  it('joining after, or at the same instant, is a rejoin', () => {
    expect(joinedBefore(LATE, EARLY)).toBe(false)
    expect(rejoinedSince(LATE, EARLY)).toBe(true)
    expect(joinedBefore(LATE, LATE)).toBe(false)
    expect(rejoinedSince(LATE, LATE)).toBe(true)
  })

  it('takes a Date as well as a string, as Postgres hands granted_at back', () => {
    expect(joinedBefore(EARLY, new Date(LATE))).toBe(true)
    expect(rejoinedSince(LATE, new Date(EARLY))).toBe(true)
    expect(joinedBefore(new Date(EARLY), new Date(LATE))).toBe(true)
  })

  it('one millisecond either side of the instant decides it', () => {
    const t = Date.parse(LATE)
    expect(joinedBefore(new Date(t - 1).toISOString(), LATE)).toBe(true)
    expect(rejoinedSince(new Date(t - 1).toISOString(), LATE)).toBe(false)
    expect(joinedBefore(new Date(t + 1).toISOString(), LATE)).toBe(false)
    expect(rejoinedSince(new Date(t + 1).toISOString(), LATE)).toBe(true)
  })

  it.each(UNPARSEABLE)('neither holds when a side is unparseable (%j)', (bad) => {
    expect(joinedBefore(bad, LATE)).toBe(false)
    expect(rejoinedSince(bad, LATE)).toBe(false)
    expect(joinedBefore(EARLY, bad)).toBe(false)
    expect(rejoinedSince(EARLY, bad)).toBe(false)
  })

  it('for any two real instants exactly one holds', () => {
    const when = fc.date({ min: new Date('2015-01-01'), max: new Date('2035-01-01'), noInvalidDate: true })
    fc.assert(
      fc.property(when, when, fc.boolean(), (j, g, asString) => {
        const jv = asString ? j.toISOString() : j
        return joinedBefore(jv, g) !== rejoinedSince(jv, g) && joinedBefore(jv, g) === j.getTime() < g.getTime()
      }),
    )
  })
})

describe('searchMembers', () => {
  const PEOPLE = [person(1, 'Brother Kael'), person(2, 'Brother Avar'), person(3, 'Varro'), person(4, 'Valen'), person(5, 'vasquez')]

  it('a pasted id finds exactly that member, even when another name holds those digits', () => {
    const odd = person(9, `Tag ${id(3)}`)
    expect(searchMembers([...PEOPLE, odd], id(3))).toEqual([{ id: id(3), name: 'Varro', avatar: null }])
    expect(searchMembers(PEOPLE, `  ${id(4)}  `)).toEqual([{ id: id(4), name: 'Valen', avatar: null }])
    expect(searchMembers(PEOPLE, id(77))).toEqual([])
  })

  it('needs two characters for a name', () => {
    for (const q of ['', ' ', 'v', ' v ', '\t']) expect(searchMembers(PEOPLE, q)).toEqual([])
  })

  it('answers nothing for a query or a list that is not what it should be', () => {
    for (const q of [null, undefined, 42, {}, ['va']]) expect(searchMembers(PEOPLE, q)).toEqual([])
    for (const list of [null, undefined, 'va', {}]) expect(searchMembers(list, 'va')).toEqual([])
    expect(searchMembers([null, 7, { id: id(8) }, person(6, 'Vault')], 'va')).toEqual([{ id: id(6), name: 'Vault', avatar: null }])
  })

  it('matches anywhere in the name, ignoring case, prefix matches first and then by name', () => {
    const names = (q) => searchMembers(PEOPLE, q).map((m) => m.name)
    expect(names('va')).toEqual(['Valen', 'Varro', 'vasquez', 'Brother Avar'])
    expect(names('VA')).toEqual(names('va'))
    expect(names('  va ')).toEqual(names('va'))
    expect(names('brother')).toEqual(['Brother Avar', 'Brother Kael'])
  })

  it('keeps members with one name side by side in the roster\'s order, told apart by id', () => {
    const twins = [person(11, 'Brother Ostar'), person(10, 'Brother Ostar')]
    expect(searchMembers(twins, 'ostar').map((m) => m.id)).toEqual([id(11), id(10)])
    const three = [person(12, 'Brother Ostar'), person(1, 'Brother Ostarion'), person(10, 'Brother Ostar')]
    expect(searchMembers(three, 'ostar').map((m) => m.id)).toEqual([id(12), id(10), id(1)])
  })

  it('stops at ten, or at the limit given', () => {
    const many = Array.from({ length: 15 }, (_, i) => person(100 + i, `Brother ${String(i).padStart(2, '0')}`))
    expect(searchMembers(many, 'brother')).toHaveLength(10)
    expect(searchMembers(many, 'brother').at(-1).name).toBe('Brother 09')
    expect(searchMembers(many, 'brother', 3)).toHaveLength(3)
  })

  it('hands back id, name and avatar only', () => {
    const [m] = searchMembers([person(1, 'Valen', { avatar: 'https://cdn.discordapp.com/x.png', roles: new Set(['2']) })], 'val')
    expect(Object.keys(m).sort()).toEqual(['avatar', 'id', 'name'])
  })

  it('every answer is a member whose name holds the query, and no more than the limit', () => {
    const name = fc.string({ minLength: 1, maxLength: 12 })
    fc.assert(
      fc.property(fc.array(name, { maxLength: 30 }), fc.string({ maxLength: 4 }), fc.integer({ min: 1, max: 12 }), (ns, q, limit) => {
        const list = ns.map((n, i) => person(i, n))
        const out = searchMembers(list, q, limit)
        const t = q.trim().toLowerCase()
        if (out.length > limit) return false
        if (t.length < 2 && out.length) return false
        if (!out.every((m) => list.some((p) => p.id === m.id) && m.name.toLowerCase().includes(t))) return false
        // Prefix matches never follow one that is not.
        const prefix = out.map((m) => m.name.toLowerCase().startsWith(t))
        return prefix.every((p, i) => !p || prefix.slice(0, i).every(Boolean))
      }),
    )
  })
})

describe('departed', () => {
  const row = (n, grantedAt = new Date(LATE)) => ({ discordId: id(n), grantedAt })
  const byId = (...people) => new Map(people.map((p) => [p.id, p]))

  it('someone the roster no longer has has left', () => {
    expect(departed(row(1), byId(person(2, 'Other')))).toBe(true)
  })

  it('someone still there since before the access was given has not', () => {
    expect(departed(row(1), byId(person(1, 'Kael', { joinedAt: EARLY })))).toBe(false)
  })

  it('someone who joined again since has left, for this access', () => {
    expect(departed(row(1, new Date(EARLY)), byId(person(1, 'Kael', { joinedAt: LATE })))).toBe(true)
  })

  it('an unknown join date proves nothing either way', () => {
    expect(departed(row(1), byId(person(1, 'Kael', { joinedAt: null })))).toBe(false)
  })
})
