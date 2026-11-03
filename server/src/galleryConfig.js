/**
 * The Reliquarium's settings as index.js reads them from the environment. Pure; never prints a value.
 *
 * galleryConfigReport(env) → null when none of the gallery variables is set (the image may ship before the
 *   gallery) or when they make a working gallery; otherwise one line for a startup warning, naming each
 *   variable that is missing or refused. A refused one is judged as r2.js and index.js judge it, so the
 *   line and the 503s cannot disagree.
 * pollIntervalMs(env) → the clips poll's interval from GALLERY_POLL_MS: unset or not a number above 0 is
 *   two minutes; anything else is held between one second (a typo of 1 must not hammer Discord) and
 *   setInterval's ceiling (a larger delay would fire at once, every time).
 */
import { parseEndpoint } from './r2.js'

/** A Discord channel id, as GALLERY_CHANNEL_ID must be. */
export const CHANNEL_ID = /^\d{17,20}$/
export const POLL_DEFAULT_MS = 120_000
export const POLL_MIN_MS = 1000
const TIMER_MAX_MS = 2_147_483_647

const REQUIRED = ['GALLERY_CHANNEL_ID', 'R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
const ALL = [...REQUIRED, 'R2_ENDPOINT']
// index.js reads an empty variable as unset.
const isSet = (v) => typeof v === 'string' && v !== ''

export function galleryConfigReport(env) {
  if (!ALL.some((name) => isSet(env[name]))) return null
  const missing = REQUIRED.filter((name) => !isSet(env[name]))
  const refused = []
  if (isSet(env.GALLERY_CHANNEL_ID) && !CHANNEL_ID.test(env.GALLERY_CHANNEL_ID)) {
    refused.push('GALLERY_CHANNEL_ID (not a Discord channel id)')
  }
  if (isSet(env.R2_ENDPOINT)) {
    if (!parseEndpoint(env.R2_ENDPOINT)) refused.push('R2_ENDPOINT (scheme and host[:port] only: no path, query or credentials)')
  } else if (isSet(env.R2_ACCOUNT_ID) && !parseEndpoint(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)) {
    refused.push('R2_ACCOUNT_ID (does not make a valid R2 hostname)')
  }
  const parts = []
  if (missing.length) parts.push(`missing ${missing.join(', ')}`)
  if (refused.length) parts.push(`refused ${refused.join(', ')}`)
  if (!parts.length) return null
  return `Reliquarium is not configured, so every /gallery route answers 503 and the clips poll is off: ${parts.join('; ')}.`
}

export function pollIntervalMs(env) {
  const ms = Number(env.GALLERY_POLL_MS)
  if (!(ms > 0)) return POLL_DEFAULT_MS
  return Math.min(Math.max(ms, POLL_MIN_MS), TIMER_MAX_MS)
}
