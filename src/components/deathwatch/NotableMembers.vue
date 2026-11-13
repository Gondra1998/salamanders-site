<script setup>
// The Hall of Relics' Notable Members, in the old Watch Fortress site's Obsidian & Gold: a gold title over an
// ornament and the introduction, the Watch Commander's plaque with the gold crest, the Chronicles of Command as a
// gold-edged list, the Honored Veterans as cards (a sealed one under a wax seal and a stamp), and the closing
// battle cries, the last in gold. The content is only what the area's data holds (cfg.tx, read by
// lib/deathwatch/notables.js): members' names never ship in the site's code. With nobody named there, a note says so.
import { computed, onMounted } from 'vue'
import { anyone, notables } from '../../lib/deathwatch/notables'
import { useAuth } from '../../stores/auth'
import { useDeathwatchData } from '../../stores/deathwatchData'
import crestGold from './img/crest-gold.webp'
import Inline from './Inline'
import LoadRetry from './LoadRetry.vue'

const auth = useAuth()
const data = useDeathwatchData()
// Once: a page of records, not a live view, so it does not poll as the Event Tracker does.
onMounted(() => {
  if (data.status !== 'ready') data.load(auth.token)
})

const n = computed(() => notables(data.cfg.tx))
const shown = computed(() => anyone(n.value))
</script>

<template>
  <LoadRetry v-if="data.status === 'error'" class="nm-none">The records could not be loaded.</LoadRetry>
  <p v-else-if="data.status !== 'ready'" class="nm-none" role="status">Loading…</p>
  <p v-else-if="!shown" class="nm-none">No notable members are recorded yet.</p>
  <section v-else class="nm" aria-labelledby="nm-title">
    <header class="nm-head">
      <p class="nm-cls">Hall of Relics</p>
      <h2 id="nm-title" class="nm-title">Notable Members of Ebonhold</h2>
      <span class="nm-orn" aria-hidden="true" />
      <div v-if="n.intro.length" class="nm-intro">
        <p v-for="(p, i) in n.intro" :key="i" class="nm-q"><Inline :segs="p" /></p>
      </div>
    </header>

    <section v-if="n.commander" class="nm-cmd">
      <img :src="crestGold" alt="" class="nm-crest" width="240" height="240" />
      <div>
        <p class="nm-k">{{ n.commander.kicker }}</p>
        <h3 class="nm-h">{{ n.commander.name }}</h3>
        <div class="nm-body">
          <p v-for="(p, i) in n.commander.lines" :key="i"><Inline :segs="p" /></p>
        </div>
      </div>
    </section>

    <section v-if="n.chronicles.groups.length" class="nm-s">
      <h3 class="nm-h">Chronicles of Command</h3>
      <p v-for="(p, i) in n.chronicles.intro" :key="i" class="nm-q"><Inline :segs="p" /></p>
      <template v-for="(g, i) in n.chronicles.groups" :key="i">
        <h4 v-if="g.h" class="nm-lh">{{ g.h }}</h4>
        <ul class="nm-l">
          <li v-for="(item, j) in g.items" :key="j"><Inline :segs="item" /></li>
        </ul>
      </template>
    </section>

    <section v-if="n.veterans.list.length" class="nm-s">
      <h3 class="nm-h">Honored Veterans of the Long Vigil</h3>
      <p v-for="(p, i) in n.veterans.intro" :key="i" class="nm-q"><Inline :segs="p" /></p>
      <div class="nm-g">
        <article v-for="v in n.veterans.list" :key="v.name" class="nm-v" :class="{ sealed: v.sealed }">
          <span class="nm-b">{{ n.veterans.badge }}</span>
          <h4>{{ v.name }}</h4>
          <p v-if="v.epithet" class="nm-ep">{{ v.epithet }}</p>
          <template v-if="v.sealed">
            <!-- No record on the page: blurred bars stand where it would be. -->
            <div class="nm-x" aria-hidden="true"><i /><i /><i /></div>
            <span class="nm-seal" aria-hidden="true">✠</span>
            <span class="nm-stamp">Records sealed</span>
          </template>
          <p v-else class="nm-vt"><Inline :segs="v.text" /></p>
        </article>
      </div>
    </section>

    <div v-if="n.closing.length" class="nm-e">
      <template v-for="(c, i) in n.closing" :key="i">
        <p v-if="c.kind === 'cry'" class="nm-cry">{{ c.t }}</p>
        <p v-else-if="c.kind === 'quote'" class="nm-q">{{ c.t }}</p>
        <p v-else><Inline :segs="c.segs" /></p>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* The old site's Hall of Relics (Obsidian & Gold), in the area's own faces: Cinzel for titles, Barlow Condensed
   for labels, Teko for the stamp. */
