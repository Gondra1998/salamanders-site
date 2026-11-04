/**
 * The Deathwatch routes: who am I, the area's data, document edits, and grants.
 * Modeled on reports.js. Every route asks deathwatchAccess.js for a live
 * verdict and every uncertain path fails closed: 401 (no Discord identity),
 * 403 (not allowed), 503 (Discord unreachable, or the role ids are not set).
 * The two read routes may use the short-lived cached verdict; everything that
 * changes something is Watch Commander only and always checks Discord afresh.
 * Responses are never cached by the browser; the data route uses an ETag so the
 * page can ask "anything new?" cheaply, but only after the access check, so a
 * caller without access never learns whether the data changed.
 */
import { Upstream } from './discordRoles.js'
import { etagOf, ifNoneMatches } from './deathwatchEtag.js'
import { MAX_ACTIVE_GRANTS, MAX_BODY_BYTES, isDiscordId, parseDocWrite, parseGrantBody } from './deathwatchValidate.js'
import { readJson as readJsonWithin, reply, send } from './httpReply.js'

const GRANT_ROUTE = /^\/deathwatch\/grants\/([^/]+)$/

/**
 * → { body } parsed from a JSON request, or { status, error } for the reply to give instead.
 * Text that is not JSON leaves `body` undefined, which parseDocWrite and parseGrantBody refuse as malformed.
 */
const readJson = (request) =>
  readJsonWithin(request, { maxBytes: MAX_BODY_BYTES, tooLarge: 'The request is too large (2 MB at most).' })

export function createDeathwatchHandler({ access, store }) {
  const me = async (_request, verdict) =>
    reply(200, { access: verdict.access, watchCommander: verdict.watchCommander, deathwatchCommand: verdict.deathwatchCommand })

  async function data(request, verdict) {
    if (!verdict.access) return reply(403, { error: 'Restricted to the Deathwatch.' })
    const text = JSON.stringify(await store.readAll())
    const etag = etagOf(text)
    // A bodiless send names no content type of its own; this 304 has always carried the one its 200 does.
    if (ifNoneMatches(request.headers.get('If-None-Match'), etag)) return send(304, null, { 'Content-Type': 'application/json', ETag: etag })
    return send(200, text, { ETag: etag })
  }

  async function writeDoc(request, verdict) {
    const read = await readJson(request)
    if (read.error) return reply(read.status, { error: read.error })
    const write = parseDocWrite(read.body)
    if (typeof write === 'string') return reply(400, { error: write })
    const { changed } = await store.writeDoc(write, verdict.user)
    return reply(200, { ok: true, changed })
  }

  const listGrants = async () => reply(200, { grants: await store.listGrants() })

  async function addGrant(request, verdict) {
    const read = await readJson(request)
    if (read.error) return reply(read.status, { error: read.error })
    const grant = parseGrantBody(read.body)
    if (typeof grant === 'string') return reply(400, { error: grant })
    const result = await store.grant(grant.discordId, verdict.user)
    if (result === 'limit') return reply(409, { error: `The grant limit (${MAX_ACTIVE_GRANTS}) is reached. Revoke one first.` })
    access.forget() // so nobody keeps a verdict from before this grant
    return reply(result === 'granted' ? 201 : 200, { discordId: grant.discordId })
  }

  async function removeGrant(discordId, verdict) {
    if (!isDiscordId(discordId)) return reply(400, { error: 'That is not a Discord user id.' })
    if ((await store.revoke(discordId, verdict.user)) === 'none') return reply(404, { error: 'No active grant for that user.' })
    access.forget() // a revoked grant must stop working at once, not when the cache expires
    return reply(200, { discordId })
  }

  /** → { commander, run } for a known route (commander: Watch Commander only, verdict not cached), else null. */
  function find(method, pathname) {
    if (method === 'GET' && pathname === '/deathwatch/me') return { commander: false, run: me }
    if (method === 'GET' && pathname === '/deathwatch/data') return { commander: false, run: data }
    if (method === 'POST' && pathname === '/deathwatch/doc') return { commander: true, run: writeDoc }
    if (method === 'GET' && pathname === '/deathwatch/grants') return { commander: true, run: listGrants }
    if (method === 'POST' && pathname === '/deathwatch/grants') return { commander: true, run: addGrant }
    const grantId = GRANT_ROUTE.exec(pathname)?.[1]
    if (method === 'DELETE' && grantId !== undefined) return { commander: true, run: (_request, verdict) => removeGrant(grantId, verdict) }
    return null
  }

  return async function handle(request, url) {
    const { pathname } = url
    if (pathname !== '/deathwatch' && !pathname.startsWith('/deathwatch/')) return null
    const route = find(request.method, pathname)
    if (!route) return reply(404, { error: 'Not found.' })
    if (!access.configured) return reply(503, { error: 'The Deathwatch area is not configured.' })
    try {
      const verdict = await access.resolve(request, { fresh: route.commander })
      if (!verdict) return reply(401, { error: 'Sign in with Discord.' })
      if (route.commander && !verdict.watchCommander) return reply(403, { error: 'Only the Watch Commander can do that.' })
      return await route.run(request, verdict)
    } catch (err) {
      if (err instanceof Upstream) return reply(503, { error: 'Discord could not be reached. Try again.' })
      throw err
    }
  }
}
