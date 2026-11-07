<script setup>
// The approvers' queue: every pending piece as a card, to Approve or Reject (a rejection needs a reason, which the
// artist reads in Mine), and above it how the clips poll is doing. The page loads the queue before this tab is
// opened only to count it; opening the tab fetches it again so it is fresh.
import { computed, onMounted, shallowRef } from 'vue'
import { useAuth } from '../../stores/auth'
import { useGallery } from '../../stores/gallery'
import { useActionError } from '../../lib/gallery/useActionError'
import EventLog from './EventLog.vue'
import TakedownList from './TakedownList.vue'
import GalleryCard from './GalleryCard.vue'
import Lightbox from './Lightbox.vue'

const auth = useAuth()
const gallery = useGallery()
const { error, run } = useActionError()

const loading = shallowRef(true)
const viewing = shallowRef(null)
const rejecting = shallowRef(null)
const reason = shallowRef('')
const busy = shallowRef(null)

const sync = computed(() => gallery.review.sync)
const when = (iso) => (iso ? new Date(iso).toLocaleString() : 'never')

const load = () => run(() => gallery.loadReview(auth.token))
onMounted(async () => {
  await load()
  loading.value = false
})

function startReject(id) {
  rejecting.value = id
  reason.value = ''
}
const cancel = () => (rejecting.value = null)

async function decide(id, action) {
  if (busy.value !== null) return false
  busy.value = id
  const worked = await run(action)
  busy.value = null
  return worked
}
const approve = (id) => decide(id, () => gallery.approve(id, auth.token))
async function confirmReject(id) {
  const why = reason.value.trim()
  if (why === '') return
  if (await decide(id, () => gallery.reject(id, why, auth.token))) cancel()
}
</script>

<template>
  <div class="rq-panel">
    <template v-if="sync">
      <p class="rq-sync rq-muted">Clips poll: last run {{ when(sync.lastRunAt) }}, last success {{ when(sync.lastOkAt) }}</p>
      <p v-if="sync.lastError" class="rq-sync-error rq-error">Last poll error: {{ sync.lastError }}</p>
    </template>

    <p v-if="error" class="rq-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="rq-muted" role="status">Loading…</p>
    <ul v-else-if="gallery.review.items.length" class="rq-grid rq-review">
      <li v-for="item in gallery.review.items" :key="item.id" class="rq-review-item">
        <GalleryCard :item="item" @open="viewing = $event" @reload="load" />
        <form v-if="rejecting === item.id" class="rq-reject" @submit.prevent="confirmReject(item.id)">
          <label class="rq-field">
            <span>Why?</span>
            <textarea v-model="reason" class="rq-input" rows="3" maxlength="500" />
          </label>
          <div class="rq-actions">
            <button type="submit" class="btn-ember btn-sm" :disabled="reason.trim() === '' || busy !== null">Confirm</button>
            <button type="button" class="btn-ghost btn-sm" :disabled="busy !== null" @click="cancel">Cancel</button>
          </div>
        </form>
        <div v-else class="rq-actions">
          <button type="button" class="btn-ember btn-sm" :disabled="busy !== null" @click="approve(item.id)">Approve</button>
          <button type="button" class="btn-ghost btn-sm" :disabled="busy !== null" @click="startReject(item.id)">Reject</button>
        </div>
      </li>
    </ul>
    <p v-else-if="!error" class="rq-muted">Nothing waiting for review.</p>

    <TakedownList />
    <EventLog />

    <Lightbox v-if="viewing" :item="viewing" @close="viewing = null" />
  </div>
</template>
