<script setup>
// A skeleton: the original's headings and labels over shimmer, until this view is rebuilt. Replace this file
// with the real view; nothing else needs to change (see src/lib/deathwatch/pages.js).
import { SkForm, SkNote } from '../../../../components/deathwatch/skeleton'
</script>

<template>
  <div class="dw-page">
    <SkNote />
    <h2 class="dw-plaque">Page Texts</h2>
    <SkForm :count="4" />
  </div>
</template>
