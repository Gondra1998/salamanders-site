import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { createGalleryAccess } from './galleryAccess'
import { Upstream, createDiscordRoles } from './discordRoles'

// Invented ids only: the real role and user ids never enter the repo.
const MEMBER = '200000000000000301'
const RECLUSIARCH = '200000000000000302'
const CAPTAIN = '200000000000000303'
const HIERARCHY = '200000000000000304'
const CURATOR = '200000000000000305'
const APPROVERS = [RECLUSIARCH, CAPTAIN, HIERARCHY, CURATOR]
const OTHER = '200000000000000399' // a role that opens nothing

const USERS = {
  member: { id: '300000000000000101', username: 'member', roles: [MEMBER] },
  reclusiarch: { id: '300000000000000102', username: 'reclusiarch', roles: [MEMBER, RECLUSIARCH] },
  captain: { id: '300000000000000103', username: 'captain', roles: [CAPTAIN, MEMBER] },
  hierarchy: { id: '300000000000000104', username: 'hierarchy', roles: [MEMBER, HIERARCHY, OTHER] },
  curator: { id: '300000000000000105', username: 'curator', roles: [MEMBER, CURATOR] },
  lonelyCurator: { id: '300000000000000106', username: 'lonelyCurator', roles: [CURATOR] }, // no member role
  plain: { id: '300000000000000107', username: 'plain', roles: [OTHER] },
  admin: { id: '300000000000000108', username: 'admin', roles: [OTHER] }, // an administrator, by isAdmin
  adminMember: { id: '300000000000000109', username: 'adminMember', roles: [MEMBER] },
  stranger: { id: '300000000000000110', username: 'stranger', roles: null }, // not in the guild
}
// A bearer token names a user; two tokens may name the same one.
const TOKENS = { ...USERS, 'tok-a': USERS.member, 'tok-b': USERS.member }

