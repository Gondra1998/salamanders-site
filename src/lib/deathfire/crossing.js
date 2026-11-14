// The sky's clock: where Prometheus is on its way across, and whether a Time of Trial is on.
//
// The moon crosses once every 15 minutes, and at its closest pass (mid-crossing) it brings the Time of Trial, its
// size drawn by chance. One Nocturne year, in the lore the moon's closest pass, is 15 Terran years; here 15 minutes.
//
// Each visitor has their own crossing. The first time a browser opens the site its crossing begins: the moon at the
// start of its way, the trial seven and a half minutes off. The browser remembers when that was (one number, which
// never leaves it), so another page or a reload inside those 15 minutes goes on with the same crossing; after them,
// the next visit begins a new one. A page left open runs on from one crossing into the next.
//
// A trial begins only when the closest pass is seen to happen. A page opened after it (a reload in the middle of a
// trial, say) opens calm, the moon already going away: no page ever opens into a trial.
//
// While a Time of Trial is on, the trial is the moon's clock, and that is all: the moon is where the trial found it,
// carried on by the trial's own seconds at the sky's true pace. When the trial ends the moon goes on by the
// visitor's clock again.
import { pickTier, trialLength, trialLevel } from './trial.js'

export const CYCLE_MS = 15 * 60 * 1000
/** Where a browser keeps when its crossing began: a time in ms, and nothing else. */
export const CROSSING_KEY = 'deathfire.crossingBegan'

function keep(storage, ms) {
  try {
    storage?.setItem(CROSSING_KEY, String(Math.round(ms)))
  } catch {
    // storage is off or full (a private window, say): every page then begins a crossing, which is still never
    // inside a trial
  }
}

/**
 * When this browser's crossing began, in ms: the time it remembers if that crossing is still going on, otherwise
 * `now`, which it then remembers. `storage` is the browser's localStorage, and may be missing or may throw.
 * `fresh`: begin a new crossing whatever is remembered.
 */
export function crossingBegan(now, storage, fresh = false) {
  let began = NaN
  if (!fresh) {
    try {
      began = parseFloat(storage?.getItem(CROSSING_KEY))
    } catch {
      // as above
    }
  }
  // (rubbish, a time in the future, or a crossing that is over: a new one)
  if (!(began <= now && now - began < CYCLE_MS)) {
    began = now
    keep(storage, began)
  }
  return began
}

/**
 * The sky. `now` gives the time in ms, `storage` is the browser's localStorage (or null), `random` rolls for a
 * trial's size. `hold` (0 to 1) holds the moon at that point of its crossing and reads no clock: for looking at.
 * `fresh` begins a new crossing whatever the browser remembers.
 */
export function createSky({ now = Date.now, storage = null, random = Math.random, hold = null, fresh = false } = {}) {
  const held = Number.isFinite(hold) ? Math.min(0.999, Math.max(0, hold)) : null
  let began = held === null ? crossingBegan(now(), storage, fresh) : 0
  // where the moon is, in crossings: the whole part is which crossing, the rest how far across
  let at = held === null ? (now() - began) / CYCLE_MS : held
  let before = null // how far across the moon was a step ago (null until a step has been taken: nothing seen yet)
  let trialAt = -1 // seconds into the Time of Trial in progress; -1 when none
  let tier = 1 // 1 a trial, 2 a great trial, 3 a cataclysm
  let trialClock = 0 // seconds until the trial throws again
  let trialFrom = null // where the moon was when the trial in progress began

  /** Begin a Time of Trial now: of this tier, or of one drawn by chance. */
  function startTrial(ofTier) {
    tier = ofTier || pickTier(random())
    trialAt = 0
    trialClock = 0
    trialFrom = null
  }
  /** End the Time of Trial in progress, if there is one. */
  function endTrial() {
    trialAt = -1
    trialFrom = null
  }

  /**
   * Move the sky on by `secs` seconds. `live`: the page is running (not a still frame), so a closest pass seen now
   * may bring a trial. Returns where the moon is (`phase`, 0 to 1), how hard a trial rages (`trial`, 0 to 1) and of
   * what `tier`, and whether the trial throws an eruption on this step (`blast`).
   */
  function step(secs, live = true) {
    if (trialAt >= 0) {
      // a trial is on: it is the moon's clock
      if (trialFrom === null) trialFrom = at
      at = trialFrom + (trialAt * 1000) / CYCLE_MS
    } else if (held !== null) {
      at = held
    } else {
      // the visitor's own clock: how long since their crossing began
      at = (now() - began) / CYCLE_MS
      if (at >= 1) {
        // the page stayed open into the next crossing: that one is theirs now
        began += Math.floor(at) * CYCLE_MS
        keep(storage, began)
        at -= Math.floor(at)
      }
    }
    const phase = at - Math.floor(at)
    // The closest pass brings a trial only if it is seen to happen: the moon short of it a step ago, and now at it or
    // just past. So never as a page opens (nothing was seen a step ago), nor on coming back to a tab long after it.
    if (live && before !== null && before < 0.5 && phase >= 0.5 && phase < 0.56 && trialAt < 0) startTrial()
    before = phase

    let trial = 0
    let blast = false
    if (trialAt >= 0) {
      trialAt += secs
      trial = trialLevel(trialAt, tier)
      if (trialAt > trialLength(tier)) {
        endTrial()
        trial = 0
      } else if (trial > 0.2) {
        // the blast keeps throwing, the harder the oftener
        trialClock -= secs
        if (trialClock <= 0) {
          blast = true
          trialClock = 2.8 - 1.5 * trial
        }
      }
    }
    return { phase, trial, tier, blast }
  }

  return { step, startTrial, endTrial }
}
