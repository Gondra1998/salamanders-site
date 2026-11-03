/**
 * Shared builds API. builds routes here; reports, perks and moderation live
 * in their own modules.
 *
 * The client never gets to say who it is — every mutating request carries a
 * Discord access token (the same implicit-grant token src/lib/discordAuth.js
 * already gets), and this server calls Discord's own /users/@me with it to
 * find out who's actually asking. That's what makes delete permissions real
 * instead of "whoever knows the id can delete it": a poster can only delete
 * their own build, and a moderator (see privileges.js) can delete anyone's,
 * both checked against Discord directly, not trusted from the request body.
 */
import { Pool } from 'pg'
import { createArchiveKeyHandler } from './archiveKey.js'
import { createBakeLoader, DEFAULT_BAKE_BASE_URL } from './bake.js'
import { rowToBuild, publicBuild } from './buildRow.js'
import { createBuildModeration } from './buildModeration.js'
import { createBuildsView } from './buildsView.js'
import { validateBuildText } from './buildText.js'
import { createCompanyNotablesHandler } from './companyNotablesHandler.js'
import { createCompanyNotablesStore } from './companyNotablesStore.js'
import { applyCors } from './cors.js'
import { createDeathwatchAccess } from './deathwatchAccess.js'
import { createDeathwatchHandler } from './deathwatchHandler.js'
import { createDeathwatchStore } from './deathwatchStore.js'
import { createDiscordRoles } from './discordRoles.js'
import { createDisplayNames } from './displayNames.js'
import { createGalleryAccess } from './galleryAccess.js'
import { createGalleryDiscord } from './galleryDiscord.js'
import { createGalleryHandler } from './galleryHandler.js'
import { createGalleryPoll } from './galleryPoll.js'
import { createGalleryStore } from './galleryStore.js'
import { createHistoryStore } from './historyStore.js'
import { createMembership } from './membership.js'
import { createMembershipHandler } from './membershipHandler.js'
import { createPerksHandler } from './perks.js'
import { createPrivileges } from './privileges.js'
import { createReportsHandler } from './reports.js'
import { createRoster } from './roster.js'
import { createRosterHandler } from './rosterHandler.js'
import { createRosterPublicHandler } from './rosterPublicHandler.js'
import { createReportsStore } from './reportsStore.js'
import { createR2 } from './r2.js'
import { CAPTAIN, LEGION_HIERARCHY_ROLE } from './rosterLadder.js'
import { createNotifier } from './webhook.js'

const PORT = Number(process.env.PORT || 8787)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'
const GUILD_ID = process.env.DISCORD_GUILD_ID
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
// Overridable so E2E runs can point both identity checks at a local fixture
// instead of the real Discord API — see e2e/discord-mock.
const DISCORD_API_BASE = process.env.DISCORD_API_BASE || 'https://discord.com/api'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const roles = createDiscordRoles({ apiBase: DISCORD_API_BASE, guildId: GUILD_ID, botToken: BOT_TOKEN })
// GET /membership: is the caller a guild member? Answered live from Discord
// against the member role — see membership.js and membershipHandler.js.
const membership = createMembership({ roles, roleId: process.env.ARCHIVE_ROLE_ID })
const membershipRoutes = createMembershipHandler({ membership })
// GET /company-notables: the Companies page's notable members (real names), guild members only — see
// companyNotablesHandler.js. They are stored in the database and filled by src/seedNotables.js.
const companyNotablesRoutes = createCompanyNotablesHandler({ membership, store: createCompanyNotablesStore(pool) })
// Legion Archive key: fail-closed, gated on the same live membership check
// (the member role, asked of Discord on every call). See archiveKey.js.
const archiveKey = createArchiveKeyHandler({ membership, archiveKey: process.env.ARCHIVE_KEY })
// Build authors are shown by Discord display name, from an in-memory
// directory of the guild — see displayNames.js. The same directory knows who
// holds the member role, so the builds list can flag members.
const displayNames = createDisplayNames({
  apiBase: DISCORD_API_BASE,
  guildId: GUILD_ID,
  botToken: BOT_TOKEN,
  memberRoleId: process.env.ARCHIVE_ROLE_ID,
  ttlMs: 5 * 60_000,
})
// GET /builds: names for everyone, the member flag only for a signed-in viewer — see buildsView.js.
const buildsView = createBuildsView({ roles, displayNames })

