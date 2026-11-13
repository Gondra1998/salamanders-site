<script setup>
// One Kill Team's profile in one event: roster, key numbers, its players, points per week and every mission.
// The picker changes `teamId` through the `pick` event; links go where the page's `to` says.
import { computed } from 'vue'
import { missionMvp, missionPoints, mvpText, num, rowMvp, sum } from '../../../lib/deathwatch/tracker'
import PlayerName from './PlayerName.vue'

const props = defineProps({
  R: { type: Object, required: true },
  teamId: { type: Number, default: 0 },
  to: { type: Object, required: true },
  notes: { type: Boolean, default: false },
})
defineEmits(['pick'])

const teams = computed(() => [...props.R.ts].sort((a, b) => a.id - b.id))
const t = computed(() => teams.value.find((x) => x.id === props.teamId) ?? teams.value[0])
const S = computed(() => props.R.S)
const played = computed(() => t.value.m.filter((m) => m[2] && m[0] >= 1 && m[0] <= 4))

// Home roster first, then the guests who played for this team.
const players = computed(() => {
  const A = Object.create(null) // keyed by player names: "constructor" must not find a built-in
  for (const m of played.value) {
    for (const r of m[8] ?? []) {
      if (!r[0]) continue
      const a = (A[r[0]] ??= { o: 0, k: 0, s: 0, me: 0, ra: 0, it: 0, dt: 0, i: 0, v: 0 })
      a.o++
      a.k += r[3]
      a.s += r[4]
      a.me += r[5]
      a.ra += r[6]
      a.it += r[7]
      a.dt += r[8]
      a.i += r[9]
      a.v += r[10]
    }
  }
  const names = [...t.value.ro, ...Object.keys(A).filter((n) => !t.value.ro.includes(n))]
  return names.map((n) => ({
    n,
    a: A[n] ?? { o: 0, k: 0, s: 0, me: 0, ra: 0, it: 0, dt: 0, i: 0, v: 0 },
    guest: !t.value.ro.includes(n),
    p: props.R.pl.find((x) => x.n === n && x.t === t.value.id),
  }))
})
const weeks = computed(() => {
  const mx = Math.max(1, ...t.value.wk)
  let cum = 0
  return t.value.wk.map((w, i) => ({ i, w, cum: (cum += w), pct: (w / mx) * 100 }))
})
const missions = computed(() =>
  [...t.value.m].filter((m) => m[0] >= 1 && m[0] <= 4).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((m) => ({ m, mvp: m[2] ? missionMvp(m, S.value) : null })),
)
const kia = computed(() => t.value.ro.filter((n) => props.R.kia.has(n)))
</script>

