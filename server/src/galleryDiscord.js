/**
 * The clips poll's reads of the Discord clips channel, with the bot token, and its download of an
 * attachment from Discord's CDN. Nothing here writes to Discord.
 *
 * messagesAfter(channelId, afterId | null, limit) → message[] oldest-first (Discord answers newest-first).
 * newest(channelId, limit) → message[] as Discord gives them, newest-first.
 * exists(channelId, messageId) → true (200) | false (404 Unknown Message, code 10008; any other 404 is Upstream).
 * download(url, { signal }?) → { body, contentLength, contentType }; no auth header (the CDN link is
 *   signed in its query). The caller's signal, when given, replaces the default timeout, so one
 *   deadline can cover the download and the upload it is streamed into.
 *
 * A 429 on a bot call waits Retry-After seconds (at most 30) and retries once; a second 429 is Upstream.
 * Every failure is Upstream, whose message names a status at most: never the token, a url or a CDN link.
 */
import { Upstream } from './discordRoles.js'

const MAX_RETRY_AFTER_S = 30
const UNKNOWN_MESSAGE = 10008 // Discord's JSON error code for a message that does not exist

export function createGalleryDiscord({
  fetchImpl = fetch,
  apiBase,
  botToken,
  timeoutMs = 10_000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const configured = [apiBase, botToken].every((v) => typeof v === 'string' && v !== '')

  async function request(url, init) {
    try {
      return await fetchImpl(url, init)
    } catch {
      // Network error, abort or timeout. Drop the original: its message can carry the url.
      throw new Upstream('Discord is unreachable.')
    }
  }

  // Seconds to wait, from the header; a missing or odd one waits a second.
  const retryAfterMs = (res) => {
    const s = Number.parseFloat(res.headers.get('Retry-After'))
    return Math.min(Number.isFinite(s) && s >= 0 ? s : 1, MAX_RETRY_AFTER_S) * 1000
  }

  async function bot(path) {
    if (!configured) throw new Upstream('Clips channel reads are not configured.')
    for (let attempt = 1; ; attempt++) {
      const res = await request(`${apiBase}${path}`, {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.status !== 429) return res
      await res.body?.cancel()
      if (attempt === 2) throw new Upstream('Discord is rate limiting the clips poll.')
      await sleep(retryAfterMs(res))
    }
  }

  async function list(path) {
    const res = await bot(path)
    const body = await res.json().catch(() => null)
    if (res.status !== 200 || !Array.isArray(body)) throw new Upstream(`Discord answered ${res.status} for the clips channel.`)
    return body
  }

  const messagesPath = (channelId, limit) => `/v10/channels/${channelId}/messages?limit=${limit}`

  return {
    async messagesAfter(channelId, afterId, limit) {
      const after = afterId === null ? '' : `&after=${afterId}`
      return (await list(`${messagesPath(channelId, limit)}${after}`)).reverse()
    },

    newest: (channelId, limit) => list(messagesPath(channelId, limit)),

    async exists(channelId, messageId) {
      const res = await bot(`/v10/channels/${channelId}/messages/${messageId}`)
      const body = await res.json().catch(() => null)
      if (res.status === 200) return true
      // Only Unknown Message means the message is gone; any other 404 (Unknown Channel, say) would
      // otherwise remove every clip in one sweep.
      if (res.status === 404 && body?.code === UNKNOWN_MESSAGE) return false
      throw new Upstream(`Discord answered ${res.status} for a clips message.`)
    },

    async download(url, { signal = AbortSignal.timeout(timeoutMs) } = {}) {
      const res = await request(url, { signal })
      if (res.status !== 200) {
        await res.body?.cancel()
        throw new Upstream(`Discord's CDN answered ${res.status}.`)
      }
      return {
        body: res.body,
        contentLength: Number(res.headers.get('content-length')) || 0,
        contentType: res.headers.get('content-type'),
      }
    },
  }
}
