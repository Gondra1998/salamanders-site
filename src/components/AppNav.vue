<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlanner } from '../stores/planner'
import { useAuth } from '../stores/auth'
import { usePerkCorrections } from '../stores/perkCorrections'
import { useNavLinks } from '../lib/useNavLinks'

const open = ref(false)
const route = useRoute()
const router = useRouter()
const planner = usePlanner()
const auth = useAuth()
const corrections = usePerkCorrections()
const DISCORD = 'https://discord.gg/salamanders'

// Shared with the footer; see src/lib/useNavLinks.js.
const links = useNavLinks()

// Close the mobile menu on navigation.
watch(
  () => route.fullPath,
  () => (open.value = false),
)

onMounted(() => corrections.load())
// auth.token reads storage and isn't reactive; auth.member is (sign-out clears it).
watch(() => auth.member, () => corrections.loadPrivileges(auth.token), { immediate: true })

// The nav title is the one place on the site people expect a hard reset —
// "take me back to a blank Perk Builder," not "resume whatever's loaded."
// Same-route clicks don't trigger a navigation at all by default, so a build
// applied from the library (or loaded from a share link) would otherwise
// just sit there forever once you're already on the page.
function freshPlanner() {
  planner.resetClass()
  if (route.path === '/planner' && Object.keys(route.query).length) {
    router.replace({ path: '/planner', query: {} })
  }
  open.value = false
}
</script>

<template>
  <header class="nav">
    <div class="nav-bar" :class="{ 'signed-in': auth.signedIn }">
      <RouterLink to="/" class="brand" @click="open = false">
        <span class="brand-diamond" aria-hidden="true" />
        <span class="brand-text">Salamanders</span>
        <span class="brand-legion" aria-hidden="true">XVIII</span>
      </RouterLink>

      <nav class="nav-links" aria-label="Primary">
        <RouterLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="nav-link"
          :exact-active-class="l.section ? '' : 'is-active'"
          :active-class="l.section ? 'is-active' : ''"
          @click="l.to === '/planner' && freshPlanner()"
        >
          {{ l.label }}
        </RouterLink>
      </nav>

      <a class="btn-ember nav-cta" :href="DISCORD" target="_blank" rel="noopener">
        Join
      </a>

      <div class="auth" v-if="auth.signedIn">
        <span class="auth-name">{{ auth.member.username }}</span>
        <button class="auth-btn rm-fade" type="button" @click="auth.signOut()">Sign out</button>
      </div>
      <button v-else class="auth-btn auth-signin rm-fade" type="button" @click="auth.signIn()">
        Sign in
      </button>

      <button
        class="burger"
        :aria-expanded="open"
        aria-label="Toggle menu"
        @click="open = !open"
      >
        <span :class="{ x: open }" />
        <span :class="{ x: open }" />
        <span :class="{ x: open }" />
      </button>
    </div>

    <transition name="sheet">
      <nav v-if="open" class="nav-mobile" aria-label="Mobile">
        <RouterLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="nav-mobile-link"
          :exact-active-class="l.section ? '' : 'is-active'"
          :active-class="l.section ? 'is-active' : ''"
          @click="l.to === '/planner' && freshPlanner()"
        >
          {{ l.label }}
        </RouterLink>
        <a class="btn-ember nav-mobile-cta" :href="DISCORD" target="_blank" rel="noopener">
          Join the Chapter
        </a>
        <div class="auth auth-mobile" v-if="auth.signedIn">
          <span class="auth-name">Signed in as {{ auth.member.username }}</span>
          <button class="auth-btn rm-fade" type="button" @click="auth.signOut()">Sign out</button>
        </div>
        <button v-else class="auth-btn auth-signin auth-mobile rm-fade" type="button" @click="auth.signIn()">
          Sign in with Discord
        </button>
      </nav>
    </transition>
  </header>
