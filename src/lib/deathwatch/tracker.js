// The Event Tracker's arithmetic, ported from the old Watch Fortress site (calc and its helpers in app.js).
// Pure, so every view and the Manage pages share one source and it can be tested without a page.
//
// Data shapes (the server stores them as they were): a team is { id, n (name), co (company), ro (roster names),
// ki (KIA names), kw (name → KIA week), m (missions) }. A mission is
// [week, objective, played, inGameScore, geneSeed, armouryData, relics, extRank ('A' | 'B' | ''), rows], a row is
// [name, class, foundSeed, kills, special, melee, ranged, items, dmgTaken, incaps, revives].

/** Default weights; the event's own (cfg.s, or an archive's sc) override them. mk is a divisor, the rest factors. */
export const WEIGHTS = { base: 500, inc: 75, rev: 25, gs: 200, ar: 25, rl: 50, A: 100, B: 80, mk: 10, ms: 2, mr: 10, mi: 10, mp: 2 }
export const WEIGHT_LABELS = [
  ['base', 'Base points'],
  ['inc', 'Incap penalty'],
  ['rev', 'Revive bonus'],
  ['gs', 'Gene-Seed bonus'],
  ['ar', 'Armoury Data bonus'],
  ['rl', 'Guardian Relic bonus'],
  ['A', 'Extermination Rank A'],
  ['B', 'Extermination Rank B'],
  ['mk', 'MVP kills divisor'],
  ['ms', 'MVP special ×'],
  ['mr', 'MVP revives ×'],
  ['mi', 'MVP incap penalty ×'],
  ['mp', 'MVP points per objective'],
]
export const CLASSES = ['Tactical', 'Assault', 'Vanguard', 'Bulwark', 'Sniper', 'Heavy', 'Techmarine', 'Apothecary']
export const COMPANIES = ['Primus', 'Secundus', 'Tertius', 'Quartus', 'Quintus']
/** Gene-Seed and Guardian Relics share three carry slots. */
export const SLOTS = 3
export const DEFAULT_EVENT_NAME = 'Deathwatch Tour'

// Class hierarchy rank; an unknown class or none sorts last.
export const classRank = (c) => (CLASSES.includes(c) ? CLASSES.indexOf(c) : 99)
export const sum = (rows, i) => (rows ?? []).reduce((a, r) => a + (+r[i] || 0), 0)
const isPlayed = (m) => m[2] && m[0] >= 1 && m[0] <= 4

/** A deep copy. JSON, not structuredClone: the documents are plain JSON, and a store proxy cannot be structured-cloned. */
export const clone = (x) => JSON.parse(JSON.stringify(x))

export const weightsOf = (custom) => ({ ...WEIGHTS, ...custom })

/** Event points for one played mission. */
export const missionPoints = (m, S) =>
  S.base + m[4] * S.gs + m[5] * S.ar + m[6] * S.rl + (S[m[7]] || 0) + sum(m[8], 10) * S.rev - sum(m[8], 9) * S.inc

/** One player's MVP score for one objective. */
export const rowMvp = (r, S) => r[3] / S.mk + r[4] * S.ms + r[10] * S.mr - r[9] * S.mi + S.mp

/**
 * Everything the views show for one event: `teams` is the teams collection (id → team), `custom` its weights.
 * → { ts (ranked teams with wk, tot, avg, pl, prev, r, mv, gap and award counters), pl (players ranked by MVP),
 *     C (per-class counts), none (rows without a class), home (name → home team id), ME (every played mission),
 *     CK (data checks), names, kia (name → KIA week) }.
 */
