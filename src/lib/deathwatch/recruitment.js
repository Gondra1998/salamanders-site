// The Recruitment pages, read as the old site read them from its page texts (cfg.tx, Manage → Page Texts), each key
// falling back to the old site's text (recruitmentTexts.js).
//   ts_h  heading lines          ts_i  introduction          ts_e  closing
//   ts1…ts6  a Terms of Service section: first line its title, "## " a sub-section, any other line a clause. A
//            section keeps the number of its key, so blanking one does not renumber the rest (Section 3 refers
//            to Section 4 by number).
//   ts_tl  the TL;DR above Section 1: first line its subtitle, "## " a group, "- " a point, any other line a note
//          under the group's points
//   rq_q  the Requirements' quote
//   rq1…rq3  a requirements block: line 1 its title, line 2 its lead, "- " a requirement, "  - " a note under the
//            last one (as many as it has), any other line a note below the list
import { inline, whole } from './notables'
import { RECRUITMENT_TEXTS } from './recruitmentTexts'

const text = (v) => (typeof v === 'string' ? v : '')
// Only text replaces a default: a value of any other type (a number, null) leaves the old site's text in place.
const texts = (tx) => ({
  ...RECRUITMENT_TEXTS,
  ...Object.fromEntries(Object.entries(tx && typeof tx === 'object' ? tx : {}).filter(([, v]) => typeof v === 'string')),
})
/** Paragraphs (blank line between), each { quote, segs }: a paragraph that is one *…* from end to end is a quote. */
const paras = (t) =>
  text(t)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (whole(p, 'i') ? { quote: true, segs: inline(p.slice(1, -1)) } : { quote: false, segs: inline(p) }))
const lines = (t) => text(t).split('\n')

/** → { head: segs[], intro: paras, sections: [{ n, title, subs: [{ title, clauses: segs[] }] }], end: paras } */
export function termsOfService(tx) {
  const t = texts(tx)
  const sections = [1, 2, 3, 4, 5, 6]
    .map((i) => {
      const [title = '', ...rest] = lines(t[`ts${i}`])
      const subs = []
      for (const line of rest.map((l) => l.trim()).filter(Boolean)) {
        if (line.startsWith('##')) subs.push({ title: inline(line.replace(/^#+\s*/, '')), clauses: [] })
        else (subs.at(-1) ?? subs[subs.push({ title: [], clauses: [] }) - 1]).clauses.push(inline(line))
      }
      return { n: i, title: inline(title.trim()), subs }
    })
    .filter((s) => s.title.length || s.subs.length)
  return {
    head: lines(t.ts_h).map((l) => l.trim()).filter(Boolean).map(inline),
    intro: paras(t.ts_i),
    sections,
    end: paras(t.ts_e),
  }
}

/** → { sub: segs, groups: [{ title, items: segs[], notes: segs[] }] }; no groups when the text is blank. */
export function tldr(tx) {
  const [sub = '', ...rest] = lines(texts(tx).ts_tl)
  const groups = []
  for (const line of rest.map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('##')) groups.push({ title: inline(line.replace(/^#+\s*/, '')), items: [], notes: [] })
    else {
      const g = groups.at(-1) ?? groups[groups.push({ title: [], items: [], notes: [] }) - 1]
      if (line.startsWith('-')) g.items.push(inline(line.replace(/^-\s*/, '')))
      else g.notes.push(inline(line))
    }
  }
  return { sub: inline(sub.trim()), groups }
}

/** → { quote: segs, blocks: [{ title, lead, items: [{ segs, notes: segs[] }], notes: segs[] }] } */
export function requirements(tx) {
  const t = texts(tx)
  const blocks = [1, 2, 3]
    .map((i) => {
      const [title = '', lead = '', ...rest] = lines(t[`rq${i}`])
      const items = []
      const notes = []
      for (const line of rest.filter((l) => l.trim())) {
        if (/^\s+-/.test(line) && items.length) items.at(-1).notes.push(inline(line.replace(/^\s*-\s*/, '')))
        else if (/^-/.test(line)) items.push({ segs: inline(line.replace(/^-\s*/, '')), notes: [] })
        else notes.push(inline(line.trim()))
      }
      return { title: inline(title.trim()), lead: inline(lead.trim()), items, notes }
    })
    .filter((b) => b.title.length || b.lead.length || b.items.length || b.notes.length)
  const q = text(t.rq_q).trim()
  return { quote: inline(whole(q, 'i') ? q.slice(1, -1) : q), blocks }
}
