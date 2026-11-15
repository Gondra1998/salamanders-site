import { reactive } from 'vue'

/**
 * The numbers the hero's burning title is drawn with (FireText, by way of HeroForge).
 *
 * This file once held far more: a dev tuner's sliders for the title and for the volcano behind the site, and a
 * profile of the volcano for every page. The look is settled and the tuner is gone. The volcano's numbers are
 * constants now, in src/lib/deathfire/look.js.
 */
export const DEFAULTS = {
  text: {
    pixel: 1,
    speed: 1.45,
    maxHeight: 0.8,
    variation: 0.95,
    intensity: 1.3,
    base: 0.35,
  },
}

const clone = (o) => JSON.parse(JSON.stringify(o))

export const fireTuning = reactive(clone(DEFAULTS))
