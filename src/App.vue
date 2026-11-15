<script setup>
import AppNav from './components/AppNav.vue'
import SiteFooter from './components/SiteFooter.vue'
import MountDeathfire from './components/MountDeathfire.vue'
</script>

<template>
  <!-- Mount Deathfire behind every page: the same mountain, on the left at home and mirrored to the right elsewhere. -->
  <MountDeathfire />

  <AppNav />

  <main>
    <!--
      No <Transition> around the view. `mode="out-in"` deadlocked here: on a cold
      load of a lazy route the outgoing child is a comment placeholder that never
      fires a transition end, so the incoming view never mounted (every route but
      "/" rendered blank). The enter animation below gives the same feel with no
      dependency on a leave completing.
    -->
    <RouterView />
  </main>

  <SiteFooter />
</template>

<style scoped>
main {
  min-height: 60svh;
}
/* Route enter animation — replaces the old RouterView transition. Each route's
   root element is a fresh node, so this replays on every navigation. Opacity
   only; reduced motion keeps the fade through the allowlist in style.css. */
main > * {
  animation: view-in var(--dur-view) var(--ease-forge) both;
}
@keyframes view-in {
  from {
    opacity: 0;
  }
}
</style>
