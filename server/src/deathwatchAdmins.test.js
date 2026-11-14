import { describe, it, expect } from 'vitest'
import { createAdminCheck } from './deathwatchAdmins.js'
import { Upstream } from './discordRoles.js'

// Invented ids only.
const OWNER = '300000000000000001'
const USER = '300000000000000002'
const ADMIN_ROLE = '200000000000000801'
const PLAIN_ROLE = '200000000000000802'

// A guild that can change under the check, and a clock it can be read against.
function setup(over = {}) {
  const state = { ownerId: OWNER, adminRoleIds: [ADMIN_ROLE], everyoneAdmin: false, fail: false, asked: 0 }
  const clock = { t: 1_000 }
  const roles = {
    guildAdmins: async () => {
      state.asked++
      if (state.fail) throw new Upstream()
      return { ownerId: state.ownerId, adminRoleIds: [...state.adminRoleIds], everyoneAdmin: state.everyoneAdmin }
    },
  }
  const check = createAdminCheck({ roles, now: () => clock.t, ...over })
  return { check, state, clock }
}

describe('createAdminCheck', () => {
  it('the guild owner is an admin, whatever roles they hold', async () => {
    const { check } = setup()
    expect(await check.isAdmin(OWNER, [])).toBe(true)
  })

  it('a holder of a role with the Administrator permission is an admin', async () => {
    const { check } = setup()
    expect(await check.isAdmin(USER, [PLAIN_ROLE, ADMIN_ROLE])).toBe(true)
  })

  it('anyone else is not', async () => {
    const { check } = setup()
    expect(await check.isAdmin(USER, [PLAIN_ROLE])).toBe(false)
    expect(await check.isAdmin(USER, [])).toBe(false)
  })

  it('a role list that is not a list holds nothing', async () => {
    const { check } = setup()
    for (const held of [null, undefined, ADMIN_ROLE, { 0: ADMIN_ROLE }]) expect(await check.isAdmin(USER, held)).toBe(false)
  })

  it('everyone is an admin when @everyone itself has the permission', async () => {
    const { check, state } = setup()
    state.everyoneAdmin = true
    expect(await check.isAdmin(USER, [])).toBe(true)
  })

  it('a guild with no owner id makes nobody the owner', async () => {
    const { check, state } = setup()
    state.ownerId = null
    expect(await check.isAdmin(USER, [])).toBe(false)
  })

  it('reuses one answer for five minutes, and asks again from the very instant they end', async () => {
    const { check, state, clock } = setup()
    expect(await check.isAdmin(USER, [ADMIN_ROLE])).toBe(true)
    state.adminRoleIds = []
    clock.t += 300_000 - 1
    expect(await check.isAdmin(USER, [ADMIN_ROLE])).toBe(true)
    clock.t += 1
    expect(await check.isAdmin(USER, [ADMIN_ROLE])).toBe(false)
  })

  it('takes its own time to live', async () => {
    const { check, state, clock } = setup({ ttlMs: 10 })
    expect(await check.isAdmin(USER, [ADMIN_ROLE])).toBe(true)
    state.adminRoleIds = []
    clock.t += 10
    expect(await check.isAdmin(USER, [ADMIN_ROLE])).toBe(false)
  })

  it('passes a Discord failure on, and remembers nothing from it', async () => {
    const { check, state } = setup()
    state.fail = true
    await expect(check.isAdmin(USER, [ADMIN_ROLE])).rejects.toBeInstanceOf(Upstream)
    state.fail = false
    expect(await check.isAdmin(USER, [ADMIN_ROLE])).toBe(true)
  })
})
