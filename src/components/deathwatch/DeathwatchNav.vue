<script setup>
// The list of views in one Deathwatch area, plus the way back to the hub. One component for every width: it is
// the always-open sidebar on a wide screen and the content of the bottom sheet on a phone. It says when a link
// was used (`navigate`), so a sheet around it can close. Each link carries the original's icon for that view,
// drawn from data (lib/deathwatch/icons.json), never from markup.
import { computed } from 'vue'
import { AREAS, resolveArea, tabsFor } from '../../lib/deathwatch/areas'
import { iconFor } from '../../lib/deathwatch/icons'

const props = defineProps({
  area: { type: String, required: true },
  // The slug of the tab being shown.
  current: { type: String, required: true },
  // Who is looking ({ commander, held }): a tab with its own `roles` (Watch Command, Enter mission) is listed only for
  // those who may open it. Nobody, unless given.
  who: { type: Object, default: () => ({ commander: false, held: [] }) },
})
const emit = defineEmits(['navigate'])

const info = computed(() => AREAS[props.area])
const tabs = computed(() => tabsFor(props.area, props.who))
</script>

<template>
  <nav class="dw-nav" :aria-label="`${info.label} sections`">
    <ul>
      <li v-for="tab in tabs" :key="tab.slug">
        <RouterLink
          class="dw-nav-link rm-fade"
          :to="resolveArea({ area, tab: tab.slug }).canonical"
          :aria-current="tab.slug === current ? 'page' : undefined"
          @click="emit('navigate')"
        >
          <svg class="dw-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <component :is="shape[0]" v-for="(shape, i) in iconFor(tab.slug)" :key="i" v-bind="shape[1]" />
          </svg>
          <span>{{ tab.label }}</span>
        </RouterLink>
      </li>
      <li>
        <RouterLink class="dw-nav-link dw-nav-back rm-fade" to="/deathwatch" @click="emit('navigate')">
          <svg class="dw-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <component :is="shape[0]" v-for="(shape, i) in iconFor('menu')" :key="i" v-bind="shape[1]" />
          </svg>
          <span>Back to the Fortress</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.dw-nav ul {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dw-nav-link {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-height: 44px;
  padding: 0.55rem 1rem;
  border-radius: 10px;
  color: var(--dw-muted);
  font: 600 1.1rem / 1.1 var(--dw-font-cond);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition:
    background-color var(--dur-state) var(--ease-forge),
    color var(--dur-state) var(--ease-forge),
    transform var(--dur-press) var(--ease-forge);
}
.dw-nav-icon {
  flex: none;
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.dw-nav-link[aria-current='page'] {
  color: var(--dw-accent);
  background: color-mix(in oklab, var(--dw-accent) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--dw-accent) 30%, transparent);
}
.dw-nav-back {
  margin-top: 0.6rem;
  border-top: 1px solid var(--dw-line);
  border-radius: 0 0 10px 10px;
}
@media (hover: hover) and (pointer: fine) {
  .dw-nav-link:hover {
    color: var(--dw-ink);
  }
}
.dw-nav-link:active {
  transform: scale(0.97);
}
@media (max-height: 900px) and (min-width: 900px) {
  .dw-nav-link {
    min-height: 44px;
    padding-block: 0.4rem;
    font-size: 1rem;
  }
}
</style>
