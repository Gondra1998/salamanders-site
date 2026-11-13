<script setup>
import { computed } from 'vue'
import { useNavLinks } from '../lib/useNavLinks'

const DISCORD = 'https://discord.gg/salamanders'
const year = new Date().getFullYear()
const links = useNavLinks()
const footerLinks = computed(() => links.value.filter((l) => l.to !== '/'))
</script>

<template>
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-col">
        <p class="footer-mark">Salamanders</p>
        <p class="footer-motto">Into the fires of battle, unto the anvil of war.</p>
      </div>
      <div class="footer-col footer-links">
        <RouterLink v-for="l in footerLinks" :key="l.to" :to="l.to">{{ l.label }}</RouterLink>
        <a :href="DISCORD" target="_blank" rel="noopener">Discord</a>
      </div>
    </div>
    <div class="rule-forge" />
    <p class="footer-fine">
      © {{ year }} Salamanders clan · A fan-run community for Warhammer 40,000: Space
      Marine 2. Not affiliated with or endorsed by Games Workshop or Focus Entertainment.
    </p>
  </footer>
</template>

<style scoped>
.site-footer {
  margin-top: 4rem;
  border-top: 1px solid var(--color-ash);
  background: rgba(7, 17, 13, 0.6);
}
.footer-inner {
  max-width: 76rem;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 1.5rem;
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  justify-content: space-between;
}
.footer-mark {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--color-bone);
}
.footer-motto {
  color: var(--color-smoke);
  font-style: italic;
  margin-top: 0.35rem;
  font-size: var(--text-md);
}
.footer-links {
  display: flex;
  gap: 1.1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
.footer-links a {
  display: flex;
  align-items: center;
  min-height: var(--tap);
  min-width: var(--tap);
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: var(--text-sm);
  color: var(--color-smoke);
}
@media (hover: hover) and (pointer: fine) {
  .footer-links a:hover {
    color: var(--color-drake);
  }
}
.footer-fine {
  max-width: 76rem;
  margin: 1rem auto 0;
  padding: 1rem 1.5rem 2rem;
  color: var(--color-faint);
  font-size: var(--text-xs);
  line-height: 1.5;
}
</style>
