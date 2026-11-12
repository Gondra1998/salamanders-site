<script setup>
// One company: its header, an optional slot for the Ranks bar, and its story
// (prose, lists and the Notable Server Members cards). The story's markup and
// styles moved here unchanged from the Companies page, including the wide-screen
// scrim that keeps text readable over the volcano (Companies.test.js checks it).
import { computed } from 'vue'

const props = defineProps({
  // an entry of src/data/companies.json
  company: { type: Object, required: true },
  // The Notable Server Members are real members' names, so they are not in companies.json: the server sends them
  // to a signed-in guild member (useCompanyNotables). A section marked `notables: true` is where they go.
  // `notables` is this company's cards, [name, ...lines] lists; `notablesState` says what the page knows.
  notables: { type: Array, default: null },
  notablesState: { type: String, default: 'denied', validator: (s) => ['denied', 'expired', 'loading', 'ready', 'error'].includes(s) },
})
defineEmits(['index'])

const NOTES = {
  loading: 'Loading the notable server members…',
  error: 'The notable server members could not be loaded. Try again later.',
  denied: 'Notable server members are shown to signed-in guild members.',
  expired: 'Sign in again to see the notable server members.',
}
// Once the server has answered, a section of cards it had none for is left out, not shown as a heading over nothing.
const sections = computed(() =>
  props.company.sections.filter((s) => !s.notables || props.notablesState !== 'ready' || props.notables?.length),
)

// Characters in a member's write-up (everything after the name). Sets the
// card's share of its row (--bio), so longer bios get more width instead of
// an ever-taller narrow column.
function bioLength(m) {
  return m.slice(1).join('').length
}

// Initials from first + last word of a name, for the member badge.
function initials(name) {
  const words = name.replace(/[",]/g, '').trim().split(/\s+/)
  const a = words[0]?.[0] || ''
  const b = words.length > 1 ? words[words.length - 1][0] : ''
  return (a + b).toUpperCase()
}
</script>

<template>
  <article :id="company.id" class="company">
    <div class="company-head">
      <span class="sigil">{{ company.sigil }}</span>
      <div>
        <h2 class="company-title">{{ company.title }}</h2>
        <p class="company-sub">{{ company.subtitle }}</p>
      </div>
      <button type="button" class="c-top" aria-label="Back to the company index" @click="$emit('index')">↑ Index</button>
    </div>

    <div v-if="$slots.ranks" class="company-ranks">
      <slot name="ranks" />
    </div>

    <div class="company-body">
      <section v-for="(s, i) in sections" :key="i" class="block surface">
        <h3 class="block-h"><span class="stud" aria-hidden="true" />{{ s.h }}</h3>

        <template v-if="s.p">
          <p v-for="(para, j) in s.p" :key="j" class="block-p">{{ para }}</p>
        </template>

        <ul v-if="s.list" class="block-list">
          <li v-for="(item, j) in s.list" :key="j">{{ item }}</li>
        </ul>

        <template v-if="s.notables">
          <div v-if="notablesState === 'ready'" class="notables" :data-count="notables.length">
            <div
              v-for="(m, j) in notables"
              :key="j"
              class="member panel-forge"
              :style="{ '--bio': bioLength(m) }"
            >
              <div class="member-head">
                <span class="avatar">{{ initials(m[0]) }}</span>
                <p class="member-name">{{ m[0] }}</p>
              </div>
              <p v-for="(line, k) in m.slice(1)" :key="k" class="member-blurb">{{ line }}</p>
            </div>
          </div>
          <p v-else class="block-p notables-note" :role="notablesState === 'loading' ? 'status' : undefined">{{ NOTES[notablesState] }}</p>
        </template>
      </section>
    </div>
  </article>
</template>

<style scoped>
.company {
  scroll-margin-top: 5rem;
  margin-bottom: 3.5rem;
}
.company-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.4rem;
}
.company-ranks {
  margin-bottom: 1.6rem;
}
/* no roster to show (or none for this company): no empty gap either */
.company-ranks:empty {
  display: none;
}
.sigil {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-lg);
  color: var(--color-gold);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-gold) 14%, transparent),
    color-mix(in srgb, var(--color-gold) 3%, transparent)
  );
  border: 1px solid color-mix(in srgb, var(--color-gold) 35%, transparent);
  clip-path: polygon(15% 0, 85% 0, 100% 50%, 85% 100%, 15% 100%, 0 50%);
}
.company-title {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-weight: 700;
  font-size: var(--text-xl);
  letter-spacing: 0.01em;
  color: var(--color-bone);
  line-height: 1.05;
}
.company-sub {
  color: var(--color-drake);
  font-size: var(--text-md);
  margin-top: 0.3rem;
}
/* the way back up to the chip row: quiet, but a full-size touch target */
.c-top {
  margin-left: auto;
  align-self: flex-start;
  min-height: 44px;
  padding: 0.5rem 0.3rem;
  background: none;
  border: 0;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-smoke);
  transition: transform var(--dur-press) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .c-top:hover {
    color: var(--color-bone);
  }
}
.c-top:active {
  transform: scale(0.97);
}
.c-top:focus-visible {
  outline: 2px solid var(--color-drake);
  outline-offset: 2px;
}

