<script setup>
import { ref, computed, watch } from 'vue'
import { usePlanner } from '../stores/planner'
import { usePerkCorrections } from '../stores/perkCorrections'
import { QUALITIES, slug } from '../lib/wiki'
import PerkEditPanel from './PerkEditPanel.vue'
import { perkSuggestions } from '../lib/weapons'

const props = defineProps({
  weapon: { type: String, required: true },
  // Where this tree's picks and budget live. Defaults to the weapon itself; a slot
  // passes its own key when the same weapon sits in two slots (see lib/perkStateKey.js).
  stateKey: { type: String, default: '' },
  data: { type: Object, required: true }, // { perks:[{name,quality,description}], budget }
})
const planner = usePlanner()
const corrections = usePerkCorrections()
const treeKey = computed(() => props.stateKey || props.weapon)
const tree = computed(() => corrections.weaponTree(props.weapon, props.data))
const suggestions = perkSuggestions()
const adding = ref(null) // quality being added to
// Only trees from the bake can be corrected: the server validates against the
// bake, so a live-wiki or offline fallback tree would 404 on every edit.
const canEdit = computed(() => corrections.canEdit && props.data.source === 'baked')

// Ids come from each perk's stable `key` (its bake index, or c<id> for an
// added perk) so a correction removing a perk never shifts saved picks.
const perks = computed(() =>
  tree.value.perks.map((p) => ({ ...p, id: `${slug(p.quality)}-${slug(p.name)}-${p.key}` })),
)
const correctedOn = (p) =>
  new Date(p.corrected.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
const tiers = computed(() =>
  QUALITIES.map((q) => ({ quality: q, perks: perks.value.filter((p) => p.quality === q) })).filter(
    (t) => t.perks.length,
  ),
)

const budget = computed(() => planner.weaponBudgets[treeKey.value] ?? props.data.budget ?? 10)
const selected = computed(() => planner.weaponPerks[treeKey.value] || {})
// Only picks of perks that still exist count: a removal correction orphans a
// pick without deleting it, so reverting the correction restores it.
const perkIds = computed(() => new Set(perks.value.map((p) => p.id)))
const used = computed(() => Object.keys(selected.value).filter((id) => perkIds.value.has(id)).length)
const full = computed(() => used.value >= budget.value)

// Corrections target the first perk of a name in its tier (the bake has a
// few duplicates), so later ones of the same name aren't offered for editing.
const laterDuplicates = computed(() => {
  const seen = new Set()
  const ids = new Set()
  for (const p of perks.value) {
    const k = `${p.quality}\u0000${p.name}`
    if (seen.has(k)) ids.add(p.id)
    seen.add(k)
  }
  return ids
})

// Inspection: a click (or keyboard focus) pins a perk; hover only previews
// while nothing is pinned. Hold ids, not perks, so the panel follows live
// corrections (and closes if the inspected perk is removed).
const pinnedId = ref(null)
const hoverId = ref(null)
const inspectedId = computed(() => pinnedId.value ?? hoverId.value)
const live = computed(() => perks.value.find((p) => p.id === inspectedId.value) || null)
// While the edit panel is in use (a form open, a save in flight, an error on
// show) the inspected perk never changes under it, and it stays shown from
// its last snapshot even if an optimistic remove took it out of the tree —
// so a refused remove can still show its error once the rollback lands.
const panelActive = ref(false)
const lastSeen = ref(null)
watch(live, (p) => {
  if (p) lastSeen.value = p
})
const inspected = computed(() => live.value || (panelActive.value && canEdit.value ? lastSeen.value : null))
// The panel unmounts without a word when edit rights go; don't stay locked.
watch(canEdit, (v) => {
  if (!v) panelActive.value = false
})
// Clear stale pin when the pinned perk is removed and the panel returns to idle.
watch(
  () => [perks.value, pinnedId.value, panelActive.value],
  ([p, pinned, active]) => {
    if (!active && pinned && !p.find((x) => x.id === pinned)) {
      pinnedId.value = null
    }
  }
)
function onPanelState(s) {
  panelActive.value = s !== 'idle'
  if (panelActive.value) pinnedId.value = inspectedId.value
}
function preview(p) {
  if (!panelActive.value) hoverId.value = p.id
}
function pin(p) {
  if (!panelActive.value) pinnedId.value = p.id
}
function unpin() {
  pinnedId.value = null
  hoverId.value = null
  panelActive.value = false
}
function toggle(p) {
  planner.toggleWeaponPerk(treeKey.value, p.id, props.data.budget ?? 10, perkIds.value)
  pin(p)
}
</script>

<template>
  <div class="wtree">
    <div class="wtree-tools">
      <label class="wtree-budget">
        <span>Perk-point budget</span>
        <input
          type="number"
          min="1"
          max="40"
          :value="budget"
          @change="planner.setWeaponBudget(treeKey, $event.target.value)"
        />
      </label>
      <span class="wtree-pts" :class="{ full }">{{ used }} / {{ budget }} points</span>
      <button class="wtree-reset" @click="planner.resetWeaponTree(treeKey)">Reset tree</button>
    </div>

    <div class="wtree-scroll">
      <div class="wtree-grid">
        <section v-for="t in tiers" :key="t.quality" class="wtier" :data-q="slug(t.quality)">
          <div class="wtier-head">
            {{ t.quality }}
            <button v-if="canEdit" type="button" class="wtier-add" :aria-label="`Add a perk to ${t.quality}`" @click="adding = t.quality">+</button>
          </div>
          <div class="wtier-nodes">
            <button
              v-for="p in t.perks"
              :key="p.id"
              class="wnode rm-fade"
              :class="{ on: selected[p.id], dim: !selected[p.id] && full }"
              @click="toggle(p)"
              @mouseenter="preview(p)"
              @focus="pin(p)"
            >
              <span class="wnode-dot" />
              <span class="wnode-name">{{ p.name }}</span>
              <span v-if="p.corrected" class="wnode-fix" aria-label="Corrected in game" />
            </button>
          </div>
        </section>
      </div>
    </div>

    <div v-if="inspected" class="wdetail" :data-q="slug(inspected.quality)">
      <div class="wdetail-top">
        <span class="stud wdetail-stud" aria-hidden="true"></span>
        <span class="wdetail-q">{{ inspected.quality }}</span>
        <strong class="wdetail-name">{{ inspected.name }}</strong>
        <span
          v-if="inspected.corrected"
          class="corrected-tag"
          :title="`Corrected from an in-game check · ${correctedOn(inspected)}`"
        >
          Corrected in game · {{ correctedOn(inspected) }}
        </span>
        <button type="button" class="wdetail-close" aria-label="Close perk details" @click="unpin">×</button>
      </div>
      <p class="wdetail-desc">{{ inspected.description }}</p>
      <!-- inspected is derived from the live perks, so it refreshes (or
           clears) itself after a save; no @done handler needed. -->
      <template v-if="canEdit">
        <PerkEditPanel
          v-if="!laterDuplicates.has(inspected.id)"
          :key="inspected.id"
          kind="weapon"
          :target="weapon"
          :quality="inspected.quality"
          :perk="{ name: inspected.name, description: inspected.description }"
          @state="onPanelState"
        />
        <p v-else class="wdetail-dup">Duplicate name — edit the first one in this tier.</p>
      </template>
    </div>

    <div v-if="adding && canEdit" class="wdetail" :data-q="slug(adding)">
      <div class="wdetail-top">
        <span class="stud wdetail-stud" aria-hidden="true"></span>
        <span class="wdetail-q">{{ adding }}</span>
        <strong class="wdetail-name">Add a perk</strong>
      </div>
      <PerkEditPanel kind="weapon" :target="weapon" :quality="adding" :perk="null" :suggestions="suggestions" @done="adding = null" />
    </div>
  </div>
</template>

<style scoped>
.wtree-tools {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.wtree-budget {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.wtree-budget input {
  width: 4rem;
  background: color-mix(in srgb, var(--color-obsidian) 70%, transparent);
  border: 1px solid var(--color-ash);
  color: var(--color-bone);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.5rem;
  font-size: var(--text-md);
}
.wtree-pts {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--color-gold);
  font-size: var(--text-md);
}
.wtree-pts.full {
  color: var(--color-ember);
}
.wtree-reset {
  margin-left: auto;
  min-height: var(--tap);
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--text-xs);
  color: var(--color-smoke);
  background: transparent;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-sm);
  padding: 0.4rem 0.7rem;
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .wtree-reset:hover {
    color: var(--color-bone);
    border-color: var(--color-ash-2);
  }
}
.wtree-reset:active {
  transform: scale(0.97);
}

