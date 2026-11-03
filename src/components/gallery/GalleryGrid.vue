<script setup>
// The Clips or Artwork tab: the approved items of one kind as a grid of cards, newest first, a page at a time. It
// fills its own list when it has none, and keeps it in the store so coming back to the tab is instant. Only
// mounted for someone the server has cleared.
import { computed, onMounted, shallowRef } from 'vue'
import { useAuth } from '../../stores/auth'
import { useGallery } from '../../stores/gallery'
import { useActionError } from '../../lib/gallery/useActionError'
import GalleryCard from './GalleryCard.vue'
import Lightbox from './Lightbox.vue'

const props = defineProps({ kind: { type: String, required: true, validator: (k) => k === 'clips' || k === 'art' } })

const auth = useAuth()
const gallery = useGallery()
const { error, run } = useActionError()

const list = computed(() => gallery[props.kind])
const viewing = shallowRef(null)

const refresh = () => run(() => gallery.refresh(props.kind, auth.token))
onMounted(() => {
  if (list.value.items.length === 0 && !list.value.loading) refresh()
})

const more = () => run(() => gallery.more(props.kind, auth.token))
// The store drops an item from the lists the moment it is hidden and only then fetches the review queue again, so
// an item that is gone from the list means the hide went through and only that last step failed.
const hide = (id) =>
  run(() => gallery.hide(id, '', auth.token), { stillListed: () => list.value.items.some((i) => i.id === id) })
</script>

<template>
  <div class="rq-panel">
    <p v-if="error" class="rq-error" role="alert">{{ error }}</p>
    <ul v-if="list.items.length" class="rq-grid">
      <li v-for="item in list.items" :key="item.id">
        <GalleryCard :item="item" :can-hide="gallery.approver" @hide="hide" @open="viewing = $event" @reload="refresh" />
      </li>
    </ul>
    <p v-else-if="list.loading" class="rq-muted" role="status">Loading…</p>
    <p v-else-if="!error" class="rq-muted">Nothing here yet.</p>

    <button v-if="list.next !== null" type="button" class="btn-drake btn-sm rq-more" :disabled="list.loading" @click="more">
      Load more
    </button>

    <Lightbox v-if="viewing" :item="viewing" @close="viewing = null" />
  </div>
</template>
