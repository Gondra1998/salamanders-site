<script setup>
import { useId } from 'vue'

// The forge's divider: a bar of steel pulled from the fire. One hairline, cold at both ends and hot in the
// middle (cold armour, molten core), with a soft glow at the hot spot only. It is still: the glow is a fixed
// blur, never moving. The bar is the element's own background, so it is one crisp pixel at every pixel ratio.
defineProps({
  // Muted: the ember has cooled, so no glow and a dimmer heart. For empty states.
  muted: { type: Boolean, default: false },
  size: { type: String, default: 'md', validator: (v) => ['md', 'sm'].includes(v) },
})

// Several marks render on one page, so each one names its own blur.
const glowId = `${useId()}-glow`
</script>

<template>
  <svg
    class="forge-mark"
    :class="{ 'is-muted': muted, 'is-sm': size === 'sm' }"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="!muted">
      <defs>
        <filter :id="glowId" x="-0.5" y="-5" width="2" height="11">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <!-- 1px of bar plus 1px of spread each side, blurred 10px: a box-shadow of 0 0 10px 1px, centred. -->
      <rect class="mark-glow" x="32%" y="-1" width="36%" height="3" :filter="`url(#${glowId})`" />
    </template>
  </svg>
</template>

<style scoped>
.forge-mark {
  --mark-core: var(--color-whitehot);
  display: block;
  flex: none;
  width: 160px;
  height: 1px;
  /* The glow reaches past the one-pixel box; let it. */
  overflow: visible;
  /* Transparent, pewter-grey steel, ember, then white-hot in the middle 30%, and back. */
  background: linear-gradient(
    90deg,
    transparent,
    var(--color-ash-2) 20%,
    var(--color-ember) 35%,
    var(--mark-core) 50%,
    var(--color-ember) 65%,
    var(--color-ash-2) 80%,
    transparent
  );
}
.forge-mark.is-sm {
  width: 96px;
}
.forge-mark.is-muted {
  --mark-core: color-mix(in srgb, var(--color-ember) 60%, transparent);
}

.mark-glow {
  fill: color-mix(in srgb, var(--color-ember) 55%, transparent);
}
</style>
