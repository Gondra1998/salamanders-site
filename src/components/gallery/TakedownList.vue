<script setup>
// Under the Review tab, shut until an approver opens it: the pieces taken down (rejected, hidden or removed) whose
// file R2 or the backup still holds, each with a Delete for good that asks first, in the row. Only the file goes,
// from R2 at once and from the backup that night; the record of the piece and why it was taken down stay.
import { shallowRef } from 'vue'
import { useAuth } from '../../stores/auth'
import { useGallery } from '../../stores/gallery'
import { useActionError } from '../../lib/gallery/useActionError'

const CHIPS = { rejected: 'Rejected', hidden: 'Hidden', removed: 'Removed' }

const auth = useAuth()
const gallery = useGallery()
const { error, run } = useActionError()

const open = shallowRef(false)
const loading = shallowRef(false)
// Only a successful load counts: after a failure, opening it again asks again.
const loaded = shallowRef(false)
const asking = shallowRef(null)
const busy = shallowRef(false)

const nameOf = (item) => item.title || (item.kind === 'clip' ? 'Clip' : 'Artwork')
const date = (item) => new Date(item.postedAt).toLocaleDateString()

async function toggle() {
  open.value = !open.value
  if (!open.value || loaded.value || loading.value) return
  loading.value = true
  loaded.value = await run(() => gallery.loadTakedowns(auth.token))
  loading.value = false
}

async function erase(id) {
  if (busy.value) return
  busy.value = true
  await run(() => gallery.eraseFile(id, auth.token), { stillListed: () => gallery.takedowns.some((i) => i.id === id) })
  busy.value = false
  asking.value = null
}
</script>

<template>
  <section class="rq-events rq-takedowns">
    <button
      type="button"
      class="btn-ghost btn-sm rq-takedowns-toggle"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? 'rq-takedowns-body' : undefined"
      @click="toggle"
    >
      Taken down
    </button>
    <div v-if="open" id="rq-takedowns-body" class="rq-events-body">
      <p v-if="error" class="rq-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="rq-muted" role="status">Loading…</p>
      <ul v-else-if="gallery.takedowns.length" class="rq-mine">
        <li v-for="item in gallery.takedowns" :key="item.id" class="rq-mine-row panel-forge">
          <div class="rq-mine-text">
            <p class="rq-title">{{ nameOf(item) }}</p>
            <p class="rq-byline">
              {{ item.kind === 'clip' ? 'Clip' : 'Artwork' }} · {{ item.author?.name }} ·
              <time :datetime="item.postedAt">{{ date(item) }}</time>
            </p>
          </div>
          <span class="rq-chip" :data-status="item.status">{{ CHIPS[item.status] ?? item.status }}</span>
          <div class="rq-mine-actions">
            <template v-if="asking === item.id">
              <span class="rq-ask">Delete the file for good? It can't be brought back.</span>
              <button type="button" class="btn-ember btn-sm" :disabled="busy" @click="erase(item.id)">Delete</button>
              <button type="button" class="btn-ghost btn-sm" :disabled="busy" @click="asking = null">Keep</button>
            </template>
            <button v-else type="button" class="btn-ghost btn-sm" @click="asking = item.id">Delete for good</button>
          </div>
        </li>
      </ul>
      <p v-else-if="!error" class="rq-muted">Nothing taken down holds a file.</p>
    </div>
  </section>
</template>
