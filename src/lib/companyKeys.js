/**
 * How the roster's branch keys ("company-3", "forge") line up with the Companies
 * page's article ids ("third", "armoury"), plus the two ids the page adds itself
 * (High Command and Muster) and the mapping for old /roster links. Pure: the
 * mapping is read from companies.json, whose entries each carry a `branch`.
 * Maps, not objects, so a key like "constructor" can never match anything.
 */
import companies from '../data/companies.json'

export const HIGH_COMMAND_ID = 'high-command'
export const MUSTER_ID = 'muster'

/** High Command as the page's search and chip entry; it has no story, so no sections. */
export const HIGH_COMMAND_ENTRY = {
  id: HIGH_COMMAND_ID,
  sigil: 'HC',
  title: 'High Command',
  subtitle: '',
  keywords: 'high command lord of drakes chapter master pyre guard lord chaplain leadership',
}

/** The Muster (Unassigned and Servitors, for Legion members) as a chip; it has no story either. */
export const MUSTER_ENTRY = { id: MUSTER_ID, sigil: '?', title: 'Muster', subtitle: '', keywords: '' }

const articleByBranch = new Map([...companies.map((c) => [c.branch, c.id]), [HIGH_COMMAND_ID, HIGH_COMMAND_ID], ['unassigned', MUSTER_ID]])
const branchByArticle = new Map([...companies.map((c) => [c.id, c.branch]), [HIGH_COMMAND_ID, HIGH_COMMAND_ID], [MUSTER_ID, 'unassigned']])

/** The article id for a roster branch key, or null. */
export const articleIdOfBranch = (branchKey) => articleByBranch.get(branchKey) ?? null

/** The roster branch key for an article id, or null. */
export const branchKeyOfArticle = (articleId) => branchByArticle.get(articleId) ?? null

/**
 * The id a URL fragment names (`#third` → "third"), or null. The sign-in callback also uses the fragment
 * (`#access_token=…`), so anything with `=` is not ours, and neither is an empty fragment or a bad escape.
 * Whether the id names anything on the page is the caller's check.
 */
export function fragmentId(hash) {
  const raw = String(hash ?? '').slice(1)
  if (!raw || raw.includes('=')) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/** A vue-router redirect for /roster: to /companies, keeping the query, with an old #branch-key hash mapped to its article id (or dropped). */
export function legacyRosterTarget(to) {
  const article = articleIdOfBranch(fragmentId(to.hash))
  return { path: '/companies', hash: article ? `#${article}` : '', query: to.query }
}
