// The baked pictures: the mountain and the moon, painted once by the bake tool (scripts/deathfire) and shipped as
// files, so that no visitor's browser has to paint them. A browser fetches only what its window needs: the moon, and
// the mountain for its kind of device. A phone never fetches the desktop's.
//
// With each mountain comes a note of where its peak and its rim are in the picture and which gully the river runs
// in (baked.json): the scene places the picture by that.
import list from './baked/baked.json'

// (one literal address per file, so the build gives each picture a name that changes when the picture does)
const ADDRESS = {
  moon: () => new URL('./baked/moon.webp', import.meta.url).href,
  desktop: () => new URL('./baked/mountain-desktop.webp', import.meta.url).href,
  phone: () => new URL('./baked/mountain-phone.webp', import.meta.url).href,
}

const pictures = {} // each picture is fetched once for the life of the page
const kinds = {}

async function fetchPicture(name) {
  const answer = await fetch(ADDRESS[name]())
  if (!answer.ok) throw new Error(`deathfire: ${name} picture not served`)
  return createImageBitmap(await answer.blob())
}
const picture = (name) => (pictures[name] ??= fetchPicture(name))

/**
 * The pictures for one kind of device ('desktop' or 'phone'): `{ mountain: { image, meta }, moon }`.
 * Null if either could not be had (offline, a broken file): the caller then paints them itself. A failure is not
 * tried again: the page goes on painting for the rest of the visit.
 */
export function loadBaked(kind) {
  return (kinds[kind] ??= (async () => {
    try {
      const meta = list[kind].mountain
      const [moon, image] = await Promise.all([picture('moon'), picture(kind)])
      return { mountain: { image, meta }, moon }
    } catch {
      return null
    }
  })())
}
