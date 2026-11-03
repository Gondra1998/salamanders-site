/**
 * The player address for a clip link. Which links are clips, and their ids, is the server's one parser
 * (server/src/galleryParse.js, pure, also used by the clips poll), so the page and the poll can never disagree
 * about a link. This only turns what it names into an address. Only the validated id (and the page host for
 * Twitch) reaches the address; nothing else from the link does.
 */
import { embedOf } from '../../../server/src/galleryParse.js'

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
  const clip = embedOf(url)
  const src = clip && SRC[clip.host](clip.id, parent)
  return src ? { src, provider: clip.host } : null
}
