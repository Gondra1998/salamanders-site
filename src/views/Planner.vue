<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlanner, CLASS_NAMES, MAX_PRESTIGE } from '../stores/planner'
import { useAuth } from '../stores/auth'
import { usePerkCorrections } from '../stores/perkCorrections'
import * as buildsApi from '../lib/buildsApi'
import { createLongPress } from '../lib/longPress'
import { perkStateKey } from '../lib/perkStateKey'
import WeaponSlot from '../components/WeaponSlot.vue'
import PerkEditPanel from '../components/PerkEditPanel.vue'
import StaleNotice from '../components/StaleNotice.vue'
import PageHeader from '../components/PageHeader.vue'

const planner = usePlanner()
const auth = useAuth()
const corrections = usePerkCorrections()
const route = useRoute()
const router = useRouter()

const CAT_LABEL = ['Core', 'Core', 'Core', 'Team', 'Gear', 'Gear', 'Gear', 'Signature']
const slots = [
  { key: 'primary', label: 'Primary Weapon' },
  { key: 'secondary', label: 'Secondary Weapon' },
  { key: 'melee', label: 'Melee Weapon' },
]

function initials(name) {
  const w = (name || '').replace(/[",]/g, '').trim().split(/\s+/)
  return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase()
}

// Floating popout: read-only preview, follows whatever's hovered/focused.
const hovered = ref(null)
const popoutBelow = ref(false)
const popoutStyle = ref({})
function showPopout(perk, el) {
  hovered.value = perk
  const rect = el.getBoundingClientRect()
  const half = 150 // half the popout's ~300px width, for clamping
  const left = Math.min(Math.max(rect.left + rect.width / 2, half + 12), window.innerWidth - half - 12)
  // Not enough headroom above (near the top of the viewport) — flip below instead.
  popoutBelow.value = rect.top < 200
  const top = popoutBelow.value ? rect.bottom + 12 : rect.top - 10
  popoutStyle.value = { left: `${left}px`, top: `${top}px` }
}
function hidePopout() {
  hovered.value = null
}
// Touch has no hover: press and hold a perk to open the popout (iOS Safari
// neither emulates hover for a held finger nor focuses a tapped button).
let pressedPerk = null
const hold = createLongPress((el) => showPopout(pressedPerk, el))
function onPerkDown(perk, evt) {
  pressedPerk = perk
  hold.down(evt)
}
// A held popout has no mouseleave to close it; the next touch anywhere does.
function dismissHeldPopout(evt) {
  if (evt.pointerType === 'touch') hidePopout()
}
const hoveredText = computed(() =>
  hovered.value ? corrections.describe(planner.activeClass, hovered.value.name) : '',
)
const hoveredCorrected = computed(() =>
  hovered.value ? !!corrections.classPerks(planner.activeClass)[hovered.value.name]?.corrected : false,
)
const hoveredWhy = computed(() => {
  const p = hovered.value
  if (!p || planner.selected[p.col] !== p.name) return ''
  return planner.justified[p.col] || ''
})

// Authoring box: pinned to whichever perk was last clicked into the build,
// not whatever's hovered — hovering to compare picks shouldn't steal focus
// away from the reasoning you're mid-sentence writing.
const editingCol = ref(null)
const editingPerk = computed(() => {
  if (editingCol.value == null) return null
  const name = planner.selected[editingCol.value]
  if (!name) return null
  return planner.columns[editingCol.value].perks.find((p) => p.name === name) || null
})
const justificationDraft = ref('')
watch(editingPerk, (p) => {
  justificationDraft.value = p ? planner.justified[p.col] || '' : ''
})
function saveJustification() {
  if (editingPerk.value) planner.setJustification(editingPerk.value.col, justificationDraft.value)
}

const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }

// Save-to-library, inline in the build panel.
const saveDetails = ref(false)
const saveForm = ref({ title: '', role: '', notes: '' })
const saving = ref(false)

// Enter in the build-name field and a click on "Save to library" both submit
// the same form — nothing stopped both firing seconds apart (Enter, then an
// unsure click right after) and writing two near-identical entries. `saving`
// covers the request itself; the timestamp still catches a second submit
// fired before the first request has even started.
let lastSave = 0
async function submitSave() {
  if (!auth.signedIn) {
    flash('Sign in with Discord to save a build')
    auth.signIn()
    return
  }
  const now = Date.now()
  if (saving.value || now - lastSave < 600) return
  lastSave = now
  saving.value = true
  try {
    const name = saveForm.value.title.trim() || `${planner.activeClass} Build`
    await buildsApi.createBuild(planner.buildSnapshot(saveForm.value), auth.token)
    saveForm.value = { title: '', role: '', notes: '' }
    saveDetails.value = false
    flash(`Saved “${name}” to the Builds gallery`)
  } catch (err) {
    flash(err.message || 'Could not save the build — try again')
  } finally {
    saving.value = false
  }
}

// Weapon perks picked for the weapon currently in a given slot.
function weaponPerkCount(slotKey) {
  const key = perkStateKey(slotKey, planner.activeWeapons[slotKey])
  return key ? planner.weaponUsed(key) : 0
}

const isSelected = (perk) => planner.selected[perk.col] === perk.name

// Every picked perk needs a reason before the build goes to the library (the
// server enforces the same rule). Listed so the author can jump to each one.
const unexplained = computed(() =>
  planner.columns
    .filter((c) => planner.selected[c.col] && !(planner.justified[c.col] || '').trim())
    .map((c) => ({ col: c.col, name: planner.selected[c.col] })),
)
function explain(col) {
  editingCol.value = col
  nextTick(() => document.getElementById(`why-${col}`)?.focus())
}

function onPerk(perk) {
  if (hold.consumeClick()) return
  if (perk.level > planner.level) return
  planner.togglePerk(perk)
  editingCol.value = planner.selected[perk.col] === perk.name ? perk.col : null
}

// Toast
const toast = ref('')
const toastUndo = ref(false)
let toastTimer
function flash(msg) {
  toast.value = msg
  toastUndo.value = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 1800)
}
// A reset is one slip away from wiping a build, so it offers an Undo for a while. The store
// remembers the reset (from this page's button or the nav's Perk Builder link), so a reset made
// just before arriving here is offered too.
const UNDO_MS = 8000
function offerUndo() {
  toast.value = 'Build reset'
  toastUndo.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
    toastUndo.value = false
    planner.discardUndo()
  }, UNDO_MS)
}
function undoReset() {
  planner.restoreReset()
  flash('Build restored')
}
watch(
  () => planner.undoReset,
  (undo) => {
    if (!undo) return
    if (Date.now() - undo.at < UNDO_MS) offerUndo()
    else planner.discardUndo()
  },
  { immediate: true },
)
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const t = document.createElement('textarea')
    t.value = text
    document.body.appendChild(t)
    t.select()
    document.execCommand('copy')
    t.remove()
  }
}
async function copyBuild() {
  await copy(planner.buildText())
  flash('Build copied to clipboard')
}
async function shareBuild() {
  const b = planner.encode()
  await router.replace({ query: { ...route.query, b } })
  await copy(window.location.href)
  flash('Share link copied')
}

