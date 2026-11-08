<script setup>
// Standings for one event (the live one or an archived one): the top three on a podium, the table, the points
// progression and the Watch Companies.
import { computed } from 'vue'
import { COMPANIES, num } from '../../../lib/deathwatch/tracker'
import PointsChart from './PointsChart.vue'

const props = defineProps({
  R: { type: Object, required: true },
  team: { type: Function, required: true },
})

const podium = computed(() => props.R.ts.filter((t) => t.tot > 0).slice(0, 3))
// Medal places by points, so teams level on points share a medal colour.
const medal = (t) => (t.tot > 0 ? 1 + props.R.ts.filter((x) => x.tot > t.tot).length : 9)
const move = (t) => (t.mv > 0 ? `▲${t.mv}` : t.mv < 0 ? `▼${-t.mv}` : '–')
const companies = computed(() =>
  COMPANIES.map((c) => {
    const a = props.R.ts.filter((t) => t.co === c)
    return { c, n: a.length, pts: a.reduce((x, t) => x + t.tot, 0) }
  }).sort((a, b) => b.pts - a.pts),
)
</script>

<template>
  <h2 class="dw-plaque">Standings</h2>
  <ol v-if="podium.length" class="pod" aria-label="Top three">
    <li v-for="t in podium" :key="t.id" class="pod-card" :class="`p${t.r}`">
      <div class="pod-head">
        <span class="pod-rank">{{ t.r }}</span>
        <div>
          <h3 class="pod-name"><RouterLink class="dw-link" :to="team(t.id)">{{ t.n }}</RouterLink></h3>
          <small>{{ t.co }} Company · {{ t.pl }} missions</small>
        </div>
      </div>
      <p class="pod-pts"><span>{{ num(t.tot) }}</span><small>event points</small></p>
      <p class="pod-foot"><span>Ø {{ num(Math.round(t.avg)) }}/mission</span><span>{{ t.gap ? `−${num(t.gap)} to #1` : 'Leading' }}</span></p>
    </li>
  </ol>
  <div class="dw-scroll">
    <table class="dw-table">
      <thead>
        <tr><th>#</th><th class="l">Kill Team</th><th>W1</th><th>W2</th><th>W3</th><th>W4</th><th>Total</th><th>Gap</th><th>Ø/mission</th></tr>
      </thead>
      <tbody>
        <tr v-for="t in R.ts" :key="t.id" :class="medal(t) < 4 ? `m${medal(t)}` : ''">
          <td class="rank">{{ t.r }}</td>
          <td class="l">
            <b><RouterLink class="dw-link" :to="team(t.id)">{{ t.n }}</RouterLink></b>
            <small>{{ t.co }} <span :class="t.mv > 0 ? 'up' : t.mv < 0 ? 'down' : ''">{{ move(t) }}</span></small>
          </td>
          <td v-for="(w, j) in t.wk" :key="j">{{ num(w) }}</td>
          <td class="big">{{ num(t.tot) }}</td>
          <td>{{ t.gap ? `−${num(t.gap)}` : '–' }}</td>
          <td>{{ num(Math.round(t.avg)) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <!-- Folded away, as in the design: the table above already says who leads; the chart is the long view. -->
  <details class="prog">
    <summary>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      <h2 class="prog-h">Points progression</h2>
      <span class="prog-sub">Weekly totals and ranking trends</span>
    </summary>
    <PointsChart :R="R" />
  </details>
  <h2 class="dw-plaque">Watch Companies</h2>
  <div class="dw-scroll">
    <table class="dw-table">
      <thead>
        <tr><th class="l">Company</th><th>Kill Teams</th><th>Points</th></tr>
      </thead>
      <tbody>
        <tr v-for="c in companies" :key="c.c">
          <td class="l"><b>{{ c.c }}</b></td>
          <td>{{ c.n }}</td>
          <td class="big">{{ num(c.pts) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.pod {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pod-card {
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
  border: 1px solid var(--dw-line-2);
  background: color-mix(in oklab, var(--dw-surface) 88%, transparent);
  --pc: var(--dw-accent);
}
.pod-card.p1 {
  --pc: var(--dw-gold);
  border-color: color-mix(in oklab, var(--dw-gold) 55%, var(--dw-line-2));
}
.pod-card.p2 {
  --pc: var(--dw-silver);
}
.pod-card.p3 {
  --pc: #d39a68;
}
.pod-head {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.pod-rank {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.4rem;
  height: 2.4rem;
  font: 500 1.6rem / 1 var(--dw-font-hud);
  color: var(--dw-bg);
  background: var(--pc);
  /* A shield, as in the design. */
  height: 2.8rem;
  padding-bottom: 0.4rem;
  clip-path: polygon(0 0, 100% 0, 100% 72%, 50% 100%, 0 72%);
}
.pod-name {
  margin: 0;
  font: 600 1.1rem / 1.2 var(--dw-font-cond);
  color: var(--dw-ink);
  overflow-wrap: anywhere;
}
.pod-head small,
.pod-pts small,
.pod-foot {
  color: var(--dw-muted);
  font-size: 0.85rem;
}
.pod-pts {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0;
}
.pod-pts span {
  font: 500 2.2rem / 1 var(--dw-font-hud);
  color: var(--pc);
}
.pod-foot {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0;
  padding-top: 0.6rem;
  border-top: 1px solid var(--dw-line-2);
}
/* The leader's row in the table, lit in the leader's gold. */
.dw-table tr.m1 td {
  background: color-mix(in oklab, var(--dw-gold) 9%, transparent);
}
/* Points progression, folded: one framed bar that opens on the chart. */
.prog {
  margin-top: 0.75rem;
  border: 1px solid color-mix(in oklab, var(--dw-accent) 45%, var(--dw-line-2));
  border-radius: 6px;
  background: color-mix(in oklab, var(--dw-surface) 88%, transparent);
}
.prog summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1.1rem;
  min-height: 52px;
  padding: 0.4rem 1.1rem;
  list-style: none;
  cursor: pointer;
}
.prog summary::-webkit-details-marker {
  display: none;
}
.prog summary:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
.prog summary svg {
  flex: none;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: var(--dw-accent);
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--dur-state) var(--ease-forge);
}
.prog[open] summary svg {
  transform: rotate(180deg);
}
.prog-h {
  margin: 0;
  font: 500 clamp(1.3rem, 2.4vw, 1.7rem) / 1 var(--dw-font-hud);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--dw-accent);
  text-shadow: 0 0 10px color-mix(in oklab, var(--dw-accent) 55%, transparent);
}
.prog-sub {
  padding-left: 1.1rem;
  border-left: 1px solid var(--dw-line-2);
  color: var(--dw-muted);
}
.prog > :not(summary) {
  margin: 0 1rem 1rem;
}
</style>
