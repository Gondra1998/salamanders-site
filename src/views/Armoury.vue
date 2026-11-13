<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import weapons from '../data/weapons.json'
import classes from '../data/classes.json'
import { usePlanner } from '../stores/planner'
import { WIKI } from '../lib/wiki'
import { resolveWeapon, SOURCE_LABEL, slotAverages, GAUGE_MAX, weaponLabel, versionLabel } from '../lib/weapons'
import WeaponTree from '../components/WeaponTree.vue'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'

const planner = usePlanner()

const cats = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'melee', label: 'Melee' },
]
const active = ref('primary')
const q = ref('')
const classNames = Object.keys(classes)

const classesFor = (name) =>
  classNames.filter((c) => classes[c].weapons[active.value]?.includes(name))

const list = computed(() =>
  weapons.fallbackWeapons[active.value]
    .filter((w) => {
      const needle = q.value.trim().toLowerCase()
      return w.toLowerCase().includes(needle) || weaponLabel(w).toLowerCase().includes(needle)
    })
    .map((w) => ({
      name: w,
      users: classNames.filter((c) => classes[c].weapons[active.value]?.includes(w)),
    })),
)

const activeWeapon = ref(null)
const status = ref('idle') // idle | loading | ready | error
const data = ref(null)
const errorMsg = ref('')

const toast = ref('')
let tt
function flash(m) {
  toast.value = m
  clearTimeout(tt)
  tt = setTimeout(() => (toast.value = ''), 1800)
}

const detail = ref(null)
// Stacked on a phone the detail starts a full screen below the list, so a tap would look like
// it did nothing. Side by side (desktop) both are already in view.
function revealDetail() {
  if (!detail.value?.scrollIntoView || !window.matchMedia) return
  if (window.matchMedia('(min-width: 900px)').matches) return
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  detail.value.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
}

async function selectWeapon(name) {
  activeWeapon.value = name
  status.value = 'loading'
  data.value = null
  nextTick(revealDetail)
  const resolved = await resolveWeapon(name)
  if (resolved) {
    data.value = resolved
    versionIndex.value = Math.max(
      0,
      (resolved.versions || []).findIndex((v) => v.quality === 'Standard'),
    )
    status.value = 'ready'
  } else {
    errorMsg.value = 'No perk tree for this weapon yet — the wiki page has no perk table.'
    status.value = 'error'
  }
}

function setCat(key) {
  active.value = key
  activeWeapon.value = null
  status.value = 'idle'
}

// ---- stats ----
const versionIndex = ref(0)
const versions = computed(() => data.value?.versions || [])
const version = computed(() => versions.value[versionIndex.value] || null)

// Slot average, so each bar reads against its peers rather than in a vacuum.
const averages = computed(() => slotAverages(weapons.fallbackWeapons[active.value]))

const gauges = computed(() => {
  const g = version.value?.gauges
  if (!g) return []
  return Object.entries(g).map(([label, { value, raw }]) => {
    const avg = averages.value[label]
    const delta = typeof avg === 'number' ? value - avg : null
    return {
      label,
      value,
      raw,
      pct: Math.min(100, (value / GAUGE_MAX) * 100),
      avgPct: typeof avg === 'number' ? Math.min(100, (avg / GAUGE_MAX) * 100) : null,
      delta,
      trend: delta === null ? '' : delta > 0.25 ? 'over' : delta < -0.25 ? 'under' : 'par',
    }
  })
})

const figures = computed(() => Object.entries(version.value?.figures || {}))

const canEquip = computed(
  () =>
    activeWeapon.value &&
    classes[planner.activeClass].weapons[active.value]?.includes(activeWeapon.value),
)
function equip() {
  if (!canEquip.value) return
  planner.setWeapon(active.value, activeWeapon.value)
  flash(`${activeWeapon.value} equipped for ${planner.activeClass}`)
}
const wikiUrl = (name) => WIKI + encodeURIComponent(name)

// Deep link: /armoury?w=Bolt Rifle — used by the Builds page and share links.
const route = useRoute()
function openFromQuery(name) {
  if (!name) return
  const cat = cats.find((c) => weapons.fallbackWeapons[c.key].includes(name))
  if (!cat) return
  active.value = cat.key
  q.value = ''
  selectWeapon(name)
}
onMounted(() => openFromQuery(route.query.w))
watch(() => route.query.w, openFromQuery)
</script>

