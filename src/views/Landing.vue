<script setup>
import HeroForge from '../components/HeroForge.vue'
import SectionTitle from '../components/SectionTitle.vue'
import { useMusterFacts } from '../lib/useMusterFacts'

// The live fact on a row (a count of classes, weapons, posted builds or companies) comes from here; a row with no
// fact yet, or none at all, simply goes without one.
const { facts } = useMusterFacts()

const ops = [
  {
    to: '/planner',
    title: 'Perk Builder',
    body: 'Plan every class — Tactical to Sniper — and forge a build perk by perk.',
  },
  {
    to: '/armoury',
    title: 'Weapon Armoury',
    body: 'Every weapon by slot — primary, secondary, melee — and the classes that bear it.',
  },
  {
    to: '/builds',
    title: 'Recommended Builds',
    body: 'Save your class loadouts, then apply or share them in a click.',
  },
  {
    to: '/companies',
    title: 'Companies & Roster',
    body: 'Our companies, their sections, and the brothers who hold the line.',
  },
]
</script>

<template>
  <!-- Single root: a multi-root view can't be animated or transitioned by App.vue. -->
  <div class="landing">
    <HeroForge />

    <section class="muster">
      <SectionTitle>Muster the Chapter</SectionTitle>
      <!-- role="list": Safari drops the list semantics of a list with list-style: none. -->
      <ul class="muster-list surface" role="list">
        <li v-for="o in ops" :key="o.to">
          <RouterLink class="muster-row rm-fade" :to="o.to">
            <span class="muster-name">{{ o.title }}</span>
            <span class="muster-line">{{ o.body }}</span>
            <span v-if="facts[o.to]" class="muster-fact">{{ facts[o.to] }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.muster {
  max-width: 76rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 1rem;
}
/* The rows sit on one dense panel (.surface), not straight on the lava behind the page, so the smoke-grey lines keep
   their contrast. The panel's border closes the list; a hairline separates one row from the next. */
.muster-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-radius: var(--radius-md);
}
.muster-list li + li {
  border-top: 1px solid var(--color-ash);
}

/* A row is a link, and the whole row is the tap target: name and fact on the first line, what it does on the
   second. Rows are rows, so there is no lift and no squeeze, only the name taking the drake colour. The fact column
   is as wide as its text up to 7rem, then wraps ("12 companies / and sections"), so a long fact never squeezes the
   name onto two lines. */
.muster-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) fit-content(7rem);
  column-gap: 1rem;
  row-gap: 0.25rem;
  align-items: baseline;
  padding: 1rem;
  min-height: var(--tap);
}
.muster-name {
  grid-column: 1;
  grid-row: 1;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  font-weight: 700;
  font-size: var(--text-lg);
  color: var(--color-bone);
  transition: color var(--dur-state) var(--ease-forge);
}
.muster-line {
  grid-column: 1 / -1;
  grid-row: 2;
  color: var(--color-smoke);
  font-size: var(--text-md);
  line-height: 1.5;
}
.muster-fact {
  grid-column: 2;
  grid-row: 1;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--color-pewter);
}

@media (hover: hover) and (pointer: fine) {
  .muster-row:hover .muster-name {
    color: var(--color-drake);
  }
}
/* A touch has no hover, so the press gives the same answer. */
.muster-row:active .muster-name {
  color: var(--color-drake);
}

/* Wide enough for three columns: the name (the longest, "Recommended Builds", is 12.4rem), the line, the fact.
   Below this the line has too little room beside the name, and keeps the phone stack. */
@media (min-width: 50rem) {
  .muster-row {
    grid-template-columns: 13rem minmax(0, 1fr) fit-content(7rem);
    column-gap: 1.5rem;
    row-gap: 0;
    padding: 1rem 1.5rem;
  }
  .muster-line {
    grid-column: 2;
    grid-row: 1;
  }
  .muster-fact {
    grid-column: 3;
  }
}
/* With room to spare the longest fact stays on one line. */
@media (min-width: 70rem) {
  .muster-row {
    grid-template-columns: 13rem minmax(0, 1fr) auto;
  }
}
</style>
