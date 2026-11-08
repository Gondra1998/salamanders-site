<script setup>
// Manage → Manage: the scoring weights, renaming or merging a player (live and archived), the Kill Teams and their
// rosters, restoring a backup, archiving the event, and clearing the Kill Teams. Every change is one document
// write at a time; a step that fails stops there and says so, and running it again finishes the job.
import { computed, reactive, ref, watch } from 'vue'
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { COMPANIES, WEIGHT_LABELS, archiveDoc, clone, parseBackup, renameInTeam, renamePlan } from '../../../../lib/deathwatch/tracker'
import { download } from '../../../../lib/deathwatch/download'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'
import ResetZone from '../../../../components/deathwatch/tracker/ResetZone.vue'

const { data, R, S, eventName, save, reload } = useTracker()
const say = (err) => err?.message || 'error'

// Scoring.
const weights = reactive({})
watch(S, (s) => Object.assign(weights, s), { immediate: true })
const m1 = ref('')
async function saveWeights() {
  try {
    await save('cfg', 's', Object.fromEntries(WEIGHT_LABELS.map(([k]) => [k, +weights[k] || 0])))
    m1.value = 'Saved ✓'
  } catch (err) {
    m1.value = `Not saved: ${say(err)}`
  }
}

// Rename or merge a player.
const rn = reactive({ a: '', b: '', plan: null, msg: '' })
const allNames = computed(() =>
  [...new Set([...R.value.names, ...Object.values(data.archive).flatMap((a) => (a.teams ?? []).flatMap((t) => [...(t.ro ?? []), ...(t.m ?? []).flatMap((m) => (m[8] ?? []).map((r) => r[0]))]))])]
    .filter(Boolean)
    .sort((x, y) => x.localeCompare(y)),
)
function rnCheck() {
  rn.msg = ''
  rn.plan = renamePlan(data.teams, data.archive, rn.a.trim(), rn.b.trim())
}
async function rnDo() {
  const [a, b] = [rn.a.trim(), rn.b.trim()]
  const plan = renamePlan(data.teams, data.archive, a, b)
  rn.plan = null
  if (plan.error) {
    rn.msg = plan.error
    return
  }
  rn.msg = 'Renaming…'
  try {
    for (const id of plan.teams) await save('teams', id, renameInTeam(data.teams[id], a, b))
    for (const k of plan.archives) {
      const d = clone(data.archive[k])
      d.teams = d.teams.map((t) => renameInTeam(t, a, b))
      await save('archive', k, d)
    }
    Object.assign(rn, { a: '', b: '', msg: `Done ✓ ${plan.entries} entr${plan.entries === 1 ? 'y' : 'ies'} renamed.` })
  } catch (err) {
    rn.msg = `Not completed: ${say(err)}. Some Kill Teams may already be changed. Run the same rename again.`
  }
}

// The tour: its name is the line under the Event Tracker's head (cfg.tx.cur_n, beside the page texts).
const tour = reactive({ name: '', msg: '' })
watch(() => data.cfg.tx?.cur_n, (n) => (tour.name = n ?? ''), { immediate: true })
async function saveTour() {
  const name = tour.name.trim()
  if (!name) return (tour.msg = 'Enter a tour name.')
  try {
    await save('cfg', 'tx', { ...data.cfg.tx, cur_n: name })
    tour.msg = 'Saved ✓'
  } catch (err) {
    tour.msg = `Not saved: ${say(err)}`
  }
}

