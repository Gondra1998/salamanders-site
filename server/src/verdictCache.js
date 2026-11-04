/**
 * The short-lived verdict cache behind deathwatchAccess.js and galleryAccess.js. `lookup(request)` is the live
 * answer (a verdict, null for no Discord identity, or a thrown Upstream); createVerdictCache wraps it as
 * { resolve(request, { fresh }), forget() }.
 *
 * A verdict is reused for `ttlMs`, keyed by a hash of the whole Authorization header. `fresh` skips the cache
 * entirely, both reading and writing, and so does a request with no Authorization header. Only a verdict is
 * stored: not null, and not a failure, which propagates so callers fail closed. A full cache drops the entry it
 * stored first. forget() empties the cache and replaces `epoch`: a lookup that began before it may be telling a
 * story forget() has since made false (a grant revoked mid-lookup), so its verdict is returned but not stored.
 */
import { createHash } from 'node:crypto'

export function createVerdictCache({ lookup, ttlMs = 30_000, maxEntries = 1000, now = Date.now }) {
  const cache = new Map() // sha256 of the Authorization header -> { verdict, until }
  let epoch = {}

  function remember(key, verdict) {
    if (!cache.has(key) && cache.size >= maxEntries) cache.delete(cache.keys().next().value)
    cache.set(key, { verdict, until: now() + ttlMs })
  }

  async function resolve(request, { fresh = false } = {}) {
    const header = request.headers.get('Authorization')
    if (fresh || !header) return lookup(request)
    const key = createHash('sha256').update(header).digest('hex')
    const hit = cache.get(key)
    if (hit && now() < hit.until) return hit.verdict
    const began = epoch
    const verdict = await lookup(request)
    if (verdict && began === epoch) remember(key, verdict)
    return verdict
  }

  function forget() {
    cache.clear()
    epoch = {}
  }

  return { resolve, forget }
}
