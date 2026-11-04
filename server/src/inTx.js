/**
 * Runs work in one Postgres transaction. `createInTx(pool)` → `inTx(fn)`: takes a client, begins, calls
 * fn(client), commits and returns what fn returned. Any failure rolls back and rethrows that same error (a
 * failing rollback is dropped so it cannot hide the cause); the client is always released.
 * Shared by the deathwatch, gallery, history and reports stores.
 */
export function createInTx(pool) {
  return async function inTx(fn) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      const out = await fn(client)
      await client.query('commit')
      return out
    } catch (err) {
      await client.query('rollback').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }
}