onMounted(() => {
  window.addEventListener('pointerdown', dismissHeldPopout, true)
  planner.hydrate()
  if (route.query.b) planner.applyEncoded(String(route.query.b))
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', dismissHeldPopout, true)
  hold.cancel()
})
</script>

<template>
  <section class="planner">
    <PageHeader eyebrow="Doctrine" title="Perk Builder" />

    <!-- Class selector -->
    <div class="classbar" role="tablist" aria-label="Classes">
      <button
        v-for="name in CLASS_NAMES"
        :key="name"
        class="class-tab tab-forge rm-fade"
        :class="{ on: planner.activeClass === name }"
        role="tab"
        :aria-selected="planner.activeClass === name"
        @click="planner.setClass(name)"
      >
        {{ name }}
      </button>
    </div>

    <StaleNotice :notices="planner.activeStaleNotices" @dismiss="planner.dismissStaleNotices()" />

    <!-- Class hero -->
    <div class="hero-card">
      <div class="hero-id">
        <span class="emblem">{{ initials(planner.activeClass) }}</span>
        <div>
          <h2 class="hero-name">
            {{ planner.activeClass }}
            <span class="hero-ability">• {{ planner.meta.ability }}</span>
          </h2>
          <p class="hero-desc">{{ planner.meta.description }}</p>
        </div>
      </div>
    </div>

    <div class="layout">
      <!-- Perk tree -->
      <div class="tree-wrap">
        <div class="tree-scroll">
          <div class="perk-grid">
            <section
              v-for="c in planner.columns"
              :key="c.col"
              class="perk-col"
              :class="{ picked: !!planner.selected[c.col] }"
              :data-cat="c.cat"
            >
              <div class="perk-col-head">{{ c.head }}</div>
              <div class="perk-list">
                <button
                  v-for="perk in c.perks"
                  :key="perk.level"
                  class="perk rm-fade"
                  :data-cat="perk.cat"
                  :class="{ selected: isSelected(perk), locked: perk.level > planner.level }"
                  :disabled="perk.level > planner.level"
                  @click="onPerk(perk)"
                  @mouseenter="showPopout(perk, $event.currentTarget)"
                  @mouseleave="hidePopout"
                  @focus="showPopout(perk, $event.currentTarget)"
                  @blur="hidePopout"
                  @pointerdown="onPerkDown(perk, $event)"
                  @pointerup="hold.cancel"
                  @pointercancel="hold.cancel"
                >
                  <span v-if="perk.level > planner.level" class="lock">LV {{ perk.level }}</span>
                  <span v-if="isSelected(perk)" class="pick-mark" aria-hidden="true" />
                  <span class="perk-icon">{{ initials(perk.name) }}</span>
                  <span class="perk-name">{{ perk.name }}</span>
                </button>
              </div>
            </section>
          </div>
        </div>

        <!-- Reasoning: pinned to the last perk you clicked into the build, so
             readers hovering it later can see why you picked it. -->
        <div v-if="editingPerk" class="perk-author" :data-cat="editingPerk.cat">
          <span class="pa-icon">{{ initials(editingPerk.name) }}</span>
          <div class="pa-body">
            <p class="pa-name">
              {{ editingPerk.name }}
              <span class="pa-meta">selected · column {{ editingPerk.col + 1 }}</span>
            </p>
            <label class="pa-label" :for="`why-${editingPerk.col}`">Why this pick?</label>
            <textarea
              :id="`why-${editingPerk.col}`"
              v-model="justificationDraft"
              class="pa-field"
              maxlength="1000"
              rows="2"
              placeholder="What does this add to the build? When do you lean on it?"
              @blur="saveJustification"
            />
            <PerkEditPanel
              v-if="corrections.canEdit"
              :key="editingPerk.name"
              kind="class"
              :target="planner.activeClass"
              :perk="{ name: editingPerk.name, description: corrections.describe(planner.activeClass, editingPerk.name) }"
            />
          </div>
        </div>
        <p v-else class="perk-author-empty">
          Pick a perk above to write down why it's in the build — readers see it on hover.
        </p>
      </div>

      <!-- Floating preview: wiki text plus the creator's reasoning, anchored
           to whatever perk is currently hovered or focused. -->
      <Teleport to="body">
        <div
          v-if="hovered"
          class="perk-popout"
          :class="{ below: popoutBelow }"
          :style="popoutStyle"
          :data-cat="hovered.cat"
        >
          <p class="pp-name">{{ hovered.name }}</p>
          <p class="pp-meta">
            {{ CAT_LABEL[hovered.col] }} · Column {{ hovered.col + 1 }} · Unlocks at level
            {{ hovered.level }}
          </p>
          <p v-if="hoveredCorrected" class="pp-fixed">Corrected in game</p>
          <p v-if="hoveredText" class="pp-desc">{{ hoveredText }}</p>
          <p v-else class="pp-desc pp-empty">
            No description on the wiki yet. Re-run the perk bake after the next patch.
          </p>
          <div v-if="hoveredWhy" class="pp-why">
            <span class="pp-why-label">Why the creator picked it</span>
            <p>{{ hoveredWhy }}</p>
          </div>
        </div>
      </Teleport>

      <!-- Build panel -->
      <aside class="build">
        <div class="build-head">
          <h3>Your Build</h3>
          <span class="build-count">{{ planner.build.count }} / 8</span>
        </div>
        <div class="build-list">
          <div v-for="s in planner.build.slots" :key="s.label" class="build-row" :data-cat="s.cat">
            <span class="mini">{{ s.name ? initials(s.name) : '—' }}</span>
            <div>
              <div class="build-label">{{ s.label }}</div>
              <div class="build-name" :class="{ empty: !s.name }">
                {{ s.name || 'No perk selected' }}
              </div>
            </div>
          </div>
        </div>

        <div class="build-summary">
          <p class="bs-line"><strong>{{ planner.build.ability }}</strong></p>
          <p class="bs-line">Starting: {{ planner.build.starting }}</p>
          <p v-if="planner.activePrestige" class="bs-line">
            Prestige {{ planner.activePrestige }} ·
            {{ planner.activePrestigePicks.length }}/{{ planner.activePrestige }} perks
          </p>
          <p v-if="planner.activePrestigePicks.length" class="bs-line bs-picks">
            {{ planner.activePrestigePicks.join(', ') }}
          </p>
        </div>

        <div class="build-gear">
          <div v-for="s in slots" :key="s.key" class="bg-row">
            <span class="bg-slot">{{ s.label.replace(' Weapon', '') }}</span>
            <span class="bg-name" :class="{ empty: !planner.build.weapons[s.key] }">
              {{ planner.build.weapons[s.key] || 'None selected' }}
            </span>
            <span v-if="weaponPerkCount(s.key)" class="bg-pts">
              +{{ weaponPerkCount(s.key) }}
            </span>
          </div>
        </div>

        <!-- Save where the build is made. Name stays visible so it's obvious the
             build gets a name, rather than hiding behind the button. -->
        <form class="save" @submit.prevent="submitSave">
          <label class="save-label" for="build-name">Build name</label>
          <input
            id="build-name"
            v-model="saveForm.title"
            class="fld"
            maxlength="200"
            type="text"
            :placeholder="`${planner.activeClass} build`"
          />

          <button
            v-if="!saveDetails"
            type="button"
            class="save-more"
            @click="saveDetails = true"
          >
            + Add role and notes
          </button>
          <template v-else>
            <input
              v-model="saveForm.role"
              class="fld"
              maxlength="200"
              type="text"
              placeholder="Role (e.g. Frontline)"
              aria-label="Role"
            />
            <textarea
              v-model="saveForm.notes"
              class="fld"
              maxlength="2000"
              rows="2"
              placeholder="Notes — how it plays, when to use it"
              aria-label="Notes"
            />
          </template>

          <div v-if="unexplained.length" class="save-needs" role="status">
            <p>Explain every pick before saving — readers see your reasons on hover:</p>
            <button
              v-for="u in unexplained"
              :key="u.col"
              type="button"
              class="save-needs-pick"
              @click="explain(u.col)"
            >
              {{ u.name }}
            </button>
          </div>
          <button type="submit" class="btn-ember btn-sm save-go" :disabled="saving || unexplained.length > 0">
            {{ saving ? 'Saving…' : 'Save to library' }}
          </button>
        </form>

        <div class="build-actions">
          <button class="btn-drake btn-sm" @click="copyBuild">Copy build</button>
          <button class="btn-drake btn-sm" @click="shareBuild">Share link</button>
          <button class="btn-ghost btn-sm" @click="planner.resetClass()">Reset</button>
        </div>
      </aside>
    </div>

    <!-- Loadout: weapons and their perk trees, so a build is complete in one place. -->
    <section class="loadout">
      <div class="lo-head">
        <div>
          <p class="eyebrow">Wargear</p>
          <h2 class="lo-title">Loadout</h2>
        </div>
        <p class="lo-note">
          Pick a weapon per slot, then open its tree to spend perk points. Trees come from
          the wiki and are cached for a day.
        </p>
      </div>
      <WeaponSlot v-for="s in slots" :key="s.key" :slot="s.key" :label="s.label" />
    </section>

    <!-- Prestige perks: earned past level 25, so they sit outside the 8-column grid. -->
    <section class="prestige">
      <div class="pr-head">
        <div>
          <p class="eyebrow">Past the anvil</p>
          <h2 class="pr-title">Prestige Perks</h2>
        </div>
        <div class="pr-meta">
          <span class="pr-count" :class="{ full: planner.prestigePicksLeft === 0 && planner.activePrestige > 0 }">
            {{ planner.activePrestigePicks.length }} / {{ planner.activePrestige }} picked
          </span>
          <p class="pr-note">One perk per prestige rank, up to {{ MAX_PRESTIGE }} total.</p>
        </div>
      </div>

      <!-- One slot per rank: this is the real shape of the mechanic. -->
      <ol class="pr-ranks">
        <li
          v-for="s in planner.prestigeSlots"
          :key="s.rank"
          class="pr-rank"
          :class="{ locked: !s.unlocked, filled: !!s.perk }"
        >
          <span class="pr-rank-mark">{{ ROMAN[s.rank] }}</span>
          <div class="pr-rank-body">
            <p class="pr-rank-label">Prestige {{ s.rank }}</p>
            <p v-if="s.perk" class="pr-rank-perk">{{ s.perk.name }}</p>
            <p v-else class="pr-rank-perk empty">
              {{ s.unlocked ? 'Choose a perk below' : 'Not reached' }}
            </p>
          </div>
          <button
            v-if="s.perk"
            class="pr-rank-clear"
            :aria-label="`Clear the Prestige ${s.rank} perk`"
            @click="planner.clearPrestigeSlot(s.rank)"
          >
            ×
          </button>
        </li>
      </ol>

      <p class="pr-pool-label">
        Seven perks per class · pick one each time you prestige
      </p>
      <div class="pr-grid">
        <button
          v-for="p in planner.prestigePool"
          :key="p.name"
          type="button"
          class="pr-card rm-fade"
          :class="{ picked: p.picked }"
          :disabled="p.disabled"
          :aria-pressed="p.picked"
          @click="planner.togglePrestigePerk(p.name)"
        >
          <span v-if="p.picked" class="pr-mark" aria-hidden="true" />
          <h3 class="pr-name">{{ p.name }}</h3>
          <p class="pr-desc">{{ p.description }}</p>
        </button>
      </div>
    </section>

    <transition name="toast">
      <div v-if="toast" class="toast" role="status">
        {{ toast }}
        <button v-if="toastUndo" type="button" class="toast-undo" @click="undoReset">Undo</button>
      </div>
    </transition>
  </section>
