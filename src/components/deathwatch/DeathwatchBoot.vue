<script setup>
// The fortress's vigil-net waking as someone comes in, between the site's bar and footer, in the area's cogitator green: the
// crest sits in an auspex ring that fills as the vox log runs its rites, while the gate asks the server who they
// are (the store); the last line is that answer. Cleared, the ring burns whole, "The gate is open" welcomes them,
// and the screen fades onto the page that is already behind it. Otherwise it stays up and says why: refused (the
// ring burns red, with a way back to the companies), signed out (sign in with Discord) or the fortress unreached
// (try again). `still`: the same screen without the wake, showing the answer as it stands; the gate shows it
// whenever the wake is not playing. Only a face: the gate (and the server) decide access, never this.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../../stores/auth'
import { useDeathwatch } from '../../stores/deathwatch'
import crest from './img/crest.webp'

const props = defineProps({ still: { type: Boolean, default: false } })
const emit = defineEmits(['done'])
const auth = useAuth()
const store = useDeathwatch()
const route = useRoute()
const signIn = () => auth.signIn({ returnTo: route.fullPath })
const retry = () => store.load(auth.token)

const RITES = [
  ['Machine spirit', 'roused'],
  ['Vox-link Nocturne', 'held'],
  ['Reliquary archive', 'sealed'],
  ['Battle-brother sigil', 'read'],
]
// Six seconds in all, if the server has answered by the last rite: waking 0–1 s, the log 1–3 s, the answer held
// to 3.7 s, the gate open 3.7–5.6 s, the fade to 6 s.
const WAKE_MS = 1000 // the net waking
const RITE_MS = 500 // one rite after the other
const HOLD_MS = 700 // the answer stays a moment
const OPEN_MS = 1900 // "The gate is open"
const FADE_MS = 400 // dwb-out below: a short fade onto the page

// wake → log → the answer (open, shut, signin or lost), each crossfading into the next; the ring stays throughout.
const phase = ref('wake')
const shown = ref(0)
const leaving = ref(false)
const busy = computed(() => store.status === 'idle' || store.status === 'checking')
const cleared = computed(() => store.status === 'allowed')
const refused = computed(() => store.status === 'denied')
const done = computed(() => shown.value === RITES.length)
const operator = computed(() => auth.member?.username || '—')
const answer = computed(() => (cleared.value ? 'open' : refused.value ? 'shut' : store.status === 'signin' ? 'signin' : 'lost'))
// Still: no wake and no log, only where the answer stands (wait while the server is asked).
const shownPhase = computed(() => (props.still ? (busy.value ? 'wait' : answer.value) : phase.value))
// The ring: a fifth for each rite, the last for the answer.
const RING = 2 * Math.PI * 92
const ring = computed(() =>
  props.still ? (busy.value ? RING / (RITES.length + 1) : 0) : RING * (1 - (shown.value + (done.value && !busy.value ? 1 : 0)) / (RITES.length + 1)),
)

const timers = []
const later = (fn, ms) => timers.push(setTimeout(fn, ms))
function leave() {
  if (leaving.value) return
  leaving.value = true
  later(() => emit('done', cleared.value), FADE_MS)
}
onMounted(() => {
  if (props.still) return
  later(() => (phase.value = 'log'), WAKE_MS)
  RITES.forEach((_, i) => later(() => (shown.value = i + 1), WAKE_MS + RITE_MS * (i + 1)))
})
onBeforeUnmount(() => timers.forEach(clearTimeout))

// Once the rites are run, hold on the answer, then open the gate and fade onto the page. Not cleared, hand over at
// once to the gate's still screen in the same place, which says why. `done` says whether it ended cleared.
watch(
  [done, busy],
  ([ran, waiting]) => {
    if (props.still) return
    if (waiting) return
    if (ran)
      later(() => {
        if (!cleared.value) return emit('done', false)
        phase.value = 'open'
        later(leave, OPEN_MS)
      }, HOLD_MS)
  },
  { immediate: true },
)
</script>

