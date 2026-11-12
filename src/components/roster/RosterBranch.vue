<script setup>
import { computed, shallowRef, watch } from 'vue'
import RosterLadder from './RosterLadder.vue'
import RosterMember from './RosterMember.vue'

// One branch: a bar (sigil, title, head, count) and a collapsible body holding its
// ladder. The body is CSS-collapsed, never v-if'd, so its text stays in the page
// (find-in-page, tests); `inert` keeps keyboard and screen readers out while shut.
// `variant="unassigned"` reuses it for the panel of members with no company role.
// `variant="embedded"` is the bar under a company's own header on the Companies
// page: the header already shows the sigil and title, so the bar is "Ranks", the
// head and the count. The body is the `body` slot (the ladder unless the parent
// supplies something else, as the public view does with counts).
const props = defineProps({
  // a ViewBranch from rosterView.js (or the Unassigned object, which has no head)
  branch: { type: Object, required: true },
  open: { type: Boolean, default: false },
  variant: { type: String, default: 'branch' }, // 'branch' | 'embedded' | 'unassigned'
})
defineEmits(['toggle'])

const embedded = computed(() => props.variant === 'embedded')
// Under a company's own header, which already names it, the bar is just "Ranks".
const title = computed(() => (embedded.value ? 'Ranks' : props.branch.label))
// a real branch (own page or embedded) as against the Unassigned panel
const ofBranch = computed(() => props.variant !== 'unassigned')

// Avatars inside the body are requested the first time the branch opens, and kept
// after: a closed body costs no image requests, and re-closing doesn't unload them.
const opened = shallowRef(props.open)
watch(
  () => props.open,
  (now) => {
    if (now) opened.value = true
  },
)
const bodyId = `rs-body-${props.branch.key}`
</script>

<template>
  <article
    class="rs-panel surface"
    :class="[ofBranch ? 'rs-branch' : 'rs-unassigned', { 'rs-embedded': embedded, 'rs-static': !branch.openable }]"
    :data-branch="ofBranch ? branch.key : undefined"
    :data-kind="ofBranch ? branch.kind : undefined"
    :data-jump="branch.key"
    :data-open="open ? '' : undefined"
  >
    <div class="rs-bar">
      <span v-if="!embedded" class="rs-sigil" aria-hidden="true">{{ branch.sigil }}</span>
      <component :is="embedded ? 'h3' : 'h2'" class="rs-title">
        <button
          v-if="branch.openable"
          type="button"
          class="rs-bar-btn"
          :aria-expanded="open"
          :aria-controls="bodyId"
          :aria-label="embedded ? `${branch.label} ranks` : undefined"
          @click="$emit('toggle')"
        >
          {{ title }}
        </button>
        <template v-else>{{ title }}</template>
      </component>

      <div v-if="branch.head" class="rs-head">
        <h3 class="rs-head-label">{{ branch.head.rank.label }}</h3>
        <span v-if="branch.head.vacant" class="rs-vacant">
          <svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="8,3 24,3 30,16 24,29 8,29 2,16" /></svg>
          Vacant
        </span>
        <template v-else>
          <ul class="rs-head-chips">
            <RosterMember v-for="m in branch.head.shown" :key="m.id" :member="m" :branch="branch" />
          </ul>
          <span v-if="branch.head.more" class="rs-more">+{{ branch.head.more }}</span>
        </template>
      </div>

      <div class="rs-tail">
        <span :title="`${branch.count} members`">{{ branch.count }}</span>
        <svg v-if="branch.openable" class="rs-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6l5 5 5-5" />
        </svg>
      </div>
    </div>

    <div v-if="branch.openable" :id="bodyId" class="rs-body" :inert="open ? undefined : ''">
      <div class="rs-body-in">
        <slot name="body">
          <RosterLadder
            :items="branch.ladder"
            :branch="ofBranch ? branch : null"
            :image-ready="opened"
            :spine="ofBranch"
            :with-tier="ofBranch"
          />
        </slot>
      </div>
    </div>
  </article>
</template>

<style scoped>
.rs-panel {
  border-radius: 3px;
  contain: layout style; /* an opening branch re-lays-out itself, not the whole document */
  transition:
    border-color var(--dur-state) var(--ease-forge),
    box-shadow var(--dur-view) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .rs-panel:not(.rs-static):hover {
    border-color: rgba(89, 214, 108, 0.45);
  }
}
.rs-panel[data-open] {
  border-color: rgba(255, 106, 43, 0.5);
  box-shadow: 0 0 40px -18px rgba(255, 106, 43, 0.55);
}
/* added by the page when a status link or deep link lands here */
.rs-flash {
  animation: rs-flash 1.4s var(--ease-forge);
}
@keyframes rs-flash {
  0% { box-shadow: 0 0 0 3px rgba(223, 184, 91, 0.7); }
  100% { box-shadow: 0 0 0 3px rgba(223, 184, 91, 0); }
}

