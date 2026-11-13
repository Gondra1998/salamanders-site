/**
 * The Deathwatch routes: who am I, the area's data, document edits, and the people the Watch Commander gives
 * access by hand (Administratum → Access: the member search, the list, adding and removing).
 * Also the Deathwatch Deployment list (who holds the role, from the roster's member cache, roster.js), and the
 * pictures of the Legion and Emissary members the Event Tracker names who no longer hold it.
 * Modeled on reports.js. Every route asks deathwatchAccess.js for a live
 * verdict and every uncertain path fails closed: 401 (no Discord identity),
 * 403 (not allowed), 503 (Discord unreachable, or the role ids are not set).
 * The read routes may use the short-lived cached verdict; everything that changes something checks Discord afresh:
 * a document write is the Watch Commander's or the desk's, an access change the Watch Commander's alone.
 * Responses are never cached by the browser; the data route uses an ETag so the
 * page can ask "anything new?" cheaply, but only after the access check, so a
 * caller without access never learns whether the data changed.
 */
import { Upstream } from './discordRoles.js'
import { etagOf, ifNoneMatches } from './deathwatchEtag.js'
import { MAX_ACTIVE_ACCESS, MAX_BODY_BYTES, isDiscordId, isKind, parseAccessBody, parseDocWrite } from './deathwatchValidate.js'
import { departed, searchMembers } from './deathwatchPeople.js'
import { readJson as readJsonWithin, reply, send } from './httpReply.js'

const ACCESS_ROUTE = /^\/deathwatch\/access\/([^/]+)\/([^/]+)$/
const NOT_YET = 'The member list is not available yet. Try again.'
const ONLY_COMMANDER = 'Only the Watch Commander can do that.'

// The Event Tracker's documents (the live event and the archive) go only to its readers: the Watch Commander and
// whoever holds deployment (deathwatchAccess.js). Fixed: a desk delegate can write cfg, so nothing in it decides this.
const readsTracker = (verdict) => verdict.watchCommander || verdict.roles.includes('deployment')
const isCommander = (verdict) => verdict.watchCommander

/**
 * → { body } parsed from a JSON request, or { status, error } for the reply to give instead.
 * Text that is not JSON leaves `body` undefined, which parseDocWrite and parseAccessBody refuse as malformed.
 */
const readJson = (request) =>
  readJsonWithin(request, { maxBytes: MAX_BODY_BYTES, tooLarge: 'The request is too large (2 MB at most).' })

/**
 * Who the Event Tracker's documents name, in the live event and every archived one: the Discord ids its Kill Teams
 * were filled with (a team's `di`, name → id) and the names on their rosters. → { ids, names }, two Sets.
 */
export function namedIn(all) {
  const teams = Object.values(all?.teams ?? {})
  for (const e of Object.values(all?.archive ?? {})) if (Array.isArray(e?.teams)) teams.push(...e.teams)
  const ids = new Set()
  const names = new Set()
  for (const t of teams) {
    if (Array.isArray(t?.ro)) for (const n of t.ro) if (typeof n === 'string') names.add(n)
    if (t?.di !== null && typeof t?.di === 'object') for (const id of Object.values(t.di)) if (isDiscordId(id)) ids.add(id)
  }
  return { ids, names }
}

