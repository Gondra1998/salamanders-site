<script setup>
import { computed } from 'vue'

const props = defineProps({ notices: { type: Array, default: () => [] } })
defineEmits(['dismiss'])

const replaced = computed(() => props.notices.filter((n) => n.kind === 'replaced').length)
const noun = (n) => `${n} perk${n === 1 ? '' : 's'}`
const heading = computed(() =>
  replaced.value
    ? `Perks changed: re-pick ${noun(replaced.value)}`
    : `Perks changed: review ${noun(props.notices.length)}`,
)
const lead = computed(() =>
  replaced.value
    ? 'This build was made before some perks changed. The ones that no longer exist were removed along with their notes.'
    : 'This build was made before some perks changed. Check that your notes still fit.',
)
const where = (n) => (n.level === null ? 'Prestige' : `Level ${n.level}`)
</script>

<template>
  <aside v-if="notices.length" class="stale-notice" role="status">
    <div class="stale-top">
      <h2 class="stale-head">{{ heading }}</h2>
      <button type="button" class="stale-dismiss" @click="$emit('dismiss')">Dismiss</button>
    </div>
    <p class="stale-lead">{{ lead }}</p>
    <ul class="stale-list">
      <li v-for="(n, i) in notices" :key="i" class="stale-item">
        <span class="stale-where">{{ where(n) }}</span>
        <template v-if="n.kind === 'replaced'">
          <span class="stale-was">{{ n.was }}</span>
          <span class="stale-arrow" aria-hidden="true">→</span>
          <span class="stale-now">{{ n.now }}</span>
        </template>
        <template v-else>
          <span class="stale-was">{{ n.was }}</span>
          <span class="stale-rework">was reworked</span>
        </template>
        <span v-if="n.note" class="stale-note">{{ n.note }}</span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.stale-notice {
  margin: 0 0 1.4rem;
  padding: 1rem 1.2rem;
  border: 1px solid color-mix(in srgb, var(--color-ember) 45%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-ember) 7%, transparent);
}
.stale-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.stale-head {
  margin: 0;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--text-base);
  color: var(--color-ember);
}
.stale-dismiss {
  min-width: var(--tap);
  min-height: var(--tap);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--text-sm);
  color: var(--color-smoke);
  background: transparent;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-sm);
  padding: 0.3rem 0.7rem;
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .stale-dismiss:hover {
    color: var(--color-bone);
  }
}
.stale-dismiss:active {
  transform: scale(0.97);
}
.stale-lead {
  margin: 0.5rem 0 0.7rem;
  font-family: var(--font-sans);
  font-size: var(--text-md);
  color: var(--color-smoke);
}
.stale-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
.stale-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.6rem;
  font-family: var(--font-sans);
  font-size: var(--text-md);
  color: var(--color-bone);
}
.stale-where {
  min-width: 4.5rem;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--text-xs);
  color: var(--color-smoke);
}
.stale-was {
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--color-ember) 60%, transparent);
  color: var(--color-smoke);
}
.stale-rework {
  color: var(--color-gold);
}
.stale-arrow {
  color: var(--color-smoke);
}
.stale-now {
  color: var(--color-drake);
}
.stale-note {
  flex-basis: 100%;
  padding-left: 5.1rem;
  font-size: var(--text-sm);
  color: var(--color-smoke);
}
@media (max-width: 36rem) {
  .stale-note {
    padding-left: 0;
  }
}
</style>
