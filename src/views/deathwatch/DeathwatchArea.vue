<script setup>
// One area of the fortress (Event Tracker, Armouring Hall, Chronicles of Valor, Manage): the rail with the
// crest, the area's name and its list of views, and beside it the framed sheet that holds the open view. The
// views themselves are files under ./pages/<area>/<tab>.vue (found by lib/deathwatch/pages.js); each is a
// skeleton until it is rebuilt. The address is already canonical by the time this renders: the router's guard
// (redirect.js) sees to that.
import { computed, defineAsyncComponent, h, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { AREAS, resolveArea } from '../../lib/deathwatch/areas'
import { pageLoader } from '../../lib/deathwatch/pages'
import { pageTexts } from '../../lib/deathwatch/pageTexts'
import { useDeathwatch } from '../../stores/deathwatch'
import crest from '../../components/deathwatch/img/crest.webp'
import crestGold from '../../components/deathwatch/img/crest-gold.webp'
import crestArmour from '../../components/deathwatch/img/crest-armouringhall.png'
import DeathwatchAreaBar from '../../components/deathwatch/DeathwatchAreaBar.vue'
import DeathwatchNav from '../../components/deathwatch/DeathwatchNav.vue'
import DeathwatchNavSheet from '../../components/deathwatch/DeathwatchNavSheet.vue'
import PageEditor from '../../components/deathwatch/PageEditor.vue'
import HallHead from '../../components/deathwatch/armour/HallHead.vue'
import { SkNote } from '../../components/deathwatch/skeleton'

const route = useRoute()
const store = useDeathwatch()
// Whether the list of views is open in the bottom sheet (a phone: from 900px wide it is the sidebar instead).
const sheetOpen = ref(false)

const page = computed(() => resolveArea(route.params))
const area = computed(() => AREAS[page.value.area])
// Manage is the Watch Commander's dashboard. Hiding it here only spares others a dead end: the server refuses them anyway.
const restricted = computed(() => page.value.area === 'manage' && !store.commander)
const currentTab = computed(() => area.value.tabs.find((t) => t.slug === page.value.tab))
const tabLabel = computed(() => currentTab.value.label)
// A single tab may be Deathwatch Command's (Watch Command): the rest of the area stays open. Hidden only, as above.
const locked = computed(() => currentTab.value.command === true && !store.command)
// The texts the open view reads, which the Watch Commander can edit in place ("Edit page"). Hidden only, as above.
const texts = computed(() => (store.commander ? pageTexts(page.value.area, page.value.tab, page.value.sub) : []))

// While a view's chunk is on its way (after a short delay, so a fast one never flashes it), and if it fails.
// From 900px the Armouring Hall has no rail (.solo): its views head themselves (HallHead). Where no view does (still
// loading, failed, or locked, below), its head is drawn here instead, so the hall never loses its way out.
// Recruitment heads itself the same way (HallHead with area="recruitment").
const solo = computed(() => ['armouringhall', 'recruitment'].includes(page.value.area))
const hallHead = () => (solo.value ? h(HallHead, { tab: page.value.tab, area: page.value.area }) : null)
const Loading = { render: () => [hallHead(), h('p', { class: 'dw-area-loading', role: 'status' }, 'Loading…')] }
// `error` is what defineAsyncComponent hands it: taken as a prop, so it does not fall on the fragment as an attribute.
const Failed = { props: ['error'], render: () => [hallHead(), h('p', { class: 'dw-area-error', role: 'alert' }, 'This view could not be loaded. Try again.')] }
// Keyed on a string: vue-router gives a fresh params object on every navigation (a query, an Armouring Hall item),
// and a view must only be rebuilt when the area or the tab changes, so it keeps what it holds across the rest.
const viewKey = computed(() => `${page.value.area}/${page.value.tab}`)
const view = computed(() => {
  const [areaSlug, tabSlug] = viewKey.value.split('/')
  const loader = pageLoader(areaSlug, tabSlug)
  return loader ? defineAsyncComponent({ loader, loadingComponent: Loading, errorComponent: Failed, delay: 200 }) : SkNote
})

// A tab change rebuilds the sheet, which would drop the keyboard's focus back to the top of the document: move it to
// the new view's heading instead, once the view has arrived (its chunk may still be on its way; a few frames at most).
// A view with no heading yet (loading, empty, an error) gives the focus to the sheet itself. A later tab change wins.
const sheet = ref(null)
const frame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(r) : setTimeout(r, 16)))
const focusOn = (el) => {
  el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}
