// How full the lava lake is, and how long it has been going over its edge.
//
// The lake holds a level from 0 (only the pool where the river comes in) to 1 (to the brim). It rises as the river
// pours in: `fillMinutes` is how long it takes from where it starts to full with the mountain at rest, and a stirred
// mountain fills it up to twice as fast. Once it is full it spills, and the spill builds from 0 to 1 over a minute
// and a half (the light from below the edge grows with it). Nothing is remembered: every visit starts again.
import { clamp01 } from './noise.js'

/** How long the spill takes to build once the lake is full, in seconds, with the mountain at rest. */
export const SPILL_SECS = 90

/** A lake that starts at `start` (0 to 1). */
export function createLakeLevel(start = 0.3) {
  let level = clamp01(Number.isFinite(start) ? start : 0.3)
  let spill = 0
  // (a step that lands a hair short of full, by the arithmetic, counts as full)
  const whole = (x) => (x > 1 - 1e-9 ? 1 : x)
  return {
    /**
     * Let `secs` seconds pass, with the mountain `stirred` (0 to 1). `fillMinutes`: minutes from `start` to full at
     * rest (half a minute at the least). Returns where the lake stands: `level` and `spill`, each 0 to 1.
     */
    step(secs, stirred = 0, { fillMinutes = 5, start: from = 0.3 } = {}) {
      const pace = secs * (1 + clamp01(stirred))
      if (level < 1) {
        const minutes = fillMinutes >= 0.5 ? fillMinutes : 0.5
        level = whole(level + (pace * Math.max(0.05, 1 - from)) / (minutes * 60))
      } else {
        spill = whole(spill + pace / SPILL_SECS)
      }
      return { level, spill }
    },
  }
}
