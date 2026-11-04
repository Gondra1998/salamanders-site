/**
 * The Reliquarium routes (members-only art and clips galleries; see
 * docs/superpowers/specs/2026-11-02-reliquarium-design.md). Modeled on deathwatchHandler.js.
 *
 * Gates, in order: an unknown route is 404; an unconfigured Reliquarium (no R2 or no clips channel) is 503;
 * then galleryAccess.js gives a live verdict: none is 401, Discord down is 503. /gallery/me answers any
 * signed-in user; everything else needs the member role (403), and review routes an approver (403).
 * Reads may use the short-lived cached verdict; every non-GET asks Discord afresh. No route reads its body
 * before those checks, and no error message echoes what was sent. Responses are never cached.
 *
 * Media is served by link only: a presigned R2 GET (15 minutes) for a stored file, the embed URL for an
 * embed. An upload's bytes reach R2 only after the size, magic bytes, title and note all pass. A piece is
 * pending while its file uploads; a failed upload removes it.
 */
import { Upstream } from './discordRoles.js'
import { COMMUNITY_MEMBER } from './displayNames.js'
import { MAX_ART_BYTES, isItemId, parseArtFields, parseBefore, parseHideNote, parseReason, sniffImage } from './galleryValidate.js'
import { mediaType, readJson as readJsonWithin, reply, send } from './httpReply.js'

const ITEM_ROUTE = /^\/gallery\/items\/([^/]+)$/
const ACTION_ROUTE = /^\/gallery\/items\/([^/]+)\/(approve|reject|hide)$/
const LINK_SECONDS = 900 // R2 links live 15 minutes
const FORM_SLACK = 65_536 // multipart boundaries and the text fields, on top of the file
const UPLOAD_TIMEOUT_MS = 60_000
const JSON_MAX_BYTES = 16_384

const TOO_LARGE = 'The file is too large (10 MB at most).'
const NO_SUCH_ITEM = 'No such item.'
const MOVED_ON = 'That item has already moved on.'
const BAD_CURSOR = 'That page cursor is not valid.'
const MALFORMED = 'Malformed request.'

/**
 * → { body, blank } from a JSON request, or { status, error } for the reply to give instead. `body` is
 * undefined for text that is not JSON; `blank` says there was no text at all, which a hide takes as "no note".
 */
const readJson = (request) => readJsonWithin(request, { maxBytes: JSON_MAX_BYTES, tooLarge: 'The request is too large (16 KB at most).' })