export function calc(teams, custom) {
  const S = weightsOf(custom)
  const src = Object.values(teams ?? {})
  // Keyed by names and classes from the data, so without a prototype (here, in P, and in each p.c and t.cc): a
  // player named "constructor" or "__proto__" must find nothing there until counted, not a built-in.
  const home = Object.create(null)
  for (const t of src) for (const p of t.ro ?? []) home[p] = t.id
  const ME = []
  const CK = { nd: [], sg: 0 }
  const dupes = {}
  const P = Object.create(null)
  const C = Object.fromEntries(CLASSES.map((c) => [c, { n: 0, k: 0, kn: 0, i: 0 }]))
  let none = 0
  let cur = 1
  const ts = src
    .map((t) => ({ ...t, ro: t.ro ?? [], m: t.m ?? [], wk: [0, 0, 0, 0], pl: 0, sg: 0, sa: 0, sr: 0, sx: 0, cl: 0, cc: Object.create(null) }))
    .sort((a, b) => a.id - b.id)
  for (const t of ts) {
    for (const m of t.m) {
      if (!isPlayed(m)) continue
      const [w, o, , , gs, ar, rl, rk, rows = []] = m
      t.pl++
      cur = Math.max(cur, w)
      const ev = missionPoints(m, S)
      const ks = sum(rows, 3)
      const ic = sum(rows, 9)
      const found = sum(rows, 2)
      t.wk[w - 1] += ev
      t.sg += gs
      t.sa += ar
      t.sr += rl
      if (rk === 'A') t.sx++
      if (ks > 0 && !ic) t.cl++
      ME.push({ team: t.n, pts: ev, kills: ks, w, o })
      if (gs > found) CK.sg += gs - found
      if (!ks) CK.nd.push(`${t.n} W${w} O${o}`)
      else (dupes[[w, o, ks, sum(rows, 5), sum(rows, 6)].join()] ??= []).push(t.n)
      for (const r of rows) {
        if (!r[0]) continue
        const p = (P[r[0]] ??= { n: r[0], t: home[r[0]], o: 0, k: 0, s: 0, me: 0, ra: 0, it: 0, i: 0, v: 0, g: 0, c: Object.create(null) })
        const g = +r[2] || 0
        if (r[1]) {
          p.c[r[1]] = (p.c[r[1]] || 0) + 1
          t.cc[r[1]] = (t.cc[r[1]] || 0) + 1
        }
        // MVP counts a player's home Kill Team only; a guest's objectives help the team, not the player.
        if (home[r[0]] === t.id) {
          p.o++
          p.k += r[3]
          p.s += r[4]
          p.me += r[5]
          p.ra += r[6]
          p.it += r[7]
          p.i += r[9]
          p.v += r[10]
          p.g += g
        }
        const c = Object.hasOwn(C, r[1]) ? C[r[1]] : null
        if (c) {
          c.n++
          c.i += r[9] // every entry's incaps, for the class's K/D
          if (r[3] > 0) {
            c.kn++
            c.k += r[3]
          }
        } else none++
      }
    }
    t.tot = t.wk.reduce((a, b) => a + b, 0)
    t.avg = t.pl ? t.tot / t.pl : 0
  }
  for (const t of ts) t.prev = t.wk.slice(0, cur - 1).reduce((a, b) => a + b, 0)
  // Equal points share a rank and the next team takes the place after them, as in progression().
  const rank = (t, k) => 1 + ts.filter((x) => x[k] > t[k]).length
  const top = Math.max(0, ...ts.map((t) => t.tot))
  for (const t of ts) {
    t.r = rank(t, 'tot')
    // Before a second week there is no earlier ranking to move from.
    t.mv = cur > 1 ? rank(t, 'prev') - t.r : 0
    t.gap = top - t.tot
  }
  const pl = Object.values(P)
    .filter((p) => p.o > 0)
    .map((p) => ({ ...p, mvp: p.k / p.o / S.mk + (p.s / p.o) * S.ms + (p.v / p.o) * S.mr - (p.i / p.o) * S.mi + p.o * S.mp }))
    .sort((a, b) => b.mvp - a.mvp)
  CK.du = Object.values(dupes).filter((a) => a.length > 1)
  CK.slots = ts.flatMap((t) => t.m.filter((m) => (+m[4] || 0) + (+m[6] || 0) > SLOTS).map((m) => `${t.n} W${m[0]} O${m[1]}`))
  const kia = new Map(src.flatMap((t) => (t.ki ?? []).filter((n) => (t.ro ?? []).includes(n)).map((n) => [n, +(t.kw ?? {})[n] || 0])))
  return {
    S,
    ts: ts.sort((a, b) => a.r - b.r),
    pl,
    C,
    none,
    home,
    ME,
    CK,
    names: [...new Set([...Object.keys(home), ...Object.keys(P)])],
    kia,
  }
}

/** "KIA" or "KIA W2" for a fallen player, else ''. */
export const kiaLabel = (R, n) => (R.kia.has(n) ? `KIA${R.kia.get(n) ? ` W${R.kia.get(n)}` : ''}` : '')

