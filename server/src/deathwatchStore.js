/**
 * Postgres side of the Deathwatch area (deathwatchHandler.js). Every change
 * commits together with its audit row (document history, grant event); only a
 * `delete` op removes a deathwatch_docs row, and the history keeps what it held.
 * Tables are in schema.sql.
 */
import { createInTx } from './inTx.js'
import { MAX_ACTIVE_GRANTS } from './deathwatchValidate.js'

// Any fixed bigint: serialises grant() so two callers cannot race past the limit.
const GRANT_LOCK = 18_000_001

export function createDeathwatchStore(pool) {
  const inTx = createInTx(pool)

  const history = (q, col, id, op, doc, actorId) =>
    q.query(
      'insert into deathwatch_doc_history (col, doc_id, op, doc, actor_discord_id) values ($1,$2,$3,$4::jsonb,$5)',
      [col, id, op, JSON.stringify(doc), actorId],
    )

  const grantEvent = (q, discordId, actorId, action) =>
    q.query('insert into deathwatch_grant_events (discord_id, actor_discord_id, action) values ($1,$2,$3)', [
      discordId,
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

    async isGranted(discordId) {
      const { rows } = await pool.query('select 1 from deathwatch_grants where discord_id = $1 and revoked_at is null', [discordId])
      return rows.length > 0
    },

    async listGrants() {
      const { rows } = await pool.query(
        'select discord_id, granted_by, granted_at from deathwatch_grants where revoked_at is null order by granted_at, discord_id',
      )
      return rows.map((r) => ({ discordId: r.discord_id, grantedBy: r.granted_by, grantedAt: r.granted_at }))
    },

    /** → 'granted' (new, or renewed after a revoke), 'exists' (already active) or 'limit'. */
    grant: (discordId, actor) =>
      inTx(async (q) => {
        await q.query('select pg_advisory_xact_lock($1)', [GRANT_LOCK])
        const existing = await q.query('select revoked_at is null as active from deathwatch_grants where discord_id = $1', [discordId])
        if (existing.rows[0]?.active) return 'exists'
        const { rows } = await q.query('select count(*)::int as n from deathwatch_grants where revoked_at is null')
        if (Number(rows[0].n) >= MAX_ACTIVE_GRANTS) return 'limit'
        await q.query(
          `insert into deathwatch_grants (discord_id, granted_by) values ($1, $2)
           on conflict (discord_id) do update
             set granted_by = excluded.granted_by, granted_at = now(), revoked_at = null, revoked_by = null`,
          [discordId, actor.id],
        )
        await grantEvent(q, discordId, actor.id, 'granted')
        return 'granted'
      }),

    /** → 'revoked', or 'none' when there was no active grant. */
    revoke: (discordId, actor) =>
      inTx(async (q) => {
        const { rows } = await q.query(
          'update deathwatch_grants set revoked_at = now(), revoked_by = $2 where discord_id = $1 and revoked_at is null returning discord_id',
          [discordId, actor.id],
        )
        if (!rows.length) return 'none'
        await grantEvent(q, discordId, actor.id, 'revoked')
        return 'revoked'
      }),
  }
}