<template>
  <!-- A live region with no name of its own: what it says is the answer as it stands, never a fixed label. -->
  <div class="dwb" :class="[shownPhase, { out: leaving, still }]" role="status" :aria-busy="busy ? 'true' : undefined">
    <div class="dwb-core">
      <div class="dwb-seal">
        <svg class="dwb-ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle class="dwb-ring-track" cx="100" cy="100" r="92" />
          <circle class="dwb-ring-glow" cx="100" cy="100" r="92" :stroke-dasharray="RING" :stroke-dashoffset="ring" />
          <circle class="dwb-ring-fill" cx="100" cy="100" r="92" :stroke-dasharray="RING" :stroke-dashoffset="ring" />
          <circle class="dwb-ring-ticks" cx="100" cy="100" r="82" />
        </svg>
        <img :src="crest" alt="" width="120" height="120" />
      </div>
      <h1 class="dwb-net">Watch Fortress Ebonhold</h1>

      <Transition name="dwb-ph" mode="out-in">
        <div v-if="shownPhase === 'wake'" key="wake" class="dwb-say">
          <p class="dwb-big">Waking the machine spirit<span class="dwb-cursor" aria-hidden="true">_</span></p>
        </div>
        <div v-else-if="shownPhase === 'wait'" key="wait" class="dwb-say">
          <p class="dwb-big">Verifying clearance…</p>
          <p class="dwb-small">Weighing your sigil</p>
        </div>
        <div v-else-if="shownPhase === 'open'" key="open" class="dwb-say">
          <p class="dwb-big">The gate is open</p>
          <p class="dwb-small">Welcome to the Vigil</p>
        </div>
        <div v-else-if="shownPhase === 'shut'" key="shut" class="dwb-say">
          <p class="dwb-big">The gate stays shut</p>
          <p class="dwb-text">Your clearance is not on record. Access is held by the XVIIIth Legion, its Emissaries, the Deathwatch and those the Watch Commander has cleared.</p>
          <RouterLink class="dwb-back" to="/companies">Return to the companies</RouterLink>
        </div>
        <div v-else-if="shownPhase === 'signin'" key="signin" class="dwb-say">
          <p class="dwb-big">Identify yourself</p>
          <p class="dwb-text">Clearance required. Sign in with Discord to be verified.</p>
          <button class="btn-ember dwb-btn" type="button" @click="signIn">Sign in with Discord</button>
          <RouterLink class="dwb-back" to="/companies">Return to the companies</RouterLink>
        </div>
        <div v-else-if="shownPhase === 'lost'" key="lost" class="dwb-say">
          <p class="dwb-big">Vox-link lost</p>
          <p class="dwb-text" role="alert">The fortress could not be reached. Try again in a moment.</p>
          <button class="btn-ember dwb-btn" type="button" @click="retry">Try again</button>
          <RouterLink class="dwb-back" to="/companies">Return to the companies</RouterLink>
        </div>
        <div v-else key="log" class="dwb-log">
          <ol>
            <li v-for="([k, v], i) in RITES" :key="k" :class="{ on: i < shown }">
              <span class="dwb-p" aria-hidden="true">›</span>{{ k }} <i>{{ v }}</i>
            </li>
            <li :class="{ on: done, ask: busy }">
              <span class="dwb-p" aria-hidden="true">›</span>Clearance
              <i v-if="busy">weighing…</i>
              <i v-else-if="cleared">granted</i>
              <i v-else class="no">withheld</i>
            </li>
          </ol>
          <p class="dwb-ident">Ident <b>{{ operator }}</b></p>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* The screen below the site's bar (about 4 rem high) down to its footer: dark glass, scanlines, a green glow behind
   the seal. It runs on under the footer's top margin (4 rem, SiteFooter), so no strip of the page shows there.
   shortcut: the bar's height and the footer's margin are copied, not read; if either changes, change them here. */
