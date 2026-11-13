<script setup>
// Manage → Access. Page access: which Discord roles open which part of the area, saved as the cfg document `g` (area
// → roles; lib/deathwatch/areas.js has the defaults and reads it back). Manage itself stays the Watch Commander's, as
// does everything for him. Grants: access given by hand to one Discord user who holds no role (it counts as
// Deathwatch Deployment); listed, added by Discord user id, revoked. The server checks the Watch Commander on every
// write, and keeps the Event Tracker's data to the roles it is opened to.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuth } from '../../../../stores/auth'
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { AREAS, GATED, ROLES, gatesOf } from '../../../../lib/deathwatch/areas'
import { addGrant, listGrants, removeGrant } from '../../../../lib/deathwatch/grants'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'

const auth = useAuth()
const { data, save, reload } = useTracker()

// Page access: a working copy of the saved gates, as area → Set of roles.
const saved = computed(() => gatesOf(data.cfg.g))
const sets = reactive({})
const fill = (g) => GATED.forEach((a) => (sets[a] = new Set(g[a])))
watch(saved, fill, { immediate: true })
const changed = computed(() => GATED.some((a) => sets[a].size !== saved.value[a].length || saved.value[a].some((r) => !sets[a].has(r))))
const toggle = (a, r) => (sets[a].has(r) ? sets[a].delete(r) : sets[a].add(r))
const gm = ref({ text: '', ok: true })
async function saveGates() {
  try {
    await save('cfg', 'g', Object.fromEntries(GATED.map((a) => [a, ROLES.map(([k]) => k).filter((k) => sets[a].has(k))])))
    gm.value = { text: 'Page access saved ✓', ok: true }
  } catch (err) {
    gm.value = { text: `Not saved: ${err?.message || 'error'}`, ok: false }
  }
}
// Back to areas.js's defaults: the choice is deleted, not copied, so a later change to the defaults reaches it.
async function resetGates() {
  try {
    await save('cfg', 'g', null)
    gm.value = { text: 'Back to the defaults ✓', ok: true }
  } catch (err) {
    gm.value = { text: `Not reset: ${err?.message || 'error'}`, ok: false }
  }
}

// Grants.
const grants = ref([])
const gState = ref('loading')
const id = ref('')
const msg = ref({ text: '', ok: true })
const busy = ref(false)
async function load() {
  try {
    grants.value = await listGrants(auth.token)
    gState.value = 'ready'
  } catch (err) {
    msg.value = { text: err?.message || 'The grants could not be loaded.', ok: false }
    gState.value = 'error'
  }
}
onMounted(load)
// One action at a time; the list is fetched again after it, so it shows what the server holds.
async function act(fn, done) {
  busy.value = true
  try {
    await fn()
    msg.value = { text: done, ok: true }
    await load()
  } catch (err) {
    msg.value = { text: err?.message || 'That did not work.', ok: false }
  } finally {
    busy.value = false
  }
}
function add() {
  const v = id.value.trim()
  if (!/^\d{17,20}$/.test(v)) return (msg.value = { text: 'Enter a Discord user id (17 to 20 digits).', ok: false })
  act(() => addGrant(auth.token, v), `Access granted to ${v}.`).then(() => msg.value.ok && (id.value = ''))
}
function revoke(g) {
  if (!confirm(`Revoke access for ${g.discordId}?`)) return
  act(() => removeGrant(auth.token, g.discordId), `Access revoked for ${g.discordId}.`)
}
const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <h2 class="dw-plaque">Page access</h2>
    <p class="dw-sub">
      Tick the Discord roles that may open each part of the fortress; anyone else sees it locked. The Watch Commander opens everything, and Manage is his
      alone. The Watch Command tab of the Armouring Hall stays with Deathwatch Command.
    </p>
    <div class="dw-scroll">
      <table class="dw-table ac-grid">
        <thead>
          <tr>
            <th class="l">Role</th>
            <th v-for="a in GATED" :key="a">{{ AREAS[a].label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[r, label] in ROLES" :key="r">
            <th class="l" scope="row">{{ label }}</th>
            <td v-for="a in GATED" :key="a">
              <label class="ac-cell"><input type="checkbox" class="ac-box" :checked="sets[a].has(r)" :aria-label="`${label} opens ${AREAS[a].label}`" @change="toggle(a, r)" /></label>
            </td>
          </tr>
          <tr class="ac-fixed">
            <th class="l" scope="row">Watch Commander</th>
            <td v-for="a in GATED" :key="a">
              <input type="checkbox" class="ac-box" checked disabled :aria-label="`Watch Commander opens ${AREAS[a].label}`" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="dw-actions">
      <button type="button" class="dw-btn primary rm-fade" :disabled="!changed" @click="saveGates">Save page access</button>
      <button type="button" class="dw-btn rm-fade" :disabled="!data.cfg.g" @click="resetGates">Back to defaults</button>
      <span v-if="changed" class="dw-msg">Unsaved changes</span>
      <span v-else-if="gm.text" class="dw-msg" :class="gm.ok ? 'ok' : 'bad'" role="status">{{ gm.text }}</span>
    </div>

    <h2 class="dw-plaque">Grants</h2>
    <p class="dw-sub">
      Let in someone who holds no role, by their Discord user id (Discord: Developer Mode on, then right-click the user, Copy User ID). A grant counts as
      Deathwatch Deployment.
    </p>
    <form class="dw-form" @submit.prevent="add">
      <label class="dw-field">
        Discord user id
        <input v-model="id" inputmode="numeric" autocomplete="off" placeholder="17 to 20 digits" />
      </label>
      <div class="dw-actions"><button type="submit" class="dw-btn rm-fade" :disabled="busy">Grant access</button></div>
    </form>
    <p v-if="msg.text" class="dw-msg" :class="msg.ok ? 'ok' : 'bad'" :role="gState === 'error' ? 'alert' : 'status'">{{ msg.text }}</p>
    <p v-if="gState === 'loading'" class="dw-sub" role="status">Loading…</p>
    <p v-else-if="gState === 'ready' && !grants.length" class="dw-empty">Nobody has been granted access by hand.</p>
    <div v-else-if="grants.length" class="dw-scroll">
      <table class="dw-table">
        <thead>
          <tr><th class="l">Discord user id</th><th class="l">Granted by</th><th>Since</th><th><span class="dw-sr-only">Revoke</span></th></tr>
        </thead>
        <tbody>
          <tr v-for="g in grants" :key="g.discordId">
            <td class="l"><b>{{ g.discordId }}</b></td>
            <td class="l">{{ g.grantedBy }}</td>
            <td>{{ when(g.grantedAt) }}</td>
            <td>
              <button type="button" class="dw-btn danger rm-fade" :disabled="busy" @click="revoke(g)">Revoke</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </TrackerState>
</template>

<style scoped>
.ac-grid th:not(.l),
.ac-grid td {
  text-align: center;
  white-space: normal;
}
.dw-table.ac-grid tbody th {
  font: 600 0.95rem / 1.3 var(--mg-sans, inherit);
  letter-spacing: 0;
  text-transform: none;
  color: var(--dw-ink);
  white-space: nowrap;
}
.ac-cell {
  display: grid;
  place-items: center;
  min-height: 44px;
  cursor: pointer;
}
.ac-box {
  width: 20px;
  height: 20px;
  accent-color: var(--dw-accent);
  cursor: pointer;
}
.ac-box:disabled {
  cursor: default;
}
.ac-fixed th,
.ac-fixed td {
  color: var(--dw-muted);
  border-top: 1px solid var(--dw-line-2);
}
</style>
