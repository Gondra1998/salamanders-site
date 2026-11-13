<script setup>
// A skeleton: the original's headings and labels over shimmer, until this view is rebuilt. Replace this file
// with the real view; nothing else needs to change (see src/lib/deathwatch/pages.js).
import { SkForm, SkNote, SkTiles } from '../../../../components/deathwatch/skeleton'
</script>

<template>
  <div class="dw-page">
    <SkNote />
    <h2 class="dw-plaque">New operational record</h2>
    <h3 class="dw-subhead">Kill Teams</h3>
    <SkForm :count="4" />
    <h3 class="dw-subhead">Top Operatives</h3>
    <SkForm :count="4" />
    <h2 class="dw-plaque">Records created here</h2>
    <SkTiles :count="2" />
  </div>
</template>