</template>

<style scoped>
.planner {
  max-width: 78rem;
  margin: 0 auto;
  padding: 4rem 1.5rem 2rem;
}

/* class selector */
.classbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 1.6rem 0 1.4rem;
}

/* class hero */
.hero-card {
  display: inline-flex;
  max-width: 100%;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-pitch) 50%, transparent);
  padding: 1.4rem;
}
.hero-id {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.emblem {
  flex: none;
  display: grid;
  place-items: center;
  width: 3.4rem;
  height: 3.4rem;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--color-drake);
  background: color-mix(in srgb, var(--color-drake) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-drake) 30%, transparent);
  clip-path: polygon(15% 0, 85% 0, 100% 50%, 85% 100%, 15% 100%, 0 50%);
}
.hero-name {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  font-size: var(--text-xl);
  color: var(--color-bone);
}
.hero-ability {
  font-family: var(--font-sans);
  text-transform: none;
  font-size: var(--text-sm);
  color: var(--color-gold);
  font-weight: 500;
}
.hero-desc {
  color: var(--color-pewter);
  line-height: 1.55;
  margin-top: 0.3rem;
  max-width: 44ch;
  font-size: var(--text-md);
}
/* layout */
.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.2rem;
  margin-top: 1.2rem;
}
@media (min-width: 980px) {
  .layout {
    grid-template-columns: 1fr 20rem;
    align-items: start;
  }
}

