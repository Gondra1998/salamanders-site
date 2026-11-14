<script setup>
// Administratum → Access: the people the Watch Commander lets in by hand, above what their Discord roles give them.
// He finds a member by display name or user id (asked of the server as he types, from the bot's member list) and gives
// them one kind at a time: the desk, Watch Command, or the Deathwatch itself (lib/deathwatch/areas.js ACCESS_KINDS).
// The desk and the guild's admins see the list; only he adds or removes, and the server checks that on every call.
// Leaving the guild ends what was given for good: the server drops such a person from the list itself.
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuth } from '../../../../stores/auth'
import { useDeathwatch } from '../../../../stores/deathwatch'
import { ACCESS_KINDS } from '../../../../lib/deathwatch/areas'
import { addAccess, listAccess, removeAccess, searchMembers } from '../../../../lib/deathwatch/people'
import { useMemberSearch } from '../../../../lib/deathwatch/memberSearch'
import { initials, safeAvatar } from '../../../../lib/rosterAvatar'

const auth = useAuth()
const gate = useDeathwatch()
const LABEL = Object.fromEntries(ACCESS_KINDS)

// The list, as the server holds it.
const people = ref([])
const state = ref('loading')
const failure = ref('')
async function load() {
  try {
    people.value = await listAccess(auth.token)
    state.value = 'ready'
  } catch (err) {
    // An API from before this page (just after the site deploys, before the API is rebuilt) does not know the route.
    failure.value = err?.status === 404 ? 'The access list is not available yet.' : err?.message || 'The access list could not be loaded.'
    state.value = 'error'
  }
}
onMounted(load)
const holds = (id, kind) => people.value.some((p) => p.id === id && p.kind === kind)
const nameOf = (p) => p.name ?? p.id
const when = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// The search, the Watch Commander's alone.
const search = reactive(useMemberSearch((q) => searchMembers(auth.token, q)))

// One change at a time; the list is fetched again after it, so it shows what the server holds.
const msg = ref({ text: '', ok: true })
const busy = ref(false)
async function act(change, done) {
  busy.value = true
  try {
    await change()
    msg.value = { text: done, ok: true }
    await load()
  } catch (err) {
    msg.value = { text: err?.message || 'That did not work.', ok: false }
  } finally {
    busy.value = false
  }
}
const add = (m, kind) => act(() => addAccess(auth.token, m.id, kind), `${m.name} added: ${LABEL[kind]}.`)
function remove(p) {
  if (!confirm(`Remove ${nameOf(p)}'s ${LABEL[p.kind]} access?`)) return
  act(() => removeAccess(auth.token, p.id, p.kind), `${nameOf(p)} removed: ${LABEL[p.kind]}.`)
}
const avatarOf = (m) => safeAvatar(m.avatar)
const initialsOf = (m) => (m.name ? initials(m.name) : '?')
const searching = computed(() => gate.commander)
</script>

<template>
  <div class="dw-page ac">
    <h2 class="dw-plaque">Access</h2>
    <p class="dw-sub">Discord roles still open the Deathwatch by themselves. Here are the people given access by hand.</p>

    <section v-if="searching" class="ac-find" aria-label="Find a member">
      <label class="dw-field">
        Find a member
        <input v-model="search.query" type="search" autocomplete="off" spellcheck="false" placeholder="Type a name or paste a user ID" />
      </label>
      <p v-if="search.state === 'loading'" class="dw-sub" role="status">Searching…</p>
      <p v-else-if="search.state === 'empty'" class="dw-empty" role="status">No member matches.</p>
      <p v-else-if="search.state === 'error'" class="dw-msg bad" role="status">{{ search.message }}</p>
      <ul v-if="search.results.length" class="ac-results">
        <li v-for="m in search.results" :key="m.id" class="ac-person">
          <span class="dw-av" :data-i="initialsOf(m)" aria-hidden="true"><img v-if="avatarOf(m)" :src="avatarOf(m)" width="64" height="64" decoding="async" alt="" /></span>
          <span class="ac-name">{{ m.name }}</span>
          <span class="ac-id" :title="m.id">…{{ m.id.slice(-4) }}</span>
          <span class="ac-add">
            <button v-for="[k, l] in ACCESS_KINDS" :key="k" type="button" class="dw-btn rm-fade" :disabled="busy || holds(m.id, k)" @click="add(m, k)">
              {{ holds(m.id, k) ? 'Added' : l }}
            </button>
          </span>
        </li>
      </ul>
    </section>

    <h2 class="dw-plaque">People with access</h2>
    <p v-if="msg.text" class="dw-msg" :class="msg.ok ? 'ok' : 'bad'" :role="msg.ok ? 'status' : 'alert'">{{ msg.text }}</p>
    <p v-if="state === 'loading'" class="dw-sub" role="status">Loading…</p>
    <p v-else-if="state === 'error'" class="dw-msg bad" role="alert">{{ failure }}</p>
    <p v-else-if="!people.length" class="dw-empty">Nobody has been given access by hand.</p>
    <div v-else class="dw-scroll">
      <table class="dw-table ac-list">
        <thead>
          <tr>
            <th class="l">Member</th>
            <th class="l">Access</th>
            <th class="l">Added</th>
            <th v-if="searching"><span class="dw-sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in people" :key="`${p.id}:${p.kind}`">
            <td class="l">
              <span class="ac-person">
                <span class="dw-av" :data-i="initialsOf(p)" aria-hidden="true"><img v-if="avatarOf(p)" :src="avatarOf(p)" width="64" height="64" decoding="async" alt="" /></span>
                <span class="ac-name">{{ nameOf(p) }}</span>
              </span>
            </td>
            <td class="l">{{ LABEL[p.kind] }}</td>
            <td class="l">{{ when(p.grantedAt) }} · by {{ p.grantedBy }}</td>
            <td v-if="searching">
              <button type="button" class="dw-btn danger rm-fade" :disabled="busy" @click="remove(p)">Remove</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ac-find {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1.6rem;
}
.ac-results {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ac-results li {
  flex-wrap: wrap;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--dw-line-2);
  background: rgb(255 255 255 / 0.025);
}
.ac-person {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.ac-name {
  font-weight: 600;
  color: var(--dw-ink);
  overflow-wrap: anywhere;
}
.ac-id {
  font: 500 0.8rem / 1 var(--dw-font-cond);
  letter-spacing: 0.04em;
  color: var(--dw-muted);
}
.ac-add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-left: auto;
}
/* The roster's avatar, as on the Event Tracker (PlayerName.vue): the initials are drawn by CSS, the picture over them. */
.dw-av {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 50%;
  font: 600 0.6875rem / 1 var(--dw-font-cond);
  letter-spacing: 0.02em;
  color: var(--dw-ink);
  background: linear-gradient(180deg, #2c4137, #1a2a22);
  border: 1px solid var(--dw-line-2);
}
.dw-av::before {
  content: attr(data-i);
}
.dw-av img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
