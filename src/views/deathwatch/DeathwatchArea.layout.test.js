import { describe, it, expect } from 'vitest'
import source from './DeathwatchArea.vue?raw'

// jsdom lays nothing out, so the wide-screen rail is held by its rules: the view is 86rem less the padding, the
// rail and the gap (1020px), and centred from 1740px, where three columns first fit with a scrollbar.
const style = source.slice(source.indexOf('<style'))
const rule = (selector, at = 0) => {
  const from = style.indexOf(`${selector} {`, at)
  return from < 0 ? '' : style.slice(from, style.indexOf('}', from))
}
const rem = (decl, css) => css.match(new RegExp(`${decl}:\\s*([^;]+);`))?.[1].trim()

describe('the wide-screen rail', () => {
  const wide = style.indexOf('@media (min-width: 1740px)')

  it('docks the rail at the left edge from 1740px, with an empty column the rail\'s width on the right', () => {
    expect(wide).toBeGreaterThan(0)
    const area = rule('.dw-area', wide)
    expect(rem('grid-template-columns', area)).toBe('18.75rem minmax(0, 1fr) 18.75rem')
    expect(rem('max-width', area)).toBe('none')
    expect(rule('.dw-area-main', wide)).toContain('justify-self: center')
  })

  // The view must not narrow or widen across the step: its cap is the width it has in the two-column layout below.
  it('keeps the view as wide as below the step', () => {
    const narrow = style.indexOf('@media (min-width: 900px)')
    const base = rule('.dw-area')
    const twoColumns = rule('.dw-area', narrow)
    expect(rem('max-width', base)).toBe('86rem')
    expect(rem('padding', base)).toMatch(/^\S+ 1rem /)
    expect(rem('grid-template-columns', twoColumns)).toBe('18.75rem minmax(0, 1fr)')
    expect(rem('gap', twoColumns)).toBe('1.5rem')
    expect(rem('max-width', rule('.dw-area-main', wide))).toBe('calc(86rem - 2rem - 18.75rem - 1.5rem)')
  })

  // The Armouring Hall's head holds its tabs and the way back, so from 900px it has no rail; the rules come after
  // the wide step's, so they hold there too.
  it('is left out of the Armouring Hall from 900px, its view taking the whole width', () => {
    const solo = style.lastIndexOf('@media (min-width: 900px)')
    expect(solo).toBeGreaterThan(style.indexOf('@media (min-width: 1740px)'))
    expect(rem('display', rule('.dw-area.solo .dw-area-side', solo))).toBe('none')
    expect(rem('grid-template-columns', rule('.dw-area.solo', solo))).toBe('minmax(0, 1fr)')
    expect(rem('max-width', rule('.dw-area.solo .dw-area-main', solo))).toBe('none')
    expect(source).toContain(`['armouringhall', 'recruitment'].includes(page.value.area)`)
    expect(source).toContain(`:class="{ solo }"`)
  })
})
