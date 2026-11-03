/**
 * Stand-in for Discord's API in E2E tests. Both server/src/index.js
 * (verifyCaller) and src/lib/discordAuth.js (finishSignIn) identify a caller
 * by POSTing their bearer token to Discord's own /users/@me — this returns
 * canned identities for a fixed set of test tokens so the whole sign-in →
 * save → see-it-listed flow can be driven without a real Discord account.
 * Membership (member vs. non-member) is decided by the role table below
 * (MEMBERS), checked against the API's configured member role
 * (ARCHIVE_ROLE_ID), same as prod, which asks Discord. The API reads it two
 * ways: a caller's own roles (/membership) and the guild member directory
 * (/v10/guilds/:id/members), which flags each author on the builds list.
 *
 * It also stands in for the Reliquarium's three outside services (e2e/tests/gallery*.spec.js): the Discord
 * clips channel the api polls, Discord's CDN its attachments download from, and the R2 bucket they are copied
 * into (path-style, at /<bucket>/<key>, which is where server/src/r2.js puts an object for R2_ENDPOINT
 * http://discord-mock:4400).
 */
const PORT = Number(process.env.PORT || 4400)
// How the api and the browser reach this mock: the address an attachment's CDN link names.
const SELF = process.env.MOCK_BASE_URL || `http://discord-mock:${PORT}`

