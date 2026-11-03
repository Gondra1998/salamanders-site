import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { withoutHoverMedia } from './test-utils/css'

// The motion rules every swept stylesheet and component follows. Durations are tokens
// (--dur-press/state/view/sheet), easing is var(--ease-forge), loops are rare, and hover is gated behind
// a real pointer. A failure names the rule (R1 to R6), the file and the line, so it works as a worksheet.
//
// Paths are relative to src/, written with forward slashes. An entry is a file, or a folder (every .vue
// and .css under it, at any depth). The single entry '.' is the whole of src/, so a new component or
// stylesheet is under the rules from the day it is added.
const SWEPT = ['.']

// The canvas and its dev tuner keep their own numbers, so the sweep of src/ never scans them.
const SKIPPED = [
  'components/MountDeathfire.vue',
  'components/FireText.vue',
  'components/FireTuner.vue',
]
// Files whose authored loops may use ease-in-out (the deathwatch drift and flicker, the gate pulses, the
// archive gate's unsealing glow).
const EASE_IN_OUT_FILES = [
  'components/deathwatch/deathwatch.css',
  'components/deathwatch/DeathwatchGate.vue',
  'components/archive/ArchiveGate.vue',
]
// Files that keep their own cubic-bezier curve (the archive thread cooling).
const CUBIC_BEZIER_FILES = ['components/archive/ArchiveThread.vue']
// Files whose animations keep their own authored durations (the loops above, plus the roster flash and ping and
// the armour card's arrival flash).
const AUTHORED_DURATION_FILES = [
  'components/archive/ArchiveThread.vue',
  'components/archive/ArchiveGate.vue',
  'components/deathwatch/deathwatch.css',
  'components/deathwatch/DeathwatchGate.vue',
  'components/roster/RosterBranch.vue',
  'components/roster/RosterMember.vue',
  'components/deathwatch/armour/ArmourView.vue',
  // the slow fade from the Deathwatch boot screen onto the page
  'components/deathwatch/DeathwatchBoot.vue',
  // the banner's dim into the cogitator's scan lines on the way in
  'components/company/DeathwatchBanner.vue',
]
// The only animations allowed to loop forever: the Deathwatch drift and flicker, the Archive gate's unsealing
// glow, and a spinner. A line that says `infinite` must name one of them (so dw-pulse and dw-gate-pulse, which
// run three times, are caught).
const INFINITE_ANIMATIONS = ['dw-drift', 'dw-flicker', 'gate-glow', 'spin']
// The one file that defines @keyframes spin; components reuse it.
const SPINNER_FILE = 'style.css'
// The reduced-motion guard collapses motion to this instant, which is not a design duration.
const INSTANT = '0.01ms'

const srcDir = fileURLToPath(new URL('.', import.meta.url))