/** A team's played missions summed, in GAME_STATS order. */
export const GAME_STATS = [
  'Missions played',
  'Kills',
  'Special Kills',
  'Melee Damage',
  'Ranged Damage',
  'Items Found',
  'Damage Taken',
  'Incapacitations',
  'Revives',
  'In-Game Score',
  'Gene-Seed',
  'Armoury Data',
  'Guardian Relics',
  'Clean Missions',
  'Extermination Rank A',
  'Extermination Rank B',
]
export function teamStats(t) {
  const a = GAME_STATS.map(() => 0)
  for (const m of t.m ?? []) {
    if (!isPlayed(m)) continue
    const r = m[8] ?? []
    a[0]++
    for (let i = 3; i <= 10; i++) a[i - 2] += sum(r, i)
    a[9] += +m[3] || 0
    a[10] += +m[4] || 0
    a[11] += +m[5] || 0
    a[12] += +m[6] || 0
    if (sum(r, 3) > 0 && !sum(r, 9)) a[13]++
    if (m[7] === 'A') a[14]++
    if (m[7] === 'B') a[15]++
  }
  return a
}

// The best value of `key` and everyone who holds it, or null when nobody scored.
const leaders = (list, key) => {
  const m = Math.max(...list.map((x) => x[key]))
  return list.length && m > 0 ? { value: m, who: list.filter((x) => x[key] === m) } : null
}

export const PLAYER_AWARDS = [
  ['MVP', 'mvp', 'MVP'],
  ['Executioner · most kills', 'k', 'Executioner'],
  ['Terminator · most special kills', 's', 'Terminator'],
  ['Blade Master · melee damage', 'me', 'Blade Master'],
  ['Marksman · ranged damage', 'ra', 'Marksman'],
  ['Scavenger · most items', 'it', 'Scavenger'],
  ['Guardian Angel · most revives', 'v', 'Guardian Angel'],
  ['Gene-Seed Hunter · seeds found', 'g', 'Gene-Seed Hunter'],
]
const TEAM_AWARDS = [
  ['Best Average', 'avg'],
  ['Clean Sweep', 'cl'],
  ['Armoury Master', 'sa'],
  ['Gene-Seed Collector', 'sg'],
  ['Relic Hunter', 'sr'],
  ['Extermination Specialist', 'sx'],
]

/**
 * → { champion (team or null), players: [{ label, key, best }], teams: [{ label, best }] }. best is null when
 * nobody scored, else { value, who }: player objects for players, display names for teams and missions.
 */
export function honours(R) {
  const c = R.ts[0]
  const named = (b, name) => b && { value: b.value, who: b.who.map(name) }
  return {
    champion: c && c.tot > 0 ? c : null,
    players: PLAYER_AWARDS.map(([label, key]) => ({ label, key, best: leaders(R.pl, key) })),
    teams: [
      ...TEAM_AWARDS.map(([label, key]) => ({ label, best: named(leaders(R.ts, key), (t) => t.n) })),
      { label: 'Highest Scoring Mission', best: named(leaders(R.ME, 'pts'), (m) => `${m.team} W${m.w} O${m.o}`) },
      { label: 'Killstorm', best: named(leaders(R.ME, 'kills'), (m) => `${m.team} W${m.w} O${m.o}`) },
    ],
  }
}

/** The short names of the awards a player holds outright or shares. */
export const awardsOf = (R, n) =>
  PLAYER_AWARDS.filter(([, k]) => {
    const b = leaders(R.pl, k)
    return b && b.who.some((p) => p.n === n)
  }).map((a) => a[2])

/** The class a player played most (ties: all of them, by hierarchy), or ''. */
export function mainClass(p) {
  const e = Object.entries(p.c)
  const m = Math.max(0, ...e.map((x) => x[1]))
  return m ? e.filter((x) => x[1] === m).map((x) => x[0]).sort((a, b) => classRank(a) - classRank(b)) : []
}

/** One mission's best player by MVP score, or null. */
export const missionMvp = (m, S) => (m[8] ?? []).filter((r) => r[0]).sort((a, b) => rowMvp(b, S) - rowMvp(a, S))[0] ?? null

/** The best mission a team can play, as [label, points] parts, and their total. */
export function bestMission(S) {
  const slot = S.gs + (SLOTS - 1) * S.rl >= SLOTS * S.rl ? [['Gene-Seed', S.gs], [`${SLOTS - 1} Guardian Relics`, (SLOTS - 1) * S.rl]] : [[`${SLOTS} Guardian Relics`, SLOTS * S.rl]]
  const parts = [['Played mission', S.base], ...slot, ['3 Armoury Data', 3 * S.ar], ['Extermination Rank', Math.max(S.A, S.B)]]
  return { parts, total: parts.reduce((a, x) => a + x[1], 0) }
}

