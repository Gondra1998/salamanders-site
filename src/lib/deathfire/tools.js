// Small drawing helpers that both the scene and the painters use.
import { clamp01 } from './noise.js'

export const TAU = Math.PI * 2
export const lerp = (a, b, t) => a + (b - a) * t
export const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`
/** Linear lookup in a ramp of [position, [r, g, b]] stops. */
export function ramp(stops, s) {
  let k = 1
  while (k < stops.length - 1 && stops[k][0] < s) k++
  const a = stops[k - 1]
  const b = stops[k]
  const u = clamp01((s - a[0]) / (b[0] - a[0] || 1))
  return [lerp(a[1][0], b[1][0], u), lerp(a[1][1], b[1][1], u), lerp(a[1][2], b[1][2], u)]
}

/** A canvas of w x h px (times `dpr` in its own pixels) and its context, already scaled so drawing is in px. */
export function makeCanvas(w, h, dpr = 1) {
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.ceil(w * dpr))
  cv.height = Math.max(1, Math.ceil(h * dpr))
  const g = cv.getContext('2d')
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { cv, g }
}

// The warm light the lava throws on rock, from none to full: a ramp of [position, [r, g, b]] stops.
export const WARM = [
  [0, [0, 0, 0]],
  [0.25, [30, 9, 5]],
  [0.5, [82, 26, 11]],
  [0.75, [146, 54, 19]],
  [1, [210, 98, 36]],
]
