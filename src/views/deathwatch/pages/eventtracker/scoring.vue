<script setup>
// Event Tracker → Scoring: the running event's rules, drawn from its weights (set under Manage).
import { computed } from 'vue'
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { useDeathwatch } from '../../../../stores/deathwatch'
import { SLOTS, bestMission, num } from '../../../../lib/deathwatch/tracker'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'

const { data, S, reload } = useTracker()
const gate = useDeathwatch()

const points = computed(() => [
  ['Played mission', S.value.base, 'base'],
  ['Gene-Seed recovered', S.value.gs, 'per mission'],
  ['Extermination Rank A', S.value.A, 'per mission'],
  ['Extermination Rank B', S.value.B, 'per mission'],
  ['Guardian Relic', S.value.rl, 'each'],
  ['Armoury Data', S.value.ar, 'each'],
  ['Revive', S.value.rev, 'each'],
  ['Incapacitation', -S.value.inc, 'each'],
])
const mvp = computed(() => [
  ['Kill', 1 / S.value.mk, 'each'],
  ['Special kill', S.value.ms, 'each'],
  ['Revive', S.value.mr, 'each'],
  ['Objective played', S.value.mp, 'each'],
  ['Incapacitation', -S.value.mi, 'each'],
])
const best = computed(() => bestMission(S.value))
// A bar's length against the largest value in its list.
const bars = (rows) => {
  const mx = Math.max(...rows.map((r) => Math.abs(r[1]))) || 1
  return rows.map(([l, v, u]) => ({ l, v, u, w: (Math.abs(v) / mx) * 100 }))
}
const signed = (v) => `${v < 0 ? '−' : '+'}${num(Math.abs(v))}`
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <h2 class="dw-plaque">Event points per mission</h2>
    <ul class="bars">
      <li v-for="b in bars(points)" :key="b.l" :class="{ neg: b.v < 0 }">
        <span class="bl">{{ b.l }}</span><span class="bt"><i :style="{ width: `${b.w}%` }" /></span><b>{{ signed(b.v) }}<small>{{ b.u }}</small></b>
      </li>
    </ul>
    <h2 class="dw-plaque">Best possible mission</h2>
    <div class="eq">
      <template v-for="([l, v], i) in best.parts" :key="l">
        <span v-if="i" class="op" aria-hidden="true">+</span>
        <div class="dw-tile"><p class="dw-tile-label">{{ l }}</p><span class="dw-tile-value">{{ num(v) }}</span></div>
      </template>
      <span class="op" aria-hidden="true">=</span>
      <div class="dw-tile total"><p class="dw-tile-label">Total</p><span class="dw-tile-value">{{ num(best.total) }}</span></div>
    </div>
    <p v-if="gate.canEdit" class="dw-sub">
      Gene-Seed and Guardian Relics share {{ SLOTS }} slots. Plus {{ num(S.rev) }} per revive, minus {{ num(S.inc) }} per incapacitation. A Kill Team's event points
      are the sum of all its missions.
    </p>
    <h2 class="dw-plaque">MVP score per objective</h2>
    <ul class="bars">
      <li v-for="b in bars(mvp)" :key="b.l" :class="{ neg: b.v < 0 }">
        <span class="bl">{{ b.l }}</span><span class="bt"><i :style="{ width: `${b.w}%` }" /></span><b>{{ signed(b.v) }}<small>{{ b.u }}</small></b>
      </li>
    </ul>
  </TrackerState>
</template>

<style scoped>
.bars {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding: 0.9rem 1rem;
  list-style: none;
  border: 1px solid var(--dw-line-2);
  background: color-mix(in oklab, var(--dw-surface) 85%, transparent);
}
.bars li {
  display: grid;
  grid-template-columns: minmax(8rem, 13rem) 1fr 6.5rem;
  align-items: center;
  gap: 0.75rem;
  font-family: var(--dw-font-cond);
}
.bl {
  color: var(--dw-silver);
}
.bt {
  height: 0.65rem;
  background: var(--dw-line);
}
.bt i {
  display: block;
  height: 100%;
  background: var(--dw-accent);
}
.neg .bt i {
  background: var(--dw-down);
}
.bars b {
  font: 500 1.2rem / 1 var(--dw-font-hud);
  text-align: right;
  color: var(--dw-accent);
}
.neg b {
  color: var(--dw-down);
}
.bars small {
  margin-left: 0.3rem;
  font: 400 0.75rem var(--dw-font-cond);
  color: var(--dw-muted);
}
/* A phone: label and value on one line, the bar under them. */
@media (max-width: 560px) {
  .bars li {
    grid-template-columns: 1fr auto;
  }
  .bt {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
.eq {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.eq .dw-tile {
  flex: 1 1 8rem;
}
.eq .total {
  border-color: var(--dw-gold);
}
.eq .total .dw-tile-value {
  color: var(--dw-gold);
}
.op {
  font: 500 1.6rem / 1 var(--dw-font-hud);
  color: var(--dw-muted);
}
</style>
