<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlanner, CLASS_NAMES } from '../stores/planner'
import { useAuth } from '../stores/auth'
import * as buildsApi from '../lib/buildsApi'
import { canDeleteBuild } from '../lib/permissions'
import { splitByMembership, paginate } from '../lib/buildGroups'
import BuildCard from '../components/BuildCard.vue'
import BuildsPager from '../components/BuildsPager.vue'
import PageHeader from '../components/PageHeader.vue'
import SectionTitle from '../components/SectionTitle.vue'
import StatePanel from '../components/StatePanel.vue'

const planner = usePlanner()
const auth = useAuth()
const router = useRouter()

const builds = ref([])
const loading = ref(true)
const loadError = ref('')

// Requests can finish in any order (a list asked for with a token may still be in flight when the visitor
// signs out and a newer one is sent). Only the most recent call may touch the page, whether it starts,
// succeeds or fails, or an old answer carrying member flags could land on a signed-out page.
let latestLoad = 0
async function load() {
  const mine = ++latestLoad
  loading.value = true
  loadError.value = ''
  // The list on screen came from a request made under the old sign-in state, and its member flags go stale
  // with it: drop it, so a signed-out page never shows badges while it waits, or beside an error banner.
  builds.value = []
  try {
    const list = await buildsApi.listBuilds(undefined, auth.token)
    if (mine !== latestLoad) return
    builds.value = list
  } catch (err) {
    if (mine !== latestLoad) return
    // The browser's own "Failed to fetch" or the API's "Request failed (500)" tells a member nothing.
    loadError.value = 'The builds server did not answer. Check your connection, then retry.'
  } finally {
    if (mine === latestLoad) loading.value = false
  }
}
onMounted(load)
// The server only marks who is a member for a request that carries a token, so a sign-out must ask again
// or the old answer's flags would stay on screen.
watch(() => auth.token, load)

// Moderators (Administrator, Master of the Forge, Mechadendrite Expert) may
// delete any build. The server decides; a failed check just hides the button.
const isModerator = ref(false)
onMounted(async () => {
  if (!auth.token) return
  try {
    isModerator.value = await buildsApi.getModeratorStatus(auth.token)
  } catch {
    isModerator.value = false
  }
})

const query = ref('')
const classFilter = ref('')

