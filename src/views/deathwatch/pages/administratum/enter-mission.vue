<script setup>
// Manage → Enter mission: pick a Kill Team, a week and an objective (or a cell of the 4×4 grid), fill in the
// mission and its three players, and save. A saved mission loads back into the form, so classes and Gene-Seed
// finders can be added later. The event points update as the form is filled, with the same formula as Standings.
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { CLASSES, SLOTS, clone, findMission, missionPoints, nextOpenSlot, num, withMission } from '../../../../lib/deathwatch/tracker'
import { download } from '../../../../lib/deathwatch/download'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'
import ResetZone from '../../../../components/deathwatch/tracker/ResetZone.vue'

const { data, R, S, save, reload } = useTracker()

// The numbers of a player row, in the stored order from kills (index 3) on.
const NUM = [
  ['k', 'Kills'],
  ['sp', 'Special'],
  ['me', 'Melee'],
  ['ra', 'Ranged'],
  ['it', 'Items'],
  ['dt', 'Dmg taken'],
  ['inc', 'Incaps'],
  ['rev', 'Revives'],
]
const n = (x) => +x || 0

const teams = computed(() => [...R.value.ts].sort((a, b) => a.id - b.id))
// A link from Checks names the mission: ?t= the team, ?w= the week, ?o= the objective. The team is taken once the
// data holds it.
const q = useRoute().query
const slot = (x) => Math.min(4, Math.max(1, Math.trunc(+x) || 1))
const want = +q.t || 0
const pick = reactive({ team: 0, w: slot(q.w), o: slot(q.o) })
const team = computed(() => data.teams[pick.team] ?? null)
const saved = computed(() => findMission(team.value, pick.w, pick.o))
const f = reactive({ played: 1, ig: '', gs: 0, ar: 0, rl: 0, rk: '', rows: [] })
const msg = ref('')

watch(teams, (ts) => {
  if (!ts.some((t) => t.id === pick.team)) pick.team = ts.some((t) => t.id === want) ? want : (ts[0]?.id ?? 0)
}, { immediate: true })

// Loads the picked slot: the saved mission, or a new one with the roster filled in (objective 4 is optional, so it
// starts as not played).
function fill() {
  const m = saved.value
  const [, , played, ig, gs, ar, rl, rk, rows] = m ?? [0, 0, pick.o === 4 ? 0 : 1, 0, 0, 0, 0, '', []]
  Object.assign(f, { played: played ? 1 : 0, ig: ig || '', gs: gs ? 1 : 0, ar: +ar || 0, rl: +rl || 0, rk: rk || '' })
  f.rows = [0, 1, 2].map((i) => {
    const r = rows[i] ?? [m ? '' : (team.value?.ro[i] ?? ''), '', 0, '', '', '', '', '', '', '', '']
    return { n: r[0], c: r[1], g: r[2] ? 1 : 0, ...Object.fromEntries(NUM.map(([k], j) => [k, r[3 + j] || ''])) }
  })
}
watch(() => [pick.team, pick.w, pick.o, saved.value], fill, { immediate: true })
watch(() => [pick.team, pick.w, pick.o], () => (msg.value = ''))
// With a Gene-Seed in a slot, at most two Relics fit.
watch(() => f.gs, (g) => (f.rl = Math.min(f.rl, SLOTS - g)))

const mission = computed(() => {
  const rows = f.rows.filter((r) => r.n.trim()).map((r) => [r.n.trim(), r.c, +r.g, ...NUM.map(([k]) => n(r[k]))])
  return [pick.w, pick.o, f.played, n(f.ig), n(f.gs), n(f.ar), n(f.rl), f.rk, f.played ? rows : []]
})
const points = computed(() => (f.played ? missionPoints(mission.value, S.value) : 0))
const guest = (name) => !!name.trim() && !!team.value && !team.value.ro.includes(name.trim())

