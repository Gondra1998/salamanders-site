<script setup>
// The head of every Armouring Hall tab, as in the design: the way back to the fortress, the crest, the hall's name
// and line, and its tabs as one bar (links to their canonical addresses). Watch Command shows only to Deathwatch
// Command, as in the rail. From 900px it stands in for the rail, which the hall does without (DeathwatchArea), so
// the name is the page's level-1 heading there; a role, not an <h1>, so a tab change still focuses the view's <h2>.
import { useRoute } from 'vue-router'
import { AREAS, resolveArea } from '../../../lib/deathwatch/areas'
import { useDeathwatch } from '../../../stores/deathwatch'
import crestArmour from '../img/crest-armouringhall.png'
import crestWatch from '../img/crest.webp'

// Recruitment heads itself the same way (since 2026-11); `area` picks the hall's or Recruitment's crest, line and tabs.
const props = defineProps({ tab: { type: String, required: true }, area: { type: String, default: 'armouringhall' } })
const route = useRoute()
const store = useDeathwatch()
const HEADS = {
  armouringhall: { crest: crestArmour, line: 'Uniform & heraldry of the Watch.' },
  recruitment: { crest: crestWatch, line: 'Watch Fortress Ebonhold' },
}
// Each tab's icon: a lock for Deathwatch Command's, a page and a checklist for Recruitment's, else a shield.
const ICONS = {
  'terms-of-service': 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  requirements: 'M4 6.5 5.5 8 8 5.5M4 12.5 5.5 14 8 11.5M4 18.5 5.5 20 8 17.5M11 7h9M11 13h9M11 19h9',
}
const head = () => HEADS[props.area]
const tabs = () => AREAS[props.area].tabs.filter((t) => !t.command || store.command)
const icon = (t) => (t.command ? 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3' : (ICONS[t.slug] ?? 'M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z'))
const to = (t) => ({ path: resolveArea({ area: props.area, tab: t.slug }).canonical, query: route.query.scene ? { scene: route.query.scene } : {} })
</script>

<template>
  <div class="hh">
    <RouterLink class="hh-back" to="/deathwatch">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
      Back to the Fortress
    </RouterLink>
    <img class="hh-crest" :src="head().crest" alt="" width="140" height="140" />
    <p class="hh-title" role="heading" aria-level="1">{{ AREAS[area].label }}</p>
    <p class="hh-line">{{ head().line }}</p>
    <nav class="hh-tabs" :aria-label="AREAS[area].label">
      <RouterLink v-for="t in tabs()" :key="t.slug" class="hh-tab" :to="to(t)" :aria-current="t.slug === tab ? 'page' : undefined">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path :d="icon(t)" />
        </svg>
        {{ t.label }}
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
/* From 900px only: on a phone the area's strip already shows the crest and the name, and its bar switches the tabs. */
.hh {
  position: relative;
  display: none;
  justify-items: center;
  gap: 0.35rem;
  text-align: center;
}
/* Top left, where the rail's link used to be. */
.hh-back {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 40px;
  padding: 0 0.9rem 0 0.6rem;
  font: 600 0.8rem / 1 var(--dw-font-cond);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--dw-muted);
  border: 1px solid var(--dw-line-2);
  border-radius: 999px;
}
.hh-back svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.hh-back:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .hh-back:hover {
    color: var(--dw-accent);
    border-color: var(--dw-accent);
  }
}
.hh-crest {
  width: clamp(96px, 11vw, 140px);
  height: auto;
  filter: drop-shadow(0 4px 12px rgb(0 0 0 / 0.6));
}
.hh-title {
  margin: 0;
  font: 700 clamp(1.8rem, 4.5vw, 3rem) / 1.05 var(--dw-font-title);
  letter-spacing: 0.04em;
  color: var(--dw-ink);
}
.hh-line {
  margin: 0 0 0.6rem;
  font: 1rem / 1.4 var(--dw-font-title);
  color: var(--dw-muted);
}
/* One framed bar. */
.hh-tabs {
  display: flex;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  border: 1px solid color-mix(in oklab, var(--dw-gold) 35%, var(--dw-line-2));
  border-radius: 6px;
  background: color-mix(in oklab, var(--dw-surface) 85%, transparent);
}
.hh-tab {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.6rem;
  min-height: 48px;
  padding: 0 clamp(0.9rem, 2.5vw, 2rem);
  font: 600 0.85rem / 1 var(--dw-font-cond);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--dw-muted);
  border-bottom: 2px solid transparent;
}
.hh-tab + .hh-tab {
  border-left: 1px solid var(--dw-line-2);
}
.hh-tab svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linejoin: round;
}
.hh-tab[aria-current='page'] {
  color: var(--dw-accent);
  border-bottom-color: var(--dw-accent);
  background: color-mix(in oklab, var(--dw-accent) 8%, transparent);
}
.hh-tab:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: -2px;
}
@media (min-width: 900px) {
  .hh {
    display: grid;
  }
}
@media (hover: hover) and (pointer: fine) {
  .hh-tab:hover {
    color: var(--dw-ink);
  }
}
</style>
