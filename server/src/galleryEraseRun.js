/**
 * The owner's erase command (galleryErase.js), run through the backup script so the backup copy goes the same night:
 *
 *   salamanders-r2-backup --erase-item <id>          one item, any status
 *   salamanders-r2-backup --erase-member <discord id> everything one member posted
 *
 * which runs `docker compose exec -T api bun run src/galleryEraseRun.js --item <id>` (or --member), then the usual
 * backup and purge. Prints one line of counts, never a key or a name. Exits 1 on a bad target or a failure part way
 * (what was erased by then stays erased).
 */
import { Pool } from 'pg'
import { createR2 } from './r2.js'
import { createGalleryStore } from './galleryStore.js'
import { eraseFor, eraseTarget } from './galleryErase.js'

let target
try {
  target = eraseTarget(process.argv.slice(2))
} catch (err) {
  console.error(`Not erased: ${err.message}`)
  process.exit(1)
}

const r2 = createR2({
  accountId: process.env.R2_ACCOUNT_ID,
  bucket: process.env.R2_BUCKET,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT || undefined,
})
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
try {
  const out = await eraseFor({ store: createGalleryStore(pool), r2, ...target })
  console.log(
    `Erased ${out.items} items (${out.files} with a file); ${out.leftForTonight} files R2 would not delete now, ` +
      'left for the backup run to retry.',
  )
} catch (err) {
  console.error(`Erase failed: ${err?.name ?? 'Error'}: ${err?.message ?? ''}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
