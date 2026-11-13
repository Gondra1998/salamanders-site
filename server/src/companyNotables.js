/**
 * The Companies page's Notable Server Members: real members' names and short write-ups. They live in the database
 * only (company_notables), never in the repo or the client bundle, and GET /company-notables sends them to signed-in
 * guild members alone (companyNotablesHandler.js).
 *
 * notablesFrom(doc) reads them out of what the operator hands the seed script and returns [companyId, entries]
 * pairs, an entry being [name, ...blurb lines]. Two shapes are accepted:
 *   - a plain object of companyId → entries. An empty list means the company has none: the seed takes it out.
 *   - the Companies data as it was before the entries left the repo: an array of companies, each with
 *     sections[].notables. A company with none is skipped. The `notables: true` marker that file holds now is refused.
 * Anything else throws a plain Error. Its message names a position (company 3, entry 2), never the text, because
 * the text is a member's name and the message ends up in a terminal and its scrollback.
 */
const COMPANY_ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_ENTRIES = 100
const MAX_LINES = 8 // a name and up to seven lines
const MAX_TEXT = 4000

const validId = (id) => typeof id === 'string' && COMPANY_ID.test(id)

function entriesOf(list, where) {
  if (!Array.isArray(list)) throw new Error(`${where}: the notable members must be a list.`)
  return list.map((entry, i) => {
    const at = `${where}, entry ${i + 1}`
    if (!Array.isArray(entry) || entry.length < 1 || entry.length > MAX_LINES) {
      throw new Error(`${at}: expected a name and up to ${MAX_LINES - 1} lines.`)
    }
    for (const line of entry) {
      if (typeof line !== 'string' || line.trim() === '' || line.length > MAX_TEXT) {
        throw new Error(`${at}: every line must be text of 1 to ${MAX_TEXT} characters.`)
      }
    }
    return entry
  })
}

function collect(pairs, id, entries, where) {
  if (entries.length > MAX_ENTRIES) throw new Error(`${where}: more than ${MAX_ENTRIES} notable members.`)
  if (pairs.some(([seen]) => seen === id)) throw new Error(`${where}: the company id appears twice.`)
  pairs.push([id, entries])
}

function fromCompanies(list) {
  const pairs = []
  list.forEach((company, i) => {
    const where = `company ${i + 1}`
    if (!validId(company?.id)) throw new Error(`${where}: no valid id.`)
    if (!Array.isArray(company.sections)) throw new Error(`${where}: no sections list.`)
    const entries = company.sections.flatMap((s) => (s && s.notables !== undefined ? entriesOf(s.notables, where) : []))
    if (entries.length > 0) collect(pairs, company.id, entries, where)
  })
  return pairs
}

function fromMap(map) {
  if (map === null || typeof map !== 'object') throw new Error('Expected the Companies data or an object of company ids.')
  const pairs = []
  Object.entries(map).forEach(([id, list], i) => {
    const where = `company ${i + 1}`
    if (!validId(id)) throw new Error(`${where}: no valid id.`)
    collect(pairs, id, entriesOf(list, where), where)
  })
  return pairs
}

export function notablesFrom(doc) {
  const pairs = Array.isArray(doc) ? fromCompanies(doc) : fromMap(doc)
  if (pairs.length === 0) throw new Error('No notable members found to store.')
  return pairs
}
