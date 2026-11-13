import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { createDeathwatchAccess } from './deathwatchAccess'
import { Upstream, createDiscordRoles } from './discordRoles'
import { createAdminCheck } from './deathwatchAdmins'

// Invented ids only: the real role and user ids never enter the repo.
const DW = '200000000000000101'
const WC = '200000000000000102'
const LEGION = '200000000000000199'
const CMD = '200000000000000110' // the Deathwatch Command role: a different role from the Watch Commander
// Every member here joined long before anything was given to them, unless a test says otherwise.
const EARLY = '2025-01-01T00:00:00.000Z'
const LATE = new Date('2026-06-01T00:00:00.000Z')
const given = (...kinds) => kinds.map((kind) => ({ kind, grantedAt: LATE }))
const NOBODY_ADMIN = { isAdmin: async () => false }

const USERS = {
  commander: { id: '300000000000000001', username: 'commander', roles: [WC] },
  watcher: { id: '300000000000000002', username: 'watcher', roles: [DW] },
  both: { id: '300000000000000003', username: 'both', roles: [DW, WC] },
  plain: { id: '300000000000000004', username: 'plain', roles: [] },
  legion: { id: '300000000000000005', username: 'legion', roles: [LEGION] },
  stranger: { id: '300000000000000006', username: 'stranger', roles: null }, // not in the guild
}
// A bearer token names a user; two tokens may name the same one.
const TOKENS = { ...USERS, 'tok-a': USERS.watcher, 'tok-b': USERS.watcher }

