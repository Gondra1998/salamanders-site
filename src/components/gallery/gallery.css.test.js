import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { withoutHoverMedia } from '../../test-utils/css'

// The layout promises of the Reliquarium (single column on a phone, 16px gutters, 44px tap targets, no control that
// needs a hover) live in one stylesheet, so they are pinned there. The motion rules are swept by motionPolicy.test.js.
const css = readFileSync(fileURLToPath(new URL('./gallery.css', import.meta.url)), 'utf8')
const rule = (selector) => new RegExp(`(?:^|\\n)${selector.replace(/[.[\]()]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
const media = (query) => {
  const at = css.indexOf(`@media ${query} {`)
  if (at === -1) return ''
  let depth = 0
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1)
  }
  return ''
}

describe('gallery.css', () => {
  it('lays the cards out in a grid that fills the width with columns of at least 260px', () => {
    expect(rule('.rq-grid')).toMatch(/display:\s*grid/)
    expect(rule('.rq-grid')).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(260px,\s*1fr\)\)/)
  })

  it('is a single column under 600px', () => {
    expect(media('(max-width: 599px)')).toMatch(/\.rq-grid\s*\{[^}]*grid-template-columns:\s*1fr/)
  })

  it('keeps 16px gutters on a phone', () => {
    expect(rule('.rq-grid')).toMatch(/gap:\s*1rem/)
    expect(rule('.rq')).toMatch(/padding:[^;]*\b1rem\b/)
  })

  it.each(['.rq-tab', '.rq-open', '.rq-input'])('%s is a full-size tap target', (selector) => {
    expect(rule(selector), selector).toMatch(/min-height:\s*var\(--tap\)/)
  })

  it('has no hover rule outside the real-pointer media query: nothing depends on hover', () => {
    expect(css).toContain(':hover') // there are hover refinements, and they are the only ones
    expect(withoutHoverMedia(css)).not.toContain(':hover')
  })

  it('colours each status chip with one of the site\'s tokens', () => {
    for (const status of ['pending', 'approved', 'rejected', 'hidden', 'removed']) {
      expect(rule(`.rq-chip[data-status='${status}']`), status).toMatch(/color:\s*var\(--color-[a-z-]+\)/)
    }
  })
})
