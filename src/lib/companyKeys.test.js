import { describe, it, expect } from 'vitest'
import companies from '../data/companies.json'
import fixture from '../data/roster.fixture.json'
import {
  HIGH_COMMAND_ENTRY,
  HIGH_COMMAND_ID,
  MUSTER_ENTRY,
  MUSTER_ID,
  articleIdOfBranch,
  branchKeyOfArticle,
  fragmentId,
  legacyRosterTarget,
} from './companyKeys'

describe('companies.json branch keys', () => {
  it('gives every entry its own branch key', () => {
    const keys = companies.map((c) => c.branch)
    expect(keys.every((k) => typeof k === 'string' && k)).toBe(true)
    expect(new Set(keys).size).toBe(companies.length)
  })

  it('has an entry for every branch the roster knows', () => {
    const entries = new Set(companies.map((c) => c.branch))
    for (const b of fixture.roster.branches) expect(entries.has(b.key), b.key).toBe(true)
    expect(companies).toHaveLength(fixture.roster.branches.length)
  })

  it('puts the Venerable Dreadnoughts directly after the 7th Company', () => {
    const ids = companies.map((c) => c.id)
    expect(ids[ids.indexOf('seventh') + 1]).toBe('dreadnoughts')
    const d = companies.find((c) => c.id === 'dreadnoughts')
    expect(d).toMatchObject({ sigil: 'VD', branch: 'venerable-dreadnoughts', title: 'The Venerable Dreadnoughts' })
  })

  // What the page needs from an entry's story, not how long it is: the article renders each section's
  // heading and paragraphs, so a story with none, or with a blank one, would render an empty block.
  it('gives every company a story the page can render', () => {
    for (const c of companies) {
      expect(c.sections.length, c.id).toBeGreaterThan(0)
      for (const s of c.sections) {
        expect(typeof s.h === 'string' && s.h.trim() !== '', `${c.id}: a section heading`).toBe(true)
        const text = [...(s.p ?? []), ...(s.list ?? [])]
        // a section of `notables: true` is where the cards go: the server sends them, they are not in the data
        expect(text.length + (s.notables === true ? 1 : 0), `${c.id}: ${s.h} has content`).toBeGreaterThan(0)
        expect(text.every((t) => typeof t === 'string' && t.trim() !== ''), `${c.id}: ${s.h} has a blank line`).toBe(true)
      }
    }
  })
})

describe('articleIdOfBranch and branchKeyOfArticle', () => {
  it.each([
    ['company-1', 'first'],
    ['company-3', 'third'],
    ['company-7', 'seventh'],
    ['venerable-dreadnoughts', 'dreadnoughts'],
    ['forge', 'armoury'],
    ['librarius', 'librarius'],
    ['apothecarion', 'apothecarion'],
    ['reclusiam', 'reclusiam'],
    ['high-command', 'high-command'],
    ['unassigned', 'muster'],
  ])('maps branch %s to article %s and back', (branch, article) => {
    expect(articleIdOfBranch(branch)).toBe(article)
    expect(branchKeyOfArticle(article)).toBe(branch)
  })

  it('maps nothing for an unknown key, including object prototype names', () => {
    for (const key of ['nope', '', 'constructor', '__proto__', 'toString']) {
      expect(articleIdOfBranch(key), key).toBeNull()
      expect(branchKeyOfArticle(key), key).toBeNull()
    }
  })

  it('exposes the two page-level ids and the High Command search entry', () => {
    expect(HIGH_COMMAND_ID).toBe('high-command')
    expect(MUSTER_ID).toBe('muster')
    expect(HIGH_COMMAND_ENTRY).toMatchObject({ id: 'high-command', sigil: 'HC', title: 'High Command' })
    expect(HIGH_COMMAND_ENTRY.keywords).toContain('chapter master')
    expect(MUSTER_ENTRY).toMatchObject({ id: 'muster', title: 'Muster' })
  })
})

describe('fragmentId', () => {
  it.each([
    ['#third', 'third'],
    ['#company-3', 'company-3'],
    ['#company%2D3', 'company-3'], // encoded
    ['#high-command', 'high-command'],
  ])('reads %s as %j', (hash, id) => {
    expect(fragmentId(hash)).toBe(id)
  })

  it.each([['#access_token=abc&expires_in=3600'], ['#a=b'], ['#'], [''], ['#%E0%A4%A'], [null], [undefined]])(
    'takes %j as no id, without throwing (the sign-in callback, nothing, a bad escape)',
    (hash) => {
      expect(fragmentId(hash)).toBeNull()
    },
  )
})

describe('legacyRosterTarget', () => {
  const go = (hash, query = {}) => legacyRosterTarget({ hash, query })

  it.each([
    ['#company-3', '#third'],
    ['#forge', '#armoury'],
    ['#venerable-dreadnoughts', '#dreadnoughts'],
    ['#unassigned', '#muster'],
    ['#high-command', '#high-command'],
  ])('sends /roster%s to /companies%s', (hash, mapped) => {
    expect(go(hash)).toEqual({ path: '/companies', hash: mapped, query: {} })
  })

  it.each([[''], ['#'], ['#nope'], ['#access_token=abc&expires_in=3600'], ['#%E0%A4%A']])('drops the hash %j', (hash) => {
    expect(go(hash).hash).toBe('')
    expect(go(hash).path).toBe('/companies')
  })

  it('keeps the query', () => {
    expect(go('', { scene: 'denied' }).query).toEqual({ scene: 'denied' })
  })

  it('reads an encoded key', () => {
    expect(go('#company%2D3').hash).toBe('#third')
  })

  it('takes a route with no hash at all', () => {
    expect(go(undefined)).toEqual({ path: '/companies', hash: '', query: {} })
  })
})
