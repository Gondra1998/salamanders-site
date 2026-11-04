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
 * identity, not a failure. The cache itself is verdictCache.js, shared with deathwatchAccess.js.
 */
import { createVerdictCache } from './verdictCache.js'

const SNOWFLAKE = /^\d{17,20}$/
const isSnowflake = (v) => typeof v === 'string' && SNOWFLAKE.test(v)

export function createGalleryAccess({
  roles,
  memberRoleId,
  approverRoleIds,
  ttlMs,
  maxEntries,
  now,
}) {
  // One snowflake or nothing, so a stray null or undefined in a role list can never match it.
  const memberId = isSnowflake(memberRoleId) ? memberRoleId : null
  // Stryker disable next-line ArrayDeclaration: the fallback is filtered like any list, so a stray element is dropped
  const approvers = (Array.isArray(approverRoleIds) ? approverRoleIds : []).filter(isSnowflake)

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

  /**
   * resolve(request, { fresh }) → { user, access, approver }, or null when there is no valid Discord identity.
   * forget() drops every cached verdict.
   */
  const { resolve, forget } = createVerdictCache({ lookup, ttlMs, maxEntries, now })

  return { resolve, forget }
}
