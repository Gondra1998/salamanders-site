/**
 * Client for the Reliquarium routes (server/src/galleryHandler.js). Every call needs a live Discord token and
 * the server re-checks the roles each time, so nothing is served from the HTTP cache. The token only ever goes in
 * the Authorization header. Each call throws a BuildsApiError carrying the status.
 */
import { API_BASE, BuildsApiError, request } from '../buildsApi'

const get = (path, token) => request(path, { token, cache: 'no-store' })
const post = (path, token, body) => request(path, { method: 'POST', token, body, cache: 'no-store' })

// `before` is the cursor a page answers with as `next`; the first page has none.
const paged = (path, before) => (before === null || before === undefined ? path : `${path}?before=${encodeURIComponent(before)}`)

const item = (id) => `/gallery/items/${encodeURIComponent(id)}`

/** → { access: boolean, approver: boolean }; any signed-in user may ask. */
export const getMe = (token) => get('/gallery/me', token)

/** → { items, next }: 24 approved clips, newest first; `next` is the next page's `before`, or null. */
export const listClips = (token, before) => get(paged('/gallery/clips', before), token)

/** → { items, next }, the same for art. */
export const listArt = (token, before) => get(paged('/gallery/art', before), token)

/** → { items }: the caller's own items in every status. */
export const listMine = (token) => get('/gallery/mine', token)

/** Approvers only. → { items, sync: { lastRunAt, lastOkAt, lastError } } */
export const listReview = (token) => get('/gallery/review', token)

/** Approvers only. → { events, next } */
export const listEvents = (token, before) => get(paged('/gallery/events', before), token)

/**
 * Uploads one piece of art for review. → { item }. The form is built here and sent without a Content-Type: the
 * browser adds the multipart boundary itself, and a type set by hand would leave it out.
 */
export async function submitArt({ file, title, note }, token) {
  const body = new FormData()
  body.append('file', file)
  body.append('title', title ?? '')
  body.append('note', note ?? '')
  const res = await fetch(`${API_BASE}/gallery/art`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
    cache: 'no-store',
  })
  if (!res.ok) {
    const parsed = await res.json().catch(() => null)
    throw new BuildsApiError(parsed?.error || `Request failed (${res.status})`, res.status)
  }
  return res.json()
}

/** The item's owner only. → null */
export const removeItem = (id, token) => request(item(id), { method: 'DELETE', token, cache: 'no-store' })

/** Approvers only. → { item } */
export const approve = (id, token) => post(`${item(id)}/approve`, token)

/** Approvers only. The reason is required. → { item } */
export const reject = (id, reason, token) => post(`${item(id)}/reject`, token, { reason })

/** Approvers only. The note is optional, and with none the request has no body (the server reads that as no note). → { item } */
export const hide = (id, note, token) => post(`${item(id)}/hide`, token, note ? { note } : undefined)
