import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEXT, contrast, over } from './test-utils/contrast'
import { HOVER_MEDIA, withoutHoverMedia } from './test-utils/css'

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
// The declarations of the `body { … }` rule (not body::before).
const bodyRule = () => css.match(/\n\s*body\s*\{([^}]*)\}/)?.[1] ?? ''

describe('style.css', () => {
  it('defines the roster tokens', () => {
    expect(css).toContain('--color-whitehot: #f2d27a;')
    expect(css).toContain('--color-vacant: #ff9a7a;')
    expect(css).toContain('--ease-forge: cubic-bezier(0.2, 0.8, 0.2, 1);')
  })

  it('defines the motion tokens inside @theme', () => {
    const theme = css.slice(css.indexOf('@theme {'), css.indexOf('\n}', css.indexOf('@theme {')))
    expect(theme).toContain('--dur-press: 120ms;')
    expect(theme).toContain('--dur-state: 180ms;')
    expect(theme).toContain('--dur-view: 240ms;')
    expect(theme).toContain('--dur-sheet: 320ms;')
  })

  it('defines one global spinner', () => {
    expect(css).toContain('@keyframes spin {')
    expect(css).toContain('rotate(360deg)')
  })

  it('.surface keeps body text readable over the brightest lava', () => {
    const rule = css.match(/\.surface\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    const [, r, g, b, a] = rule[1].match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
    expect(contrast(over([r, g, b], Number(a)), TEXT)).toBeGreaterThanOrEqual(4.5)
  })

  it('guards reduced motion without breaking transitionend', () => {
    const at = css.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(at).toBeGreaterThan(-1)
    const block = css.slice(at, at + 700)
    expect(block).toContain('animation-duration: 0.01ms !important')
    expect(block).toContain('transition-duration: 0.01ms !important')
    expect(block).toContain('animation-iteration-count: 1 !important')
    expect(block).toContain('scroll-behavior: auto !important')
    // a staggered pour is delays, not durations: with delays left in, ranks still light one by one
    expect(block).toContain('transition-delay: 0s !important')
    expect(block).toContain('animation-delay: 0s !important')
  })

  it('keeps opacity and colour feedback under reduced motion', () => {
    const at = css.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(at).toBeGreaterThan(-1)
    // Brace-match the query: slicing to the end of the file would let the later .btn-ember rules satisfy this.
    let depth = 0
    let end = css.indexOf('{', at)
    for (let i = end; i < css.length; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}' && --depth === 0) {
        end = i
        break
      }
    }
    const block = css.slice(at, end + 1)
    for (const selector of ['.rm-fade', '.btn-ember', '.btn-drake', '.btn-ghost', '.btn-sm']) {
      expect(block, selector).toContain(selector)
    }
    expect(block).toContain('transition-duration: var(--dur-state) !important')
    expect(block).toContain('animation-duration: var(--dur-state) !important')
    // the route fade (App.vue's `main > *`) shares the animation-duration rule with .rm-fade
    expect(block).toMatch(/\.rm-fade,\s*main > \*\s*\{\s*animation-duration: var\(--dur-state\) !important/)
    const list = block.match(/transition-property:([^;]*);/)?.[1] ?? ''
    const props = list.replace('!important', '').split(',').map((p) => p.trim())
    expect(props).toContain('opacity')
    expect(props).toContain('color')
    expect(props).not.toContain('transform')
  })
})

describe('App.vue route fade', () => {
  const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')

  it('fades by opacity only, so it can stay visible under reduced motion', () => {
    // The fade is the one route-change cue left when nothing may move; a translate would have to be cut with it.
    const at = app.indexOf('@keyframes view-in')
    expect(at).toBeGreaterThan(-1)
    let depth = 0
    let end = app.indexOf('{', at)
    for (let i = end; i < app.length; i++) {
      if (app[i] === '{') depth++
      else if (app[i] === '}' && --depth === 0) {
        end = i
        break
      }
    }
    const block = app.slice(at, end + 1)
    expect(block).toContain('opacity')
    expect(block).not.toMatch(/transform|translate/)
  })

  it('has no reduced-motion block of its own', () => {
    // A scoped rule is unlayered, so it loses to the layered blanket in style.css; the route fade's reduced-motion
    // duration comes from `.rm-fade, main > *` there, and a block here would only look as if it worked.
    expect(app).not.toContain('prefers-reduced-motion')
  })
})

