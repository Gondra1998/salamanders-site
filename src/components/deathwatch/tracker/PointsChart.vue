<script setup>
// The points progression: one line per Kill Team, week by week, as total points, distance behind the leader or
// rank. A legend button puts one team in front; the pointer or the arrow keys read every team's value at a week;
// "Table" shows the same numbers as a table (the accessible reading of the chart). Drawn at a fixed size in
// viewBox units and scaled to the width, so a phone gets the same picture smaller.
import { computed, ref } from 'vue'
import { num, progression } from '../../../lib/deathwatch/tracker'

const props = defineProps({ R: { type: Object, required: true } })

const MODES = [
  ['tot', 'Total'],
  ['gap', 'Behind #1'],
  ['rk', 'Rank'],
]
// The original's series colours; a ninth team and beyond share a grey.
const COLOURS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
const W = 720
const H = 340
const L = 46
const RT = 14
const TP = 12
const B = 26
const pw = W - L - RT
const ph = H - TP - B

const mode = ref('tot')
const table = ref(true) // opens on the numbers; the chart is one press away
const focus = ref(0)
const at = ref(-1)

const d = computed(() => {
  const p = progression(props.R, mode.value)
  return p && { ...p, ts: p.ts.map((t, i) => ({ ...t, c: COLOURS[i] ?? '#8a96a1' })) }
})
const label = (k) => (k === 0 ? 'Start' : `W${k}`)
const value = (v) => (mode.value === 'tot' ? num(v) : mode.value === 'gap' ? (v === 0 ? '0' : `−${num(-v)}`) : `#${v}`)
const short = (v) => {
  const a = Math.abs(v)
  return a >= 1000 ? `${(Math.round(a / 100) / 10).toLocaleString('de-DE')}K` : String(a)
}
// A round step for about k grid lines up to mx.
const nice = (mx, k = 5) => {
  const e = 10 ** Math.floor(Math.log10(mx / k))
  return [1, 2, 2.5, 5, 10].map((q) => q * e).find((s) => mx / s <= k) ?? 10 * e
}

const scale = computed(() => {
  const all = d.value.ts.flatMap((t) => t.v)
  const ticks = []
  let lo
  let hi
  if (mode.value === 'tot') {
    const mx = Math.max(1, ...all)
    const st = nice(mx)
    hi = Math.ceil(mx / st) * st
    lo = 0
    for (let v = 0; v <= hi + 1e-9; v += st) ticks.push(v)
  } else if (mode.value === 'gap') {
    const mn = Math.max(1, -Math.min(0, ...all))
    const st = nice(mn, 4)
    lo = -Math.ceil(mn / st) * st
    hi = st * 0.3
    for (let v = lo; v <= 1e-9; v += st) ticks.push(v)
  } else {
    const n = d.value.ts.length
    lo = n + 0.4
    hi = 0.6
    for (let v = 1; v <= n; v++) ticks.push(v)
  }
  const y = (v) => TP + (mode.value === 'rk' ? (v - hi) / (lo - hi) : (hi - v) / (hi - lo)) * ph
  const n = d.value.xs.length
  const x = (i) => L + (n > 1 ? i / (n - 1) : 0.5) * pw
  return { ticks, x, y }
})
const tickText = (v) => (mode.value === 'tot' ? short(v) : mode.value === 'gap' ? (v === 0 ? '0' : `−${short(-v)}`) : `#${v}`)
const path = (t) => `M${t.v.map((v, i) => `${scale.value.x(i).toFixed(1)},${scale.value.y(v).toFixed(1)}`).join('L')}`
// The focused line last, so it is drawn on top.
const lines = computed(() => [...d.value.ts].sort((a, b) => (a.id === focus.value) - (b.id === focus.value)))
const legend = computed(() => props.R.ts.map((t) => d.value.ts.find((x) => x.id === t.id)).filter(Boolean))
const last = (t) => t.v[t.v.length - 1]
const tableRows = computed(() => [...d.value.ts].sort((a, b) => (mode.value === 'rk' ? last(a) - last(b) : last(b) - last(a))))
const readout = computed(() =>
  at.value < 0
    ? []
    : [...d.value.ts].sort((a, b) => (mode.value === 'rk' ? a.v[at.value] - b.v[at.value] : b.v[at.value] - a.v[at.value]) || a.n.localeCompare(b.n)),
)

function pick(e) {
  const box = e.currentTarget.ownerSVGElement.getBoundingClientRect()
  const n = d.value.xs.length
  const vx = ((e.clientX - box.left) * W) / box.width
  at.value = n > 1 ? Math.max(0, Math.min(n - 1, Math.round(((vx - L) / pw) * (n - 1)))) : 0
}
function key(e) {
  const n = d.value.xs.length
  const cur = at.value < 0 ? n - 1 : at.value
  const next = { ArrowLeft: Math.max(0, cur - 1), ArrowRight: Math.min(n - 1, cur + 1), Home: 0, End: n - 1 }[e.key]
  if (e.key === 'Escape') at.value = -1
  else if (next !== undefined) {
    e.preventDefault()
    at.value = next
  }
}
function setMode(k) {
  mode.value = k
  at.value = -1
}
</script>

