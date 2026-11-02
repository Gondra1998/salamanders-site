<script setup>
// "Contents" on a Recruitment page: a bar that rides along under the site's bar, so the list of the page's sections
// is at hand wherever the reader is. Once a section heading has passed under it, it names the section being read and
// marks it in the list; beside it a button goes back to the top. The entries are buttons, not #links: a hash would
// go through the router and its own scrolling.
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { scrollBehavior } from '../../../lib/motion'

const props = defineProps({ items: { type: Array, required: true } })
const dd = useTemplateRef('dd')
const close = () => dd.value && (dd.value.open = false)
function jump(id) {
  close()
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
  el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}
// Closes when the focus leaves it (Tab past the last entry, a click elsewhere).
const leave = (e) => dd.value?.contains(e.relatedTarget) || close()

// The section being read: the last whose heading has passed under the bars (READ_LINE px from the top).
const READ_LINE = 140
const current = ref(null)
let frame = 0
function spy() {
  frame = 0
  let at = null
  for (const it of props.items) {
    const el = document.getElementById(it.id)
    if (!el || el.getBoundingClientRect().top > READ_LINE) break
    at = it.id
  }
  current.value = at
}
const onScroll = () => {
  if (!frame) frame = requestAnimationFrame(spy)
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  spy()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  if (frame) cancelAnimationFrame(frame)
})
const now = computed(() => props.items.find((it) => it.id === current.value))
function toTop() {
  close()
  window.scrollTo({ top: 0, behavior: scrollBehavior() })
}
</script>

<template>
  <div v-if="items.length" class="rcf">
    <details ref="dd" class="rcc" @focusout="leave" @keydown.esc="close">
      <summary class="rcc-btn">
        <span class="rcc-k">Contents</span>
        <span v-if="now" class="rcf-now">{{ now.label }}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <nav class="rcc-list" aria-label="Contents">
        <button
          v-for="it in items"
          :key="it.id"
          type="button"
          class="rcc-item"
          :aria-current="it.id === current ? 'location' : undefined"
          @click="jump(it.id)"
        >
          {{ it.label }}
        </button>
      </nav>
    </details>
    <button v-if="now" type="button" class="rcf-top" aria-label="Back to the top" @click="toTop">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
    </button>
  </div>
</template>

<style scoped>
/* The bar: sticky under the site's bar for the whole text. From 900px it takes no room of its own (height 0) and
   lies at the top right, beside the centred opening; on a phone it is a full-width row of its own. */
.rcf {
  position: sticky;
  top: 4.6rem;
  z-index: 6;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 0.4rem;
}
@media (min-width: 900px) {
  .rcf {
    height: 0;
  }
}
.rcc {
  position: relative;
}
.rcc-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0 0.8rem 0 1rem;
  font: 600 0.8rem / 1 var(--dw-font-cond);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dw-muted);
  list-style: none;
  cursor: pointer;
  border: 1px solid color-mix(in oklab, var(--dw-accent) 35%, var(--dw-line-2));
  border-radius: 999px;
  background: rgb(6 10 6 / 0.95);
  box-shadow: 0 10px 28px -10px rgb(0 0 0 / 0.9);
}
.rcc-btn::-webkit-details-marker {
  display: none;
}
.rcc-btn svg,
.rcf-top svg {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--dw-accent);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.rcc-btn svg {
  transition: transform var(--dur-state) var(--ease-forge);
}
.rcc[open] .rcc-btn svg {
  transform: rotate(180deg);
}
.rcc-btn:focus-visible,
.rcc-item:focus-visible,
.rcf-top:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 2px;
}
/* The section being read, as a lit readout. */
.rcf-now {
  /* min-width 0: a long section name shrinks to an ellipsis instead of widening the bar past a narrow phone. */
  min-width: 0;
  max-width: 26ch;
  overflow: hidden;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: none;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-accent);
}
.rcc-list {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 5;
  display: grid;
  width: max-content;
  max-width: min(22rem, 80vw);
  max-height: 60vh;
  overflow-y: auto;
  padding: 0.35rem;
  text-align: left;
  border: 1px solid var(--dw-line-2);
  border-radius: 6px;
  background: rgb(6 10 6 / 0.97);
  box-shadow: 0 16px 40px -12px rgb(0 0 0 / 0.8);
}
.rcc-item {
  position: relative;
  padding: 0.55rem 0.7rem 0.55rem 1.2rem;
  font: 600 0.85rem / 1.3 var(--dw-font-cond);
  letter-spacing: 0.06em;
  text-align: left;
  color: var(--dw-ink);
  background: none;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
/* The section being read: lit, behind the pip the sub-sections carry. */
.rcc-item[aria-current='location'] {
  color: var(--dw-accent);
  background: color-mix(in oklab, var(--dw-accent) 8%, transparent);
}
.rcc-item[aria-current='location']::before {
  content: '';
  position: absolute;
  left: 0.45rem;
  top: 50%;
  width: 6px;
  height: 6px;
  margin-top: -3px;
  background: var(--dw-accent);
  box-shadow: 0 0 8px var(--dw-accent);
}
.rcf-top {
  display: grid;
  place-items: center;
  width: 44px;
  min-height: 44px;
  padding: 0;
  cursor: pointer;
  border: 1px solid var(--dw-line-2);
  border-radius: 999px;
  background: rgb(6 10 6 / 0.95);
  box-shadow: 0 10px 28px -10px rgb(0 0 0 / 0.9);
}
/* A phone: the bar spans the column, the section's name taking the room. */
@media (max-width: 899px) {
  .rcf {
    margin-bottom: 0.75rem;
  }
  .rcf .rcc {
    flex: 1;
    min-width: 0;
  }
  .rcc-btn {
    width: 100%;
  }
  .rcc-btn svg {
    margin-left: auto;
  }
  .rcf-now {
    flex: 1;
    max-width: none;
  }
  .rcc-list {
    left: 0;
    max-width: none;
  }
}
@media (hover: hover) and (pointer: fine) {
  .rcc-btn:hover,
  .rcf-top:hover {
    color: var(--dw-accent);
    border-color: var(--dw-accent);
  }
  .rcc-item:hover {
    color: var(--dw-accent);
    background: color-mix(in oklab, var(--dw-accent) 10%, transparent);
  }
}
</style>
