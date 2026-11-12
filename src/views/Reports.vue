<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useAuth } from '../stores/auth'
import * as api from '../lib/reportsApi'
import { prefillUrl } from '../lib/reportPrefill'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'

const auth = useAuth()
const access = ref(null) // {reporter, reviewer, admin} once known
const error = ref('')
const mine = ref([])

const blank = () => ({ reportedMember: '', incidentDate: '', medium: '', mediumOther: '', witnesses: '', description: '' })
const form = reactive(blank())
const involvesReclusiarch = ref(false)
const sending = ref(false)
const sent = ref(null)

async function load() {
  error.value = ''
  if (!auth.token) return
  try {
    access.value = await api.getAccess(auth.token)
    if (access.value.reporter) mine.value = await api.listMine(auth.token)
  } catch (err) {
    error.value = err.message || 'Could not reach the reports server.'
  }
}
onMounted(load)

// Bypass: the member files the official form themselves; nothing stored here.
const officialLink = computed(() => prefillUrl(form, { filer: auth.member?.username }))

async function submit() {
  if (sending.value) return
  sending.value = true
  error.value = ''
  try {
    const { id } = await api.fileReport({ ...form }, auth.token)
    sent.value = id
    Object.assign(form, blank())
    mine.value = await api.listMine(auth.token)
  } catch (err) {
    error.value = err.message || 'Could not file the report.'
  } finally {
    sending.value = false
  }
}

const fmt = (d) => new Date(d).toLocaleDateString()
</script>

<template>
  <section class="reports">
    <PageHeader
      eyebrow="Reclusiam"
      title="File a Report"
      lede="Report conduct that breaks the Chapter's code. A Reclusiarch reviews every report and either deals with it or escalates it to High Command. You'll see its status below. Your name goes with the report."
    />

    <StatePanel v-if="!auth.signedIn || !auth.token" kind="gate" class="r-gate" body="Sign in with Discord to file a report.">
      <button type="button" class="btn-ember btn-md" @click="auth.signIn()">Sign in with Discord</button>
    </StatePanel>

    <StatePanel v-else-if="error" kind="error" class="r-error" :body="error" />
    <StatePanel v-else-if="!access" kind="loading" class="r-loading" body="Checking your roles…" />

    <StatePanel v-else-if="!access.reporter" kind="gate" class="r-gate" body="Reports are open to XVIIIth Legion members." />

    <template v-if="access?.reporter">
      <RouterLink v-if="access.reviewer || access.admin" to="/reports/review" class="ilink r-review-link">
        Open the review queue →
      </RouterLink>

      <p v-if="sent" class="r-sent" role="status">Report #{{ sent }} filed. A Reclusiarch has been notified.</p>

      <form class="panel-forge r-form" @submit.prevent="submit">
        <label>Member being reported <span class="req">*</span>
          <input v-model="form.reportedMember" class="field-forge" maxlength="200" required />
        </label>
        <label>When did it happen?
          <input v-model="form.incidentDate" class="field-forge" type="date" />
        </label>
        <label>Where did it happen? <span class="req">*</span>
          <select v-model="form.medium" class="field-forge" required>
            <option value="" disabled>Choose…</option>
            <option value="text">Discord text channel</option>
            <option value="voice">Discord voice channel</option>
            <option value="dm">Discord direct message</option>
            <option value="other">Somewhere else</option>
          </select>
        </label>
        <label v-if="form.medium === 'other'">Where? <span class="req">*</span>
          <input v-model="form.mediumOther" class="field-forge" maxlength="200" required />
        </label>
        <label>Anyone else present?
          <input v-model="form.witnesses" class="field-forge" maxlength="1000" placeholder="Names, if it was a private interaction" />
        </label>
        <label>What happened? <span class="req">*</span>
          <textarea v-model="form.description" class="field-forge" rows="7" maxlength="4000" required />
        </label>

        <label class="r-check">
          <input v-model="involvesReclusiarch" type="checkbox" />
          This involves a Reclusiarch
        </label>

        <div v-if="involvesReclusiarch" class="r-bypass surface">
          <p>
            Reports involving a Reclusiarch go straight to High Command's official form. Nothing is saved here.
            The form opens pre-filled with what you've written; check it and submit it there.
          </p>
          <a class="btn-ember btn-md" :href="officialLink" target="_blank" rel="noopener">Open the official form</a>
        </div>
        <button v-else class="btn-ember btn-md" type="submit" :disabled="sending">
          {{ sending ? 'Filing…' : 'File report' }}
        </button>
      </form>

      <section v-if="mine.length" class="r-mine">
        <h2 class="r-h2">My reports</h2>
        <ul>
          <li v-for="r in mine" :key="r.id" class="panel-forge r-row">
            <span>#{{ r.id }} · {{ r.reportedMember }}</span>
            <span class="r-muted">{{ fmt(r.createdAt) }}</span>
            <span class="r-status" :data-status="r.status">{{ api.STATUS_LABELS[r.status] }}</span>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.reports {
  max-width: 48rem;
  margin: 0 auto;
  padding: 4rem 1.5rem 2rem;
}
.r-muted {
  color: var(--color-smoke);
  line-height: 1.6;
}

/* A gate, the roles check and an error are StatePanels (the shared panel); the page only spaces them. */
.r-gate,
.r-loading,
.r-error {
  margin-top: 1.6rem;
}

.r-form {
  margin-top: 1.6rem;
  padding: 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
}
.r-form label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  color: var(--color-bone);
  font-size: var(--text-md);
}
/* The look is .field-forge (style.css); the form only sets the width. */
.r-form input:not([type='checkbox']),
.r-form select,
.r-form textarea {
  width: 100%;
}
.r-form label.r-check {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  min-height: var(--tap);
}
.req {
  color: var(--color-ember);
}
/* The one-line detour for a report about a Reclusiarch: a card on the form, edged in the warm colour. */
.r-bypass {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--color-ember) 45%, transparent);
  border-radius: var(--radius-md);
  padding: 1rem 1.2rem;
  color: var(--color-smoke);
  line-height: 1.6;
}
.r-bypass p {
  margin: 0 0 0.8rem;
}
.r-sent {
  margin-top: 1.4rem;
  color: var(--color-drake);
}
.ilink {
  color: var(--color-drake);
  border-bottom: 1px solid color-mix(in srgb, var(--color-drake) 40%, transparent);
}
.r-review-link {
  display: inline-block;
  margin-top: 1.4rem;
}
.r-h2 {
  font-family: var(--font-display);
  text-transform: uppercase;
  color: var(--color-bone);
  font-size: var(--text-base);
  margin: 2.4rem 0 0.8rem;
}
.r-mine ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.r-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  align-items: center;
  padding: 0.7rem 1rem;
}
.r-row > :first-child {
  flex: 1;
  color: var(--color-bone);
}
.r-status {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--text-xs);
  color: var(--color-smoke);
}
.r-status[data-status='resolved'] {
  color: var(--color-drake);
}
.r-status[data-status='escalated'] {
  color: var(--color-ember);
}
</style>
