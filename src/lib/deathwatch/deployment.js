/**
 * The battle-brothers holding the Discord role "Deathwatch Deployment": the names Manage offers for a Kill Team's
 * slots, and the avatar a player's name is shown with. → [{ id, name, avatar }] (avatar may be null).
 * Live from the server; anyone it refuses gets an empty list, and names stay free text.
 * In fixture mode (dev only, see fixture.js) the invented players of fixtureData.js and a few more not yet on a team.
 */
import { ref } from 'vue'
import { request } from '../buildsApi'
import { useAuth } from '../../stores/auth'

export async function getDeployment(token) {
  if (import.meta.env.DEV && import.meta.env.VITE_DEATHWATCH_FIXTURE) {
    const { teams } = (await import('./fixtureData')).fixtureData()
    const names = [...Object.values(teams).flatMap((t) => t.ro), 'Brother Orrin', 'Brother Kesh', 'Brother Daval']
    return names.map((name, i) => ({ id: String(300000000000000001n + BigInt(i)), name, avatar: null }))
  }
  // GET /deathwatch/deployment (server/src/deathwatchHandler.js): only the Event Tracker's readers get it.
  return (await request('/deathwatch/deployment', { token, cache: 'no-store' })).members
}

const list = ref([])
let asked = false
/** The list, fetched once per page load and shared. Empty until it arrives, or if it fails. */
export function useDeployment() {
  if (!asked) {
    asked = true
    getDeployment(useAuth().token)
      .then((v) => (list.value = v))
      .catch(() => {})
  }
  return list
}
