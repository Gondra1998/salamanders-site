<script setup>
// Manage → Checks: things in the live event's data that are probably mistakes, each with how often it occurs. A
// finding that points somewhere links to where it is fixed: a team to its editor in Manage, a mission to Enter
// mission.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTracker } from '../../../../lib/deathwatch/useTracker'
import { SLOTS } from '../../../../lib/deathwatch/tracker'
import { resolveArea } from '../../../../lib/deathwatch/areas'
import TrackerState from '../../../../components/deathwatch/tracker/TrackerState.vue'

const { data, R, reload } = useTracker()
const route = useRoute()
const scene = () => (route.query.scene ? { scene: route.query.scene } : {})
const page = (tab, q) => ({ path: resolveArea({ area: 'administratum', tab }).canonical, query: { ...scene(), ...q } })
// Where a finding is fixed, or null for one that only names things.
const fix = (x) => (x.w ? page('enter-mission', { t: x.t, w: x.w, o: x.o }) : x.t ? page('manage', { t: x.t }) : null)
const plain = (labels) => labels.map((label) => ({ label }))

const rows = computed(() => {
  const k = R.value.CK
  return [
    ['Players on two rosters', k.twice],
    ['Players in a mission but on no roster', k.stray, 'A typo, or a guest from outside the event.'],
    ['Players still playing after their KIA week', k.afterKia],
    ['Kill Teams with an empty roster slot', k.short],
    [`Missions with Gene-Seed + Relics over ${SLOTS} slots`, plain(k.slots)],
    ['Kill Teams with identical stats in a mission', plain(k.du.map((a) => a.join(' = ')))],
    ['Missions played without data', plain(k.nd)],
    ['Gene-Seeds without a finder', k.sg],
    ['Player entries without a class', R.value.none],
  ].map(([t, found, note]) => ({ t, note, n: Array.isArray(found) ? found.length : found, items: Array.isArray(found) ? found : [] }))
})
</script>

<template>
  <TrackerState :status="data.status" :error="data.error" @retry="reload">
    <h2 class="dw-plaque">Data checks</h2>
    <div class="dw-scroll">
      <table class="dw-table">
        <thead>
          <tr><th class="l">Check</th><th>Found</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.t">
            <td class="l wrap">
              <b>{{ r.t }}</b>
              <small v-if="r.n && r.note">{{ r.note }}</small>
              <ul v-if="r.items.length" class="finds">
                <li v-for="x in r.items" :key="x.label">
                  <RouterLink v-if="fix(x)" class="dw-link" :to="fix(x)">{{ x.label }}</RouterLink>
                  <template v-else>{{ x.label }}</template>
                </li>
              </ul>
            </td>
            <td class="big" :class="r.n ? 'down' : 'up'">{{ r.n }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </TrackerState>
</template>

<style scoped>
.wrap {
  white-space: normal;
}
.finds {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.9rem;
}
</style>