const USERS = {
  // In MEMBERS with the Legion role, so the API reports a member.
  'test-member-token': { id: '300000000000000010', username: 'member-tester' },
  // Well-formed but deliberately absent from MEMBERS: not in the guild at all.
  'test-nonmember-token': { id: '999999999999999999', username: 'nonmember-tester' },
  // In the guild (in MEMBERS) but without the Legion role.
  'test-norole-token': { id: '300000000000000014', username: 'norole-tester' },
  // Legion member who also holds Reclusiarch — reviews reports.
  'test-reclusiarch-token': { id: '100000000000000002', username: 'reclusiarch-tester' },
  // Techmarine — edits perks, sees history, moderates builds.
  'test-techmarine-token': { id: '100000000000000010', username: 'techmarine-tester' },
  // Master of the Forge — may revoke the Techmarine.
  'test-forge-token': { id: '100000000000000011', username: 'forge-tester' },
  // Company command (Captain of the 3rd) — may open the Infirmary list.
  'test-captain-token': { id: '100000000000000020', username: 'captain-tester' },
  // Deathwatch area (e2e/tests/deathwatch-api.spec.js): invented ids, here and in DEATHWATCH_MEMBERS.
  'test-deathwatch-token': { id: '200000000000000001', username: 'deathwatch-tester' },
  'test-commander-token': { id: '200000000000000002', username: 'commander-tester' },
  // Holds the second of the two Deathwatch roles the api is given as a list.
  'test-deathwatch-second-token': { id: '200000000000000004', username: 'deathwatch-second-tester' },
  // The guild owner and a holder of an Administrator role: both open the Deathwatch area, neither is a Commander.
  'test-owner-token': { id: '200000000000000005', username: 'owner-tester' },
  'test-admin-token': { id: '200000000000000006', username: 'admin-tester' },
  // The Deathwatch Command role: with a Deathwatch role (a member), and on its own (no way in).
  'test-command-token': { id: '200000000000000007', username: 'command-tester' },
  'test-command-only-token': { id: '200000000000000008', username: 'command-only-tester' },
  // Not in the guild at all: the spec gives this id a grant and takes it away again.
  'test-granted-token': { id: '200000000000000003', username: 'granted-tester' },
  // Reliquarium curator (e2e/tests/gallery-api.spec.js): an invented id, here and in GALLERY_MEMBERS.
  'test-curator-token': { id: '200000000000000302', username: 'curator-tester' },
}
const LEGION_ROLE = '1377787723976409211'
const RECLUSIARCH_ROLE = '1323334632904855592'
const TECHMARINE_ROLE = '1322056087859499042'
const FORGE_ROLE = '1322056087867883565'
const CAPTAIN_ROLE = '1322056087867883561'
const THIRD_COMPANY_ROLE = '1322056087850979333'
const THIRD_COMMAND_ROLE = '1323056001779241034'
const SERGEANT_ROLE = '1322056087859499044'
const LORD_OF_DRAKES_ROLE = '1322056087888859199'
const SCOUT_ROLE = '1430743608822206504'
const INFIRMARY_ROLE = '1362059023481831517'
const GUILD_ID = '1322056087792521269'
// Invented ids; e2e/docker-compose.yml hands the same ones to the api (DEATHWATCH_ROLE_ID is a list of two,
// WATCH_COMMANDER_ROLE_ID and DEATHWATCH_COMMAND_ROLE_ID single ids).
const DEATHWATCH_ROLE = '200000000000000101'
const DEATHWATCH_SECOND_ROLE = '200000000000000103'
const ADMINISTRATOR_ROLE = '200000000000000104'
const GUILD_OWNER_ID = '200000000000000005'
const WATCH_COMMANDER_ROLE = '200000000000000102'
const DEATHWATCH_COMMAND_ROLE = '200000000000000110'
// Deathwatch members answer the single-member lookup only. They stay out of MEMBERS, which feeds the
// full member list, so the roster specs' counts do not change.
const DEATHWATCH_MEMBERS = {
  '200000000000000001': { roles: [DEATHWATCH_ROLE] },
  '200000000000000002': { roles: [WATCH_COMMANDER_ROLE] },
  '200000000000000004': { roles: [DEATHWATCH_SECOND_ROLE] },
  '200000000000000005': { roles: [] },
  '200000000000000006': { roles: [ADMINISTRATOR_ROLE] },
  '200000000000000007': { roles: [DEATHWATCH_ROLE, DEATHWATCH_COMMAND_ROLE] },
  '200000000000000008': { roles: [DEATHWATCH_COMMAND_ROLE] },
}
// The Reliquarium curator role (GALLERY_CURATOR_ROLE_ID) and its holder, a Legion member. Kept out of MEMBERS for
// the same reason as the Deathwatch testers: a Legion member there would join the roster the other specs read.
const CURATOR_ROLE = '200000000000000301'
const GALLERY_MEMBERS = {
  '200000000000000302': { roles: [LEGION_ROLE, CURATOR_ROLE] },
}
// Guild membership as Discord's bot endpoint would report it.
const MEMBERS = {
  // Has a server nickname, so builds show it instead of the username.
  '300000000000000010': { roles: [LEGION_ROLE], nick: 'Brother Tester' },
  '300000000000000014': { roles: [] },
  '100000000000000002': { roles: [LEGION_ROLE, RECLUSIARCH_ROLE] },
  '100000000000000010': { roles: [LEGION_ROLE, TECHMARINE_ROLE] },
  '100000000000000011': { roles: [LEGION_ROLE, FORGE_ROLE] },
  '100000000000000020': { roles: [LEGION_ROLE, CAPTAIN_ROLE, THIRD_COMPANY_ROLE, THIRD_COMMAND_ROLE], nick: 'E2E Captain' },
  '100000000000000021': { roles: [LEGION_ROLE, SERGEANT_ROLE, THIRD_COMPANY_ROLE], nick: 'E2E Sergeant' },
  '100000000000000022': { roles: [LEGION_ROLE, INFIRMARY_ROLE, SCOUT_ROLE], nick: 'E2E Convalescent' },
  '100000000000000023': { roles: [INFIRMARY_ROLE], nick: 'E2E Recruit On Leave' },
  '100000000000000024': { roles: [LEGION_ROLE, SCOUT_ROLE, THIRD_COMPANY_ROLE], nick: 'E2E Leaver' },
  '100000000000000025': { roles: [LEGION_ROLE], nick: 'E2E Servitor', bot: true },
  '100000000000000026': { roles: [LEGION_ROLE, LORD_OF_DRAKES_ROLE], nick: 'E2E Lord' },
}

