// The two scenes the mountain is baked from: one for desktop, one for phones. They live here, apart from the bake
// tool's page, so the golden check can build exactly the same two and prove the baked pictures did not change.
// `createScene` is handed in, so this file does not care where the scene's code lives.

// The window the look was judged in (2026-11-14). Everything that used to be measured against the window's width
// (where the river comes down, where the title stands, how far the lava's light reaches) is handed in as it was
// there, beside the mountain.
const REF = { w: 1596, h: 738, faceX: 0.14 }

/** `tune`: the mountain's numbers to bake with (empty: the scene's own defaults). `more`: anything else to hand the scene (the painter). */
export function bakeScenes(createScene, tune = {}, more = {}) {
  function desktop() {
    const H = REF.h * 0.72 // the default peak height
    const peak0 = REF.w * REF.faceX // where the peak stood in that window
    // a canvas wide enough for the whole mountain and its shoulders, which the window itself never shows
    const peakX = Math.round(1.7 * H)
    const w = Math.round(5.2 * H)
    const dpr = 1.5
    return createScene(w, REF.h, {
      ...more,
      dpr,
      rockRes: dpr,
      flip: true,
      faceX: peakX / w,
      footX: peakX + (REF.w * 0.276 - peak0),
      titleSpan: [peakX + (REF.w * 0.2 - peak0), peakX + (REF.w * 0.8 - peak0)],
      fall: REF.w * 0.034,
      moonR: 220, // the moon's radius: big enough for a window 1570 px tall (in the judged window it is 103 px at an ordinary closest pass)
      tune,
      bakeMountain: true,
    })
  }

  function phone() {
    // a 390 x 844 phone, the hero's lowest button ending at 352 (measured on the real page, spec section 7)
    const ref = { w: 390, h: 844, faceX: 0.36, textBottom: 352 }
    const peak0 = ref.w * ref.faceX
    const w = 1700
    const peakX = 800
    const dpr = 2
    return createScene(w, ref.h, {
      ...more,
      dpr,
      rockRes: dpr,
      phoneMax: 1e9, // a phone's mountain, whatever the canvas's width
      textBottom: ref.textBottom,
      flip: true,
      faceX: peakX / w,
      footX: peakX + 0.075 * ref.w,
      titleSpan: [peakX + (ref.w * 0.2 - peak0), peakX + (ref.w * 0.8 - peak0)],
      fall: ref.w * 0.034,
      tune,
      bakeMountain: true,
      // a phone shows well under one mountain height left of the peak and a little over one right of it: the far reach
      // of the shoulders is left out of the picture
      bakeSpan: [-0.9, 1.6],
    })
  }

  return { desktop, phone }
}
