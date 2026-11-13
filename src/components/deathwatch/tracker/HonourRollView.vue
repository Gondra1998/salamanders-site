<script setup>
// The honours of one event: the champion, the player awards and the Kill Team awards. Ties name everyone.
import { computed } from 'vue'
import { honours, mvpText, num } from '../../../lib/deathwatch/tracker'
import PlayerName from './PlayerName.vue'

const props = defineProps({ R: { type: Object, required: true }, to: { type: Object, required: true } })
const H = computed(() => honours(props.R))
</script>

<template>
  <h2 class="dw-plaque">Honour Roll</h2>
  <div class="dw-tiles">
    <div class="dw-tile">
      <p class="dw-tile-label">Event Champion</p>
      <span class="dw-tile-who">
        <RouterLink v-if="H.champion" class="dw-link" :to="to.team(H.champion.id)">{{ H.champion.n }}</RouterLink>
        <template v-else>no data yet</template>
      </span>
      <span v-if="H.champion" class="dw-tile-value">{{ num(H.champion.tot) }}</span>
    </div>
    <div v-for="a in H.players" :key="a.key" class="dw-tile">
      <p class="dw-tile-label">{{ a.label }}</p>
      <span class="dw-tile-who">
        <template v-if="a.best">
          <small v-if="a.best.who.length > 1" class="dw-tile-note">Tied ({{ a.best.who.length }}) </small>
          <template v-for="(p, i) in a.best.who" :key="p.n"><template v-if="i"> </template><PlayerName :name="p.n" :R="R" :to="to.player(p.n)" /></template>
        </template>
        <template v-else>no data yet</template>
      </span>
      <span v-if="a.best" class="dw-tile-value">{{ a.key === 'mvp' ? mvpText(a.best.value) : num(a.best.value) }}</span>
    </div>
  </div>
  <h2 class="dw-plaque">Kill Team awards</h2>
  <div class="dw-tiles">
    <div v-for="a in H.teams" :key="a.label" class="dw-tile">
      <p class="dw-tile-label">{{ a.label }}</p>
      <span class="dw-tile-who">
        <template v-if="a.best">
          <small v-if="a.best.who.length > 1" class="dw-tile-note">Tied ({{ a.best.who.length }}) </small>{{ a.best.who.join(', ') }}
        </template>
        <template v-else>no data yet</template>
      </span>
      <span v-if="a.best" class="dw-tile-value">{{ num(Math.round(a.best.value)) }}</span>
    </div>
  </div>
</template>
