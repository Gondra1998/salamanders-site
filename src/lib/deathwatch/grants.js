/**
 * The Deathwatch grants (server/src/deathwatchHandler.js): access given by hand to one Discord user, without a role.
 * Watch Commander only; the server checks that on every call. Each throws a BuildsApiError carrying the status.
 * In fixture mode (dev only, see fixture.js) an invented list held in memory, so the view can be tried without a server.
 */
import { request } from '../buildsApi'

const local = () => import.meta.env.DEV && !!import.meta.env.VITE_DEATHWATCH_FIXTURE
const invented = [
  { discordId: '300000000000000101', grantedBy: '300000000000000001', grantedAt: '2026-10-02T18:00:00Z' },
  { discordId: '300000000000000102', grantedBy: '300000000000000001', grantedAt: '2026-10-20T19:30:00Z' },
]

/** → [{ discordId, grantedBy, grantedAt }], oldest first. */
export async function listGrants(token) {
  if (local()) return invented.map((g) => ({ ...g }))
  return (await request('/deathwatch/grants', { token, cache: 'no-store' })).grants
}

export async function addGrant(token, discordId) {
  if (local()) {
    if (!invented.some((g) => g.discordId === discordId)) invented.push({ discordId, grantedBy: '300000000000000001', grantedAt: new Date().toISOString() })
    return
  }
  await request('/deathwatch/grants', { method: 'POST', token, body: { discordId } })
}

export async function removeGrant(token, discordId) {
  if (local()) {
    const i = invented.findIndex((g) => g.discordId === discordId)
    if (i >= 0) invented.splice(i, 1)
    return
  }
  await request(`/deathwatch/grants/${encodeURIComponent(discordId)}`, { method: 'DELETE', token })
}
