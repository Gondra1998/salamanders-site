/**
 * Postgres side of reports.js. Every state change and its audit row commit
 * together; nothing here deletes. Rows come back camelCased for the API.
 */
import { createInTx } from './inTx.js'

const toReport = (r) => ({
  id: Number(r.id),
  reporter: { id: r.reporter_discord_id, username: r.reporter_username },
  incidentDate: r.incident_date,
  reportedMember: r.reported_member,
  witnesses: r.witnesses,
  medium: r.medium,
  mediumOther: r.medium_other,
  description: r.description,
  status: r.status,
  handler: r.handler_discord_id ? { id: r.handler_discord_id, username: r.handler_username } : null,
  resolutionNote: r.resolution_note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  closedAt: r.closed_at,
})

const toEvent = (e) => ({
  actor: { id: e.actor_discord_id, username: e.actor_username },
  action: e.action,
  note: e.note,
  createdAt: e.created_at,
})

// incident_date as plain YYYY-MM-DD text, not a JS Date shifted by timezone.
const COLUMNS = `*, to_char(incident_date, 'YYYY-MM-DD') as incident_date`

export function createReportsStore(pool) {
  const inTx = createInTx(pool)

  const event = (q, id, actor, action, note) =>
    q.query(
      'insert into report_events (report_id, actor_discord_id, actor_username, action, note) values ($1,$2,$3,$4,$5)',
      [id, actor.id, actor.username, action, note],
    )

  async function get(id, q = pool) {
    const { rows } = await q.query(`select ${COLUMNS} from reports where id = $1`, [id])
    if (!rows.length) return null
    const events = await q.query('select * from report_events where report_id = $1 order by created_at, id', [id])
    return { ...toReport(rows[0]), events: events.rows.map(toEvent) }
  }

  return {
    get,

    insert: (f, actor) =>
      inTx(async (q) => {
        const { rows } = await q.query(
          `insert into reports (reporter_discord_id, reporter_username, incident_date, reported_member,
             witnesses, medium, medium_other, description)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [actor.id, actor.username, f.incidentDate, f.reportedMember, f.witnesses, f.medium, f.mediumOther, f.description],
        )
        const id = Number(rows[0].id)
        await event(q, id, actor, 'filed', null)
        return id
      }),

    async listByReporter(discordId) {
      const { rows } = await pool.query(`select ${COLUMNS} from reports where reporter_discord_id = $1 order by created_at desc`, [discordId])
      return rows.map(toReport)
    },

    async listAll() {
      const { rows } = await pool.query(`select ${COLUMNS} from reports order by created_at desc`)
      return rows.map(toReport)
    },

    /** → updated report, 'missing', or 'conflict' (not in an allowed `from` state). */
    transition: (id, { from, to, claim, note, actor, action }) =>
      inTx(async (q) => {
        const { rows } = await q.query('select status from reports where id = $1 for update', [id])
        if (!rows.length) return 'missing'
        if (!from.includes(rows[0].status)) return 'conflict'
        const closing = to === 'resolved' || to === 'escalated'
        await q.query(
          `update reports set status = $2, updated_at = now(),
             closed_at = case when $3 then now() else null end,
             resolution_note = case when $3 then $4 else resolution_note end,
             handler_discord_id = case when $5 then $6 else handler_discord_id end,
             handler_username = case when $5 then $7 else handler_username end
           where id = $1`,
          [id, to, closing, note, claim, actor.id, actor.username],
        )
        await event(q, id, actor, action, note)
        return get(id, q)
      }),
  }
}
