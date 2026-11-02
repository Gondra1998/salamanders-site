import { describe, it, expect } from 'vitest'
import { requirements, termsOfService, tldr } from './recruitment'
import { RECRUITMENT_TEXTS } from './recruitmentTexts'
import { resolveArea } from './areas'

const plain = (segs) => segs.map((s) => s.t).join('')

describe('RECRUITMENT_TEXTS', () => {
  it('holds every Recruitment text the old site had, as text', () => {
    expect(Object.keys(RECRUITMENT_TEXTS)).toEqual(['ts_h', 'ts_i', 'ts1', 'ts2', 'ts3', 'ts4', 'ts5', 'ts6', 'ts_tl', 'ts_e', 'rq_q', 'rq1', 'rq2', 'rq3'])
    for (const [k, v] of Object.entries(RECRUITMENT_TEXTS)) expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true)
  })

  // Links go to the community's Discord only (the area is gated), always wrapped as a hyperlink, never bare.
  it("links only to the community's Discord or to a page of the area, always as hyperlinks", () => {
    const all = Object.values(RECRUITMENT_TEXTS).join('\n')
    const links = [...all.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
    const pages = links.filter((url) => url.startsWith('/'))
    expect(links.length).toBeGreaterThan(pages.length)
    for (const url of links.filter((u) => !pages.includes(u))) expect(url).toMatch(/^https:\/\/discord\.com\/channels\/\d+\/\d+(\/\d+)?$/)
    expect(all.match(/https?:/g)).toHaveLength(links.length - pages.length)
    // A page link is its page's own address, so following it never makes the guard rewrite (and replace) history.
    expect(pages).toEqual(['/deathwatch/recruitment/requirements', '/deathwatch/armouringhall/standard/watchbrother'])
    for (const url of pages) {
      const [, , area, tab, sub] = url.split('/')
      expect(resolveArea({ area, tab, sub }).canonical, url).toBe(url)
    }
  })
})