/* perk tree */
/* Grid items default to min-width:auto, so the 900px tree below would stretch
   this column and push the whole page sideways on narrow screens. */
.tree-wrap {
  min-width: 0;
}
.tree-scroll {
  overflow-x: auto;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-pitch) 40%, transparent);
  padding: 1.2rem 1rem 0.5rem;
}
.perk-grid {
  min-width: 640px;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 0.4rem;
}
.perk-col {
  position: relative;
}
.perk-col-head {
  position: relative;
  text-align: center;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--color-cobalt);
  margin-bottom: 0.8rem;
  padding-bottom: 0.4rem;
}
/* A column with a pick lights its head — read your whole build across the tree. */
.perk-col.picked .perk-col-head::after {
  content: '';
  position: absolute;
  left: 15%;
  right: 15%;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-ember), transparent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--color-ember) 70%, transparent);
}
.perk-col[data-cat='team'] .perk-col-head {
  color: var(--color-drake);
}
.perk-col[data-cat='gear'] .perk-col-head {
  color: var(--color-gold);
}
.perk-col[data-cat='signature'] .perk-col-head {
  color: var(--color-violet);
}
.perk-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.perk {
  position: relative;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  min-height: 118px;
  padding: 0.5rem 0.25rem;
  text-align: center;
  cursor: pointer;
  transition:
    transform var(--dur-press) var(--ease-forge),
    border-color var(--dur-state) var(--ease-forge),
    background-color var(--dur-state) var(--ease-forge),
    box-shadow var(--dur-state) var(--ease-forge),
    opacity var(--dur-state) var(--ease-forge);
  /* Holding a perk opens its popout; keep iOS's callout and text selection out of the way. */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
@media (hover: hover) and (pointer: fine) {
  .perk:hover:not(:disabled) {
    border-color: var(--color-ash-2);
    background: color-mix(in srgb, var(--color-bone) 2%, transparent);
  }
}
.perk:active:not(:disabled) {
  transform: scale(0.97);
}
.perk.locked {
  cursor: not-allowed;
  opacity: 0.45;
}
.perk-icon {
  width: 54px;
  height: 54px;
  margin: 0 auto 0.5rem;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-md);
  color: var(--color-bone);
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-cobalt) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-cobalt) 22%, var(--color-obsidian))
  );
}
.perk[data-cat='team'] .perk-icon {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-drake) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-drake) 22%, var(--color-obsidian))
  );
}
.perk[data-cat='gear'] .perk-icon {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-gold) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-gold) 22%, var(--color-obsidian))
  );
}
.perk[data-cat='signature'] .perk-icon {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-violet) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-violet) 22%, var(--color-obsidian))
  );
}
/* Selected reads as forged: lit card, ember ring, gold name, diamond marker. */
.perk.selected {
  border-color: var(--color-ember);
  background: color-mix(in srgb, var(--color-ember) 12%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--color-ember) 35%, transparent),
    0 0 22px -6px color-mix(in srgb, var(--color-ember) 55%, transparent);
}
@media (hover: hover) and (pointer: fine) {
  .perk.selected:hover:not(:disabled) {
    border-color: var(--color-ember);
    background: color-mix(in srgb, var(--color-ember) 16%, transparent);
  }
}
/* clip-path clips box-shadow away, which is why the old ember ring never showed.
   drop-shadow follows the clipped hex silhouette. */
