/**
 * Who the guild's admins are, for the Deathwatch: the owner, and anyone holding a role that carries Discord's
 * Administrator permission (or everyone, should @everyone carry it). Admins see the Administratum, read only.
 *
 * Every verdict asks this (deathwatchAccess.js), so the guild is read once and its answer reused for `ttlMs`
 * (five minutes): a plain member's verdict costs no more Discord calls than before. A failure is passed on (Upstream,
 * so callers fail closed) and never remembered. The shared roles.isAdmin() (builds, reports, the gallery) is left
 * as it is.
 */
export function createAdminCheck({ roles, ttlMs = 300_000, now = Date.now }) {
  let cached = null // { admins, until }

  async function admins() {
    if (cached && now() < cached.until) return cached.admins
    const fresh = await roles.guildAdmins()
    cached = { admins: fresh, until: now() + ttlMs }
    return fresh
  }

  return {
    async isAdmin(userId, held) {
      const a = await admins()
      return a.ownerId === userId || a.everyoneAdmin || (Array.isArray(held) && held.some((r) => a.adminRoleIds.includes(r)))
    },
  }
}
