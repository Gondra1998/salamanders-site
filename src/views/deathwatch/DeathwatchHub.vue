<script setup>
// The fortress's front hall, as the original's destination menu: the crest and the name, one painted card for
// each area (straight to its first view), and the card to Recruitment. The Manage button is the Watch
// Commander's alone (a convenience only: the server enforces it). The animated door that opened onto this menu
// is not part of it here.
import { computed } from 'vue'
import { AREAS, resolveArea } from '../../lib/deathwatch/areas'
import { iconFor } from '../../lib/deathwatch/icons'
import { useDeathwatch } from '../../stores/deathwatch'
import crest from '../../components/deathwatch/img/crest-large.webp'
import crestGold from '../../components/deathwatch/img/crest-gold.webp'
import trackerArt from '../../components/deathwatch/img/card-tracker.webp'
import armouringArt from '../../components/deathwatch/img/card-armouring.jpg'
import chroniclesArt from '../../components/deathwatch/img/card-chronicles.webp'
import relicsArt from '../../components/deathwatch/img/card-relics.webp'

const store = useDeathwatch()
const ART = { eventtracker: trackerArt, armouringhall: armouringArt, chronicles: chroniclesArt, hallofrelics: relicsArt }
// The four areas everyone sees. Manage has no card: it is a button, below.
const cards = computed(() =>
  Object.entries(AREAS)
    .filter(([area]) => Object.hasOwn(ART, area))
    .map(([area, { label, blurb }]) => ({ area, label, blurb, art: ART[area], to: resolveArea({ area }).canonical })),
)
const manageTo = resolveArea({ area: 'manage' }).canonical
const recruitmentTo = resolveArea({ area: 'recruitment' }).canonical
</script>

<template>
  <section class="dw-hub">
    <header class="dw-hub-head">
      <img class="dw-hub-crest" :src="crest" alt="Deathwatch crest of Watch Fortress Ebonhold" width="190" height="190" />
      <p class="dw-hub-eyebrow">XVIIIth Legiones Astartes, The Salamanders</p>
      <h1 class="dw-hub-title">Watch Fortress Ebonhold</h1>
      <p class="dw-hub-tagline">Suffer not the alien to live.</p>
      <p class="dw-hub-prompt">Choose your destination</p>
    </header>
    <ul class="dw-hub-cards">
      <li v-for="card in cards" :key="card.area">
        <RouterLink class="dw-card" :to="card.to">
          <img class="dw-card-art" :src="card.art" alt="" width="320" height="180" loading="lazy" />
          <span class="dw-card-text">
            <span class="dw-card-title">{{ card.label }}</span>
            <span class="dw-card-blurb">{{ card.blurb }}</span>
          </span>
          <span class="dw-card-go" aria-hidden="true">›</span>
        </RouterLink>
      </li>
    </ul>
    <!-- The call to enlist: an ornament, the call, and the way to Recruitment. -->
    <div class="dw-call">
      <span class="dw-call-orn" aria-hidden="true"><img :src="crestGold" alt="" width="240" height="240" /></span>
      <p class="dw-call-t">The Watch needs <b>you</b></p>
      <div class="dw-call-row">
        <RouterLink class="dw-call-btn" :to="recruitmentTo">Enlist now</RouterLink>
      </div>
    </div>
    <RouterLink v-if="store.commander" class="dw-manage dw-btn rm-fade" :to="manageTo">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <component :is="shape[0]" v-for="(shape, i) in iconFor('manage')" :key="i" v-bind="shape[1]" />
      </svg>
      Manage
    </RouterLink>
  </section>
</template>

<style scoped>
.dw-hub {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: clamp(0.5rem, 1.6dvh, 1.1rem);
  min-height: calc(100dvh - 4rem);
  max-width: 76rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
}
.dw-hub-head {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 1.2rem 1.5rem;
  text-align: center;
}
.dw-hub-crest {
  width: clamp(70px, 12.5dvh, 160px);
  height: auto;
  filter: drop-shadow(0 10px 30px rgb(0 0 0 / 0.6)) drop-shadow(0 0 14px rgb(255 120 30 / 0.35));
}
.dw-hub-eyebrow {
  margin: 0;
  font: 600 clamp(0.75rem, 1.6vw, 0.95rem) / 1.3 var(--dw-font-cond);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--dw-accent);
}
.dw-hub-title {
  margin: 0;
  font-family: var(--dw-font-title);
  font-size: clamp(1.9rem, min(6vw, 7dvh), 4.2rem);
  font-weight: 700;
  line-height: 1.02;
  letter-spacing: 0.04em;
  color: var(--dw-ink);
  text-wrap: balance;
  /* A soft dark halo that follows the letters, so the title stands off the backdrop without a box. */
  text-shadow: 0 2px 4px rgb(0 0 0 / 0.7), 0 0 24px rgb(0 0 0 / 0.6);
}
.dw-hub-tagline {
  margin: 0;
  font-style: italic;
  font-weight: 500;
  color: #cdd6ce;
}
.dw-hub-prompt {
  margin: 0.6rem 0 0;
  font: 600 0.8rem / 1.2 var(--dw-font-cond);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--dw-ink);
}
/* Two wide cards to a row from 760px, one below: each the area's art on the left, its name and line on the right,
   and an arrow. Thin chamfered frames, as the area's panels. */