.perk.selected .perk-icon {
  filter: drop-shadow(0 0 7px color-mix(in srgb, var(--color-ember) 85%, transparent));
}
.pick-mark {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 9px;
  height: 9px;
  transform: rotate(45deg);
  background: linear-gradient(180deg, var(--color-ember-light), var(--color-ember));
  box-shadow: 0 0 10px color-mix(in srgb, var(--color-ember) 80%, transparent);
}
.perk-name {
  display: block;
  font-size: var(--text-xs);
  line-height: 1.2;
  color: var(--color-pewter);
}
.perk.selected .perk-name {
  color: var(--color-gold);
  font-weight: 600;
}
.lock {
  position: absolute;
  top: 4px;
  right: 4px;
  font-family: var(--font-mono);
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-gold);
  border: 1px solid color-mix(in srgb, var(--color-gold) 40%, transparent);
  border-radius: var(--radius-sm);
  padding: 0 3px;
}
/* perk authoring — the dead space under the tree becomes a workspace for
   whichever perk was last clicked into the build. */
.perk-author {
  display: flex;
  gap: 0.9rem;
  margin-top: 0.9rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-basalt-2) 40%, transparent);
}
.pa-icon {
  flex: none;
  width: 3rem;
  height: 3rem;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--color-bone);
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-cobalt) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-cobalt) 22%, var(--color-obsidian))
  );
}
.perk-author[data-cat='team'] .pa-icon {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-drake) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-drake) 22%, var(--color-obsidian))
  );
}
.perk-author[data-cat='gear'] .pa-icon {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-gold) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-gold) 22%, var(--color-obsidian))
  );
}
.perk-author[data-cat='signature'] .pa-icon {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-violet) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-violet) 22%, var(--color-obsidian))
  );
}
.pa-body {
  flex: 1;
  min-width: 0;
}
.pa-name {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  color: var(--color-bone);
  font-size: var(--text-base);
}
.pa-meta {
  font-family: var(--font-mono);
  text-transform: none;
  font-weight: 400;
  font-size: max(var(--text-xs), var(--text-floor));
  letter-spacing: 0.06em;
  color: var(--color-gold);
}
.pa-label {
  display: block;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
  margin: 0.5rem 0 0.3rem;
}
.pa-field {
  width: 100%;
  background: color-mix(in srgb, var(--color-obsidian) 70%, transparent);
  border: 1px solid var(--color-ash);
  color: var(--color-bone);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.6rem;
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  line-height: 1.4;
  resize: vertical;
}
.pa-field::placeholder {
  color: var(--color-faint);
}
.perk-author-empty {
  margin-top: 0.9rem;
  padding: 0.9rem 1rem;
  border: 1px dashed var(--color-ash);
  border-radius: var(--radius-md);
  text-align: center;
  color: var(--color-smoke);
  font-size: var(--text-sm);
}