describe('termsOfService', () => {
  it('reads the six sections, each with its sub-sections and clauses', () => {
    const tos = termsOfService()
    expect(tos.sections).toHaveLength(6)
    expect(tos.sections.map((s) => plain(s.title))).toEqual([
      'Deathwatch Service',
      'Eligibility & Applications',
      'Tour Expectations',
      'Failure Progression',
      'Heraldry & Recognition',
      'Standards of Service',
    ])
    expect(tos.sections[0].subs.map((s) => plain(s.title))).toEqual(['Tour of Duty', 'Operational Authority'])
    expect(tos.sections.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(tos.sections[0].subs[0].clauses[0][0]).toEqual({ k: 'b', t: 'Service Duration:' })
    expect(tos.sections.every((s) => s.subs.length && s.subs.every((sub) => sub.clauses.length))).toBe(true)
    expect(tos.head.map(plain)).toEqual(['Official Deathwatch Terms of Service', 'Issued by the XVIIIth Legiones Astartes — The Salamanders'])
    // Discord-only markup (custom emoji, role mentions, subtext and quote marks) is not in the texts.
    expect(Object.values(RECRUITMENT_TEXTS).join('\n')).not.toMatch(/<[@:a]|^-#|^> |__/m)
  })

  it('takes what the data holds over the default, and starts an untitled sub-section for clauses before any', () => {
    const tos = termsOfService({ ts1: 'Only\nfirst clause\n## Sub\nsecond', ts_i: '*A quote.*\n\nPlain **words**.', ts_e: '' })
    expect(plain(tos.sections[0].title)).toBe('Only')
    expect(tos.sections[0].subs.map((s) => [plain(s.title), s.clauses.map(plain)])).toEqual([
      ['', ['first clause']],
      ['Sub', ['second']],
    ])
    expect(tos.intro).toEqual([
      { quote: true, segs: [{ k: '', t: 'A quote.' }] },
      { quote: false, segs: [{ k: '', t: 'Plain ' }, { k: 'b', t: 'words' }, { k: '', t: '.' }] },
    ])
    expect(tos.end).toEqual([])
  })

  it('drops a section the data blanks, and keeps the default for a value that is not text', () => {
    expect(termsOfService({ ts6: '' }).sections).toHaveLength(5)
    const odd = termsOfService({ ts1: 42, ts_h: null })
    expect(odd.head).toEqual(termsOfService().head)
    expect(odd.sections[0]).toEqual(termsOfService().sections[0])
    expect(termsOfService('nonsense').sections).toHaveLength(6)
  })

  it('keeps a section with clauses but no title', () => {
    const s = termsOfService({ ts1: '\nfirst clause' }).sections[0]
    expect([s.n, s.title, s.subs[0].clauses.length]).toEqual([1, [], 1])
  })

  // Section 3 refers to "Section 4": blanking an earlier section must not renumber the rest.
  it('numbers each section by its key, so blanking one leaves the others their numbers', () => {
    const tos = termsOfService({ ts2: '' })
    expect(tos.sections.map((s) => s.n)).toEqual([1, 3, 4, 5, 6])
    expect(plain(tos.sections.find((s) => s.n === 4).title)).toBe('Failure Progression')
  })

  it('reads a sub-section title with its marks, and two marks on one line as two', () => {
    const tos = termsOfService({ ts1: 'T\n## **Bold** title\nclause', ts_i: '*a* and *b*' })
    expect(tos.sections[0].subs[0].title).toEqual([{ k: 'b', t: 'Bold' }, { k: '', t: ' title' }])
    expect(tos.intro).toEqual([{ quote: false, segs: [{ k: 'i', t: 'a' }, { k: '', t: ' and ' }, { k: 'i', t: 'b' }] }])
  })
})

describe('requirements', () => {
  it("reads the old site's three blocks: title, lead, requirements with their notes, and notes below", () => {
    const rq = requirements()
    expect(rq.blocks.map((b) => plain(b.title))).toEqual(['Rank Requirements', 'Accolade Requirements', 'Skill & Conduct Requirements'])
    const rank = rq.blocks[0]
    expect(plain(rank.items[0].segs)).toBe('Command: Sergeant or higher.')
    expect(rank.items[0].segs[0]).toEqual({ k: 'b', t: 'Command:' })
    expect(rank.notes.length).toBeGreaterThan(0)
    expect(plain(rq.quote)).not.toMatch(/^\*|\*$/)
  })

  it('puts every indented line under the requirement above it, a second one too', () => {
    const b = requirements({ rq1: 'T\nLead\n- one\n  - under one\n  - and again\n- two\nbelow' }).blocks[0]
    expect(b.items.map((i) => [plain(i.segs), i.notes.map(plain)])).toEqual([
      ['one', ['under one', 'and again']],
      ['two', []],
    ])
    expect(b.notes.map(plain)).toEqual(['below'])
    expect(requirements({ rq2: '' }).blocks).toHaveLength(2)
    // A block with no title still shows its requirements; a value that is not text keeps the default.
    const untitled = requirements({ rq1: '\n\n- one' }).blocks[0]
    expect([untitled.title, untitled.items.map((i) => plain(i.segs))]).toEqual([[], ['one']])
    expect(requirements({ rq1: 7 }).blocks[0]).toEqual(requirements().blocks[0])
  })
})

describe('the Requirements quote', () => {
  it('drops the marks of a quote that is one *…*, and keeps two marks on one line as two', () => {
    expect(requirements({ rq_q: '*All of it.*' }).quote).toEqual([{ k: '', t: 'All of it.' }])
    expect(requirements({ rq_q: '*a* and *b*' }).quote).toEqual([{ k: 'i', t: 'a' }, { k: '', t: ' and ' }, { k: 'i', t: 'b' }])
  })
})

describe('tldr', () => {
  it('reads the default: a subtitle, then three groups of points, the last with its closing notes', () => {
    const t = tldr()
    expect(plain(t.sub)).toBe('A brief summary of the rules governing service within Watch Fortress Ebonhold.')
    expect(t.groups.map((g) => [plain(g.title), g.items.length, g.notes.length])).toEqual([
      ['Essential Information', 6, 0],
      ['Failure Progression', 4, 0],
      ['Service & Rewards', 3, 2],
    ])
    expect(plain(t.groups[0].items[0])).toMatch(/^Tour Duration: /)
  })

  it('takes what the data holds; a point before any group opens one without a title; blank lines are skipped', () => {
    const t = tldr({ ts_tl: 'Sub\n\n- one\nnote\n##   Two\n  - two' })
    expect(plain(t.sub)).toBe('Sub')
    expect(t.groups.map((g) => [plain(g.title), g.items.map(plain), g.notes.map(plain)])).toEqual([
      ['', ['one'], ['note']],
      ['Two', ['two'], []],
    ])
  })

  it('has no groups when the text is blank', () => {
    expect(tldr({ ts_tl: '' })).toEqual({ sub: [], groups: [] })
  })
})
