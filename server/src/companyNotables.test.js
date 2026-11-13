import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { notablesFrom } from './companyNotables.js'

// Invented names only: the real ones are members' and never enter the repo.
const ONE = ['Test Member One', 'A line about them.']
const TWO = ['Test Member Two', 'First line.', 'Second line.']
const NAME_ONLY = ['Test Member Three']
const company = (id, ...notables) => ({ id, title: 'Title', sections: [{ h: 'Story', p: ['Prose.'] }, ...(notables.length ? [{ h: 'Notable', notables }] : [])] })
const withNotables = (notables) => [{ id: 'first', sections: [{ h: 'Notable', notables }] }]
const fails = (doc, message) => expect(() => notablesFrom(doc)).toThrow(new Error(message))

describe('the Companies data', () => {
  it('returns [id, entries] pairs in order, for the companies that have notables', () => {
    const pairs = notablesFrom([company('alpha', ONE, TWO), company('plain'), company('beta', NAME_ONLY)])
    expect(pairs).toStrictEqual([
      ['alpha', [ONE, TWO]],
      ['beta', [NAME_ONLY]],
    ])
  })

  it('joins the notables of several sections of one company, in order', () => {
    const doc = [{ id: 'alpha', sections: [{ h: 'A', notables: [ONE] }, { h: 'B', p: ['x'] }, { h: 'C', notables: [TWO] }] }]
    expect(notablesFrom(doc)).toStrictEqual([['alpha', [ONE, TWO]]])
  })

  it('skips sections that are null or have no notables', () => {
    const doc = [{ id: 'alpha', sections: [null, { h: 'x' }, { h: 'y', notables: [ONE] }] }, { id: 'empty', sections: [] }]
    expect(notablesFrom(doc)).toStrictEqual([['alpha', [ONE]]])
  })

  it('takes an entry of just a name, and an entry of eight lines', () => {
    const eight = ['N', '2', '3', '4', '5', '6', '7', '8']
    expect(notablesFrom(withNotables([NAME_ONLY, eight]))).toStrictEqual([['first', [NAME_ONLY, eight]]])
  })

  it('takes text of exactly 4000 characters and a company of exactly 100 entries', () => {
    const long = ['N', 'x'.repeat(4000)]
    expect(notablesFrom(withNotables([long]))[0][1][0][1]).toHaveLength(4000)
    const hundred = Array.from({ length: 100 }, (_, i) => [`Test Member ${i}`])
    expect(notablesFrom(withNotables(hundred))[0][1]).toHaveLength(100)
  })

  it('takes a 64-character company id, and ids of letters, digits, _ and -', () => {
    expect(notablesFrom([company('a'.repeat(64), ONE)])[0][0]).toHaveLength(64)
    expect(notablesFrom([company('Ch_1-b', ONE)])[0][0]).toBe('Ch_1-b')
  })
})

describe('a map of company ids', () => {
  it('returns the same pairs, and an empty list is kept: it is how a company is cleared', () => {
    expect(notablesFrom({ alpha: [ONE, TWO], quiet: [], beta: [NAME_ONLY] })).toStrictEqual([
      ['alpha', [ONE, TWO]],
      ['quiet', []],
      ['beta', [NAME_ONLY]],
    ])
  })

  it('takes a document that only clears', () => {
    expect(notablesFrom({ quiet: [] })).toStrictEqual([['quiet', []]])
  })

  // Compared as pairs, not as objects: an id such as constructor is valid, and an object's own constructor key is what
  // toStrictEqual reads to compare types.
  it('hands back every company it was given, in order and with its entries, for any valid map', () => {
    const line = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== '')
    const entry = fc.array(line, { minLength: 1, maxLength: 8 })
    const id = fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/)
    const map = fc.dictionary(id, fc.array(entry, { maxLength: 5 }), { minKeys: 1, maxKeys: 6, noNullPrototype: true })
    fc.assert(
      fc.property(map, (m) => {
        expect(notablesFrom(m)).toStrictEqual(Object.entries(m))
      }),
    )
  })

  it('keeps an id like __proto__ as an ordinary key', () => {
    const pairs = notablesFrom(JSON.parse('{"__proto__": [["Test Member One"]], "constructor": [["Test Member Two"]]}'))
    expect(pairs.map(([id]) => id)).toStrictEqual(['__proto__', 'constructor'])
  })
})

