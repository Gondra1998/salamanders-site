<script setup>
// The h2 strip for a section inside a page: display caps, a one-pixel ash rule under the whole row, an optional
// mono count, and an aside slot for a control on the right.
defineProps({
  count: { type: [Number, String], default: null },
  as: { type: String, default: 'h2' },
})
</script>

<template>
  <div class="section-head">
    <component :is="as" class="section-title">
      <span class="section-title-text"><slot /></span>
      <template v-if="count !== null">
        <!-- Read aloud as "Verified Members, 2" rather than "Verified Members2". -->
        <span class="sr-only">, </span>
        <span class="section-title-count">{{ count }}</span>
      </template>
    </component>
    <div v-if="$slots.aside" class="section-aside"><slot name="aside" /></div>
  </div>
</template>

<style scoped>
/* The rule is on the row, not the heading, so it runs under the aside too. */
.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--color-ash);
  padding-bottom: 0.5rem;
  margin: 0 0 1rem;
}
.section-title {
  margin: 0;
  min-width: 0;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--color-smoke);
}
.section-title-count {
  margin-left: 0.6rem;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 400;
  letter-spacing: normal;
  color: var(--color-pewter);
  font-variant-numeric: tabular-nums;
}
.section-aside {
  margin-left: auto;
}
</style>
