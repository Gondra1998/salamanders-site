// The page texts the Watch Commander can edit from the page itself ("Edit page", as on the old site): which texts each
// page reads (cfg.tx), with the old site's labels, and how an edit becomes the stored document. A text equal to its
// default is not stored, so a later change to the default reaches it; an empty text is stored, and hides that part.
import { UNIFORMS, uniformFor } from './armour'
import { ARMOUR_TEXTS, RW_TEXTS, armourFields, legacyText, replacedKeys } from './armourTexts'
import { LORE_TEXTS } from './loreTexts'
import { RECRUITMENT_TEXTS } from './recruitmentTexts'

const CHAPTER = '(first line = title · a whole line in **…** is a proclamation · a whole line in *…* is spoken)'
const SECTION = '(first line = title · “## ” starts a sub-section · every other line is one clause, numbered automatically)'
const BLOCK = '(line 1 = title · line 2 = lead · “- ” = requirement · “  - ” = note under it · other lines = note below the list)'

/** Each page's texts as [key, label], by "<area>/<tab>". */
export const PAGE_TEXTS = {
  'hallofrelics/fortress-lore': [
    ['lo_s', 'Subtitle'],
    ['lo_e', 'Epigraph'],
    ...['I', 'II', 'III', 'IV', 'V', 'VI'].map((n, i) => [`lo${i + 1}`, `Chapter ${n} ${CHAPTER}`]),
  ],
  'hallofrelics/notable-members': [
    ['nm_i', 'Introduction'],
    ['nm_ck', 'Watch Commander: line above the name'],
    ['nm_c', 'Watch Commander (first line = name · blank line = new paragraph)'],
    ['nm_hi', 'Chronicles of Command: introduction'],
    ['nm_h', 'Chronicles of Command (“## ” = group heading · one “- ” line per commander · ||text|| = hidden until opened)'],
    ['nm_vi', 'Honored Veterans: introduction'],
    ['nm_vk', 'Honored Veterans: badge on every card (empty = “Honored Veteran”)'],
    ['nm_v', 'Honored Veterans (one block per veteran, separated by a blank line · first line = Name — Epithet · add [sealed] at the end of the first line to seal the card)'],
    ['nm_e', 'Closing (a paragraph in **…** is a battle cry, the last one is the largest)'],
  ],
  'recruitment/terms-of-service': [
    ['ts_h', 'Header (one point per line)'],
    ['ts_i', 'Introduction (a paragraph in *…* is shown as a quote)'],
    ['ts_tl', 'TL;DR above Section 1 (first line = subtitle · `## ` starts a group · `- ` a point · any other line a note under the points · empty hides the button)'],
    ...[1, 2, 3, 4, 5, 6].map((n) => [`ts${n}`, `Section ${n} ${SECTION}`]),
    ['ts_e', 'Closing (a paragraph in *…* is shown as a quote)'],
  ],
  'recruitment/requirements': [
    ['rq_q', 'Epigraph'],
    ...[1, 2, 3].map((n) => [`rq${n}`, `Block ${n} ${BLOCK}`]),
  ],
  'armouringhall/restricted-wargear': [
    ['rw_h', 'Header (title · subtitle · heading, one per line)'],
    ['rw_i', 'Introduction'],
    ['rw_c1', 'Card 1 (set · piece · unlock · proof, one per line)'],
    ['rw_c2', 'Card 2 (set · piece · unlock · proof, one per line)'],
    ['rw_f', 'Footnote'],
  ],
}

const DEFAULTS = { ...LORE_TEXTS, ...RECRUITMENT_TEXTS, ...ARMOUR_TEXTS, ...RW_TEXTS }

/**
 * The texts of one page as [key, label], or none. An Armouring Hall uniform page has the texts of the uniform it
 * shows (`sub`, as resolveArea gives it).
 */
export function pageTexts(area, tab, sub) {
  if (area === 'armouringhall' && Object.hasOwn(UNIFORMS, tab)) return armourFields(uniformFor(tab, sub))
  return Object.hasOwn(PAGE_TEXTS, `${area}/${tab}`) ? PAGE_TEXTS[`${area}/${tab}`] : []
}

/** The old site's text for a key, or '' (the Notable Members have none: members' names never ship in the code). */
export const defaultText = (k) => (Object.hasOwn(DEFAULTS, k) ? DEFAULTS[k] : '')

/** What a page shows for a key: the stored text, else an older page's (armourTexts.legacyText), else the default. */
export const textOf = (tx, k) =>
  (tx && Object.hasOwn(tx, k) && typeof tx[k] === 'string' ? tx[k] : undefined) ?? legacyText(tx, k) ?? defaultText(k)

/**
 * The stored texts after an edit: every other text kept, each edited one stored unless it equals its default, and the
 * old keys only it replaced dropped (armourTexts.replacedKeys), so its default, restored, stays the default.
 */
export function editedTexts(tx, values) {
  const out = { ...tx }
  for (const [k, v] of Object.entries(values)) {
    const t = v.trimEnd()
    for (const old of replacedKeys(k)) delete out[old]
    if (t === defaultText(k)) delete out[k]
    else out[k] = t
  }
  return out
}
