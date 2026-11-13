<script setup>
import { useRoute } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'

const route = useRoute()
</script>

<template>
  <section class="nf">
    <PageHeader class="nf-head" eyebrow="Off the map" title="No such muster">
      <p class="page-lede nf-body">
        Nothing is filed under <code class="nf-path">{{ route.fullPath }}</code>. Pick a
        destination below.
      </p>
    </PageHeader>
    <div class="nf-links">
      <RouterLink to="/" class="btn-ember btn-md nf-cta">Back to the forge</RouterLink>
      <RouterLink to="/planner" class="btn-drake btn-md nf-cta">Perk Builder</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.nf {
  max-width: 40rem;
  margin: 0 auto;
  padding: 7rem 1.5rem 4rem;
}
/* A lost visitor gets the centred plate, not the left-aligned page header. */
.nf-head {
  text-align: center;
}
.nf-body {
  margin-inline: auto;
}
.nf-path {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-gold);
  word-break: break-all;
}
.nf-links {
  display: flex;
  gap: 0.6rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 1.8rem;
}
</style>