// --- The Reliquarium: the clips channel, the CDN and R2, all in memory ---

// The same ids e2e/docker-compose.yml hands the api (GALLERY_CHANNEL_ID, R2_BUCKET).
const GALLERY_CHANNEL = '200000000000000300'
const R2_BUCKET = 'e2e-bucket'

// What an attachment can be: the files in ./fixtures, read once. clip.webm is the one a browser test plays
// (Playwright's open-source Chromium may not decode H.264); clip.mp4 is what the api spec checks byte for byte.
const FIXTURE_TYPES = { 'clip.mp4': 'video/mp4', 'clip.webm': 'video/webm', 'art.png': 'image/png' }
const FIXTURES = {}
for (const [name, type] of Object.entries(FIXTURE_TYPES)) {
  FIXTURES[name] = { type, bytes: new Uint8Array(await Bun.file(`${import.meta.dir}/fixtures/${name}`).arrayBuffer()) }
}

// Discord ids: milliseconds since Discord's epoch in the top bits, so a later message has a larger id. The
// counter keeps two ids made in the same millisecond apart and in order.
const DISCORD_EPOCH = 1420070400000n
let lastSnowflake = 0n
function snowflake() {
  let id = (BigInt(Date.now()) - DISCORD_EPOCH) << 22n
  if (id <= lastSnowflake) id = lastSnowflake + 1n
  lastSnowflake = id
  return String(id)
}

// The channel's messages, oldest first (ids only grow, so this is also id order).
const channel = []
function postMessage(user, content, names) {
  const message = {
    id: snowflake(),
    channel_id: GALLERY_CHANNEL,
    type: 0,
    content,
    timestamp: new Date().toISOString(),
    author: { id: user.id, username: user.username, global_name: null },
    attachments: names.map((name) => ({
      id: snowflake(),
      filename: name,
      size: FIXTURES[name].bytes.length,
      content_type: FIXTURES[name].type,
      url: `${SELF}/cdn/${name}`,
      proxy_url: `${SELF}/cdn/${name}`,
    })),
  }
  channel.push(message)
  return message
}
// Already in the channel when the api starts, so its first poll pass takes this as the newest message and
// stores nothing (e2e/tests/gallery-api.spec.js checks, by this title, that it never appears).
const PRE_LAUNCH_TITLE = 'E2E posted before launch'
postMessage(USERS['test-member-token'], PRE_LAUNCH_TITLE, ['clip.mp4'])

