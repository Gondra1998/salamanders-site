import { resolveArea } from './areas'

// One address for every Deathwatch page. It is the router's global guard (router.beforeEach), not the area route's
// own beforeEnter, because that does not fire when only the tab or item changes within the area, and a guard inside
// DeathwatchArea would not exist while the gate is up and the page is not mounted. Returns undefined to carry on,
// or where to go instead.

// A segment of the address as the visitor typed it. A malformed escape is left as it is rather than thrown at.
const decoded = (segment) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * `to` is the route being entered ({ path, params, query, hash }).
 * - An area we do not have goes to the not-found page, with the address left as typed. The router encodes the
 *   path segments it is given, so they are handed over decoded, or `A%20B` would come out as `A%2520B`.
 * - A page whose address is not its canonical one (a missing or unknown tab, a trailing slash, an item on an area
 *   that has none) is replaced with the canonical address, keeping the query (a ?scene= fixture) and the hash.
 */
export function deathwatchRedirect(to) {
  if (to.name !== 'deathwatch-area') return undefined // every other page is not ours to touch
  // Manage was renamed the Administratum (2026-11): its old addresses still lead there.
  const page = resolveArea(to.params.area === 'manage' ? { ...to.params, area: 'administratum' } : to.params)
  const { query, hash } = to
  if (!page) {
    return { name: 'not-found', params: { pathMatch: to.path.split('/').filter(Boolean).map(decoded) }, query, hash }
  }
  return page.canonical === to.path ? undefined : { path: page.canonical, query, hash, replace: true }
}