.nm {
  --gd: #d6b05c;
  --gl: #f3e2b0;
  --mut: #9d947f;
  max-width: 880px;
  margin: 0 auto;
  color: #d9d6cc;
}
.nm-none {
  margin: 0;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--dw-muted);
}
.nm-head {
  display: grid;
  justify-items: center;
  gap: 6px;
  margin: 6px 0 22px;
  text-align: center;
}
.nm-cls {
  margin: 0;
  font: 600 13px var(--dw-font-cond);
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--gd);
}
.nm-title {
  margin: 0;
  font: 700 clamp(30px, 6vw, 64px) / 1.05 var(--dw-font-title);
  text-wrap: balance;
  background: linear-gradient(180deg, #fff0b8 0%, #d9a536 45%, #7a4b0a 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.8));
}
.nm-orn {
  position: relative;
  display: block;
  width: min(340px, 80%);
  height: 14px;
  margin: 4px auto 0;
  background: linear-gradient(90deg, transparent, var(--gd) 30%, var(--gd) 70%, transparent) center / 100% 1px no-repeat;
}
.nm-orn::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  background: var(--gd);
  transform: translate(-50%, -50%) rotate(45deg);
  box-shadow: 0 0 12px rgb(240 213 138 / 0.8);
}
.nm-intro {
  max-width: 62ch;
  margin: 12px 0 0;
  font-size: 17px;
  line-height: 1.6;
}
.nm-q {
  font-style: italic;
  color: var(--mut);
}
.nm-intro .nm-q {
  margin: 0 0 6px;
}
.nm-h {
  margin: 16px 0 0;
  font: 700 clamp(22px, 3vw, 32px) / 1.15 var(--dw-font-title);
  letter-spacing: 0.06em;
  color: var(--gl);
  text-wrap: balance;
}

/* The Watch Commander's plaque: the gold crest beside the name and the write-up. */
.nm-cmd {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: clamp(16px, 3vw, 32px);
  align-items: start;
  margin: 30px 0 0;
  padding: clamp(18px, 3vw, 32px);
  border: 1px solid #c99a3e;
  border-radius: 12px;
  background:
    radial-gradient(ellipse at 0% 0%, rgb(212 169 74 / 0.14), transparent 55%),
    linear-gradient(180deg, rgb(22 22 26 / 0.8), rgb(8 8 10 / 0.8));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.05), 0 0 50px -14px rgb(212 169 74 / 0.45);
}
.nm-crest {
  width: clamp(96px, 14vw, 150px);
  height: auto;
  filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.8)) drop-shadow(0 0 18px rgb(212 169 74 / 0.25));
}
.nm-k {
  margin: 0;
  font: 600 12px var(--dw-font-cond);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--gd);
}
.nm-cmd .nm-h {
  margin: 4px 0 12px;
}
.nm-body {
  font-size: 16px;
  line-height: 1.75;
}
.nm-body p {
  margin: 0 0 14px;
}
.nm-body p:last-child {
  margin-bottom: 0;
}
/* The write-up opens on a gold initial, as the old site's lore pages did. */
.nm-body > p:first-child::first-letter {
  float: left;
  margin: 6px 10px 0 0;
  font: 700 3.7em / 0.8 var(--dw-font-title);
  color: var(--gd);
  text-shadow: 0 0 12px rgb(214 176 92 / 0.45);
}

.nm-s {
  margin: 48px 0 0;
  text-align: center;
}
.nm-s > .nm-q {
  max-width: 60ch;
  margin: 8px auto 18px;
  line-height: 1.6;
}
.nm-lh {
  margin: 22px 0 10px;
  font: 600 12px var(--dw-font-cond);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--gd);
}
.nm-l {
  display: grid;
  gap: 10px;
  max-width: 720px;
  margin: 0 auto;
  padding: 0;
  list-style: none;
  text-align: left;
}
.nm-l li {
  padding: 12px 16px;
  border: 1px solid rgb(201 154 62 / 0.3);
  border-left: 3px solid #c99a3e;
  border-radius: 6px;
  background: rgb(255 255 255 / 0.025);
  line-height: 1.5;
  color: #ddd5c2;
}

