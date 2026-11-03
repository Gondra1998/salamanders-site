<script setup>
// A piece of art at full size over the page. It is a modal dialog: the keyboard goes to its Close button when it
// opens and stays there (the Close button is the only thing in it that takes focus), Escape or a tap on the dark
// area closes it, and the keyboard goes back to where it was when it closes.
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

defineProps({ item: { type: Object, required: true } })
const emit = defineEmits(['close'])

const closeButton = useTemplateRef('closeButton')
const opener = document.activeElement

function onKey(event) {
  if (event.key === 'Escape') emit('close')
  else if (event.key === 'Tab') {
    event.preventDefault()
    closeButton.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  closeButton.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  if (opener?.isConnected) opener.focus?.()
})
</script>

<template>
  <div class="rq-lightbox" role="dialog" aria-modal="true" :aria-label="item.title || 'Artwork'" @click.self="emit('close')">
    <button ref="closeButton" type="button" class="btn-ghost btn-sm rq-close" @click="emit('close')">Close</button>
    <figure class="rq-lightbox-figure">
      <img class="rq-lightbox-img" :src="item.url" :alt="item.title || 'Artwork'" />
      <figcaption class="rq-lightbox-caption">
        <p v-if="item.title" class="rq-title">{{ item.title }}</p>
        <p class="rq-byline">{{ item.author?.name }}</p>
        <p v-if="item.note" class="rq-note">{{ item.note }}</p>
      </figcaption>
    </figure>
  </div>
</template>
