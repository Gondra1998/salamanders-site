<script setup>
import { isStaleBuild } from '../lib/patchMigration'
import { weaponLabel } from '../lib/weapons'

defineProps({
  build: { type: Object, required: true },
  showBadge: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  deleting: { type: Boolean, default: false },
})
defineEmits(['open', 'remove'])

const slots = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'melee', label: 'Melee' },
]
</script>

<template>
  <article class="b-card panel-forge">
    <div class="b-card-top">
      <h2 class="b-name">{{ build.title }}</h2>
      <span class="b-tags">
        <span class="b-class">{{ build.className }}</span>
        <span
          v-if="isStaleBuild(build)"
          class="b-stale"
          title="Perks in this build changed after it was made. Open it in the builder to review."
          >Needs review</span
        >
      </span>
    </div>
    <p class="b-meta">
      Level {{ build.level }}<span v-if="build.prestige"> · Prestige {{ build.prestige }}</span
      ><span v-if="build.role"> · {{ build.role }}</span>
    </p>
    <p class="b-author">
      by {{ build.author.displayName || 'Community Member' }}
      <span v-if="showBadge" class="b-member-badge" title="Verified Chapter member">✓ Member</span>
    </p>
    <p v-if="build.notes" class="b-notes">{{ build.notes }}</p>

    <dl class="b-load">
      <div v-for="s in slots" :key="s.key">
        <dt>{{ s.label }}</dt>
        <dd>
          <RouterLink
            v-if="build.weapons[s.key]"
            class="b-weapon"
            :to="{ path: '/armoury', query: { w: build.weapons[s.key] } }"
          >
            {{ weaponLabel(build.weapons[s.key]) }}
          </RouterLink>
          <span v-else>—</span>
        </dd>
      </div>
    </dl>

    <div class="b-perks">
      <span v-for="(p, i) in build.perks.filter(Boolean)" :key="i" class="b-perk">{{ p }}</span>
      <span v-if="!build.perks.some(Boolean)" class="b-perk-none">No class perks selected</span>
    </div>

    <div class="b-actions">
      <button class="btn-drake btn-sm" @click="$emit('open', build)">Open in builder</button>
      <button
        v-if="canDelete"
        class="btn-ghost btn-sm"
        :disabled="deleting"
        @click="$emit('remove', build)"
      >
        {{ deleting ? 'Deleting…' : 'Delete' }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.b-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  padding: 1.3rem;
}
.b-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}
.b-name {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  font-size: var(--text-lg);
  color: var(--color-bone);
  line-height: 1.1;
}
.b-tags {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.3rem;
}
.b-class,
.b-stale {
  flex: none;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-drake);
  border: 1px solid color-mix(in srgb, var(--color-drake) 35%, transparent);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}
.b-stale {
  color: var(--color-ember);
  border-color: color-mix(in srgb, var(--color-ember) 45%, transparent);
  white-space: nowrap;
}
.b-meta {
  color: var(--color-smoke);
  font-size: var(--text-sm);
  margin: 0.35rem 0 0.6rem;
}
.b-author {
  color: var(--color-faint);
  font-size: var(--text-xs);
  font-style: italic;
  margin: -0.3rem 0 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.b-member-badge {
  font-family: var(--font-mono);
  font-style: normal;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-drake);
  border: 1px solid color-mix(in srgb, var(--color-drake) 40%, transparent);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
}
.b-notes {
  color: var(--color-pewter);
  font-size: var(--text-sm);
  line-height: 1.5;
  margin-bottom: 0.8rem;
}
.b-load {
  margin: 0 0 0.9rem;
  display: grid;
  gap: 0.35rem;
}
.b-load div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-ash) 50%, transparent);
  padding-bottom: 0.3rem;
}
.b-load dt {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.b-load dd {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-bone);
  text-align: right;
}
.b-weapon {
  color: var(--color-drake);
  border-bottom: 1px solid color-mix(in srgb, var(--color-drake) 35%, transparent);
}
@media (hover: hover) and (pointer: fine) {
  .b-weapon:hover {
    color: var(--color-bone);
    border-bottom-color: var(--color-bone);
  }
}
.b-perks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  flex-grow: 1;
  align-content: flex-start;
}
.b-perk {
  font-size: var(--text-xs);
  color: var(--color-pewter);
  background: color-mix(in srgb, var(--color-ember) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-ember) 22%, transparent);
  border-radius: var(--radius-sm);
  padding: 0.2rem 0.5rem;
}
.b-perk-none {
  font-size: var(--text-xs);
  color: var(--color-faint);
  font-style: italic;
}
.b-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 1rem;
}
.btn-sm:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
