<script setup>
// The audit log under the Review tab: who did what to which item, newest first. It stays shut, and asks the
// server for nothing, until an approver opens it; the first successful open loads the newest page, and "Load
// more" adds the page after it.
import { computed, shallowRef } from 'vue'
import { useAuth } from '../../stores/auth'
import { useGallery } from '../../stores/gallery'
import { useActionError } from '../../lib/gallery/useActionError'

const WORDS = {
  stored: 'Stored',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  hidden: 'Hidden',
  removed: 'Removed',
  discord_deleted: 'Deleted on Discord',
}

const auth = useAuth()
const gallery = useGallery()
const { error, run } = useActionError()

const open = shallowRef(false)
const loading = shallowRef(false)
// Only a successful load counts: after a failure, opening it again asks again.
const loaded = shallowRef(false)

const events = computed(() => gallery.events)
const word = (event) => WORDS[event.action] ?? event.action
const when = (event) => new Date(event.createdAt).toLocaleString()

async function fill(action) {
  loading.value = true
  const worked = await run(action)
  loading.value = false
  return worked
}

async function toggle() {
  open.value = !open.value
  if (open.value && !loaded.value && !loading.value) loaded.value = await fill(() => gallery.loadEvents(auth.token))
}
const more = () => fill(() => gallery.moreEvents(auth.token))
</script>

<template>
  <section class="rq-events">
    <button type="button" class="btn-ghost btn-sm rq-events-toggle" :aria-expanded="open ? 'true' : 'false'" aria-controls="rq-events-body" @click="toggle">
      Recent activity
    </button>
    <div v-if="open" id="rq-events-body" class="rq-events-body">
      <p v-if="error" class="rq-error" role="alert">{{ error }}</p>
      <ul v-if="events.items.length" class="rq-events-list">
        <li v-for="event in events.items" :key="event.id" class="rq-event">
          <span class="rq-event-action">{{ word(event) }}</span>
          <span class="rq-event-actor">{{ event.actor?.username }}</span>
          <time class="rq-event-time" :datetime="event.createdAt">{{ when(event) }}</time>
          <span v-if="event.note" class="rq-event-note">{{ event.note }}</span>
        </li>
      </ul>
      <p v-else-if="loading" class="rq-muted" role="status">Loading…</p>
      <p v-else-if="!error" class="rq-muted">Nothing recorded yet.</p>
      <button v-if="events.next !== null" type="button" class="btn-drake btn-sm rq-more" :disabled="loading" @click="more">
        Load more
      </button>
    </div>
  </section>
</template>
