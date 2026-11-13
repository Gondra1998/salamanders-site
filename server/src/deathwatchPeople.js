/**
 * The rules behind Administratum → Access, pure: when a person given access by hand still holds it, and the
 * member search the Watch Commander types into (deathwatchHandler.js, over the roster cache in roster.js).
 *
 * Leaving the guild ends a delegation for good: a delegation counts only while its person has been in the guild
 * since before it was given. Discord's `joined_at` says when the current membership began, so a rejoin, however
 * quick, shows as a join date at or after `granted_at`. An unknown date proves nothing: it neither counts nor
 * condemns.
 */

const SNOWFLAKE = /^\d{17,20}$/

// A Date (as Postgres hands timestamptz back) or a date string, as epoch milliseconds; anything else is NaN.
// Never the Date constructor on raw input: new Date(null) is the epoch, which would make null "long ago".
const timeOf = (v) => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : NaN)

/** Whether a member who joined at `joinedAt` was already in the guild when the access was given at `grantedAt`. */
export function joinedBefore(joinedAt, grantedAt) {
  const j = timeOf(joinedAt)
  const g = timeOf(grantedAt)
  return Number.isFinite(j) && Number.isFinite(g) && j < g
}

/** Whether a member's present membership began at or after the access was given: they left and came back. */
export function rejoinedSince(joinedAt, grantedAt) {
  const j = timeOf(joinedAt)
  const g = timeOf(grantedAt)
  return Number.isFinite(j) && Number.isFinite(g) && j >= g
}

/**
 * Whether the person of an access row (`{ discordId, grantedAt }`) has left since it was given, by the roster's
 * members (`byId`, id → { joinedAt }): absent from it, or there again only since.
 */
export function departed(row, byId) {
  const person = byId.get(row.discordId)
  return !person || rejoinedSince(person.joinedAt, row.grantedAt)
}

/**
 * The members a query finds, for the Watch Commander's search: → [{ id, name, avatar }], at most `limit`.
 * A query of 17 to 20 digits is a user id and finds that one member. Anything else needs two characters and finds
 * the names holding it, ignoring case: the names that start with it first, then the rest, each by name.
 */
export function searchMembers(people, q, limit = 10) {
  if (!Array.isArray(people) || typeof q !== 'string') return []
  const t = q.trim()
  const valid = people.filter((p) => typeof p?.id === 'string' && typeof p.name === 'string')
  const pick = ({ id, name, avatar }) => ({ id, name, avatar })
  if (SNOWFLAKE.test(t)) return valid.filter((p) => p.id === t).slice(0, 1).map(pick)
  if (t.length < 2) return []
  const low = t.toLowerCase()
  const starts = (p) => p.name.toLowerCase().startsWith(low)
  return valid
    .filter((p) => p.name.toLowerCase().includes(low))
    .sort((a, b) => starts(b) - starts(a) || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1))
    .slice(0, limit)
    .map(pick)
}