// Discord's answer to GET /channels/:id/messages: at most `limit` (1 to 100, default 50), newest first. With
// `after`, the `limit` messages just after that id (the oldest ones past it), still newest first.
function messagesPage(params) {
  const limit = Math.min(Math.max(Number.parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100)
  const after = params.get('after')
  if (after !== null && !/^\d{1,20}$/.test(after)) return null
  const picked = after === null ? channel.slice(-limit) : channel.filter((m) => BigInt(m.id) > BigInt(after)).slice(0, limit)
  return picked.reverse()
}

// R2: key → { type, bytes }. Nothing checks a signature; the mock only insists on the headers r2.js always sends.
const objects = new Map()
const s3Error = (status, code) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code></Error>`, {
    status,
    headers: { 'Content-Type': 'application/xml' },
  })

// One `bytes=` range of an object `total` bytes long → { start, end } (inclusive), 'unsatisfiable', or null to
// ignore the header and send the whole object (no header, several ranges, or one that does not parse).
function byteRange(header, total) {
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  if (m[1] === '') {
    const suffix = Number(m[2])
    return suffix === 0 || total === 0 ? 'unsatisfiable' : { start: Math.max(0, total - suffix), end: total - 1 }
  }
  const start = Number(m[1])
  const end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1)
  if (m[2] !== '' && Number(m[2]) < start) return null
  return start >= total ? 'unsatisfiable' : { start, end }
}

async function r2(request, key) {
  if (request.method === 'PUT') {
    const auth = request.headers.get('Authorization') || ''
    if (
      !auth.startsWith('AWS4-HMAC-SHA256 Credential=') ||
      request.headers.get('x-amz-content-sha256') !== 'UNSIGNED-PAYLOAD' ||
      !request.headers.get('x-amz-date')
    ) {
      return s3Error(403, 'AccessDenied')
    }
    const bytes = new Uint8Array(await request.arrayBuffer())
    const declared = request.headers.get('Content-Length')
    if (declared !== null && Number(declared) !== bytes.length) return s3Error(400, 'IncompleteBody')
    objects.set(key, { type: request.headers.get('Content-Type') || 'application/octet-stream', bytes })
    return new Response(null, { status: 200, headers: { ETag: `"${Bun.hash(bytes).toString(16)}"` } })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return s3Error(405, 'MethodNotAllowed')
  // A presigned GET: its X-Amz-* query is ignored.
  const object = objects.get(key)
  if (!object) return s3Error(404, 'NoSuchKey')
  const total = object.bytes.length
  const headers = { 'Content-Type': object.type, 'Accept-Ranges': 'bytes' }
  const range = byteRange(request.headers.get('Range'), total)
  if (range === 'unsatisfiable') {
    const refused = s3Error(416, 'InvalidRange')
    refused.headers.set('Content-Range', `bytes */${total}`)
    return refused
  }
  const body = range ? object.bytes.slice(range.start, range.end + 1) : object.bytes
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${total}`
  headers['Content-Length'] = String(body.length)
  return new Response(request.method === 'HEAD' ? null : body, { status: range ? 206 : 200, headers })
}

