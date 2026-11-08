<script setup>
// Event Tracker → Archive: finished events, newest first; one opens (?e=<id>) with the tracker's own views of it
// (?v=kill-teams|players|honour-roll|game-stats, plus ?t / ?p), worked out with that event's own weights. The
// Watch Commander can download an event as a backup file or delete it.
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { useDeathwatch } from '../../../../stores/deathwatch'
import { calc, num, slug } from '../../../../lib/deathwatch/tracker'
import { download } from '../../../../lib/deathwatch/download'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'
import StandingsView from '../../../../components/deathwatch/tracker/StandingsView.vue'
import KillTeamView from '../../../../components/deathwatch/tracker/KillTeamView.vue'
import PlayersView from '../../../../components/deathwatch/tracker/PlayersView.vue'
import HonourRollView from '../../../../components/deathwatch/tracker/HonourRollView.vue'
import GameStatsView from '../../../../components/deathwatch/tracker/GameStatsView.vue'

const VIEWS = [
  ['standings', 'Standings'],
  ['kill-teams', 'Kill Teams'],
  ['players', 'Operatives'],
  ['honour-roll', 'Honour Roll'],
  ['game-stats', 'Game Stats'],
]
const route = useRoute()
const router = useRouter()
const { data, archived, all, save, reload } = useTracker()
const gate = useDeathwatch()

const q = (k) => (typeof route.query[k] === 'string' ? route.query[k] : '')
const list = computed(() => Object.entries(data.archive).sort((a, b) => (b[1].at ?? '').localeCompare(a[1].at ?? '')))
const id = computed(() => (Object.hasOwn(data.archive, q('e')) ? q('e') : ''))
const ev = computed(() => (id.value ? data.archive[id.value] : null))
const R = computed(() => ev.value && calc(Object.fromEntries((ev.value.teams ?? []).map((t) => [t.id, t])), ev.value.sc))
const view = computed(() => (VIEWS.some((v) => v[0] === q('v')) ? q('v') : 'standings'))
const to = computed(() => archived(id.value))
const date = (a) => new Date(a.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const pickTeam = (t) => router.replace({ query: { ...route.query, t: String(t) } })
const pickPlayer = (p) => router.push({ query: { ...route.query, p } })

const msg = ref('')
const armed = ref(false)
function backup() {
  const a = ev.value
  download(`deathwatch-${slug(a.name || 'event')}.json`, { exported: a.at, scoring: a.sc, teams: a.teams })
}
async function remove() {
  // A second press within four seconds deletes: one stray tap cannot.
  if (!armed.value) {
    armed.value = true
    setTimeout(() => (armed.value = false), 4000)
    return
  }
  armed.value = false
  try {
    await save('archive', id.value, null)
    router.push(all())
  } catch (err) {
    msg.value = `Not deleted: ${err.message}`
  }
}
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <template v-if="!ev">
      <h2 class="dw-plaque">Archive</h2>
      <p v-if="gate.commander" class="dw-sub">Finished events, newest first. Open one to see its final standings, points progression, honours and players.</p>
      <div v-if="list.length" class="dw-tiles">
        <RouterLink v-for="[k, a] in list" :key="k" class="dw-tile ev" :to="archived(k).view('standings')">
          <span class="dw-tile-label">{{ a.name }}</span>
          <span class="dw-tile-who">{{ a.sum?.champ || '–' }}</span>
          <span class="dw-tile-value">{{ a.sum ? num(a.sum.pts) : '' }}</span>
          <span class="dw-tile-note">{{ date(a) }} · {{ a.sum?.nt ?? '?' }} Kill Teams · {{ a.sum?.nm ?? '?' }} missions</span>
        </RouterLink>
      </div>
      <p v-else class="dw-empty">No archived events yet.<template v-if="gate.commander"> Use “Archive &amp; reset” under Manage when the event is over.</template></p>
    </template>
    <template v-else>
      <p><RouterLink class="dw-link" :to="all()">← All events</RouterLink></p>
      <h2 class="dw-plaque">{{ ev.name }}</h2>
      <p class="dw-sub">Archived {{ date(ev) }} · read-only copy · {{ R.ts.length }} Kill Teams</p>
      <nav class="views" aria-label="Views of this event">
        <RouterLink v-for="[k, l] in VIEWS" :key="k" :to="to.view(k)" :aria-current="view === k ? 'page' : undefined">{{ l }}</RouterLink>
      </nav>
      <StandingsView v-if="view === 'standings'" :R="R" :team="to.team" />
      <KillTeamView v-else-if="view === 'kill-teams'" :R="R" :team-id="+q('t') || 0" :to="to" @pick="pickTeam" />
      <PlayersView v-else-if="view === 'players'" :R="R" :player="q('p')" :to="to" @pick="pickPlayer" />
      <HonourRollView v-else-if="view === 'honour-roll'" :R="R" :to="to" />
      <GameStatsView v-else :R="R" />
      <div v-if="gate.commander" class="dw-actions">
        <button type="button" class="dw-btn rm-fade" @click="backup">Download backup</button>
        <button type="button" class="dw-btn rm-fade danger" @click="remove">{{ armed ? 'Tap again to delete' : 'Delete from archive' }}</button>
        <span class="dw-msg bad" role="status">{{ msg }}</span>
      </div>
    </template>
  </TrackerState>
</template>

<style scoped>
.ev {
  text-decoration: none;
  transition: transform var(--dur-press) var(--ease-forge);
}
.ev:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .ev:hover {
    border-color: var(--dw-accent);
  }
}
.ev:active {
  transform: scale(0.97);
}
.views {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.views a {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0.3rem 0.85rem;
  font: 500 1.05rem / 1 var(--dw-font-hud);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--dw-silver);
  border: 1px solid var(--dw-line-2);
  transition: transform var(--dur-press) var(--ease-forge);
}
.views a:active {
  transform: scale(0.97);
}
.views a[aria-current='page'] {
  color: var(--dw-accent);
  border-color: var(--dw-accent);
}
.views a:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
</style>
