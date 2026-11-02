<script setup>
// The Deathwatch Requirements, as the old site set them: a quote, then the rank, accolade and conduct requirements,
// each with its lead, its list and the notes under it. The texts are the old site's (lib/deathwatch/recruitment.js),
// each replaced by what the area's data holds for it. Headed like the Armouring Hall (HallHead), the blocks under Contents.
import { computed, onMounted } from 'vue'
import Inline from '../../../../components/deathwatch/Inline'
import LoadRetry from '../../../../components/deathwatch/LoadRetry.vue'
import HallHead from '../../../../components/deathwatch/armour/HallHead.vue'
import RcContents from '../../../../components/deathwatch/recruitment/RcContents.vue'
import { requirements } from '../../../../lib/deathwatch/recruitment'
import { useAuth } from '../../../../stores/auth'
import { useDeathwatchData } from '../../../../stores/deathwatchData'
import '../../../../components/deathwatch/recruitment/recruitment.css'

const auth = useAuth()
const data = useDeathwatchData()
// Once: the defaults show at once, and what the data holds replaces them when it arrives.
onMounted(() => {
  if (data.status !== 'ready') data.load(auth.token)
})
const rq = computed(() => requirements(data.cfg.tx))
const contents = computed(() =>
  rq.value.blocks.flatMap((b, i) => (b.title.length ? [{ id: `rc-b${i}`, label: b.title.map((s) => s.t).join('') }] : [])),
)
</script>

<template>
  <div class="dw-page rc">
    <HallHead area="recruitment" tab="requirements" />
    <LoadRetry v-if="data.status === 'error'">The latest texts could not be loaded.</LoadRetry>
    <div class="rc-body">
      <RcContents :items="contents" />
      <header class="rc-head">
        <h2 class="rc-title">Deathwatch Requirements</h2>
        <p v-if="rq.quote.length" class="rc-sub rc-q"><Inline :segs="rq.quote" /></p>
      </header>
      <section v-for="(b, i) in rq.blocks" :key="i" class="rc-s">
        <h3 v-if="b.title.length" :id="`rc-b${i}`" class="dw-plaque"><Inline :segs="b.title" /></h3>
        <p v-if="b.lead.length" class="rc-l"><Inline :segs="b.lead" /></p>
        <ul v-if="b.items.length" class="rc-req">
          <li v-for="(item, j) in b.items" :key="j">
            <Inline :segs="item.segs" />
            <p v-for="(note, k) in item.notes" :key="k" class="rc-l"><Inline :segs="note" /></p>
          </li>
        </ul>
        <p v-for="(note, j) in b.notes" :key="j" class="rc-l"><Inline :segs="note" /></p>
      </section>
    </div>
  </div>
</template>