const grid = computed(() =>
  [1, 2, 3, 4].map((w) =>
    [1, 2, 3, 4].map((o) => {
      const m = findMission(team.value, w, o)
      return { w, o, m, text: !m ? '+' : m[2] ? num(missionPoints(m, S.value)) : '–', state: !m ? '' : m[2] ? 'ok' : 'np' }
    }),
  ),
)
const count = (t) => (t.m ?? []).filter((m) => m[0] <= 4).length

async function store(next) {
  if (n(f.gs) + n(f.rl) > SLOTS) {
    msg.value = `Not saved: Gene-Seed and Guardian Relics share ${SLOTS} slots. With a Gene-Seed, at most ${SLOTS - 1} Relics.`
    return
  }
  try {
    await save('teams', team.value.id, withMission(team.value, mission.value))
    msg.value = 'Saved ✓'
    const slot = next && nextOpenSlot(team.value, pick.w, pick.o)
    if (slot) [pick.w, pick.o] = slot
  } catch (err) {
    msg.value = `Not saved: ${err.message}`
  }
}

const armed = ref(false)
async function remove() {
  if (!armed.value) {
    armed.value = true
    setTimeout(() => (armed.value = false), 4000)
    return
  }
  armed.value = false
  const d = clone(team.value)
  d.m = d.m.filter((x) => !(x[0] === pick.w && x[1] === pick.o))
  try {
    await save('teams', d.id, d)
    msg.value = 'Deleted ✓'
  } catch (err) {
    msg.value = `Not deleted: ${err.message}`
  }
}

