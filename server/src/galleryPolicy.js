/**
 * The Reliquarium's house rules for what goes on the site and what R2 may hold. Pure: no I/O.
 *
 * R2's free tier is 10 GB. The store holds at most STORAGE_CAP_BYTES, which leaves room for one more clip at the
 * largest size the poll copies (galleryParse.js MAX_CLIP_BYTES) under 10 GB in either reading of a GB. Past
 * OTHER_CLIPS_CAP_BYTES only #gameplay clips are copied, so other clips cannot crowd gameplay out.
 *
 * A file whose item is in a PURGEABLE status, and has been for PURGE_AFTER_DAYS, leaves R2 once the nightly
 * backup holds it (galleryPurge.js); its row and audit trail stay.
 */
export const STORAGE_CAP_BYTES = 9_000_000_000
export const OTHER_CLIPS_CAP_BYTES = 7_000_000_000
export const PURGE_AFTER_DAYS = 30
export const PURGEABLE = Object.freeze(['rejected', 'hidden', 'removed'])

// Links to these sites wait for review whatever the tag: nothing says the poster made the video.
const ONLY_HOSTS_TRUSTED = new Set(['medal'])

/**
 * The status a polled clip goes in as. Approved only when the poster tagged it #gameplay and it is a file they
 * uploaded or a Medal link; anything else waits for an approver. `host` is set for an embed link only.
 */
export function clipStatus({ gameplay, host }) {
  const trustedSource = host === undefined || ONLY_HOSTS_TRUSTED.has(host)
  return gameplay === true && trustedSource ? 'approved' : 'pending'
}

/** The most the store may hold once a file of this kind is in. A TypeError for a kind other than clip or art. */
export function capFor({ kind, gameplay }) {
  if (kind === 'art') return STORAGE_CAP_BYTES
  if (kind !== 'clip') throw new TypeError(`capFor: not a gallery kind: ${String(kind)}`)
  return gameplay === true ? STORAGE_CAP_BYTES : OTHER_CLIPS_CAP_BYTES
}

// Number.isFinite, unlike the global isFinite, is false for anything that is not a number (a string, a bigint).
const isBytes = (n) => Number.isFinite(n) && n >= 0

/** Whether a file of `bytes` fits under `cap` with `stored` already held. A TypeError for any value that is not bytes. */
export function fits(stored, bytes, cap) {
  for (const [name, n] of Object.entries({ stored, bytes, cap })) {
    if (!isBytes(n)) throw new TypeError(`fits: ${name} must be a finite number of bytes, 0 or more`)
  }
  return stored + bytes <= cap
}
