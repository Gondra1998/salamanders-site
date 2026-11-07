/**
 * The nightly storage purge (galleryPolicy.js): takes the files of items rejected, hidden or removed for
 * PURGE_AFTER_DAYS out of R2, once the backup is known to hold them. Run by server/backup/salamanders-r2-backup
 * after a backup that copied and checked cleanly, through galleryPurgeRun.js.
 *
 * The manifest is what that script listed, one object a line: `r2<TAB>size<TAB>key` for what the bucket holds and
 * `backup<TAB>size<TAB>key` for what the backup holds. For each candidate:
 *   - R2 lists it and the backup holds it at the same size: removed from R2, then marked purged (purged);
 *   - R2 lists it and the backup does not, or at another size: left for a later night (waiting);
 *   - R2 does not list it and the backup holds it: removed (a no-op if it is gone) and marked (purged);
 *   - neither holds it, as after an upload that never landed: marked without a request, nothing to lose (gone);
 *   - the store finds it no longer qualifies (approved meanwhile): left alone (changed).
 * A file the backup does not hold is never removed. The first failure ends the run; what was done stays done.
 */
import { PURGE_AFTER_DAYS } from './galleryPolicy.js'

const LINE = /^(r2|backup)\t([^\t]*)\t([^\t\r]+)$/
const BYTES = /^\d+$/

/** → { r2: Map(key → size), backup: Map(key → size) }. An Error naming the line, never the key, for anything else. */
export function parseManifest(text) {
  if (typeof text !== 'string') throw new Error('manifest: not text')
  const out = { r2: new Map(), backup: new Map() }
  // One final newline ends the last line; an empty body is an empty bucket and an empty backup.
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  const lines = body === '' ? [] : body.split('\n')
  lines.forEach((raw, i) => {
    const at = `manifest line ${i + 1}`
    const m = LINE.exec(raw)
    if (!m) throw new Error(`${at}: expected r2 or backup, a size and a key`)
    const [, where, size, key] = m
    const n = Number(size)
    if (!BYTES.test(size) || !Number.isSafeInteger(n)) throw new Error(`${at}: the size is not a whole number of bytes`)
    if (out[where].has(key)) throw new Error(`${at}: ${where} lists this key twice`)
    out[where].set(key, n)
  })
  return out
}

/** → { candidates, purged, gone, waiting, changed, freedBytes }, freedBytes by R2's own sizes. */
export async function purgeBackedUp({ store, r2, manifest, dryRun = false }) {
  const candidates = await store.purgeCandidates({ days: PURGE_AFTER_DAYS })
  const out = { candidates: candidates.length, purged: 0, gone: 0, waiting: 0, changed: 0, freedBytes: 0 }
  for (const { id, r2_key: key } of candidates) {
    const held = manifest.r2.get(key)
    const saved = manifest.backup.get(key)
    // R2 holds it and the backup does not hold the same: not yet backed up, or backed up wrong.
    if (held !== undefined && saved !== held) {
      out.waiting++
      continue
    }
    const outcome = saved === undefined ? 'gone' : 'purged'
    const done = dryRun || (await store.purgeFile(String(id), outcome === 'gone' ? async () => {} : (k) => r2.remove(k)))
    if (!done) {
      out.changed++
      continue
    }
    out[outcome]++
    out.freedBytes += held ?? 0
  }
  return out
}