// The Legion roster and Infirmary list — see roster.js and rosterHandler.js.
// Its own guild-member cache, never written to disk.
const roster = createRoster({
  apiBase: DISCORD_API_BASE,
  guildId: GUILD_ID,
  botToken: BOT_TOKEN,
  ttlMs: Number(process.env.ROSTER_TTL_MS) || undefined,
})
const rosterRoutes = createRosterHandler({ roles, roster })
// Public and unauthenticated: the same cache, projected to leaders by name and everyone else as counts.
const rosterPublicRoutes = createRosterPublicHandler({ roster })

// Member reports — see reports.js. Role ids default to XVIIILegion (files)
// and Reclusiarch (reviews); the webhook pings leadership with an id only.
const reports = createReportsHandler({
  roles,
  store: createReportsStore(pool),
  reporterRoleId: process.env.REPORTER_ROLE_ID || '1377787723976409211',
  reviewerRoleId: process.env.RECLUSIARCH_ROLE_ID || '1323334632904855592',
  webhookUrl: process.env.REPORTS_WEBHOOK_URL || null,
  siteUrl: ALLOWED_ORIGIN,
})

// The Deathwatch area — see deathwatchHandler.js. Its two role ids have no
// defaults: until both are set in the environment every route answers 503.
// The Deathwatch Command role id is optional: unset, nobody is Deathwatch Command.
const deathwatchStore = createDeathwatchStore(pool)
const deathwatch = createDeathwatchHandler({
  access: createDeathwatchAccess({
    roles,
    store: deathwatchStore,
    deathwatchRoleId: process.env.DEATHWATCH_ROLE_ID,
    commanderRoleId: process.env.WATCH_COMMANDER_ROLE_ID,
    deathwatchCommandRoleId: process.env.DEATHWATCH_COMMAND_ROLE_ID,
  }),
  store: deathwatchStore,
})

// The Reliquarium, members-only art and clips galleries — see galleryHandler.js. Until the clips channel
// and all four R2 values are set, every /gallery route answers 503 and the clips poll does not start.
// R2_ENDPOINT is for the e2e stack's mock only; an empty one must not replace Cloudflare's.
const r2 = createR2({
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: process.env.R2_BUCKET,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT || undefined,
})
const galleryStore = createGalleryStore(pool)
const GALLERY_CHANNEL_ID = process.env.GALLERY_CHANNEL_ID || ''
const galleryConfigured = r2.configured && /^\d{17,20}$/.test(GALLERY_CHANNEL_ID)
// Not created unconfigured (its constructor refuses bad options); the Review tab then shows no runs.
let galleryPoll = { status: async () => ({ lastRunAt: null, lastOkAt: null, lastError: null }) }
if (galleryConfigured) {
  galleryPoll = createGalleryPoll({
    discord: createGalleryDiscord({ apiBase: DISCORD_API_BASE, botToken: BOT_TOKEN }),
    r2,
    store: galleryStore,
    channelId: GALLERY_CHANNEL_ID,
    // At most setInterval's ceiling (a larger delay would fire at once, every time); unset or not above 0, two minutes.
    intervalMs: Number(process.env.GALLERY_POLL_MS) > 0 ? Math.min(Number(process.env.GALLERY_POLL_MS), 2_147_483_647) : 120_000,
  })
  galleryPoll.start()
}
const gallery = createGalleryHandler({
  access: createGalleryAccess({
    roles,
    memberRoleId: process.env.REPORTER_ROLE_ID || '1377787723976409211',
    // The curator role is optional: unset, nobody is curator and the other approver roles still work.
    approverRoleIds: [
      process.env.RECLUSIARCH_ROLE_ID || '1323334632904855592',
      CAPTAIN.id,
      LEGION_HIERARCHY_ROLE,
      process.env.GALLERY_CURATOR_ROLE_ID,
    ],
  }),
  store: galleryStore,
  r2,
  poll: galleryPoll,
  displayNames,
  configured: galleryConfigured,
})

// Perk corrections, version history, privilege revocation — see perks.js.
// The webhook is the reports one: leadership watches a single channel.
const history = createHistoryStore(pool)
const privileges = createPrivileges({ roles, store: history })
const notify = createNotifier({ url: process.env.REPORTS_WEBHOOK_URL || null, suffix: ` · ${ALLOWED_ORIGIN}/history` })
const perks = createPerksHandler({
  roles,
  privileges,
  store: history,
  notify,
  loadBake: createBakeLoader({
    baseUrl: process.env.BAKE_BASE_URL || DEFAULT_BAKE_BASE_URL,
  }),
})
const moderation = createBuildModeration({ roles, privileges, store: history, notify })

