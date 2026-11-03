/**
 * The player address for a clip link. The server stores a clip's canonical link (YouTube `watch?v=ID`, Twitch
 * `clips.twitch.tv/SLUG`, Medal `medal.tv/clips/ID`) and accepts looser spellings, so this reads the same
 * ones, recognised by hostname and path shape and nothing else (the same rules as server/src/galleryParse.js).
 * Only the validated id (and the page host for Twitch) reaches the address; nothing else from the link does.
 */
const YOUTUBE_ID = /^[\w-]{11}$/
const SLUG = /^[\w-]+$/
const MEDAL_PATH = /^\/(?:games\/[^/]+\/)?clips?\/([^/]+)/
const WWW_OR_M = /^(?:www|m)\./

const valid = (re, s) => typeof s === 'string' && re.test(s)
const youtube = (id) => (valid(YOUTUBE_ID, id) ? { provider: 'youtube', id } : null)
const twitch = (id) => (valid(SLUG, id) ? { provider: 'twitch', id } : null)
const medal = (id) => (valid(SLUG, id) ? { provider: 'medal', id } : null)

/** → { provider, id } for a link to a clip on one of the three sites, else null. Never throws. */
function clipOf(url) {
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
  }
  return null
}

const SRC = {
  youtube: (id) => `https://www.youtube.com/embed/${id}?rel=0`,
  // Twitch refuses to play in a page it was not told about, so it needs the page host; without one there is no player.
  twitch: (id, parent) =>
    typeof parent === 'string' && parent !== '' ? `https://clips.twitch.tv/embed?clip=${id}&parent=${encodeURIComponent(parent)}` : null,
  medal: (id) => `https://medal.tv/clip/${id}?autoplay=0&loop=0&muted=0&cta=0`,
}

/**
 * → { src, provider: 'youtube' | 'twitch' | 'medal' } for the iframe, or null when the link is not a clip on
 * one of those sites (or is Twitch with no `parent`, the host of the page showing it): the card links out then.
 */
export function embedSrc(url, parent) {
  const clip = typeof url === 'string' ? clipOf(url) : null
  const src = clip && SRC[clip.provider](clip.id, parent)
  return src ? { src, provider: clip.provider } : null
}
