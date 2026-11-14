// The approved look: the drawing's numbers, as they stood when the look was approved (2026-11-14).
// They were sliders once, in a dev tuner. The look is settled now, so they are constants.
//
// The mountain's own five (baseW, crown, rock, columns, planes) are baked into the mountain's pictures: to change
// them, change them here and bake again (`npm run deathfire:bake`).
export const LOOK = Object.freeze({
  // the mountain
  peakH: 0.72, // the rim's height, as a share of the window's (desktop; a phone stands it under the hero's text)
  baseW: 1.35, // half the base's width, in mountain heights
  crown: 1.25, // the broken crown's size
  rock: 1, // how strongly the rock's skin shows
  columns: 1, // how much of it is basalt columns
  planes: 0.55, // how far the big planes stand off from one another
  // the far country
  ranges: 1, // how many far peaks
  rangeH: 1, // their height
  haze: 0.5, // the warm haze between their bands
  // the lava
  lavaTint: 0.5, // how much of the title's own fire colours tint the molten ramp
  lavaRed: 0.5, // how deep a red the cool end runs
  lavaHeat: 1.12,
  // the air
  plume: 1.3,
  embers: 2.3,
  fog: 1,
  // the lake
  lake: 1, // how far its point reaches
  lakeCrust: 0.3,
  lakeHeat: 1,
  // for the host, not the scene
  lakeStart: 0.3, // how full the lake is when a visit begins
  lakeFill: 5, // minutes from there to full, with the mountain at rest
  ash: 460, // falling flakes over a 1600 x 1000 window
})