/* An Honored Veteran's card, a gold rule along its top edge. */
.nm-g {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: 14px;
  text-align: left;
}
.nm-v {
  position: relative;
  padding: 18px 18px 16px;
  border: 1px solid rgb(201 154 62 / 0.35);
  border-radius: 10px;
  background: linear-gradient(180deg, rgb(24 24 28 / 0.8), rgb(9 9 11 / 0.8));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
}
.nm-v::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 18px;
  right: 18px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #e8c46a, transparent);
}
.nm-b {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  padding: 3px 10px 2px;
  border: 1px solid rgb(201 154 62 / 0.55);
  border-radius: 999px;
  background: rgb(212 169 74 / 0.1);
  font: 600 10.5px var(--dw-font-cond);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #e8c46a;
}
.nm-b::before {
  content: '✠';
  font-size: 11px;
}
.nm-v h4 {
  margin: 0;
  font: 700 19px / 1.2 var(--dw-font-title);
  letter-spacing: 0.04em;
  color: var(--gl);
}
.nm-ep {
  margin: 4px 0 10px;
  font: 600 12px var(--dw-font-cond);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gd);
}
.nm-vt {
  margin: 0;
  line-height: 1.6;
  color: #d4ccb8;
}
/* A sealed record: a red rule, blurred bars where the text would be, a wax seal and a stamp across it. */
.nm-v.sealed {
  overflow: hidden;
  border-color: rgb(192 57 43 / 0.45);
  background:
    repeating-linear-gradient(135deg, rgb(255 255 255 / 0.012) 0 8px, transparent 8px 16px),
    linear-gradient(180deg, rgb(26 18 18 / 0.8), rgb(9 7 7 / 0.8));
}
.nm-v.sealed::before {
  background: linear-gradient(90deg, transparent, #c0392b, transparent);
}
.nm-x {
  display: grid;
  gap: 9px;
  padding: 4px 0 6px;
  filter: blur(4px);
  opacity: 0.55;
}
.nm-x i {
  display: block;
  height: 10px;
  border-radius: 3px;
  background: #d4ccb8;
}
.nm-x i:last-child {
  width: 60%;
}
.nm-seal {
  position: absolute;
  top: 12px;
  right: 14px;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 47% 53% 50% 50% / 52% 48% 52% 48%;
  background: radial-gradient(circle at 35% 30%, #e0574a, #9b2117 55%, #5a0d08);
  box-shadow: 0 3px 8px rgb(0 0 0 / 0.7), inset 0 -3px 6px rgb(0 0 0 / 0.35), inset 0 2px 3px rgb(255 160 140 / 0.35);
  color: #f6d6c8;
  font: 700 22px var(--dw-font-title);
  text-shadow: 0 1px 1px rgb(0 0 0 / 0.6);
  rotate: -12deg;
}
.nm-seal::after {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  border: 1px dashed rgb(255 200 185 / 0.45);
}
.nm-stamp {
  position: absolute;
  left: 50%;
  top: 68%;
  translate: -50% -50%;
  rotate: -9deg;
  padding: 5px 16px 3px;
  border: 3px double #d2483a;
  border-radius: 4px;
  background: rgb(12 6 6 / 0.55);
  color: #e8604f;
  font: 500 22px / 1 var(--dw-font-hud);
  letter-spacing: 0.28em;
  text-transform: uppercase;
  white-space: nowrap;
  text-shadow: 0 0 8px rgb(232 96 79 / 0.35);
  pointer-events: none;
}

.nm-e {
  display: grid;
  gap: 10px;
  max-width: 62ch;
  margin: 56px auto 0;
  text-align: center;
}
.nm-e > p {
  margin: 0;
}
.nm-e > .nm-q {
  line-height: 1.6;
}
.nm-cry {
  font: 700 clamp(17px, 2.2vw, 22px) / 1.3 var(--dw-font-title);
  letter-spacing: 0.08em;
  color: var(--gl);
}
.nm-cry:last-child {
  margin-top: 14px;
  font: 700 clamp(26px, 4vw, 44px) / 1.15 var(--dw-font-title);
  letter-spacing: 0.06em;
  background: linear-gradient(180deg, #fff0b8, #d9a536 55%, #7a4b0a);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.8));
}

/* Marks come from a render function, whose elements carry no scope id, so they are reached through .nm. */
.nm :deep(b) {
  color: var(--gl);
}
.nm :deep(a) {
  color: #e8c46a;
  text-underline-offset: 3px;
}
.nm :deep(a:focus-visible) {
  outline: 2px solid #e8c46a;
  outline-offset: 2px;
}
@media (max-width: 620px) {
  .nm-cmd {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }
  .nm-body {
    text-align: left;
  }
}
@media (prefers-reduced-motion: reduce) {
}
</style>