.dw-hub-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}
@media (min-width: 760px) {
  .dw-hub-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
.dw-card {
  position: relative;
  display: grid;
  grid-template-columns: 46% minmax(0, 1fr) auto;
  align-items: center;
  height: 100%;
  text-align: left;
  text-decoration: none;
  background: linear-gradient(90deg, rgb(8 14 9 / 0.92), rgb(12 22 14 / 0.88));
  clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px);
  transition: transform var(--dur-press) var(--ease-forge);
}
.dw-card-text,
.dw-card-go {
  position: relative;
}
/* The frame, drawn inside the clip so it follows the chamfer. */
.dw-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in oklab, var(--dw-accent) 35%, var(--dw-line-2));
  clip-path: inherit;
  pointer-events: none;
  transition: border-color var(--dur-state) var(--ease-forge);
}
.dw-card-art {
  display: block;
  width: 100%;
  /* A fixed, flat strip: the pictures are of every shape, and the card must not take its height from them. */
  height: clamp(112px, 10vw, 140px);
  object-fit: cover;
  mask-image: linear-gradient(90deg, #000 80%, transparent);
}
.dw-card-text {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 0.5rem 1rem 1.3rem;
}
.dw-card-title {
  font: 700 clamp(1.05rem, 1.7vw, 1.35rem) / 1.15 var(--dw-font-title);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dw-ink);
  text-shadow: 0 2px 6px rgb(0 0 0 / 0.6);
}
.dw-card-blurb {
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--dw-silver);
}
.dw-card-go {
  padding: 0 1.1rem 0 0.4rem;
  font: 700 2rem / 1 var(--dw-font-title);
  color: #ff8a3d;
  text-shadow: 0 0 10px rgb(255 120 40 / 0.5);
  transition: translate var(--dur-state) var(--ease-forge);
}

/* The call to enlist: a gold ornament, the call in spaced capitals with "you" glowing orange, and the orange button
   between two fading lines. */
.dw-call {
  display: grid;
  justify-items: center;
  gap: 0.7rem;
  width: 100%;
  margin-top: 1rem;
}
.dw-call-orn,
.dw-call-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  width: min(100%, 44rem);
}
.dw-call-orn::before,
.dw-call-orn::after,
.dw-call-row::before,
.dw-call-row::after {
  content: '';
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(214 176 92 / 0.6));
}
.dw-call-orn::after,
.dw-call-row::after {
  background: linear-gradient(270deg, transparent, rgb(214 176 92 / 0.6));
}
.dw-call-orn img {
  width: 26px;
  height: auto;
  filter: drop-shadow(0 0 6px rgb(214 176 92 / 0.5));
}
.dw-call-t {
  margin: 0;
  font: 600 clamp(1.05rem, 2.4vw, 1.6rem) / 1.2 var(--dw-font-title);
  letter-spacing: 0.32em;
  text-align: center;
  text-transform: uppercase;
  color: var(--dw-ink);
}
.dw-call-t b {
  font-size: 1.5em;
  letter-spacing: 0.06em;
  color: #ff9a3d;
  text-shadow: 0 0 14px rgb(255 120 40 / 0.6);
}
.dw-call-btn {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0.75rem clamp(2rem, 6vw, 3.6rem);
  font: 700 1rem / 1 var(--dw-font-title);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
  color: #2a1004;
  background: linear-gradient(180deg, #ffb066, #ff6a2b);
  border: 1px solid #ffc58a;
  border-radius: 6px;
  box-shadow: 0 0 24px rgb(255 120 40 / 0.4), inset 0 1px 0 rgb(255 255 255 / 0.35);
  transition:
    box-shadow var(--dur-state) var(--ease-forge),
    filter var(--dur-state) var(--ease-forge),
    transform var(--dur-press) var(--ease-forge);
}
.dw-call-btn:focus-visible {
  outline: 2px solid #ffc58a;
  outline-offset: 3px;
}
@media (hover: hover) and (pointer: fine) {
  .dw-card:hover::after {
    border-color: var(--dw-accent);
  }
  .dw-card:hover .dw-card-go {
    translate: 4px 0;
  }
  .dw-call-btn:hover {
    filter: brightness(1.08);
    box-shadow: 0 0 32px rgb(255 120 40 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.35);
  }
}
.dw-card:active,
.dw-call-btn:active {
  transform: scale(0.97);
}
/* The corners are clipped, which also clips an outline drawn outside the card: draw the ring inside it, as .dw-btn,
   far enough in (2px thick, from 5px to 7px) that its own corners clear the 10px chamfer (x + y = 10). */
.dw-card:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: -7px;
}
/* A phone: the heading's veil spans the screen, so its sides fall past the edges instead of showing as a seam. */
@media (max-width: 600px) {
  .dw-hub-head {
    justify-self: stretch;
    margin-inline: -1rem;
  }
}
/* A narrow phone: the picture gives way, so the longest names (ARMOURING, CHRONICLES) fit beside the arrow. */
@media (max-width: 420px) {
  .dw-card {
    grid-template-columns: 34% minmax(0, 1fr) auto;
  }
  .dw-card-text {
    padding-left: 0.85rem;
  }
  .dw-card-title {
    font-size: 0.98rem;
    letter-spacing: 0.04em;
  }
  .dw-card-go {
    padding-right: 0.8rem;
  }
}
.dw-manage {
  justify-self: start;
  gap: 0.6rem;
  margin-top: 0.5rem;
  text-decoration: none;
}
.dw-manage svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
