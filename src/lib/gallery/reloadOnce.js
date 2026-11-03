// A signed media link lasts 15 minutes, so a clip that fails to play is most likely just old: fetching the list
// again gives it a fresh link. That is worth doing once. An item that fails again straight after is really broken,
// and asking again would loop. The list is rebuilt when it is fetched again, which throws every card away, so what
// has already been asked for is remembered here, by item id, and not in the card.
const asked = new Set()

/** → true the first time `id` fails (the list should be fetched again), false when it fails again before it has loaded. */
export function shouldReload(id) {
  if (asked.has(id)) return false
  asked.add(id)
  return true
}

/** The item's media loaded: if it fails again later (the new link expired too), that is a new first failure. */
export function loaded(id) {
  asked.delete(id)
}

/** For tests: forget everything. */
export function forgetReloads() {
  asked.clear()
}
