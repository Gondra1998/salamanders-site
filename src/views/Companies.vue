<script setup>
import { ref, computed, defineAsyncComponent, onMounted, provide, useTemplateRef, watch } from 'vue'
import companies from '../data/companies.json'
import PageHeader from '../components/PageHeader.vue'
import DeathwatchBanner from '../components/company/DeathwatchBanner.vue'
import CompanyArticle from '../components/company/CompanyArticle.vue'
import HighCommandPlaceholder from '../components/company/HighCommandPlaceholder.vue'
import RanksPlaceholder from '../components/company/RanksPlaceholder.vue'
import ToolsPlaceholder from '../components/company/ToolsPlaceholder.vue'
import { useAuth } from '../stores/auth'
import { HIGH_COMMAND_ENTRY, MUSTER_ENTRY } from '../lib/companyKeys'
import { scrollBehavior } from '../lib/motion'
import { ROSTER_VIEWER } from '../lib/rosterContext'
import { SCENES } from '../lib/rosterScenes'
import { useCompanyNotables } from '../lib/useCompanyNotables'
import { useCompanyRoster } from '../lib/useCompanyRoster'
import { useOpenBranches } from '../lib/useOpenBranches'
import { useRosterActions } from '../lib/useRosterActions'
import '../components/roster/roster.css' // the hook reference for tests and e2e; holds no rules

// The page is the story; the roster is the layer on top. A composition surface:
// which roster to show is useCompanyRoster's job, what Find me and the rest do is
// useRosterActions', how a bar looks is CompanyRanks'. The roster code (bars, ladders,
// the member tools, their styles) loads after the story has painted, and only what the
// visitor needs: a placeholder holds each bar's place meanwhile.
const CompanyRanks = defineAsyncComponent({
  loader: () => import('../components/company/CompanyRanks.vue'),
  loadingComponent: RanksPlaceholder,
  delay: 0,
})
const RosterBanner = defineAsyncComponent({
  loader: () => import('../components/roster/RosterBanner.vue'),
  loadingComponent: HighCommandPlaceholder,
  delay: 0,
})
const RosterStatus = defineAsyncComponent({
  loader: () => import('../components/roster/RosterStatus.vue'),
  loadingComponent: ToolsPlaceholder,
  delay: 0,
})
const RosterInfirmary = defineAsyncComponent(() => import('../components/roster/RosterInfirmary.vue'))
const MusterSection = defineAsyncComponent(() => import('../components/company/MusterSection.vue'))

const auth = useAuth()
const open = useOpenBranches()
const root = useTemplateRef('root')
const infirmaryOpen = ref(false)
const { mode, loading, view, store, note, updated, stale, start, loadInfirmary } = useCompanyRoster({ infirmaryOpen })
const viewerId = computed(() => auth.member?.id ?? null)
provide(ROSTER_VIEWER, viewerId)
// The Notable Server Members cards are real names: the server sends them to a signed-in guild member only.
const { state: notablesState, entriesFor } = useCompanyNotables()
const { findMessage, openableKeys, allOpen, toggleAll, toggleInfirmary, jumpToBranch, findMe, scrollToArticle, applyHash } = useRosterActions({
  root,
  view,
  open,
  infirmaryOpen,
  viewerId,
  loadInfirmary,
})
// Dev only, with the fixture on: links that flip the page between its scenes.
const devScenes = import.meta.env.DEV && import.meta.env.VITE_ROSTER_FIXTURE ? SCENES : null

onMounted(() => {
  start()
  applyHash()
})
// /companies#third opens that company's bar once, the first time data arrives.
watch(view, (now, before) => {
  if (now && !before) applyHash()
})
// Losing the member roster (signing out, a refused token) leaves nothing for the Infirmary to show.
watch(mode, (m) => {
  if (m !== 'full') infirmaryOpen.value = false
})

const query = ref('')

const matches = (c, q) => (c.title + ' ' + c.subtitle + ' ' + (c.keywords || '')).toLowerCase().includes(q)
const q = computed(() => query.value.trim().toLowerCase())
const filtered = computed(() => (q.value ? companies.filter((c) => matches(c, q.value)) : companies))
// High Command is the first entry when somebody holds it and the search allows it
const showHighCommand = computed(() => Boolean(view.value?.banner.hero) && (!q.value || matches(HIGH_COMMAND_ENTRY, q.value)))
// The Muster is the last, for a Legion member with something in it, and not while searching companies
const showMuster = computed(() => mode.value === 'full' && !q.value && Boolean(view.value?.unassigned || view.value?.servitors.length))
const chips = computed(() => [...(showHighCommand.value ? [HIGH_COMMAND_ENTRY] : []), ...filtered.value, ...(showMuster.value ? [MUSTER_ENTRY] : [])])
const branchByKey = computed(() => new Map((view.value?.branches ?? []).map((b) => [b.key, b])))

// "↑ Index" on a company: back to the chip row, with focus there so the next Tab is a chip.
function backToIndex() {
  const index = document.getElementById('company-index')
  index?.scrollIntoView({ behavior: scrollBehavior() })
  index?.focus({ preventScroll: true })
}
</script>