/* floating popout — read-only preview, anchored to the hovered/focused hex */
.perk-popout {
  position: fixed;
  transform: translate(-50%, calc(-100% - 12px));
  width: min(90vw, 300px);
  z-index: 95;
  pointer-events: none;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--color-ash-2);
  border-top: 2px solid var(--color-cobalt);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-obsidian) 96%, transparent);
  box-shadow: 0 16px 40px -12px color-mix(in srgb, var(--color-obsidian) 85%, transparent);
}
.perk-popout[data-cat='team'] {
  border-top-color: var(--color-drake);
}
.perk-popout[data-cat='gear'] {
  border-top-color: var(--color-gold);
}
.perk-popout[data-cat='signature'] {
  border-top-color: var(--color-violet);
}
.perk-popout.below {
  transform: translate(-50%, 0);
}
.perk-popout::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 9px;
  height: 9px;
  transform: translateX(-50%) rotate(45deg);
  background: color-mix(in srgb, var(--color-obsidian) 96%, transparent);
  border-right: 1px solid var(--color-ash-2);
  border-bottom: 1px solid var(--color-ash-2);
}
.perk-popout.below::after {
  bottom: auto;
  top: -5px;
  border-right: none;
  border-bottom: none;
  border-left: 1px solid var(--color-ash-2);
  border-top: 1px solid var(--color-ash-2);
}
.pp-name {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  color: var(--color-bone);
  font-size: var(--text-base);
}
.pp-meta {
  font-family: var(--font-mono);
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-gold);
  margin: 0.15rem 0 0.4rem;
}
.pp-fixed {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-gold);
  margin: 0.2rem 0 0.3rem;
}
.pp-desc {
  color: var(--color-smoke);
  font-size: var(--text-sm);
  line-height: 1.4;
}
.pp-empty {
  font-style: italic;
}
.pp-why {
  margin-top: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-ash);
}
.pp-why-label {
  display: block;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-ember);
  margin-bottom: 0.2rem;
}
.pp-why p {
  color: var(--color-bone);
  font-size: var(--text-sm);
  line-height: 1.4;
}

