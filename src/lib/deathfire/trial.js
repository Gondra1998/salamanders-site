// The Time of Trial, and how stirred the mountain is. Plain numbers: nothing here touches the page or the clock.
import { clamp01, sm } from './noise.js'

/** How long a Time of Trial lasts, in seconds. Tier 1 is a trial, 2 a great trial, 3 a cataclysm. */
export const trialLength = (tier) => 6 + (6 + 8 * tier) + (30 + 10 * tier)

/** How hard the Time of Trial is raging `sec` seconds in, 0 to 1: eased in, held, and let go slowly. Nothing flashes. */
export function trialLevel(sec, tier) {
  const rise = 6
  const hold = 6 + 8 * tier
  const fall = 30 + 10 * tier
  const peak = [0, 0.55, 0.8, 1][tier]
  if (sec < rise) return peak * sm(sec / rise)
  if (sec < rise + hold) return peak
  return peak * (1 - sm((sec - rise - hold) / fall))
}

/** Which trial a closest pass brings, from a roll of 0 to 1: 5% a cataclysm, 25% a great trial, 70% a trial. */
export const pickTier = (roll) => (roll < 0.05 ? 3 : roll < 0.3 ? 2 : 1)

/**
 * How stirred up the mountain is, 0 to 1. Prometheus drags at the crust as it nears: nothing for the outer half of its
 * crossing, then a rise to a half at its closest pass (`phase` 0.5). A Time of Trial (`trial`, 0 to 1) comes on top.
 * Everything that quickens with the moon reads this one number: the pulse of eruptions, the river's speed and heat,
 * the lake's inflow, the plume, the sparks, the far volcanoes.
 */
export function excitement(phase, trial = 0) {
  const near = Math.sin(Math.PI * clamp01(phase))
  return clamp01(0.5 * sm((near - 0.7) / 0.3) + trial)
}
