<script setup>
// The frame of every Event Tracker and Manage view: "loading" until the data is in, the error if it could not be
// fetched, and the view itself once it is ready. An Event Tracker view is headed like the Armouring Hall (HallHead),
// also while it loads; Manage keeps its rail.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { resolveArea } from '../../../lib/deathwatch/areas'
import HallHead from '../armour/HallHead.vue'
import './tracker.css'

defineProps({ status: { type: String, required: true }, error: { type: String, default: '' } })
defineEmits(['retry'])
const route = useRoute()
const page = computed(() => resolveArea(route.params))
const tracker = computed(() => page.value?.area === 'eventtracker')
</script>

<template>
  <div class="dw-page">
    <HallHead v-if="tracker" area="eventtracker" :tab="page.tab" />
    <!-- An Event Tracker view sits in its own frame under the head's tabs; Manage needs none. -->
    <div :class="tracker ? 'dw-page ts-frame' : 'ts-plain'">
      <p v-if="status === 'error'" class="dw-empty" role="alert">
        {{ error || 'The data could not be loaded.' }}
        <button type="button" class="dw-btn rm-fade" @click="$emit('retry')">Try again</button>
      </p>
      <p v-else-if="status !== 'ready'" class="dw-sub" role="status">Loading…</p>
      <slot v-else />
    </div>
  </div>
</template>

<style scoped>
/* Without the frame the view's blocks stay direct parts of the page's grid. */
.ts-plain {
  display: contents;
}
.ts-frame {
  min-width: 0;
  padding: clamp(0.75rem, 2.5vw, 1.5rem);
  background: rgb(0 0 0 / 0.22);
  border: 1px solid var(--dw-line-2);
}
.ts-frame > :deep(h2.dw-plaque:first-of-type) {
  margin-top: 0;
}
</style>