watch(viewKey, async (key) => {
  for (let tries = 0; tries < 30; tries++) {
    await nextTick()
    if (viewKey.value !== key) return
    const heading = sheet.value?.querySelector('h1, h2')
    if (heading) return focusOn(heading)
    await frame()
  }
  if (viewKey.value === key && sheet.value) focusOn(sheet.value)
})
</script>

<template>
  <section v-if="page" class="dw-area" :class="{ solo }">
    <p v-if="restricted" class="dw-area-restricted dw-panel" role="status">Restricted to the Watch Commander.</p>
    <template v-else>
      <!-- The rail. On a phone only its head shows (the crest and the area's name); from 900px the list of views joins it. -->
      <aside class="dw-area-side dw-panel">
        <header class="dw-area-head">
          <!-- The Hall of Relics shows the gold crest, as on the old site; the Armouring Hall its own emblem. -->
          <img class="dw-area-crest" :src="{ hallofrelics: crestGold, armouringhall: crestArmour }[page.area] ?? crest" alt="" width="120" height="120" />
          <div>
            <p class="dw-area-eyebrow">Watch Fortress Ebonhold</p>
            <h1 class="dw-area-title">{{ area.label }}</h1>
          </div>
        </header>
        <div class="dw-area-navwrap">
          <DeathwatchNav :area="page.area" :current="page.tab" :command="store.command" />
        </div>
      </aside>
      <!-- A phone: the bar says which view is open and opens the list of views from the foot of the screen. -->
      <DeathwatchAreaBar class="dw-area-bar" :area-label="area.label" :tab-label="tabLabel" :open="sheetOpen" @open="sheetOpen = true" />
      <DeathwatchNavSheet v-model="sheetOpen" :aria-label="`${area.label} views`">
        <DeathwatchNav :area="page.area" :current="page.tab" :command="store.command" @navigate="sheetOpen = false" />
      </DeathwatchNavSheet>
      <div class="dw-area-main">
        <!-- Keyed on the view, so the whole framed sheet opens again (deathwatch.css) when the tab changes. -->
        <div :key="viewKey" ref="sheet" class="dw-area-sheet dw-panel">
          <template v-if="locked">
            <HallHead v-if="solo" :tab="page.tab" :area="page.area" />
            <p class="dw-area-restricted" role="status">Reserved for the Deathwatch Command.</p>
          </template>
          <component :is="view" v-else :key="viewKey" />
        </div>
      </div>
      <!-- Keyed on the address: an Armouring Hall uniform has texts of its own. -->
      <PageEditor v-if="texts.length" :key="page.canonical" :fields="texts" />
    </template>
  </section>
</template>

<style scoped>
.dw-area {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 1rem;
  min-height: calc(100dvh - 4rem);
  max-width: 86rem;
  margin: 0 auto;
  padding: 1.25rem 1rem 3rem;
}
/* A phone: the head is a flat, dense strip (no frame), like the original's crest bar, so the view starts sooner. */
.dw-area-side {
  margin-inline: -1rem;
  padding: 0.6rem 1rem;
  border: 0;
  border-image: none;
  border-bottom: 1px solid var(--dw-line);
  background: color-mix(in oklab, var(--dw-surface) 88%, transparent);
  box-shadow: none;
  clip-path: none;
  backdrop-filter: blur(14px) saturate(1.3);
}
.dw-area-side::before,
.dw-area-side::after {
  display: none;
}
.dw-area-head {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}
.dw-area-crest {
  flex: none;
  width: 44px;
  height: 44px;
  object-fit: contain;
  filter: drop-shadow(0 3px 8px rgb(0 0 0 / 0.45));
}
.dw-area-eyebrow {
  margin: 0 0 0.15rem;
  font: 600 0.75rem / 1.3 var(--dw-font-cond);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--dw-accent);
}
.dw-area-title {
  margin: 0;
  font-family: var(--dw-font-title);
  font-size: clamp(1.1rem, 4.6vw, 1.4rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: 0.04em;
  color: var(--dw-ink);
  text-wrap: balance;
}
/* The list of views has two homes: the bar and sheet below 900px, this rail from 900px. */
.dw-area-navwrap {
  display: none;
}
/* At least a screen tall: between one tab's view and the next (while its chunk loads) the sheet is empty, and it
   would fold to a thin frame at the top before the new view opens it again. */
.dw-area-sheet {
  min-width: 0;
  /* svh, not dvh: the phone's address bar sliding away must not move the footer under a short page. */
  min-height: calc(100svh - 9rem);
  padding: 1.2rem 1rem 1.6rem;
}
/* The heading the focus is moved to on a tab change: it is no control, so it shows no ring of its own. */
.dw-area-sheet :deep(:is(h1, h2)[tabindex='-1']:focus),
.dw-area-sheet[tabindex='-1']:focus {
  outline: none;
}
.dw-area-restricted {
  grid-column: 1 / -1;
  margin: 0;
  padding: 2rem 1.4rem;
  text-align: center;
  color: var(--dw-silver);
}
.dw-area-loading,
.dw-area-error {
  margin: 0;
  color: var(--dw-muted);
}
.dw-area-error {
  color: var(--dw-down);
}
@media (min-width: 900px) {
  .dw-area {
    grid-template-columns: 18.75rem minmax(0, 1fr);
    align-items: start;
    gap: 1.5rem;
    padding-top: 2rem;
  }
  .dw-area-side {
    position: sticky;
    top: 5rem;
    /* Never taller than the screen: on a short window the last links stay reachable by scrolling the rail. */
    max-height: calc(100dvh - 6rem);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    margin-inline: 0;
    padding: 1.6rem 1.25rem 1.25rem;
    border: 1px solid transparent;
    border-image: var(--dw-frame) 30 / 30px stretch;
    background-image:
      var(--dw-scan), var(--dw-grain),
      linear-gradient(180deg, rgb(8 13 8 / 0.9), rgb(3 6 3 / 0.94));
    background-color: transparent;
    backdrop-filter: none;
    clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px);
  }
  .dw-area-side::before,
  .dw-area-side::after {
    display: block;
  }
  .dw-area-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  .dw-area-crest {
    width: 120px;
    height: 120px;
  }
  .dw-area-eyebrow {
    font-size: 0.8rem;
  }
  .dw-area-title {
    font-size: 1.75rem;
    letter-spacing: 0.03em;
  }
  .dw-area-navwrap {
    display: block;
  }
  .dw-area-bar {
    display: none;
  }
  .dw-area-sheet {
    padding: 1.6rem 1.8rem 2rem;
  }
}
/* A wide screen: the rail docks at the left edge and the view sits in the middle of the screen, balanced on the
   right by an empty column the rail's width. The view keeps the width it has below (86rem less the padding, the
   rail and the gap), so only the rail moves and the view never narrows or widens across the step; the step is where
   the centre column first holds that width with a scrollbar taking its share of the window. */
@media (min-width: 1740px) {
  .dw-area {
    grid-template-columns: 18.75rem minmax(0, 1fr) 18.75rem;
    max-width: none;
    padding-inline: 1.5rem;
  }
  .dw-area-main {
    justify-self: center;
    width: 100%;
    max-width: calc(86rem - 2rem - 18.75rem - 1.5rem);
  }
}
/* The Armouring Hall heads its own tabs and the way back (HallHead.vue): from 900px it needs no rail, and its view
   is exactly as wide as the site's menu bar (AppNav: 76rem, 1.25rem in from each side), its edges under the bar's.
   On a phone the rail's head and the bar stay, as in every area. */
@media (min-width: 900px) {
  .dw-area.solo {
    grid-template-columns: minmax(0, 1fr);
    max-width: 76rem;
    padding-inline: 1.25rem;
  }
  .dw-area.solo .dw-area-side {
    display: none;
  }
  .dw-area.solo .dw-area-main {
    max-width: none;
  }
}
</style>
