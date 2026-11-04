/**
 * The reply and request helpers the Deathwatch and Reliquarium handlers share.
 *
 * Every reply forbids caching and, unless it has no body at all, names JSON; a handler adds its own headers
 * (an ETag) or replaces a default by passing the same name. readJson takes the handler's own size limit
 * and the message for refusing it.
 */

/** The request's media type: lower case, without parameters ("application/json; charset=utf-8" is "application/json"). */
// Stryker disable next-line StringLiteral: a missing header and any other default are neither application/json nor multipart/form-data
export const mediaType = (request) => (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()

/** A Response. `text` null sends no body and so names no content type (a 204, say). */
export function send(status, text, headers = {}) {
  const type = text === null ? {} : { 'Content-Type': 'application/json' }
  return new Response(text, { status, headers: { ...type, 'Cache-Control': 'no-store', ...headers } })
}

/** A JSON Response. */
export const reply = (status, body, headers = {}) => send(status, JSON.stringify(body), headers)

/**
 * → { body, blank } from a JSON request, or { status, error } for the reply to give instead: 415 for any other
 * type (the body is left unread), 413 with `tooLarge` for more than `maxBytes` bytes. `body` is undefined for
 * text that is not JSON; `blank` says there was no text at all.
 */
export async function readJson(request, { maxBytes, tooLarge }) {
  if (mediaType(request) !== 'application/json') return { status: 415, error: 'Send JSON (Content-Type: application/json).' }
  const text = await request.text()
  if (new TextEncoder().encode(text).length > maxBytes) return { status: 413, error: tooLarge }
  let body
  try {
    body = JSON.parse(text)
  } catch {
    // left undefined
  }
  return { body, blank: text.trim() === '' }
}
