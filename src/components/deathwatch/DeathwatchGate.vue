<script setup>
// The gate in front of every Deathwatch page: it shows the page only to someone the server clears, and otherwise
// says why not. It asks the server (GET /deathwatch/me, via the store) and trusts nothing else: not the Legion
// list's `isMember` hint (a Deathwatch member need not be on it), and not its own state, which only decides
// what to show. The server enforces every read and write again.
import { ref, watch } from 'vue'
import { useAuth } from '../../stores/auth'
import { useDeathwatch } from '../../stores/deathwatch'
import DeathwatchBoot from './DeathwatchBoot.vue'

const auth = useAuth()
const store = useDeathwatch()

// auth.token reads storage and isn't reactive; auth.member is (signing out clears it), so it drives the check.
watch(() => auth.member, () => store.load(auth.token), { immediate: true })

// The cogitator's wake (DeathwatchBoot) plays over the gate once per visit to the site (the tab's session): once it
// ends cleared, it is not shown again until the tab is closed. Refused, it plays again on the next try. Never with
// reduced motion (or where that cannot be asked, as in tests). Where the browser refuses storage (site data blocked),
// touching it throws: then the visit cannot be looked up, so the wake is skipped rather than played on every visit,
// and a visit that cannot be noted is simply not noted.
const BOOTED = 'dw-booted'
const seen = () => {
  try {
    return !!sessionStorage.getItem(BOOTED)
  } catch {
    return true
  }
}
const boot = ref(!!globalThis.matchMedia && !matchMedia('(prefers-reduced-motion: reduce)').matches && !seen())
const booted = (cleared) => {
  boot.value = false
  try {
    if (cleared) sessionStorage.setItem(BOOTED, '1')
  } catch {
    // nothing to note it in
  }
}
</script>

<template>
  <DeathwatchBoot v-if="boot" @done="booted" />
  <!-- The page loads behind the wake, hidden until it is done, then fades in (dw-gate-in, deathwatch.css). -->
  <div v-if="store.status === 'allowed'" v-show="!boot" class="dw-gate-page"><slot /></div>
  <!-- Why not, in the wake's own face, whenever the wake is not playing. -->
  <DeathwatchBoot v-else-if="!boot" still />
</template>