function cors(res) {
  return applyCors(res, ALLOWED_ORIGIN)
}

function json(body, status = 200, headers = {}) {
  return cors(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }),
  )
}

/** Who is this, really? Never trust an id the client hands us directly. */
async function verifyCaller(request) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const user = await res.json()
  return { id: user.id, username: user.username }
}

async function listBuilds(request) {
  const url = new URL(request.url)
  const className = url.searchParams.get('class')
  const { rows } = className
    ? await pool.query('select * from builds where deleted_at is null and class_name = $1 order by created_at desc', [className])
    : await pool.query('select * from builds where deleted_at is null order by created_at desc')
  const { nameFor, isMember, headers } = await buildsView.view(request)
  return json(
    rows.map((r) => publicBuild(rowToBuild(r), nameFor, isMember)),
    200,
    headers,
  )
}

async function createBuild(request) {
  const caller = await verifyCaller(request)
  if (!caller) return json({ error: 'Sign in with Discord to save a build.' }, 401)

  const b = await request.json().catch(() => null)
  if (!b || typeof b.title !== 'string' || typeof b.className !== 'string') {
    return json({ error: 'Malformed build.' }, 400)
  }

  const text = validateBuildText(b)
  if (typeof text === 'string') return json({ error: text }, 400)

  const { rows } = await pool.query(
    `insert into builds
       (title, role, notes, class_name, level, prestige, prestige_picks,
        perks, perk_ids, justifications, weapons, weapon_perks,
        author_discord_id, author_discord_username)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning *`,
    [
      text.title,
      text.role,
      text.notes,
      text.className,
      text.level,
      text.prestige,
      JSON.stringify(text.prestigePicks),
      JSON.stringify(text.perks),
      JSON.stringify(text.perkIds),
      JSON.stringify(text.justifications),
      JSON.stringify(text.weapons),
      JSON.stringify(text.weaponPerks),
      caller.id,
      caller.username,
    ],
  )
  return json(publicBuild(rowToBuild(rows[0]), await displayNames.resolver()), 201)
}

Bun.serve({
  port: PORT,
  // Bun's default is 128 MB. The largest legitimate body is a Reliquarium art upload (a 10 MB file plus its
  // form fields); this refuses anything bigger (a chunked body included) before a handler reads it into memory.
  maxRequestBodySize: 12 * 1024 * 1024,
  async fetch(request) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))

    const url = new URL(request.url)
    const idMatch = url.pathname.match(/^\/builds\/(\d+)$/)

    try {
      const reportsRes = await reports(request, url)
      if (reportsRes) return cors(reportsRes)
      const deathwatchRes = await deathwatch(request, url)
      if (deathwatchRes) return cors(deathwatchRes)
      const galleryRes = await gallery(request, url)
      if (galleryRes) return cors(galleryRes)
      const perksRes = await perks(request, url)
      if (perksRes) return cors(perksRes)
      const rosterPublicRes = await rosterPublicRoutes(request, url)
      if (rosterPublicRes) return cors(rosterPublicRes)
      const rosterRes = await rosterRoutes(request, url)
      if (rosterRes) return cors(rosterRes)
      const membershipRes = await membershipRoutes(request, url)
      if (membershipRes) return cors(membershipRes)
      const companyNotablesRes = await companyNotablesRoutes(request, url)
      if (companyNotablesRes) return cors(companyNotablesRes)
      if (url.pathname === '/health') return json({ ok: true })
      if (url.pathname === '/archive/key' && request.method === 'GET') return cors(await archiveKey(request))
      if (url.pathname === '/builds/moderator' && request.method === 'GET') return cors(await moderation.status(request))
      if (url.pathname === '/builds' && request.method === 'GET') return await listBuilds(request)
      if (url.pathname === '/builds' && request.method === 'POST') return await createBuild(request)
      if (idMatch && request.method === 'DELETE') return cors(await moderation.remove(request, idMatch[1]))
      return json({ error: 'Not found.' }, 404)
    } catch (err) {
      console.error(err)
      return json({ error: 'Internal error.' }, 500)
    }
  },
})

console.log(`Builds API listening on :${PORT}`)