<template>
  <section class="armoury">
    <PageHeader
      eyebrow="Wargear"
      title="Weapon Armoury"
      lede="Every weapon of the Chapter. Pick one to plan its perk tree. Trees ship with the site and are re-synced weekly."
    />

    <div class="a-controls">
      <div class="catbar" role="tablist" aria-label="Weapon categories">
        <button
          v-for="c in cats"
          :key="c.key"
          class="cat-tab tab-forge"
          :class="{ on: active === c.key }"
          role="tab"
          :aria-selected="active === c.key"
          @click="setCat(c.key)"
        >
          {{ c.label }}
          <span class="cat-count">{{ weapons.fallbackWeapons[c.key].length }}</span>
        </button>
      </div>
      <input
        v-model="q"
        class="w-search field-forge"
        type="search"
        placeholder="Search weapons…"
        aria-label="Search weapons"
      />
    </div>

    <div class="a-layout">
      <!-- Weapon list -->
      <nav class="w-list" aria-label="Weapons">
        <button
          v-for="w in list"
          :key="w.name"
          class="w-item rm-fade"
          :class="{ on: activeWeapon === w.name }"
          @click="selectWeapon(w.name)"
        >
          {{ weaponLabel(w.name) }}
          <span class="w-item-users">{{ w.users.length }}</span>
        </button>
        <p v-if="!list.length" class="w-empty">No weapons match “{{ q }}”.</p>
      </nav>

      <!-- Weapon detail -->
      <div ref="detail" class="w-detail">
        <StatePanel
          v-if="status === 'idle'"
          kind="prompt"
          class="w-prompt"
          body="Select a weapon to plan its perk tree."
        />

        <StatePanel
          v-else-if="status === 'loading'"
          kind="loading"
          :body="`Syncing ${weaponLabel(activeWeapon)} from the wiki…`"
        />

        <StatePanel
          v-else-if="status === 'error'"
          kind="error"
          class="w-error"
          :title="weaponLabel(activeWeapon)"
          :body="errorMsg"
        >
          <button class="btn-drake btn-sm" @click="selectWeapon(activeWeapon)">Retry</button>
          <a class="btn-ghost btn-sm" :href="wikiUrl(activeWeapon)" target="_blank" rel="noopener">Open wiki ↗</a>
        </StatePanel>

        <template v-else-if="status === 'ready' && data">
          <div class="w-hero">
            <div>
              <p class="eyebrow">
                {{ data.meta?.slot || active }}<span v-if="data.meta?.category"> · {{ data.meta.category }}</span>
              </p>
              <h2 class="w-hero-name">{{ weaponLabel(activeWeapon) }}</h2>
            </div>
            <span class="w-src" :class="data.source">
              {{ SOURCE_LABEL[data.source] }}
            </span>
          </div>

          <dl class="w-tags">
            <div v-if="data.meta?.damageType">
              <dt>Damage</dt>
              <dd>{{ data.meta.damageType }}</dd>
            </div>
            <div>
              <dt>Classes</dt>
              <dd>{{ classesFor(activeWeapon).join(', ') || 'None' }}</dd>
            </div>
          </dl>

          <p v-if="data.intro?.length" class="w-hero-intro">{{ data.intro.join(' ') }}</p>

          <!-- Stat block -->
          <section v-if="versions.length" class="stats">
            <div class="stats-head">
              <h3 class="stats-title">Statistics</h3>
              <span v-if="version?.defence" class="defence" :data-defence="version.defence">{{ version.defence }}</span>
              <label class="stats-version">
                <span>Version</span>
                <select v-model.number="versionIndex">
                  <option v-for="(v, i) in versions" :key="i" :value="i">
                    {{ versionLabel(v) }}
                  </option>
                </select>
              </label>
            </div>

            <ul class="gauges">
              <li v-for="g in gauges" :key="g.label" class="gauge">
                <span class="gauge-label">{{ g.label }}</span>
                <span class="gauge-track">
                  <span class="gauge-fill" :class="g.trend" :style="{ width: g.pct + '%' }" />
                  <span
                    v-if="g.avgPct !== null"
                    class="gauge-avg"
                    :style="{ left: g.avgPct + '%' }"
                    :title="`Slot average ${g.delta >= 0 ? '' : ''}`"
                  />
                </span>
                <span class="gauge-val">{{ g.raw }}</span>
                <span class="gauge-delta" :class="g.trend">
                  {{ g.delta === null ? '' : (g.delta > 0 ? '+' : '') + g.delta.toFixed(1) }}
                </span>
              </li>
            </ul>

            <p class="gauges-key">
              Bars are the in-game 0–{{ GAUGE_MAX }} ratings. The notch marks the
              {{ active }} average; the number is this weapon's difference from it.
            </p>

            <dl v-if="figures.length" class="figures">
              <div v-for="[k, v] in figures" :key="k">
                <dt>{{ k }}</dt>
                <dd>{{ v }}</dd>
              </div>
            </dl>
          </section>

          <div class="w-hero-actions">
            <button class="btn-ember btn-sm" :disabled="!canEquip" @click="equip">
              {{ canEquip ? `Equip for ${planner.activeClass}` : `Not for ${planner.activeClass}` }}
            </button>
            <a class="btn-ghost btn-sm" :href="wikiUrl(activeWeapon)" target="_blank" rel="noopener">
              Open wiki ↗
            </a>
          </div>

          <WeaponTree v-if="!data.perksPending" :weapon="activeWeapon" :data="data" />
          <p v-else class="w-pending">
            Perk tree not published yet. The wiki has this weapon's stats but not its perk list.
          </p>
        </template>
      </div>
    </div>

    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </section>
