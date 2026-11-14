<script setup>
// Event Tracker → Players: the running event's players by MVP, or one player's profile (?p=<name>).
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { useDeathwatch } from '../../../../stores/deathwatch'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'
import PlayersView from '../../../../components/deathwatch/tracker/PlayersView.vue'

const route = useRoute()
const router = useRouter()
const { data, R, live, reload } = useTracker()
const gate = useDeathwatch()
const player = computed(() => (typeof route.query.p === 'string' ? route.query.p : ''))
const pick = (p) => router.push({ query: { ...route.query, p } })
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <PlayersView :R="R" :player="player" :to="live" :notes="gate.canEdit" @pick="pick" />
  </TrackerState>
</template>
