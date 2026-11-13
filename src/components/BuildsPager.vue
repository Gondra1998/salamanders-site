<script setup>
const props = defineProps({
  page: { type: Number, required: true },
  pageCount: { type: Number, required: true },
})
const emit = defineEmits(['update:page'])
</script>

<template>
  <div v-if="pageCount > 1" class="pager">
    <button class="pager-btn rm-fade" :disabled="page <= 1" @click="emit('update:page', page - 1)">
      ‹ Prev
    </button>
    <span class="pager-label">Page {{ page }} of {{ pageCount }}</span>
    <button
      class="pager-btn rm-fade"
      :disabled="page >= pageCount"
      @click="emit('update:page', page + 1)"
    >
      Next ›
    </button>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.2rem;
}
.pager-btn {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: var(--text-xs);
  color: var(--color-smoke);
  background: transparent;
  border: 1px solid var(--color-ash);
  border-radius: var(--radius-sm);
  padding: 0.4rem 0.8rem;
  cursor: pointer;
  min-height: var(--tap);
  transition:
    color var(--dur-state) var(--ease-forge),
    border-color var(--dur-state) var(--ease-forge),
    opacity var(--dur-state) var(--ease-forge),
    transform var(--dur-press) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .pager-btn:hover:not(:disabled) {
    color: var(--color-bone);
    border-color: var(--color-ash-2);
  }
}
.pager-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.pager-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.pager-label {
  font-family: var(--font-mono);
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
  min-width: 7rem;
  text-align: center;
}
</style>
