import { describe, it, expect } from 'vitest'
import * as L from './rosterLadder.js'
import { createRoster } from './roster.js'

const GUILD = '1322056087792521269'
const BASE = 'https://d.test/api'
const A = '200000000000000001'
const B = '200000000000000002'
const C = '200000000000000003'
const member = (id, roles, nick = `n${id.slice(-2)}`) => ({ nick, roles, user: { id, username: `u${id}`, global_name: null } })
const scout = (id, nick) => member(id, [L.LEGION_ROLE, L.COMPANY_RANKS.at(-1).id, L.COMPANIES[0].roleId], nick)
const page = (n, start = 300000000000000000n) => Array.from({ length: n }, (_, i) => scout(String(start + BigInt(i)), `m${i}`))

// A Discord stand-in: each call takes the next answer (the last repeats). An
// answer is an array of members, { status, body }, a thrown Error, or a promise
// of one of those (to hold a request open).
function discord(...answers) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    let a = answers.length > 1 ? answers.shift() : answers[0]
    a = await a
    if (a instanceof Error) throw a
    if (Array.isArray(a)) return new Response(JSON.stringify(a), { status: 200 })
    return new Response(typeof a.body === 'string' ? a.body : JSON.stringify(a.body), { status: a.status })
  }
  return { fetchImpl, calls }
}
const clock = (t = 1_000_000) => {
  const c = { t, now: () => c.t }
  return c
}
const make = (d, over = {}) => {
  const c = over.clock || clock()
  const roster = createRoster({ fetchImpl: d.fetchImpl, apiBase: BASE, guildId: GUILD, botToken: 'bot', now: c.now, ...over })
  return { roster, c }
}
const tick = () => new Promise((r) => setTimeout(r, 0))
const scoutNames = (snap) => snap.roster.branches[0].rows.flatMap((r) => r.members.map((m) => m.name))

