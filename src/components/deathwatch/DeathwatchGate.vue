<script setup>
// The gate in front of every Deathwatch page: it shows the page only to someone the server clears, and otherwise
// says why not. It asks the server (GET /deathwatch/me, via the store) and trusts nothing else: not the Legion
// list's `isMember` hint (a Deathwatch member need not be on it), and not its own state, which only decides
// what to show. The server enforces every read and write again.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../../stores/auth'
import { useDeathwatch } from '../../stores/deathwatch'
import DeathwatchBoot from './DeathwatchBoot.vue'

const auth = useAuth()
const store = useDeathwatch()
const route = useRoute()

// auth.token reads storage and isn't reactive; auth.member is (signing out clears it), so it drives the check.
watch(() => auth.member, () => store.load(auth.token), { immediate: true })

const busy = computed(() => store.status === 'idle' || store.status === 'checking')
const signIn = () => auth.signIn({ returnTo: route.fullPath })
const retry = () => store.load(auth.token)

// The cogitator's wake (DeathwatchBoot) plays over the gate every time the area is entered (the gate stays mounted
// while moving inside it), and never with reduced motion (or where that cannot be asked, as in tests).
const boot = ref(!!globalThis.matchMedia && !matchMedia('(prefers-reduced-motion: reduce)').matches)
const booted = () => (boot.value = false)
</script>

<template>
  <DeathwatchBoot v-if="boot" @done="booted" />
  <slot v-if="store.status === 'allowed'" />
  <section v-else class="dw-gate surface" :aria-busy="busy ? 'true' : undefined">
    <h1 class="dw-gate-eyebrow">Watch Fortress Ebonhold</h1>
    <template v-if="store.status === 'signin'">
      <p class="dw-gate-text">Clearance required. Sign in with Discord to be verified.</p>
      <button class="btn-ember dw-gate-btn" type="button" @click="signIn">Sign in with Discord</button>
    </template>
    <p v-else-if="busy" class="dw-gate-text dw-gate-checking">Verifying clearance…</p>
    <p v-else-if="store.status === 'denied'" class="dw-gate-text">
      Your clearance is not on record. Access is held by the Deathwatch and by those the Watch Commander has cleared.
    </p>
    <template v-else>
      <p class="dw-gate-text" role="alert">The fortress could not be reached. Try again in a moment.</p>
      <button class="btn-ember dw-gate-btn" type="button" @click="retry">Try again</button>
    </template>
  </section>
</template>

<style scoped>
.dw-gate {
  max-width: 34rem;
  /* the same height in every state, so the page does not jump when the answer arrives */
  min-height: 14rem;
  margin: 3rem 1rem;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  text-align: center;
  border: 1px solid var(--dw-line-2);
  border-radius: 3px;
  color: var(--dw-ink);
}
@media (min-width: 36rem) {
  .dw-gate {
    margin-inline: auto;
  }
}
.dw-gate-eyebrow {
  margin: 0;
  font-family: var(--dw-font-title);
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dw-accent);
}
.dw-gate-text {
  margin: 0;
  max-width: 28rem;
  line-height: 1.6;
  color: var(--dw-silver);
}
.dw-gate-btn {
  min-height: 44px;
  padding: 0.7rem 1.4rem;
  justify-content: center;
  border-radius: 2px;
  cursor: pointer;
}
/* Waiting for the server: a slow breathing, opacity only, three breaths and then still. */
.dw-gate-checking {
  animation: dw-gate-pulse 1.6s ease-in-out 3;
}
@keyframes dw-gate-pulse {
  50% {
    opacity: 0.55;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dw-gate-checking {
    animation: none;
  }
}
</style>
