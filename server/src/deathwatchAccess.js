/**
 * Who may use the Deathwatch area, and which parts of it, asked of Discord live (discordRoles.js) and of the
 * grants table. The verdict names the standings a user holds (`roles`), and each part of the area opens to the
 * standings it lists (the site's lib/deathwatch/areas.js; the server enforces the Event Tracker's data itself):
 *   legion      the XVIIIth Legion role
 *   emissary    the Emissary role (optional: unset, nobody holds it)
 *   deployment  any one of the Deathwatch roles, the Deathwatch Command role, an active grant, or being the guild
 *               owner or an Administrator (discordRoles.isAdmin)
 *   command     the Deathwatch Command role (optional), a different role from the Watch Commander
 *   xenosbane   the Xenosbane Sigil award role (optional)
 *   vigilia     the Vigilia Mortis in Aeternum award role (optional)
 *   killmarine  the Deathwatch Kill-Marine award role (optional)
 * `access` (the area at all) is any standing, or the Watch Commander role. Watch Commander status comes only
 * from the Commander role, never from a grant and never from being an administrator, and opens every part.
 * Someone who is not in the guild holds no roles, and can still have a grant.
 * Any Discord failure throws Upstream: callers fail closed. The one exception: the guild lookup (is this an
 * administrator?) only decides `deployment`, so when it fails for someone another standing already lets in,
 * they keep that standing and do not get `deployment` from it.
 *
 * Reads may reuse a verdict for a short while, keyed by a hash of the whole
 * Authorization header, so a polling page does not cost two Discord calls per
 * viewer per poll. `fresh` skips the cache entirely (writes and grant changes),
 * and forget() empties it (a grant changed, so nobody should keep a stale verdict).
 * Only successful lookups are cached: not a missing identity, not a failure.
 * The cache itself is verdictCache.js, shared with galleryAccess.js.
 */
import { Upstream } from './discordRoles.js'
import { createVerdictCache } from './verdictCache.js'

const SNOWFLAKE = /^\d{17,20}$/
const isSnowflake = (v) => typeof v === 'string' && SNOWFLAKE.test(v)

// A role list comes as one comma-separated string (no spaces). A list with any bad item, or nothing, is
// [] so that it opens nothing: half a list is never used.
function parseRoleIds(value) {
  if (typeof value !== 'string') return []
  const ids = value.split(',')
  return ids.every(isSnowflake) ? ids : []
}
// One snowflake or nothing, so a stray null or undefined in a role list can never match it.
const parseRoleId = (value) => (isSnowflake(value) ? value : null)

export function createDeathwatchAccess({
  roles,
  store,
  deathwatchRoleId,
  commanderRoleId,
  deathwatchCommandRoleId,
  legionRoleId,
  emissaryRoleId,
  xenosbaneRoleId,
  vigiliaRoleId,
  killMarineRoleId,
  ttlMs,
  maxEntries,
  now,
}) {
  // No defaults for these two: until both are set the handler answers 503.
  const deathwatchRoleIds = parseRoleIds(deathwatchRoleId)
  const configured = deathwatchRoleIds.length > 0 && isSnowflake(commanderRoleId)
  // The rest never decide `configured`: left out, the area works and nobody holds that standing.
  const single = {
    legion: parseRoleId(legionRoleId),
    emissary: parseRoleId(emissaryRoleId),
    command: parseRoleId(deathwatchCommandRoleId),
    xenosbane: parseRoleId(xenosbaneRoleId),
    vigilia: parseRoleId(vigiliaRoleId),
    killmarine: parseRoleId(killMarineRoleId),
  }

  async function lookup(request) {
    const user = await roles.identify(request)
    if (!user) return null
    // Stryker disable next-line ArrayDeclaration: a stray element is never a role id, so it grants nothing
    const held = (await roles.rolesOf(user.id)) ?? []
    const watchCommander = held.includes(commanderRoleId)
    const has = (id) => id !== null && held.includes(id)
    const standing = {
      legion: has(single.legion),
      emissary: has(single.emissary),
      // Deathwatch Command is deployed too: it reads the Event Tracker as Deployment does.
      deployment: deathwatchRoleIds.some(has) || has(single.command),
      command: has(single.command),
      xenosbane: has(single.xenosbane),
      vigilia: has(single.vigilia),
      killmarine: has(single.killmarine),
    }
    // Cheapest first: the grants table and then the guild lookup are only asked about someone no role has
    // deployed, and never about the Watch Commander, who opens everything anyway.
    if (!standing.deployment && !watchCommander) standing.deployment = await store.isGranted(user.id)
    if (!standing.deployment && !watchCommander) {
      try {
        standing.deployment = await roles.isAdmin(user.id, held)
      } catch (err) {
        if (!(err instanceof Upstream) || !Object.values(standing).some(Boolean)) throw err
      }
    }
    const names = Object.keys(standing).filter((k) => standing[k])
    return { user, access: watchCommander || names.length > 0, watchCommander, deathwatchCommand: standing.command, roles: names }
  }

  /**
   * resolve(request, { fresh }) → { user, access, watchCommander, deathwatchCommand, roles }, or null when there is
   * no valid Discord identity. forget() drops every cached verdict.
   */
  const { resolve, forget } = createVerdictCache({ lookup, ttlMs, maxEntries, now })

  return { configured, resolve, forget }
}
