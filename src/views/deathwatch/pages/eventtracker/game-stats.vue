<script setup>
// Event Tracker → Game Stats: the running event's totals, per Kill Team, and the classes played.
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { useDeathwatch } from '../../../../stores/deathwatch'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'
import GameStatsView from '../../../../components/deathwatch/tracker/GameStatsView.vue'

const { data, R, reload } = useTracker()
const gate = useDeathwatch()
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <GameStatsView :R="R" classes :notes="gate.canEdit" />
  </TrackerState>
</template>
