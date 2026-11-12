import { computed, onUnmounted, shallowRef } from 'vue'
import { listBuilds as sharedListBuilds } from './buildsApi'
import { CLASS_NAMES } from '../stores/planner'
import weapons from '../data/weapons.json'
import companies from '../data/companies.json'

// Counted once, when the module loads: the data files are bundled, so they cannot change under a running page.
const WEAPON_TOTAL = Object.values(weapons.fallbackWeapons).reduce((n, list) => n + list.length, 0)

/**
 * The live facts on the landing page's muster rows, keyed by the row's route. Three are counted from the bundled
 * data and are there from the first paint; the builds count asks the builds API once, when the page is created, and
 * is null until the answer is in. A failed request leaves it null: the row just goes without a fact, and nothing is
 * logged or shown. So does an answer of none: "0 posted" would persuade nobody. An answer that lands after the page
 * has gone is dropped.
 *
 * options.listBuilds  the request, called as listBuilds(undefined, undefined): the whole list, no token (default:
 *                     buildsApi.listBuilds)
 */
export function useMusterFacts({ listBuilds = sharedListBuilds } = {}) {
  const posted = shallowRef(null)
  let alive = true
  onUnmounted(() => {
    alive = false
  })

  // Started here, in setup, so the answer is on its way while the page paints. Everything is caught: this is
  // decoration, and a bad answer or a dead API must not reach the console or the user.
  async function loadPosted() {
    try {
      const list = await listBuilds(undefined, undefined)
      if (alive && Array.isArray(list)) posted.value = list.length
    } catch {
      // no fact is the failure state
    }
  }
  loadPosted()

  const facts = computed(() => ({
    '/planner': `${CLASS_NAMES.length} classes`,
    '/armoury': `${WEAPON_TOTAL} weapons`,
    '/builds': posted.value ? `${posted.value} posted` : null,
    '/companies': `${companies.length} companies and sections`,
  }))

  return { facts }
}