<template>
  <section ref="root" class="companies">
    <PageHeader
      class="c-head"
      eyebrow="The Chapter"
      title="Companies & Sections"
      lede="The XVIII Legion is forged from many hearths. These are our companies and institutions — and the brothers who hold the line."
    >
      <input
        v-model="query"
        class="c-search"
        type="search"
        placeholder="Search companies, sections, brothers…"
        aria-label="Search companies"
      />
    </PageHeader>

    <DeathwatchBanner />

    <nav v-if="devScenes" class="rs-dev-scenes" aria-label="Fixture scenes (dev only)">
      <a v-for="scene in devScenes" :key="scene" :href="`?scene=${scene}`">{{ scene }}</a>
    </nav>

    <p v-if="note" class="c-note" role="status">{{ note }}</p>
    <p v-if="store.status === 'error' && store.roster" class="c-note" role="alert">The roster could not be refreshed. Showing the last copy.</p>

    <!-- A Legion member's tools: who is on the roll, Find me, Expand all, the Infirmary -->
    <RosterStatus
      v-if="mode === 'full' && view"
      :summary="view.summary"
      :updated="updated"
      :stale="stale"
      :openable="openableKeys.length > 0"
      :all-open="allOpen"
      :can-infirmary="store.roster.viewer.infirmary"
      :infirmary-open="infirmaryOpen"
      :message="findMessage"
      @find="findMe"
      @toggle-all="toggleAll"
      @toggle-infirmary="toggleInfirmary"
      @jump="jumpToBranch"
    />
    <!-- on the Legion list, so the toolbar is probably coming: hold its place -->
    <ToolsPlaceholder v-else-if="loading && auth.member?.isMember && !infirmaryOpen" />

    <RosterBanner v-if="showHighCommand && !infirmaryOpen" id="high-command" class="c-hc" :banner="view.banner" />
    <!-- until the roster says whether anybody holds High Command, hold the panel's place -->
    <HighCommandPlaceholder v-else-if="loading && !q && !infirmaryOpen" class="c-hc" />

    <!-- Company index -->
    <nav id="company-index" class="c-index" aria-label="Jump to company" tabindex="-1">
      <button
        v-for="c in chips"
        :key="c.id"
        type="button"
        class="c-chip rm-fade"
        @click="scrollToArticle(c.id)"
      >
        <span class="c-chip-sigil">{{ c.sigil }}</span>
        <span>{{ c.title.replace(/ — .*/, '') }}</span>
      </button>
    </nav>

    <p v-if="!chips.length" class="c-empty">No companies match “{{ query }}”.</p>

    <!-- The Infirmary replaces the order of battle while it is open -->
    <RosterInfirmary v-if="infirmaryOpen && mode === 'full'" :status="store.infirmaryStatus" :infirmary="store.infirmary" />
    <template v-else>
      <!-- Companies -->
      <CompanyArticle
        v-for="c in filtered"
        :key="c.id"
        :company="c"
        :notables="entriesFor(c.id)"
        :notables-state="notablesState"
        @index="backToIndex"
      >
        <template #ranks>
          <CompanyRanks
            :branch="branchByKey.get(c.branch) ?? null"
            :mode="mode"
            :loading="loading"
            :open="open.isOpen(c.branch)"
            @toggle="open.toggle(c.branch)"
            @sign-in="auth.signIn()"
          />
        </template>
      </CompanyArticle>

      <MusterSection
        v-if="showMuster"
        :unassigned="view.unassigned"
        :servitors="view.servitors"
        :open="open.isOpen('unassigned')"
        @toggle="open.toggle('unassigned')"
      />
    </template>
  </section>
</template>

<style scoped>
.companies {
  max-width: 60rem;
  margin: 0 auto;
  padding: 4rem 1.5rem 2rem;
}
.c-head {
  margin-bottom: 2rem;
}
.c-search {
  margin-top: 1.4rem;
  width: 100%;
  max-width: 26rem;
  padding: 0.7rem 1rem;
  background: rgba(14, 28, 22, 0.6);
  border: 1px solid var(--color-ash);
  border-radius: 3px;
  color: var(--color-bone);
  font-size: 0.95rem;
}
.c-search::placeholder {
  color: var(--color-faint);
}
.rs-dev-scenes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.9rem;
  margin: 0 0 1rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-smoke);
}
@media (hover: hover) and (pointer: fine) {
  .rs-dev-scenes a:hover {
    color: var(--color-drake);
  }
}

.c-note {
  margin: 0 0 1.4rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--color-averland);
}
.c-hc {
  margin: 2rem 0; /* the same for the panel and for the placeholder that holds its place; scrolled to like a company */
  scroll-margin-top: 5rem;
}

.c-index {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 3rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-ash);
}
.c-index:focus {
  outline: none; /* focus lands here from "↑ Index"; the chips carry the visible focus */
}
.c-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.7rem 0.35rem 0.4rem;
  border: 1px solid var(--color-ash);
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--color-smoke);
  /* the chips sit low enough now (High Command above them) to cross the lava glow; a dark backing keeps the text readable */
  background: rgba(5, 10, 8, 0.6);
  font-family: inherit;
  cursor: pointer;
  min-height: var(--tap);
  transition:
    border-color var(--dur-state) var(--ease-forge),
    color var(--dur-state) var(--ease-forge),
    transform var(--dur-press) var(--ease-forge);
}
@media (hover: hover) and (pointer: fine) {
  .c-chip:hover {
    color: var(--color-bone);
    border-color: var(--color-drake);
  }
}
.c-chip:active {
  transform: scale(0.97);
}
.c-chip-sigil {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 0.3rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.72rem;
  color: var(--color-gold);
  background: rgba(223, 184, 91, 0.1);
  border-radius: 999px;
}
.c-empty {
  color: var(--color-smoke);
  padding: 2rem 0;
}

@media (max-width: 600px) {
  .companies {
    padding-top: 3rem;
  }
}
</style>