.block {
  margin: 0 0 1.6rem;
}
/* Text over the volcano. On phones each block sits on the shared .surface (padding
   here, the panel itself from style.css). On wide screens the text is a left column
   with the mountain in the empty right half, so a scrim that fades out to the right
   does the same job without boxing the page: it holds 4.5:1 against the brightest
   lava across the whole text width (Companies.test.js checks the numbers). */
@media (max-width: 760px) {
  .block {
    padding: 1rem 1.1rem;
    border-radius: var(--radius-md);
  }
}
@media (min-width: 761px) {
  /* padding, not margin, between blocks: the scrim then runs unbroken down the company
     instead of leaving bright stripes across the mountain between blocks */
  .block.surface {
    margin: 0;
    padding: 0.8rem 0;
    border: 0;
    backdrop-filter: none;
    background: linear-gradient(90deg, rgba(5, 10, 8, 0.8) 0%, rgba(5, 10, 8, 0.7) 62%, transparent 100%);
  }
}
.block-h {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: var(--text-xs);
  color: var(--color-gold);
  margin-bottom: 0.6rem;
}
/* The Stud Rule: the ember sits in a stud before the label, not in a side border. A heading that wraps keeps
   the stud on its first line. */
.block-h .stud {
  color: var(--color-ember);
  margin-top: calc((1lh - 6px) / 2);
}
.block-p {
  color: var(--color-pewter);
  line-height: 1.65;
  margin-bottom: 0.7rem;
  max-width: 62ch;
}
.block-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-width: 62ch;
}
.block-list li {
  position: relative;
  padding-left: 1.3rem;
  margin-bottom: 0.5rem;
  color: var(--color-pewter);
  line-height: 1.55;
}
.block-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 7px;
  height: 7px;
  transform: rotate(45deg);
  background: var(--color-ember);
}

/* Cards size to their bios: each takes a share of its row proportional to its
   text length (--bio, see bioLength), never narrower than --member-min. Rows
   wrap on their own, so phones get a single column with no media query.
   Groups of 4+ use a wider minimum so they land 2x2 instead of 3 + 1 orphan. */
.notables {
  --member-min: 17rem;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.9rem;
  margin-top: 0.4rem;
}
.notables:not([data-count='1']):not([data-count='2']):not([data-count='3']) {
  --member-min: 22rem;
}
.notables-note {
  margin-top: 0.4rem;
  color: var(--color-smoke);
  font-style: italic;
}
.member {
  flex: var(--bio, 300) 1 0;
  min-width: min(var(--member-min), 100%);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1.15rem 1.25rem;
  border-radius: var(--radius-md);
}
.member-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.avatar {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-md);
  color: var(--color-ember-ink);
  background: linear-gradient(180deg, var(--color-ember-light), var(--color-ember));
}
.member-name {
  font-weight: 600;
  color: var(--color-bone);
  font-size: var(--text-md);
  line-height: 1.3;
}
.member-blurb {
  color: var(--color-smoke);
  font-size: var(--text-md);
  line-height: 1.6;
  max-width: 65ch;
}

@media (max-width: 600px) {
  .sigil {
    width: 2.6rem;
    height: 2.6rem;
    font-size: var(--text-base);
  }
}
</style>
