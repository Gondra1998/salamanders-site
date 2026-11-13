<script setup>
import { ref, computed, watch, useId } from 'vue'
import { usePerkCorrections } from '../stores/perkCorrections'
import { useAuth } from '../stores/auth'

// Edit / remove an existing perk, or (perk = null) add one to a tier. The
// store applies the change at once; a refusal rolls it back and lands here.
const props = defineProps({
  kind: { type: String, required: true },
  target: { type: String, required: true },
  quality: { type: String, default: null },
  perk: { type: Object, default: null },
  suggestions: { type: Array, default: () => [] },
})
// `state`: 'idle' when showing just the Edit/Remove buttons, else 'active'
// (a form open, a save in flight, or an error on show) — so a host knows
// not to retarget or unmount the panel under the user.
const emit = defineEmits(['done', 'state'])
const corrections = usePerkCorrections()
const auth = useAuth()
// Several panels can be on one page (edit + add, several weapon slots), so
// label/field ids must be per-instance.
const uid = useId()

const mode = ref(props.perk ? 'idle' : 'add') // idle | edit | remove | add
const name = ref('')
const text = ref(props.perk?.description || '')
const note = ref('')
const error = ref('')
const busy = ref(false)

function reset() {
  const p = props.perk
  mode.value = p ? 'idle' : 'add'
  text.value = p?.description || ''
  note.value = ''
  error.value = ''
}
// Hosts pass a fresh `{ name, description }` literal on every render, so
// watch the perk's value, not its identity, or any re-render (a hover, a
// node toggle) would wipe the draft. Our own save changes that value too:
// the store applies it at once (while busy) and, if refused, rolls it back
// to what it was when we saved — neither may wipe the draft or the error.
const perkKey = () => (props.perk ? props.perk.name + '\u0000' + (props.perk.description ?? '') : null)
let savedFrom = null
watch(perkKey, (key) => {
  if (busy.value) return
  if (error.value && key === savedFrom) return
  reset()
})
watch(
  () => (mode.value === 'idle' && !busy.value && !error.value ? 'idle' : 'active'),
  (s) => emit('state', s),
  { immediate: true },
)
const canSave = computed(() => {
  const t = text.value.trim()
  if (!t) return false
  return mode.value !== 'edit' || t !== (props.perk?.description || '').trim()
})
watch(name, (n) => {
  const hit = props.suggestions.find((s) => s.name === n.trim())
  if (hit) text.value = hit.description
})

async function save(op) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  savedFrom = perkKey()
  try {
    await corrections.submit(
      {
        kind: props.kind,
        target: props.target,
        quality: props.kind === 'weapon' ? props.quality : null,
        op,
        perkName: op === 'add' ? name.value.trim() : props.perk.name,
        description: op === 'remove' ? null : text.value.trim(),
        note: note.value.trim() || null,
      },
      auth.token,
    )
    // The perk-change watcher stood down while busy, so settle here.
    if (props.perk) reset()
    emit('done')
  } catch (err) {
    error.value = err.message || 'That did not save.'
  } finally {
    busy.value = false
  }
}

function cancel() {
  if (props.perk) {
    reset()
  } else {
    emit('done')
  }
}
</script>

<template>
  <div class="pe">
    <div v-if="mode === 'idle'" class="pe-actions">
      <button type="button" class="pe-edit" @click="mode = 'edit'">Edit text</button>
      <button v-if="kind === 'weapon'" type="button" class="pe-remove" @click="mode = 'remove'">Remove from this tier</button>
    </div>

    <div v-else-if="mode === 'remove'" class="pe-actions">
      <span>Remove {{ perk.name }} from {{ quality }}?</span>
      <input v-model="note" class="pe-note" maxlength="200" placeholder="Note (optional), e.g. checked in game, patch 14.1" aria-label="Note" />
      <button type="button" class="pe-confirm" :disabled="busy" @click="save('remove')">Remove</button>
      <button type="button" @click="cancel">Cancel</button>
    </div>

    <form v-else class="pe-form" @submit.prevent="save(mode === 'add' ? 'add' : 'edit')">
      <template v-if="mode === 'add'">
        <label class="pe-label" :for="`${uid}-name`">Perk name</label>
        <input :id="`${uid}-name`" v-model="name" class="pe-name" maxlength="80" :list="`${uid}-suggest`" required />
        <datalist :id="`${uid}-suggest`">
          <option v-for="s in suggestions" :key="s.name" :value="s.name" />
        </datalist>
      </template>
      <label class="pe-label" :for="`${uid}-text`">Perk text</label>
      <textarea :id="`${uid}-text`" v-model="text" rows="3" maxlength="500" required />
      <input v-model="note" class="pe-note" maxlength="200" placeholder="Note (optional), e.g. checked in game, patch 14.1" aria-label="Note" />
      <div class="pe-actions">
        <button type="submit" :disabled="busy || !canSave">Save</button>
        <button type="button" @click="cancel">Cancel</button>
      </div>
    </form>

    <p v-if="error" class="pe-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.pe {
  margin-top: 0.7rem;
  padding-top: 0.7rem;
  border-top: 1px dashed var(--color-ash);
}
.pe-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-sm);
  color: var(--color-pewter);
}
.pe-form {
  display: grid;
  gap: 0.4rem;
}
.pe-label {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-smoke);
}
.pe input,
.pe textarea {
  background: color-mix(in srgb, var(--color-obsidian) 70%, transparent);
  border: 1px solid var(--color-ash);
  color: var(--color-bone);
  border-radius: var(--radius-sm);
  padding: 0.4rem 0.5rem;
  font: inherit;
  font-size: var(--text-sm);
}
.pe button {
  min-width: var(--tap);
  min-height: var(--tap);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: max(var(--text-xs), var(--text-floor));
  color: var(--color-bone);
  background: transparent;
  border: 1px solid var(--color-ash-2);
  border-radius: var(--radius-sm);
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  transition: transform var(--dur-press) var(--ease-forge);
}
.pe button:active:not(:disabled) {
  transform: scale(0.97);
}
.pe .pe-confirm {
  border-color: var(--color-ember);
  color: var(--color-ember);
}
@media (hover: hover) and (pointer: fine) {
  .pe .pe-remove:hover {
    border-color: var(--color-ember);
    color: var(--color-ember);
  }
}
.pe-error {
  margin-top: 0.4rem;
  color: var(--color-ember);
  font-size: var(--text-sm);
}
</style>
