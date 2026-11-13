import { describe, it, expect } from 'vitest'
import { AREAS } from './areas'
import { pageLoader } from './pages'
// The rebuilt views pull in the auth store, and with it the Legion Archive's modules. Load them here rather than
// inside a test, where the lazy views would first import them: the mutation gate would then count the archive's
// module-level code as covered by that test, and no longer as static.
import './useTracker'

// Every view is one file under src/views/deathwatch/pages/<area>/<tab>.vue, so a later port (or the Watch
// Commander's pull request) can replace one view without touching anything shared. This finds them.
const files = Object.keys(import.meta.glob('../../views/deathwatch/pages/*/*.vue')).map((k) =>
  k.replace('../../views/deathwatch/pages/', '').replace(/\.vue$/, ''),
)
const listed = Object.entries(AREAS).flatMap(([area, { tabs }]) => tabs.map((t) => `${area}/${t.slug}`))

describe('pageLoader', () => {
  it('has exactly one view file for every tab of every area, and none for anything else', () => {
    expect(files.sort()).toEqual([...listed].sort())
    expect(listed).toHaveLength(26)
  })

  it('gives a lazy loader for each of them', () => {
    for (const key of listed) {
      const [area, tab] = key.split('/')
      expect(typeof pageLoader(area, tab), key).toBe('function')
    }
  })

  it('loads every view, and each is a component', async () => {
    for (const key of listed) {
      const [area, tab] = key.split('/')
      const mod = await pageLoader(area, tab)()
      expect(mod.default, key).toBeTruthy()
    }
  })

  it('gives null for an unknown area or tab, or a tab under the wrong area', () => {
    expect(pageLoader('eventtracker', 'nope')).toBeNull()
    expect(pageLoader('nope', 'standings')).toBeNull()
    expect(pageLoader('administratum', 'standings')).toBeNull()
    expect(pageLoader('', '')).toBeNull()
  })

  it('gives null for hostile input, never a prototype value or a file outside the pages', () => {
    for (const [area, tab] of [
      ['__proto__', 'standings'],
      ['eventtracker', '__proto__'],
      ['constructor', 'constructor'],
      ['eventtracker', '../../x'],
      ['..', 'x'],
      ['eventtracker/standings', ''],
      ['eventtracker', 'standings.vue'],
      [['eventtracker'], 'standings'],
      ['eventtracker', ['standings']],
      [1, 2],
      [undefined, undefined],
      [null, null],
    ]) {
      expect(pageLoader(area, tab), JSON.stringify([area, tab])).toBeNull()
    }
  })
})
