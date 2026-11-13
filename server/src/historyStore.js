/**
 * Postgres side of perks.js and buildModeration.js: perk corrections,
 * privilege revocations, build soft deletes, and the edit_events history they
 * all write to. Each change and its event commit together; nothing here
 * deletes a row. Rows come back camelCased with ISO timestamps.
 */
import { rowToBuild } from './buildRow.js'
import { createInTx } from './inTx.js'

const iso = (d) => (d instanceof Date ? d.toISOString() : d)

const toCorrection = (r) => ({
  id: Number(r.id),
  kind: r.kind,
  target: r.target,
  quality: r.quality,
  op: r.op,
  perkName: r.perk_name,
  description: r.description,
  note: r.note,
  active: r.active,
  author: { id: r.author_discord_id, username: r.author_username },
  createdAt: iso(r.created_at),
})

const toEvent = (e) => ({
  id: Number(e.id),
  subject: e.subject,
  subjectId: e.subject_id,
  action: e.action,
  actor: { id: e.actor_discord_id, username: e.actor_username },
  snapshot: e.snapshot,
  note: e.note,
  createdAt: iso(e.created_at),
})

const toRevocation = (r) => ({
  id: Number(r.id),
  discordId: r.discord_id,
  username: r.username,
  revokedBy: { id: r.revoked_by, username: r.revoked_by_username },
  reason: r.reason,
  createdAt: iso(r.created_at),
  liftedBy: r.lifted_by ? { id: r.lifted_by, username: r.lifted_by_username } : null,
  liftedAt: iso(r.lifted_at),
})

export function createHistoryStore(pool) {
  const inTx = createInTx(pool)

  const event = (q, { subject, subjectId, action, actor, snapshot, note }) =>
    q.query(
      `insert into edit_events (subject, subject_id, action, actor_discord_id, actor_username, snapshot, note)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [subject, String(subjectId), action, actor.id, actor.username, JSON.stringify(snapshot ?? null), note ?? null],
    )

  const insertOne = async (q, c, actor, before = null) => {
    const { rows } = await q.query(
      `insert into perk_corrections (kind, target, quality, op, perk_name, description, note, author_discord_id, author_username)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [c.kind, c.target, c.quality, c.op, c.perkName, c.description, c.note ?? null, actor.id, actor.username],
    )
    const out = toCorrection(rows[0])
    await event(q, { subject: 'perk_correction', subjectId: out.id, action: 'created', actor, snapshot: { ...out, before }, note: c.note })
    return out
  }

  return {
    async listActive() {
      const { rows } = await pool.query('select * from perk_corrections where active order by created_at, id')
      return rows.map(toCorrection)
    },

    insertCorrection: (c, actor, before = null) => inTx((q) => insertOne(q, c, actor, before)),

    revertCorrection: (id, actor, note) =>
      inTx(async (q) => {
        const { rows } = await q.query('select * from perk_corrections where id = $1 for update', [id])
        if (!rows.length) return 'missing'
        if (!rows[0].active) return 'conflict'
        const before = toCorrection(rows[0])
        const updated = await q.query('update perk_corrections set active = false, updated_at = now() where id = $1 returning *', [id])
        await event(q, { subject: 'perk_correction', subjectId: id, action: 'reverted', actor, snapshot: before, note })
        return toCorrection(updated.rows[0])
      }),

    seedCorrections: (list, actor) =>
      inTx(async (q) => {
        const { rows } = await q.query('select 1 from perk_corrections where author_discord_id = $1 limit 1', [actor.id])
        if (rows.length) return 0
        // Each item may carry `before` (see perkCorrectionsCore.withBefore).
        for (const c of list) await insertOne(q, { ...c, note: 'seeded from the 2026-09-27 member error report' }, actor, c.before ?? null)
        return list.length
      }),

    async history({ subject = null, q = null, before = null, limit = 50 }) {
      const where = []
      const args = []
      if (subject) where.push(`subject = $${args.push(subject)}`)
      if (q) where.push(`snapshot::text ilike $${args.push(`%${q}%`)}`)
      if (before) where.push(`id < $${args.push(before)}`)
      const sql = `select * from edit_events ${where.length ? `where ${where.join(' and ')}` : ''}
                   order by id desc limit $${args.push(limit + 1)}`
      const { rows } = await pool.query(sql, args)
      const events = rows.slice(0, limit).map(toEvent)
      return { events, next: rows.length > limit ? events.at(-1).id : null }
    },

    async openRevocation(discordId) {
      const { rows } = await pool.query('select * from privilege_revocations where discord_id = $1 and lifted_at is null', [discordId])
      return rows.length ? toRevocation(rows[0]) : null
    },

    async listOpenRevocations() {
      const { rows } = await pool.query('select * from privilege_revocations where lifted_at is null order by created_at desc')
      return rows.map(toRevocation)
    },

    revoke: (target, actor, reason) =>
      inTx(async (q) => {
        const { rows } = await q.query(
          `insert into privilege_revocations (discord_id, username, revoked_by, revoked_by_username, reason)
           values ($1,$2,$3,$4,$5)
           on conflict (discord_id) where lifted_at is null do nothing
           returning *`,
          [target.id, target.username, actor.id, actor.username, reason],
        )
        if (!rows.length) return 'conflict'
        const out = toRevocation(rows[0])
        await event(q, { subject: 'privilege', subjectId: target.id, action: 'revoked', actor, snapshot: out, note: reason })
        return out
      }),

    reinstate: (discordId, actor, note) =>
      inTx(async (q) => {
        const { rows } = await q.query(
          `update privilege_revocations set lifted_by = $2, lifted_by_username = $3, lifted_at = now()
           where discord_id = $1 and lifted_at is null returning *`,
          [discordId, actor.id, actor.username],
        )
        if (!rows.length) return 'conflict'
        const out = toRevocation(rows[0])
        await event(q, { subject: 'privilege', subjectId: discordId, action: 'reinstated', actor, snapshot: out, note })
        return out
      }),

    async buildAuthor(id) {
      const { rows } = await pool.query(
        'select author_discord_id, author_discord_username from builds where id = $1 and deleted_at is null',
        [id],
      )
      return rows.length ? { id: rows[0].author_discord_id, username: rows[0].author_discord_username } : null
    },

    softDeleteBuild: (id, actor) =>
      inTx(async (q) => {
        const { rows } = await q.query('select * from builds where id = $1 and deleted_at is null for update', [id])
        if (!rows.length) return 'missing'
        const build = rowToBuild(rows[0])
        await q.query('update builds set deleted_at = now(), deleted_by = $2 where id = $1', [id, actor.id])
        await event(q, { subject: 'build', subjectId: id, action: 'deleted', actor, snapshot: build, note: null })
        return build
      }),
  }
}
