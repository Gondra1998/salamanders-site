/**
 * Postgres side of the Reliquarium (members-only art and clips galleries): the only module that talks to
 * the gallery tables, which are in schema.sql. Nothing here deletes a row. Every status change commits
 * together with its gallery_events row, so the trail cannot miss a change.
 *
 * Every caller value goes in as a $n parameter. The only text built into a statement is a fixed
 * fragment or a gallery_sync column name taken from SYNC_COLUMNS.
 */
import { createInTx } from './inTx.js'
import { PAGE_SIZE } from './galleryValidate.js'

/** Who the audit trail names for what the clips-channel poll does by itself (no Discord call needed). */
export const POLL_ACTOR = Object.freeze({ id: 'clips-poll', username: 'Clips channel poll' })

const EVENTS_PAGE = 100
// A member can take down their own piece until a moderator has hidden it or it is already removed.
const OWNER_REMOVABLE = ['pending', 'approved', 'rejected']
// setSync accepts exactly these keys; they are the only column names that ever reach its statement.
const SYNC_COLUMNS = ['last_message_id', 'last_run_at', 'last_ok_at', 'last_error']
const LIVE_CLIPS = "where kind = 'clip' and source = 'discord' and status = 'approved'"

/**
 * A guard for the values a statement's match depends on: a null or empty one would fall out of a predicate
 * (an owner check) or out of a unique index (a null column never conflicts), so refuse before any query.
 */
function needId(value, what) {
  if (typeof value !== 'string' || value === '') throw new TypeError(`${what} must be a non-empty string`)
}

/** The first `size` rows, and where the next page starts when `rows` held one more than that. */
function paged(rows, size) {
  if (rows.length <= size) return { rows, next: null }
  const page = rows.slice(0, size)
  return { rows: page, next: String(page[size - 1].id) }
}

