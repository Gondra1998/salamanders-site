<script setup>
// Event Tracker → Kill Teams: one Kill Team's profile in the running event (?t=<id> picks it).
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { useDeathwatch } from '../../../../stores/deathwatch'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'
import KillTeamView from '../../../../components/deathwatch/tracker/KillTeamView.vue'

const route = useRoute()
const router = useRouter()
const { data, R, live, reload } = useTracker()
const gate = useDeathwatch()
const teamId = computed(() => +route.query.t || 0)
const pick = (id) => router.replace({ query: { ...route.query, t: String(id) } })
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <template v-if="!R.ts.length">
      <h2 class="dw-plaque">Kill Team profile</h2>
      <p class="dw-empty">No Kill Teams in the running event.</p>
    </template>
    <KillTeamView v-else :R="R" :team-id="teamId" :to="live" :notes="gate.canEdit" @pick="pick" />
  </TrackerState>
</template>
