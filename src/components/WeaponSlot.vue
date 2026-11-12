<script setup>
import { ref, computed, watch } from 'vue'
import { usePlanner } from '../stores/planner'
import { WIKI } from '../lib/wiki'
import { resolveWeapon, weaponLabel } from '../lib/weapons'
import { perkStateKey } from '../lib/perkStateKey'
import WeaponTree from './WeaponTree.vue'

/**
 * One weapon slot in the Perk Builder loadout: choose the weapon, then spend its
 * perk points inline. The tree data is the same wiki-backed source the Armoury
 * uses, loaded on demand so picking a weapon stays instant.
 */
const props = defineProps({
  slot: { type: String, required: true }, // primary | secondary | melee
  label: { type: String, required: true },
})

const planner = usePlanner()

const options = computed(() => planner.meta.weapons[props.slot] || [])
const weapon = computed(() => planner.activeWeapons[props.slot] || '')
const stateKey = computed(() => perkStateKey(props.slot, weapon.value))
const spent = computed(() => (weapon.value ? planner.weaponUsed(stateKey.value) : 0))

const open = ref(false)
const status = ref('idle') // idle | loading | ready | error
const data = ref(null)

async function load() {
  if (!weapon.value) return
  status.value = 'loading'
  data.value = null
  const resolved = await resolveWeapon(weapon.value)
  data.value = resolved
  status.value = resolved ? 'ready' : 'error'
}

function toggle() {
  open.value = !open.value
  if (open.value && status.value === 'idle') load()
}

// Changing the weapon invalidates whatever tree is on screen.
watch(weapon, () => {
  status.value = 'idle'
  data.value = null
  if (open.value) load()
})

const wikiUrl = computed(() => WIKI + encodeURIComponent(weapon.value))
</script>

<template>
  <div class="slot" :class="{ open, empty: !weapon }">
    <div class="slot-bar">
      <span class="slot-label">{{ label }}</span>

      <select
        class="slot-select"
        :value="weapon"
        :disabled="!options.length"
        :aria-label="label"
        @change="planner.setWeapon(slot, $event.target.value)"
      >
        <option value="">
          {{ options.length ? 'None selected' : `No ${label.toLowerCase()} for this class` }}
        </option>
        <option v-for="w in options" :key="w" :value="w">{{ weaponLabel(w) }}</option>
      </select>

      <span v-if="weapon" class="slot-pts" :class="{ spent: spent > 0 }">
        {{ spent }} {{ spent === 1 ? 'perk' : 'perks' }}
      </span>

      <button v-if="weapon" class="slot-toggle" :aria-expanded="open" @click="toggle">
        {{ open ? 'Hide tree' : 'Perk tree' }}
        <span class="chev" :class="{ up: open }" aria-hidden="true">▾</span>
      </button>
    </div>

    <div v-if="open && weapon" class="slot-body">
      <div v-if="status === 'loading'" class="slot-msg">
        <span class="spinner" /> Syncing {{ weapon }} from the wiki…
      </div>

      <div v-else-if="status === 'error'" class="slot-msg slot-msg-error">
        <p>No perk tree for {{ weapon }} yet — the wiki page has no readable perk table.</p>
        <a class="slot-wiki" :href="wikiUrl" target="_blank" rel="noopener">Open wiki ↗</a>
      </div>

      <div v-else-if="status === 'ready' && data?.perksPending" class="slot-msg slot-pending">
        <p>Perk tree not published yet for {{ weaponLabel(weapon) }}. The wiki has its stats but not its perk list.</p>
      </div>

      <WeaponTree v-else-if="status === 'ready' && data" :weapon="weapon" :state-key="stateKey" :data="data" />
    </div>
  </div>
</template>

<style scoped>
.slot {
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-pitch) 45%, transparent);
}
.slot + .slot {
  margin-top: 0.5rem;
}
.slot.open {
  border-color: var(--color-ash-2);
}
.slot-bar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  padding: 0.75rem 0.9rem;
}
.slot-label {
  flex: none;
  min-width: 8.5rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.slot-select {
  flex: 1 1 12rem;
  min-width: 0;
  background: color-mix(in srgb, var(--color-obsidian) 70%, transparent);
  border: 1px solid var(--color-ash);
  color: var(--color-bone);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.5rem;
  font-size: var(--text-md);
  min-height: var(--tap);
}
.slot-select:disabled {
  opacity: 0.4;
}
.slot.empty .slot-select {
  color: var(--color-smoke);
}
.slot-pts {
  flex: none;
  font-family: var(--font-mono);
  font-size: max(var(--text-xs), var(--text-floor));
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-smoke);
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}
.slot-pts.spent {
  color: var(--color-ember);
  border-color: color-mix(in srgb, var(--color-ember) 45%, transparent);
}
.slot-toggle {
  flex: none;
  min-height: var(--tap);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  font-size: var(--text-xs);
  color: var(--color-drake);
  background: color-mix(in srgb, var(--color-drake) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-drake) 40%, transparent);
  border-radius: var(--radius-sm);
  padding: 0.4rem 0.7rem;
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .slot-toggle:hover {
    background: color-mix(in srgb, var(--color-drake) 12%, transparent);
  }
}
.slot-toggle:active {
  transform: scale(0.97);
}
.chev {
  transition: transform var(--dur-state) var(--ease-forge);
}
.chev.up {
  transform: rotate(180deg);
}
.slot-body {
  padding: 0 0.9rem 0.9rem;
  border-top: 1px solid var(--color-ash);
  margin-top: -1px;
  padding-top: 0.9rem;
}
.slot-msg {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--color-smoke);
  font-size: var(--text-sm);
  padding: 1rem 0;
}
.slot-msg-error {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}
.slot-wiki {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--text-xs);
  color: var(--color-drake);
  border-bottom: 1px solid color-mix(in srgb, var(--color-drake) 40%, transparent);
}
.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid var(--color-ash-2);
  border-top-color: var(--color-ember);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
  .chev {
    transition: none;
  }
}

@media (max-width: 600px) {
  .slot-label {
    min-width: 100%;
  }
}
</style>