export function createGalleryHandler({ access, store, r2, poll, displayNames, configured }) {
  /** A row as the site sees it: a link instead of a storage key, a display name for the author. */
  function view(row, nameFor) {
    const named = nameFor(row.author_discord_id)
    let url = row.embed_url || null
    if (typeof row.r2_key === 'string' && row.r2_key !== '') url = r2.presignGet(row.r2_key, { expiresSec: LINK_SECONDS })
    return {
      id: String(row.id),
      kind: row.kind,
      source: row.source,
      author: { id: row.author_discord_id, name: named !== COMMUNITY_MEMBER ? named : row.author_username || COMMUNITY_MEMBER },
      title: row.title,
      note: row.note,
      media: row.media,
      url,
      contentType: row.content_type,
      bytes: row.bytes == null ? null : Number(row.bytes),
      status: row.status,
      reviewNote: row.review_note,
      postedAt: new Date(row.posted_at).toISOString(),
    }
  }
  const views = async (rows) => {
    const nameFor = await displayNames.resolver()
    return rows.map((row) => view(row, nameFor))
  }
  const one = async (row) => (await views([row]))[0]

  const me = async (_request, verdict) => reply(200, { access: verdict.access, approver: verdict.approver })

  const gallery = (kind) => async (_request, _verdict, url) => {
    const before = parseBefore(url.searchParams.get('before'))
    if (before === 'bad') return reply(400, { error: BAD_CURSOR })
    const { rows, next } = await store.list({ kind, before })
    return reply(200, { items: await views(rows), next })
  }

  const mine = async (_request, verdict) => reply(200, { items: await views(await store.mine(verdict.user.id)) })

  async function submit(request, verdict) {
    if (!mediaType(request).startsWith('multipart/form-data')) return reply(415, { error: 'Send the form as multipart/form-data.' })
    // A missing Content-Length reads as 0 and an unreadable one as NaN: neither is refused here, the file size check below still runs.
    if (Number(request.headers.get('Content-Length')) > MAX_ART_BYTES + FORM_SLACK) return reply(413, { error: TOO_LARGE })
    let form
    try {
      form = await request.formData()
    } catch {
      return reply(400, { error: 'That form could not be read.' })
    }
    const file = form.get('file')
    if (!(file instanceof Blob)) return reply(400, { error: 'Choose an image to upload.' })
    if (file.size === 0) return reply(400, { error: 'That file is empty.' })
    if (file.size > MAX_ART_BYTES) return reply(413, { error: TOO_LARGE })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffImage(bytes)
    if (!type) return reply(400, { error: 'That file is not a JPEG, PNG, WebP or GIF.' })
    const fields = parseArtFields({ title: form.get('title'), note: form.get('note') ?? '' })
    if (typeof fields === 'string') return reply(400, { error: fields })

    const { id, r2Key } = await store.insertArt({ ...fields, ...type, bytes: bytes.length }, verdict.user)
    try {
      await r2.put(r2Key, bytes, { contentType: type.contentType, contentLength: bytes.length, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) })
    } catch {
      // An approver may have approved it while the file was uploading: it goes either way.
      const cleanup = await store.transition(id, { from: ['pending', 'approved'], to: 'removed', action: 'removed', actor: verdict.user, note: 'upload failed' })
      if (!cleanup.item) console.error(`Reliquarium: art item ${id} could not be removed after its upload failed.`)
      return reply(502, { error: 'The file could not be stored. Try again.' })
    }
    const row = {
      id,
      kind: 'art',
      source: 'site',
      author_discord_id: verdict.user.id,
      author_username: verdict.user.username,
      ...fields,
      media: 'image',
      r2_key: r2Key,
      embed_url: null,
      content_type: type.contentType,
      bytes: bytes.length,
      status: 'pending',
      review_note: null,
      posted_at: Date.now(),
    }
    return reply(201, { item: await one(row) })
  }

  /** A store answer ({ item } | 'missing' | 'conflict') as the reply. */
  async function moved(result) {
    if (result === 'missing') return reply(404, { error: NO_SUCH_ITEM })
    if (result === 'conflict') return reply(409, { error: MOVED_ON })
    return reply(200, { item: await one(result.item) })
  }

  async function remove(id, verdict) {
    if (!isItemId(id)) return reply(404, { error: NO_SUCH_ITEM })
    const result = await store.removeByOwner(id, verdict.user)
    if (result === 'missing') return reply(404, { error: NO_SUCH_ITEM })
    if (result === 'conflict') return reply(409, { error: MOVED_ON })
    return send(204, null)
  }

  /** The note an action records: null for an approval, the reason for a rejection, the optional note for a hide. */
  const notes = {
    approve: async () => ({ note: null }),
    async reject(request) {
      const read = await readJson(request)
      if (read.error) return read
      // Nothing to read, or not JSON at all: the reason is what is missing.
      const parsed = parseReason(read.body ?? {})
      return typeof parsed === 'string' ? { status: 400, error: parsed } : { note: parsed.reason }
    },
    async hide(request) {
      if (!request.headers.has('Content-Type')) return { note: '' }
      const read = await readJson(request)
      if (read.error) return read
      if (!read.blank && read.body === undefined) return { status: 400, error: MALFORMED }
      const parsed = parseHideNote(read.body)
      return typeof parsed === 'string' ? { status: 400, error: parsed } : { note: parsed.note }
    },
  }
  const MOVES = {
    approve: { from: ['pending', 'rejected'], to: 'approved' },
    reject: { from: ['pending'], to: 'rejected' },
    hide: { from: ['pending', 'approved', 'rejected'], to: 'hidden' },
  }

  async function act(id, action, request, verdict) {
    if (!isItemId(id)) return reply(404, { error: NO_SUCH_ITEM })
    const got = await notes[action](request)
    if (got.error) return reply(got.status, { error: got.error })
    const { from, to } = MOVES[action]
    return moved(await store.transition(id, { from, to, action: to, actor: verdict.user, note: got.note }))
  }

  const review = async () => {
    const [items, sync] = await Promise.all([store.pending().then(views), poll.status()])
    return reply(200, { items, sync })
  }

  async function events(_request, _verdict, url) {
    const before = parseBefore(url.searchParams.get('before'))
    if (before === 'bad') return reply(400, { error: BAD_CURSOR })
    const { rows, next } = await store.events({ before })
    return reply(200, {
      events: rows.map((e) => ({
        id: String(e.id),
        itemId: String(e.item_id),
        action: e.action,
        actor: { id: e.actor_discord_id, username: e.actor_username },
        note: e.note,
        createdAt: new Date(e.created_at).toISOString(),
      })),
      next,
    })
  }

  /** → { member, approver, run } for a known route, else null. `member` false: any signed-in user. */
  function find(method, pathname) {
    const member = { member: true, approver: false }
    const approver = { member: true, approver: true }
    if (method === 'GET' && pathname === '/gallery/me') return { member: false, approver: false, run: me }
    if (method === 'GET' && pathname === '/gallery/clips') return { ...member, run: gallery('clip') }
    if (method === 'GET' && pathname === '/gallery/art') return { ...member, run: gallery('art') }
    if (method === 'POST' && pathname === '/gallery/art') return { ...member, run: submit }
    if (method === 'GET' && pathname === '/gallery/mine') return { ...member, run: mine }
    if (method === 'GET' && pathname === '/gallery/review') return { ...approver, run: review }
    if (method === 'GET' && pathname === '/gallery/events') return { ...approver, run: events }
    const itemId = ITEM_ROUTE.exec(pathname)?.[1]
    if (method === 'DELETE' && itemId !== undefined) return { ...member, run: (_request, verdict) => remove(itemId, verdict) }
    const actionMatch = ACTION_ROUTE.exec(pathname)
    if (method === 'POST' && actionMatch) return { ...approver, run: (request, verdict) => act(actionMatch[1], actionMatch[2], request, verdict) }
    return null
  }

  return async function handle(request, url) {
    const { pathname } = url
    if (pathname !== '/gallery' && !pathname.startsWith('/gallery/')) return null
    const route = find(request.method, pathname)
    if (!route) return reply(404, { error: 'Not found.' })
    if (!configured) return reply(503, { error: 'The Reliquarium is not configured.' })
    try {
      const verdict = await access.resolve(request, { fresh: request.method !== 'GET' })
      if (!verdict) return reply(401, { error: 'Sign in with Discord.' })
      if (route.member && !verdict.access) return reply(403, { error: 'Restricted to the XVIIIth Legion.' })
      if (route.approver && !verdict.approver) return reply(403, { error: 'Only approvers can do that.' })
      return await route.run(request, verdict, url)
    } catch (err) {
      if (err instanceof Upstream) return reply(503, { error: 'Discord could not be reached. Try again.' })
      throw err
    }
  }
}