/**
 * The points progression: per team, its value after each played week. mode 'tot' (cumulative points, from a
 * start at 0), 'gap' (behind the leader, ≤ 0) or 'rk' (rank). → { xs, ts: [{ id, n, v }] }, or null before any
 * mission is played.
 */
export function progression(R, mode) {
  const ts = [...R.ts].sort((a, b) => a.id - b.id)
  const n = Math.max(0, ...ts.flatMap((t) => t.m.filter(isPlayed).map((m) => m[0])))
  if (!n) return null
  const cum = ts.map((t) => {
    let c = 0
    return [0, ...t.wk.slice(0, n).map((w) => (c += w))]
  })
  const xs = mode === 'tot' ? [...Array(n + 1).keys()] : [...Array(n).keys()].map((i) => i + 1)
  return {
    xs,
    ts: ts.map((t, i) => ({
      id: t.id,
      n: t.n,
      v: xs.map((k) => {
        const col = cum.map((c) => c[k])
        const v = cum[i][k]
        return mode === 'tot' ? v : mode === 'gap' ? v - Math.max(...col) : 1 + col.filter((x) => x > v).length
      }),
    })),
  }
}

/** A number as the old site showed it: one decimal at most, German separators. */
export const num = (n) => (typeof n === 'number' ? (Math.round(n * 10) / 10).toLocaleString('de-DE') : n)
export const mvpText = (v) => v.toFixed(1).replace('.', ',')
/** Kills per incap, as games show K/D: with no incaps, the kills themselves. */
export const kd = (k, i) => num(k / Math.max(1, i))

// ── Manage ────────────────────────────────────────────────────────────────────────────────────────────────

/** A team with `a` renamed to `b` everywhere: roster, KIA list and every mission row. */
export function renameInTeam(t, a, b) {
  const d = clone(t)
  d.ro = [...new Set((d.ro ?? []).map((n) => (n === a ? b : n)))]
  d.ki = [...new Set((d.ki ?? []).map((n) => (n === a ? b : n)))]
  d.kw = Object.fromEntries(Object.entries(d.kw ?? {}).map(([n, w]) => [n === a ? b : n, w]))
  for (const m of d.m ?? []) for (const r of m[8] ?? []) if (r[0] === a) r[0] = b
  return d
}

/**
 * What renaming `a` to `b` would touch, live and archived. → { teams: [id], archives: [id], entries, existing
 * (b's entries), roster (a is on a live roster), error } where error says why it must not run.
 */
export function renamePlan(teams, archive, a, b) {
  if (!a || !b) return { error: 'Enter the current and the new name.' }
  if (a === b) return { error: 'The names are identical.' }
  const conflicts = []
  let entries = 0
  let existing = 0
  const scan = (t, where) => {
    let hit = false
    for (const m of t.m ?? []) {
      const rows = m[8] ?? []
      if (rows.some((r) => r[0] === a) && rows.some((r) => r[0] === b)) conflicts.push(`${where}${t.n} W${m[0]} O${m[1]}`)
      for (const r of rows) {
        if (r[0] === a) {
          entries++
          hit = true
        }
        if (r[0] === b) existing++
      }
    }
    return hit || (t.ro ?? []).includes(a)
  }
  const live = Object.values(teams ?? {})
  const hitTeams = live.filter((t) => scan(t, ''))
  const hitArchives = Object.entries(archive ?? {}).filter(([, ev]) => (ev.teams ?? []).map((t) => scan(t, `${ev.name}: `)).some(Boolean))
  const plan = { teams: hitTeams.map((t) => t.id), archives: hitArchives.map(([k]) => k), entries, existing, roster: hitTeams.some((t) => t.ro?.includes(a)) }
  if (!hitTeams.length && !hitArchives.length) {
    const all = [...live, ...Object.values(archive ?? {}).flatMap((e) => e.teams ?? [])].flatMap((t) => [...(t.ro ?? []), ...(t.m ?? []).flatMap((m) => (m[8] ?? []).map((r) => r[0]))])
    const near = all.find((x) => x && x.toLowerCase() === a.toLowerCase() && x !== a)
    return { ...plan, error: `No entries for “${a}”.${near ? ` Did you mean “${near}”?` : ''}` }
  }
  if (conflicts.length) {
    return { ...plan, error: `Can't merge: “${a}” and “${b}” both appear in ${conflicts.slice(0, 4).join(', ')}${conflicts.length > 4 ? ' …' : ''}. Fix those missions first.` }
  }
  const onA = live.filter((t) => t.ro?.includes(a)).map((t) => t.id)
  const onB = live.filter((t) => t.ro?.includes(b))
  if (onA.length && onB.some((t) => !onA.includes(t.id))) {
    return { ...plan, error: `Can't merge: “${b}” is on the roster of ${onB.map((t) => t.n).join(', ')}, “${a}” on another roster.` }
  }
  return plan
}

