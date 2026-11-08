<script setup>
// A player, as on the company roster (RosterMember .rs-member): a pill led by their avatar (the Discord picture of the
// "Deathwatch Deployment" brother of that name, else initials), the name as a link to their profile, then the KIA
// tag if they fell and the guest tag if asked for.
import { computed } from 'vue'
import { kiaLabel } from '../../../lib/deathwatch/tracker'
import { initials, safeAvatar } from '../../../lib/rosterAvatar'
import { useDeployment } from '../../../lib/deathwatch/deployment'

const props = defineProps({
  name: { type: String, required: true },
  R: { type: Object, required: true },
  to: { type: Object, default: null },
  guest: { type: Boolean, default: false },
})
const deployment = useDeployment()
const avatar = computed(() => safeAvatar(deployment.value.find((m) => m.name === props.name)?.avatar))
</script>

<template>
  <span class="dw-member">
    <span class="dw-av" :data-i="initials(name)" aria-hidden="true"><img v-if="avatar" :src="avatar" width="64" height="64" decoding="async" alt="" /></span>
    <RouterLink v-if="to" class="dw-member-link" :to="to">{{ name }}</RouterLink><span v-else>{{ name }}</span>
    <span v-if="guest" class="dw-tag guest" title="Not on this Kill Team's roster. Counts for Kill Team points, not for MVP.">Guest</span>
    <span v-if="R.kia.has(name)" class="dw-tag kia" :title="`Killed in action${R.kia.get(name) ? ` in week ${R.kia.get(name)}` : ''}`">{{ kiaLabel(R, name) }}</span>
  </span>
</template>

<style scoped>
.dw-member {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  box-sizing: border-box;
  max-width: 100%;
  padding: 0.2rem 0.65rem 0.2rem 0.2rem;
  vertical-align: middle;
  font: 600 0.86rem / 1.2 var(--dw-font-body);
  letter-spacing: 0;
  text-transform: none;
  color: #e1ebe3;
  background: rgb(255 255 255 / 0.035);
  border: 1px solid rgb(58 82 70 / 0.55);
  border-radius: 999px;
  transition:
    border-color var(--dur-state) var(--ease-forge),
    background-color var(--dur-state) var(--ease-forge);
}
.dw-member .dw-tag {
  margin-left: 0;
}
.dw-member-link {
  color: inherit;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.dw-member-link:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
/* The roster's avatar, in the area's colours. The initials are drawn by CSS, so they never join the name's text
   (copying it, or reading the page); the picture sits over them. */
.dw-av {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  font: 600 0.6875rem / 1 var(--dw-font-cond);
  letter-spacing: 0.02em;
  color: var(--dw-ink);
  background: linear-gradient(180deg, #2c4137, #1a2a22);
  border: 1px solid var(--dw-line-2);
}
.dw-av::before {
  content: attr(data-i);
}
.dw-av img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (hover: hover) and (pointer: fine) {
  .dw-member:hover {
    border-color: rgb(89 214 108 / 0.55);
    background: rgb(89 214 108 / 0.06);
  }
  .dw-member-link:hover {
    color: var(--dw-accent);
  }
}
</style>
