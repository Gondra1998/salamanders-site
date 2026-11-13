<script setup>
// The person's own clips and art in every status, with where each one stands and, while it can still be taken
// down, a Remove that asks first, in the row, without a browser dialog. A removal is for good: the server deletes
// the piece, its file and its history.
import { onMounted, shallowRef } from 'vue'
import { useAuth } from '../../stores/auth'
import { useGallery } from '../../stores/gallery'
import { useActionError } from '../../lib/gallery/useActionError'

const REMOVABLE = ['pending', 'approved', 'rejected']
const CHIPS = { pending: 'Pending', approved: 'Approved', hidden: 'Hidden', removed: 'Removed' }

const auth = useAuth()
const gallery = useGallery()
const { error, run } = useActionError()

const loading = shallowRef(true)
const asking = shallowRef(null)
const removing = shallowRef(null)

onMounted(async () => {
  await run(() => gallery.loadMine(auth.token))
  loading.value = false
})

const nameOf = (item) => item.title || (item.kind === 'clip' ? 'Clip' : 'Artwork')
const chipOf = (item) =>
  item.status === 'rejected' ? (item.reviewNote ? `Rejected: ${item.reviewNote}` : 'Rejected') : (CHIPS[item.status] ?? item.status)
const date = (item) => new Date(item.postedAt).toLocaleDateString()

async function remove(id) {
  if (removing.value !== null) return
  removing.value = id
  await run(() => gallery.remove(id, auth.token))
  removing.value = null
  asking.value = null
}
</script>

<template>
  <div class="rq-panel">
    <p v-if="error" class="rq-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="rq-muted" role="status">Loading…</p>
    <ul v-else-if="gallery.mine.length" class="rq-mine">
      <li v-for="item in gallery.mine" :key="item.id" class="rq-mine-row panel-forge">
        <div class="rq-mine-text">
          <p class="rq-title">{{ nameOf(item) }}</p>
          <p class="rq-byline">
            {{ item.kind === 'clip' ? 'Clip' : 'Artwork' }} · <time :datetime="item.postedAt">{{ date(item) }}</time>
          </p>
        </div>
        <span class="rq-chip" :data-status="item.status">{{ chipOf(item) }}</span>
        <div v-if="REMOVABLE.includes(item.status)" class="rq-mine-actions">
          <template v-if="asking === item.id">
            <span class="rq-ask">Remove for good? It goes from the Reliquarium entirely, file and all.</span>
            <button type="button" class="btn-ember btn-sm" :disabled="removing !== null" @click="remove(item.id)">Yes</button>
            <button type="button" class="btn-ghost btn-sm" :disabled="removing !== null" @click="asking = null">No</button>
          </template>
          <button v-else type="button" class="btn-ghost btn-sm" @click="asking = item.id">Remove</button>
        </div>
      </li>
    </ul>
    <p v-else-if="!error" class="rq-muted">Nothing here yet.</p>
  </div>
</template>