.wtree-scroll {
  overflow-x: auto;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-pitch) 40%, transparent);
  padding: 1rem;
}
.wtree-grid {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(11rem, 1fr);
  gap: 0.8rem;
  min-width: max-content;
}
.wtier-head {
  text-align: center;
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 0.08em;
  font-size: var(--text-xs);
  padding: 0.35rem;
  margin-bottom: 0.6rem;
  border-radius: var(--radius-md);
  color: var(--color-basalt);
}
.wtier-add {
  margin-left: 0.4rem;
  border: 0;
  background: color-mix(in srgb, var(--color-basalt) 35%, transparent);
  color: inherit;
  border-radius: var(--radius-sm);
  width: 1.2rem;
  cursor: pointer;
  font-weight: 800;
  transition: transform var(--dur-press) var(--ease-forge);
}
.wtier-add:active {
  transform: scale(0.97);
}
.wtier[data-q='standard'] .wtier-head {
  background: var(--color-smoke);
}
.wtier[data-q='master-crafted'] .wtier-head {
  background: var(--color-drake);
}
.wtier[data-q='artificer'] .wtier-head {
  background: var(--color-cobalt);
}
.wtier[data-q='relic'] .wtier-head {
  background: var(--color-violet);
}
.wtier[data-q='heroic'] .wtier-head {
  background: var(--color-gold);
}
.wtier-nodes {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.wnode {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-align: left;
  padding: 0.55rem 0.6rem;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-basalt-2) 50%, transparent);
  color: var(--color-pewter);
  font-size: var(--text-sm);
  line-height: 1.2;
  cursor: pointer;
  transition:
    transform var(--dur-press) var(--ease-forge),
    color var(--dur-state) var(--ease-forge),
    background-color var(--dur-state) var(--ease-forge),
    border-color var(--dur-state) var(--ease-forge),
    box-shadow var(--dur-state) var(--ease-forge),
    opacity var(--dur-state) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .wnode:hover {
    border-color: var(--color-ash-2);
    color: var(--color-bone);
  }
}
.wnode:active:not(.dim) {
  transform: scale(0.97);
}
.wnode-dot {
  flex: none;
  width: 10px;
  height: 10px;
  transform: rotate(45deg);
  background: var(--color-ash-2);
}
.wtier[data-q='standard'] .wnode-dot {
  background: var(--color-smoke);
}
.wtier[data-q='master-crafted'] .wnode-dot {
  background: var(--color-drake);
}
.wtier[data-q='artificer'] .wnode-dot {
  background: var(--color-cobalt);
}
.wtier[data-q='relic'] .wnode-dot {
  background: var(--color-violet);
}
.wtier[data-q='heroic'] .wnode-dot {
  background: var(--color-gold);
}
.wnode.on {
  color: var(--color-bone);
  border-color: var(--color-ember);
  background: color-mix(in srgb, var(--color-ember) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-ember) 35%, transparent);
}
.wnode.dim {
  opacity: 0.4;
  cursor: not-allowed;
}

