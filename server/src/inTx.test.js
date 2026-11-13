import { describe, it, expect } from 'vitest'
import { createInTx } from './inTx'

// A recording pool: connect() hands out one client, and every statement and release lands in `log`.
// `fail` maps a statement to the error it throws.
function fakePool(fail = {}) {
  const log = []
  const client = {
    async query(sql) {
      log.push(sql)
      if (fail[sql]) throw fail[sql]
      return { rows: [] }
    },
    release() {
      log.push('release')
    },
  }
  return { pool: { connect: async () => client }, client, log }
}

describe('createInTx', () => {
  it('begins, runs the work on the one client, commits, then releases', async () => {
    const { pool, client, log } = fakePool()
    const inTx = createInTx(pool)
    const seen = []
    await inTx(async (q) => {
      seen.push(q)
      await q.query('work')
    })
    expect(seen).toEqual([client])
    expect(log).toEqual(['begin', 'work', 'commit', 'release'])
  })

  it('returns what the work returns', async () => {
    const { pool } = fakePool()
    expect(await createInTx(pool)(async () => ({ ok: 1 }))).toEqual({ ok: 1 })
  })

  it('waits for the work before committing', async () => {
    const { pool, log } = fakePool()
    await createInTx(pool)(async (q) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      await q.query('late')
    })
    expect(log).toEqual(['begin', 'late', 'commit', 'release'])
  })

  it('rolls back, releases and rethrows the same error when the work fails', async () => {
    const { pool, log } = fakePool()
    const boom = new Error('boom')
    await expect(
      createInTx(pool)(async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(log).toEqual(['begin', 'rollback', 'release'])
  })

  it('rolls back, releases and rethrows when the commit fails', async () => {
    const boom = new Error('commit failed')
    const { pool, log } = fakePool({ commit: boom })
    await expect(createInTx(pool)(async () => 'x')).rejects.toBe(boom)
    expect(log).toEqual(['begin', 'commit', 'rollback', 'release'])
  })

  it('rolls back, releases and rethrows when begin fails, and never runs the work', async () => {
    const boom = new Error('begin failed')
    const { pool, log } = fakePool({ begin: boom })
    let ran = false
    await expect(
      createInTx(pool)(async () => {
        ran = true
      }),
    ).rejects.toBe(boom)
    expect(ran).toBe(false)
    expect(log).toEqual(['begin', 'rollback', 'release'])
  })

  it("throws the work's error, not the rollback's, when the rollback fails too", async () => {
    const boom = new Error('boom')
    const { pool, log } = fakePool({ rollback: new Error('connection lost') })
    await expect(
      createInTx(pool)(async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(log).toEqual(['begin', 'rollback', 'release'])
  })

  it('does not roll back a transaction that committed', async () => {
    const { pool, log } = fakePool()
    await createInTx(pool)(async () => 1)
    expect(log).not.toContain('rollback')
  })

  it('takes a client per call and releases each one', async () => {
    const { pool, log } = fakePool()
    const inTx = createInTx(pool)
    await inTx(async () => 1)
    await inTx(async () => 2)
    expect(log).toEqual(['begin', 'commit', 'release', 'begin', 'commit', 'release'])
  })

  it('fails with the pool error, with nothing to release, when no client can be taken', async () => {
    const boom = new Error('pool exhausted')
    const pool = {
      connect: async () => {
        throw boom
      },
    }
    await expect(createInTx(pool)(async () => 1)).rejects.toBe(boom)
  })
})
