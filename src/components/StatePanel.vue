<script setup>
import { computed } from 'vue'
import ForgeMark from './ForgeMark.vue'

// One panel for the five things a page can have nothing else to show: empty, error, gate, loading, prompt.
const props = defineProps({
  kind: {
    type: String,
    required: true,
    validator: (v) => ['empty', 'error', 'gate', 'loading', 'prompt'].includes(v),
  },
  title: { type: String, default: '' },
  body: { type: String, default: '' },
})

const role = computed(() => (props.kind === 'error' ? 'alert' : props.kind === 'loading' ? 'status' : undefined))
</script>

<template>
  <div class="state-panel surface" :class="'is-' + kind" :role="role">
    <ForgeMark v-if="kind === 'empty' || kind === 'prompt'" muted />
    <span v-else-if="kind === 'loading'" class="spinner" aria-hidden="true"></span>
    <span v-else-if="kind === 'error'" class="stud state-stud" aria-hidden="true"></span>
    <h2 v-if="title" class="state-title">{{ title }}</h2>
    <p v-if="body" class="state-body">{{ body }}</p>
    <div v-if="$slots.default" class="state-actions"><slot /></div>
  </div>
</template>

<style scoped>
.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 2.5rem 1.5rem;
  border-radius: var(--radius-md);
  text-align: center;
}
/* A gate may carry a form, and a form reads from the left. */
.state-panel.is-gate {
  align-items: flex-start;
  text-align: left;
}

.state-title {
  margin: 0;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  font-weight: 700;
  font-size: var(--text-xl);
  line-height: 1.15;
  color: var(--color-bone);
}
.state-body {
  margin: 0;
  max-width: 44ch;
  line-height: 1.6;
  overflow-wrap: anywhere;
  color: var(--color-smoke);
}
.state-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.8rem;
}
.is-gate .state-actions {
  justify-content: flex-start;
}

.spinner {
  flex: none;
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-ash-2);
  border-top-color: var(--color-ember);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
/* The error's stud: the one warm mark, 8px, above the title. */
.state-stud {
  width: 8px;
  height: 8px;
  color: var(--color-ember);
}
</style>