// Kill Teams. A form per team, refilled whenever the saved team changes.
const STATUS = [['', 'Active'], ['0', 'KIA (week ?)'], ['1', 'KIA · W1'], ['2', 'KIA · W2'], ['3', 'KIA · W3'], ['4', 'KIA · W4']]
const teams = computed(() => Object.values(data.teams).sort((a, b) => a.id - b.id))
const forms = reactive({})
// Only a team whose document changed is refilled, so what is typed into another team's form survives a save.
const seen = new Map()
watch(
  teams,
  (ts) => {
    for (const t of ts) {
      if (seen.get(t.id) === t) continue
      seen.set(t.id, t)
      forms[t.id] = {
        n: t.n,
        co: t.co,
        slots: [0, 1, 2].map((i) => {
          const nm = t.ro?.[i] ?? ''
          return { n: nm, k: nm && (t.ki ?? []).includes(nm) ? String(+(t.kw ?? {})[nm] || 0) : '' }
        }),
        msg: forms[t.id]?.msg ?? '',
        del: false,
      }
    }
  },
  { immediate: true },
)
async function saveTeam(t) {
  const f = forms[t.id]
  const d = clone(t)
  const sl = f.slots.map((s) => ({ n: s.n.trim(), k: s.k })).filter((s) => s.n)
  d.n = f.n.trim() || d.n
  d.co = f.co
  d.ro = sl.map((s) => s.n)
  d.ki = [...new Set(sl.filter((s) => s.k !== '').map((s) => s.n))]
  d.kw = Object.fromEntries(sl.filter((s) => +s.k > 0).map((s) => [s.n, +s.k]))
  try {
    await save('teams', t.id, d)
    forms[t.id].msg = 'Saved ✓'
  } catch (err) {
    forms[t.id].msg = `Not saved: ${say(err)}`
  }
}
async function deleteTeam(t) {
  try {
    await save('teams', t.id, null)
  } catch (err) {
    forms[t.id].msg = `Not deleted: ${say(err)}`
  }
}
const m2 = ref('')
async function addTeam() {
  const id = Math.max(0, ...teams.value.map((t) => t.id)) + 1
  try {
    await save('teams', id, { id, n: `New Kill Team ${id}`, co: COMPANIES[0], ro: [], ki: [], kw: {}, m: [] })
    m2.value = ''
  } catch (err) {
    m2.value = `Not added: ${say(err)}`
  }
}

// Backup and restore.
const backup = () =>
  download(`deathwatch-backup-${new Date().toISOString().slice(0, 10)}.json`, { exported: new Date().toISOString(), scoring: S.value, teams: Object.values(data.teams) })
const playedIn = (ts) => ts.reduce((a, t) => a + (t.m ?? []).filter((m) => m[2] && m[0] <= 4).length, 0)
const rs = reactive({ plan: null, file: '', typed: '', msg: '' })
async function rsPick(e) {
  const file = e.target.files[0]
  Object.assign(rs, { plan: null, typed: '', msg: '' })
  if (!file) return
  try {
    rs.plan = parseBackup(JSON.parse(await file.text()))
    rs.file = file.name
  } catch (err) {
    rs.msg = err instanceof SyntaxError ? 'This file is not a valid backup.' : err.message
  }
}
async function rsDo() {
  const P = rs.plan
  rs.plan = null
  try {
    let i = 0
    for (const t of P.teams) {
      rs.msg = `Restoring… ${++i}/${P.teams.length}`
      await save('teams', t.id, t)
    }
    for (const t of teams.value) if (!P.teams.some((x) => x.id === t.id)) await save('teams', t.id, null)
    if (P.scoring) await save('cfg', 's', P.scoring)
    rs.msg = `Restored ✓ ${P.teams.length} Kill Teams.`
  } catch (err) {
    rs.msg = `Not completed: ${say(err)}. Run the restore again.`
  }
}

