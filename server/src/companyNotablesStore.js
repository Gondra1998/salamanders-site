/**
 * Postgres side of the Companies page's Notable Server Members (companyNotables.js, companyNotablesHandler.js).
 * One row per company in company_notables (schema.sql). The API only reads; the seed script writes.
 */
export function createCompanyNotablesStore(pool) {
  return {
    /** → { companyId: entries }, empty when nothing is stored. */
    async all() {
      const { rows } = await pool.query('select company_id, entries from company_notables order by company_id')
      // fromEntries defines own properties, so an id such as __proto__ stays an ordinary key.
      return Object.fromEntries(rows.map((r) => [r.company_id, r.entries]))
    },

    /** Stores each [companyId, entries] pair in one transaction, replacing that company's earlier entries and
     * leaving the others alone. → how many companies were stored. */
    async seed(pairs) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        for (const [id, entries] of pairs) {
          await client.query(
            `insert into company_notables (company_id, entries) values ($1, $2::jsonb)
             on conflict (company_id) do update set entries = excluded.entries, updated_at = now()`,
            [id, JSON.stringify(entries)],
          )
        }
        await client.query('commit')
        return pairs.length
      } catch (err) {
        await client.query('rollback').catch(() => {})
        throw err
        // v8 on Node 26 counts the unreachable end of a catch block that always throws as a branch.
        /* v8 ignore start */
      } /* v8 ignore stop */ finally {
        client.release()
      }
    },
  }
}
