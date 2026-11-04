/**
 * Limits and request validation for the Reliquarium (members-only art and clips galleries; see
 * docs/superpowers/specs/2026-11-02-reliquarium-design.md). Pure. Each parse returns clean fields, or an
 * error message string, the way deathwatchValidate.js does. A result holds only the fields that were parsed,
 * never an echo of whatever else the request carried.
 *
 * Free text must also be something Postgres can store: it rejects U+0000 and unpaired surrogates, as
 * deathwatchValidate.js does for its documents.
 */
export const MAX_ART_BYTES = 10_485_760
export const PAGE_SIZE = 24
export const STATUSES = ['pending', 'approved', 'rejected', 'hidden', 'removed']

const TITLE_MAX = 120
const NOTE_MAX = 500
const REASON_MAX = 500
// An item id and a before cursor are bigserial values sent as text: 15 digits stay below 2^53 and 2^63 alike.
const ITEM_ID = /^[0-9]{1,15}$/

const MALFORMED = 'Malformed request.'
const TITLE_MSG = `Give the piece a title (1 to ${TITLE_MAX} characters).`
const NOTE_MSG = `The note is ${NOTE_MAX} characters at most.`
const REASON_MSG = `Say why (1 to ${REASON_MAX} characters).`
const UNSTORABLE = "That text has characters that can't be stored."

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Postgres text refuses U+0000 and cannot hold an unpaired surrogate; either would turn a pasted character into a 500. */
const storable = (s) => !s.includes('\u0000') && s.isWellFormed()

/** The trimmed text, '' when the field is absent, or null when it is there but is not text. */
function optionalText(v) {
  if (v === undefined || v === null) return ''
  return typeof v === 'string' ? v.trim() : null
}

/** → { title, note }, or an error message string. The note is optional. */
export function parseArtFields(b) {
  if (!isObject(b)) return MALFORMED
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  if (title.length < 1 || title.length > TITLE_MAX) return TITLE_MSG
  const note = optionalText(b.note)
  if (note === null) return MALFORMED
  if (note.length > NOTE_MAX) return NOTE_MSG
  if (!storable(title) || !storable(note)) return UNSTORABLE
  return { title, note }
}

/** → { reason } (required, trimmed), or an error message string. */
export function parseReason(b) {
  if (!isObject(b)) return MALFORMED
  const reason = typeof b.reason === 'string' ? b.reason.trim() : ''
  if (reason.length < 1 || reason.length > REASON_MAX) return REASON_MSG
  if (!storable(reason)) return UNSTORABLE
  return { reason }
}

/** → { note } (optional, trimmed), or an error message string. A hide may arrive with no body at all. */
export function parseHideNote(b) {
  if (b === undefined || b === null) return { note: '' }
  if (!isObject(b)) return MALFORMED
  const note = optionalText(b.note)
  if (note === null) return MALFORMED
  if (note.length > NOTE_MAX) return NOTE_MSG
  if (!storable(note)) return UNSTORABLE
  return { note }
}

const ascii = (s) => [...s].map((c) => c.charCodeAt(0))
const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const GIF87A = ascii('GIF87a')
const GIF89A = ascii('GIF89a')
const RIFF = ascii('RIFF')
const WEBP = ascii('WEBP')

/**
 * Whether `sig` sits at `offset` in `bytes`. Reads only those bytes, and is false when they are not all there:
 * an index past the end of a byte array reads undefined, which equals no byte.
 */
const hasAt = (bytes, offset, sig) => sig.every((b, i) => bytes[offset + i] === b)

/**
 * What an uploaded file really is, by its magic bytes: JPEG, PNG, WebP or GIF. Anything else, including a file
 * too short to carry the signature, is null. The client's claimed type and file name are never consulted.
 */
export function sniffImage(bytes) {
  if (hasAt(bytes, 0, JPEG)) return { ext: 'jpg', contentType: 'image/jpeg' }
  if (hasAt(bytes, 0, PNG)) return { ext: 'png', contentType: 'image/png' }
  if (hasAt(bytes, 0, GIF87A) || hasAt(bytes, 0, GIF89A)) return { ext: 'gif', contentType: 'image/gif' }
  if (hasAt(bytes, 0, RIFF) && hasAt(bytes, 8, WEBP)) return { ext: 'webp', contentType: 'image/webp' }
  return null
}

/**
 * The `before` paging cursor: null when none was given, the digit string unchanged when it is 1 to 15 digits
 * (Postgres compares it to a bigint as text), else 'bad'.
 */
export function parseBefore(value) {
  if (value === null || value === undefined) return null
  return isItemId(value) ? value : 'bad'
}

/** Whether `value` is an item id from a URL: 1 to 15 digits. */
export function isItemId(value) {
  return typeof value === 'string' && ITEM_ID.test(value)
}
