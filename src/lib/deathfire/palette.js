// The lava's colours. The title's fire palette, and two gradings of it for rock that glows rather than gas that burns.
import { DOOM_PALETTE } from '../doomfire.js'

/** The hottest step of the palette. */
export const TOP = DOOM_PALETTE.length - 1

// The title's fire palette, flat, so the lava and the title burn in the same colours.
export const DOOM = new Float32Array(DOOM_PALETTE.length * 3)
DOOM_PALETTE.forEach((c, i) => DOOM.set(c, i * 3))

// The same 37 steps graded for rock that glows rather than gas that burns. The Doom ramp's upper middle is a mustard
// yellow (183,183,47): right for flame on black, sulphurous for lava. Here red is pushed up and green pulled down, so
// the middle of the ramp is a deep orange, and the top four steps run warm white instead of pure white.
export const MOLTEN = new Float32Array(DOOM_PALETTE.length * 3)
DOOM_PALETTE.forEach(([r, g, b], i) => MOLTEN.set([Math.min(255, r * 1.18 + (i ? 12 : 0)), g * 0.84, b * 0.8], i * 3))
;[[255, 222, 128], [255, 234, 166], [255, 243, 202], [255, 251, 232]].forEach((c, k) => MOLTEN.set(c, (TOP - 3 + k) * 3))

// "Forge": the two ramps blended. Doom's own orange and gold tint the hot middle of the molten ramp (`tint`, 0..1),
// and the cool end runs a deeper red (`red`, 0..1). The top steps stay the molten warm white.
export function forgePalette(tint, red) {
  const out = new Float32Array(MOLTEN.length)
  const s3 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
  for (let i = 0; i <= TOP; i++) {
    const s = i / TOP
    const a = i * 3
    // Doom comes in across the middle and fades out again under the white-hot top
    const wt = tint * s3((s - 0.18) / 0.3) * (1 - s3((s - 0.84) / 0.12))
    let r = MOLTEN[a] + (DOOM[a] - MOLTEN[a]) * wt
    let g = MOLTEN[a + 1] + (DOOM[a + 1] - MOLTEN[a + 1]) * wt
    let b = MOLTEN[a + 2] + (DOOM[a + 2] - MOLTEN[a + 2]) * wt
    // the cool end: less green and blue, a touch more red, so cooling lava reads blood red and not brown
    const cool = red * (1 - s3(s / 0.5))
    r = Math.min(255, r * (1 + 0.14 * cool))
    g *= 1 - 0.42 * cool
    b *= 1 - 0.5 * cool
    out[a] = r
    out[a + 1] = g
    out[a + 2] = b
  }
  return out
}

/**
 * For one palette, the function that gives its colour at a fractional heat, written into out[o..o+2].
 * (Each scene makes its own from its own palette: nothing is kept here between scenes.)
 */
export function heatColourIn(pal) {
  return (hv, out, o) => {
    const v = hv < 0 ? 0 : hv > TOP ? TOP : hv
    const i0 = v | 0
    const f = v - i0
    const a = i0 * 3
    const b = (i0 < TOP ? i0 + 1 : i0) * 3
    out[o] = pal[a] + (pal[b] - pal[a]) * f
    out[o + 1] = pal[a + 1] + (pal[b + 1] - pal[a + 1]) * f
    out[o + 2] = pal[a + 2] + (pal[b + 2] - pal[a + 2]) * f
  }
}
