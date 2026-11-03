<script setup>
// The event's totals, per Kill Team, and (with `classes`) how often each class was played and by whom.
import { computed } from 'vue'
import { CLASSES, GAME_STATS, kd, num, teamStats } from '../../../lib/deathwatch/tracker'

const props = defineProps({ R: { type: Object, required: true }, classes: { type: Boolean, default: false }, notes: { type: Boolean, default: false } })

const rows = computed(() => props.R.ts.map((t) => ({ t, a: teamStats(t) })))
const tot = computed(() => GAME_STATS.map((_, i) => rows.value.reduce((s, x) => s + x.a[i], 0)))
const classRows = computed(() => CLASSES.map((c) => ({ c, x: props.R.C[c] })))
const entries = computed(() => classRows.value.reduce((a, r) => a + r.x.n, 0))
</script>

<template>
  <h2 class="dw-plaque">Game Stats</h2>
  <div class="dw-tiles">
    <div v-for="(k, i) in GAME_STATS" :key="k" class="dw-tile">
      <p class="dw-tile-label">{{ k }}</p>
      <span class="dw-tile-value">{{ num(tot[i]) }}</span>
      <span v-if="i && i < 13 && tot[0]" class="dw-tile-note">Ø {{ num(tot[i] / tot[0]) }} per mission</span>
    </div>
  </div>
  <h2 class="dw-plaque">Per Kill Team</h2>
  <div class="dw-scroll">
    <table class="dw-table">
      <thead>
        <tr><th class="l">Kill Team</th><th v-for="k in GAME_STATS" :key="k">{{ k }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="{ t, a } in rows" :key="t.id">
          <td class="l"><b>{{ t.n }}</b></td>
          <td v-for="(v, i) in a" :key="i">{{ num(v) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td class="l"><b>Total</b></td>
          <td v-for="(v, i) in tot" :key="i" class="big">{{ num(v) }}</td>
        </tr>
      </tfoot>
    </table>
  </div>
  <template v-if="classes">
    <h2 class="dw-plaque">Classes</h2>
    <p v-if="notes" class="dw-sub">{{ R.none }} player entries have no class yet. Enter them under “Enter mission”.</p>
    <div class="dw-scroll">
      <table class="dw-table">
        <thead>
          <tr><th class="l">Class</th><th>Played</th><th>Share</th><th>Ø kills</th><th title="Kills per incap">K/D</th></tr>
        </thead>
        <tbody>
          <tr v-for="{ c, x } in classRows" :key="c">
            <td class="l"><b>{{ c }}</b></td>
            <td>{{ x.n }}</td>
            <td>{{ entries ? `${Math.round((x.n / entries) * 100)}%` : '–' }}</td>
            <td>{{ x.kn ? num(x.k / x.kn) : '–' }}</td>
            <td>{{ x.n ? kd(x.k, x.i) : '–' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <h2 class="dw-plaque">Class mix per Kill Team</h2>
    <div class="dw-scroll">
      <table class="dw-table">
        <thead>
          <tr><th class="l">Kill Team</th><th v-for="c in CLASSES" :key="c">{{ c }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in R.ts" :key="t.id">
            <td class="l"><b>{{ t.n }}</b></td>
            <td v-for="c in CLASSES" :key="c">{{ t.cc[c] || 0 }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
