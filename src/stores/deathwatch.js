import { defineStore } from 'pinia'
import { getMe } from '../lib/deathwatch/api'
import { loadFixture } from '../lib/deathwatch/fixture'

// Whether the signed-in user may see the Deathwatch area, whether they are the Watch Commander, and whether they
// hold the Deathwatch Command role (the Armouring Hall's Watch Command tab): the answer to GET /deathwatch/me,
// nothing more. It only decides what to show; the server enforces every read
// and write again. Statuses: idle, checking, allowed, denied, signin, unavailable.

// One counter for every call: an answer lands only if no later load() or reset() has started since, so a
// slow response can never bring back a state the user has already left (sign-out resets).
let seq = 0

// A server that never answers counts as out of reach after this long, so the gate can offer to try again instead
// of waiting until the browser gives up (minutes). An answer that comes later is dropped: "Try again" asks anew.
export const ME_TIMEOUT_MS = 10_000

const statusOf = (err) => (err?.status === 401 ? 'signin' : err?.status === 403 ? 'denied' : 'unavailable')

export const useDeathwatch = defineStore('deathwatch', {
  state: () => ({ status: 'idle', commander: false, command: false }),
  actions: {
    async load(token) {
      const mine = ++seq
      // Straight away, before anything is awaited: this store outlives the gate, so an earlier visit's clearance
      // (even a commander's) must not be what the first render of a return visit sees.
      this.$patch({ status: 'checking', commander: false, command: false })
      const fixture = await loadFixture()
      if (mine !== seq) return
      if (fixture) {
        // A dev scene: show that state without asking the server.
        this.$patch({ status: fixture.status, commander: fixture.commander, command: fixture.command })
        return
      }
      if (!token) {
        this.$patch({ status: 'signin', commander: false, command: false })
        return
      }
      let timer
      try {
        const late = new Promise((_, no) => (timer = setTimeout(no, ME_TIMEOUT_MS)))
        const me = await Promise.race([getMe(token), late])
        if (mine !== seq) return
        // Only a plain `true` counts: anything else fails closed. A commander always has access, and sees what
        // Deathwatch Command sees.
        const allowed = me?.access === true
        const commander = allowed && me.watchCommander === true
        this.$patch({ status: allowed ? 'allowed' : 'denied', commander, command: commander || (allowed && me.deathwatchCommand === true) })
      } catch (err) {
        if (mine !== seq) return
        this.$patch({ status: statusOf(err), commander: false, command: false })
      } finally {
        clearTimeout(timer)
      }
    },

    reset() {
      seq++
      this.$patch({ status: 'idle', commander: false, command: false })
    },
  },
})
