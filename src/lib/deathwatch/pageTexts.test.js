import { describe, expect, it } from 'vitest'
import { ARMOUR_TEXTS, RW_TEXTS } from './armourTexts'
import { LORE_TEXTS } from './loreTexts'
import { PAGE_TEXTS, defaultText, editedTexts, pageTexts, textOf } from './pageTexts'
import { RECRUITMENT_TEXTS } from './recruitmentTexts'

describe('PAGE_TEXTS', () => {
  it('lists the texts of every page that reads them, in the order the page shows them', () => {
    expect(Object.fromEntries(Object.entries(PAGE_TEXTS).map(([p, f]) => [p, f.map(([k]) => k)]))).toEqual({
      'hallofrelics/fortress-lore': ['lo_s', 'lo_e', 'lo1', 'lo2', 'lo3', 'lo4', 'lo5', 'lo6'],
      'hallofrelics/notable-members': ['nm_i', 'nm_ck', 'nm_c', 'nm_hi', 'nm_h', 'nm_vi', 'nm_vk', 'nm_v', 'nm_e'],
      'recruitment/terms-of-service': ['ts_h', 'ts_i', 'ts_tl', 'ts1', 'ts2', 'ts3', 'ts4', 'ts5', 'ts6', 'ts_e'],
      'recruitment/requirements': ['rq_q', 'rq1', 'rq2', 'rq3'],
      'armouringhall/restricted-wargear': ['rw_h', 'rw_i', 'rw_c1', 'rw_c2', 'rw_f'],
    })
  })

  it('labels every text, and every text that has a default has the old site’s', () => {
    for (const [k, label] of Object.values(PAGE_TEXTS).flat()) {
      expect(label, k).toMatch(/\S/)
      if (k.startsWith('lo')) expect(defaultText(k), k).toBe(LORE_TEXTS[k])
      if (k.startsWith('ts') || k.startsWith('rq')) expect(defaultText(k), k).toBe(RECRUITMENT_TEXTS[k])
    }
  })
})

describe('pageTexts', () => {
  it('gives the fields of a page by its area and tab, and none for a page without texts', () => {
    expect(pageTexts('recruitment', 'requirements').map(([k]) => k)).toEqual(['rq_q', 'rq1', 'rq2', 'rq3'])
    expect(pageTexts('eventtracker', 'standings')).toEqual([])
    expect(pageTexts('constructor', '')).toEqual([])
    expect(pageTexts('hallofrelics', 'toString')).toEqual([])
  })

  it('gives an Armouring Hall uniform page the texts of the uniform it shows, Company Heraldry its own', () => {
    expect(pageTexts('armouringhall', 'specialist', 'librarium')[0][0]).toBe('ah_librarium_lead')
    expect(pageTexts('armouringhall', 'specialist', '')[0][0]).toBe('ah_reclusiarc_lead')
    expect(pageTexts('armouringhall', 'standard', 'companyheraldry')[0][0]).toBe('ah_companyheraldry_companies')
    expect(pageTexts('armouringhall', 'restricted-wargear').map(([k]) => k)[0]).toBe('rw_h')
    expect(pageTexts('armouringhall', 'constructor')).toEqual([])
  })
})

describe('defaultText', () => {
  // Members' names never ship in the code: the Notable Members have no default.
  it('is the old site’s text, or empty for a text without one', () => {
    expect(defaultText('lo_s')).toBe(LORE_TEXTS.lo_s)
    expect(defaultText('nm_c')).toBe('')
    expect(defaultText('constructor')).toBe('')
    expect(defaultText('rw_f')).toBe(RW_TEXTS.rw_f)
    expect(defaultText('ah_librarium_helm')).toBe(ARMOUR_TEXTS.ah_librarium_helm)
  })
})

describe('textOf', () => {
  it('is what the data holds, else the default; only text counts', () => {
    expect(textOf({ lo_s: 'Ours' }, 'lo_s')).toBe('Ours')
    expect(textOf({ lo_s: '' }, 'lo_s')).toBe('')
    expect(textOf({ lo_s: 3 }, 'lo_s')).toBe(LORE_TEXTS.lo_s)
    expect(textOf(undefined, 'lo_s')).toBe(LORE_TEXTS.lo_s)
    expect(textOf({}, 'nm_c')).toBe('')
  })
})

describe('editedTexts', () => {
  it('keeps every other text, stores what differs from the default, and drops what equals it', () => {
    const tx = { nm_c: 'Brother Example', lo_s: 'Old subtitle', lo1: 'Old chapter' }
    expect(editedTexts(tx, { lo_s: 'New subtitle', lo1: LORE_TEXTS.lo1, lo2: '' })).toEqual({
      nm_c: 'Brother Example',
      lo_s: 'New subtitle',
      lo2: '',
    })
    // The texts the page read are left as they were.
    expect(tx).toEqual({ nm_c: 'Brother Example', lo_s: 'Old subtitle', lo1: 'Old chapter' })
  })

  it('drops a text without a default when it is emptied', () => {
    expect(editedTexts({ nm_c: 'Brother Example' }, { nm_c: '' })).toEqual({})
  })

  it('trims the end of each line block, so a stray newline is not a change', () => {
    expect(editedTexts({}, { lo_s: `${LORE_TEXTS.lo_s}\n\n` })).toEqual({})
    expect(editedTexts({}, { nm_i: '  Kept indent\n' })).toEqual({ nm_i: '  Kept indent' })
  })

  it('starts from nothing when there are no texts yet', () => {
    expect(editedTexts(undefined, { nm_i: 'Hello' })).toEqual({ nm_i: 'Hello' })
    expect(editedTexts(null, {})).toEqual({})
  })
})

describe('the keys before Armouring Hall 2.0, in the editor', () => {
  const OLD = { ah_companyheraldry_companies1: 'First.', ah_companyheraldry_companies2: 'Second.', ah_watchspecialist_helm: 'Old helm.' }

  it('opens a field on what the page shows: the old text while the new key is not stored', () => {
    expect(textOf(OLD, 'ah_companyheraldry_companies')).toBe('First.\nSecond.')
    expect(textOf(OLD, 'ah_watchtechmarine_helm')).toBe('Old helm.')
    expect(textOf({ ...OLD, ah_watchtechmarine_helm: 'Mine.' }, 'ah_watchtechmarine_helm')).toBe('Mine.')
    expect(textOf({}, 'ah_watchtechmarine_helm')).toBe(defaultText('ah_watchtechmarine_helm'))
  })

  it('drops the Battle Companies’ old keys on a save, so a restored default stays the default', () => {
    const saved = editedTexts(OLD, { ah_companyheraldry_companies: defaultText('ah_companyheraldry_companies') })
    expect(saved).toEqual({ ah_watchspecialist_helm: 'Old helm.' })
    expect(textOf(saved, 'ah_companyheraldry_companies')).toBe(defaultText('ah_companyheraldry_companies'))
    expect(editedTexts(OLD, { ah_companyheraldry_companies: 'New.' })).toEqual({ ah_companyheraldry_companies: 'New.', ah_watchspecialist_helm: 'Old helm.' })
  })

  it('keeps the old Watch Specialist key on a save of one specialist, for the other three', () => {
    const saved = editedTexts(OLD, { ah_watchapothecary_helm: 'Mine.' })
    expect(saved.ah_watchspecialist_helm).toBe('Old helm.')
    expect(textOf(saved, 'ah_watchlibrarian_helm')).toBe('Old helm.')
  })
})
