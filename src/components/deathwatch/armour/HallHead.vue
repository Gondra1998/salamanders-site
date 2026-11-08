<script setup>
// The head of every Armouring Hall tab, as in the design: the way back to the fortress, the crest, the hall's name
// and line, and its tabs as one bar (links to their canonical addresses). Watch Command shows only to Deathwatch
// Command, as in the rail. From 900px it stands in for the rail, which the hall does without (DeathwatchArea), so
// the name is the page's level-1 heading there; a role, not an <h1>, so a tab change still focuses the view's <h2>.
import { useRoute } from 'vue-router'
import { AREAS, resolveArea } from '../../../lib/deathwatch/areas'
import { DEFAULT_EVENT_NAME } from '../../../lib/deathwatch/tracker'
import { useDeathwatch } from '../../../stores/deathwatch'
import { useDeathwatchData } from '../../../stores/deathwatchData'
import crestArmour from '../img/crest-armouringhall.png'
import crestWatch from '../img/crest.webp'

// Recruitment and the Event Tracker head themselves the same way (since 2026-11); `area` picks the crest, line and tabs.
const props = defineProps({ tab: { type: String, required: true }, area: { type: String, default: 'armouringhall' } })
const route = useRoute()
const store = useDeathwatch()
const data = useDeathwatchData()
const HEADS = {
  armouringhall: { crest: crestArmour, line: 'Uniform & heraldry of the Watch.' },
  recruitment: { crest: crestWatch, line: 'Watch Fortress Ebonhold' },
  // The Event Tracker's line is the running event's name.
  eventtracker: { crest: crestWatch },
}
// Each tab's icon: a lock for Deathwatch Command's, one per Recruitment and Event Tracker tab, else a shield.
const ICONS = {
  'terms-of-service': 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  requirements: 'M4 6.5 5.5 8 8 5.5M4 12.5 5.5 14 8 11.5M4 18.5 5.5 20 8 17.5M11 7h9M11 13h9M11 19h9',
  standings: 'M4 20h16M7 20v-6M12 20V6M17 20v-9',
  'kill-teams': 'M5 5l14 14M19 5 5 19M5 15v4h4M19 15v4h-4',
  players: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c1.8.8 3 2.9 3 5.5',
  'honour-roll': 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6',
  'game-stats': 'M4 4v16h16M8 16v-4M12 16V8M16 16v-6',
  scoring: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12.5a.5.5 0 1 0 0-1',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
}
const head = () => HEADS[props.area]
const line = () => head().line ?? (data.cfg.tx?.cur_n || DEFAULT_EVENT_NAME)
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
    <p class="hh-line" :class="{ 'hh-event': !head().line }">{{ line() }}</p>
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
/* The running event's name (Event Tracker): a lit readout between two gold rules, what the whole tracker is about. */
.hh-event {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 0.15rem 0 0.9rem;
  font: 500 clamp(1.35rem, 2.2vw, 1.75rem) / 1.1 var(--dw-font-hud);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dw-accent);
  text-shadow: 0 0 12px color-mix(in oklab, var(--dw-accent) 55%, transparent);
}
.hh-event::before,
.hh-event::after {
  content: '';
  flex: none;
  width: clamp(2rem, 6vw, 4.5rem);
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--dw-gold));
}
.hh-event::after {
  background: linear-gradient(270deg, transparent, var(--dw-gold));
}
/* A row of free-standing tiles. */
.hh-tabs {
  display: flex;
  /* Never cut off: tabs that do not fit (a narrow window, a large font) go on to a second row. */
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  max-width: 100%;
}
.hh-tab {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.45rem;
  min-height: 48px;
  /* Tight enough for the Event Tracker's seven tabs in one row of the panel's width. */
  padding: 0 clamp(0.6rem, 1.1vw, 1.6rem);
  font: 600 0.85rem / 1 var(--dw-font-cond);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-decoration: none;
  color: color-mix(in oklab, var(--dw-accent) 80%, var(--dw-muted));
  border: 1px solid color-mix(in oklab, var(--dw-accent) 22%, var(--dw-line-2));
  border-radius: 2px;
  background: rgb(10 14 10 / 0.75);
}
.hh-tab svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linejoin: round;
}
/* The open tab: gold, in a gold frame on a warmer ground. */
.hh-tab[aria-current='page'] {
  color: var(--dw-gold);
  border-color: color-mix(in oklab, var(--dw-gold) 70%, transparent);
  background: color-mix(in oklab, var(--dw-gold) 8%, rgb(22 22 18 / 0.9));
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
/* A narrow window: the labels alone, so the Event Tracker's seven tabs still fit in one row. */
@media (max-width: 1000px) {
  .hh-tab svg {
    display: none;
  }
}
@media (hover: hover) and (pointer: fine) {
  .hh-tab:not([aria-current='page']):hover {
    color: var(--dw-accent);
    border-color: color-mix(in oklab, var(--dw-accent) 55%, transparent);
  }
}
</style>
