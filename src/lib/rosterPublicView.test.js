import { describe, it, expect } from 'vitest'
import fixture from '../data/roster.fixture.json'
import { publicRoster } from '../../server/src/rosterPublic.js'
import { buildRosterView, heatAt } from './rosterView'
import { buildPublicView } from './rosterPublicView'

const snapOf = (roster = fixture.roster) => ({ fetchedAt: roster.fetchedAt, stale: roster.stale, ...publicRoster(roster) })
const rank = (key, tier = 1, extra = {}) => ({ key, label: key.toUpperCase(), tier, ...extra })
const branch = (key, over = {}) => ({
  key,
  kind: 'company',
  label: key,
  number: 3,
  head: { rank: rank('captain'), vacant: false, members: [{ name: 'Cap A' }] },
  aside: 0,
  rows: [],
  ...over,
})
const hand = (branches, highCommand = []) => ({ fetchedAt: 'f', stale: false, highCommand, branches })

describe('buildPublicView: against the full synthetic fixture', () => {
  const pub = buildPublicView(snapOf())
  const mem = buildRosterView(fixture.roster)

  it('has the same branches in the same order, with the same sigils', () => {
    expect(pub.branches.map((b) => b.key)).toEqual(mem.branches.map((b) => b.key))
    expect(pub.branches.map((b) => b.sigil)).toEqual(mem.branches.map((b) => b.sigil))
  })

  it('agrees with the member view on count, openable, head and vacancy for every branch', () => {
    pub.branches.forEach((b, i) => {
      const m = mem.branches[i]
      expect(b.count, b.key).toBe(m.count)
      expect(b.openable, b.key).toBe(m.openable)
      expect(b.head.vacant, b.key).toBe(m.head.vacant)
      expect(b.head.more, b.key).toBe(m.head.more)
      expect(b.head.rank, b.key).toEqual(m.head.rank)
      expect(b.head.shown.map((x) => x.name), b.key).toEqual(m.head.shown.map((x) => x.name))
    })
    expect(pub.openableKeys).toEqual(mem.openableKeys.filter((k) => k !== 'unassigned'))
  })

  it('agrees with the member view on the High Command banner', () => {
    expect(pub.banner.hero.rank).toEqual(mem.banner.hero.rank)
    expect(pub.banner.hero.member.name).toBe(mem.banner.hero.member.name)
    expect(pub.banner.court.map((r) => [r.rank.key, r.members.map((m) => m.name)])).toEqual(
      mem.banner.court.map((r) => [r.rank.key, r.members.map((m) => m.name)]),
    )
  })

  it('gives every named person a local key that is not a Discord id, unique across the page', () => {
    const people = [
      pub.banner.hero.member,
      ...pub.banner.court.flatMap((r) => r.members),
      ...pub.branches.flatMap((b) => [...b.head.members, ...(b.extraHeads?.members ?? [])]),
    ]
    const ids = people.map((p) => p.id)
    expect(ids.every((id) => id.startsWith('pub-') && !/\d{17,20}/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('passes fetchedAt and stale through', () => {
    expect(pub.fetchedAt).toBe(fixture.roster.fetchedAt)
    expect(pub.stale).toBe(false)
    expect(buildPublicView({ ...snapOf(), stale: true }).stale).toBe(true)
  })
})

describe('buildPublicView: the cases the fixture does not pin', () => {
  it('names every head holder; the bar shows two and the rest are the extra heads', () => {
    const view = buildPublicView(hand([
      branch('venerable-dreadnoughts', { kind: 'dreadnoughts', number: undefined, head: { rank: rank('venerable-dreadnought'), vacant: false, members: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] } }),
    ]))
    const b = view.branches[0]
    expect(b.head.shown.map((m) => m.name)).toEqual(['A', 'B'])
    expect(b.head.more).toBe(2)
    expect(b.extraHeads.rank.key).toBe('venerable-dreadnought')
    expect(b.extraHeads.members.map((m) => m.name)).toEqual(['C', 'D'])
    expect(b.openable).toBe(true) // nothing else to show, but the extra heads are reachable
    expect(b.shape).toEqual([])
    expect(b.count).toBe(4)
  })

  it('has no extra heads for two or fewer, and an unopenable branch with nothing below the head', () => {
    const b = buildPublicView(hand([branch('company-1', { head: { rank: rank('captain'), vacant: false, members: [{ name: 'A' }, { name: 'B' }] } })])).branches[0]
    expect(b.extraHeads).toBeNull()
    expect(b.openable).toBe(false)
    expect(b.head.more).toBe(0)
  })

  it('keeps a vacant head and an acting head distinct, and counts a vacant branch as nobody', () => {
    const view = buildPublicView(hand([
      branch('company-6', { head: { rank: rank('captain'), vacant: true, members: [] } }),
      branch('company-2', { head: { rank: rank('captain'), vacant: false, members: [{ name: 'Acting One', acting: true }] } }),
    ]))
    const [vacant, acting] = view.branches
    expect(vacant.head.vacant).toBe(true)
    expect(vacant.count).toBe(0)
    expect(acting.head.vacant).toBe(false)
    expect(acting.head.members[0]).toMatchObject({ name: 'Acting One', acting: true })
  })

  it('turns rows and aside into counted shape rows, in ladder order, with heat and no names', () => {
    const b = buildPublicView(hand([
      branch('company-3', { aside: 2, rows: [{ rank: rank('sergeant', 3), count: 6 }, { rank: rank('terminator', 4, { lateral: true }), count: 1 }, { rank: rank('scout', 7), count: 12 }] }),
    ])).branches[0]
    expect(b.shape.map((s) => [s.label, s.count])).toEqual([['Honoured Dreadnoughts', 2], ['SERGEANT', 6], ['TERMINATOR', 1], ['SCOUT', 12]])
    expect(b.shape[0].aside).toBe(true)
    expect(b.shape[2].lateral).toBe(true)
    expect(b.shape.map((s) => s.s)).toEqual([0, 1, 2, 3])
    for (const s of b.shape) expect('members' in s).toBe(false)
    // Two steps (Sergeant, Scout) share the ramp at 1/2 and 2/2; the aside sits half a step above the first,
    // the lateral Terminator half a step below the Sergeant. hp and hn are the spine to the row and on from it.
    const at = (h, hp, hn) => ({ h: heatAt(h), hp: heatAt(hp), hn: heatAt(hn) })
    expect(b.shape.map((s) => s.heat)).toEqual([at(0.25, 0, 0.5), at(0.5, 0, 1), at(0.75, 0.5, 1), at(1, 0.5, 1)])
    expect(b.count).toBe(1 + 2 + 6 + 1 + 12)
    expect(b.openable).toBe(true)
  })

  it('grades a lone step, and a ladder of three, along the same ramp', () => {
    const at = (h, hp, hn) => ({ h: heatAt(h), hp: heatAt(hp), hn: heatAt(hn) })
    const heats = (rows, aside = 0) => buildPublicView(hand([branch('company-3', { aside, rows })])).branches[0].shape.map((s) => s.heat)
    expect(heats([{ rank: rank('scout', 7), count: 3 }])).toEqual([at(1, 0, 1)])
    expect(heats([], 2)).toEqual([at(0.5, 0, 1)]) // nothing but the aside: half of a single step
    expect(heats([3, 5, 7].map((t) => ({ rank: rank(`r${t}`, t), count: 1 })))).toEqual([at(1 / 3, 0, 2 / 3), at(2 / 3, 1 / 3, 1), at(1, 2 / 3, 1)])
  })

  it('passes a head or High Command rank on by its known fields only, so nothing a later server adds rides along', () => {
    const extra = { key: 'captain', label: 'Captain', tier: 1, roleId: '900000000000000099', note: 'internal' }
    const view = buildPublicView(hand(
      [branch('venerable-dreadnoughts', { head: { rank: extra, vacant: false, members: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] } })],
      [{ rank: extra, members: [{ name: 'M1' }, { name: 'M2' }] }, { rank: { ...extra, key: 'pyre-guard' }, members: [{ name: 'P1' }] }],
    ))
    const known = { key: 'captain', label: 'Captain', tier: 1 }
    const b = view.branches[0]
    expect(b.head.rank).toStrictEqual(known)
    expect(b.extraHeads.rank).toStrictEqual(known)
    expect(view.banner.hero.rank).toStrictEqual(known)
    expect(view.banner.court.map((r) => r.rank)).toStrictEqual([known, { ...known, key: 'pyre-guard' }])
  })

  it('keeps a company number and gives other branches null', () => {
    const view = buildPublicView(hand([branch('company-3'), branch('forge', { kind: 'specialty', number: undefined })]))
    expect(view.branches[0].number).toBe(3)
    expect(view.branches[1].number).toBeNull()
    expect(view.branches[1].sigil).toBe('M')
    expect(buildPublicView(hand([branch('mystery')])).branches[0].sigil).toBe('')
  })

  it('builds the banner from the first held High Command rank, and an empty one from nothing', () => {
    const view = buildPublicView(hand([], [
      { rank: rank('chapter-master', 1), members: [{ name: 'M1' }, { name: 'M2' }] },
      { rank: rank('empty-rank', 2), members: [] },
      { rank: rank('pyre-guard', 3), members: [{ name: 'P1' }] },
    ]))
    expect(view.banner.hero.member.name).toBe('M1')
    expect(view.banner.court.map((r) => [r.rank.key, r.members.map((m) => m.name)])).toEqual([['chapter-master', ['M2']], ['pyre-guard', ['P1']]])
    expect(buildPublicView(hand([])).banner).toEqual({ hero: null, court: [] })
    expect(buildPublicView(hand([], [{ rank: rank('chapter-master'), members: [{ name: 'Only' }] }])).banner.court).toEqual([])
  })

  it('keeps a name as text and does not touch its input', () => {
    const input = hand([branch('company-3', { head: { rank: rank('captain'), vacant: false, members: [{ name: '<b>x</b>' }] } })])
    const before = structuredClone(input)
    expect(buildPublicView(input).branches[0].head.members[0].name).toBe('<b>x</b>')
    expect(input).toEqual(before)
  })
})
