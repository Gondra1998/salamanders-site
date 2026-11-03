/**
 * What the clips channel's messages turn into. Pure: one Discord REST message
 * object in, the Reliquarium rows it yields out; no network, no storage.
 *
 * - each video or image attachment (a content type in TYPES) is a row to be copied into storage;
 * - each Medal, YouTube or Twitch clip link in the text is an embed row, recognised by
 *   hostname and path shape and nothing else, and named by its canonical url so the same
 *   clip pasted in two spellings is one row;
 * - anything else is skipped (attachments, with a reason) or ignored (links, text).
 *
 * The message text is the title of every row it yields.
 */
export const MAX_CLIP_BYTES = 104_857_600

const TITLE_MAX = 120

/** The content types worth keeping, and the file extension each is stored under. */
const TYPES = new Map([
  ['video/mp4', { media: 'video', ext: 'mp4' }],
  ['video/quicktime', { media: 'video', ext: 'mov' }],
  ['video/webm', { media: 'video', ext: 'webm' }],
  ['image/jpeg', { media: 'image', ext: 'jpg' }],
  ['image/png', { media: 'image', ext: 'png' }],
  ['image/gif', { media: 'image', ext: 'gif' }],
  ['image/webp', { media: 'image', ext: 'webp' }],
])

const LINK = /https?:\/\/[^\s<>()]+/g
// Punctuation and Discord markdown that touches the end of a pasted link without being part of it.
const LINK_TAIL = /[.,;:!?'"*~|]+$/
const WWW_OR_M = /^(?:www|m)\./
const HIGH_SURROGATE_END = /[\uD800-\uDBFF]$/

const YOUTUBE_ID = /^[\w-]{11}$/
const SLUG = /^[\w-]+$/
const MEDAL_PATH = /^\/(?:games\/[^/]+\/)?clips?\/([^/]+)/

const valid = (re, s) => typeof s === 'string' && re.test(s)

const youtube = (id) =>
  valid(YOUTUBE_ID, id) ? { host: 'youtube', canonical: `https://www.youtube.com/watch?v=${id}` } : null
const twitch = (slug) => (valid(SLUG, slug) ? { host: 'twitch', canonical: `https://clips.twitch.tv/${slug}` } : null)
const medal = (id) => (valid(SLUG, id) ? { host: 'medal', canonical: `https://medal.tv/clips/${id}` } : null)

/**
 * → { host: 'youtube' | 'twitch' | 'medal', canonical } for a link to a clip on one of those
 * sites, else null. Never throws: whatever `new URL` refuses is null.
 */
export function embedOf(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const seg = u.pathname.split('/').slice(1)
  switch (u.hostname.replace(WWW_OR_M, '')) {
    case 'youtu.be':
      return youtube(seg[0])
    case 'youtube.com':
      if (u.pathname === '/watch') return youtube(u.searchParams.get('v'))
      return seg[0] === 'shorts' ? youtube(seg[1]) : null
    case 'clips.twitch.tv':
      return twitch(seg[0])
    case 'twitch.tv':
      return seg[1] === 'clip' ? twitch(seg[2]) : null
    case 'medal.tv':
      return medal(MEDAL_PATH.exec(u.pathname)?.[1])
    default:
      return null
  }
}

/** The text, trimmed and cut to 120 UTF-16 units without leaving half a surrogate pair at the cut. */
function titleOf(content) {
  const cut = content.trim().slice(0, TITLE_MAX)
  return HIGH_SURROGATE_END.test(cut) ? cut.slice(0, -1) : cut
}

/**
 * → { rows, skipped }. Rows are the message's attachments in order, then its distinct
 * embeddable links in order. Skipped are attachments not kept: 'not-media' (a content type
 * outside TYPES, or none) or 'too-large' (over MAX_CLIP_BYTES).
 */
export function parseMessage(message) {
  const content = message.content ?? ''
  const { author } = message
  const base = {
    messageId: message.id,
    authorId: author.id,
    authorUsername: String(author.username || author.id),
    title: titleOf(content),
    postedAt: message.timestamp,
  }
  const rows = []
  const skipped = []

  for (const a of message.attachments ?? []) {
    const type = TYPES.get(a.content_type)
    if (!type) skipped.push({ attachmentId: a.id, reason: 'not-media' })
    else if (a.size > MAX_CLIP_BYTES) skipped.push({ attachmentId: a.id, reason: 'too-large' })
    else {
      const download = { url: a.url, size: a.size, contentType: a.content_type, ext: type.ext }
      rows.push({ ...base, attachmentId: a.id, media: type.media, download })
    }
  }

  const seen = new Set()
  for (const link of content.match(LINK) ?? []) {
    const hit = embedOf(link.replace(LINK_TAIL, ''))
    if (hit && !seen.has(hit.canonical)) {
      seen.add(hit.canonical)
      rows.push({ ...base, attachmentId: hit.canonical, media: 'embed', embedUrl: hit.canonical })
    }
  }

  return { rows, skipped }
}
