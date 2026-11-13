<script setup>
// What a part of the area shows to someone it does not open to: a blurred, empty sheet with a lock, and the reason
// on hover, keyboard focus or a tap. Nothing of the part itself is behind the blur, so nothing can be read out of it.
// The reason is the lock's description, so a screen reader hears it at once, without opening anything.
import { ref, useId } from 'vue'

defineProps({
  message: { type: String, default: 'Access restricted.' },
  // Over something already there (a hub card, blurred by its owner): no empty page of its own, the lock and the
  // reason side by side, filling the nearest positioned parent.
  overlay: { type: Boolean, default: false },
})

const open = ref(false)
const id = useId()
</script>

<template>
  <div class="dw-lock" :class="{ 'is-open': open, 'is-overlay': overlay }" @mouseleave="open = false">
    <div v-if="!overlay" class="dw-lock-ghost" aria-hidden="true">
      <span v-for="n in 7" :key="n" class="dw-lock-line" />
    </div>
    <button class="dw-lock-btn" type="button" :aria-expanded="String(open)" :aria-describedby="id" @click="open = !open">
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
        <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        <path d="M12 14.5v2.5" />
      </svg>
      <span class="dw-lock-label">Locked</span>
    </button>
    <p :id="id" class="dw-lock-msg">{{ message }}</p>
  </div>
</template>

<style scoped>
.dw-lock {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 16rem;
  overflow: hidden;
  border-radius: 3px;
}
/* An empty page, blurred: only its shape. */
.dw-lock-ghost {
  position: absolute;
  inset: 1.5rem;
  display: grid;
  align-content: start;
  gap: 0.9rem;
  filter: blur(6px);
  opacity: 0.55;
}
.dw-lock-line {
  height: 0.8rem;
  border-radius: 2px;
  background: var(--dw-line-2);
}
.dw-lock-line:nth-child(1) {
  width: 45%;
  height: 1.4rem;
  background: var(--dw-accent);
  opacity: 0.6;
}
.dw-lock-line:nth-child(3n) {
  width: 70%;
}
.dw-lock-line:nth-child(4) {
  height: 5rem;
}
.dw-lock-btn {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  min-width: 44px;
  min-height: 44px;
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--dw-line-2);
  border-radius: 50%;
  background: color-mix(in oklab, var(--dw-surface) 80%, transparent);
  color: var(--dw-accent);
  cursor: pointer;
}
.dw-lock-btn svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.dw-lock-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.dw-lock-btn:focus-visible {
  outline: 2px solid var(--dw-accent);
  outline-offset: 3px;
}
/* The reason, under the lock: shown on hover, keyboard focus or a tap. */
.dw-lock-msg {
  position: absolute;
  top: calc(50% + 3rem);
  left: 1rem;
  right: 1rem;
  margin: 0;
  text-align: center;
  font: 600 0.85rem / 1.4 var(--dw-font-cond);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dw-ink);
  opacity: 0;
  translate: 0 -0.25rem;
  transition:
    opacity var(--dur-state) var(--ease-forge),
    translate var(--dur-state) var(--ease-forge);
  pointer-events: none;
}
.dw-lock.is-open .dw-lock-msg,
.dw-lock-btn:focus-visible + .dw-lock-msg {
  opacity: 1;
  translate: 0 0;
}
@media (hover: hover) and (pointer: fine) {
  .dw-lock-btn:hover + .dw-lock-msg {
    opacity: 1;
    translate: 0 0;
  }
}
/* The overlay: the lock and, beside it, the reason, over the whole of what it covers. */
.dw-lock.is-overlay {
  position: absolute;
  inset: 0;
  min-height: 0;
  display: flex;
  justify-content: center;
  gap: 0.9rem;
  padding: 0.5rem 1rem;
}
.is-overlay .dw-lock-btn {
  padding: 0.6rem;
}
.is-overlay .dw-lock-msg {
  position: static;
  flex: 0 1 17rem;
  text-align: left;
  translate: -0.25rem 0;
}
.dw-lock.is-overlay.is-open .dw-lock-msg,
.is-overlay .dw-lock-btn:focus-visible + .dw-lock-msg {
  translate: 0 0;
}
@media (hover: hover) and (pointer: fine) {
  .is-overlay .dw-lock-btn:hover + .dw-lock-msg {
    translate: 0 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dw-lock-msg {
    transition: none;
  }
}
</style>
