/**
 * Who may use the Reliquarium (members-only art and clips galleries) and who may approve what is posted to
 * it, asked of Discord live (discordRoles.js). Access is the member role, or being the guild owner or an
 * Administrator (discordRoles.isAdmin). An approver is someone with access who holds any one of the approver
 * roles, or is an administrator: an approver role alone, without the member role, opens nothing.
 * Someone who is not in the guild holds no roles, and is let in only as the owner or an administrator.
 * Either id left out or malformed is dropped, so nobody holds it. Any Discord failure throws Upstream:
 * callers fail closed.
 *
 * Reads may reuse a verdict for a short while, keyed by a hash of the whole Authorization header, so a
 * polling page does not cost three Discord calls per viewer per poll. `fresh` skips the cache entirely
 * (approvals and takedowns), and forget() empties it. Only successful lookups are cached: not a missing
 * identity, not a failure. The cache is the one in deathwatchAccess.js, copied rather than shared: that
 * module is coverage-gated and under review elsewhere.
 */
import { createHash } from 'node:crypto'

const SNOWFLAKE = /^\d{17,20}$/
const isSnowflake = (v) => typeof v === 'string' && SNOWFLAKE.test(v)

export function createGalleryAccess({
  roles,
  memberRoleId,
  approverRoleIds,
  ttlMs = 30_000,
  maxEntries = 1000,
  now = Date.now,
}) {
  // One snowflake or nothing, so a stray null or undefined in a role list can never match it.
  const memberId = isSnowflake(memberRoleId) ? memberRoleId : null
  // Stryker disable next-line ArrayDeclaration: the fallback is filtered like any list, so a stray element is dropped
  const approvers = (Array.isArray(approverRoleIds) ? approverRoleIds : []).filter(isSnowflake)
  const cache = new Map() // sha256 of the Authorization header -> { verdict, until }
  // Replaced by forget(). A lookup that began under an earlier epoch may be telling a story forget() has
  // since made false (a role changed mid-lookup), so its verdict is returned but not remembered.
  let epoch = {}

  async function lookup(request) {
    const user = await roles.identify(request)
    if (!user) return null
    // Stryker disable next-line ArrayDeclaration: a stray element is never a role id, so it grants nothing
    const held = (await roles.rolesOf(user.id)) ?? []
    const member = memberId !== null && held.includes(memberId)
    // The guild lookup is the dear call, made at most once and only when it can change the answer. A member
    // holding an approver role is settled without it; a member without one is asked, to learn whether they
    // are an administrator and so approve; anyone else is asked, to learn whether they get in at all.
    let access
    let approver
    if (member) {
      access = true
      approver = approvers.some((id) => held.includes(id)) || (await roles.isAdmin(user.id, held))
    } else {
      access = await roles.isAdmin(user.id, held)
      approver = access
    }
    return { user, access, approver }
  }

  function remember(key, verdict) {
    if (!cache.has(key) && cache.size >= maxEntries) cache.delete(cache.keys().next().value)
    cache.set(key, { verdict, until: now() + ttlMs })
  }

  /** → { user, access, approver }, or null when there is no valid Discord identity. */
  async function resolve(request, { fresh = false } = {}) {
    const header = request.headers.get('Authorization')
    if (fresh || !header) return lookup(request)
    const key = createHash('sha256').update(header).digest('hex')
    const hit = cache.get(key)
    if (hit && now() < hit.until) return hit.verdict
    const began = epoch
    const verdict = await lookup(request)
    if (verdict && began === epoch) remember(key, verdict)
    return verdict
  }

  function forget() {
    cache.clear()
    epoch = {}
  }

  return { resolve, forget }
}
