<script setup>
// Event Tracker → Standings: the running event. With no Kill Teams yet, a pointer to the Archive.
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'
import StandingsView from '../../../../components/deathwatch/tracker/StandingsView.vue'

const { data, R, eventName, live, all, reload } = useTracker()
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <p class="dw-sub ev-name">{{ eventName }}</p>
    <template v-if="!R.ts.length">
      <h2 class="dw-plaque">Standings</h2>
      <p class="dw-empty">No event is running. Finished tours are in the <RouterLink class="dw-link" :to="all()">Archive</RouterLink>.</p>
    </template>
    <StandingsView v-else :R="R" :team="live.team" />
  </TrackerState>
</template>

<style scoped>
/* From 900px the head (HallHead) already names the event. */
@media (min-width: 900px) {
  .ev-name {
    display: none;
  }
}
</style>
