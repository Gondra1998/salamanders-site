/**
 * Who may use the Deathwatch area, asked of Discord live (discordRoles.js) and
 * of the grants table. Access is the Watch Commander role, any one of the
 * Deathwatch roles, an active grant, or being the guild owner or an
 * Administrator (discordRoles.isAdmin). Watch Commander status comes only from
 * the Commander role, never from a grant and never from being an administrator.
 * Deathwatch Command standing (a different role from the Watch Commander) comes
 * only from its own role, and only for someone who has access: it opens nothing
 * by itself. Its id is optional; unset or malformed, nobody holds it.
 * Someone who is not in the guild holds no roles, and can still have a grant.
 * Any Discord failure throws Upstream: callers fail closed.
 *
 * Reads may reuse a verdict for a short while, keyed by a hash of the whole
 * Authorization header, so a polling page does not cost two Discord calls per
 * viewer per poll. `fresh` skips the cache entirely (writes and grant changes),
 * and forget() empties it (a grant changed, so nobody should keep a stale verdict).
 * Only successful lookups are cached: not a missing identity, not a failure.
 * The cache itself is verdictCache.js, shared with galleryAccess.js.
 */
import { createVerdictCache } from './verdictCache.js'

const SNOWFLAKE = /^\d{17,20}$/
const isSnowflake = (v) => typeof v === 'string' && SNOWFLAKE.test(v)

// The Deathwatch roles come as one comma-separated string (no spaces). A list with any bad item, or nothing, is
// [] so that it opens nothing: half a list is never used.
function parseRoleIds(value) {
  if (typeof value !== 'string') return []
  const ids = value.split(',')
  return ids.every(isSnowflake) ? ids : []
}

export function createDeathwatchAccess({
  roles,
  store,
  deathwatchRoleId,
  commanderRoleId,
  deathwatchCommandRoleId,
  ttlMs,
  maxEntries,
  now,
}) {
  // No defaults for the ids: until both are set the handler answers 503.
  const deathwatchRoleIds = parseRoleIds(deathwatchRoleId)
  const configured = deathwatchRoleIds.length > 0 && isSnowflake(commanderRoleId)
  // Unlike those two, this one never decides `configured`: left out, the area works and nobody is Deathwatch Command.
  // One snowflake or nothing, so a stray null or undefined in a role list can never match it.
  const commandRoleId = isSnowflake(deathwatchCommandRoleId) ? deathwatchCommandRoleId : null

  async function lookup(request) {
    const user = await roles.identify(request)
    if (!user) return null
    // Stryker disable next-line ArrayDeclaration: a stray element is never a role id, so it grants nothing
    const held = (await roles.rolesOf(user.id)) ?? []
    const watchCommander = held.includes(commanderRoleId)
    // Cheapest first: the guild lookup is only made for someone nothing else admits.
    const access =
      watchCommander ||
      deathwatchRoleIds.some((id) => held.includes(id)) ||
      (await store.isGranted(user.id)) ||
      (await roles.isAdmin(user.id, held))
    const deathwatchCommand = access && commandRoleId !== null && held.includes(commandRoleId)
    return { user, access, watchCommander, deathwatchCommand }
  }

  /**
   * resolve(request, { fresh }) → { user, access, watchCommander, deathwatchCommand }, or null when there is no
   * valid Discord identity. forget() drops every cached verdict.
   */
  const { resolve, forget } = createVerdictCache({ lookup, ttlMs, maxEntries, now })

  return { configured, resolve, forget }
}