/* build panel */
.build {
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-pitch) 60%, transparent);
  padding: 1.2rem;
  position: sticky;
  top: 5rem;
}
.build-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.9rem;
}
.build-head h3 {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  color: var(--color-bone);
}
.build-count {
  font-family: var(--font-mono);
  color: var(--color-gold);
  font-size: var(--text-sm);
}
.build-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.build-row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}
.mini {
  flex: none;
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-xs);
  color: var(--color-bone);
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-cobalt) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-cobalt) 22%, var(--color-obsidian))
  );
}
.build-row[data-cat='team'] .mini {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-drake) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-drake) 22%, var(--color-obsidian))
  );
}
.build-row[data-cat='gear'] .mini {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-gold) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-gold) 22%, var(--color-obsidian))
  );
}
.build-row[data-cat='signature'] .mini {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-violet) 45%, var(--color-obsidian)),
    color-mix(in srgb, var(--color-violet) 22%, var(--color-obsidian))
  );
}
.build-label {
  font-family: var(--font-mono);
  font-size: max(var(--text-xs), var(--text-floor));
  letter-spacing: 0.12em;
  color: var(--color-smoke);
}
.build-name {
  font-size: var(--text-sm);
  color: var(--color-bone);
}
.build-name.empty {
  color: var(--color-faint);
}
.build-summary {
  margin-top: 1rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--color-ash);
}
.bs-line {
  font-size: var(--text-sm);
  color: var(--color-smoke);
  line-height: 1.5;
}
.bs-line strong {
  color: var(--color-drake);
}
.bs-picks {
  color: var(--color-gold);
  font-size: var(--text-xs);
}
.build-gear {
  margin-top: 0.8rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--color-ash);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.bg-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.bg-slot {
  flex: none;
  width: 5rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.bg-name {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--color-bone);
  line-height: 1.3;
}
.bg-name.empty {
  color: var(--color-faint);
}
.bg-pts {
  flex: none;
  font-family: var(--font-mono);
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-ember);
  border: 1px solid color-mix(in srgb, var(--color-ember) 40%, transparent);
  border-radius: var(--radius-sm);
  padding: 1px 4px;
}
.save {
  margin-top: 1rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--color-ash);
  display: grid;
  gap: 0.4rem;
}
.save-label {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.save-more {
  justify-self: start;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-drake);
  background: transparent;
  border: 0;
  padding: 0.15rem 0;
  cursor: pointer;
  min-height: var(--tap);
  transition: transform var(--dur-press) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .save-more:hover {
    color: var(--color-bone);
  }
}
.save-more:active {
  transform: scale(0.97);
}
.save-go {
  justify-content: center;
  margin-top: 0.2rem;
}
.save-needs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: var(--text-xs);
  color: var(--color-smoke);
}
.save-needs p {
  width: 100%;
}
.save-needs-pick {
  font: inherit;
  font-size: var(--text-xs);
  color: var(--color-ember);
  background: transparent;
  border: 1px solid var(--color-ember);
  border-radius: var(--radius-sm);
  padding: 0.2rem 0.45rem;
  cursor: pointer;
  min-height: var(--tap);
  transition: transform var(--dur-press) var(--ease-forge);
}
.save-needs-pick:active {
  transform: scale(0.97);
}
.save .fld {
  width: 100%;
  background: color-mix(in srgb, var(--color-obsidian) 70%, transparent);
  border: 1px solid var(--color-ash);
  color: var(--color-bone);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.6rem;
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  min-height: var(--tap);
  resize: vertical;
}
.save .fld::placeholder {
  color: var(--color-faint);
}
.build-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.7rem;
}

/* loadout */
.loadout {
  margin-top: 2.6rem;
  padding-top: 2rem;
  border-top: 1px solid var(--color-ash);
}
.lo-head,
.pr-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.4rem;
}
.lo-title,
.pr-title {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  font-size: var(--text-xl);
  color: var(--color-bone);
  margin-top: 0.3rem;
}
.lo-note {
  max-width: 38ch;
  color: var(--color-smoke);
  font-size: var(--text-sm);
  line-height: 1.5;
}

