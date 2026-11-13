<script setup>
// The Deathwatch Terms of Service, as the old site set them: six sections, each clause numbered by its section,
// sub-section and place. The texts are the old site's (lib/deathwatch/recruitment.js), each replaced by what the
// area's data holds for it. Headed like the Armouring Hall (HallHead), with the sections under Contents.
import { computed, onMounted, useTemplateRef } from 'vue'
import Inline from '../../../../components/deathwatch/Inline'
import LoadRetry from '../../../../components/deathwatch/LoadRetry.vue'
import HallHead from '../../../../components/deathwatch/armour/HallHead.vue'
import RcContents from '../../../../components/deathwatch/recruitment/RcContents.vue'
import { termsOfService, tldr } from '../../../../lib/deathwatch/recruitment'
import { useAuth } from '../../../../stores/auth'
import { useDeathwatchData } from '../../../../stores/deathwatchData'
import '../../../../components/deathwatch/recruitment/recruitment.css'

const auth = useAuth()
const data = useDeathwatchData()
// Once: the defaults show at once, and what the data holds replaces them when it arrives.
onMounted(() => {
  if (data.status !== 'ready') data.load(auth.token)
})
const tos = computed(() => termsOfService(data.cfg.tx))
const text = (segs) => segs.map((s) => s.t).join('')
const contents = computed(() =>
  tos.value.sections.map((s) => ({ id: `rc-s${s.n}`, label: `Section ${s.n}${s.title.length ? ` — ${text(s.title)}` : ''}` })),
)
// The short version (ts_tl), in a modal <dialog> opened from above Section 1.
const tl = computed(() => tldr(data.cfg.tx))
const tlDialog = useTemplateRef('tlDialog')
</script>

<template>
  <div class="dw-page rc">
    <HallHead area="recruitment" tab="terms-of-service" />
    <LoadRetry v-if="data.status === 'error'">The latest texts could not be loaded.</LoadRetry>
    <div class="rc-body">
      <RcContents :items="contents" />
      <header class="rc-head">
        <h2 class="rc-title">Terms of Service</h2>
        <p v-for="(line, i) in tos.head" :key="i" class="rc-sub"><Inline :segs="line" /></p>
      </header>
      <div v-if="tos.intro.length" class="rc-intro">
        <p v-for="(p, i) in tos.intro" :key="i" :class="{ 'rc-q': p.quote }"><Inline :segs="p.segs" /></p>
      </div>
      <template v-if="tl.groups.length">
        <p class="rc-tl-row">
          <button type="button" class="dw-btn rc-tl-open" aria-haspopup="dialog" @click="tlDialog.showModal()">TL;DR — the short version</button>
        </p>
        <dialog ref="tlDialog" class="rc-tl" aria-labelledby="rc-tl-title">
          <h2 id="rc-tl-title" class="rc-tl-title">Terms of Service — TL;DR</h2>
          <p v-if="tl.sub.length" class="rc-tl-sub"><Inline :segs="tl.sub" /></p>
          <section v-for="(g, i) in tl.groups" :key="i">
            <h4 v-if="g.title.length"><Inline :segs="g.title" /></h4>
            <ul v-if="g.items.length" class="rc-req">
              <li v-for="(item, j) in g.items" :key="j"><Inline :segs="item" /></li>
            </ul>
            <p v-for="(n, j) in g.notes" :key="j" class="rc-tl-note"><Inline :segs="n" /></p>
          </section>
          <form method="dialog" class="rc-tl-actions">
            <button type="submit" class="dw-btn">Close</button>
          </form>
        </dialog>
      </template>
      <section v-for="s in tos.sections" :key="s.n" class="rc-s">
        <h3 :id="`rc-s${s.n}`" class="dw-plaque">Section {{ s.n }}<template v-if="s.title.length"> — <Inline :segs="s.title" /></template></h3>
        <template v-for="(sub, j) in s.subs" :key="j">
          <h4 v-if="sub.title.length">{{ s.n }}.{{ j + 1 }} — <Inline :segs="sub.title" /></h4>
          <ol v-if="sub.clauses.length">
            <li v-for="(c, k) in sub.clauses" :key="k"><b class="rc-n">{{ s.n }}.{{ j + 1 }}.{{ k + 1 }}</b><span><Inline :segs="c" /></span></li>
          </ol>
        </template>
      </section>
      <div v-if="tos.end.length" class="rc-intro rc-end">
        <p v-for="(p, i) in tos.end" :key="i" :class="{ 'rc-q': p.quote }"><Inline :segs="p.segs" /></p>
      </div>
    </div>
  </div>
</template>
