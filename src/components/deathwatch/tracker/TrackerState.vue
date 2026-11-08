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
</script>

<template>
  <div class="dw-page">
    <HallHead v-if="page?.area === 'eventtracker'" area="eventtracker" :tab="page.tab" />
    <p v-if="status === 'error'" class="dw-empty" role="alert">
      {{ error || 'The data could not be loaded.' }}
      <button type="button" class="dw-btn rm-fade" @click="$emit('retry')">Try again</button>
    </p>
    <p v-else-if="status !== 'ready'" class="dw-sub" role="status">Loading…</p>
    <slot v-else />
  </div>
</template>
