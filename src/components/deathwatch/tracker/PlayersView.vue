<script setup>
// The players of one event ranked by MVP, or, with `player`, that player's profile: home team, awards, totals,
// classes and every mission they played (guest missions highlighted).
import { computed } from 'vue'
import { awardsOf, classRank, kd, mainClass, mvpText, num, rowMvp } from '../../../lib/deathwatch/tracker'
import PlayerName from './PlayerName.vue'

const props = defineProps({
  R: { type: Object, required: true },
  player: { type: String, default: '' },
  to: { type: Object, required: true },
  notes: { type: Boolean, default: false },
})
defineEmits(['pick'])

const S = computed(() => props.R.S)
const medal = (p) => (p.mvp > 0 ? 1 + props.R.pl.filter((x) => x.mvp > p.mvp).length : 9)
const teamName = (id) => props.R.ts.find((t) => t.id === id)?.n ?? ''

const names = computed(() => [...props.R.names].sort((a, b) => a.localeCompare(b)))
const profile = computed(() => {
  const n = props.player
  if (!n) return null
  const A = { o: 0, k: 0, s: 0, me: 0, ra: 0, it: 0, i: 0, v: 0, g: 0 }
  const cl = Object.create(null) // keyed by class names from the data
  const L = []
  for (const t of props.R.ts) {
    for (const m of t.m) {
      if (!m[2] || m[0] < 1 || m[0] > 4) continue
      for (const r of m[8] ?? []) {
        if (r[0] !== n) continue
        L.push({ t, m, r, guest: !t.ro.includes(n) })
        A.o++
        A.k += r[3]
        A.s += r[4]
        A.me += r[5]
        A.ra += r[6]
        A.it += r[7]
        A.i += r[9]
        A.v += r[10]
        A.g += r[2] ? 1 : 0
        const c = r[1] || 'no class'
        cl[c] = (cl[c] || 0) + 1
      }
    }
  }
  const i = props.R.pl.findIndex((x) => x.n === n)
  return {
    A,
    L: L.sort((x, y) => x.m[0] - y.m[0] || x.m[1] - y.m[1] || x.t.id - y.t.id),
    p: props.R.pl[i],
    rank: i + 1,
    home: props.R.ts.find((t) => t.id === props.R.home[n]),
    guests: L.filter((x) => x.guest).length,
    awards: awardsOf(props.R, n),
    classes: Object.entries(cl).sort((a, b) => b[1] - a[1] || classRank(a[0]) - classRank(b[0])),
  }
})
</script>

