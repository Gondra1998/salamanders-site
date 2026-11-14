/**
 * The roster feed: pages the guild's member list on a TTL, builds the order of
 * battle and the Infirmary list from it, and keeps the last good copy in this
 * process's memory only (never the database, the repo or logs). Own cache and
 * timer, separate from displayNames.js.
 *
 * Once stale, the old copy keeps answering while a refresh runs; a failed or
 * partial refresh (any page failing, a non-array body, more than maxPages)
 * keeps the last good copy and retries after retryMs. Members who left drop
 * out on the next good refresh. Listing members needs the bot's GUILD_MEMBERS
 * intent, same as displayNames.js.
 */
import { buildInfirmary, buildRoster } from './rosterCore.js'
import { memberFacts } from './rosterMember.js'

const PAGE = 1000
const SNOWFLAKE = /^\d{17,20}$/

export function createRoster({
  fetchImpl = fetch,
  apiBase,
  guildId,
  botToken,
  now = Date.now,
  ttlMs = 5 * 60_000,
  retryMs = 60_000,
  timeoutMs = 10_000,
  maxPages = 20,
}) {
  for (const [key, v] of Object.entries({ ttlMs, retryMs, timeoutMs, maxPages })) {
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${key} must be a positive number`)
  }
  const configured = [apiBase, guildId, botToken].every((v) => typeof v === 'string' && v !== '')

  let view = null // { roster, infirmary, people, at }
  let nextRefreshAt = -Infinity
  let inflight = null

  /** → every guild member, or null if any page fails (the caller keeps the old copy). */
  async function load() {
    // Stryker disable next-line ArrayDeclaration: a stray element is a non-member, which buildRoster and buildInfirmary skip
    const all = []
    let after = '0'
    for (let i = 0; i < maxPages; i++) {
      const res = await fetchImpl(`${apiBase}/v10/guilds/${guildId}/members?limit=${PAGE}&after=${after}`, {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status !== 200) return null
      const members = await res.json()
      if (!Array.isArray(members)) return null
      all.push(...members)
      if (members.length < PAGE) return all
      // Stryker disable next-line OptionalChaining: a last member with no user or no object only throws here, and a throw fails the load the same as the return below
      after = members[PAGE - 1]?.user?.id
      if (!SNOWFLAKE.test(after)) return null
    }
    return null // more than maxPages: refuse a partial roster
  }

  function settle(members) {
    if (members) {
      view = {
        roster: buildRoster(members, { guildId }),
        infirmary: buildInfirmary(members, { guildId }),
        // Every member but bots, for holding(): the Deathwatch's role lists.
        people: members.map((m) => memberFacts(m, guildId)).filter((f) => f && !f.bot),
        at: now(),
      }
    }
    nextRefreshAt = now() + (members ? ttlMs : retryMs)
  }

  function refresh() {
    inflight ??= load()
      .then(settle)
      .catch(() => settle(null))
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  /** → { roster, infirmary, fetchedAt, stale } or null if no roster has ever loaded. Waits only for the first load. */
  async function current() {
    if (!configured) return null
    if (now() >= nextRefreshAt) {
      const pending = refresh()
      if (!view) await pending
    }
    if (!view) return null
    return {
      roster: view.roster,
      infirmary: view.infirmary,
      fetchedAt: new Date(view.at).toISOString(),
      stale: now() - view.at > 2 * ttlMs,
    }
  }

  /** → [{ id, name, avatar }] of the members holding any of `roleIds`, by name; null if no roster has ever loaded. */
  async function holding(roleIds) {
    if (!(await current())) return null
    return view.people
      .filter((f) => roleIds.some((r) => f.roles.has(r)))
      .map(({ id, name, avatar }) => ({ id, name, avatar }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** → [{ id, name, avatar, joinedAt }] of every member but bots, a fresh copy; null if no roster has ever loaded. */
  async function members() {
    if (!(await current())) return null
    return view.people.map(({ id, name, avatar, joinedAt }) => ({ id, name, avatar, joinedAt }))
  }

  return { current, holding, members }
}
