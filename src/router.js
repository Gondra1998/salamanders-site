import { createRouter, createWebHistory } from 'vue-router'
import Landing from './views/Landing.vue'
import { scrubCallbackHash } from './lib/discordAuth'
import { legacyRosterTarget } from './lib/companyKeys'
import { deathwatchRedirect } from './lib/deathwatch/redirect'

// Must run before createWebHashHistory() below reads location.hash — see
// discordAuth.js for why this can't just happen in main.js.
scrubCallbackHash()

const routes = [
  { path: '/', name: 'home', component: Landing, meta: { title: 'Home' } },
  {
    path: '/planner',
    name: 'planner',
    component: () => import('./views/Planner.vue'),
    meta: { title: 'Perk Builder' },
  },
  {
    path: '/armoury',
    name: 'armoury',
    component: () => import('./views/Armoury.vue'),
    meta: { title: 'Armoury' },
  },
  {
    path: '/builds',
    name: 'builds',
    component: () => import('./views/Builds.vue'),
    meta: { title: 'Builds' },
  },
  {
    path: '/companies',
    name: 'companies',
    component: () => import('./views/Companies.vue'),
    meta: { title: 'Companies' },
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('./views/Reports.vue'),
    meta: { title: 'Reports' },
  },
  {
    path: '/reports/review',
    name: 'reports-review',
    component: () => import('./views/ReportsReview.vue'),
    meta: { title: 'Report Review' },
  },
  // The members' galleries of clips and art. The tab is part of the address so a tab can be linked; the page
  // itself falls back to Clips for a tab the person may not see.
  {
    path: '/reliquarium/:tab(clips|art|submit|mine|review)?',
    name: 'reliquarium',
    component: () => import('./views/Reliquarium.vue'),
    meta: { title: 'Reliquarium' },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('./views/History.vue'),
    meta: { title: 'Version History' },
  },
  // The roster moved onto /companies; old links (and bookmarks, with their #branch-key) still land.
  { path: '/roster', redirect: legacyRosterTarget },
  {
    path: '/accolades/legacy',
    name: 'legacy-accolades',
    component: () => import('./views/LegacyAccolades.vue'),
    meta: { title: 'Legacy Accolades', ashOver: true },
  },
  // Watch Fortress Ebonhold: the Deathwatch community's area. The layout puts the theme and the access gate
  // around every page under it, so nothing below needs to check access itself. The area pages' addresses
  // are kept canonical by deathwatchRedirect, the router.beforeEach guard registered below.
  {
    path: '/deathwatch',
    component: () => import('./views/deathwatch/DeathwatchLayout.vue'),
    meta: { title: 'Watch Fortress Ebonhold', ashOver: true },
    children: [
      { path: '', name: 'deathwatch', component: () => import('./views/deathwatch/DeathwatchHub.vue') },
      {
        path: ':area/:tab?/:sub?',
        name: 'deathwatch-area',
        component: () => import('./views/deathwatch/DeathwatchArea.vue'),
      },
    ],
  },
  ...[
    { key: 'accolades', title: 'Accolades' },
    { key: 'ranks', title: 'Ranks' },
  ].map(({ key, title }) => ({
    path: `/${key}/:threadId(\\d{17,20})?`,
    name: key,
    component: () => import('./views/ArchiveView.vue'),
    props: (r) => ({ collectionKey: key, threadId: r.params.threadId || null }),
    // Near ash falls over the plaque, not behind it (MountDeathfire).
    meta: { title, ashOver: true },
  })),
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./views/NotFound.vue'),
    meta: { title: 'Not found' },
  },
]

export const router = createRouter({
  // Clean URLs now that we're on a real domain. GitHub Pages still has no
  // server-side rewrite, so a direct load of a deep route relies on the
  // public/404.html + index.html pair to restore the path before this
  // constructor reads it — see those files for the mechanism.
  history: createWebHistory(),
  routes,
  // Legion Archive threads scroll to their own #m-<id> anchors once decrypted
  // content has rendered (see ArchiveThread.vue); same-page hash changes
  // are left to them.
  scrollBehavior(to, from) {
    if (to.hash && to.path === from.path) return false
    // /companies#third is scrolled to by the page itself: as soon as its story is there, and again when
    // the roster has changed the layout above it. A jump to the top here would undo the first of those.
    if (to.hash && to.path === '/companies') return false
    return { top: 0 }
  },
})

// One address for every Deathwatch page, on entry and on a change of tab alike (see redirect.js).
router.beforeEach(deathwatchRedirect)

router.afterEach((to) => {
  const t = to.meta?.title
  document.title = t ? `Salamanders — ${t}` : 'Salamanders — SM2 Clan'
})