export function createGalleryStore(pool) {
  const inTx = createInTx(pool)

  const event = (q, itemId, action, actor, note) =>
    q.query('insert into gallery_events (item_id, action, actor_discord_id, actor_username, note) values ($1,$2,$3,$4,$5)', [
      itemId,
      action,
      actor.id,
      actor.username,
      note ?? '',
    ])

  /**
   * Move an item from one of the `from` statuses to `to`, with its event. With `owner`, only that author's item
   * moves. With `review` (the default) the reviewer columns record `actor` and `note`; an owner's own removal is
   * not a review, so it passes `review: false` and leaves them alone (the event names who did it).
   * → { item }, 'conflict' (the item is there, in a status that cannot make this move) or 'missing'
   * (no item with this id, or, with `owner`, none of theirs: the caller does not learn which).
   */
  const move = (id, { from, to, action, actor, note }, { owner = null, review = true } = {}) =>
    inTx(async (q) => {
      const params = [id, from, to]
      let set = 'status = $3'
      if (review) {
        params.push(actor.id, actor.username, note ?? null)
        set += ', reviewed_by = $4, reviewed_by_username = $5, review_note = $6'
      }
      let byOwner = ''
      if (owner) {
        params.push(owner)
        byOwner = ` and author_discord_id = $${params.length}`
      }
      const { rows } = await q.query(
        `update gallery_items
            set ${set}, updated_at = now()
          where id = $1 and status = any($2::text[])${byOwner}
          returning *`,
        params,
      )
      if (!rows.length) {
        const seen = owner
          ? await q.query('select 1 from gallery_items where id = $1 and author_discord_id = $2', [id, owner])
          : await q.query('select 1 from gallery_items where id = $1', [id])
        return seen.rows.length ? 'conflict' : 'missing'
      }
      await event(q, rows[0].id, action, actor, note)
      return { item: rows[0] }
    })

  return {
    /**
     * A clip the poll found, stored approved. `row` is a parsed Candidate plus r2Key, contentType and bytes
     * (all null for an embed). → { id }, or 'exists' when the message and attachment are already held.
     * A TypeError, before any query, unless both Discord ids are non-empty strings: a null attachment id
     * would slip past the unique index and a re-poll would store the clip again.
     */
    insertDiscordItem: async (row, actor) => {
      needId(row.messageId, 'messageId')
      needId(row.attachmentId, 'attachmentId')
      return inTx(async (q) => {
        const { rows } = await q.query(
          `insert into gallery_items
             (kind, source, status, discord_message_id, discord_attachment_id, author_discord_id, author_username,
              title, note, media, r2_key, embed_url, content_type, bytes, posted_at)
           values ('clip', 'discord', 'approved', $1, $2, $3, $4, $5, '', $6, $7, $8, $9, $10, $11)
           on conflict (discord_message_id, discord_attachment_id) where discord_message_id is not null do nothing
           returning id`,
          [
            row.messageId,
            row.attachmentId,
            row.authorId,
            row.authorUsername,
            row.title,
            row.media,
            row.r2Key ?? null,
            row.embedUrl ?? null,
            row.contentType ?? null,
            row.bytes ?? null,
            row.postedAt,
          ],
        )
        if (!rows.length) return 'exists'
        const id = String(rows[0].id)
        await event(q, id, 'stored', actor, '')
        return { id }
      })
    },

    /**
     * Whether the poll already holds this message's attachment, asked before it downloads one, so a batch
     * repeated after a crash copies nothing twice. Uses the partial unique index on the two Discord ids.
     * The same TypeError as insertDiscordItem, before any query, for an id that is not a non-empty string.
     */
    async hasDiscordItem(messageId, attachmentId) {
      needId(messageId, 'messageId')
      needId(attachmentId, 'attachmentId')
      const { rows } = await pool.query(
        'select 1 from gallery_items where discord_message_id = $1 and discord_attachment_id = $2 limit 1',
        [messageId, attachmentId],
      )
      return rows.length > 0
    },

    /**
     * A member's upload, pending review. The key names the new id, so the row goes in with an empty key and
     * is updated once the id is known. → { id, r2Key }.
     */
    insertArt: ({ title, note, ext, contentType, bytes }, user) =>
      inTx(async (q) => {
        const { rows } = await q.query(
          `insert into gallery_items
             (kind, source, media, status, r2_key, posted_at, author_discord_id, author_username, title, note, content_type, bytes)
           values ('art', 'site', 'image', 'pending', '', now(), $1, $2, $3, $4, $5, $6)
           returning id`,
          [user.id, user.username, title, note, contentType, bytes],
        )
        const id = String(rows[0].id)
        const r2Key = `art/${id}.${ext}`
        await q.query('update gallery_items set r2_key = $2 where id = $1', [id, r2Key])
        await event(q, id, 'submitted', user, '')
        return { id, r2Key }
      }),

    /** → { item } | 'missing' | 'conflict' (see move). `from` lists the statuses the item may be in now. */
    transition: (id, opts) => move(id, opts),

    /**
     * A member takes down their own piece. → { item } | 'missing' | 'conflict' (see move). A TypeError, before
     * any query, unless the user has a non-empty id: move would otherwise drop the owner check and let
     * anyone's piece be removed.
     */
    removeByOwner: async (id, user) => {
      needId(user?.id, 'user.id')
      return move(id, { from: OWNER_REMOVABLE, to: 'removed', action: 'removed', actor: user }, { owner: user.id, review: false })
    },

    /** One page of a gallery, newest first. → { rows, next }: next is the cursor for `before`, or null on the last page. */
    async list({ kind, before = null }) {
      const params = [kind]
      let more = ''
      if (before) {
        params.push(before)
        more = ` and id < $${params.length}`
      }
      params.push(PAGE_SIZE + 1)
      const { rows } = await pool.query(
        `select * from gallery_items where kind = $1 and status = 'approved'${more} order by id desc limit $${params.length}`,
        params,
      )
      return paged(rows, PAGE_SIZE)
    },

    /** Everything one member submitted or had polled in, in every status, newest first. */
    async mine(userId) {
      const { rows } = await pool.query('select * from gallery_items where author_discord_id = $1 order by id desc', [userId])
      return rows
    },

    /** The review queue, newest first. */
    async pending() {
      const { rows } = await pool.query("select * from gallery_items where status = 'pending' order by id desc")
      return rows
    },

    /** One page of the audit trail, newest first. → { rows, next } as list does. */
    async events({ before = null } = {}) {
      const params = []
      let where = ''
      if (before) {
        params.push(before)
        where = 'where id < $1 '
      }
      params.push(EVENTS_PAGE + 1)
      const { rows } = await pool.query(`select * from gallery_events ${where}order by id desc limit $${params.length}`, params)
      return paged(rows, EVENTS_PAGE)
    },

    /** The poll's cursor and last outcome for a channel, or null before its first run. */
    async getSync(channelId) {
      const { rows } = await pool.query('select * from gallery_sync where channel_id = $1', [channelId])
      return rows[0] ?? null
    },

    /**
     * Upsert the given columns only (a null clears one, e.g. last_error). Any other key, an empty patch, or an
     * undefined value is a TypeError: pg would send undefined as null and clear the cursor.
     */
    async setSync(channelId, patch) {
      const keys = Object.keys(patch)
      const bad = keys.find((k) => !SYNC_COLUMNS.includes(k))
      if (bad !== undefined) throw new TypeError(`setSync: not a gallery_sync column: ${bad}`)
      if (!keys.length) throw new TypeError('setSync: nothing to set')
      const unset = keys.find((k) => patch[k] === undefined)
      if (unset !== undefined) throw new TypeError(`setSync: ${unset} is undefined (use null to clear it)`)
      await pool.query(
        `insert into gallery_sync (channel_id, ${keys.join(', ')}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')})
         on conflict (channel_id) do update set ${keys.map((k) => `${k} = excluded.${k}`).join(', ')}`,
        [channelId, ...keys.map((k) => patch[k])],
      )
    },

    /** The newest approved polled clips, for the poll to check against Discord. → [{ id, discord_message_id }]. */
    async approvedClipIds({ newest = 50 } = {}) {
      const { rows } = await pool.query(
        `select id, discord_message_id from gallery_items ${LIVE_CLIPS} order by id desc limit $1`,
        [newest],
      )
      return rows
    },

    /** Approved polled clips oldest first, to sweep them all: page on with `after` = the last id seen. */
    async approvedClipMessageIds({ after = null, limit = 100 } = {}) {
      const params = []
      let more = ''
      if (after) {
        params.push(after)
        more = ' and id > $1'
      }
      params.push(limit)
      const { rows } = await pool.query(
        `select id, discord_message_id from gallery_items ${LIVE_CLIPS}${more} order by id asc limit $${params.length}`,
        params,
      )
      return rows
    },

    /** Discord no longer has this message: every approved row of it is removed, each with an event. → the count. */
    markDiscordDeleted: (messageId) =>
      inTx(async (q) => {
        const { rows } = await q.query(
          "update gallery_items set status = 'removed', updated_at = now() where discord_message_id = $1 and status = 'approved' returning id",
          [messageId],
        )
        for (const r of rows) await event(q, r.id, 'discord_deleted', POLL_ACTOR, '')
        return rows.length
      }),
  }
}
