import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 }
const GATED = [
  'src/lib/archive/crypto.js',
  'src/lib/archive/links.js',
  'src/lib/archive/markdown.js',
  'src/lib/archive/audit.js',
  'src/lib/archive/prune.js',
  'src/lib/archive/legacy.js',
  'scripts/lib/legacy-snapshot.mjs',
  'server/src/archiveKey.js',
  'src/lib/longPress.js',
  'src/lib/perkStateKey.js',
  'src/lib/deathwatch/areas.js',
  'src/lib/deathwatch/sheetDrag.js',
  'src/lib/deathwatch/icons.js',
  'src/stores/deathwatch.js',
  'src/lib/useCompanyNotables.js',
  'server/src/displayNames.js',
  'server/src/rosterMember.js',
  'server/src/rosterCore.js',
  'server/src/roster.js',
  'server/src/rosterHandler.js',
  'server/src/rosterPublic.js',
  'server/src/rosterPublicHandler.js',
  'server/src/cors.js',
  'server/src/deathwatchEtag.js',
  'server/src/deathwatchValidate.js',
  'server/src/deathwatchAccess.js',
  'server/src/deathwatchHandler.js',
  'server/src/membership.js',
  'server/src/membershipHandler.js',
  'server/src/buildsView.js',
  'server/src/buildRow.js',
  'server/src/companyNotables.js',
  'server/src/companyNotablesStore.js',
  'server/src/companyNotablesHandler.js',
  'server/src/galleryValidate.js',
  'server/src/galleryParse.js',
  'server/src/r2.js',
  'server/src/galleryAccess.js',
  'server/src/galleryHandler.js',
  'server/src/galleryConfig.js',
  'server/src/inTx.js',
  'server/src/httpReply.js',
  'server/src/verdictCache.js',
  'src/lib/gallery/embed.js',
]

export default defineConfig({
  // Archive components are .vue SFCs (src/components/archive/archive.test.js).
  plugins: [vue()],
  test: {
    environment: 'node',
    // Node 25+ ships its own localStorage global, which shadows jsdom's (see the setup file).
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.js', 'scripts/**/*.test.mjs', 'server/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: GATED,
      thresholds: Object.fromEntries(GATED.map((f) => [f, FULL])),
    },
  },
})