describe('refuses what it cannot store, naming the place and never the text', () => {
  it('a company without a usable id', () => {
    fails([null], 'company 1: no valid id.')
    fails([5], 'company 1: no valid id.')
    fails(['text'], 'company 1: no valid id.')
    fails([{ sections: [] }], 'company 1: no valid id.')
    fails([company('ok', ONE), { id: 5, sections: [] }], 'company 2: no valid id.')
    fails([{ id: null, sections: [] }], 'company 1: no valid id.')
    fails([company('has space', ONE)], 'company 1: no valid id.')
    fails([company('', ONE)], 'company 1: no valid id.')
    fails([company('a'.repeat(65), ONE)], 'company 1: no valid id.')
    fails([company('slash/id', ONE)], 'company 1: no valid id.')
    fails({ 'has space': [ONE] }, 'company 1: no valid id.')
    fails({ ok: [ONE], '': [TWO] }, 'company 2: no valid id.')
  })

  it('a company without a sections list, rather than quietly skipping it', () => {
    fails([{ id: 'bare' }], 'company 1: no sections list.')
    fails([company('ok', ONE), { id: 'odd', sections: 'not a list' }], 'company 2: no sections list.')
    fails([{ id: 'odd', sections: null }], 'company 1: no sections list.')
  })

  it('notables that are not a list', () => {
    fails([{ id: 'first', sections: [{ notables: 'text' }] }], 'company 1: the notable members must be a list.')
    fails([{ id: 'first', sections: [{ notables: {} }] }], 'company 1: the notable members must be a list.')
    fails([{ id: 'first', sections: [{ notables: null }] }], 'company 1: the notable members must be a list.')
    fails({ alpha: 'text' }, 'company 1: the notable members must be a list.')
  })

  it('an entry that is not a name and up to seven lines', () => {
    const shape = 'company 1, entry 2: expected a name and up to 7 lines.'
    fails(withNotables([ONE, 'text']), shape)
    fails(withNotables([ONE, null]), shape)
    fails(withNotables([ONE, {}]), shape)
    fails(withNotables([ONE, []]), shape)
    fails(withNotables([ONE, ['N', '2', '3', '4', '5', '6', '7', '8', '9']]), shape)
  })

  it('a line that is not text of 1 to 4000 characters', () => {
    const line = 'company 1, entry 2: every line must be text of 1 to 4000 characters.'
    fails(withNotables([ONE, ['N', 5]]), line)
    fails(withNotables([ONE, ['N', null]]), line)
    fails(withNotables([ONE, ['N', '']]), line)
    fails(withNotables([ONE, ['N', '   ']]), line)
    fails(withNotables([ONE, ['', 'blurb']]), line)
    fails(withNotables([ONE, ['N', 'x'.repeat(4001)]]), line)
  })

  it('more than 100 entries for one company', () => {
    const many = Array.from({ length: 101 }, (_, i) => [`Test Member ${i}`])
    fails(withNotables(many), 'company 1: more than 100 notable members.')
    fails({ alpha: many }, 'company 1: more than 100 notable members.')
  })

  it('the same company twice', () => {
    fails([company('alpha', ONE), company('alpha', TWO)], 'company 2: the company id appears twice.')
  })

  it('nothing to store', () => {
    fails([], 'No notable members found to store.')
    fails([company('plain')], 'No notable members found to store.')
    fails({}, 'No notable members found to store.')
  })

  it('a document that is neither the Companies data nor an object', () => {
    const message = 'Expected the Companies data or an object of company ids.'
    fails(null, message)
    fails(undefined, message)
    fails('text', message)
    fails(5, message)
  })

  it('and none of the messages carries a name', () => {
    const SECRET = 'Test Secret Name'
    const bad = [
      [{ id: 'first', sections: [{ notables: [[SECRET, 5]] }] }],
      [{ id: 'first', sections: [{ notables: [[SECRET, 'x'.repeat(4001)]] }] }],
      [{ id: 'first', sections: [{ notables: [[SECRET, '1', '2', '3', '4', '5', '6', '7', '8']] }] }],
      [{ id: 'first', sections: [{ notables: Array.from({ length: 101 }, () => [SECRET]) }] }],
      [company('dup', [SECRET]), company('dup', [SECRET])],
    ]
    for (const doc of bad) expect(() => notablesFrom(doc)).toThrow(/^(?:(?!Test Secret Name)[\s\S])*$/)
  })
})
