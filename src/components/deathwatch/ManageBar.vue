<script setup>
// Manage's head, from 900px (on a phone the area's strip and its view switcher stand in): the crest and the way back,
// the three working views as the menu, entering a mission as the one highlighted action, and the settings (page texts,
// access) set apart in their own menu.
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { resolveArea } from '../../lib/deathwatch/areas'
import crest from './img/crest.webp'

const props = defineProps({ tab: { type: String, required: true } })
const route = useRoute()
const to = (tab) => ({ path: resolveArea({ area: 'administratum', tab }).canonical, query: route.query.scene ? { scene: route.query.scene } : {} })
const MAIN = [
  ['manage', 'Manage'],
  ['checks', 'Checks'],
  ['records', 'Records'],
]
const SETTINGS = [
  ['page-texts', 'Page Texts'],
  ['access', 'Access'],
]
const settings = ref(null)
// The settings menu closes once one of its pages is open.
watch(
  () => props.tab,
  () => settings.value?.removeAttribute('open'),
)
</script>

<template>
  <div class="mb">
    <RouterLink class="mb-home" to="/deathwatch">
      <svg class="mb-back" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
      <img :src="crest" alt="" width="36" height="36" />
      <span class="mb-name">Back to the Fortress</span>
    </RouterLink>
    <p class="dw-sr-only" role="heading" aria-level="1">Administratum</p>
    <nav class="mb-nav" aria-label="Administratum">
      <RouterLink v-for="[t, l] in MAIN" :key="t" class="mb-link" :to="to(t)" :aria-current="t === tab ? 'page' : undefined">{{ l }}</RouterLink>
    </nav>
    <RouterLink class="mb-enter" :to="to('enter-mission')" :aria-current="tab === 'enter-mission' ? 'page' : undefined">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Enter mission
    </RouterLink>
    <details ref="settings" class="mb-settings">
      <summary :class="{ on: SETTINGS.some(([t]) => t === tab) }">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg
        >Settings
      </summary>
      <div class="mb-menu">
        <RouterLink v-for="[t, l] in SETTINGS" :key="t" class="mb-mi" :to="to(t)" :aria-current="t === tab ? 'page' : undefined">{{ l }}</RouterLink>
      </div>
    </details>
  </div>
</template>

<style scoped>
.mb {
  display: none;
  align-items: center;
  gap: 1rem;
  margin: -0.4rem 0 1.4rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--dw-line);
}
@media (min-width: 900px) {
  .mb {
    display: flex;
  }
}
.mb-home {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 44px;
  padding-right: 1rem;
  border-right: 1px solid var(--dw-line);
  text-decoration: none;
  color: var(--dw-ink);
}
.mb-home img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.mb-name {
  font: 600 0.9rem / 1 var(--mg-display);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dw-muted);
}
.mb-home .mb-back {
  width: 16px;
  height: 16px;
  margin-right: -0.2rem;
  color: var(--dw-muted);
}
@media (hover: hover) and (pointer: fine) {
  .mb-home:hover .mb-name,
  .mb-home:hover .mb-back {
    color: var(--dw-ink);
  }
}
.mb-nav {
  display: flex;
  flex: 1;
  gap: 0.25rem;
}
.mb-link,
.mb-mi,
.mb-settings summary {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 40px;
  padding: 0 0.9rem;
  font: 600 0.9rem / 1 var(--mg-display);
  color: var(--dw-muted);
  text-decoration: none;
  border-radius: 2px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.mb-link[aria-current='page'] {
  color: var(--dw-accent);
  background: none;
  box-shadow: inset 0 -2px 0 #ff6a2b;
}
.mb-enter {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 40px;
  padding: 0 1rem;
  font: 700 0.9rem / 1 var(--mg-display);
  color: #1a0d06;
  text-decoration: none;
  background: linear-gradient(180deg, #ffb066, #ff6a2b 55%, #e0431d);
  border-radius: 2px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid rgb(255 176 102 / 0.6);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.3), 0 8px 30px -8px rgb(224 67 29 / 0.7), inset 0 1px 0 rgb(255 255 255 / 0.35);
}
.mb-enter[aria-current='page'] {
  box-shadow: 0 0 0 2px var(--dw-bg), 0 0 0 3px #ff6a2b;
}
svg {
  flex: none;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mb-settings {
  position: relative;
  padding-left: 0.75rem;
  border-left: 1px solid var(--dw-line);
}
.mb-settings summary {
  cursor: pointer;
  list-style: none;
}
.mb-settings summary::-webkit-details-marker {
  display: none;
}
.mb-settings summary.on,
.mb-settings[open] summary {
  color: var(--dw-ink);
}
.mb-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 5;
  display: grid;
  min-width: 11rem;
  padding: 0.35rem;
  background: #0e1c16;
  border: 1px solid var(--dw-line-2);
  border-radius: 2px;
  box-shadow: 0 12px 28px rgb(0 0 0 / 0.45);
}
.mb-mi[aria-current='page'] {
  color: var(--dw-accent);
  background: rgb(89 214 108 / 0.1);
}
.mb-home:focus-visible,
.mb-link:focus-visible,
.mb-enter:focus-visible,
.mb-mi:focus-visible,
.mb-settings summary:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .mb-link:not([aria-current='page']):hover,
  .mb-mi:hover,
  .mb-settings summary:hover {
    color: var(--dw-ink);
    background: rgb(255 255 255 / 0.04);
  }
  .mb-enter:hover {
    filter: brightness(1.06);
  }
}
</style>