const toNum = (x) => +x || 0

/**
 * A backup file (as "Download backup" writes it) checked and cleaned: → { teams, scoring (or null), exported }.
 * Throws a message for the Watch Commander when the file is not a usable backup.
 */
export function parseBackup(x) {
  if (!x || !Array.isArray(x.teams) || !x.teams.length) throw new Error('No Kill Teams found in this file.')
  const ids = new Set()
  const teams = x.teams.map((t, i) => {
    if (!t || !Number.isInteger(t.id) || t.id < 1 || typeof t.n !== 'string' || !Array.isArray(t.ro) || !Array.isArray(t.m)) {
      throw new Error(`Kill Team ${i + 1} is incomplete.`)
    }
    if (ids.has(t.id)) throw new Error(`Kill Team id ${t.id} appears twice.`)
    ids.add(t.id)
    for (const m of t.m) {
      if (!Array.isArray(m) || m.length < 9 || !Array.isArray(m[8]) || m[8].some((r) => !Array.isArray(r) || r.length < 11)) {
        throw new Error(`“${t.n}” contains a damaged mission.`)
      }
    }
    const kw = t.kw && typeof t.kw === 'object' && !Array.isArray(t.kw) ? Object.fromEntries(Object.entries(t.kw).map(([n, w]) => [n, +w || 0])) : {}
    // Every number as a number: a hand-edited "1" would otherwise join as text where the tracker adds.
    const m = t.m.map(([w, o, played, score, gs, ar, rl, rk, rows]) => [
      ...[w, o].map(toNum),
      played,
      ...[score, gs, ar, rl].map(toNum),
      rk,
      rows.map(([name, cls, ...nums]) => [name, cls, ...nums.map(toNum)]),
    ])
    return { id: t.id, n: t.n, co: typeof t.co === 'string' ? t.co : COMPANIES[0], ro: t.ro.map(String), ki: Array.isArray(t.ki) ? t.ki.map(String) : [], kw, m }
  })
  let scoring = null
  if (x.scoring && typeof x.scoring === 'object') {
    scoring = Object.fromEntries(WEIGHT_LABELS.map(([k]) => [k, Number.isFinite(+x.scoring[k]) ? +x.scoring[k] : WEIGHTS[k]]))
  }
  return { teams, scoring, exported: typeof x.exported === 'string' ? x.exported : '' }
}

/** The archive document for the live event. */
export function archiveDoc(teams, S, name, at = new Date()) {
  const R = calc(teams, S)
  const c = R.ts[0]
  return {
    name,
    at: at.toISOString(),
    sc: { ...S },
    teams: Object.values(teams).map((t) => ({ id: t.id, n: t.n, co: t.co, ro: t.ro ?? [], ki: t.ki ?? [], kw: t.kw ?? {}, m: t.m ?? [] })),
    sum: { champ: c && c.tot > 0 ? c.n : '', pts: c ? c.tot : 0, nt: R.ts.length, nm: R.ts.reduce((a, t) => a + t.pl, 0) },
  }
}

/** A mission's slot in the 16-mission grid. */
export const findMission = (t, w, o) => (t?.m ?? []).find((m) => m[0] === w && m[1] === o)

/** The team with one mission put in place of whatever was in its slot, missions kept in order. */
export function withMission(t, m) {
  const d = clone(t)
  d.m = [...(d.m ?? []).filter((x) => !(x[0] === m[0] && x[1] === m[1])), m].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return d
}

/** The next slot after (w, o) that has no mission yet, or null. */
export function nextOpenSlot(t, w, o) {
  for (let i = (w - 1) * 4 + o; i < 16; i++) {
    const W = Math.floor(i / 4) + 1
    const O = (i % 4) + 1
    if (!findMission(t, W, O)) return [W, O]
  }
  return null
}

/** A file-name slug: lowercase letters and digits joined by "-". */
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
