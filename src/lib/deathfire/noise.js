// Seeded numbers and smooth noise for the drawing, and two small easing helpers. Nothing here touches the page.

/** A seeded stream of numbers from 0 to 1: the same seed gives the same stream, so the same mountain. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/** One number from 0 to 1 for a whole-number point: always the same for the same point. */
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = ((h ^ (h >>> 13)) * 1274126177) | 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth noise from 0 to 1 over the plane: hash2 at the whole-number points, eased between them. */
export function vnoise(x, y) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Smoothstep on 0 to 1: eases in and out. */
export const sm = (x) => {
  const c = clamp01(x)
  return c * c * (3 - 2 * c)
}
