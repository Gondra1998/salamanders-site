<script setup>
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  titleId: { type: String, default: '' },
  lede: { type: String, default: '' },
})
</script>

<template>
  <header class="page-head">
    <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
    <h1 :id="titleId || undefined" class="page-title">{{ title }}</h1>
    <p v-if="lede" class="page-lede">{{ lede }}</p>
    <slot />
  </header>
</template>

<style scoped>
.page-title {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  font-size: var(--text-display);
  letter-spacing: 0.02em;
  line-height: 1.05;
  margin: 0.4rem 0 0.6rem;
  color: var(--color-bone);
}
</style>