<template>
  <div class="pc">
    <div class="pc-modes" role="group" aria-label="Chart view">
      <button v-for="[k, t] in MODES" :key="k" type="button" :aria-pressed="mode === k" @click="setMode(k)">{{ t }}</button>
      <button type="button" :aria-pressed="table" @click="table = !table">Table</button>
    </div>
    <p v-if="!d" class="dw-sub">No missions played yet.</p>
    <div v-else-if="table" class="dw-scroll">
      <table class="dw-table">
        <thead>
          <tr>
            <th class="l">Kill Team</th>
            <th v-for="k in d.xs" :key="k">{{ label(k) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tableRows" :key="t.id">
            <td class="l"><b>{{ t.n }}</b></td>
            <td v-for="(v, i) in t.v" :key="i">{{ value(v) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <template v-else>
      <div class="pc-wrap">
        <svg
          class="pc-svg"
          :viewBox="`0 0 ${W} ${H}`"
          role="img"
          tabindex="0"
          :aria-label="`${MODES.find((m) => m[0] === mode)[1]} per Kill Team by week. Use the Table button for exact values.`"
          @keydown="key"
          @focus="at = at < 0 ? d.xs.length - 1 : at"
          @blur="at = -1"
        >
          <g v-for="v in scale.ticks" :key="v">
            <line class="pc-grid" :x1="L" :x2="W - RT" :y1="scale.y(v)" :y2="scale.y(v)" />
            <text class="pc-axis" :x="L - 6" :y="scale.y(v) + 4" text-anchor="end">{{ tickText(v) }}</text>
          </g>
          <text v-for="(k, i) in d.xs" :key="`x${k}`" class="pc-axis" :x="scale.x(i)" :y="H - 8" text-anchor="middle">{{ label(k) }}</text>
          <g v-for="t in lines" :key="t.id" :opacity="focus && t.id !== focus ? 0.18 : 1">
            <path :d="path(t)" fill="none" :stroke="t.c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <circle :cx="scale.x(t.v.length - 1)" :cy="scale.y(last(t))" r="4" :fill="t.c" />
          </g>
          <g v-if="at >= 0">
            <line class="pc-cursor" :x1="scale.x(at)" :x2="scale.x(at)" :y1="TP" :y2="TP + ph" />
            <circle v-for="t in d.ts" :key="t.id" :cx="scale.x(at)" :cy="scale.y(t.v[at])" r="4" :fill="t.c" />
          </g>
          <rect :x="L - 6" y="0" :width="pw + 12" :height="H" fill="transparent" @pointermove="pick" @pointerdown="pick" @pointerleave="(e) => e.pointerType === 'mouse' && (at = -1)" />
        </svg>
        <div v-if="at >= 0" class="pc-read" aria-live="polite">
          <b>{{ d.xs[at] === 0 ? 'Start' : `Week ${d.xs[at]}` }}</b>
          <div v-for="t in readout" :key="t.id"><i :style="{ background: t.c }" /><strong>{{ value(t.v[at]) }}</strong><span>{{ t.n }}</span></div>
        </div>
      </div>
      <div class="pc-legend">
        <button v-for="t in legend" :key="t.id" type="button" :aria-pressed="focus === t.id" @click="focus = focus === t.id ? 0 : t.id">
          <i :style="{ background: t.c }" />{{ t.n }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pc {
  display: grid;
  gap: 0.75rem;
}
.pc-modes,
.pc-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.pc-modes button,
.pc-legend button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 36px;
  padding: 0.3rem 0.7rem;
  font: 600 0.85rem / 1 var(--dw-font-cond);
  letter-spacing: 0.06em;
  color: var(--dw-silver);
  background: transparent;
  border: 1px solid var(--dw-line-2);
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
.pc-modes button:active,
.pc-legend button:active {
  transform: scale(0.97);
}
.pc-modes button[aria-pressed='true'],
.pc-legend button[aria-pressed='true'] {
  color: var(--dw-accent);
  border-color: var(--dw-accent);
}
.pc-modes button:focus-visible,
.pc-legend button:focus-visible,
.pc-svg:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
.pc-legend i,
.pc-read i {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
}
.pc-wrap {
  position: relative;
  border: 1px solid var(--dw-line-2);
  background: color-mix(in oklab, var(--dw-surface) 85%, transparent);
}
.pc-svg {
  display: block;
  width: 100%;
  height: auto;
  touch-action: pan-y;
}
.pc-grid {
  stroke: var(--dw-line);
}
.pc-cursor {
  stroke: var(--dw-muted);
  stroke-dasharray: 3 3;
}
.pc-axis {
  font: 500 12px var(--dw-font-cond);
  fill: var(--dw-muted);
}
.pc-read {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  display: grid;
  gap: 0.2rem;
  max-width: 60%;
  padding: 0.5rem 0.7rem;
  font: 500 0.85rem / 1.3 var(--dw-font-cond);
  background: color-mix(in oklab, var(--dw-bg) 92%, transparent);
  border: 1px solid var(--dw-line-2);
  pointer-events: none;
}
.pc-read div {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 0.4rem;
}
.pc-read span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-muted);
}
</style>
