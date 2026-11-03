<script setup>
// The Reliquarium: the Legion's clips and art. This page is the gate (it shows the galleries only to someone the
// server clears, and otherwise says why not), the tab bar, and whichever tab the address names. It trusts nothing
// but the server's answer: the `isMember` hint that shows the nav entry is not consulted here, and the state in
// the store only decides what to show (the server checks every read and write again).
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../stores/auth'
import { useGallery } from '../stores/gallery'
import PageHeader from '../components/PageHeader.vue'
import GalleryGrid from '../components/gallery/GalleryGrid.vue'
import SubmitForm from '../components/gallery/SubmitForm.vue'
import MineList from '../components/gallery/MineList.vue'
import ReviewQueue from '../components/gallery/ReviewQueue.vue'
import '../components/gallery/gallery.css'

const auth = useAuth()
const gallery = useGallery()
const route = useRoute()

// auth.token reads storage and isn't reactive; auth.member is (signing out clears it), so it drives the check.
// Signing out also empties the store, so nothing of the last person's lists is left for the next.
watch(
  () => auth.member,
  (member) => {
    if (!member) gallery.reset()
    gallery.load(auth.token)
  },
  { immediate: true },
)

const busy = computed(() => gallery.status === 'idle' || gallery.status === 'checking')
const signIn = () => auth.signIn({ returnTo: route.fullPath })
const retry = () => gallery.load(auth.token)

const waiting = computed(() => gallery.review.items.length)
const tabs = computed(() => [
  { key: 'clips', label: 'Clips' },
  { key: 'art', label: 'Artwork' },
  { key: 'submit', label: 'Submit' },
  { key: 'mine', label: 'Mine' },
  ...(gallery.approver ? [{ key: 'review', label: 'Review' }] : []),
])
// A tab the person may not see (Review, for a member) shows the Clips, and marks Clips as the open tab.
const tab = computed(() => {
  const asked = route.params.tab || 'clips'
  return tabs.value.some((t) => t.key === asked) ? asked : 'clips'
})

// The number on the Review tab is what the queue holds, so an approver's queue is fetched as soon as the page
// opens, whichever tab it opens on. (On the Review tab the queue fetches itself.) Only once the check has settled:
// a new check drops answers that are still on their way.
watch(
  () => gallery.status === 'allowed' && gallery.approver && tab.value !== 'review',
  (wanted) => {
    if (wanted) gallery.loadReview(auth.token).catch(() => {})
  },
  { immediate: true },
)
</script>

<template>
  <section class="rq">
    <PageHeader eyebrow="Members only" title="Reliquarium" lede="Clips and artwork from the Legion, kept in one place." />

    <div v-if="gallery.status !== 'allowed'" class="rq-gate surface" :aria-busy="busy ? 'true' : undefined">
      <template v-if="gallery.status === 'signin'">
        <p>Sign in with Discord to see the Reliquarium.</p>
        <button class="btn-ember" type="button" @click="signIn">Sign in with Discord</button>
      </template>
      <p v-else-if="busy" role="status">Checking…</p>
      <p v-else-if="gallery.status === 'denied'">Restricted to the XVIIIth Legion.</p>
      <template v-else>
        <p role="alert">The Reliquarium couldn't be reached.</p>
        <button class="btn-ember" type="button" @click="retry">Retry</button>
      </template>
    </div>

    <template v-else>
      <nav class="rq-tabs" aria-label="Reliquarium sections">
        <RouterLink
          v-for="t in tabs"
          :key="t.key"
          class="rq-tab"
          :to="`/reliquarium/${t.key}`"
          :aria-current="t.key === tab ? 'page' : null"
        >
          {{ t.label }}
          <span v-if="t.key === 'review' && waiting > 0" class="rq-badge">{{ waiting }}</span>
        </RouterLink>
      </nav>

      <GalleryGrid v-if="tab === 'clips' || tab === 'art'" :key="tab" :kind="tab" />
      <SubmitForm v-else-if="tab === 'submit'" />
      <MineList v-else-if="tab === 'mine'" />
      <ReviewQueue v-else />
    </template>
  </section>
</template>