export function createDeathwatchHandler({ access, store, roster = null, deploymentRoleIds = [], faceRoleIds = [] }) {
  const me = async (_request, verdict) =>
    reply(200, {
      access: verdict.access,
      watchCommander: verdict.watchCommander,
      deathwatchCommand: verdict.deathwatchCommand,
      roles: verdict.roles,
    })

  async function data(request, verdict) {
    if (!verdict.access) return reply(403, { error: 'Restricted to the Deathwatch.' })
    const all = await store.readAll()
    // Everyone else let in gets cfg, which holds the page texts every part needs.
    const text = JSON.stringify(readsTracker(verdict) ? all : { teams: {}, cfg: all.cfg, archive: {} })
    const etag = etagOf(text)
    // A bodiless send names no content type of its own; this 304 has always carried the one its 200 does.
    if (ifNoneMatches(request.headers.get('If-None-Match'), etag)) return send(304, null, { 'Content-Type': 'application/json', ETag: etag })
    return send(200, text, { ETag: etag })
  }

  // The battle-brothers holding Deathwatch Deployment (ids, names and avatars, for Manage's Kill Team slots and the
  // tracker's names), and the faces: the Legion and Emissary members the tracker names, by id or by name, who are
  // not among them, so a brother who leaves Deployment keeps his picture in the archive. To the Event Tracker's
  // readers only, as its data is.
  async function deployment(_request, verdict) {
    if (!readsTracker(verdict)) return reply(403, { error: 'Restricted to the Event Tracker.' })
    const members = roster && deploymentRoleIds.length ? await roster.holding(deploymentRoleIds) : null
    if (!members) return reply(503, { error: NOT_YET })
    let faces = []
    if (faceRoleIds.length) {
      const listed = new Set(members.map((m) => m.id))
      const { ids, names } = namedIn(await store.readAll())
      const pool = await roster.holding(faceRoleIds)
      if (pool) faces = pool.filter((m) => !listed.has(m.id) && (ids.has(m.id) || names.has(m.name)))
    }
    return reply(200, { members, faces })
  }

  async function writeDoc(request, verdict) {
    const read = await readJson(request)
    if (read.error) return reply(read.status, { error: read.error })
    const write = parseDocWrite(read.body)
    if (typeof write === 'string') return reply(400, { error: write })
    const { changed } = await store.writeDoc(write, verdict.user)
    return reply(200, { ok: true, changed })
  }

  // Every member but bots, from the roster cache (roster.js): no Discord calls. Null until it has loaded.
  const membersNow = async () => (roster ? roster.members() : null)

  // The Watch Commander's search: by display name, or one member by a pasted id (deathwatchPeople.js).
  async function members(_request, _verdict, url) {
    const people = await membersNow()
    if (!people) return reply(503, { error: NOT_YET })
    return reply(200, { members: searchMembers(people, url.searchParams.get('q')) })
  }

  // Everyone given access by hand, named from the roster. Anyone who has left the guild since, or come back only
  // since, loses it here for good (removed as 'left-guild'); with no roster loaded nothing is proved, so nothing goes.
  async function listAccess() {
    const rows = await store.listAccess()
    const people = await membersNow()
    const byId = new Map(people?.map((p) => [p.id, p]))
    let kept = rows
    if (people) {
      kept = []
      for (const row of rows) {
        if (departed(row, byId)) await store.removeAccess(row.discordId, row.kind, 'left-guild')
        else kept.push(row)
      }
      if (kept.length < rows.length) access.forget()
    }
    const person = (id) => byId.get(id)
    return reply(200, {
      people: kept.map((r) => ({
        id: r.discordId,
        kind: r.kind,
        name: person(r.discordId)?.name ?? null,
        avatar: person(r.discordId)?.avatar ?? null,
        grantedBy: person(r.grantedBy)?.name ?? r.grantedBy,
        grantedAt: r.grantedAt,
      })),
    })
  }

  async function addAccess(request, verdict) {
    const read = await readJson(request)
    if (read.error) return reply(read.status, { error: read.error })
    const body = parseAccessBody(read.body)
    if (typeof body === 'string') return reply(400, { error: body })
    const people = await membersNow()
    if (!people) return reply(503, { error: NOT_YET })
    if (!people.some((p) => p.id === body.discordId)) return reply(404, { error: 'Not in the server.' })
    const result = await store.addAccess(body.discordId, body.kind, verdict.user.id)
    if (result === 'limit') return reply(409, { error: `The access limit (${MAX_ACTIVE_ACCESS}) is reached. Remove someone first.` })
    access.forget() // so nobody keeps a verdict from before it
    return reply(result === 'added' ? 201 : 200, body)
  }

  async function removeAccess(discordId, kind, verdict) {
    if (!isDiscordId(discordId)) return reply(400, { error: 'That is not a Discord user id.' })
    if (!isKind(kind)) return reply(400, { error: 'Unknown access kind.' })
    if ((await store.removeAccess(discordId, kind, verdict.user.id)) === 'none') return reply(404, { error: 'No such access.' })
    access.forget() // a removal must stop working at once, not when the cache expires
    return reply(200, { discordId, kind })
  }

  /**
   * → { fresh, run, allow, denied } for a known route, else null. `fresh` skips the cached verdict (every change).
   * A route with `allow` is for those it allows, and anyone else gets 403 with `denied`; one without is for anyone
   * signed in (it checks what it needs itself).
   */
  function find(method, pathname) {
    const route = (fresh, run, allow, denied) => ({ fresh, run, allow, denied })
    if (method === 'GET' && pathname === '/deathwatch/me') return route(false, me)
    if (method === 'GET' && pathname === '/deathwatch/data') return route(false, data)
    if (method === 'GET' && pathname === '/deathwatch/deployment') return route(false, deployment)
    if (method === 'POST' && pathname === '/deathwatch/doc') return route(true, writeDoc, (v) => v.desk, 'Only the Watch Commander and the desk can do that.')
    if (method === 'GET' && pathname === '/deathwatch/members') return route(false, members, isCommander, ONLY_COMMANDER)
    if (method === 'GET' && pathname === '/deathwatch/access') {
      return route(false, listAccess, (v) => v.desk || v.roles.includes('admin'), 'Restricted to the Administratum.')
    }
    if (method === 'POST' && pathname === '/deathwatch/access') return route(true, addAccess, isCommander, ONLY_COMMANDER)
    const one = ACCESS_ROUTE.exec(pathname)
    if (method === 'DELETE' && one) return route(true, (_request, verdict) => removeAccess(one[1], one[2], verdict), isCommander, ONLY_COMMANDER)
    return null
  }

  return async function handle(request, url) {
    const { pathname } = url
    if (pathname !== '/deathwatch' && !pathname.startsWith('/deathwatch/')) return null
    const route = find(request.method, pathname)
    if (!route) return reply(404, { error: 'Not found.' })
    if (!access.configured) return reply(503, { error: 'The Deathwatch area is not configured.' })
    try {
      const verdict = await access.resolve(request, { fresh: route.fresh })
      if (!verdict) return reply(401, { error: 'Sign in with Discord.' })
      if (route.allow && !route.allow(verdict)) return reply(403, { error: route.denied })
      return await route.run(request, verdict, url)
    } catch (err) {
      if (err instanceof Upstream) return reply(503, { error: 'Discord could not be reached. Try again.' })
      throw err
    }
  }
}
