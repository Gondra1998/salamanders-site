/**
 * The owner's erase command, for a "please forget me" request: one item, or everything one member posted, leaves
 * the server for good. Each goes as a member's own takedown does (galleryStore.js eraseItem): its row and trail are
 * deleted and its file key noted. The file leaves R2 here at once when R2 lets it; if not, the note stands and the
 * backup run that follows (server/backup/salamanders-r2-backup --erase-...) takes it out of R2 and the backup.
 */
import { isItemId } from './galleryValidate.js'

const DISCORD_ID = /^\d{17,20}$/
const USAGE = 'usage: --item <id> or --member <discord id>, one of them, once'

/** → { item } or { member } from the command line. An Error naming the usage for anything else. */
export function eraseTarget(argv) {
  const [flag, value, ...rest] = argv
  if (rest.length === 0 && flag === '--item' && isItemId(value)) return { item: value }
  if (rest.length === 0 && flag === '--member' && DISCORD_ID.test(value)) return { member: value }
  throw new Error(USAGE)
}

/** → { items, files, leftForTonight }: how many items were erased, how many had a file, how many R2 refused now. */
export async function eraseFor({ store, r2, item, member }) {
  const ids = item !== undefined ? [item] : await store.itemIdsBy(member)
  const out = { items: 0, files: 0, leftForTonight: 0 }
  for (const id of ids) {
    const result = await store.eraseItem(id)
    if (result === 'missing') continue
    out.items++
    if (result.key === null) continue
    out.files++
    try {
      await r2.remove(result.key)
    } catch {
      out.leftForTonight++
    }
  }
  return out
}
