<script setup>
// The form that puts a piece of art in the review queue. The checks here only save a round trip: the server
// checks the file's real type and size, and the title and note, again.
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useAuth } from '../../stores/auth'
import { useGallery } from '../../stores/gallery'

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_BYTES = 10_485_760

const auth = useAuth()
const gallery = useGallery()

const picker = useTemplateRef('picker')
const file = shallowRef(null)
const title = shallowRef('')
const note = shallowRef('')
const problem = shallowRef('')
const done = shallowRef(false)
const sending = shallowRef(false)

const ready = computed(() => file.value !== null && title.value.trim() !== '' && !sending.value)

function fileProblem(picked) {
  if (!TYPES.includes(picked.type)) return 'That file is not a JPEG, PNG, WebP or GIF.'
  if (picked.size > MAX_BYTES) return 'The file is too large (10 MB at most).'
  return ''
}

function choose(event) {
  const picked = event.target.files?.[0] ?? null
  done.value = false
  problem.value = picked ? fileProblem(picked) : ''
  file.value = picked && !problem.value ? picked : null
}

async function send() {
  if (!ready.value) return
  sending.value = true
  problem.value = ''
  done.value = false
  try {
    await gallery.submit({ file: file.value, title: title.value.trim(), note: note.value.trim() }, auth.token)
    done.value = true
    file.value = null
    title.value = ''
    note.value = ''
    picker.value.value = ''
  } catch (err) {
    problem.value = err?.message || 'Something went wrong.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <form class="rq-form panel-forge" @submit.prevent="send">
    <label class="rq-field">
      <span>Image (JPEG, PNG, WebP or GIF, 10 MB at most)</span>
      <input ref="picker" class="rq-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" @change="choose" />
    </label>
    <label class="rq-field">
      <span>Title</span>
      <input v-model="title" class="rq-input" type="text" maxlength="120" autocomplete="off" />
    </label>
    <label class="rq-field">
      <span>Note (optional)</span>
      <textarea v-model="note" class="rq-input" rows="4" maxlength="500" />
    </label>

    <p v-if="problem" class="rq-error" role="alert">{{ problem }}</p>
    <p v-if="done" class="rq-done" role="status">Submitted. An approver will look at it.</p>

    <button class="btn-ember rq-submit" type="submit" :disabled="!ready">{{ sending ? 'Sending…' : 'Submit' }}</button>
  </form>
</template>