const req = (token) =>
  new Request('https://api.test/gallery/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} })

function setup(opts = {}) {
  const clock = { t: 1_000 }
  const fail = { identify: false, roles: false, admin: false }
  const admins = new Set([USERS.admin.id, USERS.adminMember.id]) // who isAdmin says yes to
  const roles = {
    identify: vi.fn(async (request) => {
      if (fail.identify) throw new Upstream()
      const u = TOKENS[(request.headers.get('Authorization') || '').slice(7)]
      return u ? { id: u.id, username: u.username } : null
    }),
    rolesOf: vi.fn(async (id) => {
      if (fail.roles) throw new Upstream()
      return Object.values(USERS).find((u) => u.id === id).roles
    }),
    isAdmin: vi.fn(async (id) => {
      if (fail.admin) throw new Upstream()
      return admins.has(id)
    }),
  }
  const access = createGalleryAccess({
    roles,
    memberRoleId: MEMBER,
    approverRoleIds: APPROVERS,
    now: () => clock.t,
    ...opts,
  })
  return { access, roles, clock, fail, admins }
}

describe('the verdict', () => {
  it('gives a member access, but not the right to approve', async () => {
    const { access } = setup()
    expect(await access.resolve(req('member'))).toEqual({
      user: { id: USERS.member.id, username: 'member' },
      access: true,
      approver: false,
    })
  })

  it('makes a member who holds any one approver role an approver', async () => {
    const { access } = setup()
    for (const who of ['reclusiarch', 'captain', 'hierarchy', 'curator']) {
      const v = await access.resolve(req(who))
      expect([v.access, v.approver], who).toEqual([true, true])
    }
  })

  it('gives an approver role without the member role nothing: approvers must be members or administrators', async () => {
    const { access } = setup()
    const v = await access.resolve(req('lonelyCurator'))
    expect(v).toEqual({ user: { id: USERS.lonelyCurator.id, username: 'lonelyCurator' }, access: false, approver: false })
  })

  it('denies a user who holds neither the member role nor an approver role', async () => {
    const { access } = setup()
    const v = await access.resolve(req('plain'))
    expect([v.access, v.approver]).toEqual([false, false])
  })

  it('makes an administrator, who holds no member role, both a member and an approver', async () => {
    const { access } = setup()
    const v = await access.resolve(req('admin'))
    expect([v.access, v.approver]).toEqual([true, true])
  })

  it('makes an administrator who is also a member an approver', async () => {
    const { access } = setup()
    const v = await access.resolve(req('adminMember'))
    expect([v.access, v.approver]).toEqual([true, true])
  })

  it('denies, without an error, a user who is not in the guild', async () => {
    const { access } = setup()
    const v = await access.resolve(req('stranger'))
    expect(v).toEqual({ user: { id: USERS.stranger.id, username: 'stranger' }, access: false, approver: false })
  })

  it('returns only the user, access and approver', async () => {
    const { access } = setup()
    expect(Object.keys(await access.resolve(req('member'))).sort()).toEqual(['access', 'approver', 'user'])
  })
})

describe('the administrator lookup', () => {
  it('is asked about the user it identified, with the roles it just read', async () => {
    const { access, roles } = setup()
    await access.resolve(req('plain'))
    expect(roles.isAdmin).toHaveBeenCalledWith(USERS.plain.id, USERS.plain.roles)
  })

  it('is asked with no roles for someone who is not in the guild', async () => {
    const { access, roles } = setup()
    await access.resolve(req('stranger'))
    expect(roles.isAdmin).toHaveBeenCalledWith(USERS.stranger.id, [])
  })

  it('is not asked when a member already holds an approver role: nothing is left to decide', async () => {
    const { access, roles } = setup()
    for (const who of ['reclusiarch', 'captain', 'hierarchy', 'curator']) await access.resolve(req(who))
    expect(roles.isAdmin).not.toHaveBeenCalled()
  })

  it('is asked exactly once for a member with no approver role, to learn whether they approve', async () => {
    const { access, roles } = setup()
    await access.resolve(req('member'))
    expect(roles.isAdmin).toHaveBeenCalledTimes(1)
  })

  it('is asked exactly once for anyone else, and decides both flags', async () => {
    const { access, roles } = setup()
    for (const who of ['lonelyCurator', 'plain', 'admin', 'stranger']) {
      roles.isAdmin.mockClear()
      await access.resolve(req(who))
      expect(roles.isAdmin, who).toHaveBeenCalledTimes(1)
    }
  })

  it('is asked at most once in every combination, and the verdict follows from the three facts', async () => {
    const make = (member, curator, admin) => {
      const held = [member && MEMBER, curator && CAPTAIN, OTHER].filter(Boolean)
      const roles = {
        identify: async () => ({ id: '300000000000000150', username: 'u' }),
        rolesOf: async () => held,
        isAdmin: vi.fn(async () => admin),
      }
      return { roles, access: createGalleryAccess({ roles, memberRoleId: MEMBER, approverRoleIds: APPROVERS }) }
    }
    for (let mask = 0; mask < 8; mask++) {
      const [member, curator, admin] = [Boolean(mask & 1), Boolean(mask & 2), Boolean(mask & 4)]
      const { access, roles } = make(member, curator, admin)
      const v = await access.resolve(req('any'))
      const label = JSON.stringify({ member, curator, admin })
      expect([v.access, v.approver], label).toEqual([member || admin, (member || admin) && (curator || admin)])
      expect(roles.isAdmin.mock.calls.length, label).toBeLessThanOrEqual(1)
    }
  })
})

describe('no identity, no cache', () => {
  it('returns null for no Authorization header and for an unknown token, and caches neither', async () => {
    const { access, roles } = setup()
    expect(await access.resolve(req(null))).toBeNull()
    expect(await access.resolve(req('nobody'))).toBeNull()
    expect(await access.resolve(req('nobody'))).toBeNull()
    expect(roles.identify).toHaveBeenCalledTimes(3)
    expect(roles.rolesOf).not.toHaveBeenCalled()
    expect(roles.isAdmin).not.toHaveBeenCalled()
  })
})

describe('Discord failures fail closed', () => {
  it('rejects with Upstream when identify fails, and does not cache the failure', async () => {
    const { access, fail } = setup()
    fail.identify = true
    await expect(access.resolve(req('member'))).rejects.toBeInstanceOf(Upstream)
    fail.identify = false
    expect((await access.resolve(req('member'))).access).toBe(true)
  })

  it('rejects with Upstream when the role lookup fails, and does not cache the failure', async () => {
    const { access, fail, roles } = setup()
    fail.roles = true
    await expect(access.resolve(req('member'))).rejects.toBeInstanceOf(Upstream)
    expect(roles.isAdmin).not.toHaveBeenCalled()
    fail.roles = false
    expect((await access.resolve(req('member'))).access).toBe(true)
  })

  it('rejects with Upstream when the administrator lookup fails, and does not cache the failure', async () => {
    const { access, fail } = setup()
    fail.admin = true
    await expect(access.resolve(req('plain'))).rejects.toBeInstanceOf(Upstream)
    fail.admin = false
    expect((await access.resolve(req('plain'))).access).toBe(false)
  })

  it('does not guess a member out of an approver flag it could not settle', async () => {
    // A member with no approver role needs the administrator lookup to learn their approver flag: no answer, no verdict.
    const { access, fail } = setup()
    fail.admin = true
    await expect(access.resolve(req('member'))).rejects.toBeInstanceOf(Upstream)
  })

  it('answers a member who holds an approver role while the administrator lookup is down', async () => {
    const { access, fail } = setup()
    fail.admin = true
    const v = await access.resolve(req('curator'))
    expect([v.access, v.approver]).toEqual([true, true])
  })
})

describe('the verdict cache', () => {
  it('serves a verdict for ttlMs and looks again one millisecond later', async () => {
    const { access, roles, clock } = setup()
    await access.resolve(req('member'))
    clock.t = 1_000 + 29_999
    await access.resolve(req('member'))
    expect(roles.identify).toHaveBeenCalledTimes(1)
    expect(roles.rolesOf).toHaveBeenCalledTimes(1)
    expect(roles.isAdmin).toHaveBeenCalledTimes(1)
    clock.t = 1_000 + 30_000
    await access.resolve(req('member'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('honours a different ttlMs', async () => {
    const { access, roles, clock } = setup({ ttlMs: 5 })
    await access.resolve(req('member'))
    clock.t = 1_004
    await access.resolve(req('member'))
    expect(roles.identify).toHaveBeenCalledTimes(1)
    clock.t = 1_005
    await access.resolve(req('member'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('caches a denial as it caches a grant', async () => {
    const { access, roles } = setup()
    expect((await access.resolve(req('plain'))).access).toBe(false)
    expect((await access.resolve(req('plain'))).access).toBe(false)
    expect(roles.identify).toHaveBeenCalledTimes(1)
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
    await access.resolve(req('member'))
    await access.resolve(req('member'), { fresh: true })
    expect(roles.identify).toHaveBeenCalledTimes(2)
    await access.resolve(req('member'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('does not cache what a fresh call learned', async () => {
    const { access, roles } = setup()
    await access.resolve(req('member'), { fresh: true })
    await access.resolve(req('member'))
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('drops every cached verdict on forget', async () => {
    const { access, roles, admins } = setup()
    expect((await access.resolve(req('plain'))).access).toBe(false)
    admins.add(USERS.plain.id) // promoted since
    expect((await access.resolve(req('plain'))).access).toBe(false) // still the cached answer
    access.forget()
    expect((await access.resolve(req('plain'))).access).toBe(true)
    expect(roles.identify).toHaveBeenCalledTimes(2)
  })

  it('does not remember a verdict that a forget() overtook while it was being looked up', async () => {
    const { access, roles } = setup()
    let answer
    roles.isAdmin.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    const inFlight = access.resolve(req('plain')) // a read that is about to be told "administrator"
    await vi.waitFor(() => expect(roles.isAdmin).toHaveBeenCalled())
    access.forget() // while that lookup is still running
    answer(true)
    expect((await inFlight).access).toBe(true) // the caller who asked early still gets what was true then
    expect((await access.resolve(req('plain'))).access).toBe(false) // but it was not kept for the next read
  })

  it('is bounded: a full cache evicts its oldest entry', async () => {
    const { access, roles } = setup({ maxEntries: 2 })
    await access.resolve(req('member'))
    await access.resolve(req('curator'))
    await access.resolve(req('plain')) // evicts member
    expect(roles.identify).toHaveBeenCalledTimes(3)
    await access.resolve(req('curator'))
    await access.resolve(req('plain'))
    expect(roles.identify).toHaveBeenCalledTimes(3)
    await access.resolve(req('member')) // gone, looked up again
    expect(roles.identify).toHaveBeenCalledTimes(4)
  })

  it('does not evict anything to refresh an entry it already holds', async () => {
    const { access, roles, clock } = setup({ maxEntries: 2, ttlMs: 10 })
    await access.resolve(req('member'))
    await access.resolve(req('curator'))
    clock.t += 10 // both have expired
    await access.resolve(req('member')) // replaces its own entry; the cache is full but nothing is dropped
    expect(roles.identify).toHaveBeenCalledTimes(3)
    await access.resolve(req('curator')) // expired, looked up again
    expect(roles.identify).toHaveBeenCalledTimes(4)
    await access.resolve(req('member'))
    expect(roles.identify).toHaveBeenCalledTimes(4)
  })
})

// A role list the guild was configured with can hold anything: an unset variable becomes undefined or null, a typo a
// short string. Only snowflakes count, so a stray value can never match a role list that happens to hold it.
describe('the configured role ids', () => {
  const ME = '300000000000000121'
  // The ids are passed through as given, `undefined` included (a default would swallow it); the real ones when absent.
  const verdictHolding = (held, opts = {}) =>
    createGalleryAccess({
      roles: { identify: async () => ({ id: ME, username: 'me' }), rolesOf: async () => held, isAdmin: async () => false },
      memberRoleId: 'memberRoleId' in opts ? opts.memberRoleId : MEMBER,
      approverRoleIds: 'approverRoleIds' in opts ? opts.approverRoleIds : APPROVERS,
    }).resolve(req('any'))
  const standing = (v) => [v.access, v.approver]

  it('drops any approver id that is not a snowflake string, and keeps the ones that are', async () => {
    const bad = [undefined, null, '', ' ', 'abc', ` ${CURATOR}`, `${CURATOR} `, '1'.repeat(16), '1'.repeat(21), 7, 200000000000000305, true, [CURATOR], {}]
    const approverRoleIds = [...bad, CURATOR]
    expect(standing(await verdictHolding([MEMBER, CURATOR], { approverRoleIds }))).toEqual([true, true])
    for (const id of bad) {
      // A bad id that is also literally in the user's role list (the very same value) must still open nothing:
      // it is validated, not matched.
      expect(standing(await verdictHolding([MEMBER, id], { approverRoleIds: [id] })), String(id)).toEqual([true, false])
    }
  })

  it('does not take a stray entry in the role list for an approver role when none is set', async () => {
    const held = [MEMBER, undefined, null, '', 'undefined', 'null']
    for (const approverRoleIds of [[undefined], [null], [''], [undefined, null, '']]) {
      expect(standing(await verdictHolding(held, { approverRoleIds })), JSON.stringify(approverRoleIds)).toEqual([true, false])
    }
  })

  it('has no approvers at all when the list is empty, missing or not a list', async () => {
    const held = [MEMBER, CURATOR, CAPTAIN]
    for (const approverRoleIds of [[], undefined, null, CURATOR, { 0: CURATOR }]) {
      expect(standing(await verdictHolding(held, { approverRoleIds })), String(approverRoleIds)).toEqual([true, false])
    }
  })

  it('makes nobody a member when the member role id is not a snowflake string, even a holder of the role itself', async () => {
    const bad = [undefined, null, '', ' ', 'abc', ` ${MEMBER}`, '1'.repeat(16), '1'.repeat(21), 7, 200000000000000301, true, [MEMBER], {}]
    for (const id of bad) {
      expect(standing(await verdictHolding([OTHER, CURATOR, id], { memberRoleId: id })), String(id)).toEqual([false, false])
    }
  })

  it('does not take a stray entry in the role list for the member role when none is set', async () => {
    const held = [OTHER, undefined, null, '', 'undefined', 'null']
    for (const memberRoleId of [undefined, null, '']) {
      expect(standing(await verdictHolding(held, { memberRoleId })), String(memberRoleId)).toEqual([false, false])
    }
  })

  it('leaves an administrator in whatever the member role id is', async () => {
    const admin = createGalleryAccess({
      roles: { identify: async () => ({ id: ME, username: 'me' }), rolesOf: async () => [], isAdmin: async () => true },
      memberRoleId: undefined,
      approverRoleIds: undefined,
    })
    expect(standing(await admin.resolve(req('any')))).toEqual([true, true])
  })

  const snowflake = fc.stringMatching(/^[1-9]\d{16,19}$/)

  it('property: any snowflake approver id is held by exactly those who hold that role', async () => {
    await fc.assert(
      fc.asyncProperty(snowflake, snowflake, async (id, other) => {
        fc.pre(id !== other && ![MEMBER, OTHER].includes(id) && ![MEMBER, OTHER].includes(other))
        const mine = await verdictHolding([MEMBER, id], { approverRoleIds: [id] })
        const theirs = await verdictHolding([MEMBER, other], { approverRoleIds: [id] })
        return mine.approver === true && theirs.approver === false
      }),
    )
  })

  it('property: a string that is not a snowflake switches the role off, even as an exact match', async () => {
    const notSnowflake = fc.string().filter((s) => !/^\d{17,20}$/.test(s))
    await fc.assert(
      fc.asyncProperty(notSnowflake, async (id) => {
        const asApprover = await verdictHolding([MEMBER, id], { approverRoleIds: [id] })
        const asMember = await verdictHolding([id], { memberRoleId: id })
        return asApprover.access === true && asApprover.approver === false && asMember.access === false
      }),
    )
  })
})

// The guild owner and anyone holding a role that grants Administrator are let in as well, and approve. "Administrator"
// is the repo's own definition (discordRoles.isAdmin), so these tests run the real seam over a fake Discord instead of
// a stub that decides for itself.
describe('administrators and the guild owner', () => {
  const GUILD = '1322056087792521269'
  const ADMIN_ROLE = '200000000000000201' // Administrator among other bits
  const PLAIN_ROLE = '200000000000000202' // Manage Server and more, but not Administrator
  const ME = '300000000000000131'
  const OWNER = '300000000000000199' // somebody else, unless a test says otherwise

  function verdictFor({ held = [], owner = OWNER, guildStatus = 200, memberStatus = 200 } = {}) {
    const guild = {
      owner_id: owner,
      roles: [
        { id: GUILD, permissions: '0' },
        { id: ADMIN_ROLE, permissions: String(0x8 | 0x20) },
        { id: PLAIN_ROLE, permissions: String(0x20 | 0x10 | 0x800) },
        { id: MEMBER, permissions: '0' },
        { id: CURATOR, permissions: '0' },
      ],
    }
    const routes = {
      '/users/@me': { status: 200, body: { id: ME, username: 'me' } },
      [`/v10/guilds/${GUILD}/members/${ME}`]: { status: memberStatus, body: { roles: held } },
      [`/v10/guilds/${GUILD}`]: { status: guildStatus, body: guild },
    }
    const fetchImpl = async (url) => {
      const r = routes[url.replace('https://d.test/api', '')] ?? { status: 404, body: {} }
      return new Response(JSON.stringify(r.body), { status: r.status })
    }
    const roles = createDiscordRoles({ fetchImpl, apiBase: 'https://d.test/api', guildId: GUILD, botToken: 'bot' })
    return createGalleryAccess({ roles, memberRoleId: MEMBER, approverRoleIds: APPROVERS }).resolve(req('any'))
  }
  const standing = (v) => [v.access, v.approver]

  it('admits the guild owner, who holds no role at all, and lets them approve', async () => {
    expect(standing(await verdictFor({ owner: ME, held: [] }))).toEqual([true, true])
  })

  it('admits the holder of a role that grants Administrator, and lets them approve', async () => {
    expect(standing(await verdictFor({ held: [ADMIN_ROLE] }))).toEqual([true, true])
    expect(standing(await verdictFor({ held: [PLAIN_ROLE, ADMIN_ROLE] }))).toEqual([true, true])
  })

  it('denies a role with other powers but not Administrator, and a member with no roles', async () => {
    expect(standing(await verdictFor({ held: [PLAIN_ROLE] }))).toEqual([false, false])
    expect(standing(await verdictFor({ held: [] }))).toEqual([false, false])
  })

  it('does not take somebody else for the owner', async () => {
    expect(standing(await verdictFor({ owner: '300000000000000132', held: [] }))).toEqual([false, false])
  })

  it('lets a member through who is not an administrator, without letting them approve', async () => {
    expect(standing(await verdictFor({ held: [MEMBER] }))).toEqual([true, false])
  })

  it('does not let an approver role stand in for the member role', async () => {
    expect(standing(await verdictFor({ held: [CURATOR] }))).toEqual([false, false])
    expect(standing(await verdictFor({ held: [CURATOR, ADMIN_ROLE] }))).toEqual([true, true])
  })

  it('treats a user who is not in the guild as holding no roles, and still admits the owner', async () => {
    expect(standing(await verdictFor({ memberStatus: 404 }))).toEqual([false, false])
    expect(standing(await verdictFor({ memberStatus: 404, owner: ME }))).toEqual([true, true])
  })

  it('fails closed when the guild lookup is down, for everyone who needs it', async () => {
    const down = { guildStatus: 500 }
    await expect(verdictFor({ ...down, held: [PLAIN_ROLE] })).rejects.toBeInstanceOf(Upstream)
    await expect(verdictFor({ ...down, owner: ME, held: [] })).rejects.toBeInstanceOf(Upstream)
    await expect(verdictFor({ ...down, held: [MEMBER] })).rejects.toBeInstanceOf(Upstream)
    await expect(verdictFor({ ...down, held: [CURATOR] })).rejects.toBeInstanceOf(Upstream)
  })

  it('still answers a member who holds an approver role while the guild lookup is down', async () => {
    expect(standing(await verdictFor({ guildStatus: 500, held: [MEMBER, CAPTAIN] }))).toEqual([true, true])
  })

  it('fails closed when the member lookup is down', async () => {
    await expect(verdictFor({ memberStatus: 500, held: [MEMBER] })).rejects.toBeInstanceOf(Upstream)
  })
})