/** Everything a build is made of is searchable: name, role, notes, perks, weapons. */
function haystack(b) {
  return [
    b.title,
    b.role,
    b.notes,
    b.className,
    ...(b.perks || []),
    ...(b.prestigePicks || []),
    ...Object.values(b.weapons || {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return builds.value.filter(
    (b) =>
      (!classFilter.value || b.className === classFilter.value) &&
      (!q || haystack(b).includes(q)),
  )
})

// Only offer class chips for classes the gallery actually contains.
const usedClasses = computed(() =>
  CLASS_NAMES.filter((c) => builds.value.some((b) => b.className === c)),
)

// Verified members first, everyone else below, by the server's per-viewer flag — see src/lib/buildGroups.js.
const groups = computed(() => splitByMembership(filtered.value))
const memberPage = ref(1)
const otherPage = ref(1)
// A new search/filter reshuffles which builds exist at all — stale page
// numbers from the previous result set would otherwise point at the wrong
// (or a now-nonexistent) page.
watch(filtered, () => {
  memberPage.value = 1
  otherPage.value = 1
})
const memberPaged = computed(() => paginate(groups.value.member, memberPage.value))
const otherPaged = computed(() => paginate(groups.value.other, otherPage.value))

const toast = ref('')
let t
function flash(m) {
  toast.value = m
  clearTimeout(t)
  t = setTimeout(() => (toast.value = ''), 1800)
}

function apply(build) {
  planner.applyBuildData(build)
  router.push('/planner')
}

const deleting = ref(null)
async function remove(b) {
  if (deleting.value) return
  deleting.value = b.id
  try {
    await buildsApi.deleteBuild(b.id, auth.token)
    builds.value = builds.value.filter((x) => x.id !== b.id)
    flash(`Deleted “${b.title}”`)
  } catch (err) {
    flash(err.message || 'Could not delete that build')
  } finally {
    deleting.value = null
  }
}
</script>

<template>
  <section class="builds">
    <PageHeader eyebrow="Field-tested" title="Recommended Builds">
      <p class="page-lede">
        Builds the Chapter has posted. Make one in the
        <RouterLink to="/planner" class="ilink">Perk Builder</RouterLink> and save it from
        the Your Build panel — sign in with Discord first so it's tied to your name.
      </p>
    </PageHeader>

    <StatePanel v-if="loading" kind="loading" body="Loading builds…" />
    <StatePanel v-else-if="loadError" kind="error" class="b-error" :body="loadError">
      <button type="button" class="btn-drake btn-sm" @click="load">Retry</button>
    </StatePanel>

    <!-- Search + filter -->
    <div v-if="!loading && !loadError && builds.length" class="b-tools">
      <input
        v-model="query"
        class="b-search field-forge"
        type="search"
        placeholder="Search builds, perks, weapons, notes…"
        aria-label="Search builds"
      />
      <div class="b-filters" role="group" aria-label="Filter by class">
        <button
          class="b-chip tab-forge rm-fade"
          :class="{ on: !classFilter }"
          @click="classFilter = ''"
        >
          All
          <span class="b-chip-n">{{ builds.length }}</span>
        </button>
        <button
          v-for="c in usedClasses"
          :key="c"
          class="b-chip tab-forge rm-fade"
          :class="{ on: classFilter === c }"
          @click="classFilter = classFilter === c ? '' : c"
        >
          {{ c }}
          <span class="b-chip-n">
            {{ builds.filter((b) => b.className === c).length }}
          </span>
        </button>
      </div>
    </div>

    <StatePanel
      v-if="!loading && builds.length && !filtered.length"
      kind="empty"
      body="No builds match that search."
    />

    <!-- Verified members' builds, first and badged -->
    <section v-if="groups.member.length" class="b-section">
      <SectionTitle :count="groups.member.length">Verified Members</SectionTitle>
      <div class="b-grid">
        <BuildCard
          v-for="r in memberPaged.items"
          :key="r.id"
          :build="r"
          show-badge
          :can-delete="canDeleteBuild(auth.member, r, isModerator)"
          :deleting="deleting === r.id"
          @open="apply"
          @remove="remove"
        />
      </div>
      <BuildsPager v-model:page="memberPage" :page-count="memberPaged.pageCount" />
    </section>

    <!-- Everyone else -->
    <section v-if="groups.other.length" class="b-section">
      <SectionTitle :count="groups.other.length">Community Builds</SectionTitle>
      <div class="b-grid">
        <BuildCard
          v-for="r in otherPaged.items"
          :key="r.id"
          :build="r"
          :can-delete="canDeleteBuild(auth.member, r, isModerator)"
          :deleting="deleting === r.id"
          @open="apply"
          @remove="remove"
        />
      </div>
      <BuildsPager v-model:page="otherPage" :page-count="otherPaged.pageCount" />
    </section>

    <!-- Empty state -->
    <StatePanel
      v-if="!loading && !loadError && !builds.length"
      kind="empty"
      class="b-empty"
      title="No builds posted yet"
      body="Build a loadout in the Perk Builder, then hit Save to library in the Your Build panel. Sign in with Discord to post — everyone sees it here."
    >
      <RouterLink to="/planner" class="btn-ember btn-md">Open the Perk Builder</RouterLink>
    </StatePanel>

    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </section>
</template>

<style scoped>
.builds {
  max-width: 68rem;
  margin: 0 auto;
  padding: 4rem 1.5rem 2rem;
}
.ilink {
  color: var(--color-drake);
  border-bottom: 1px solid color-mix(in srgb, var(--color-drake) 40%, transparent);
}
/* A state panel sits a beat below the header; the header carries no margin of its own. */
.builds > .state-panel {
  margin-top: 1.5rem;
}

/* search + filter: the field and the chips are the shared controls; the page sets widths and gaps */
.b-tools {
  margin: 2rem 0 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.b-search {
  width: 100%;
  max-width: 28rem;
}
.b-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.b-chip-n {
  font-family: var(--font-mono);
  font-size: max(var(--text-xs), var(--text-floor));
  opacity: 0.75;
}

/* sections + grid */
.b-section {
  margin-top: 2.2rem;
}
.b-section:first-of-type {
  margin-top: 0.5rem;
}
.b-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: 1rem;
}

.toast {
  position: fixed;
  bottom: calc(1.4rem + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 80;
  background: color-mix(in srgb, var(--color-obsidian) 92%, transparent);
  border: 1px solid var(--color-drake);
  color: var(--color-bone);
  padding: 0.6rem 1.1rem;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.toast-enter-active {
  transition:
    opacity var(--dur-sheet) var(--ease-forge),
    transform var(--dur-sheet) var(--ease-forge);
}
.toast-leave-active {
  transition:
    opacity var(--dur-view) var(--ease-forge),
    transform var(--dur-view) var(--ease-forge);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