</template>

<style scoped>
.armoury {
  max-width: 76rem;
  margin: 0 auto;
  padding: 4rem 1.5rem 2rem;
}

.a-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin: 1.6rem 0 1.2rem;
}
.catbar {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.cat-count {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  opacity: 0.7;
}
.w-search {
  flex: 1 1 14rem;
  max-width: 20rem;
}

.a-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.2rem;
}
@media (min-width: 900px) {
  .a-layout {
    grid-template-columns: 15rem minmax(0, 1fr);
    align-items: start;
  }
  .w-list {
    position: sticky;
    top: 5rem;
    max-height: calc(100svh - 6rem);
    overflow-y: auto;
  }
}
.w-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.w-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  text-align: left;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-basalt-2) 40%, transparent);
  color: var(--color-bone);
  font-size: var(--text-sm);
  cursor: pointer;
  min-height: var(--tap);
  transition:
    border-color var(--dur-state) var(--ease-forge),
    background-color var(--dur-state) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .w-item:hover {
    border-color: var(--color-ash-2);
  }
}
.w-item.on {
  border-color: var(--color-ember);
  background: color-mix(in srgb, var(--color-ember) 10%, transparent);
}
.w-item-users {
  flex: none;
  font-family: var(--font-mono);
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-drake);
}
.w-empty {
  color: var(--color-smoke);
  padding: 1rem 0;
  font-size: var(--text-sm);
}

.w-detail {
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-pitch) 40%, transparent);
  padding: 1.4rem;
  min-height: 16rem;
  min-width: 0;
  scroll-margin-top: 5rem;
}
/* A state panel is its own dense frame, so the outer one steps aside instead of boxing it twice. */
.w-detail:has(> .state-panel) {
  border: 0;
  background: none;
  padding: 0;
  min-height: 0;
}
.w-detail > .state-panel {
  min-height: 14rem;
  justify-content: center;
}

