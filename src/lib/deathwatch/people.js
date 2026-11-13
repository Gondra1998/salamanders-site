/**
 * The people the Watch Commander gives access by hand (server/src/deathwatchHandler.js): the member search, the
 * list, adding and removing one kind (desk, watchcommand, deathwatch) for one person. The server checks who may do
 * each on every call; each throws a BuildsApiError carrying the status.
 * In fixture mode (dev only, see fixture.js) invented members and a list held in memory, so the page can be tried
 * without a server.
 */
import { request } from '../buildsApi'

const local = () => import.meta.env.DEV && !!import.meta.env.VITE_DEATHWATCH_FIXTURE

// Invented, two of them of one name, as a guild has.
const MEMBERS = [
  ['300000000000000201', 'Brother Valen'],
  ['300000000000000202', 'Brother Varro'],
  ['300000000000000203', 'Brother Kael'],
  ['300000000000000204', 'Brother Ostar'],
  ['300000000000000205', 'Brother Ostar'],
  ['300000000000000206', 'Brother Avar'],
].map(([id, name]) => ({ id, name, avatar: null }))
const given = [{ id: '300000000000000201', kind: 'desk', grantedBy: 'Watch Commander', grantedAt: '2026-10-02T18:00:00Z' }]
const named = (r) => ({ ...r, name: MEMBERS.find((m) => m.id === r.id)?.name ?? null, avatar: null })

/** → [{ id, name, avatar }]: members whose display name holds `q`, or the one whose id it is. */
export async function searchMembers(token, q) {
  if (local()) {
    const t = q.trim().toLowerCase()
    return t.length < 2 ? [] : MEMBERS.filter((m) => m.id === t || m.name.toLowerCase().includes(t))
  }
  return (await request(`/deathwatch/members?q=${encodeURIComponent(q)}`, { token, cache: 'no-store' })).members
}

/** → [{ id, kind, name, avatar, grantedBy, grantedAt }], everyone given access by hand. */
export async function listAccess(token) {
  if (local()) return given.map(named)
  return (await request('/deathwatch/access', { token, cache: 'no-store' })).people
}

export async function addAccess(token, discordId, kind) {
  if (local()) {
    if (!given.some((r) => r.id === discordId && r.kind === kind)) given.push({ id: discordId, kind, grantedBy: 'Watch Commander', grantedAt: new Date().toISOString() })
    return
  }
  await request('/deathwatch/access', { method: 'POST', token, body: { discordId, kind } })
}

export async function removeAccess(token, discordId, kind) {
  if (local()) {
    const i = given.findIndex((r) => r.id === discordId && r.kind === kind)
    if (i >= 0) given.splice(i, 1)
    return
  }
  await request(`/deathwatch/access/${encodeURIComponent(discordId)}/${encodeURIComponent(kind)}`, { method: 'DELETE', token })
}
