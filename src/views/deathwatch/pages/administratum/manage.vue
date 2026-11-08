<script setup>
// Administratum → Manage, the desk (/deathwatch/administratum/manage): a side menu of sections (the tour, the Kill
// Teams as a list with an editor beside it, the scoring weights, and data & archive), one shown at a time. Every
// change is one document write at a time; a step that fails stops there and says so, and running it again finishes
// the job.
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { COMPANIES, WEIGHT_LABELS, archiveDoc, clone, parseBackup } from '../../../../lib/deathwatch/tracker'
import { download } from '../../../../lib/deathwatch/download'
import { useDeployment } from '../../../../lib/deathwatch/deployment'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'
import ResetZone from '../../../../components/deathwatch/tracker/ResetZone.vue'

const { data, R, S, eventName, save, reload } = useTracker()
const say = (err) => err?.message || 'error'

// Scoring, in two groups: what a mission scores, and how the MVP is weighed.
const WEIGHT_GROUPS = [
  ['Mission points', WEIGHT_LABELS.filter(([, l]) => !l.startsWith('MVP'))],
  ['MVP', WEIGHT_LABELS.filter(([, l]) => l.startsWith('MVP'))],
]
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
const fill = (t) => ({
  n: t.n,
  co: t.co,
  slots: [0, 1, 2].map((i) => {
    const nm = t.ro?.[i] ?? ''
    return { n: nm, k: nm && (t.ki ?? []).includes(nm) ? String(+(t.kw ?? {})[nm] || 0) : '' }
  }),
  msg: forms[t.id]?.msg ?? '',
  del: false,
})
watch(
  teams,
  (ts) => {
    for (const t of ts) {
      if (seen.get(t.id) === t) continue
      seen.set(t.id, t)
      forms[t.id] = fill(t)
    }
  },
  { immediate: true },
)
// The slots offer the "Deathwatch Deployment" brothers not yet in any Kill Team's form; any name can still be typed.
const deployment = useDeployment()
const unplaced = computed(() => {
  const placed = new Set(Object.values(forms).flatMap((f) => f.slots.map((s) => s.n.trim())))
  return deployment.value.filter((m) => !placed.has(m.name))
})
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
    editing.value = null
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
    editing.value = id // straight into its editor, to name it and fill its roster
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
// The archive is named after the tour, and follows it when the tour is renamed or a new one opened, unless a name
// was typed here by hand.
watch(
  eventName,
  (n, was) => {
    if (!ar.name || ar.name === was) ar.name = n
  },
  { immediate: true },
)
// What "Archive & reset" has done when a step fails, and how to finish it.
const STOPPED = {
  copy: ' The live event is only cleared after the archive copy is saved.',
  teams: ' The archive copy is saved, but some Kill Teams are still live: clear them under “Reset Kill Teams”.',
  name: ' The event is archived and its Kill Teams are cleared; only the old tour name is left. Name the new tour under “Tour”.',
}
async function archive(reset) {
  const name = ar.name.trim() || eventName.value
  const id = `e${Date.now()}`
  const ids = teams.value.map((t) => t.id)
  Object.assign(ar, { asking: false, typed: '', msg: 'Saving…' })
  let step = 'copy'
  try {
    await save('archive', id, archiveDoc(data.teams, S.value, name))
    if (!reset) {
      ar.msg = `Saved to the archive as “${name}” ✓`
      return
    }
    // The live event is cleared only once the copy is saved: a failure above leaves it as it was.
    step = 'teams'
    let i = 0
    for (const k of ids) {
      ar.msg = `Archived ✓ Clearing the live event… ${++i}/${ids.length}`
      await save('teams', k, null)
    }
    // The tour is over: its name goes with it, so the next one starts unnamed ("Open new tour").
    step = 'name'
    const { cur_n, ...tx } = data.cfg.tx ?? {}
    if (cur_n !== undefined) await save('cfg', 'tx', tx)
    ar.msg = `Archived as “${name}” and live event cleared ✓ Open it under “Archive”.`
  } catch (err) {
    ar.msg = `Not completed: ${say(err)}${reset ? STOPPED[step] : ''}`
  }
}
// The desk: one section at a time, picked in the side menu. Kill Teams opens on the list; a row opens its editor.
const SECTIONS = [
  ['tour', 'Tour', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v4M12 17v4M3 12h4M17 12h4'],
  ['teams', 'Kill Teams', 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c1.8.8 3 2.9 3 5.5'],
  ['scoring', 'Scoring', 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8'],
]
const DATA = ['data', 'Data & Archive', 'M3 4h18v4H3zM5 8v12h14V8M10 12h4']
// A link from Checks opens where its finding is fixed: ?s= a section, ?t= a team in its editor.
const q = useRoute().query
const section = ref([...SECTIONS, DATA].some(([k]) => k === q.s) ? q.s : 'teams')
const editing = ref(q.t ? +q.t : null)
const edited = computed(() => teams.value.find((t) => t.id === editing.value) ?? null)
const kia = (t) => (t.ki ?? []).filter((n) => (t.ro ?? []).includes(n)).length
const go = (s) => {
  section.value = s
  editing.value = null
}
// Cancel: the form back to what is saved.
const revert = (t) => {
  forms[t.id] = fill(t)
}
const missionCount = computed(() => teams.value.reduce((a, t) => a + (t.m ?? []).length, 0))
async function resetTeams() {
  for (const t of teams.value) await save('teams', t.id, null)
}
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <div class="mg-desk">
      <!-- The side menu: the running campaign, then the sections; data and the way out set apart. -->
      <aside class="mg-side">
        <div class="mg-camp">
          <p class="mg-eyebrow">Campaign</p>
          <p class="mg-camp-name">{{ data.cfg.tx?.cur_n || 'No tour running' }}</p>
          <span v-if="teams.length" class="mg-badge">Active</span>
        </div>
        <nav class="mg-menu" aria-label="Manage sections">
          <button v-for="[k, l, d] in SECTIONS" :key="k" type="button" class="mg-item" :aria-current="section === k ? 'true' : undefined" @click="go(k)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="d" /></svg>{{ l }}
          </button>
          <hr />
          <button type="button" class="mg-item" :aria-current="section === DATA[0] ? 'true' : undefined" @click="go(DATA[0])">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="DATA[2]" /></svg>{{ DATA[1] }}
          </button>
        </nav>
      </aside>

      <div class="mg-main">
        <template v-if="section === 'tour'">
          <h2 class="dw-plaque">Tour</h2>
          <p v-if="!teams.length" class="dw-empty">No event is running. Name the new tour, then add its Kill Teams.</p>
          <div class="mg-inline">
            <label class="dw-field">Tour name<input v-model="tour.name" autocomplete="off" placeholder="Deathwatch Tour" /></label>
            <button type="button" class="dw-btn primary rm-fade" @click="saveTour">{{ teams.length ? 'Save tour name' : 'Open new tour' }}</button>
            <span class="dw-msg" role="status">{{ tour.msg }}</span>
          </div>
        </template>

        <template v-else-if="section === 'teams'">
          <div class="mg-head">
            <div>
              <h2 class="dw-plaque">Kill Teams</h2>
              <p class="dw-sub">{{ eventName }}</p>
            </div>
            <button type="button" class="dw-btn primary rm-fade" @click="addTeam">+ Add Kill Team</button>
          </div>
          <p v-if="m2" class="dw-msg bad" role="status">{{ m2 }}</p>
          <dl class="mg-stats">
            <div class="mg-stat"><dd>{{ teams.length }}</dd><dt>Kill Teams</dt></div>
            <div class="mg-stat"><dd>{{ playedIn(teams) }}</dd><dt>Missions played</dt></div>
            <div class="mg-stat"><dd>{{ R.names.length }}</dd><dt>Operatives</dt></div>
          </dl>
          <div class="mg-work" :class="{ open: edited }">
            <p v-if="!teams.length" class="dw-empty">No Kill Teams yet. Add the first one above.</p>
            <div v-else class="dw-scroll">
              <table class="dw-table mg-list">
                <thead>
                  <tr><th class="l">Kill Team</th><th class="l">Company</th><th>Operatives</th><th class="l">Status</th></tr>
                </thead>
                <tbody>
                  <tr v-for="t in teams" :key="t.id" :class="{ sel: t.id === editing }">
                    <td class="l"><button type="button" class="mg-row" :aria-pressed="t.id === editing" @click="editing = t.id">{{ t.n }}</button></td>
                    <td class="l">{{ t.co }}</td>
                    <td>{{ (t.ro ?? []).length }}</td>
                    <td class="l"><span class="mg-pill" :class="{ kia: kia(t) }">{{ kia(t) ? `${kia(t)} KIA` : 'Active' }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- The editor of the chosen team, beside the list. -->
            <section v-if="edited" class="mg-editor" aria-labelledby="mg-ed-title">
              <datalist id="dw-deployment"><option v-for="m in unplaced" :key="m.id" :value="m.name" /></datalist>
              <div class="mg-ed-head">
                <h3 id="mg-ed-title">Edit Kill Team</h3>
                <details class="mg-more">
                  <summary aria-label="More actions">⋯</summary>
                  <button type="button" class="mg-danger-item" @click="forms[edited.id].del = true">Delete Kill Team</button>
                </details>
                <button type="button" class="mg-x" aria-label="Close editor" @click="editing = null">×</button>
              </div>
              <label class="dw-field">Team name<input v-model="forms[edited.id].n" /></label>
              <label class="dw-field">Watch Company<select v-model="forms[edited.id].co"><option v-for="c in COMPANIES" :key="c">{{ c }}</option></select></label>
              <h4 class="mg-sub">Operatives</h4>
              <div class="mg-roster">
                <template v-for="(s, i) in forms[edited.id].slots" :key="i">
                  <input v-model="s.n" class="mg-in" list="dw-deployment" autocomplete="off" :aria-label="`Operative ${i + 1}`" placeholder="Empty slot" />
                  <select v-model="s.k" class="mg-in" :class="{ kia: s.k !== '' }" :aria-label="`Status of operative ${i + 1}`">
                    <option v-for="[v, l] in STATUS" :key="v" :value="v">{{ l }}</option>
                  </select>
                </template>
              </div>
              <div class="dw-actions">
                <button type="button" class="dw-btn primary rm-fade" @click="saveTeam(edited)">Save changes</button>
                <button type="button" class="dw-btn rm-fade" @click="revert(edited)">Cancel</button>
              </div>
              <p v-if="forms[edited.id].msg" class="dw-msg" :class="forms[edited.id].msg.startsWith('Saved') ? 'ok' : 'bad'" role="status">{{ forms[edited.id].msg }}</p>
              <template v-if="forms[edited.id].del">
                <p class="dw-msg">
                  <b>Delete “{{ edited.n }}” with {{ edited.m.length }} mission{{ edited.m.length === 1 ? '' : 's' }}?</b> This cannot be undone. Export a backup first if you still need the results.
                </p>
                <div class="dw-actions">
                  <button type="button" class="dw-btn rm-fade" @click="forms[edited.id].del = false">Cancel</button>
                  <button type="button" class="dw-btn rm-fade danger" @click="deleteTeam(edited)">Delete permanently</button>
                </div>
              </template>
            </section>
          </div>
        </template>

        <template v-else-if="section === 'scoring'">
          <h2 class="dw-plaque">Scoring</h2>
          <fieldset v-for="[g, ws] in WEIGHT_GROUPS" :key="g" class="dw-fieldset">
            <legend>{{ g }}</legend>
            <div class="dw-form">
              <label v-for="[k, l] in ws" :key="k" class="dw-field">{{ l }}<input v-model="weights[k]" type="number" /></label>
            </div>
          </fieldset>
          <div class="dw-actions">
            <button type="button" class="dw-btn primary rm-fade" @click="saveWeights">Save scoring</button>
            <span class="dw-msg" role="status">{{ m1 }}</span>
          </div>
        </template>

        <template v-else>
          <h2 class="dw-plaque">Data &amp; Archive</h2>
          <div class="mg-split">
            <section class="mg-card" aria-labelledby="mg-backup">
              <h3 id="mg-backup" class="mg-sub">Restore from backup</h3>
              <p class="dw-sub">Loads a file made with “Export backup”. All current Kill Teams, missions and scoring rules are replaced by the backup. This cannot be undone.</p>
              <label class="dw-field">Backup file<input type="file" accept=".json,application/json,text/plain" @change="rsPick" /></label>
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
            </section>

            <section v-if="teams.length" class="mg-card" aria-labelledby="mg-archive">
              <h3 id="mg-archive" class="mg-sub">Event archive</h3>
              <p class="dw-sub">
                Saves a full copy of the current event (all Kill Teams, missions and scoring rules). Archived events stay viewable under “Archive”. “Archive &amp;
                reset” saves the copy first and then clears the live event for the next one.
              </p>
              <label class="dw-field">Event name<input v-model="ar.name" autocomplete="off" /></label>
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
            </section>
            <!-- Outside the section: once "Archive & reset" has cleared the Kill Teams the section is gone, but not what it did. -->
            <p v-if="ar.msg" class="dw-msg" role="status">{{ ar.msg }}</p>
          </div>
          <ResetZone
            v-if="teams.length"
            title="Reset Kill Teams"
            text="Deletes all Kill Teams with their rosters and missions without keeping a copy. Scoring rules stay. To keep the event, use “Archive & reset” above instead."
            :ask="`This deletes ${teams.length} Kill Teams and ${missionCount} missions.`"
            :run="resetTeams"
            @backup="backup"
          />
        </template>

        <!-- Always at hand: a copy of everything. -->
        <footer class="mg-foot">
          <button type="button" class="mg-link" @click="backup">Export backup</button>
        </footer>
      </div>
    </div>
  </TrackerState>
</template>

<style scoped>
/* The desk: the side menu, then the open section. */
.mg-desk {
  display: grid;
  grid-template-columns: 13.5rem minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}
.mg-side {
  position: sticky;
  top: 5rem;
  display: grid;
  gap: 1rem;
  padding-right: 1.25rem;
  border-right: 1px solid var(--dw-line);
}
.mg-eyebrow {
  margin: 0;
  font: 400 0.68rem / 1.3 var(--mg-mono);
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--dw-muted);
}
.mg-camp-name {
  margin: 0.3rem 0 0.4rem;
  font: 700 1.25rem / 1.15 var(--mg-display);
  color: var(--dw-ink);
  overflow-wrap: anywhere;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.mg-badge,
.mg-pill {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  font: 400 0.64rem / 1.3 var(--mg-mono);
  color: var(--dw-accent);
  border: 1px solid rgb(89 214 108 / 0.45);
  border-radius: 2px;
  background: rgb(89 214 108 / 0.1);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.mg-pill.kia {
  color: var(--dw-down);
  border-color: rgb(240 112 103 / 0.45);
  background: rgb(240 112 103 / 0.08);
}
.mg-menu {
  display: grid;
  gap: 0.2rem;
}
.mg-menu hr {
  width: 100%;
  margin: 0.5rem 0;
  border: 0;
  border-top: 1px solid var(--dw-line);
}
.mg-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 44px;
  padding: 0 0.75rem;
  font: 700 0.92rem / 1.15 var(--mg-display);
  color: var(--dw-muted);
  text-align: left;
  background: none;
  border: 0;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.mg-item svg {
  flex: none;
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mg-item[aria-current='true'] {
  color: var(--dw-accent);
  background: rgb(89 214 108 / 0.06);
  box-shadow: inset 3px 0 0 #ff6a2b;
}
.mg-item[aria-current='true'] svg {
  color: var(--dw-accent);
}
.mg-item:focus-visible,
.mg-row:focus-visible,
.mg-link:focus-visible,
.mg-x:focus-visible,
.mg-more summary:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .mg-item:not([aria-current='true']):hover {
    color: var(--dw-ink);
    background: rgb(255 255 255 / 0.04);
  }
}
.mg-main {
  display: grid;
  align-content: start;
  gap: 1rem;
  min-width: 0;
}
.mg-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.mg-head .dw-sub {
  margin-top: 0.2rem;
}
.mg-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 0;
}
.mg-stat {
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-end;
  min-width: 0;
  padding: 0.85rem 1rem;
  border: 1px solid var(--dw-line);
  border-radius: 2px;
  background: rgb(5 10 8 / 0.35);
}
.mg-stat dt {
  font: 400 0.66rem / 1.3 var(--mg-mono);
  color: var(--dw-muted);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.mg-stat dd {
  margin: 0 0 0.2rem;
  font: 700 2rem / 1 var(--mg-display);
  font-variant-numeric: tabular-nums;
}
/* The list, and the editor beside it once a team is chosen. */
.mg-work {
  display: grid;
  gap: 1rem;
  align-items: start;
}
@media (min-width: 1200px) {
  .mg-work.open {
    grid-template-columns: minmax(0, 1fr) minmax(0, 22rem);
  }
}
.mg-main h2.dw-plaque {
  margin: 0;
}
.mg-list {
  font-family: var(--mg-sans);
}
.mg-list td {
  vertical-align: middle;
}
.mg-list tr.sel td {
  background: rgb(89 214 108 / 0.07);
}
.mg-list tr.sel td:first-child {
  box-shadow: inset 3px 0 0 #ff6a2b;
}
.mg-row {
  min-height: 36px;
  padding: 0;
  font: 600 0.98rem / 1.2 var(--mg-sans);
  color: var(--dw-ink);
  text-align: left;
  background: none;
  border: 0;
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .mg-row:hover {
    color: var(--dw-accent);
  }
}
.mg-editor,
.mg-card {
  display: grid;
  align-content: start;
  gap: 0.85rem;
  min-width: 0;
  padding: 1rem 1.1rem 1.2rem;
  border: 1px solid var(--dw-line);
  border-radius: 2px;
  background: rgb(5 10 8 / 0.35);
}
.mg-ed-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--dw-line);
}
.mg-ed-head h3 {
  flex: 1;
  margin: 0;
  font: 700 1.1rem / 1.15 var(--mg-display);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.mg-x,
.mg-more summary {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  font-size: 1.3rem;
  line-height: 1;
  color: var(--dw-muted);
  background: none;
  border: 0;
  border-radius: 2px;
  cursor: pointer;
  list-style: none;
}
.mg-more {
  position: relative;
}
.mg-more summary::-webkit-details-marker {
  display: none;
}
.mg-more[open] summary {
  color: var(--dw-ink);
  background: rgb(255 255 255 / 0.05);
}
@media (hover: hover) and (pointer: fine) {
  .mg-x:hover,
  .mg-more summary:hover {
    color: var(--dw-ink);
    background: rgb(255 255 255 / 0.05);
  }
}
.mg-danger-item {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 3;
  min-height: 40px;
  padding: 0 0.9rem;
  font: 500 0.9rem / 1 var(--mg-sans);
  white-space: nowrap;
  color: #ff8a5c;
  background: #0e1c16;
  border: 1px solid var(--dw-line-2);
  border-radius: 2px;
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.4);
  cursor: pointer;
}
.mg-sub {
  margin: 0.3rem 0 0;
  font: 700 0.95rem / 1.15 var(--mg-display);
  color: var(--dw-ink);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.mg-roster {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 8.5rem);
  gap: 0.45rem 0.5rem;
}
.mg-in {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
  padding: 0.45rem 0.6rem;
  font: 400 1rem / 1.2 var(--mg-sans);
  color: var(--dw-ink);
  background: var(--dw-bg);
  border: 1px solid var(--dw-line-2);
  border-radius: 2px;
}
.mg-in:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 0;
}
select.kia {
  color: var(--dw-down);
}
.mg-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.75rem;
}
.mg-inline .dw-field {
  flex: 1 1 13rem;
  max-width: 22rem;
}
.mg-split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: 1rem;
}
.confirm {
  max-width: 18rem;
}
.mg-foot {
  margin-top: 0.5rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--dw-line);
}
.mg-link {
  padding: 0;
  font: 500 0.9rem / 1.4 var(--mg-sans);
  color: var(--dw-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  background: none;
  border: 0;
  cursor: pointer;
}
/* A narrow screen: the side menu becomes a row of tabs above the section. */
@media (max-width: 860px) {
  .mg-desk {
    grid-template-columns: minmax(0, 1fr);
  }
  .mg-side {
    position: static;
    padding: 0 0 0.75rem;
    border-right: 0;
    border-bottom: 1px solid var(--dw-line);
  }
  .mg-menu {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .mg-menu hr {
    display: none;
  }
  .mg-item {
    padding: 0 0.7rem;
    border: 1px solid var(--dw-line);
  }
}
@media (max-width: 520px) {
  .mg-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .mg-stat {
    padding: 0.7rem;
  }
  .mg-stat dd {
    font-size: 1.3rem;
  }
}
</style>