describe('createRoster', () => {
  it('builds the roster and the Infirmary list from the guild, stamped and not stale', async () => {
    const d = discord([scout(A, 'Alpha'), member(B, [L.INFIRMARY_ROLE], 'Beta')])
    const { roster, c } = make(d)
    const snap = await roster.current()
    expect(scoutNames(snap)).toEqual(['Alpha'])
    expect(snap.infirmary.map((m) => m.name)).toEqual(['Beta'])
    expect(snap.fetchedAt).toBe(new Date(c.t).toISOString())
    expect(snap.stale).toBe(false)
  })

  it('asks Discord with the bot token, 1000 per page, with a timeout', async () => {
    const d = discord([])
    await make(d).roster.current()
    expect(d.calls).toHaveLength(1)
    expect(d.calls[0].url).toBe(`${BASE}/v10/guilds/${GUILD}/members?limit=1000&after=0`)
    expect(d.calls[0].init.headers).toEqual({ Authorization: 'Bot bot' })
    expect(d.calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it('follows pages after the last member id until a short page', async () => {
    const first = page(1000)
    const d = discord(first, [scout(C, 'Last')])
    const snap = await make(d).roster.current()
    expect(d.calls).toHaveLength(2)
    expect(d.calls[1].url).toBe(`${BASE}/v10/guilds/${GUILD}/members?limit=1000&after=${first[999].user.id}`)
    expect(scoutNames(snap)).toHaveLength(1001)
  })

  it('refuses a partial roster: a failed later page, a non-array body or a bad cursor all fail the load', async () => {
    for (const second of [
      { status: 500, body: {} },
      { status: 500, body: [scout(C, 'Last')] },
      { status: 200, body: { message: 'x' } },
      new Error('timeout'),
    ]) {
      const d = discord(page(1000), second)
      expect(await make(d).roster.current()).toBe(null)
    }
    for (const last of [{ roles: [], user: { id: 'nope' } }, { roles: [] }, null]) {
      const bad = page(1000)
      bad[999] = last
      const d = discord(bad, [scout(C, 'Last')])
      expect(await make(d).roster.current()).toBe(null)
      expect(d.calls).toHaveLength(1)
    }
  })

  it('refuses a failed first page even when the body is a list of members', async () => {
    expect(await make(discord({ status: 500, body: [scout(A)] })).roster.current()).toBe(null)
  })

  it('refuses a first reply that is a JSON string, not a list', async () => {
    expect(await make(discord({ status: 200, body: JSON.stringify('abc') })).roster.current()).toBe(null)
  })

  it('refuses more than maxPages pages', async () => {
    const d = discord(page(1000))
    expect(await make(d, { maxPages: 2 }).roster.current()).toBe(null)
    expect(d.calls).toHaveLength(2)
  })

  it('answers null, without asking Discord, when it is not configured', async () => {
    const d = discord([scout(A)])
    for (const over of [{ apiBase: '' }, { guildId: undefined }, { botToken: '' }]) {
      expect(await make(d, over).roster.current()).toBe(null)
    }
    expect(d.calls).toHaveLength(0)
  })

  it('answers null when the very first load fails, then retries after retryMs and not before', async () => {
    const d = discord({ status: 500, body: {} }, [scout(A, 'Alpha')])
    const { roster, c } = make(d, { retryMs: 60_000 })
    expect(await roster.current()).toBe(null)
    c.t += 59_999
    expect(await roster.current()).toBe(null)
    expect(d.calls).toHaveLength(1)
    c.t += 1
    expect(scoutNames(await roster.current())).toEqual(['Alpha'])
    expect(d.calls).toHaveLength(2)
  })

  it('does not refetch inside the TTL, and refetches at the TTL', async () => {
    const d = discord([scout(A)])
    const { roster, c } = make(d, { ttlMs: 300_000 })
    await roster.current()
    c.t += 299_999
    await roster.current()
    expect(d.calls).toHaveLength(1)
    c.t += 1
    await roster.current()
    await tick()
    expect(d.calls).toHaveLength(2)
  })

  it('serves the old roster while a refresh runs, then the new one, and drops leavers', async () => {
    let release
    const hold = new Promise((r) => (release = r)).then(() => [scout(A, 'Alpha')])
    const d = discord([scout(A, 'Alpha'), scout(B, 'Leaver')], hold)
    const { roster, c } = make(d)
    expect(scoutNames(await roster.current())).toEqual(['Alpha', 'Leaver'])
    c.t += 300_000
    expect(scoutNames(await roster.current())).toEqual(['Alpha', 'Leaver']) // refresh pending, old copy served
    release()
    await tick()
    expect(scoutNames(await roster.current())).toEqual(['Alpha'])
  })

  it('replaces the roster object wholesale on a refresh and never edits the one it handed out', async () => {
    const d = discord([scout(A, 'Alpha')], [scout(A, 'Alpha'), scout(B, 'Beta')])
    const { roster, c } = make(d)
    const before = (await roster.current()).roster
    const frozen = structuredClone(before)
    c.t += 300_000
    await roster.current()
    await tick()
    const after = (await roster.current()).roster
    expect(after).not.toBe(before)
    expect(scoutNames({ roster: after })).toEqual(['Alpha', 'Beta'])
    expect(before).toEqual(frozen)
  })

  it('keeps the last good roster when a refresh fails, and retries after retryMs', async () => {
    const d = discord([scout(A, 'Alpha')], { status: 500, body: {} }, [scout(A, 'Alpha'), scout(B, 'Beta')])
    const { roster, c } = make(d, { retryMs: 60_000 })
    await roster.current()
    c.t += 300_000
    await roster.current()
    await tick()
    expect(scoutNames(await roster.current())).toEqual(['Alpha']) // failed refresh: last good copy
    c.t += 59_999
    await roster.current()
    expect(d.calls).toHaveLength(2)
    c.t += 1
    await roster.current()
    await tick()
    expect(scoutNames(await roster.current())).toEqual(['Alpha', 'Beta'])
  })

  it('marks the roster stale once it is older than twice the TTL', async () => {
    const d = discord([scout(A)], { status: 500, body: {} })
    const { roster, c } = make(d, { ttlMs: 100, retryMs: 1_000_000 })
    await roster.current()
    c.t += 200
    expect((await roster.current()).stale).toBe(false)
    await tick()
    c.t += 1
    expect((await roster.current()).stale).toBe(true)
  })

  it('shares one load between simultaneous callers', async () => {
    let release
    const hold = new Promise((r) => (release = r)).then(() => [scout(A)])
    const d = discord(hold)
    const { roster } = make(d)
    const calls = [roster.current(), roster.current(), roster.current()]
    release()
    const snaps = await Promise.all(calls)
    expect(d.calls).toHaveLength(1)
    expect(snaps.every((s) => s !== null)).toBe(true)
  })

  it('survives a response that is not JSON', async () => {
    const d = discord({ status: 200, body: 'not json' }, [scout(A, 'Alpha')])
    const { roster, c } = make(d)
    expect(await roster.current()).toBe(null)
    c.t += 60_000
    expect(scoutNames(await roster.current())).toEqual(['Alpha'])
  })

  it('refetches at 5 minutes by default', async () => {
    const d = discord([scout(A)])
    const { roster, c } = make(d)
    await roster.current()
    c.t += 299_999
    await roster.current()
    await tick()
    expect(d.calls).toHaveLength(1)
    c.t += 1
    await roster.current()
    await tick()
    expect(d.calls).toHaveLength(2)
  })

  it('by default follows up to 20 pages of 1000 and refuses a 21st', async () => {
    const full = page(1000)
    const tooMany = discord(full)
    expect(await make(tooMany).roster.current()).toBe(null)
    expect(tooMany.calls).toHaveLength(20)

    const fits = discord(...Array(19).fill(full), [scout(C, 'Last')])
    const snap = await make(fits).roster.current()
    expect(fits.calls).toHaveLength(20)
    expect(scoutNames(snap)).toHaveLength(1001)
  })

  it('by default retries a failed refresh after 60 seconds, not before', async () => {
    const d = discord({ status: 500, body: {} }, [scout(A, 'Alpha')])
    const { roster, c } = make(d)
    expect(await roster.current()).toBe(null)
    c.t += 59_999
    expect(await roster.current()).toBe(null)
    expect(d.calls).toHaveLength(1)
    c.t += 1
    expect(scoutNames(await roster.current())).toEqual(['Alpha'])
    expect(d.calls).toHaveLength(2)
  })

  it('retries after a network failure only once retryMs has passed', async () => {
    const d = discord(new Error('timeout'), [scout(A, 'Alpha')])
    const { roster, c } = make(d, { retryMs: 60_000 })
    expect(await roster.current()).toBe(null)
    c.t += 59_999
    expect(await roster.current()).toBe(null)
    expect(d.calls).toHaveLength(1)
    c.t += 1
    expect(scoutNames(await roster.current())).toEqual(['Alpha'])
  })

  it('uses the guild id for server avatars in the roster and in the Infirmary list', async () => {
    const guildAvatar = 'a'.repeat(32)
    const withAvatar = (m) => ({ ...m, avatar: guildAvatar })
    const d = discord([withAvatar(scout(A, 'Alpha')), withAvatar(member(B, [L.INFIRMARY_ROLE], 'Beta'))])
    const snap = await make(d).roster.current()
    expect(snap.roster.branches[0].rows[0].members[0].avatar).toBe(
      `https://cdn.discordapp.com/guilds/${GUILD}/users/${A}/avatars/${guildAvatar}.png?size=64`,
    )
    expect(snap.infirmary[0].avatar).toBe(`https://cdn.discordapp.com/guilds/${GUILD}/users/${B}/avatars/${guildAvatar}.png?size=64`)
  })

  it.each([
    [{ ttlMs: 0 }, 'ttlMs'],
    [{ ttlMs: -1 }, 'ttlMs'],
    [{ retryMs: NaN }, 'retryMs'],
    [{ timeoutMs: Infinity }, 'timeoutMs'],
    [{ maxPages: 0 }, 'maxPages'],
    [{ ttlMs: '5' }, 'ttlMs'],
  ])('rejects a bad option (%j) at construction, naming it', (over, key) => {
    expect(() => make(discord([]), over)).toThrow(RangeError)
    expect(() => make(discord([]), over)).toThrow(`${key} must be a positive number`)
  })
})

describe('holding', () => {
  const bot = (id) => ({ ...member(id, ['R1']), user: { id, username: 'bot', bot: true } })

  it('lists the members holding any of the roles, by name, as id, name and avatar only; bots never', async () => {
    const d = discord([member(A, ['R1'], 'Zed'), member(B, ['R2', 'R9'], 'Abe'), member(C, ['R3'], 'Cy'), bot('200000000000000004')])
    const { roster } = make(d)
    expect(await roster.holding(['R1', 'R2'])).toEqual([
      { id: B, name: 'Abe', avatar: null },
      { id: A, name: 'Zed', avatar: null },
    ])
    expect(await roster.holding([])).toEqual([])
  })

  it('is null while no roster has loaded', async () => {
    expect(await make(discord({ status: 500, body: '' })).roster.holding(['R1'])).toBeNull()
  })
})

describe('members', () => {
  const joined = (m, at) => ({ ...m, joined_at: at })
  const bot = (id) => ({ ...member(id, ['R1']), user: { id, username: 'bot', bot: true } })

  it('is null while no roster has loaded', async () => {
    expect(await make(discord({ status: 500, body: '' })).roster.members()).toBeNull()
  })

  it('lists every member but bots, as id, name, avatar and when they joined', async () => {
    const d = discord([joined(member(A, ['R1'], 'Zed'), '2025-01-01T00:00:00.000Z'), member(B, [], 'Abe'), bot(C)])
    const { roster } = make(d)
    expect(await roster.members()).toEqual([
      { id: A, name: 'Zed', avatar: null, joinedAt: '2025-01-01T00:00:00.000Z' },
      { id: B, name: 'Abe', avatar: null, joinedAt: null },
    ])
  })

  it('hands out a copy: changing it changes nothing the next caller sees', async () => {
    const { roster } = make(discord([member(A, ['R1'], 'Zed')]))
    const first = await roster.members()
    first[0].name = 'changed'
    first.push({ id: B })
    expect(await roster.members()).toEqual([{ id: A, name: 'Zed', avatar: null, joinedAt: null }])
  })

  it('holding() still answers id, name and avatar only', async () => {
    const { roster } = make(discord([joined(member(A, ['R1'], 'Zed'), '2025-01-01T00:00:00.000Z')]))
    expect(await roster.holding(['R1'])).toEqual([{ id: A, name: 'Zed', avatar: null }])
  })
})
