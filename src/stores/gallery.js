import { defineStore } from 'pinia'
import * as api from '../lib/gallery/api'

// What the Reliquarium pages show: whether the signed-in user may see it (the answer to GET /gallery/me), whether
// they are an approver, and the lists the pages fill. It only decides what to show; the server enforces every read
// and write again. Statuses: idle, checking, allowed, denied, signin, unavailable.
// One counter for every load() and reset(): a load's answer lands only if no later load() or reset() has started
// since, so a slow response can never bring back a state the user has already left (sign-out resets).
let seq = 0
// The same for each list: reset() and refresh() start a new generation of it, and a page asked for under an
// older one is dropped (answer or failure), so it cannot land in a list that was emptied or started again.
const gen = { clips: 0, art: 0 }

const statusOf = (err) => (err?.status === 401 ? 'signin' : err?.status === 403 ? 'denied' : 'unavailable')

const initial = () => ({
  status: 'idle',
  approver: false,
  clips: { items: [], next: null, loading: false },
  art: { items: [], next: null, loading: false },
  mine: [],
  review: { items: [], sync: null },
  error: '',
})

const PAGE = { clips: api.listClips, art: api.listArt }

// An item that is gone for everyone leaves the galleries at once, without waiting for them to be fetched again.
function dropItem(store, id) {
  store.clips.items = store.clips.items.filter((i) => i.id !== id)
  store.art.items = store.art.items.filter((i) => i.id !== id)
}

// → { items, next } for one page of a list, or null if the list has moved on while it was asked for. Stops the
// list's loading flag, unless a newer refresh() owns it now.
async function fetchPage(store, kind, token, before) {
  const mine = gen[kind]
  try {
    const { items, next } = await PAGE[kind](token, before)
    return mine === gen[kind] ? { items, next: next ?? null } : null
  } catch (err) {
    if (mine === gen[kind]) throw err
    return null
  } finally {
    if (mine === gen[kind]) store[kind].loading = false
  }
}

// Runs one action: the message of a failure is kept in `error` for the page to show, and the failure goes on to the caller.
async function attempt(store, run) {
  store.error = ''
  try {
    return await run()
  } catch (err) {
    store.error = err?.message || 'Something went wrong.'
    throw err
  }
}

export const useGallery = defineStore('gallery', {
  state: initial,
  actions: {
    async load(token) {
      const mine = ++seq
      // Straight away, before anything is awaited: this store outlives the gate, so an earlier visit's clearance
      // (even an approver's) must not be what the first render of a return visit sees.
      this.$patch({ status: token ? 'checking' : 'signin', approver: false, error: '' })
      if (!token) return
      try {
        const me = await api.getMe(token)
        if (mine !== seq) return
        // Only a plain `true` counts: anything else fails closed.
        const allowed = me?.access === true
        this.$patch({ status: allowed ? 'allowed' : 'denied', approver: allowed && me.approver === true })
      } catch (err) {
        if (mine !== seq) return
        this.$patch({ status: statusOf(err), approver: false })
      }
    },

    reset() {
      seq++
      gen.clips++
      gen.art++
      this.$patch(initial())
    },

    refresh(kind, token) {
      gen[kind]++
      return attempt(this, async () => {
        this.$patch({ [kind]: { items: [], next: null, loading: true } })
        const page = await fetchPage(this, kind, token, null)
        if (page) this.$patch({ [kind]: page })
      })
    },

    async more(kind, token) {
      const list = this[kind]
      // No cursor means the end of the list: asking without one would fetch the first page again.
      if (list.loading || list.next === null) return
      await attempt(this, async () => {
        list.loading = true
        const page = await fetchPage(this, kind, token, list.next)
        if (page) {
          list.items.push(...page.items)
          list.next = page.next
        }
      })
    },

    loadMine(token) {
      return attempt(this, async () => {
        this.mine = (await api.listMine(token)).items
      })
    },

    loadReview(token) {
      return attempt(this, async () => {
        const { items, sync } = await api.listReview(token)
        this.review = { items, sync: sync ?? null }
      })
    },

    /** → the item created, now first among mine. */
    submit(form, token) {
      return attempt(this, async () => {
        const { item } = await api.submitArt(form, token)
        this.mine.unshift(item)
        return item
      })
    },

    remove(id, token) {
      return attempt(this, async () => {
        await api.removeItem(id, token)
        dropItem(this, id)
        await this.loadMine(token)
      })
    },

    approve(id, token) {
      return attempt(this, async () => {
        await api.approve(id, token)
        await this.loadReview(token)
      })
    },

    reject(id, reason, token) {
      return attempt(this, async () => {
        await api.reject(id, reason, token)
        await this.loadReview(token)
      })
    },

    hide(id, note, token) {
      return attempt(this, async () => {
        await api.hide(id, note, token)
        dropItem(this, id)
        await this.loadReview(token)
      })
    },
  },
})
