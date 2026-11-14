// What to build for a window and a page: which scene, and how a frame of it is to be drawn there.
//
// One scene serves every page. The home page shows it as it stands: the peak on the left, clear of the title. Every
// other page shows the same scene mirrored (the mountain on the right, clear of the page's header) and quiet (no
// live far volcanoes behind small text). Mirror and quiet are asked for with each frame, so a change of page builds
// nothing. Phones have one composition for every page, never mirrored: the mountain under the home page's hero text.
import { LOOK } from './look.js'

/** At or under this width a window gets the phone's drawing. It is the site's own breakpoint. */
export const PHONE_MAX = 768
/** Where the home page's lower hero button ends on a phone, as a share of the window's height (352 of 844). */
const HERO_TEXT = 0.417

/**
 * `w`, `h`, `dpr`: the window. `path`: the page. `shows`: false where no mountain is drawn at all (Deathwatch).
 * `hero`: on a phone, where the home page's hero text ends (`{ text }`, px from the top of the page), when it has
 * been measured.
 *
 * Returns null when nothing is to be drawn. Otherwise:
 *   key      changes exactly when the scene must be built again
 *   kind     'desktop' or 'phone': which baked mountain it needs
 *   options  what to build the scene with
 *   mirror, quiet  how each frame is to be drawn on this page
 */
export function compose({ w, h, dpr, path, shows = true, hero = null }) {
  if (!shows || !Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2) return null
  const home = path === '/'
  const kind = w > PHONE_MAX ? 'desktop' : 'phone'
  const options = { dpr, phoneMax: PHONE_MAX, flip: true, tune: LOOK }
  let edge = ''
  if (kind === 'desktop') {
    options.faceX = 0.14
  } else {
    // (a page with no hero text keeps the home page's mountain: the same place and size on every page)
    options.textBottom = hero && Number.isFinite(hero.text) ? hero.text : Math.round(HERO_TEXT * h)
    edge = String(Math.round(options.textBottom))
  }
  return {
    key: [kind, w, h, dpr, edge].join('|'),
    kind,
    options,
    mirror: kind === 'desktop' && !home,
    quiet: !home,
  }
}