const backup = () => download(`deathwatch-backup-${new Date().toISOString().slice(0, 10)}.json`, { exported: new Date().toISOString(), scoring: S.value, teams: Object.values(data.teams) })
const missionCount = computed(() => Object.values(data.teams).reduce((a, t) => a + (t.m ?? []).length, 0))
async function resetMissions() {
  for (const t of Object.values(data.teams)) await save('teams', t.id, { ...clone(t), m: [] })
}
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <h2 class="dw-plaque">Enter mission</h2>
    <p v-if="!teams.length" class="dw-empty">No Kill Teams yet. Add them under Manage.</p>
    <template v-else>
      <p class="dw-sub">Pick Kill Team, week and objective, or click a mission in the grid. Existing data is loaded so you can add classes and Gene-Seed finders.</p>
      <div class="dw-form">
        <label class="dw-field">
          Kill Team
          <select v-model.number="pick.team">
            <option v-for="t in teams" :key="t.id" :value="t.id">{{ t.n }} · {{ count(t) }}/16</option>
          </select>
        </label>
        <label class="dw-field">Week<select v-model.number="pick.w"><option v-for="x in 4" :key="x" :value="x">{{ x }}</option></select></label>
        <label class="dw-field">Objective<select v-model.number="pick.o"><option v-for="x in 4" :key="x" :value="x">{{ x }}</option></select></label>
      </div>

      <div class="grid" role="group" aria-label="Missions of this Kill Team">
        <span />
        <b v-for="o in 4" :key="`o${o}`">O{{ o }}</b>
        <template v-for="(row, wi) in grid" :key="wi">
          <b>W{{ wi + 1 }}</b>
          <button
            v-for="c in row"
            :key="c.o"
            type="button"
            :class="[c.state, { on: c.w === pick.w && c.o === pick.o }]"
            :aria-pressed="c.w === pick.w && c.o === pick.o"
            :title="`W${c.w} · O${c.o}${!c.m ? ': not entered' : c.m[2] ? '' : ': not played'}`"
            @click="Object.assign(pick, { w: c.w, o: c.o })"
          >
            {{ c.text }}
          </button>
        </template>
      </div>
      <p class="status">
        <span class="dw-chip" :class="saved ? 'gold' : 'accent'">{{ saved ? 'Editing saved mission' : 'New mission' }}</span>
        W{{ pick.w }} · O{{ pick.o }}
        <b>{{ f.played ? `${num(points)} event points` : 'Not played · 0 event points' }}</b>
      </p>

      <div class="dw-form">
        <label class="dw-field">Played<select v-model.number="f.played"><option :value="1">Yes</option><option :value="0">No</option></select></label>
        <label class="dw-field">In-Game Score<input v-model="f.ig" type="number" min="0" inputmode="numeric" /></label>
        <label class="dw-field">Gene-Seed<select v-model.number="f.gs"><option :value="0">No</option><option :value="1">Yes</option></select></label>
        <label class="dw-field">Armoury Data<select v-model.number="f.ar"><option v-for="x in [0, 1, 2, 3]" :key="x" :value="x">{{ x }}</option></select></label>
        <label class="dw-field">
          Guardian Relics
          <select v-model.number="f.rl"><option v-for="x in [0, 1, 2, 3]" :key="x" :value="x" :disabled="x > SLOTS - f.gs">{{ x }}</option></select>
        </label>
        <label class="dw-field">Extermination Rank<select v-model="f.rk"><option value="">–</option><option>A</option><option>B</option></select></label>
      </div>

      <datalist id="dw-players"><option v-for="x in R.names" :key="x" :value="x" /></datalist>
      <fieldset v-for="(r, i) in f.rows" :key="i" class="dw-fieldset">
        <legend>
          Player {{ i + 1 }}
          <span v-if="guest(r.n)" class="dw-tag guest" title="Not on this Kill Team's roster. Counts for Kill Team points, not for MVP.">Guest</span>
          <span v-if="R.kia.has(r.n.trim())" class="dw-tag kia" title="Marked as killed in action under Manage.">KIA</span>
        </legend>
        <div class="dw-form">
          <label class="dw-field">Name<input v-model="r.n" list="dw-players" /></label>
          <label class="dw-field">Class<select v-model="r.c"><option value="">–</option><option v-for="c in CLASSES" :key="c">{{ c }}</option></select></label>
          <label class="dw-field">Found Gene-Seed<select v-model.number="r.g"><option :value="0">No</option><option :value="1">Yes</option></select></label>
          <label v-for="[k, l] in NUM" :key="k" class="dw-field">{{ l }}<input v-model="r[k]" type="number" min="0" inputmode="numeric" /></label>
        </div>
      </fieldset>

      <div class="dw-actions">
        <button type="button" class="dw-btn rm-fade" @click="store(false)">Save mission</button>
        <button type="button" class="dw-btn rm-fade" @click="store(true)">Save &amp; next</button>
        <button v-if="saved" type="button" class="dw-btn rm-fade danger" @click="remove">{{ armed ? 'Tap again to delete' : 'Delete mission' }}</button>
        <span class="dw-msg" :class="{ ok: msg.endsWith('✓'), bad: msg.startsWith('Not') }" role="status">{{ msg }}</span>
      </div>

      <ResetZone
        title="Reset all missions"
        text="Deletes every mission and all player stats, including classes and Gene-Seed finders. Kill Teams, rosters and scoring rules stay."
        :ask="`This deletes ${missionCount} missions from ${teams.length} Kill Teams.`"
        :run="resetMissions"
        @backup="backup"
      />
    </template>
  </TrackerState>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 2.4rem repeat(4, minmax(0, 5.5rem));
  gap: 0.35rem;
  align-items: center;
}
.grid b {
  font: 600 0.8rem / 1 var(--dw-font-cond);
  letter-spacing: 0.1em;
  text-align: center;
  color: var(--dw-muted);
}
.grid button {
  min-height: 44px;
  font: 500 1.05rem / 1 var(--dw-font-hud);
  color: var(--dw-muted);
  background: transparent;
  border: 1px dashed var(--dw-line-2);
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
.grid button:active {
  transform: scale(0.97);
}
.grid button.ok {
  color: var(--dw-accent);
  border-style: solid;
  background: color-mix(in oklab, var(--dw-accent) 8%, transparent);
}
.grid button.np {
  border-style: solid;
}
.grid button.on {
  outline: 2px solid var(--dw-gold);
  outline-offset: 1px;
}
.grid button:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 1px;
}
.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin: 0;
  color: var(--dw-silver);
}
.status b {
  font: 500 1.4rem / 1 var(--dw-font-hud);
  color: var(--dw-accent);
}
</style>
