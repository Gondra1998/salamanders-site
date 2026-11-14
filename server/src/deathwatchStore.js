/**
 * Postgres side of the Deathwatch area (deathwatchHandler.js). Every change
 * commits together with its audit row (document history, access event); only a
 * `delete` op removes a deathwatch_docs row, and the history keeps what it held.
 * Tables are in schema.sql.
 */
import { createInTx } from './inTx.js'
import { MAX_ACTIVE_ACCESS } from './deathwatchValidate.js'

// Any fixed bigint: serialises addAccess() so two callers cannot race past the ceiling.
const ACCESS_LOCK = 18_000_002

export function createDeathwatchStore(pool) {
  const inTx = createInTx(pool)

  const history = (q, col, id, op, doc, actorId) =>
    q.query(
      'insert into deathwatch_doc_history (col, doc_id, op, doc, actor_discord_id) values ($1,$2,$3,$4::jsonb,$5)',
      [col, id, op, JSON.stringify(doc), actorId],
    )

  const accessEvent = (q, discordId, kind, actorId, action) =>
    q.query('insert into deathwatch_access_events (discord_id, kind, actor_discord_id, action) values ($1,$2,$3,$4)', [
      discordId,
      kind,
      actorId,
      action,
    ])

  return {
    /** → { teams, cfg, archive }, each an id → document map. */
    async readAll() {
      const { rows } = await pool.query('select col, id, doc from deathwatch_docs order by col, id')
      const entries = { teams: [], cfg: [], archive: [] }
      for (const r of rows) entries[r.col].push([r.id, r.doc])
      // fromEntries defines own properties, so an id such as __proto__ stays an ordinary key.
      return Object.fromEntries(Object.entries(entries).map(([col, list]) => [col, Object.fromEntries(list)]))
    },

    /** One document, set or deleted. → { changed }: false when it was already so, and then no history row. */
    writeDoc: ({ col, id, op, doc }, actor) =>
      inTx(async (q) => {
        if (op === 'delete') {
          const { rows } = await q.query('delete from deathwatch_docs where col = $1 and id = $2 returning doc', [col, id])
          if (!rows.length) return { changed: false }
          await history(q, col, id, 'delete', rows[0].doc, actor.id)
          return { changed: true }
        }
        const { rows } = await q.query(
          `insert into deathwatch_docs (col, id, doc, updated_by) values ($1, $2, $3::jsonb, $4)
           on conflict (col, id) do update
             set doc = excluded.doc, updated_at = now(), updated_by = excluded.updated_by
             where deathwatch_docs.doc is distinct from excluded.doc
           returning 1 as changed`,
          [col, id, JSON.stringify(doc), actor.id],
        )
        if (!rows.length) return { changed: false }
        await history(q, col, id, 'set', doc, actor.id)
        return { changed: true }
      }),

    // People given access by hand (Administratum → Access), one row per person and kind. The kinds are
    // deathwatchValidate.js's KINDS; the actor of a removal is a person's id, or 'left-guild' when the server
    // finds they left (deathwatchAccess.js, deathwatchHandler.js).

    /** → [{ kind, grantedAt }], that person's active kinds. */
    async delegationsOf(discordId) {
      const { rows } = await pool.query('select kind, granted_at from deathwatch_access where discord_id = $1 and revoked_at is null', [discordId])
      return rows.map((r) => ({ kind: r.kind, grantedAt: r.granted_at }))
    },

    /** → [{ discordId, kind, grantedBy, grantedAt }], every active row, oldest first. */
    async listAccess() {
      const { rows } = await pool.query(
        'select discord_id, kind, granted_by, granted_at from deathwatch_access where revoked_at is null order by granted_at, discord_id, kind',
      )
      return rows.map((r) => ({ discordId: r.discord_id, kind: r.kind, grantedBy: r.granted_by, grantedAt: r.granted_at }))
    },

    /** → 'added', 'exists' (already active) or 'limit' (MAX_ACTIVE_ACCESS active rows). */
    addAccess: (discordId, kind, actorId) =>
      inTx(async (q) => {
        await q.query('select pg_advisory_xact_lock($1)', [ACCESS_LOCK])
        const existing = await q.query('select 1 from deathwatch_access where discord_id = $1 and kind = $2 and revoked_at is null', [discordId, kind])
        if (existing.rows.length) return 'exists'
        const { rows } = await q.query('select count(*)::int as n from deathwatch_access where revoked_at is null')
        if (Number(rows[0].n) >= MAX_ACTIVE_ACCESS) return 'limit'
        await q.query('insert into deathwatch_access (discord_id, kind, granted_by) values ($1, $2, $3)', [discordId, kind, actorId])
        await accessEvent(q, discordId, kind, actorId, 'added')
        return 'added'
      }),

    /** → 'removed', or 'none' when that kind was not active. */
    removeAccess: (discordId, kind, actorId) =>
      inTx(async (q) => {
        const { rows } = await q.query(
          'update deathwatch_access set revoked_at = now(), revoked_by = $3 where discord_id = $1 and kind = $2 and revoked_at is null returning discord_id',
          [discordId, kind, actorId],
        )
        if (!rows.length) return 'none'
        await accessEvent(q, discordId, kind, actorId, 'removed')
        return 'removed'
      }),
  }
}