const req = (token) =>
  new Request('https://api.test/deathwatch/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} })

function setup({ granted = [], delegated = {}, joinedAt = EARLY, ...opts } = {}) {
  const clock = { t: 1_000 }
  // When every member's present membership began; a test may move it, as a leave and a rejoin would.
  const member = { joinedAt }
  const fail = { identify: false, roles: false }
  const roles = {
    identify: vi.fn(async (request) => {
      if (fail.identify) throw new Upstream()
      const u = TOKENS[(request.headers.get('Authorization') || '').slice(7)]
      return u ? { id: u.id, username: u.username } : null
    }),
    memberOf: vi.fn(async (id) => {
      if (fail.roles) throw new Upstream()
      const held = Object.values(USERS).find((u) => u.id === id).roles
      return held === null ? null : { roles: held, joinedAt: member.joinedAt }
    }),
  }
  // What the Watch Commander has given whom (deathwatch_access): a "grant" is the general level, given after joining.
  const delegations = new Map(Object.entries(delegated))
  for (const id of granted) delegations.set(id, given('deathwatch'))
  const removed = []
  const store = {
    delegationsOf: vi.fn(async (id) => [...(delegations.get(id) ?? [])]),
    removeAccess: async (id, kind, actor) => {
      removed.push([id, kind, actor])
      delegations.set(id, (delegations.get(id) ?? []).filter((d) => d.kind !== kind))
      return 'removed'
    },
  }
  const access = createDeathwatchAccess({
    roles,
    store,
    admins: NOBODY_ADMIN, // nobody here is an administrator; the admin describe runs the real seam
    deathwatchRoleId: DW,
    commanderRoleId: WC,
    deathwatchCommandRoleId: CMD,
    now: () => clock.t,
    ...opts,
  })
  return { access, roles, store, clock, fail, delegations, removed, member }
}

describe('configured', () => {
  const make = (deathwatchRoleId, commanderRoleId) =>
    createDeathwatchAccess({ roles: {}, store: {}, deathwatchRoleId, commanderRoleId }).configured

  it('is true only when both role ids are snowflakes', () => {
    expect(make(DW, WC)).toBe(true)
    expect(make('1'.repeat(17), '1'.repeat(20))).toBe(true)
  })

  it('is false when either id is missing or malformed', () => {
    // 12345678901234567 is a number whose text is 17 digits: only the string check refuses it.
    for (const bad of [undefined, '', 'abc', '1'.repeat(16), '1'.repeat(21), ` ${DW}`, 7, 12345678901234567]) {
      expect(make(bad, WC)).toBe(false)
      expect(make(DW, bad)).toBe(false)
    }
    expect(make(undefined, undefined)).toBe(false)
  })
})

describe('the verdict', () => {
  it('gives the Commander role access and Commander status', async () => {
    const { access } = setup()
    expect(await access.resolve(req('commander'))).toEqual({
      user: { id: USERS.commander.id, username: 'commander' },
      access: true,
      watchCommander: true,
      deathwatchCommand: false,
      desk: true,
      roles: [],
    })
  })

  it('gives the Deathwatch role access and deployment, without Commander status', async () => {
    const { access } = setup()
    const v = await access.resolve(req('watcher'))
    expect([v.access, v.watchCommander, v.roles]).toEqual([true, false, ['deployment']])
  })

  it('gives a grant deployment', async () => {
    const { access } = setup({ granted: [USERS.plain.id] })
    expect((await access.resolve(req('plain'))).roles).toEqual(['deployment'])
  })

  it('gives both roles together both', async () => {
    const { access } = setup()
    const v = await access.resolve(req('both'))
    expect([v.access, v.watchCommander]).toEqual([true, true])
  })

  it('gives a grant access, but never Commander status', async () => {
    const { access } = setup({ granted: [USERS.plain.id] })
    const v = await access.resolve(req('plain'))
    expect([v.access, v.watchCommander]).toEqual([true, false])
  })

  it('denies the Legion role alone while no Legion role id is given, and a user with no roles', async () => {
    const { access } = setup()
    for (const who of ['legion', 'plain']) {
      const v = await access.resolve(req(who))
      expect([v.access, v.watchCommander]).toEqual([false, false])
    }
  })

  it('gives someone not in the guild nothing, whatever was given to them, and leaves the row alone', async () => {
    const { access, removed } = setup({ delegated: { [USERS.stranger.id]: given('deathwatch', 'desk', 'watchcommand') } })
    const v = await access.resolve(req('stranger'))
    expect([v.access, v.desk, v.roles]).toEqual([false, false, []])
    expect(removed).toEqual([])
  })

  it('denies, without an error, a user who is not in the guild and has no grant', async () => {
    const { access } = setup()
    const v = await access.resolve(req('stranger'))
    expect([v.access, v.watchCommander]).toEqual([false, false])
  })

  it('counts only what was given to the user it identified', async () => {
    const { access } = setup({ granted: [USERS.watcher.id] })
    expect((await access.resolve(req('plain'))).access).toBe(false)
  })
})

describe('the Deathwatch Command role', () => {
  const ME = '300000000000000021'
  // `deathwatchCommandRoleId` is passed through as given, `undefined` included (a default would swallow it); CMD when absent.
  const verdictHolding = ({ held, granted = false, ...rest }) =>
    createDeathwatchAccess({
      roles: { identify: async () => ({ id: ME, username: 'me' }), memberOf: async () => ({ roles: held, joinedAt: EARLY }) },
      store: { delegationsOf: async () => (granted ? given('deathwatch') : []) },
      admins: NOBODY_ADMIN,
      deathwatchRoleId: DW,
      commanderRoleId: WC,
      deathwatchCommandRoleId: 'deathwatchCommandRoleId' in rest ? rest.deathwatchCommandRoleId : CMD,
    }).resolve(req('any'))
  const standing = (v) => [v.access, v.watchCommander, v.deathwatchCommand]

  it('is held by a member who has access, and gives no Commander status', async () => {
    expect(standing(await verdictHolding({ held: [DW, CMD] }))).toEqual([true, false, true])
    expect(standing(await verdictHolding({ held: [LEGION, CMD, DW] }))).toEqual([true, false, true])
  })

  it('lets its holder in by itself, as command and as deployment, without asking for a grant', async () => {
    const v = await verdictHolding({ held: [CMD] })
    expect([...standing(v), v.roles]).toEqual([true, false, true, ['deployment', 'command']])
  })

  it('stands beside a grant, which supplies the access', async () => {
    expect(standing(await verdictHolding({ held: [CMD], granted: true }))).toEqual([true, false, true])
    expect(standing(await verdictHolding({ held: [], granted: true }))).toEqual([true, false, false])
  })

  it('is earned by the role alone, never by any other way in', async () => {
    expect(standing(await verdictHolding({ held: [DW] }))).toEqual([true, false, false])
    expect(standing(await verdictHolding({ held: [WC] }))).toEqual([true, true, false])
    expect(standing(await verdictHolding({ held: [], granted: true }))).toEqual([true, false, false])
  })

  it('leaves Commander status to the Commander role, whatever else is held', async () => {
    expect(standing(await verdictHolding({ held: [WC, CMD] }))).toEqual([true, true, true])
    expect(standing(await verdictHolding({ held: [CMD, DW] }))).toEqual([true, false, true])
  })

  it('is off when its id is not set or not a single snowflake, even for a holder of the role itself', async () => {
    // A bad id that is also literally in the user's role list must still open nothing: it is validated, not matched.
    const bad = [undefined, null, '', ' ', 'abc', ` ${CMD}`, `${CMD} `, '1'.repeat(16), '1'.repeat(21), `${CMD},${CMD}`, `${DW},${CMD}`, 7, 200000000000000110, true, [CMD], {}]
    for (const id of bad) {
      const held = [DW, CMD, ...(typeof id === 'string' ? [id] : [])]
      expect(standing(await verdictHolding({ held, deathwatchCommandRoleId: id })), String(id)).toEqual([true, false, false])
    }
  })

  it('does not take a stray entry in the role list for the role when none is set', async () => {
    const held = [DW, undefined, null, '', 'undefined', 'null']
    for (const id of [undefined, null, '']) {
      expect(standing(await verdictHolding({ held, deathwatchCommandRoleId: id })), String(id)).toEqual([true, false, false])
    }
  })

  it('neither configures the area nor is needed to', () => {
    const configured = (opts) => createDeathwatchAccess({ roles: {}, store: {}, ...opts }).configured
    expect(configured({ deathwatchRoleId: DW, commanderRoleId: WC })).toBe(true)
    expect(configured({ deathwatchRoleId: DW, commanderRoleId: WC, deathwatchCommandRoleId: CMD })).toBe(true)
    expect(configured({ commanderRoleId: WC, deathwatchCommandRoleId: CMD })).toBe(false)
    expect(configured({ deathwatchRoleId: DW, deathwatchCommandRoleId: CMD })).toBe(false)
  })

  const snowflake = fc.stringMatching(/^[1-9]\d{16,19}$/)

  it('property: any snowflake id is held by exactly those who hold that role', async () => {
    await fc.assert(
      fc.asyncProperty(snowflake, snowflake, async (id, other) => {
        fc.pre(id !== other && ![DW, WC].includes(id) && ![DW, WC].includes(other))
        const mine = await verdictHolding({ held: [DW, id], deathwatchCommandRoleId: id })
        const theirs = await verdictHolding({ held: [DW, other], deathwatchCommandRoleId: id })
        return mine.deathwatchCommand === true && theirs.deathwatchCommand === false
      }),
    )
  })

  it('property: a string that is not a snowflake switches the role off, even as an exact match', async () => {
    const notSnowflake = fc.string().filter((s) => !/^\d{17,20}$/.test(s))
    await fc.assert(
      fc.asyncProperty(notSnowflake, async (id) => {
        const v = await verdictHolding({ held: [DW, id], deathwatchCommandRoleId: id })
        return v.access === true && v.deathwatchCommand === false
      }),
    )
  })
})

describe('no identity, no cache', () => {
  it('returns null for no Authorization header and for an unknown token, and caches neither', async () => {
    const { access, roles } = setup()
    expect(await access.resolve(req(null))).toBeNull()
    expect(await access.resolve(req('nobody'))).toBeNull()
    expect(await access.resolve(req('nobody'))).toBeNull()
    expect(roles.identify).toHaveBeenCalledTimes(3)
    expect(roles.memberOf).not.toHaveBeenCalled()
  })
})

describe('Discord failures fail closed', () => {
  it('rejects with Upstream when identify fails, and does not cache the failure', async () => {
    const { access, fail } = setup()
    fail.identify = true
    await expect(access.resolve(req('watcher'))).rejects.toBeInstanceOf(Upstream)
    fail.identify = false
    expect((await access.resolve(req('watcher'))).access).toBe(true)
  })

  it('rejects with Upstream when the role lookup fails, even for a granted user', async () => {
    const { access, fail } = setup({ granted: [USERS.plain.id] })
    fail.roles = true
    await expect(access.resolve(req('plain'))).rejects.toBeInstanceOf(Upstream)
    fail.roles = false
    expect((await access.resolve(req('plain'))).access).toBe(true)
  })
})

describe('the verdict cache', () => {
  it('serves a verdict for ttlMs and looks again one millisecond later', async () => {
    const { access, roles, clock } = setup()
    await access.resolve(req('watcher'))
    clock.t = 1_000 + 29_999
    await access.resolve(req('watcher'))
    expect(roles.identify).toHaveBeenCalledTimes(1)
    expect(roles.memberOf).toHaveBeenCalledTimes(1)
    clock.t = 1_000 + 30_000
    await access.resolve(req('watcher'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('honours a different ttlMs', async () => {
    const { access, roles, clock } = setup({ ttlMs: 5 })
    await access.resolve(req('watcher'))
    clock.t = 1_004
    await access.resolve(req('watcher'))
    expect(roles.identify).toHaveBeenCalledTimes(1)
    clock.t = 1_005
    await access.resolve(req('watcher'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('keeps a separate entry per token, even for tokens that differ in one character', async () => {
    const { access, roles } = setup()
    await access.resolve(req('tok-a'))
    await access.resolve(req('tok-b'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
    await access.resolve(req('tok-a'))
    await access.resolve(req('tok-b'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('lets fresh bypass the cache and leaves the cache as it was', async () => {
    const { access, roles } = setup()
    await access.resolve(req('watcher'))
    await access.resolve(req('watcher'), { fresh: true })
    expect(roles.identify).toHaveBeenCalledTimes(2)
    await access.resolve(req('watcher'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('does not cache what a fresh call learned', async () => {
    const { access, roles } = setup()
    await access.resolve(req('watcher'), { fresh: true })
    await access.resolve(req('watcher'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('drops every cached verdict on forget', async () => {
    const { access, roles, delegations } = setup()
    expect((await access.resolve(req('plain'))).access).toBe(false)
    delegations.set(USERS.plain.id, given('deathwatch'))
    expect((await access.resolve(req('plain'))).access).toBe(false) // still the cached answer
    access.forget()
    expect((await access.resolve(req('plain'))).access).toBe(true)
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('does not remember a verdict that a forget() overtook while it was being looked up', async () => {
    const { access, store, delegations } = setup({ granted: [USERS.plain.id] })
    let answer
    store.delegationsOf.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    const inFlight = access.resolve(req('plain')) // a read that is about to be told "granted"
    await vi.waitFor(() => expect(store.delegationsOf).toHaveBeenCalled())
    delegations.delete(USERS.plain.id) // the grant is revoked, and every cached verdict dropped,
    access.forget() // while that lookup is still running
    answer(given('deathwatch'))
    expect((await inFlight).access).toBe(true) // the caller who asked early still gets what was true then
    expect((await access.resolve(req('plain'))).access).toBe(false) // but it was not kept for the next read
  })

  it('is bounded: a full cache evicts its oldest entry', async () => {
    const { access, roles } = setup({ maxEntries: 2 })
    await access.resolve(req('watcher'))
    await access.resolve(req('commander'))
    await access.resolve(req('plain')) // evicts watcher
    expect(roles.identify).toHaveBeenCalledTimes(3)
    await access.resolve(req('commander'))
    await access.resolve(req('plain'))
    expect(roles.identify).toHaveBeenCalledTimes(3)
    await access.resolve(req('watcher')) // gone, looked up again
    expect(roles.identify).toHaveBeenCalledTimes(4)
  })
})

// DEATHWATCH_ROLE_ID may name several roles at once: a comma-separated list, no spaces. The Watch Commander
// role stays a single id. A list with any bad item opens nothing, never a part of it.
describe('several Deathwatch roles', () => {
  const B = '200000000000000103'
  const C = '200000000000000104'
  const configured = (deathwatchRoleId, commanderRoleId = WC) =>
    createDeathwatchAccess({ roles: {}, store: {}, deathwatchRoleId, commanderRoleId }).configured

  async function verdictHolding(deathwatchRoleId, held) {
    const access = createDeathwatchAccess({
      roles: {
        identify: async () => ({ id: '300000000000000009', username: 'u' }),
        memberOf: async () => ({ roles: held, joinedAt: EARLY }),
      },
      store: { delegationsOf: async () => [] },
      admins: NOBODY_ADMIN,
      deathwatchRoleId,
      commanderRoleId: WC,
    })
    return access.resolve(req('any'))
  }

  it('is configured by a comma-separated list of snowflakes', () => {
    expect(configured(`${DW},${B}`)).toBe(true)
    expect(configured(`${DW},${B},${C}`)).toBe(true)
  })

  it('is not configured when any item of the list is empty, malformed or spaced', () => {
    const bad = [
      `${DW},`,
      `,${DW}`,
      `${DW},,${B}`,
      `${DW},abc`,
      `${DW},${'1'.repeat(16)}`,
      `${DW},${'1'.repeat(21)}`,
      `${DW}, ${B}`,
      `${DW} ,${B}`,
      `${DW} ${B}`,
      `${DW};${B}`,
      `${DW}\n${B}`,
    ]
    for (const list of bad) expect(configured(list), JSON.stringify(list)).toBe(false)
  })

  it('keeps the Watch Commander role a single id', () => {
    expect(configured(DW, `${WC},${B}`)).toBe(false)
  })

  it('admits the holder of any one listed role, without Commander status', async () => {
    for (const mine of [DW, B, C]) {
      const v = await verdictHolding(`${DW},${B},${C}`, [mine])
      expect([v.access, v.watchCommander], mine).toEqual([true, false])
    }
  })

  it('admits the holder of a listed role among others they hold', async () => {
    const v = await verdictHolding(`${DW},${B}`, [LEGION, B])
    expect([v.access, v.watchCommander]).toEqual([true, false])
  })

  it('does not admit the holder of an unlisted role, or the Legion role alone', async () => {
    for (const held of [[C], [LEGION], [], [C, LEGION]]) {
      const v = await verdictHolding(`${DW},${B}`, held)
      expect([v.access, v.watchCommander], held.join()).toEqual([false, false])
    }
  })

  it('still lets the Watch Commander in when the list names other roles', async () => {
    const v = await verdictHolding(`${DW},${B}`, [WC])
    expect([v.access, v.watchCommander]).toEqual([true, true])
  })

  it('opens nothing by role when one item of the list is bad', async () => {
    for (const mine of [DW, B]) {
      const v = await verdictHolding(`${DW},oops,${B}`, [mine])
      expect([v.access, v.watchCommander], mine).toEqual([false, false])
    }
  })

  const snowflake = fc.stringMatching(/^[1-9]\d{16,19}$/)
  const ids = fc.uniqueArray(snowflake, { minLength: 1, maxLength: 6 })

  it('property: a holder of exactly one listed role is admitted, whatever the list or its order', async () => {
    await fc.assert(
      fc.asyncProperty(ids, fc.nat(), async (list, pick) => {
        fc.pre(!list.includes(WC))
        const v = await verdictHolding(list.join(','), [list[pick % list.length]])
        return v.access === true && v.watchCommander === false
      }),
    )
  })

  it('property: a holder of no listed role is denied', async () => {
    await fc.assert(
      fc.asyncProperty(ids, snowflake, async (list, other) => {
        fc.pre(!list.includes(other) && other !== WC && !list.includes(WC))
        const v = await verdictHolding(list.join(','), [other])
        return v.access === false && v.watchCommander === false
      }),
    )
  })

  it('property: one bad item anywhere in the list unconfigures it and admits nobody', async () => {
    const badItem = fc.constantFrom('', 'abc', ' ', '1'.repeat(16), '1'.repeat(21), `${DW} `, ' 1')
    await fc.assert(
      fc.asyncProperty(ids, badItem, fc.nat(), async (list, bad, at) => {
        fc.pre(!list.includes(WC))
        const items = [...list]
        items.splice(at % (items.length + 1), 0, bad)
        const text = items.join(',')
        if (configured(text) !== false) return false
        for (const mine of list) {
          const v = await verdictHolding(text, [mine])
          if (v.access !== false) return false
        }
        return true
      }),
    )
  })
})

// The guild owner and anyone holding a role that grants Administrator are let in as well, without Commander
// status. "Administrator" is the repo's own definition (discordRoles.isAdmin), so these tests run the real
// seam over a fake Discord instead of a stub that decides for itself.
describe('administrators and the guild owner', () => {
  const GUILD = '1322056087792521269'
  const ADMIN_ROLE = '200000000000000201' // Administrator among other bits
  const PLAIN_ROLE = '200000000000000202' // Manage Server and more, but not Administrator
  const ME = '300000000000000011'
  const OWNER = '300000000000000099' // somebody else, unless a test says otherwise

  function verdictFor({ held = [], owner = OWNER, guildStatus = 200, granted = false, deathwatchRoleId = DW } = {}) {
    const guild = {
      owner_id: owner,
      roles: [
        { id: GUILD, permissions: '0' },
        { id: ADMIN_ROLE, permissions: String(0x8 | 0x20) },
        { id: PLAIN_ROLE, permissions: String(0x20 | 0x10 | 0x800) },
        { id: DW, permissions: '0' },
        { id: WC, permissions: '0' },
        { id: CMD, permissions: '0' },
      ],
    }
    const routes = {
      '/users/@me': { status: 200, body: { id: ME, username: 'me' } },
      [`/v10/guilds/${GUILD}/members/${ME}`]: { status: 200, body: { roles: held, joined_at: EARLY } },
      [`/v10/guilds/${GUILD}`]: { status: guildStatus, body: guild },
    }
    const fetchImpl = async (url) => {
      const r = routes[url.replace('https://d.test/api', '')] ?? { status: 404, body: {} }
      return new Response(JSON.stringify(r.body), { status: r.status })
    }
    const roles = createDiscordRoles({ fetchImpl, apiBase: 'https://d.test/api', guildId: GUILD, botToken: 'bot' })
    const access = createDeathwatchAccess({
      roles,
      store: { delegationsOf: async () => (granted ? given('deathwatch') : []) },
      admins: createAdminCheck({ roles }),
      deathwatchRoleId,
      commanderRoleId: WC,
      deathwatchCommandRoleId: CMD,
      legionRoleId: LEGION,
    })
    return access.resolve(req('any'))
  }
  const standing = (v) => [v.access, v.watchCommander]

  it('admits the guild owner, who holds no role at all, without Commander status', async () => {
    expect(standing(await verdictFor({ owner: ME, held: [] }))).toEqual([true, false])
  })

  it('admits the holder of a role that grants Administrator, without Commander status', async () => {
    expect(standing(await verdictFor({ held: [ADMIN_ROLE] }))).toEqual([true, false])
    expect(standing(await verdictFor({ held: [PLAIN_ROLE, ADMIN_ROLE] }))).toEqual([true, false])
  })

  it('denies a role with other powers but not Administrator, and a member with no roles', async () => {
    expect(standing(await verdictFor({ held: [PLAIN_ROLE] }))).toEqual([false, false])
    expect(standing(await verdictFor({ held: [] }))).toEqual([false, false])
  })

  it('does not take somebody else for the owner', async () => {
    expect(standing(await verdictFor({ owner: '300000000000000012', held: [] }))).toEqual([false, false])
  })

  it('leaves Commander status to the Commander role alone', async () => {
    expect(standing(await verdictFor({ owner: ME, held: [WC] }))).toEqual([true, true])
    expect(standing(await verdictFor({ held: [ADMIN_ROLE, WC] }))).toEqual([true, true])
    expect(standing(await verdictFor({ owner: ME, held: [ADMIN_ROLE] }))).toEqual([true, false])
  })

  it('still admits whoever a role or a grant already admits while the guild lookup is down', async () => {
    const down = { guildStatus: 500 }
    expect(standing(await verdictFor({ ...down, held: [DW] }))).toEqual([true, false])
    expect(standing(await verdictFor({ ...down, held: [WC] }))).toEqual([true, true])
    expect(standing(await verdictFor({ ...down, held: [], granted: true }))).toEqual([true, false])
  })

  it('fails closed when the guild lookup is down and nothing else admits the user', async () => {
    await expect(verdictFor({ guildStatus: 500, held: [PLAIN_ROLE] })).rejects.toBeInstanceOf(Upstream)
    await expect(verdictFor({ guildStatus: 500, owner: ME, held: [] })).rejects.toBeInstanceOf(Upstream)
  })

  it('admits exactly those who qualify one way or another, whatever the mix', async () => {
    const ways = ['owner', 'admin', 'reader', 'commander', 'granted']
    for (let mask = 0; mask < 1 << ways.length; mask++) {
      const has = Object.fromEntries(ways.map((w, i) => [w, Boolean(mask & (1 << i))]))
      const held = [has.admin && ADMIN_ROLE, has.reader && DW, has.commander && WC].filter(Boolean)
      const v = await verdictFor({ owner: has.owner ? ME : OWNER, held, granted: has.granted })
      expect(standing(v), JSON.stringify(has)).toEqual([ways.some((w) => has[w]), has.commander])
    }
  })

  it('gives the Deathwatch Command standing to its holders alone, and deployment to them and the other ways in', async () => {
    const ways = ['owner', 'admin', 'reader', 'commander', 'granted', 'command']
    for (let mask = 0; mask < 1 << ways.length; mask++) {
      const has = Object.fromEntries(ways.map((w, i) => [w, Boolean(mask & (1 << i))]))
      const held = [has.admin && ADMIN_ROLE, has.reader && DW, has.commander && WC, has.command && CMD].filter(Boolean)
      const v = await verdictFor({ owner: has.owner ? ME : OWNER, held, granted: has.granted })
      // The Watch Commander opens everything, so nobody asks the guild whether he is an admin too. What was given to
      // a member counts whoever they are.
      const admin = !has.commander && (has.owner || has.admin)
      const deployment = has.reader || has.command || has.granted || admin
      expect(v.deathwatchCommand, JSON.stringify(has)).toBe(has.command)
      expect(v.roles, JSON.stringify(has)).toEqual([deployment && 'deployment', has.command && 'command', admin && 'admin'].filter(Boolean))
      expect(v.desk, JSON.stringify(has)).toBe(has.commander)
      expect(standing(v), JSON.stringify(has)).toEqual([ways.some((w) => has[w]), has.commander])
    }
  })

  it('keeps another standing, without deployment, while the guild lookup is down, and fails closed with none', async () => {
    const down = { guildStatus: 500 }
    expect((await verdictFor({ ...down, held: [DW, CMD] })).roles).toEqual(['deployment', 'command'])
    expect((await verdictFor({ ...down, held: [], granted: true })).roles).toEqual(['deployment'])
    expect((await verdictFor({ ...down, held: [CMD] })).roles).toEqual(['deployment', 'command'])
    const v = await verdictFor({ ...down, held: [LEGION] })
    expect([v.access, v.roles]).toEqual([true, ['legion']])
    await expect(verdictFor({ ...down, held: [PLAIN_ROLE] })).rejects.toBeInstanceOf(Upstream)
  })

  it('lets an error that is not Upstream through, whatever else is held', async () => {
    const access = createDeathwatchAccess({
      roles: { identify: async () => ({ id: ME, username: 'me' }), memberOf: async () => ({ roles: [LEGION], joinedAt: EARLY }) },
      admins: {
        isAdmin: async () => {
          throw new TypeError('bug')
        },
      },
      store: { delegationsOf: async () => [] },
      deathwatchRoleId: DW,
      commanderRoleId: WC,
      deathwatchCommandRoleId: CMD,
      legionRoleId: LEGION,
    })
    await expect(access.resolve(req('any'))).rejects.toBeInstanceOf(TypeError)
  })
})

describe('the Legion, Emissary and award standings', () => {
  const EMI = '200000000000000120'
  const XEN = '200000000000000121' // award roles, invented
  const VIG = '200000000000000122'
  const KIL = '200000000000000123'
  const ME = '300000000000000031'
  const verdictHolding = (held, opts = {}) =>
    createDeathwatchAccess({
      roles: { identify: async () => ({ id: ME, username: 'me' }), memberOf: async () => ({ roles: held, joinedAt: EARLY }) },
      store: { delegationsOf: async () => [] },
      admins: NOBODY_ADMIN,
      deathwatchRoleId: DW,
      commanderRoleId: WC,
      deathwatchCommandRoleId: CMD,
      legionRoleId: LEGION,
      emissaryRoleId: EMI,
      xenosbaneRoleId: XEN,
      vigiliaRoleId: VIG,
      killMarineRoleId: KIL,
      ...opts,
    }).resolve(req('any'))

  it('names each standing its role gives, in a fixed order, and lets each one in by itself', async () => {
    const cases = [
      [[LEGION], ['legion']],
      [[EMI], ['emissary']],
      [[XEN], ['xenosbane']],
      [[VIG], ['vigilia']],
      [[KIL], ['killmarine']],
      [[KIL, XEN, VIG], ['xenosbane', 'vigilia', 'killmarine']],
      [[KIL, VIG, CMD, DW, EMI, LEGION], ['legion', 'emissary', 'deployment', 'command', 'vigilia', 'killmarine']],
    ]
    for (const [held, roles] of cases) {
      const v = await verdictHolding(held)
      expect([v.access, v.watchCommander, v.roles], held.join()).toEqual([true, false, roles])
    }
  })

  it('gives none of them to the Watch Commander unless the role is held, yet lets them in', async () => {
    const v = await verdictHolding([WC])
    expect([v.access, v.watchCommander, v.roles]).toEqual([true, true, []])
    expect((await verdictHolding([WC, LEGION])).roles).toEqual(['legion'])
  })

  it('switches each one off when its id is unset or malformed, even for a holder of that very string', async () => {
    for (const bad of [undefined, null, '', 'abc', ` ${LEGION}`, '1'.repeat(16), 7]) {
      const held = [LEGION, EMI, XEN, VIG, KIL, ...(typeof bad === 'string' ? [bad] : [])]
      const v = await verdictHolding(held, { legionRoleId: bad, emissaryRoleId: bad, xenosbaneRoleId: bad, vigiliaRoleId: bad, killMarineRoleId: bad })
      expect([v.access, v.roles], String(bad)).toEqual([false, []])
    }
  })

  it('takes one id per award, never a list', async () => {
    expect((await verdictHolding([XEN], { xenosbaneRoleId: `${XEN},${VIG}` })).roles).toEqual([])
  })

  it('does not take a stray entry in the role list for a standing that is not set', async () => {
    const held = [undefined, null, '', 'undefined', 'null']
    const v = await verdictHolding(held, { legionRoleId: undefined, emissaryRoleId: null, xenosbaneRoleId: undefined, vigiliaRoleId: null, killMarineRoleId: '' })
    expect(v.access).toBe(false)
  })

  it('neither configures the area nor is needed to', () => {
    const configured = (opts) => createDeathwatchAccess({ roles: {}, store: {}, ...opts }).configured
    expect(configured({ commanderRoleId: WC, legionRoleId: LEGION, emissaryRoleId: EMI, xenosbaneRoleId: XEN })).toBe(false)
    expect(configured({ deathwatchRoleId: DW, commanderRoleId: WC, legionRoleId: 'x' })).toBe(true)
  })
})

describe('what the Watch Commander gives by hand, and leaving the guild', () => {
  const resolveAs = async (who, opts) => {
    const t = setup(opts)
    return { ...t, v: await t.access.resolve(req(who)) }
  }

  it('the desk lets a plain member run the desk, and in at the general level', async () => {
    const { v } = await resolveAs('plain', { delegated: { [USERS.plain.id]: given('desk') } })
    expect([v.access, v.watchCommander, v.desk, v.deathwatchCommand, v.roles]).toEqual([true, false, true, false, ['deployment', 'desk']])
  })

  it('Watch Command is the same as holding the Deathwatch Command role', async () => {
    const { v } = await resolveAs('plain', { delegated: { [USERS.plain.id]: given('watchcommand') } })
    expect([v.access, v.desk, v.deathwatchCommand, v.roles]).toEqual([true, false, true, ['deployment', 'command']])
  })

  it('the general level is deployment and nothing more', async () => {
    const { v } = await resolveAs('plain', { delegated: { [USERS.plain.id]: given('deathwatch') } })
    expect([v.access, v.desk, v.deathwatchCommand, v.roles]).toEqual([true, false, false, ['deployment']])
  })

  it('adds to what a role already gives', async () => {
    const { v } = await resolveAs('watcher', { delegated: { [USERS.watcher.id]: given('desk', 'watchcommand') } })
    expect([v.desk, v.deathwatchCommand, v.roles]).toEqual([true, true, ['deployment', 'command', 'desk']])
  })

  it('the Watch Commander runs the desk without being given it', async () => {
    const { v } = await resolveAs('commander')
    expect([v.access, v.desk, v.roles]).toEqual([true, true, []])
  })

  it('an admin sees, and runs nothing', async () => {
    const { v } = await resolveAs('plain', { admins: { isAdmin: async () => true } })
    expect([v.access, v.desk, v.watchCommander, v.roles]).toEqual([true, false, false, ['deployment', 'admin']])
  })

  it('the Watch Commander is never asked about, or named, as an admin', async () => {
    const { v } = await resolveAs('commander', { admins: { isAdmin: async () => true } })
    expect(v.roles).toEqual([])
  })

  it('someone who left and came back has lost it: it counts for nothing and is removed', async () => {
    const opts = { joinedAt: '2026-07-01T00:00:00.000Z', delegated: { [USERS.plain.id]: given('desk', 'deathwatch') } }
    const { v, removed, access } = await resolveAs('plain', opts)
    expect([v.access, v.desk, v.roles]).toEqual([false, false, []])
    expect(removed).toEqual([
      [USERS.plain.id, 'desk', 'left-guild'],
      [USERS.plain.id, 'deathwatch', 'left-guild'],
    ])
    access.forget()
    expect((await access.resolve(req('plain'))).access).toBe(false)
  })

  it('a rejoin one second after it was given is still a rejoin, roster or no roster', async () => {
    const { v, removed } = await resolveAs('plain', {
      joinedAt: new Date(LATE.getTime() + 1000).toISOString(),
      delegated: { [USERS.plain.id]: given('desk') },
    })
    expect([v.access, v.desk]).toEqual([false, false])
    expect(removed).toEqual([[USERS.plain.id, 'desk', 'left-guild']])
  })

  it('joining at the very instant it was given is not before it', async () => {
    const { v, removed } = await resolveAs('plain', { joinedAt: LATE.toISOString(), delegated: { [USERS.plain.id]: given('desk') } })
    expect(v.desk).toBe(false)
    expect(removed).toHaveLength(1)
  })

  it('drops the cached verdicts when it removes something, so a read cached before stops at once', async () => {
    const t = setup({ delegated: { [USERS.plain.id]: given('desk') } })
    expect((await t.access.resolve(req('plain'))).desk).toBe(true)
    t.member.joinedAt = '2026-07-01T00:00:00.000Z' // left and came back
    expect((await t.access.resolve(req('plain'))).desk).toBe(true) // still the cached read
    expect((await t.access.resolve(req('plain'), { fresh: true })).desk).toBe(false) // a write's look finds it void
    expect((await t.access.resolve(req('plain'))).desk).toBe(false) // and the cached read went with it
  })

  it('a join date Discord did not give proves nothing: it neither counts nor is removed', async () => {
    for (const joinedAt of [null, 'garbage']) {
      const { v, removed } = await resolveAs('plain', { joinedAt, delegated: { [USERS.plain.id]: given('desk') } })
      expect([v.access, v.desk]).toEqual([false, false])
      expect(removed).toEqual([])
    }
  })

  it('a desk delegate keeps the desk while the guild lookup for admins is down', async () => {
    const down = { isAdmin: async () => Promise.reject(new Upstream()) }
    const { v } = await resolveAs('plain', { admins: down, delegated: { [USERS.plain.id]: given('desk') } })
    expect([v.access, v.desk, v.roles]).toEqual([true, true, ['deployment', 'desk']])
  })

  it('a plain member fails closed while it is down', async () => {
    const t = setup({ admins: { isAdmin: async () => Promise.reject(new Upstream()) } })
    await expect(t.access.resolve(req('plain'))).rejects.toBeInstanceOf(Upstream)
  })

  it('property: only a known kind, given after joining, ever adds anything', async () => {
    const kind = fc.constantFrom('deathwatch', 'watchcommand', 'desk', 'admin', 'deployment', 'command', 'Desk', '', '__proto__')
    const when = fc.constantFrom('after', 'before', 'unknown')
    await fc.assert(
      fc.asyncProperty(fc.array(fc.record({ kind, when }), { maxLength: 6 }), async (list) => {
        const grantedAt = { after: LATE, before: new Date('2024-01-01T00:00:00Z'), unknown: 'not a date' }
        const delegated = { [USERS.plain.id]: list.map((d) => ({ kind: d.kind, grantedAt: grantedAt[d.when] })) }
        const { access } = setup({ delegated })
        const v = await access.resolve(req('plain'))
        const valid = new Set(list.filter((d) => d.when === 'after').map((d) => d.kind))
        const deployed = ['deathwatch', 'watchcommand', 'desk'].some((k) => valid.has(k))
        expect(v.desk).toBe(valid.has('desk'))
        expect(v.deathwatchCommand).toBe(valid.has('watchcommand'))
        expect(v.roles).toEqual([deployed && 'deployment', valid.has('watchcommand') && 'command', valid.has('desk') && 'desk'].filter(Boolean))
        expect(v.access).toBe(deployed)
      }),
    )
  })
})
