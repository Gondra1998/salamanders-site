/**
 * Run the storage purge (galleryPurge.js) with the backup script's manifest on standard input:
 *
 *   docker compose exec -T api bun run src/galleryPurgeRun.js [--dry-run] < manifest
 *
 * server/backup/salamanders-r2-backup calls it after a backup that copied and checked cleanly. Prints one line of
 * counts and one of storage, never a key or a name. Exits 1 when the manifest is refused, R2 is not configured or
 * the purge fails part way (what it did by then stays done; the next run carries on).
 */
import { Pool } from 'pg'
import { createR2 } from './r2.js'
import { createGalleryStore } from './galleryStore.js'
import { parseManifest, purgeBackedUp } from './galleryPurge.js'
import { OTHER_CLIPS_CAP_BYTES, STORAGE_CAP_BYTES } from './galleryPolicy.js'

const dryRun = process.argv.includes('--dry-run')
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`

let manifest
try {
  manifest = parseManifest(await Bun.stdin.text())
} catch (err) {
  console.error(`Not purged: ${err.message}`)
  process.exit(1)
}

const r2 = createR2({
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: process.env.R2_BUCKET,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT || undefined,
})
if (!r2.configured) {
  console.error('Not purged: R2 is not configured.')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const store = createGalleryStore(pool)
try {
  const out = await purgeBackedUp({ store, r2, manifest, dryRun })
  const stored = await store.storedBytes()
  const inR2 = [...manifest.r2.values()].reduce((n, size) => n + size, 0)
  console.log(
    `${dryRun ? 'Dry run, would purge' : 'Purged'} ${out.purged} of ${out.candidates} candidates (${mb(out.freedBytes)}); ` +
      `${out.gone} gone, ${out.waiting} waiting for the backup, ${out.changed} changed meanwhile.`,
  )
  console.log(
    `Stored: ${mb(stored)} by the database, ${mb(inR2)} listed in R2 before the purge. ` +
      `Caps: ${mb(OTHER_CLIPS_CAP_BYTES)} for other clips, ${mb(STORAGE_CAP_BYTES)} in all.`,
  )
} catch (err) {
  console.error(`Purge failed: ${err?.name ?? 'Error'}: ${err?.message ?? ''}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
