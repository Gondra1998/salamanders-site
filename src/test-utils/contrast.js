// WCAG contrast helpers for tests that check a stylesheet keeps text readable.
// `LAVA` is the brightest pixel of the volcano behind the site; `TEXT` is body text.
// (White: the drawing burns out to white at the breach and in an eruption's fountain. `npm run deathfire:golden`
// reports the brightest pixel it reaches; it was rgb(255, 255, 255) when this was set, 2026-11-14.)
export const LAVA = [255, 255, 255]
export const TEXT = [195, 208, 198]

const channel = (c) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

/** WCAG contrast ratio between two [r, g, b] colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The colour of `rgb` at `alpha` laid over `backdrop`. */
export const over = (rgb, alpha, backdrop = LAVA) => rgb.map((c, i) => Number(c) * alpha + backdrop[i] * (1 - alpha))