.wdetail {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-basalt-2) 40%, transparent);
}
/* The quality sits in the stud before its label, not in a side border. */
.wdetail-stud {
  position: relative;
  top: -1px; /* baseline nudge: sits the diamond on the label's caps */
  color: var(--color-ash-2);
}
.wdetail[data-q='standard'] .wdetail-stud {
  color: var(--color-smoke);
}
.wdetail[data-q='master-crafted'] .wdetail-stud {
  color: var(--color-drake);
}
.wdetail[data-q='artificer'] .wdetail-stud {
  color: var(--color-cobalt);
}
.wdetail[data-q='relic'] .wdetail-stud {
  color: var(--color-violet);
}
.wdetail[data-q='heroic'] .wdetail-stud {
  color: var(--color-gold);
}
.wdetail-top {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin-bottom: 0.3rem;
}
.wdetail-q {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-pewter);
}
.wdetail-name {
  font-family: var(--font-display);
  text-transform: uppercase;
  color: var(--color-bone);
  font-size: var(--text-base);
}
.wdetail-desc {
  color: var(--color-pewter);
  font-size: var(--text-sm);
  line-height: 1.5;
}
.corrected-tag {
  margin-left: auto;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-gold);
  border: 1px solid color-mix(in srgb, var(--color-gold) 45%, transparent);
  border-radius: var(--radius-sm);
  padding: 0.1rem 0.35rem;
}
.wdetail-close {
  margin-left: auto;
  align-self: center;
  border: 1px solid var(--color-ash);
  background: transparent;
  color: var(--color-smoke);
  border-radius: var(--radius-sm);
  width: 1.4rem;
  height: 1.4rem;
  min-width: var(--tap);
  min-height: var(--tap);
  line-height: 1;
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .wdetail-close:hover {
    color: var(--color-bone);
    border-color: var(--color-ash-2);
  }
}
.wdetail-close:active {
  transform: scale(0.97);
}
.corrected-tag + .wdetail-close {
  margin-left: 0.4rem;
}
.wdetail-dup {
  margin-top: 0.7rem;
  font-size: var(--text-sm);
  color: var(--color-smoke);
}
.wnode-fix {
  margin-left: auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-gold);
}
</style>