// Every .vue and .css file under the entries, minus the skipped ones.
const expand = (entries) => {
  const found = new Set()
  for (const entry of entries) {
    if (statSync(join(srcDir, entry)).isDirectory()) {
      for (const f of readdirSync(join(srcDir, entry), { recursive: true })) {
        if (/(^|[\\/])node_modules[\\/]/.test(f)) continue
        if (/\.(vue|css)$/.test(f)) found.add(`${entry}/${f}`.replaceAll('\\', '/').replace(/^\.\//, ''))
      }
    } else found.add(entry)
  }
  return [...found].filter((f) => !SKIPPED.includes(f)).sort()
}

// 1-based line number and trimmed text of the line holding `offset`.
const lineAt = (text, offset) => {
  const start = text.lastIndexOf('\n', offset - 1) + 1
  const end = text.indexOf('\n', offset)
  return {
    line: text.slice(0, offset).split('\n').length,
    text: text.slice(start, end === -1 ? text.length : end).trim(),
  }
}

// The declarations that carry timing, with where their value starts. A value runs to the next ; or brace,
// so a transition split over several lines is one declaration.
const TIMING_DECLARATION = new RegExp(
  `(?<![\\w-])(${[
    'transition',
    'animation',
    'transition-timing-function',
    'animation-timing-function',
    'transition-duration',
    'animation-duration',
  ].join('|')})\\s*:([^;{}]*)`,
  'g',
)
// A keyword that is not part of a longer name: `ease` is not in `ease-in` or in `var(--ease-forge)`.
const EASING = /(?<![\w-])(ease-in-out|ease-in|ease-out|ease)(?![\w-])/g
const LITERAL_DURATION = /\b\d+(\.\d+)?m?s\b/g

// Every rule the file breaks, as { rule, line, text }, in rule order. `file` is relative to src/.
const checkFile = (file, text) => {
  const found = []
  const add = (rule, at) => found.push({ rule, ...lineAt(text, at) })

  // R1: name the properties that change.
  for (const m of text.matchAll(/transition(-property)?\s*:\s*all\b/g)) add('R1', m.index)

  for (const m of text.matchAll(TIMING_DECLARATION)) {
    const [whole, prop, value] = m
    const at = m.index + whole.length - value.length
    const isAnimation = prop.startsWith('animation')
    // R2: one easing curve, var(--ease-forge); the others only where authored.
    if (!prop.endsWith('duration')) {
      for (const e of value.matchAll(EASING)) {
        if (e[1] === 'ease-in-out' && EASE_IN_OUT_FILES.includes(file)) continue
        add('R2', at + e.index)
      }
      const bezier = value.indexOf('cubic-bezier(')
      if (bezier !== -1 && !CUBIC_BEZIER_FILES.includes(file)) add('R2', at + bezier)
    }
    // R3: durations are tokens. An animation keeps a literal only in the authored files, or on a spinner line.
    if (!prop.endsWith('timing-function')) {
      for (const d of value.matchAll(LITERAL_DURATION)) {
        if (d[0] === INSTANT) continue
        if (isAnimation && AUTHORED_DURATION_FILES.includes(file)) continue
        if (isAnimation && lineAt(text, at + d.index).text.includes('spin')) continue
        add('R3', at + d.index)
      }
    }
  }

  // R4: nothing loops forever except the Deathwatch ambience, the gate glow and a spinner (line-level).
  for (const m of text.matchAll(/\binfinite\b/g)) {
    const { text: line } = lineAt(text, m.index)
    if (!INFINITE_ANIMATIONS.some((name) => line.includes(name))) add('R4', m.index)
  }

  // R5: every :hover sits inside the real-pointer media query. The cut text has no line numbers to report.
  const outside = withoutHoverMedia(text)
  for (const m of outside.matchAll(/:hover\b/g)) {
    found.push({ rule: 'R5', line: null, text: lineAt(outside, m.index).text })
  }

  // R6: one @keyframes spin, in the shared stylesheet.
  if (file !== SPINNER_FILE) {
    for (const m of text.matchAll(/@keyframes\s+spin(?![\w-])/g)) add('R6', m.index)
  }

  return found.sort((a, b) => a.rule.localeCompare(b.rule) || (a.line ?? 0) - (b.line ?? 0))
}

const describeFinding = (file, { rule, line, text }) => `${rule} ${file}${line ? `:${line}` : ''}  ${text}`

describe('motion policy', () => {
  const files = expand(SWEPT)

  it('sweeps the shared stylesheet', () => {
    expect(files).toContain('style.css')
  })

  it.each(files)('%s follows the motion rules', (file) => {
    const found = checkFile(file, readFileSync(join(srcDir, file), 'utf8'))
    expect(found.map((f) => describeFinding(file, f))).toEqual([])
  })
})

// The checker has to see what it is meant to see, or a green run proves nothing.
describe('the motion rules check', () => {
  const rules = (file, source) => checkFile(file, source).map((f) => f.rule)

  it('R1 catches transition: all and transition-property: all, in either spacing', () => {
    expect(rules('a.vue', '.a { transition: all var(--dur-state) var(--ease-forge); }')).toEqual(['R1'])
    expect(rules('a.vue', '.a { transition:all var(--dur-state) var(--ease-forge); }')).toEqual(['R1'])
    expect(rules('a.vue', '.a { transition-property: all; }')).toEqual(['R1'])
    expect(rules('a.vue', '.a { transition-property:all; }')).toEqual(['R1'])
    expect(rules('a.vue', '.a { transition-property: opacity, transform; }')).toEqual([])
    expect(rules('a.vue', '.a { transition: opacity var(--dur-state) var(--ease-forge); }')).toEqual([])
  })

  it('R2 catches the built-in curves but not ease-forge', () => {
    for (const curve of ['ease', 'ease-in', 'ease-out']) {
      expect(rules('a.vue', `.a { transition: opacity var(--dur-state) ${curve}; }`), curve).toEqual(['R2'])
    }
    expect(rules('a.vue', '.a { transition-timing-function: ease; }')).toEqual(['R2'])
    expect(rules('a.vue', '.a { animation-timing-function: ease-out; }')).toEqual(['R2'])
    expect(rules('a.vue', '.a { transition: opacity var(--dur-state) var(--ease-forge); }')).toEqual([])
    expect(rules('a.vue', '.a { animation: pulse var(--dur-view) var(--ease-forge) both; }')).toEqual([])
  })

  it('R2 allows ease-in-out and cubic-bezier only in the files that author them', () => {
    const loop = '.a { animation: dw-drift 40s ease-in-out infinite alternate; }'
    // the loop itself is fine (it names dw-drift); the curve and the 40s are what a.vue may not use
    expect(rules('a.vue', loop)).toEqual(['R2', 'R3'])
    expect(rules('components/deathwatch/deathwatch.css', loop)).toEqual([])
    const curve = '.a { animation: cool 1.7s cubic-bezier(0.2, 0.7, 0.3, 1); }'
    expect(rules('a.vue', curve)).toEqual(['R2', 'R3'])
    expect(rules('components/archive/ArchiveThread.vue', curve)).toEqual([])
    // the archive gate's unsealing glow keeps ease-in-out (but not a cubic-bezier), and may loop while the gate shows
    const glow = '.a { animation: gate-glow 1.6s ease-in-out infinite; }'
    expect(rules('a.vue', glow)).toEqual(['R2', 'R3'])
    expect(rules('components/archive/ArchiveGate.vue', glow)).toEqual([])
    // ease-in-out is not read as ease-in or as ease
    expect(rules('components/deathwatch/DeathwatchGate.vue', '.a { animation: x var(--dur-view) ease-in-out; }')).toEqual([])
  })

  it('R2 and R3 read a transition split over several lines', () => {
    const source = '.a {\n  transition:\n    transform var(--dur-press) var(--ease-forge),\n    opacity 0.2s ease;\n}'
    expect(checkFile('a.vue', source).map((f) => [f.rule, f.line, f.text])).toEqual([
      ['R2', 4, 'opacity 0.2s ease;'],
      ['R3', 4, 'opacity 0.2s ease;'],
    ])
  })

  it('R3 catches a literal duration in a transition, however it is written', () => {
    for (const lit of ['120ms', '0.15s', '.5s', '2s']) {
      expect(rules('a.vue', `.a { transition: opacity ${lit} var(--ease-forge); }`), lit).toEqual(['R3'])
    }
    expect(rules('a.vue', '.a { transition-duration: 200ms; }')).toEqual(['R3'])
    expect(rules('a.vue', '.a { transition-duration: var(--dur-state); }')).toEqual([])
    // an authored animation file still takes tokens for transitions
    expect(rules('components/roster/RosterMember.vue', '.a { transition: opacity 0.2s var(--ease-forge); }')).toEqual(['R3'])
  })

  it('R3 lets an animation keep a literal only in an authored file or on a spinner line', () => {
    const flash = '.a { animation: rs-flash 1.4s var(--ease-forge) 2; }'
    expect(rules('a.vue', flash)).toEqual(['R3'])
    expect(rules('components/roster/RosterMember.vue', flash)).toEqual([])
    expect(rules('a.vue', '.a { animation: spin 0.8s linear infinite; }')).toEqual([])
    expect(rules('a.vue', '.a { animation-duration: 3s; }')).toEqual(['R3'])
  })

  it('R3 lets the reduced-motion guard collapse to an instant', () => {
    expect(rules('a.vue', '.a { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }')).toEqual([])
  })

  it('R4 catches infinite loops except drift, flicker, the gate glow and spinners', () => {
    expect(rules('a.vue', '.a { animation: glow var(--dur-view) var(--ease-forge) infinite; }')).toEqual(['R4'])
    expect(rules('a.vue', '.a { animation-iteration-count: infinite; }')).toEqual(['R4'])
    // line-level: no file is exempt, so the three-iteration pulses cannot slip into an infinite loop
    expect(rules('components/deathwatch/deathwatch.css', '.a { animation-iteration-count: infinite; }')).toEqual(['R4'])
    expect(
      rules('components/deathwatch/deathwatch.css', '.a { animation: dw-pulse 1.8s ease-in-out infinite; }'),
    ).toEqual(['R4'])
    expect(
      rules('components/deathwatch/DeathwatchGate.vue', '.a { animation: dw-gate-pulse 1.6s ease-in-out infinite; }'),
    ).toEqual(['R4'])
    expect(
      rules('components/deathwatch/deathwatch.css', '.a { animation: dw-drift 40s ease-in-out infinite alternate; }'),
    ).toEqual([])
    expect(rules('components/deathwatch/deathwatch.css', '.a { animation: dw-flicker 5s ease-in-out infinite; }')).toEqual([])
    expect(rules('components/archive/ArchiveGate.vue', '.a { animation: gate-glow 1.6s ease-in-out infinite; }')).toEqual([])
    expect(rules('a.vue', '.a { animation: spin 0.8s linear infinite; }')).toEqual([])
  })

  it('R5 catches a :hover outside the real-pointer media query', () => {
    const gated = '@media (hover: hover) and (pointer: fine) {\n  .a:hover { color: red; }\n}'
    expect(rules('a.vue', gated)).toEqual([])
    expect(rules('a.vue', `${gated}\n.b:hover { color: red; }`)).toEqual(['R5'])
    expect(rules('a.vue', '.a { color: red; }\n.b:hover { color: blue; }')).toEqual(['R5'])
  })

  it('R6 catches a second @keyframes spin outside the shared stylesheet', () => {
    const own = '@keyframes spin { to { transform: rotate(360deg); } }'
    expect(rules('a.vue', own)).toEqual(['R6'])
    expect(rules('style.css', own)).toEqual([])
    expect(rules('a.vue', '@keyframes spin-slow { to { transform: rotate(360deg); } }')).toEqual([])
  })

  it('names the rule, the file and the offending line', () => {
    const source = '.a {\n  color: red;\n  transition: transform 0.15s var(--ease-forge);\n}'
    const [first] = checkFile('components/Thing.vue', source)
    expect(describeFinding('components/Thing.vue', first)).toBe(
      'R3 components/Thing.vue:3  transition: transform 0.15s var(--ease-forge);',
    )
  })

  it('walks a folder entry and never scans the canvas files', () => {
    const files = expand(['components'])
    expect(files).toContain('components/deathwatch/deathwatch.css')
    expect(files).toContain('components/AppNav.vue')
    for (const skipped of SKIPPED) expect(files).not.toContain(skipped)
  })

  it('SWEPT reaches every .vue and .css under src/, at any depth', () => {
    // A second, hand-rolled walk (one directory at a time), so narrowing SWEPT or breaking expand() shows up here.
    const walk = (dir, prefix = '') =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === 'node_modules') return []
        if (entry.isDirectory()) return walk(join(dir, entry.name), `${prefix}${entry.name}/`)
        return /\.(vue|css)$/.test(entry.name) ? [`${prefix}${entry.name}`] : []
      })
    const everything = walk(srcDir).filter((f) => !SKIPPED.includes(f)).sort()
    expect(expand(SWEPT)).toEqual(everything)
    // and the depth is real: the app shell, a deep page, and the skeleton components are all in
    for (const f of ['App.vue', 'views/deathwatch/pages/manage/checks.vue', 'components/deathwatch/skeleton/SkTable.vue']) {
      expect(everything).toContain(f)
    }
  })
})