<template>
  <template v-if="!player">
    <h2 class="dw-plaque">Players</h2>
    <p v-if="notes" class="dw-sub">Home Kill Team objectives only. MVP weights are set under Manage.</p>
    <p v-if="!R.pl.length" class="dw-empty">No missions played yet.</p>
    <div v-else class="dw-scroll">
      <table class="dw-table">
        <thead>
          <tr><th>#</th><th class="l">Player</th><th>MVP</th><th>Kills</th><th>Special</th><th>Revives</th><th>Incaps</th><th title="Kills per incap">K/D</th><th>Seeds</th><th class="l">Class</th></tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in R.pl" :key="p.n" :class="medal(p) < 4 ? `m${medal(p)}` : ''">
            <td class="rank">{{ i + 1 }}</td>
            <td class="l">
              <b><PlayerName :name="p.n" :R="R" :to="to.player(p.n)" /></b>
              <small>{{ teamName(p.t) }} · {{ p.o }} obj</small>
            </td>
            <td class="big">{{ mvpText(p.mvp) }}</td>
            <td>{{ num(p.k) }}</td>
            <td>{{ p.s }}</td>
            <td>{{ p.v }}</td>
            <td>{{ p.i }}</td>
            <td>{{ kd(p.k, p.i) }}</td>
            <td>{{ p.g }}</td>
            <td class="l">
              <span v-if="mainClass(p).length > 1" :title="mainClass(p).join(', ')">{{ mainClass(p).map((c) => c.slice(0, 4)).join(' / ') }}</span>
              <span v-else>{{ mainClass(p)[0] ?? '–' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>

  <template v-else>
    <p><RouterLink class="dw-link" :to="to.players()">← All players</RouterLink></p>
    <h2 class="dw-plaque">Player profile</h2>
    <label class="dw-field pick">
      Player
      <select :value="player" @change="$emit('pick', $event.target.value)">
        <option v-if="!names.includes(player)" :value="player">{{ player }}</option>
        <option v-for="x in names" :key="x" :value="x">{{ x }}</option>
      </select>
    </label>
    <p v-if="!profile.L.length" class="dw-empty">No missions found for “{{ player }}”.</p>
    <template v-else>
      <p class="ppn">{{ player }}</p>
      <div class="dw-chips">
        <template v-if="profile.home">
          <span class="dw-chip accent">{{ profile.home.co }} Company</span>
          <span class="dw-chip"><RouterLink class="dw-link" :to="to.team(profile.home.id)">{{ profile.home.n }}</RouterLink></span>
        </template>
        <span v-else class="dw-chip">Guest only</span>
        <span v-if="R.kia.has(player)" class="dw-chip down">KIA{{ R.kia.get(player) ? ` W${R.kia.get(player)}` : '' }}</span>
        <span class="dw-chip">{{ profile.A.o }} mission{{ profile.A.o === 1 ? '' : 's' }}</span>
        <span v-if="profile.guests" class="dw-chip gold">{{ profile.guests }} as guest</span>
      </div>
      <div v-if="profile.awards.length" class="dw-chips">
        <span v-for="a in profile.awards" :key="a" class="dw-chip gold">{{ a }}</span>
      </div>
      <div class="dw-tiles">
        <div class="dw-tile">
          <p class="dw-tile-label">MVP</p>
          <span class="dw-tile-value">{{ profile.p ? mvpText(profile.p.mvp) : '–' }}</span>
          <span class="dw-tile-note">{{ profile.p ? `Rank ${profile.rank} of ${R.pl.length}` : 'home missions only' }}</span>
        </div>
        <div class="dw-tile"><p class="dw-tile-label">Kills</p><span class="dw-tile-value">{{ num(profile.A.k) }}</span></div>
        <div class="dw-tile"><p class="dw-tile-label">Special</p><span class="dw-tile-value">{{ profile.A.s }}</span></div>
        <div class="dw-tile"><p class="dw-tile-label">Melee</p><span class="dw-tile-value">{{ num(profile.A.me) }}</span></div>
        <div class="dw-tile"><p class="dw-tile-label">Ranged</p><span class="dw-tile-value">{{ num(profile.A.ra) }}</span></div>
        <div class="dw-tile"><p class="dw-tile-label">Items</p><span class="dw-tile-value">{{ profile.A.it }}</span></div>
        <div class="dw-tile"><p class="dw-tile-label">Revives</p><span class="dw-tile-value">{{ profile.A.v }}</span></div>
        <div class="dw-tile"><p class="dw-tile-label">Incaps</p><span class="dw-tile-value">{{ profile.A.i }}</span></div>
        <div class="dw-tile"><p class="dw-tile-label">K/D</p><span class="dw-tile-value">{{ kd(profile.A.k, profile.A.i) }}</span></div>
        <div class="dw-tile"><p class="dw-tile-label">Gene-Seeds</p><span class="dw-tile-value">{{ profile.A.g }}</span></div>
      </div>
      <div class="dw-chips">
        <span class="dw-tile-label">Classes</span>
        <span v-for="[c, x] in profile.classes" :key="c" class="dw-chip">{{ c }}<b>×{{ x }}</b></span>
      </div>
      <h2 class="dw-plaque">Missions</h2>
      <p v-if="notes" class="dw-sub">
        Mission score = kills ÷ {{ S.mk }} + special × {{ S.ms }} + revives × {{ S.mr }} − incaps × {{ S.mi }} + {{ S.mp }}. Guest missions are highlighted.
      </p>
      <div class="dw-scroll">
        <table class="dw-table">
          <thead>
            <tr>
              <th class="l">Mission</th><th class="l">Kill Team</th><th class="l">Class</th><th>Kills</th><th>Special</th><th>Melee</th><th>Ranged</th><th>Items</th><th>Dmg taken</th><th>Incaps</th><th>Revives</th><th>Seed</th><th>Score</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="x in profile.L" :key="`${x.t.id}-${x.m[0]}-${x.m[1]}`" :class="{ guest: x.guest }">
              <td class="l">W{{ x.m[0] }} · O{{ x.m[1] }}</td>
              <td class="l">
                <RouterLink class="dw-link" :to="to.team(x.t.id)">{{ x.t.n }}</RouterLink>
                <span v-if="x.guest" class="dw-tag guest">Guest</span>
              </td>
              <td class="l">{{ x.r[1] || '–' }}</td>
              <td>{{ num(x.r[3]) }}</td>
              <td>{{ x.r[4] }}</td>
              <td>{{ num(x.r[5]) }}</td>
              <td>{{ num(x.r[6]) }}</td>
              <td>{{ x.r[7] }}</td>
              <td>{{ num(x.r[8]) }}</td>
              <td>{{ x.r[9] }}</td>
              <td>{{ x.r[10] }}</td>
              <td>{{ x.r[2] ? '✓' : '–' }}</td>
              <td class="big">{{ num(rowMvp(x.r, S)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </template>
</template>

<style scoped>
.pick {
  max-width: 22rem;
}
.ppn {
  margin: 0;
  font: 600 clamp(1.6rem, 5vw, 2.4rem) / 1.1 var(--dw-font-title);
  color: var(--dw-ink);
  overflow-wrap: anywhere;
}
</style>
