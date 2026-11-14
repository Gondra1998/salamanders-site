/**
 * The member search on Administratum → Access, as the Watch Commander types: `search(q)` is asked 250 ms after the
 * last keystroke, once there are two characters (a pasted user id has many more), with the query trimmed. Only the
 * answer to the newest query is ever shown: one that arrives late, after a newer query or after the box was emptied,
 * is dropped. → { query, results, state, message }, refs; `state` is idle, loading, ready, empty or error.
 */
import { ref, watch } from 'vue'


export function useMemberSearch(search, { delayMs = 250 } = {}) {
  const query = ref('')
  const results = ref([])
  const state = ref('idle')
  const message = ref('')
  let timer
  // The newest query's own token: an answer that comes back holding another is stale, and dropped.
  let latest = {}

  async function ask(q, mine) {
    try {
      const found = await search(q)
      if (mine !== latest) return
      results.value = found
      state.value = found.length ? 'ready' : 'empty'
    } catch (err) {
      if (mine !== latest) return
      results.value = []
      state.value = 'error'
      message.value = err?.status === 503 ? 'The member list is still loading. Try again in a minute.' : err?.message || 'The search did not work.'
    }
  }

  watch(query, (typed) => {
    clearTimeout(timer)
    const mine = {}
    latest = mine
    const q = typed.trim()
    message.value = ''
    if (q.length < 2) {
      results.value = []
      state.value = 'idle'
      return
    }
    state.value = 'loading'
    timer = setTimeout(() => ask(q, mine), delayMs)
  })

  return { query, results, state, message }
}
