/**
 * Limits and request validation for the Deathwatch write endpoints
 * (deathwatchHandler.js). Pure. Each parse returns clean fields, or an error
 * message string, the way validate() does in reports.js.
 *
 * A document must also be something Postgres jsonb can store: it rejects U+0000
 * and unpaired surrogates, and would otherwise turn a pasted character into a 500.
 */
export const COLLECTIONS = ['teams', 'cfg', 'archive']
export const MAX_DOC_BYTES = 1_048_576
export const MAX_BODY_BYTES = 2_097_152
// What the Watch Commander can give one person (Administratum → Access): the general level, the Armouring Hall's
// Watch Command tab, or the Administratum desk. A ceiling on the active rows, far above any real use, only bounds abuse.
export const KINDS = ['deathwatch', 'watchcommand', 'desk']
export const MAX_ACTIVE_ACCESS = 1000

const ID = /^[A-Za-z0-9_-]{1,64}$/
const SNOWFLAKE = /^\d{17,20}$/
const OPS = ['set', 'delete']

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export const isDiscordId = (v) => typeof v === 'string' && SNOWFLAKE.test(v)

/** The document as JSON text, or null when any key or string in it is not storable. */
function serialise(doc) {
  let bad = false
  const check = (s) => {
    if (s.includes('\u0000') || !s.isWellFormed()) bad = true
  }
  const json = JSON.stringify(doc, (key, value) => {
    check(key)
    if (typeof value === 'string') check(value)
    return value
  })
  return bad ? null : json
}

/** → { col, id, op, doc } (doc is null for a delete), or an error message string. */
export function parseDocWrite(b) {
  if (!isObject(b)) return 'Malformed request.'
  if (!COLLECTIONS.includes(b.col)) return 'Unknown collection.'
  if (typeof b.id !== 'string' || !ID.test(b.id)) return 'A document id is 1 to 64 letters, digits, "-" or "_".'
  if (!OPS.includes(b.op)) return 'Unknown operation.'
  if (b.op === 'delete') return { col: b.col, id: b.id, op: 'delete', doc: null }
  if (!isObject(b.doc)) return 'A document must be a JSON object.'
  const json = serialise(b.doc)
  if (json === null) return 'The document contains text the database cannot store.'
  if (new TextEncoder().encode(json).length > MAX_DOC_BYTES) return 'The document is too large (1 MB at most).'
  return { col: b.col, id: b.id, op: 'set', doc: b.doc }
}

// includes() never matches anything but one of these strings.
export const isKind = (v) => KINDS.includes(v)

/** → { discordId, kind }, or an error message string. */
export function parseAccessBody(b) {
  if (!isObject(b)) return 'Malformed request.'
  if (!isDiscordId(b.discordId)) return 'Enter a Discord user id (17 to 20 digits).'
  if (!isKind(b.kind)) return 'Unknown access kind.'
  return { discordId: b.discordId, kind: b.kind }
}