// The browser calls this cross-origin (from wherever "web" is served), unlike
// the real discord.com/api which already sends permissive CORS headers for
// exactly this kind of client-side OAuth flow — this mock has to do the same.
function withCors(res) {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  return res
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }))

    const url = new URL(request.url)

    if (url.pathname === '/users/@me') {
      const auth = request.headers.get('Authorization') || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
      const user = token && USERS[token]
      if (!user) {
        return withCors(Response.json({ message: '401: Unauthorized', code: 0 }, { status: 401 }))
      }
      return withCors(Response.json(user))
    }

    // Guild role table (Administrator checks). Nobody is an admin except the Deathwatch-area owner and
    // Administrator testers; everyone else, the Legion testers included, is not.
    if (url.pathname === `/v10/guilds/${GUILD_ID}`) {
      return withCors(
        Response.json({
          owner_id: GUILD_OWNER_ID,
          roles: [
            { id: GUILD_ID, permissions: '0' },
            { id: RECLUSIARCH_ROLE, permissions: '0' },
            { id: ADMINISTRATOR_ROLE, permissions: '8' },
          ],
        }),
      )
    }

    // Full member list (build authors' display names, see displayNames.js).
    if (url.pathname === `/v10/guilds/${GUILD_ID}/members`) {
      const byId = Object.fromEntries(Object.values(USERS).map((u) => [u.id, u]))
      const list = Object.entries(MEMBERS).map(([id, m]) => ({
        nick: m.nick ?? null,
        roles: m.roles,
        user: { id, username: byId[id]?.username ?? `user-${id}`, global_name: null, ...(m.bot ? { bot: true } : {}) },
      }))
      return withCors(Response.json(list))
    }

    // Guild member lookups (mod-role, report-role and perk-privilege checks).
    // The Techmarine and Forge testers hold mod roles; nobody else does.
    const memberMatch = url.pathname.match(/^\/v10\/guilds\/[^/]+\/members\/([^/]+)$/)
    if (memberMatch) {
      const member = MEMBERS[memberMatch[1]] ?? DEATHWATCH_MEMBERS[memberMatch[1]] ?? GALLERY_MEMBERS[memberMatch[1]]
      return withCors(member ? Response.json(member) : Response.json({ message: 'Unknown Member' }, { status: 404 }))
    }

    // The wiki bake, standing in for raw.githubusercontent.com (BAKE_BASE_URL).
    const bakeMatch = url.pathname.match(/^\/bake\/(weapon-trees|perk-details)\.json$/)
    if (bakeMatch) return withCors(new Response(Bun.file(`/bake/${bakeMatch[1]}.json`), { headers: { 'Content-Type': 'application/json' } }))

    // Test hook: a member leaves the guild (the leaver spec).
    const leave = url.pathname.match(/^\/__test\/leave\/(\d+)$/)
    if (leave && request.method === 'POST') {
      delete MEMBERS[leave[1]]
      return withCors(Response.json({ left: leave[1] }))
    }

    // The clips channel, as the bot reads it (server/src/galleryDiscord.js). Any other channel is unknown.
    const channelMatch = url.pathname.match(/^\/v10\/channels\/(\d+)\/messages(?:\/(\d+))?$/)
    if (channelMatch && request.method === 'GET') {
      if (channelMatch[1] !== GALLERY_CHANNEL) return withCors(Response.json({ message: 'Unknown Channel', code: 10003 }, { status: 404 }))
      if (channelMatch[2] !== undefined) {
        const message = channel.find((m) => m.id === channelMatch[2])
        return withCors(message ? Response.json(message) : Response.json({ message: 'Unknown Message', code: 10008 }, { status: 404 }))
      }
      const page = messagesPage(url.searchParams)
      return withCors(page ? Response.json(page) : Response.json({ message: 'Invalid Form Body', code: 50035 }, { status: 400 }))
    }

    // Discord's CDN: an attachment's download link.
    const cdnMatch = url.pathname.match(/^\/cdn\/([^/]+)$/)
    if (cdnMatch && request.method === 'GET') {
      const file = Object.hasOwn(FIXTURES, cdnMatch[1]) ? FIXTURES[cdnMatch[1]] : null
      if (!file) return withCors(new Response('Not found', { status: 404 }))
      return withCors(new Response(file.bytes, { headers: { 'Content-Type': file.type, 'Content-Length': String(file.bytes.length) } }))
    }

    // R2, path-style: /<bucket>/<key>. The browser loads these links too (a <video> or <img> src), hence the CORS.
    if (url.pathname.startsWith(`/${R2_BUCKET}/`)) return withCors(await r2(request, url.pathname.slice(R2_BUCKET.length + 2)))

    // Test hook: someone posts in the clips channel. Body { token, content, attachments: ['clip.mp4', ...] } → { id }.
    if (url.pathname === '/__test/channel/post' && request.method === 'POST') {
      const body = await request.json().catch(() => null)
      const user = body && USERS[body.token]
      const names = Array.isArray(body?.attachments) ? body.attachments : []
      if (!user || typeof body.content !== 'string' || !names.every((n) => Object.hasOwn(FIXTURES, n))) {
        return withCors(Response.json({ error: 'Need a known token, content, and attachments named from ./fixtures.' }, { status: 400 }))
      }
      return withCors(Response.json({ id: postMessage(user, body.content, names).id }))
    }

    // Test hook: a clips channel message is deleted in Discord. → { deleted: whether it was there }.
    const deleteMatch = url.pathname.match(/^\/__test\/channel\/delete\/(\d+)$/)
    if (deleteMatch && request.method === 'POST') {
      const at = channel.findIndex((m) => m.id === deleteMatch[1])
      if (at !== -1) channel.splice(at, 1)
      return withCors(Response.json({ deleted: at !== -1 }))
    }

    return withCors(new Response('Not found', { status: 404 }))
  },
})

console.log(`Discord mock listening on :${PORT}`)