.w-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.w-hero-name {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  font-size: var(--text-xl);
  color: var(--color-bone);
}
.w-src {
  flex: none;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-ash);
}
.w-src.baked {
  color: var(--color-drake);
  border-color: color-mix(in srgb, var(--color-drake) 40%, transparent);
}
.w-src.wiki {
  color: var(--color-cobalt);
  border-color: color-mix(in srgb, var(--color-cobalt) 40%, transparent);
}
.w-src.offline {
  color: var(--color-gold);
  border-color: color-mix(in srgb, var(--color-gold) 40%, transparent);
}
/* dossier tags */
.w-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.6rem 2rem;
  margin: 0.8rem 0 0;
}
.w-tags > div {
  min-width: 0;
  flex: 0 1 auto;
}
.w-tags dt {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.w-tags dd {
  margin: 0.15rem 0 0;
  font-size: var(--text-sm);
  color: var(--color-pewter);
  max-width: 34ch;
}

/* stat block */
.stats {
  margin: 1.4rem 0 1.6rem;
  padding: 1.1rem 1.2rem 1.2rem;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-obsidian) 45%, transparent);
}
.stats-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.stats-title {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  font-size: var(--text-md);
  color: var(--color-bone);
}
/* Melee defence type, beside the title; the version picker stays on the right. */
.defence {
  margin-right: auto;
  align-self: center;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  color: var(--color-smoke);
}
.defence[data-defence='Block'] {
  color: var(--color-cobalt);
}
.defence[data-defence='Balanced'] {
  color: var(--color-gold);
}
.defence[data-defence='Fencing'] {
  color: var(--color-ember);
}
.w-pending {
  margin: 1.2rem 0 0;
  padding: 1rem 1.2rem;
  border: 1px dashed var(--color-ash);
  border-radius: var(--radius-md);
  color: var(--color-smoke);
  font-size: var(--text-md);
}
.stats-version {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  max-width: 100%;
}
.stats-version span {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.stats-version select {
  background: color-mix(in srgb, var(--color-obsidian) 80%, transparent);
  border: 1px solid var(--color-ash);
  color: var(--color-bone);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.5rem;
  font-size: var(--text-sm);
  max-width: 16rem;
  min-width: 0;
}

.gauges {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.gauge {
  display: grid;
  grid-template-columns: 9.5rem 1fr 2.4rem 2.6rem;
  align-items: center;
  gap: 0.7rem;
}
.gauge-label {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
/* Track is notched into ten segments, like a gauge struck on the anvil. */
.gauge-track {
  position: relative;
  height: 12px;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-sm);
  background-image: repeating-linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-bone) 5%, transparent) 0 calc(10% - 1px),
    transparent calc(10% - 1px) 10%
  );
  overflow: hidden;
}
.gauge-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-ember) 45%, var(--color-obsidian)),
    var(--color-ember)
  );
}
.gauge-fill.over {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-ember) 60%, var(--color-obsidian)),
    var(--color-ember-light)
  );
}
.gauge-fill.under {
  background: linear-gradient(90deg, var(--color-ash), var(--color-ash-2));
}
.gauge-avg {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  transform: translateX(-1px);
  background: var(--color-bone);
  opacity: 0.75;
}
.gauge-val {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-bone);
  text-align: right;
}
.gauge-delta {
  font-family: var(--font-mono);
  font-size: max(var(--text-xs), var(--text-floor));
  text-align: right;
}
.gauge-delta.over {
  color: var(--color-drake);
}
.gauge-delta.under {
  color: color-mix(in srgb, var(--color-vacant) 55%, var(--color-smoke));
}
.gauge-delta.par {
  color: var(--color-smoke);
}
.gauges-key {
  margin-top: 0.8rem;
  color: var(--color-smoke);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.figures {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 2rem;
  margin: 0.9rem 0 0;
  padding-top: 0.9rem;
  border-top: 1px solid var(--color-ash);
}
.figures dt {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.figures dd {
  margin: 0.15rem 0 0;
  font-family: var(--font-display);
  font-size: var(--text-base);
  color: var(--color-gold);
}

@media (max-width: 560px) {
  .gauge {
    grid-template-columns: 7rem 1fr 2.2rem;
  }
  .gauge-delta {
    display: none;
  }
}

.w-hero-intro {
  color: var(--color-pewter);
  line-height: 1.6;
  margin: 0.8rem 0;
  font-size: var(--text-md);
  max-width: 60ch;
}
.w-hero-actions {
  display: flex;
  gap: 0.5rem;
  margin: 0.8rem 0 1.4rem;
  flex-wrap: wrap;
}
.btn-ember:disabled {
  filter: grayscale(0.6) brightness(0.7);
  cursor: not-allowed;
}

.toast {
  position: fixed;
  bottom: calc(1.4rem + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 80;
  background: color-mix(in srgb, var(--color-obsidian) 92%, transparent);
  border: 1px solid var(--color-drake);
  color: var(--color-bone);
  padding: 0.6rem 1.1rem;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.toast-enter-active {
  transition:
    opacity var(--dur-sheet) var(--ease-forge),
    transform var(--dur-sheet) var(--ease-forge);
}
.toast-leave-active {
  transition:
    opacity var(--dur-view) var(--ease-forge),
    transform var(--dur-view) var(--ease-forge);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
