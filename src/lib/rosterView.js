/**
 * The roster page's view model: one pass over a snapshot from GET /roster,
 * returning exactly what the templates render (ladders already grouped, heat
 * already graded, counts and the find-me index already built). Pure: no DOM,
 * no clock, and the input is never mutated, so it can run once per snapshot
 * and be cached by the store.
 */

// The rank heat ramp, hot (top of a branch) to cold (the foot of it).
export const HEAT_STOPS = [
  [0, [242, 210, 122]],
  [0.4, [255, 106, 43]],
  [0.72, [224, 67, 29]],
  [1, [58, 82, 70]],
]

/** 'rgb(r,g,b)' for a position t along the heat ramp; t is clamped to [0, 1]. */
export function heatAt(t) {
  const x = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [t1, to] = HEAT_STOPS[i]
    if (x <= t1) {
      const [t0, from] = HEAT_STOPS[i - 1]
      const k = (x - t0) / (t1 - t0)
      return `rgb(${from.map((v, j) => Math.round(v + (to[j] - v) * k)).join(',')})`
    }
  }
  return heatAt(1)
}

/**
 * The heat colours of a ladder item, `order` steps down a ladder of `n`: `h` for its node, `hp` and `hn` for the
 * spine running to it and on from it. Step i of n sits at i/n along the ramp; an item between steps (Dreadnoughts
 * aside, a lateral rank) sits half a step below step `order`. heatAt clamps, so the foot of the spine stays cold.
 */
export function heatOf(order, n, between = false) {
  return between
    ? { h: heatAt((order + 0.5) / n), hp: heatAt(order / n), hn: heatAt((order + 1) / n) }
    : { h: heatAt(order / n), hp: heatAt((order - 1) / n), hn: heatAt((order + 1) / n) }
}

// The same text sigils the Companies page uses (the Forge is its "Armoury", M).
// Kept as a constant, not an import of companies.json: that file is large prose.
// rosterView.test.js checks the shared ones against it.
export const SIGILS = {
  'company-1': 'I', 'company-2': 'II', 'company-3': 'III', 'company-4': 'IV',
  'company-5': 'V', 'company-6': 'VI', 'company-7': 'VII',
  'venerable-dreadnoughts': 'VD',
  forge: 'M', librarius: 'L', apothecarion: 'A', reclusiam: 'R',
}
export const UNASSIGNED_SIGIL = '?'

/** Whether a chip shows its company tag: only when it says something the branch does not already. */
export function showCompanyTag(member, branch) {
  return Boolean(member.company) && (!branch || branch.kind !== 'company' || member.company !== branch.number)
}

/**
 * A branch's ranks as ladder items. Same-tier ranks sit in one group (peers),
 * a lateral rank (Terminator) is its own item beside the spine, and Dreadnought
 * "aside" members follow any `lead` row (see branchOf). Each item carries its position `s` and the heat colours
 * for its node and the spine segment that runs from it: group i of n sits at
 * i/n along the ramp; the others sit between the groups they fall between.
 */
function ladderOf(rows, aside, lead = null) {
  const raw = []
  if (lead) raw.push({ type: 'group', tier: lead.rank.tier, rows: [lead], lead: true })
  if (aside?.length) raw.push({ type: 'aside', members: aside })
  for (const row of rows) {
    const prev = raw[raw.length - 1]
    if (row.rank.lateral) raw.push({ type: 'lateral', row })
    else if (prev?.type === 'group' && !prev.lead && prev.tier === row.rank.tier) prev.rows.push(row)
    else raw.push({ type: 'group', tier: row.rank.tier, rows: [row] })
  }
  const n = Math.max(1, raw.filter((i) => i.type === 'group').length)
  let order = 0
  return raw.map((item, s) => {
    if (item.type === 'group') {
      order++
      return { type: 'group', s, tier: item.tier, rows: item.rows, last: s === raw.length - 1, heat: heatOf(order, n) }
    }
    const heat = heatOf(order, n, true)
    return item.type === 'aside' ? { type: 'aside', s, heat, members: item.members } : { type: 'lateral', s, heat, row: item.row }
  })
}

const countOf = (rows) => rows.reduce((n, r) => n + r.members.length, 0)

function branchOf(b) {
  const aside = b.aside ?? []
  const members = b.head.members
  // The bar shows two head members; the rest become the first row of the opened ladder, so
  // nobody is left off the page (Venerable Dreadnoughts can have many holders).
  const lead = !b.head.vacant && members.length > 2 ? { rank: b.head.rank, members: members.slice(2) } : null
  const ladder = ladderOf(b.rows, aside, lead)
  return {
    key: b.key, kind: b.kind, label: b.label, number: b.number ?? null,
    sigil: SIGILS[b.key] ?? '',
    count: (b.head.vacant ? 0 : members.length) + aside.length + countOf(b.rows),
    openable: ladder.length > 0,
    head: { rank: b.head.rank, vacant: Boolean(b.head.vacant), members, shown: members.slice(0, 2), more: Math.max(0, members.length - 2) },
    ladder,
  }
}

/** → the RosterView the roster page renders. See docs/superpowers/plans/2026-10-13-roster-design-pass.md, Task 4. */
export function buildRosterView(roster) {
  const ids = new Set()
  const index = new Map()
  const note = (member, key) => {
    ids.add(member.id)
    if (!index.has(member.id)) index.set(member.id, key)
  }

  const vacant = []
  const acting = []
  const mismatch = []
  const branches = roster.branches.map((b) => {
    const view = branchOf(b)
    const people = [...(b.head.vacant ? [] : b.head.members), ...(b.aside ?? []), ...b.rows.flatMap((r) => r.members)]
    people.forEach((m) => note(m, b.key))
    if (b.head.vacant) vacant.push(b.key)
    if (b.head.members.some((m) => m.acting)) acting.push(b.key)
    if (people.some((m) => m.nameMismatch)) mismatch.push(b.key)
    return view
  })

  const unassignedRows = roster.unassigned?.rows ?? []
  let unassigned = null
  if (unassignedRows.length) {
    unassignedRows.forEach((r) => r.members.forEach((m) => note(m, 'unassigned')))
    if (unassignedRows.some((r) => r.members.some((m) => m.nameMismatch))) mismatch.push('unassigned')
    unassigned = { key: 'unassigned', label: 'Unassigned', sigil: UNASSIGNED_SIGIL, count: countOf(unassignedRows), openable: true, ladder: ladderOf(unassignedRows, []) }
  }

  const held = roster.highCommand.filter((r) => r.members.length)
  held.forEach((r) => r.members.forEach((m) => note(m, 'high-command')))
  const [first, ...rest] = held
  const banner = first
    ? {
        hero: { rank: first.rank, member: first.members[0] },
        court: [...(first.members.length > 1 ? [{ rank: first.rank, members: first.members.slice(1) }] : []), ...rest],
      }
    : { hero: null, court: [] }

  return {
    banner,
    branches,
    unassigned,
    servitors: roster.servitors ?? [],
    summary: { total: ids.size, vacant, acting, mismatch },
    index,
    openableKeys: [...branches.filter((b) => b.openable).map((b) => b.key), ...(unassigned ? ['unassigned'] : [])],
  }
}