.dwb {
  position: relative;
  min-height: calc(100dvh - 4rem);
  margin-bottom: -4rem;
  padding: 1rem 1rem 5rem;
  display: grid;
  place-items: center;
  --dwb-no: #e0705a; /* refused */
  color: var(--dw-ink);
  background:
    var(--dw-scan),
    radial-gradient(circle at 50% 34%, rgb(40 80 30 / 0.35), transparent 32%),
    radial-gradient(ellipse at 50% 45%, rgb(12 22 11 / 0.88), rgb(2 4 2 / 0.88) 72%);
  /* A touch see-through (0.88): the site's volcano and ash still faintly behind, as everywhere on the site. On the
     window, not on this box (which runs under the footer), so the glow stays behind the seal however tall the
     page is. */
  background-attachment: fixed;
  /* Coming in, the screen fades up out of the page that was there (no route fade: deathwatch.css). */
  animation: dwb-in 500ms var(--ease-forge) both;
}
/* Its answer, standing in for the wake in the same place, is there at once. */
.dwb.still {
  animation: none;
}
/* Still: the same screen, without the wake. */
.dwb.still .dwb-core {
  animation: none;
}
/* Leaving: a short fade onto the page behind it while the seal drifts towards the viewer. */
.dwb.out {
  pointer-events: none;
  animation: dwb-out 400ms var(--ease-forge) forwards;
}
.dwb.out .dwb-core {
  animation: dwb-near 400ms var(--ease-forge) forwards;
}
@keyframes dwb-in {
  from {
    opacity: 0;
  }
}
@keyframes dwb-out {
  to {
    opacity: 0;
  }
}
@keyframes dwb-near {
  to {
    transform: scale(1.05);
  }
}
/* The seal and its words come up out of the dark, rather than appearing at once. */
.dwb-core {
  animation: dwb-in 500ms var(--ease-forge) both;
  display: grid;
  justify-items: center;
  gap: 1rem;
  width: min(30rem, 100%);
  text-align: center;
}
/* The crest inside the auspex ring, which fills rite by rite. */
.dwb-seal {
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(140px, 24vw, 190px);
  aspect-ratio: 1;
}
.dwb-seal img {
  width: 52%;
  height: auto;
  opacity: 0.55;
  filter: grayscale(0.6) drop-shadow(0 6px 12px rgb(0 0 0 / 0.8));
  transition:
    opacity var(--dur-sheet) var(--ease-forge),
    filter var(--dur-sheet) var(--ease-forge);
}
.dwb.log .dwb-seal img,
.dwb.wait .dwb-seal img,
.dwb.open .dwb-seal img {
  opacity: 1;
  filter: grayscale(0) drop-shadow(0 0 16px color-mix(in oklab, var(--dw-accent) 45%, transparent));
}
.dwb-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  fill: none;
}
.dwb-ring-track {
  stroke: color-mix(in oklab, var(--dw-accent) 14%, transparent);
  stroke-width: 2;
}
/* The glow is a wide faint stroke under the line, not a filter: a filter on SVG paints its whole box, a pale square. */
.dwb-ring-glow,
.dwb-ring-fill {
  transition: stroke-dashoffset var(--dur-sheet) var(--ease-forge);
}
.dwb-ring-glow {
  stroke: color-mix(in oklab, var(--dw-accent) 22%, transparent);
  stroke-width: 9;
}
.dwb.open .dwb-ring-glow {
  stroke: color-mix(in oklab, var(--dw-gold) 22%, transparent);
}
.dwb-ring-fill {
  stroke: var(--dw-accent);
  stroke-width: 3;
  stroke-linecap: square;
  transition: stroke-dashoffset var(--dur-sheet) var(--ease-forge);
}
.dwb-ring-ticks {
  stroke: color-mix(in oklab, var(--dw-accent) 35%, transparent);
  stroke-width: 7;
  stroke-dasharray: 1 7.6;
}
/* The gate open: the ring burns gold. Shut: red, and the crest goes dark again. */
.dwb.open .dwb-ring-fill {
  stroke: var(--dw-gold);
}
.dwb.shut .dwb-ring-fill {
  stroke: var(--dwb-no);
}
.dwb.shut .dwb-ring-glow {
  stroke: color-mix(in oklab, var(--dwb-no) 22%, transparent);
}
/* Asked to sign in, or the fortress out of reach: amber, a question still open. */
.dwb.signin .dwb-ring-fill,
.dwb.lost .dwb-ring-fill {
  stroke: var(--dw-gold);
}
.dwb-net {
  margin: 0;
  font: 500 0.72rem / 1.4 ui-monospace, monospace;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--dw-muted);
}
/* One phase crossfades into the next. */
.dwb-ph-enter-active,
.dwb-ph-leave-active {
  transition: opacity var(--dur-view) var(--ease-forge);
}
.dwb-ph-enter-from,
.dwb-ph-leave-to {
  opacity: 0;
}
.dwb-say,
.dwb-log {
  display: grid;
  gap: 0.5rem;
  min-height: 10.5rem;
  align-content: start;
}
.dwb-say p {
  margin: 0;
}
.dwb-big {
  font: 500 clamp(1.3rem, 3.2vw, 1.9rem) / 1.1 var(--dw-font-hud);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dw-accent);
  text-shadow: 0 0 16px color-mix(in oklab, var(--dw-accent) 60%, transparent);
}
.dwb.open .dwb-big {
  color: var(--dw-gold);
  text-shadow: 0 0 16px color-mix(in oklab, var(--dw-gold) 55%, transparent);
}
.dwb.shut .dwb-big {
  color: var(--dwb-no);
  text-shadow: 0 0 16px color-mix(in oklab, var(--dwb-no) 50%, transparent);
}
.dwb.signin .dwb-big,
.dwb.lost .dwb-big {
  color: var(--dw-gold);
  text-shadow: 0 0 16px color-mix(in oklab, var(--dw-gold) 50%, transparent);
}
/* Why, in plain words, under the headline. */
.dwb-text {
  max-width: 26rem;
  justify-self: center;
  line-height: 1.6;
  color: var(--dw-silver);
}
.dwb-btn {
  justify-self: center;
  min-height: 44px;
  margin-top: 0.6rem;
  padding: 0.7rem 1.4rem;
  justify-content: center;
  border-radius: 2px;
  cursor: pointer;
}
.dwb-btn + .dwb-back {
  margin-top: 0.2rem;
}
.dwb-small {
  font: 500 0.75rem / 1.4 ui-monospace, monospace;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: color-mix(in oklab, var(--dw-accent) 60%, var(--dw-muted));
}
/* The cursor blinks a few times while the net wakes. */
.dwb-cursor {
  margin-left: 0.1em;
  animation: dwb-blink 450ms var(--ease-forge) 4 alternate;
}
@keyframes dwb-blink {
  to {
    opacity: 0;
  }
}
/* The vox log: prompt lines, left-aligned in a narrow column under the seal. */
.dwb-log ol {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: left;
  font: 500 clamp(0.78rem, 1.9vw, 0.9rem) / 1.3 ui-monospace, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.dwb-log li {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  opacity: 0;
  transform: translateX(-6px);
  transition:
    opacity var(--dur-state) var(--ease-forge),
    transform var(--dur-state) var(--ease-forge);
}
.dwb-log li.on {
  opacity: 1;
  transform: none;
}
.dwb-p {
  color: var(--dw-accent);
}
.dwb-log i {
  margin-left: auto;
  font-style: normal;
  color: var(--dw-accent);
}
.dwb-log li.ask i {
  color: var(--dw-gold);
}
.dwb-log i.no {
  color: var(--dwb-no);
}
/* The way back to the companies, under every answer but the open gate (the site's bar stays up as well). */
.dwb-back {
  justify-self: center;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-top: 1rem;
  padding: 0 1.2rem;
  border: 1px solid var(--dw-line-2);
  border-radius: 2px;
  font: 600 0.75rem / 1 var(--dw-font-cond);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dw-ink);
  text-decoration: none;
  transition:
    color var(--dur-state) var(--ease-forge),
    border-color var(--dur-state) var(--ease-forge),
    transform var(--dur-press) var(--ease-forge);
}
/* It squeezes when pressed, as every other pressable does. */
.dwb-back:active {
  transform: scale(0.97);
}
.dwb-back:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
.dwb-ident {
  margin: 0.4rem 0 0;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--dw-line-2);
  text-align: left;
  font: 500 0.72rem / 1.4 ui-monospace, monospace;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dw-muted);
}
.dwb-ident b {
  margin-left: 0.6rem;
  font-weight: 600;
  color: var(--dw-ink);
  overflow-wrap: anywhere;
}
@media (hover: hover) and (pointer: fine) {
  .dwb-back:hover {
    color: var(--dw-accent);
    border-color: var(--dw-accent);
  }
}
</style>