<template>
  <h2 class="dw-plaque">Kill Team profile</h2>
  <label class="dw-field pick">
    Kill Team
    <select :value="t.id" @change="$emit('pick', +$event.target.value)">
      <option v-for="x in teams" :key="x.id" :value="x.id">{{ x.n }}</option>
    </select>
  </label>
  <div class="dw-chips">
    <span class="dw-chip accent">{{ t.co }} Company</span>
    <span class="dw-tile-label">Home roster</span>
    <PlayerName v-for="n in t.ro" :key="n" :name="n" :R="R" :to="to.player(n)" />
    <span v-if="!t.ro.length" class="dw-sub">none</span>
  </div>
  <div class="dw-tiles">
    <div class="dw-tile"><p class="dw-tile-label">Rank</p><span class="dw-tile-value">{{ t.r }}</span></div>
    <div class="dw-tile"><p class="dw-tile-label">Event points</p><span class="dw-tile-value">{{ num(t.tot) }}</span></div>
    <div class="dw-tile">
      <p class="dw-tile-label">Move</p>
      <span class="dw-tile-value" :class="t.mv > 0 ? 'up' : t.mv < 0 ? 'down' : ''">{{ t.mv > 0 ? `▲${t.mv}` : t.mv < 0 ? `▼${-t.mv}` : '–' }}</span>
    </div>
    <div class="dw-tile"><p class="dw-tile-label">Gap to #1</p><span class="dw-tile-value">{{ t.gap ? `−${num(t.gap)}` : '–' }}</span></div>
    <div class="dw-tile"><p class="dw-tile-label">Missions played</p><span class="dw-tile-value">{{ t.pl }}</span></div>
    <div v-if="kia.length" class="dw-tile"><p class="dw-tile-label">KIA</p><span class="dw-tile-value down">{{ kia.length }} of {{ t.ro.length }}</span></div>
  </div>

  <h2 class="dw-plaque">Operatives</h2>
  <p v-if="notes" class="dw-sub">
    Only missions played for this Kill Team. MVP counts home Kill Team missions only. Guests (players not on this Kill Team’s roster) are highlighted and shown without MVP.
  </p>
  <div class="dw-scroll">
    <table class="dw-table">
      <thead>
        <tr>
          <th class="l">Operative</th><th>Obj</th><th>Kills</th><th>Special</th><th>Melee</th><th>Ranged</th><th>Items</th><th>Dmg taken</th><th>Incaps</th><th>Revives</th><th>MVP</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="x in players" :key="x.n" :class="{ guest: x.guest }">
          <td class="l"><b><PlayerName :name="x.n" :R="R" :to="to.player(x.n)" :guest="x.guest" /></b></td>
          <td>{{ x.a.o }}</td>
          <td>{{ num(x.a.k) }}</td>
          <td>{{ x.a.s }}</td>
          <td>{{ num(x.a.me) }}</td>
          <td>{{ num(x.a.ra) }}</td>
          <td>{{ x.a.it }}</td>
          <td>{{ num(x.a.dt) }}</td>
          <td>{{ x.a.i }}</td>
          <td>{{ x.a.v }}</td>
          <td class="big">{{ x.p ? mvpText(x.p.mvp) : '–' }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <h2 class="dw-plaque">Points per week</h2>
  <div class="dw-scroll">
    <table class="dw-table">
      <thead>
        <tr><th class="l">Week</th><th>Points</th><th>Total</th><th><span class="dw-sr-only">Share of the best week</span></th></tr>
      </thead>
      <tbody>
        <tr v-for="w in weeks" :key="w.i">
          <td class="l"><b>Week {{ w.i + 1 }}</b></td>
          <td>{{ num(w.w) }}</td>
          <td>{{ num(w.cum) }}</td>
          <td class="bar-cell"><span class="bar"><i :style="{ width: `${w.pct}%` }" /></span></td>
        </tr>
      </tbody>
    </table>
  </div>

  <h2 class="dw-plaque">Missions</h2>
  <div class="dw-scroll">
    <table class="dw-table">
      <thead>
        <tr>
          <th class="l">Mission</th><th>Kills</th><th>Special</th><th>Melee</th><th>Ranged</th><th>Incaps</th><th>Revives</th><th>Seed</th><th>Armoury</th><th>Relic</th><th>Ext</th><th>Points</th><th class="l">MVP</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="{ m, mvp } in missions" :key="`${m[0]}-${m[1]}`">
          <tr v-if="!m[2]" class="dim">
            <td class="l">W{{ m[0] }} · O{{ m[1] }}</td>
            <td colspan="12" class="l">Not played</td>
          </tr>
          <tr v-else>
            <td class="l">W{{ m[0] }} · O{{ m[1] }}</td>
            <td>{{ num(sum(m[8], 3)) }}</td>
            <td>{{ sum(m[8], 4) }}</td>
            <td>{{ num(sum(m[8], 5)) }}</td>
            <td>{{ num(sum(m[8], 6)) }}</td>
            <td>{{ sum(m[8], 9) }}</td>
            <td>{{ sum(m[8], 10) }}</td>
            <td>{{ m[4] }}</td>
            <td>{{ m[5] }}</td>
            <td>{{ m[6] }}</td>
            <td>{{ m[7] || '–' }}</td>
            <td class="big">{{ num(missionPoints(m, S)) }}</td>
            <td class="l">
              <PlayerName v-if="mvp" :name="mvp[0]" :R="R" :to="to.player(mvp[0])" :guest="!t.ro.includes(mvp[0])" />
              <span v-else>–</span>
              <span v-if="mvp" class="dw-sr-only">MVP score {{ num(rowMvp(mvp, S)) }}</span>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.pick {
  max-width: 22rem;
}
.bar-cell {
  width: 40%;
}
.bar {
  display: block;
  height: 0.6rem;
  background: var(--dw-line);
}
.bar i {
  display: block;
  height: 100%;
  background: var(--dw-accent);
}
</style>