// The platform layer that makes the site feel installed on a phone (see docs/handoff/2026-10-20-mobile-baseline.md).
describe('mobile baseline', () => {
  it('lets the page paint under the notch', () => {
    // Fails if viewport-fit=cover is dropped from the viewport meta.
    const content = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)?.[1]
    expect(content).toBe('width=device-width, initial-scale=1.0, viewport-fit=cover')
  })

  it('never disables zoom', () => {
    // Fails if someone "fixes" input zoom with user-scalable=no or maximum-scale instead of a 16px field.
    expect(html).not.toContain('user-scalable')
    expect(html).not.toContain('maximum-scale')
  })

  it('removes the tap flash and font inflation', () => {
    expect(css).toContain('-webkit-tap-highlight-color: transparent;')
    expect(css).toContain('-webkit-text-size-adjust: 100%;')
  })

  it('makes controls tap immediately', () => {
    const rule = css.match(/button,\s*a,\s*\[role='button'\]\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).toContain('touch-action: manipulation;')
  })

  it('keeps text fields at 16px on touch screens', () => {
    // Below 16px iOS zooms the page on focus and does not zoom back out.
    const at = css.indexOf('@media (pointer: coarse)')
    expect(at).toBeGreaterThan(-1)
    expect(css.slice(at)).toMatch(/input[^{]*textarea[^{]*select[^{]*\{[^}]*font-size:\s*16px/)
  })

  it('pads for the notch and home indicator', () => {
    // viewport-fit=cover alone would slide content under the notch in landscape.
    const body = bodyRule()
    expect(body).toContain('env(safe-area-inset-left, 0px)')
    expect(body).toContain('env(safe-area-inset-right, 0px)')
    expect(body).toContain('env(safe-area-inset-bottom, 0px)')
  })

  it('keeps bottom toasts clear of the home indicator', () => {
    // A toast anchored 1.4rem from the bottom would sit in the indicator's zone once the page paints under it.
    for (const view of ['Armoury', 'Builds', 'Planner']) {
      const src = readFileSync(new URL(`./views/${view}.vue`, import.meta.url), 'utf8')
      const toast = src.match(/\.toast\s*\{([^}]*)\}/)?.[1] ?? ''
      expect(toast, view).toContain('bottom: calc(1.4rem + env(safe-area-inset-bottom, 0px))')
    }
  })

  it('applies hover styles only where hover exists', () => {
    // A touch screen fakes a hover on the first tap and leaves it there; outside this query it would stick.
    expect(withoutHoverMedia(css)).not.toContain(':hover')
  })

  it('keeps the shared hover styles for devices that hover', () => {
    // Guards the test above from passing because the hover styles were deleted rather than gated.
    const block = css.slice(css.indexOf(HOVER_MEDIA))
    expect(css).toContain(HOVER_MEDIA)
    expect(block).toContain('.btn-ember:hover')
    expect(block).toContain('.btn-drake:hover')
  })

  it('gives the shared buttons a press state', () => {
    for (const cls of ['btn-ember', 'btn-drake', 'btn-ghost']) {
      const rule = css.match(new RegExp(`\\.${cls}:active\\s*\\{([^}]*)\\}`))
      expect(rule, cls).not.toBeNull()
      expect(rule[1], cls).toContain('transform: scale(0.97)')
    }
  })

  it('animates the press on every shared button', () => {
    // Without a transform transition the press snaps instead of easing.
    for (const cls of ['btn-ember', 'btn-drake', 'btn-ghost']) {
      const rule = css.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`))
      expect(rule[1], cls).toContain('transform var(--dur-press) var(--ease-forge)')
    }
  })

  it('leaves pull-to-refresh and text selection alone', () => {
    expect(css).not.toContain('overscroll-behavior: none')
    expect(bodyRule()).not.toContain('user-select: none')
  })
})

// Placeholders, empty-state names, hints and the footer fine print used #5f6f66, which measured
// 3.3 to 3.7:1 on the dark surfaces. This is the quiet tier that still reads.
describe('quiet text', () => {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

  it('defines --color-faint at 4.5:1 or better on every dark surface it sits on', () => {
    const faint = css.match(/--color-faint:\s*(#[0-9a-f]{6})/i)?.[1]
    expect(faint).toBeTruthy()
    // footer, search fields, the lightest panel, and the page ground, as measured on the live pages
    for (const surface of ['#060e0b', '#0a1510', '#0e1c16', '#07110d']) {
      expect(contrast(rgb(faint), rgb(surface)), surface).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps the old grey out of every component', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir, { recursive: true }).filter((f) => /\.(vue|css)$/.test(f))
    expect(files.filter((f) => readFileSync(join(dir, f), 'utf8').includes('#5f6f66'))).toEqual([])
  })
})

// The small and ghost buttons were redefined in the Armoury, Planner and build cards (three copies
// that had drifted apart), and a fourth page used .btn-sm with no definition at all, so its button
// had no padding. One definition now serves every page.
describe('small buttons', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  const vueFiles = readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.vue'))

  it('are defined once, in the shared stylesheet', () => {
    expect(css).toMatch(/\.btn-sm\s*\{[^}]*padding:/)
    expect(css).toMatch(/\.btn-ghost\s*\{[^}]*border:/)
    const redefined = vueFiles.filter((f) => /^\.btn-(sm|ghost)\s*(\{|:hover)/m.test(readFileSync(join(dir, f), 'utf8')))
    expect(redefined).toEqual([])
  })

  it('gate the ghost hover behind a real pointer', () => {
    expect(css.slice(css.indexOf(HOVER_MEDIA))).toContain('.btn-ghost:hover')
  })

  it('grow to the tap target on phones and touch screens', () => {
    expect(css).toMatch(/\.btn-sm\s*\{[^}]*min-height:\s*var\(--tap\)/)
  })

  it('have a full size, .btn-md, that every page primary action shares', () => {
    const md = css.match(/\.btn-md\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(md).toContain('padding: 0.7rem 1.4rem;')
    expect(md).toContain('border-radius: var(--radius-sm);')
    expect(md).toContain('min-height: var(--tap);')
    expect(md).toContain('cursor: pointer;')
    const redefined = vueFiles.filter((f) => /^\.btn-md\s*(\{|:hover)/m.test(readFileSync(join(dir, f), 'utf8')))
    expect(redefined).toEqual([])
  })

  it('dim a disabled button and never lift it on hover', () => {
    const disabled = css.match(/\.btn-ember:disabled,\s*\.btn-drake:disabled,\s*\.btn-ghost:disabled\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(disabled).toContain('opacity: 0.55;')
    expect(disabled).toContain('cursor: not-allowed;')
    const hovers = css.slice(css.indexOf(HOVER_MEDIA))
    for (const cls of ['btn-ember', 'btn-drake', 'btn-ghost']) {
      expect(hovers, cls).toContain(`.${cls}:hover:not(:disabled)`)
    }
    // no hover rule on a shared button may skip the :disabled guard
    expect(css).not.toMatch(/\.btn-(ember|drake|ghost):hover\s*\{/)
  })
})

// PRODUCT.md promises tap targets of at least 44px on phones. --tap is `auto` on desktop (a control keeps
// its own size) and 44px on phones and touch screens; a control writes min-height: var(--tap).
describe('tap targets', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  const read = (file) => readFileSync(join(dir, file), 'utf8')
  // `selector {` at the start of a line, indented or not (the shared rules in style.css sit inside a layer).
  const rule = (source, selector) =>
    new RegExp(`\\n[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(source)?.[1] ?? ''

  it('is auto on desktop and 44px on phones and touch screens', () => {
    expect(css).toMatch(/:root\s*\{\s*--tap:\s*auto;/)
    expect(css).toMatch(/@media \(pointer: coarse\), \(max-width: 768px\)\s*\{\s*:root\s*\{\s*--tap:\s*44px;/)
  })

  it.each([
    ['components/AppNav.vue', '.brand'],
    ['components/SiteFooter.vue', '.footer-links a'],
    ['components/WeaponSlot.vue', '.slot-select'],
    // The segmented tab and the search field carry it for every page (Planner .class-tab, Armoury .cat-tab and .w-search).
    ['style.css', '.tab-forge'],
    ['style.css', '.field-forge'],
    ['views/Armoury.vue', '.w-item'],
    ['views/Companies.vue', '.c-chip'],
    ['views/Planner.vue', '.save-more'],
    ['views/Planner.vue', '.save-needs-pick'],
    ['views/Planner.vue', '.save .fld'],
  ])('%s %s uses it', (file, selector) => {
    expect(rule(read(file), selector), `${file} ${selector}`).toMatch(/min-height:\s*var\(--tap\)/)
  })

  it('makes the menu button 44px square', () => {
    expect(rule(read('components/AppNav.vue'), '.burger')).toMatch(/width:\s*44px;[^}]*height:\s*44px;/)
  })
})

// The micro-labels (mono caps) are unreadable on a phone. Each sub-11px size is written
// max(<its size>, var(--text-floor)): the variable is 0 on desktop, where a micro-label now sits at --text-xs
// (11.5px), and 11px on phones.
describe('small text', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  const files = readdirSync(dir, { recursive: true }).filter((f) => /\.(vue|css)$/.test(f))

  it('has a text floor that is off on desktop and 11px on phones', () => {
    expect(css).toMatch(/:root\s*\{\s*--text-floor:\s*0rem;/)
    expect(css).toMatch(/@media \(max-width: 768px\)\s*\{\s*:root\s*\{\s*--text-floor:\s*0\.6875rem;/)
  })

  it('lets no component set a font size under 11px without it', () => {
    const under = []
    for (const f of files) {
      readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(/font-size:\s*([\d.]+)rem\b/)
        if (m && parseFloat(m[1]) < 0.6875) under.push(`${f}:${i + 1} ${line.trim()}`)
      })
    }
    expect(under).toEqual([])
  })
})

// The page layer (docs/superpowers/specs/2026-11-05-page-layer-design.md): a type ramp, radii and three colours that
// every page names instead of a literal, plus the one segmented tab, search field, stud and lede.
describe('page layer tokens', () => {
  // The text between the braces that open at `at` (brace-matched), braces excluded.
  const blockAt = (source, at) => {
    let depth = 0
    const open = source.indexOf('{', at)
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
    }
    return source.slice(open + 1)
  }
  const theme = () => blockAt(css, css.indexOf('@theme {'))
  const components = () => blockAt(css, css.indexOf('@layer components'))

  it('defines the text ramp, radii and the three new colours inside @theme', () => {
    const tokens = {
      '--color-pewter': '#c3d0c6',
      '--color-ember-light': '#ffb066',
      '--color-ember-ink': '#1a0d06',
      '--text-xs': '0.72rem',
      '--text-sm': '0.82rem',
      '--text-md': '0.9rem',
      '--text-base': '1rem',
      '--text-lg': '1.25rem',
      '--text-xl': '1.5rem',
      '--text-2xl': 'clamp(1.8rem, 5vw, 2.8rem)',
      '--text-display': 'clamp(2.2rem, 7vw, 3.6rem)',
      '--radius-sm': '2px',
      '--radius-md': '3px',
      '--radius-lg': '8px',
      '--radius-pill': '999px',
    }
    const block = theme()
    for (const [name, value] of Object.entries(tokens)) {
      expect(block, name).toContain(`${name}: ${value};`)
    }
  })

  it('defines one segmented tab, one search field, one stud and one lede', () => {
    const layer = components()
    for (const selector of ['.tab-forge {', '.field-forge {', '.stud {', '.page-lede {']) {
      expect(layer.split(selector).length - 1, selector).toBe(1)
    }
    const on = layer.match(/\.tab-forge\.on\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(on).toContain('var(--color-ember-light)')
    expect(on).toContain('var(--color-ember)')
    expect(on).toContain('var(--color-ember-ink)')
    // hover is gated behind a real pointer, but it must exist
    expect(css).toContain('.tab-forge:hover')
    expect(withoutHoverMedia(css)).not.toContain('.tab-forge:hover')
    const active = css.match(/\.tab-forge:active\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(active).toContain('transform: scale(0.97)')
  })

  it('keeps tab colour feedback under reduced motion', () => {
    const reduced = blockAt(css, css.indexOf('@media (prefers-reduced-motion: reduce)'))
    // The selector list of the allowlist rule is whatever sits between the previous rule and the brace that
    // holds `transition-property`.
    const props = reduced.indexOf('transition-property:')
    expect(props).toBeGreaterThan(-1)
    const open = reduced.lastIndexOf('{', props)
    const selectors = reduced.slice(reduced.lastIndexOf('}', open) + 1, open)
    expect(selectors).toContain('.rm-fade')
    expect(selectors).toContain('.tab-forge')
  })

  // The ember gradient's light top and its ink live in style.css as --color-ember-light and --color-ember-ink; a
  // component names the token. The Deathwatch and Archive areas are out of scope for the page layer and keep
  // their own values, and so does the volcano canvas (it draws in JS, like motionPolicy.test.js's skipped files).
  it('keeps the ember hex out of components', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir, { recursive: true })
      .map((f) => f.replaceAll('\\', '/'))
      .filter((f) => /\.(vue|css)$/.test(f))
      .filter((f) => f !== 'style.css' && f !== 'components/MountDeathfire.vue')
      .filter((f) => !/(^|\/)(deathwatch|archive)\//.test(f))
    const offenders = files.filter((f) => /#ffb066|#1a0d06/i.test(readFileSync(join(dir, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
