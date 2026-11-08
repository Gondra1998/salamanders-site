<script setup>
// The way into the Deathwatch area, shown to everyone on /companies. It says only "REDACTED" and fetches
// nothing: all the checking happens on /deathwatch itself (DeathwatchGate), so this page learns nothing about
// who is cleared. Signed out, one click starts the Discord sign-in and brings you back to /deathwatch; signed
// in, it just goes there.
import { inject } from 'vue'
import { routerKey } from 'vue-router'
import { useAuth } from '../../stores/auth'

const auth = useAuth()
// Looked up without a warning if there is none: the app always has a router, and without one this is still a link.
const router = inject(routerKey, null)

function go(event) {
  // A click that is not a plain primary one (new tab, new window, a menu) or that something already handled is left to the browser.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  // In dev with the Deathwatch fixture (lib/deathwatch/fixture.js) no sign-in is needed: the gate shows the scene.
  // The literal condition lets the build drop it, as there.
  const fixture = import.meta.env.DEV && !!import.meta.env.VITE_DEATHWATCH_FIXTURE
  if (auth.signedIn || fixture) {
    if (!router) return // no router: the link's own navigation does the job
    event.preventDefault()
    router.push('/deathwatch')
  } else {
    event.preventDefault()
    auth.signIn({ returnTo: '/deathwatch' })
  }
}
</script>

<template>
  <a class="dw-banner rm-fade" href="/deathwatch" aria-label="REDACTED — Deathwatch access" @click="go">REDACTED</a>
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
</style>
