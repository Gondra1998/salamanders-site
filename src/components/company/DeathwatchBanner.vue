<script setup>
// The way into the Deathwatch area, shown to everyone on /companies. It says only "REDACTED" and fetches
// nothing: all the checking happens on /deathwatch itself (DeathwatchGate), so this page learns nothing about
// who is cleared. Signed out, one click starts the Discord sign-in and brings you back to /deathwatch; signed
// in, it just goes there.
import { inject, onBeforeUnmount, ref } from 'vue'
import { routerKey } from 'vue-router'
import { useAuth } from '../../stores/auth'

const auth = useAuth()
// Looked up without a warning if there is none: the app always has a router, and without one this is still a link.
const router = inject(routerKey, null)

// Going in: the screen dims to the cogitator's dark while its scan lines come up over it, then the Deathwatch area
// takes over, its boot screen starting in the same dark. Not with reduced motion, nor where that cannot be asked
// (tests): then it just goes.
const DIM_MS = 650 // dw-dim below
const dimming = ref(false)
let timer = 0
onBeforeUnmount(() => clearTimeout(timer))
function enter() {
  if (dimming.value) return
  // Nor once the boot screen has played this visit (DeathwatchGate's key): there is no boot screen to dim into.
  if (!globalThis.matchMedia || matchMedia('(prefers-reduced-motion: reduce)').matches || sessionStorage.getItem('dw-booted'))
    return router.push('/deathwatch')
  dimming.value = true
  timer = setTimeout(() => router.push('/deathwatch'), DIM_MS)
}

function go(event) {
  // A click that is not a plain primary one (new tab, new window, a menu) or that something already handled is left to the browser.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  // In dev with the Deathwatch fixture (lib/deathwatch/fixture.js) no sign-in is needed: the gate shows the scene.
  // The literal condition lets the build drop it, as there.
  const fixture = import.meta.env.DEV && !!import.meta.env.VITE_DEATHWATCH_FIXTURE
  if (auth.signedIn || fixture) {
    if (!router) return // no router: the link's own navigation does the job
    event.preventDefault()
    enter()
  } else {
    event.preventDefault()
    auth.signIn({ returnTo: '/deathwatch' })
  }
}
</script>

<template>
  <a class="dw-banner rm-fade" href="/deathwatch" aria-label="REDACTED — Deathwatch access" @click="go">REDACTED</a>
  <Teleport to="body">
    <div v-if="dimming" class="dw-dim" aria-hidden="true"><span /></div>
  </Teleport>
</template>

<style scoped>
/* A blacked-out strip, like a redacted line in a dossier. Full width, and tall enough to hit with a thumb. */
.dw-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  margin: 1.4rem 0 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--color-ash-2);
  border-radius: 3px;
  background: repeating-linear-gradient(90deg, #000 0 14px, #070c09 14px 16px);
  color: var(--color-bone);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.5em;
  text-indent: 0.5em; /* the trailing letter-space would otherwise push the word off centre */
  text-transform: uppercase;
  transition:
    transform var(--dur-press) var(--ease-forge),
    border-color var(--dur-state) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .dw-banner:hover {
    border-color: var(--color-drake);
  }
}
.dw-banner:active {
  transform: scale(0.97);
}
/* The way in (enter() above): the page dims into the boot screen's own background (DeathwatchBoot .dwb, the same
   layers, so the hand-over is seamless), while brighter scan lines sweep down over it and settle back to its faint
   ones, as a cogitator screen warming. */
.dw-dim {
  position: fixed;
  inset: 0;
  z-index: 200;
  background:
    repeating-linear-gradient(0deg, rgb(127 211 92 / 0.022) 0 1px, transparent 1px 3px),
    radial-gradient(circle at 50% 34%, rgb(40 80 30 / 0.35), transparent 32%),
    radial-gradient(ellipse at 50% 45%, rgb(12 22 11), rgb(2 4 2) 72%);
  animation: dw-dim 650ms var(--ease-forge) both;
}
.dw-dim span {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, rgb(127 211 92 / 0.08) 0 1px, transparent 1px 3px);
  animation: dw-scan 650ms var(--ease-forge) both;
}
@keyframes dw-dim {
  from {
    opacity: 0;
  }
}
@keyframes dw-scan {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }
  50% {
    opacity: 1;
  }
  to {
    opacity: 0;
    transform: none;
  }
}
</style>