// Event archive.
const ar = reactive({ name: '', asking: false, typed: '', msg: '' })
watch(eventName, (n) => (ar.name ||= n), { immediate: true })
async function archive(reset) {
  const name = ar.name.trim() || eventName.value
  const id = `e${Date.now()}`
  const ids = teams.value.map((t) => t.id)
  Object.assign(ar, { asking: false, typed: '', msg: 'Saving…' })
  try {
    await save('archive', id, archiveDoc(data.teams, S.value, name))
    if (!reset) {
      ar.msg = `Saved to the archive as “${name}” ✓`
      return
    }
    // The live event is cleared only once the copy is saved: a failure above leaves it as it was.
    let i = 0
    for (const k of ids) {
      ar.msg = `Archived ✓ Clearing the live event… ${++i}/${ids.length}`
      await save('teams', k, null)
    }
    // The tour is over: its name goes with it, so the next one starts unnamed ("Open new tour").
    const { cur_n, ...tx } = data.cfg.tx ?? {}
    if (cur_n !== undefined) await save('cfg', 'tx', tx)
    ar.msg = `Archived as “${name}” and live event cleared ✓ Open it under “Archive”.`
  } catch (err) {
    ar.msg = `Not completed: ${say(err)}${reset ? ' The live event is only cleared after the archive copy is saved.' : ''}`
  }
}
const missionCount = computed(() => teams.value.reduce((a, t) => a + (t.m ?? []).length, 0))
async function resetTeams() {
  for (const t of teams.value) await save('teams', t.id, null)
}
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <p v-if="!teams.length" class="dw-sub">No Kill Teams yet. Add the first Kill Team below.</p>

    <h2 class="dw-plaque">Scoring</h2>
    <div class="dw-form">
      <label v-for="[k, l] in WEIGHT_LABELS" :key="k" class="dw-field">{{ l }}<input v-model="weights[k]" type="number" /></label>
    </div>
    <div class="dw-actions">
      <button type="button" class="dw-btn rm-fade" @click="saveWeights">Save scoring</button>
      <span class="dw-msg" role="status">{{ m1 }}</span>
    </div>

    <template v-if="allNames.length">
      <h2 class="dw-plaque">Rename or merge player</h2>
      <p class="dw-sub">
        Changes the name in every mission and on every roster, in the live event and in all archived events. If the new name already exists, both become one
        player. Use it to fix typos.
      </p>
      <datalist id="dw-names"><option v-for="x in allNames" :key="x" :value="x" /></datalist>
      <div class="dw-form">
        <label class="dw-field">Current name<input v-model="rn.a" list="dw-names" autocomplete="off" @input="rn.plan = null" /></label>
        <label class="dw-field">New name<input v-model="rn.b" list="dw-names" autocomplete="off" @input="rn.plan = null" /></label>
      </div>
      <div class="dw-actions"><button type="button" class="dw-btn rm-fade" @click="rnCheck">Check</button></div>
      <p v-if="rn.plan?.error" class="dw-msg bad" role="alert">{{ rn.plan.error }}</p>
      <template v-else-if="rn.plan">
        <p class="dw-msg">
          <b>{{ rn.plan.entries }} mission entr{{ rn.plan.entries === 1 ? 'y' : 'ies' }}</b> in {{ rn.plan.teams.length }} Kill Team{{ rn.plan.teams.length === 1 ? '' : 's'
          }}{{ rn.plan.roster ? ' and the roster' : '' }}{{ rn.plan.archives.length ? ` and ${rn.plan.archives.length} archived event${rn.plan.archives.length === 1 ? '' : 's'}` : '' }}
          change from “{{ rn.a.trim() }}” to “{{ rn.b.trim() }}”.
          <template v-if="rn.plan.existing">“{{ rn.b.trim() }}” already exists ({{ rn.plan.existing }} entries), so the two become one player.</template>
        </p>
        <div class="dw-actions">
          <button type="button" class="dw-btn rm-fade" @click="rn.plan = null">Cancel</button>
          <button type="button" class="dw-btn rm-fade" @click="rnDo">Rename everywhere</button>
        </div>
      </template>
      <p v-if="rn.msg" class="dw-msg" :class="{ ok: rn.msg.startsWith('Done'), bad: rn.msg.startsWith('Not') || rn.msg.startsWith('No') || rn.msg.startsWith('Can') }" role="status">{{ rn.msg }}</p>
    </template>

    <h2 class="dw-plaque">Tour</h2>
    <p v-if="!teams.length" class="dw-empty">No event is running. Name the new tour, then add its Kill Teams below.</p>
    <div class="dw-form">
      <label class="dw-field">Tour name<input v-model="tour.name" autocomplete="off" placeholder="Deathwatch Tour" /></label>
    </div>
    <div class="dw-actions">
      <button type="button" class="dw-btn rm-fade" @click="saveTour">{{ teams.length ? 'Save tour name' : 'Open new tour' }}</button>
      <span class="dw-msg" role="status">{{ tour.msg }}</span>
    </div>

    <h2 class="dw-plaque">Kill Teams</h2>
    <fieldset v-for="t in teams" :key="t.id" class="dw-fieldset">
      <legend>{{ t.n }}</legend>
      <div class="dw-form">
        <label class="dw-field">Name<input v-model="forms[t.id].n" /></label>
        <label class="dw-field">Watch Company<select v-model="forms[t.id].co"><option v-for="c in COMPANIES" :key="c">{{ c }}</option></select></label>
      </div>
      <div v-for="(s, i) in forms[t.id].slots" :key="i" class="dw-form">
        <label class="dw-field">Player {{ i + 1 }}<input v-model="s.n" /></label>
        <label class="dw-field">
          Status
          <select v-model="s.k" :class="{ kia: s.k !== '' }"><option v-for="[v, l] in STATUS" :key="v" :value="v">{{ l }}</option></select>
        </label>
      </div>
      <div class="dw-actions">
        <button type="button" class="dw-btn rm-fade" @click="saveTeam(t)">Save Kill Team</button>
        <button type="button" class="dw-btn rm-fade danger" @click="forms[t.id].del = !forms[t.id].del">Delete Kill Team</button>
        <span class="dw-msg" role="status">{{ forms[t.id].msg }}</span>
      </div>
      <template v-if="forms[t.id].del">
        <p class="dw-msg">
          <b>Delete “{{ t.n }}” with {{ t.m.length }} mission{{ t.m.length === 1 ? '' : 's' }}?</b> This cannot be undone. Use “Download backup” first if you still need the results.
        </p>
        <div class="dw-actions">
          <button type="button" class="dw-btn rm-fade" @click="forms[t.id].del = false">Cancel</button>
          <button type="button" class="dw-btn rm-fade danger" @click="deleteTeam(t)">Delete permanently</button>
        </div>
      </template>
    </fieldset>
    <div class="dw-actions">
      <button type="button" class="dw-btn rm-fade" @click="addTeam">Add Kill Team</button>
      <span class="dw-msg bad" role="status">{{ m2 }}</span>
    </div>

    <h2 class="dw-plaque">Restore from backup</h2>
    <p class="dw-sub">Loads a file made with “Download backup”. All current Kill Teams, missions and scoring rules are replaced by the backup. This cannot be undone.</p>
    <div class="dw-actions"><button type="button" class="dw-btn rm-fade" @click="backup">Download backup</button></div>
    <label class="dw-field file">Backup file<input type="file" accept=".json,application/json,text/plain" @change="rsPick" /></label>
    <template v-if="rs.plan">
      <p class="dw-msg">
        <b>{{ rs.file }}</b><template v-if="rs.plan.exported"> · exported {{ rs.plan.exported.slice(0, 10) }}</template><br />
        Backup: {{ rs.plan.teams.length }} Kill Teams, {{ playedIn(rs.plan.teams) }} missions played{{ rs.plan.scoring ? ', scoring rules' : '' }}.<br />
        Now: {{ teams.length }} Kill Teams, {{ playedIn(teams) }} missions played. <b>All current data is replaced.</b>
      </p>
      <label class="dw-field confirm">Type RESTORE to confirm<input v-model="rs.typed" autocomplete="off" autocapitalize="characters" /></label>
      <div class="dw-actions">
        <button type="button" class="dw-btn rm-fade danger" :disabled="rs.typed.trim().toUpperCase() !== 'RESTORE'" @click="rsDo">Restore backup</button>
      </div>
    </template>
    <p v-if="rs.msg" class="dw-msg" :class="{ ok: rs.msg.startsWith('Restored'), bad: !rs.msg.startsWith('Restor') }" role="status">{{ rs.msg }}</p>

    <template v-if="teams.length">
      <h2 class="dw-plaque">Event archive</h2>
      <p class="dw-sub">
        Saves a full copy of the current event (all Kill Teams, missions and scoring rules). Archived events stay viewable under “Archive”. “Archive &amp; reset”
        saves the copy first and then clears the live event for the next one.
      </p>
      <label class="dw-field name">Event name<input v-model="ar.name" autocomplete="off" /></label>
      <div class="dw-actions">
        <button type="button" class="dw-btn rm-fade" @click="archive(false)">Save snapshot</button>
        <button type="button" class="dw-btn rm-fade danger" @click="ar.asking = !ar.asking">Archive &amp; reset</button>
      </div>
      <template v-if="ar.asking">
        <p class="dw-msg">
          <b>Archive “{{ ar.name.trim() || eventName }}” and clear the live event?</b> A full copy is saved first. Then {{ teams.length }} Kill Teams and
          {{ R.ts.reduce((a, t) => a + t.pl, 0) }} missions are removed from the live event. Scoring rules stay.
        </p>
        <label class="dw-field confirm">Type RESET to confirm<input v-model="ar.typed" autocomplete="off" autocapitalize="characters" /></label>
        <div class="dw-actions">
          <button type="button" class="dw-btn rm-fade" @click="ar.asking = false">Cancel</button>
          <button type="button" class="dw-btn rm-fade danger" :disabled="ar.typed.trim().toUpperCase() !== 'RESET'" @click="archive(true)">Archive &amp; reset</button>
        </div>
      </template>
      <p v-if="ar.msg" class="dw-msg" role="status">{{ ar.msg }}</p>

      <ResetZone
        title="Reset Kill Teams"
        text="Deletes all Kill Teams with their rosters and missions without keeping a copy. Scoring rules stay. To keep the event, use “Archive & reset” above instead."
        :ask="`This deletes ${teams.length} Kill Teams and ${missionCount} missions.`"
        :run="resetTeams"
        @backup="backup"
      />
    </template>
  </TrackerState>
</template>

<style scoped>
.dw-fieldset .dw-form + .dw-form {
  margin-top: -0.25rem;
}
select.kia {
  color: var(--dw-down);
}
.file,
.name {
  max-width: 26rem;
}
.confirm {
  max-width: 18rem;
}
</style>
