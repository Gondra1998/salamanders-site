<script setup>
// One clip or piece of art in a gallery: its media, then who posted it and when. A stored video plays inline, a
// picture asks to be opened full size, and a link to a player site stays a static card until it is tapped, so
// opening the page never loads three players. Styles are in gallery.css.
import { computed, shallowRef } from 'vue'
import { embedSrc } from '../../lib/gallery/embed'
import { shouldReload, loaded } from '../../lib/gallery/reloadOnce'

const props = defineProps({
  item: { type: Object, required: true },
  canHide: Boolean,
})
const emit = defineEmits(['hide', 'open', 'reload'])

const PROVIDERS = { youtube: 'YouTube', twitch: 'Twitch', medal: 'Medal' }

// Pass the link itself, never the item: only a string is a link. `parent` is the page showing the player (Twitch
// refuses to play in a page it was not told about).
const player = computed(() => (props.item.media === 'embed' ? embedSrc(props.item.url, window.location.hostname) : null))
const provider = computed(() => PROVIDERS[player.value?.provider] ?? 'Clip link')
// A link that is not a web address is not offered as one.
const link = computed(() => (/^https?:\/\//i.test(props.item.url) ? props.item.url : null))

const playing = shallowRef(false)
const failed = shallowRef(false)
// Hiding takes the item away from everyone and cannot be undone from the page, so it asks first, in the card.
const confirming = shallowRef(false)

function hide() {
  confirming.value = false
  emit('hide', props.item.id)
}

const isImage = computed(() => props.item.media === 'image')
const alt = computed(() => props.item.title || 'Artwork')
const listKind = computed(() => (props.item.kind === 'clip' ? 'clips' : 'art'))
const date = computed(() => new Date(props.item.postedAt).toLocaleDateString())

// A media link is signed for 15 minutes, so the first failure is most likely an old link: ask the page for the
// list again, which brings fresh ones. A second failure, with nothing loaded in between, is not the link's age.
function onError() {
  if (failed.value) return
  if (shouldReload(props.item.id)) emit('reload', listKind.value)
  else failed.value = true
}
const onLoaded = () => loaded(props.item.id)
</script>

<template>
  <article class="rq-card panel-forge">
    <div class="rq-media">
      <p v-if="failed" class="rq-failed" role="status">
        {{ isImage ? "This image couldn't load." : "This clip couldn't load." }}
      </p>
      <video
        v-else-if="item.media === 'video'"
        class="rq-video"
        controls
        preload="metadata"
        playsinline
        :src="item.url"
        @error="onError"
        @loadedmetadata="onLoaded"
      />
      <button v-else-if="isImage" type="button" class="rq-open" @click="emit('open', item)">
        <img class="rq-img" loading="lazy" :src="item.url" :alt="alt" @error="onError" @load="onLoaded" />
      </button>
      <iframe
        v-else-if="playing && player"
        class="rq-frame"
        :src="player.src"
        :title="`${provider} clip`"
        allow="autoplay; fullscreen"
        allowfullscreen
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
      />
      <div v-else class="rq-embed">
        <p class="rq-provider">{{ provider }}</p>
        <button v-if="player" type="button" class="btn-ember btn-sm" @click="playing = true">Play</button>
        <a v-else-if="link" class="btn-drake btn-sm" :href="link" target="_blank" rel="noopener noreferrer">Open link</a>
      </div>
    </div>

    <div class="rq-meta">
      <div class="rq-text">
        <p v-if="item.title" class="rq-title">{{ item.title }}</p>
        <p class="rq-byline">
          {{ item.author?.name }} · <time :datetime="item.postedAt">{{ date }}</time>
        </p>
      </div>
      <template v-if="canHide">
        <div v-if="confirming" class="rq-confirm">
          <span class="rq-ask">Hide for everyone?</span>
          <button type="button" class="btn-ember btn-sm" @click="hide">Yes</button>
          <button type="button" class="btn-ghost btn-sm" @click="confirming = false">No</button>
        </div>
        <button
          v-else
          type="button"
          class="btn-ghost btn-sm rq-hide"
          :aria-label="`Hide ${item.title || 'this item'}`"
          @click="confirming = true"
        >
          Hide
        </button>
      </template>
    </div>
  </article>
</template>