</template>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(5, 10, 8, 0.72);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-ash);
}
.nav-bar {
  max-width: 76rem;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.7rem 1.25rem;
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-right: auto;
  min-height: var(--tap);
}
.brand-text {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.14em;
  font-size: 1.05rem;
  color: var(--color-bone);
}
.brand-diamond {
  width: 12px;
  height: 12px;
  transform: rotate(45deg);
  background: linear-gradient(180deg, #ffb066, #ff6a2b);
  box-shadow: 0 0 10px rgba(255, 106, 43, 0.6);
  flex: none;
}
.brand-legion {
  font-family: var(--font-mono);
  font-size: max(0.6rem, var(--text-floor));
  letter-spacing: 0.2em;
  color: var(--color-gold);
  border: 1px solid rgba(223, 184, 91, 0.4);
  padding: 1px 5px;
  border-radius: 2px;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.nav-link {
  position: relative;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.82rem;
  color: var(--color-smoke);
  padding: 0.5rem 0.7rem;
  border-radius: 2px;
  transition:
    color var(--dur-state) var(--ease-forge),
    background-color var(--dur-state) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .nav-link:hover {
    color: var(--color-bone);
    background: rgba(89, 214, 108, 0.06);
  }
}
.nav-link.is-active {
  color: var(--color-drake);
}
.nav-link.is-active::after {
  content: '';
  position: absolute;
  left: 0.7rem;
  right: 0.7rem;
  bottom: -0.2rem;
  height: 2px;
  background: var(--color-ember);
  box-shadow: 0 0 8px rgba(255, 106, 43, 0.6);
}
.nav-cta {
  padding: 0.5rem 1.1rem;
  border-radius: 2px;
  font-size: 0.85rem;
}

.auth {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.auth-name {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-smoke);
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.auth-btn {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-smoke);
  background: transparent;
  border: 1px solid var(--color-ash);
  border-radius: 2px;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
  transition:
    color var(--dur-state) var(--ease-forge),
    border-color var(--dur-state) var(--ease-forge),
    transform var(--dur-press) var(--ease-forge);
}
.auth-btn:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .auth-btn:hover {
    color: var(--color-bone);
    border-color: var(--color-ash-2);
  }
}
.auth-signin {
  color: var(--color-drake);
  border-color: rgba(89, 214, 108, 0.35);
}
@media (hover: hover) and (pointer: fine) {
  .auth-signin:hover {
    color: var(--color-bone);
    border-color: var(--color-drake);
  }
}
.auth-mobile {
  margin-top: 0.6rem;
  justify-content: center;
}

.burger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 44px;
  height: 44px;
  background: transparent;
  border: 1px solid var(--color-ash);
  border-radius: 3px;
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
.burger:active {
  transform: scale(0.97);
}
.burger span {
  display: block;
  height: 2px;
  width: 20px;
  margin: 0 auto;
  background: var(--color-bone);
  transition:
    transform var(--dur-state) var(--ease-forge),
    opacity var(--dur-state) var(--ease-forge);
}
.burger span.x:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.burger span.x:nth-child(2) {
  opacity: 0;
}
.burger span.x:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

.nav-mobile {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 1rem 1.25rem;
  gap: 0.15rem;
  border-top: 1px solid var(--color-ash);
}
.nav-mobile-link {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-bone);
  padding: 0.9rem 0.5rem;
  border-bottom: 1px solid rgba(38, 55, 47, 0.5);
}
.nav-mobile-link.is-active {
  color: var(--color-drake);
}
.nav-mobile-cta {
  margin-top: 0.9rem;
  justify-content: center;
  padding: 0.9rem;
  border-radius: 2px;
}

.sheet-enter-active {
  transition:
    opacity var(--dur-view) var(--ease-forge),
    transform var(--dur-view) var(--ease-forge);
}
.sheet-leave-active {
  transition:
    opacity var(--dur-state) var(--ease-forge),
    transform var(--dur-state) var(--ease-forge);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 860px) {
  .nav-links,
  .nav-cta,
  .nav-bar > .auth,
  .nav-bar > .auth-btn {
    display: none;
  }
  .burger {
    display: flex;
  }
}
/* Signed in, the bar also holds the name, Sign out and up to four more links. At its fullest (Version History, and a
   name at its 8rem) it needs 1221px, so the menu takes over sooner. Signed out, it fits down to the rule above. */
@media (max-width: 1240px) {
  .signed-in > .nav-links,
  .signed-in > .nav-cta,
  .signed-in > .auth {
    display: none;
  }
  .signed-in > .burger {
    display: flex;
  }
}
</style>