.rs-bar {
  position: relative;
  display: grid;
  grid-template-columns: 2.9rem minmax(10.5rem, 1fr) minmax(0, 1.8fr) 3.6rem;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem 1rem;
  min-height: 44px;
}
.rs-sigil {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.9rem;
  height: 2.9rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--color-gold);
  background: linear-gradient(180deg, rgba(223, 184, 91, 0.16), rgba(223, 184, 91, 0.03));
  clip-path: polygon(15% 0, 85% 0, 100% 50%, 85% 100%, 15% 100%, 0 50%);
  box-shadow: inset 0 0 0 1px rgba(223, 184, 91, 0.4);
}
.rs-panel[data-open] .rs-sigil {
  color: var(--color-whitehot);
  background: linear-gradient(180deg, rgba(255, 106, 43, 0.28), rgba(223, 184, 91, 0.05));
}
.rs-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.12rem;
  line-height: 1.1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
/* the whole bar is the click target: the button's ::after stretches over it */
.rs-bar-btn {
  all: unset;
  display: block;
  cursor: pointer;
}
.rs-bar-btn::after {
  content: '';
  position: absolute;
  inset: 0;
}
.rs-bar-btn:focus-visible::after {
  outline: 2px solid var(--color-drake);
  outline-offset: -2px;
}
.rs-static .rs-title {
  color: #cfdad2;
}

.rs-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.8rem;
  min-width: 0;
}
.rs-head-label {
  width: 100%;
  margin: 0 0 -0.1rem;
  font-family: var(--font-mono);
  font-size: max(0.62rem, var(--text-floor));
  font-weight: 400;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-smoke);
}
.rs-head-chips {
  display: contents;
  list-style: none;
}
/* Chips here are not controls. Let a click or tap go through to the stretched
   button under them, so the whole bar toggles; a raised chip would swallow it. */
.rs-head :deep(.rs-member) {
  pointer-events: none;
}
.rs-more {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-smoke);
}
.rs-vacant {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.9rem;
  font-style: italic;
  color: var(--color-vacant);
}
.rs-vacant svg {
  width: 1.7rem;
  height: 1.7rem;
}
.rs-vacant polygon {
  fill: none;
  stroke: var(--color-vacant);
  stroke-width: 1.6;
  stroke-dasharray: 3 3;
}

.rs-tail {
  grid-column: 4;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--color-smoke);
}
.rs-chev {
  width: 1rem;
  height: 1rem;
  transition:
    transform var(--dur-view) var(--ease-forge),
    color var(--dur-state) var(--ease-forge);
}
.rs-panel[data-open] .rs-chev {
  transform: rotate(180deg);
  color: var(--color-ember);
}
@media (hover: hover) and (pointer: fine) {
  .rs-panel:hover .rs-chev {
    color: var(--color-drake);
  }
}

/* Embedded under a company's own header: no sigil or title column, so the bar is label, head, count.
   The label matches the story's block headings (.block-h on the Companies page). */
.rs-embedded .rs-bar {
  grid-template-columns: minmax(4.5rem, auto) minmax(0, 1fr) 3.6rem;
}
.rs-embedded .rs-tail {
  grid-column: 3;
}
.rs-embedded .rs-title {
  font-family: var(--font-mono);
  font-weight: 400;
  font-size: 0.74rem;
  letter-spacing: 0.16em;
  color: var(--color-gold);
  padding-left: 0.9rem;
  border-left: 2px solid var(--color-ember);
}

/* The body collapses by grid-template-rows (0fr to 1fr), so nothing is measured in JS. */
.rs-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-view) var(--ease-forge);
}
.rs-panel[data-open] .rs-body {
  grid-template-rows: 1fr;
}
.rs-body-in {
  min-height: 0;
  overflow: hidden;
  visibility: hidden;
  /* Stays visible for the whole collapse, then hides: visibility flips at the end of a transition out of
     visible, and at the start of one into it. */
  transition: visibility var(--dur-view) var(--ease-forge);
}
.rs-panel[data-open] .rs-body-in {
  visibility: visible;
}

@media (max-width: 760px) {
  .rs-bar {
    grid-template-columns: 2.6rem 1fr auto;
    gap: 0.5rem 0.8rem;
    padding: 0.75rem 0.8rem;
  }
  .rs-sigil {
    width: 2.6rem;
    height: 2.6rem;
  }
  .rs-head {
    grid-column: 1 / -1;
  }
  .rs-tail {
    grid-column: 3;
    grid-row: 1;
  }
  .rs-embedded .rs-bar {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .rs-embedded .rs-tail {
    grid-column: 2;
  }
}
</style>

<!-- unscoped on purpose: the class is on <html> (see pinReader.js and styles.test.js) -->
<style>
/* a bulk change or a jump snaps open */
.rs-instant .rs-body,
.rs-instant .rs-body-in {
  transition: none !important;
}
</style>