/* prestige */
.prestige {
  margin-top: 2.6rem;
  padding-top: 2rem;
  border-top: 1px solid var(--color-ash);
}
.pr-meta {
  text-align: right;
}
.pr-count {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--color-gold);
}
.pr-count.full {
  color: var(--color-ember);
}
.pr-note {
  max-width: 34ch;
  color: var(--color-smoke);
  font-size: var(--text-sm);
  line-height: 1.5;
  margin-top: 0.2rem;
}
/* rank rail */
.pr-ranks {
  list-style: none;
  margin: 0 0 1.6rem;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.6rem;
}
.pr-rank {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-pitch) 50%, transparent);
}
.pr-rank.locked {
  opacity: 0.45;
}
.pr-rank.filled {
  border-color: color-mix(in srgb, var(--color-ember) 55%, transparent);
  background: color-mix(in srgb, var(--color-ember) 8%, transparent);
}
.pr-rank-body {
  min-width: 0;
}
.pr-rank-label {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.pr-rank-perk {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  font-size: var(--text-md);
  color: var(--color-gold);
  line-height: 1.15;
  margin-top: 0.15rem;
}
.pr-rank-perk.empty {
  font-family: var(--font-sans);
  text-transform: none;
  font-weight: 400;
  font-size: var(--text-sm);
  color: var(--color-faint);
}
.pr-rank-clear {
  margin-left: auto;
  flex: none;
  width: 1.4rem;
  height: 1.4rem;
  min-width: var(--tap);
  min-height: var(--tap);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: var(--text-base);
  color: var(--color-smoke);
  background: transparent;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .pr-rank-clear:hover {
    color: var(--color-bone);
    border-color: var(--color-ember);
  }
}
.pr-rank-clear:active {
  transform: scale(0.97);
}
.pr-pool-label {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
  margin-bottom: 0.6rem;
}
.pr-rank-mark {
  display: grid;
  place-items: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.4rem;
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.08em;
  font-size: var(--text-sm);
  color: var(--color-gold);
  border: 1px solid color-mix(in srgb, var(--color-gold) 45%, transparent);
  clip-path: polygon(15% 0, 85% 0, 100% 50%, 85% 100%, 15% 100%, 0 50%);
  background: color-mix(in srgb, var(--color-gold) 10%, transparent);
}
.pr-rank.locked .pr-rank-mark {
  color: var(--color-smoke);
  border-color: var(--color-ash);
  background: transparent;
}
.pr-rank.filled .pr-rank-mark {
  color: var(--color-ember);
  border-color: color-mix(in srgb, var(--color-ember) 50%, transparent);
  background: color-mix(in srgb, var(--color-ember) 12%, transparent);
}
.pr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0.7rem;
}
.pr-card {
  position: relative;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-pitch) 50%, transparent);
  padding: 0.9rem 1rem;
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition:
    transform var(--dur-press) var(--ease-forge),
    border-color var(--dur-state) var(--ease-forge),
    background-color var(--dur-state) var(--ease-forge),
    box-shadow var(--dur-state) var(--ease-forge),
    opacity var(--dur-state) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .pr-card:hover:not(:disabled) {
    border-color: var(--color-ash-2);
    background: color-mix(in srgb, var(--color-basalt-2) 70%, transparent);
  }
}
.pr-card:active:not(:disabled) {
  transform: scale(0.97);
}
.pr-card:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.pr-card.picked {
  border-color: var(--color-ember);
  background: color-mix(in srgb, var(--color-ember) 12%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--color-ember) 35%, transparent),
    0 0 22px -6px color-mix(in srgb, var(--color-ember) 55%, transparent);
  opacity: 1;
}
.pr-card.picked .pr-name {
  color: var(--color-gold);
}
.pr-mark {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 9px;
  height: 9px;
  transform: rotate(45deg);
  background: linear-gradient(180deg, var(--color-ember-light), var(--color-ember));
  box-shadow: 0 0 10px color-mix(in srgb, var(--color-ember) 80%, transparent);
}
.pr-name {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--color-bone);
  margin-bottom: 0.3rem;
}
.pr-desc {
  color: var(--color-pewter);
  font-size: var(--text-sm);
  line-height: 1.5;
}

/* toast */
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
  box-shadow: 0 10px 40px -8px color-mix(in srgb, var(--color-obsidian) 85%, transparent);
  display: flex;
  align-items: center;
  gap: 0.9rem;
}
/* The hit area grows into the toast's own padding, so the button is 44px tall without a fat toast. */
.toast-undo {
  min-height: 2.75rem;
  margin: -0.6rem -0.6rem -0.6rem 0;
  padding: 0 0.9rem;
  background: none;
  border: 0;
  color: var(--color-drake);
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
.toast-undo:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .toast-undo:hover {
    color: var(--color-bone);
  }
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

@media (max-width: 600px) {
  .planner {
    padding-top: 3rem;
  }
}
</style>
