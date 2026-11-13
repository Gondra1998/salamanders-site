<script setup>
import { computed } from 'vue'
import FireText from './FireText.vue'
import ForgeMark from './ForgeMark.vue'
import { fireTuning } from '../lib/fireTuning'
import { useAuth } from '../stores/auth'

const INVITE = 'https://discord.gg/salamanders'
// The Salamanders Discord server's id. It is public (every invite link and
// channel URL carries it), so it lives in source, not in the member list.
const GUILD_ID = '1322056087792521269'
// Signed-in XVIIIth Legion members are already in the server, where an invite
// link only lands them on Discord's join screen. The channels URL opens the
// guild directly.
const SERVER = `https://discord.com/channels/${GUILD_ID}`
const auth = useAuth()
const isMember = computed(() => auth.member?.isMember === true)
</script>

<template>
  <section class="hero">
    <div class="hero-inner">
      <p class="eyebrow">XVIII Legion · Sons of Vulkan</p>
      <h1 class="wordmark">
        <FireText
          text="Salamanders"
          :pixel="fireTuning.text.pixel"
          :speed="fireTuning.text.speed"
          :max-height="fireTuning.text.maxHeight"
          :variation="fireTuning.text.variation"
          :intensity="fireTuning.text.intensity"
          :base="fireTuning.text.base"
        />
      </h1>
      <ForgeMark class="hero-mark" />
      <p class="tagline">Into the fires of battle, unto the anvil of war.</p>
      <div class="cta-row">
        <a class="btn-ember" :href="isMember ? SERVER : INVITE" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" class="glyph" aria-hidden="true">
            <path
              fill="currentColor"
              d="M20 4.4A19 19 0 0 0 15.3 3l-.24.5a17 17 0 0 1 4.2 1.3 15 15 0 0 0-14.5 0A17 17 0 0 1 9 3.5L8.7 3A19 19 0 0 0 4 4.4 20 20 0 0 0 .5 18a19 19 0 0 0 5.8 3l.8-1.3a12 12 0 0 1-1.8-.9l.4-.3a13.6 13.6 0 0 0 11.6 0l.4.3a12 12 0 0 1-1.8.9l.8 1.3a19 19 0 0 0 5.8-3A20 20 0 0 0 20 4.4ZM8.3 14.8c-.9 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2Zm7.4 0c-.9 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2Z"
            />
          </svg>
          {{ isMember ? 'Open the Discord' : 'Join the Chapter' }}
        </a>
        <RouterLink class="btn-drake btn-planner" to="/planner">Open the Perk Builder</RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: 92svh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 6rem 1.5rem 4rem;
  isolation: isolate;
  text-align: center;
}
.hero-inner {
  position: relative;
  z-index: 2;
  /* Wide enough that the wordmark never reaches the edge. At 60rem the glyphs
     measured 997px inside a 960px box and .hero's overflow:hidden clipped the
     final S. */
  max-width: 68rem;
  width: 100%;
}
.wordmark {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  line-height: 0.95;
  letter-spacing: 0.02em;
  /* Capped so 11 glyphs + tracking stay inside .hero-inner at every width.
     Authored, see DESIGN.md Typography. */
  font-size: clamp(2.5rem, 12.5vw, 9.5rem);
  margin: 0.6rem 0 0;
  /* The fill is painted by FireText on a canvas; this element only sets the
     type. drop-shadow (not text-shadow) so the glow follows the fire. */
  filter: drop-shadow(0 0 30px color-mix(in srgb, var(--color-ember) 35%, transparent));
}
/* The divider under the title. It is a block so it centres on its own margins. */
.hero-mark {
  display: block;
  margin: 1.3rem auto 0.2rem;
}
.tagline {
  font-family: var(--font-sans);
  color: var(--color-smoke);
  /* Authored, see DESIGN.md Typography. */
  font-size: clamp(1rem, 2.4vw, 1.3rem);
  max-width: 42ch;
  margin: 1rem auto 0;
  line-height: 1.5;
}
.cta-row {
  margin-top: 2.2rem;
  display: flex;
  gap: 0.9rem;
  justify-content: center;
  flex-wrap: wrap;
}
.btn-ember,
.btn-drake {
  padding: 0.85rem 1.5rem;
  border-radius: var(--radius-sm);
  font-size: var(--text-base);
}
/* Stands beside the molten Join button, so it gets a solid obsidian face and
   a drake glow instead of the usual faint outline. */
.btn-planner {
  background: var(--color-obsidian);
  border-color: var(--color-drake);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-obsidian) 30%, transparent),
    0 8px 30px -8px color-mix(in srgb, var(--color-drake) 55%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--color-drake) 20%, transparent);
  text-shadow: 0 0 12px color-mix(in srgb, var(--color-drake) 45%, transparent);
  transition:
    transform var(--dur-press) var(--ease-forge),
    box-shadow var(--dur-state) var(--ease-forge),
    background-color var(--dur-state) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .btn-planner:hover {
    transform: translateY(-1px);
    background: var(--color-pitch);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--color-obsidian) 30%, transparent),
      0 12px 40px -8px color-mix(in srgb, var(--color-drake) 75%, transparent),
      inset 0 1px 0 color-mix(in srgb, var(--color-drake) 30%, transparent);
  }
}
.btn-planner:active {
  transform: scale(0.97);
}
.glyph {
  width: 20px;
  height: 20px;
}

@media (max-width: 768px) {
  .hero {
    padding: 5rem 1.25rem 3rem;
  }
}

</style>
