/**
 * Who may use the Deathwatch area, and which parts of it, asked of Discord live (discordRoles.js) and of what the
 * Watch Commander has given people by hand (deathwatch_access, Administratum → Access). The verdict names the
 * standings a user holds (`roles`), and each part of the area opens to the standings it lists (the site's
 * lib/deathwatch/areas.js; the server enforces the Event Tracker's data and every write itself):
 *   legion      the XVIIIth Legion role
 *   emissary    the Emissary role (optional: unset, nobody holds it)
 *   deployment  any one of the Deathwatch roles, the Deathwatch Command role, anything given by hand, or being an
 *               admin
 *   command     the Deathwatch Command role (optional), a different role from the Watch Commander, or Watch
 *               Command given by hand
 *   xenosbane   the Xenosbane Sigil award role (optional)
 *   vigilia     the Vigilia Mortis in Aeternum award role (optional)
 *   killmarine  the Deathwatch Kill-Marine award role (optional)
 *   desk        the Administratum desk, given by hand: runs it, changes no access
 *   admin       the guild owner, or a holder of a role with Discord's Administrator permission (deathwatchAdmins.js):
 *               sees the Administratum, changes nothing
 * `access` (the area at all) is any standing, or the Watch Commander role. Watch Commander status comes only
 * from the Commander role, and opens every part; `desk` (who may write) is the Watch Commander or the desk.
 * What was given by hand counts only for a member of the guild who has been one since before it was given:
 * leaving ends it for good (deathwatchPeople.js). One found void is removed, its actor 'left-guild'.
 * Any Discord failure throws Upstream: callers fail closed. The one exception: the admin lookup only decides
 * `admin`, so when it fails for someone another standing already lets in, they keep that standing without it.
 *
 * Reads may reuse a verdict for a short while, keyed by a hash of the whole
 * Authorization header, so a polling page does not cost two Discord calls per
 * viewer per poll. `fresh` skips the cache entirely (writes and grant changes),
 * and forget() empties it (a grant changed, so nobody should keep a stale verdict).
 * Only successful lookups are cached: not a missing identity, not a failure.
 * The cache itself is verdictCache.js, shared with galleryAccess.js.
 */
import { Upstream } from './discordRoles.js'
import { joinedBefore, rejoinedSince } from './deathwatchPeople.js'
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
  admins,
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
    const member = await roles.memberOf(user.id)
    // Stryker disable next-line ArrayDeclaration: a stray element is never a role id, so it grants nothing
    const held = member?.roles ?? []
    const watchCommander = held.includes(commanderRoleId)
    const has = (id) => id !== null && held.includes(id)
    // What the Watch Commander gave by hand: only to a member, and only since before their present membership began.
    const given = new Set()
    if (member) {
      for (const d of await store.delegationsOf(user.id)) {
        if (joinedBefore(member.joinedAt, d.grantedAt)) given.add(d.kind)
        else if (rejoinedSince(member.joinedAt, d.grantedAt)) {
          await store.removeAccess(user.id, d.kind, 'left-guild')
          forget() // an access change like any other: no read may keep a verdict from before it
        }
      }
    }
    const standing = {
      legion: has(single.legion),
      emissary: has(single.emissary),
      // Deathwatch Command is deployed too: it reads the Event Tracker as Deployment does. So is anything given.
      deployment: deathwatchRoleIds.some(has) || has(single.command) || given.has('deathwatch') || given.has('watchcommand') || given.has('desk'),
      command: has(single.command) || given.has('watchcommand'),
      xenosbane: has(single.xenosbane),
      vigilia: has(single.vigilia),
      killmarine: has(single.killmarine),
      desk: given.has('desk'),
      admin: false,
    }
    // Never asked about the Watch Commander, who opens everything anyway.
    if (!watchCommander) {
      try {
        standing.admin = await admins.isAdmin(user.id, held)
      } catch (err) {
        if (!(err instanceof Upstream) || !Object.values(standing).some(Boolean)) throw err
      }
      if (standing.admin) standing.deployment = true
    }
    const names = Object.keys(standing).filter((k) => standing[k])
    return {
      user,
      access: watchCommander || names.length > 0,
      watchCommander,
      deathwatchCommand: standing.command,
      desk: watchCommander || standing.desk,
      roles: names,
    }
  }

  /**
   * resolve(request, { fresh }) → { user, access, watchCommander, deathwatchCommand, desk, roles }, or null when
   * there is no valid Discord identity. forget() drops every cached verdict.
   */
  const { resolve, forget } = createVerdictCache({ lookup, ttlMs, maxEntries, now })

  return { configured, resolve, forget }
}
