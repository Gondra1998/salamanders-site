import { describe, it, expect, vi } from 'vitest'
import { createCompanyNotablesStore } from './companyNotablesStore.js'

// The SQL itself is proven against real Postgres by the e2e stack (e2e/tests/company-notables-api.spec.js).
// Here a recording pool pins what the store asks for, in what order, and what it does on failure.
// `script` maps a lowercase SQL fragment to the rows that statement answers with (an Error is thrown).
function fakePool(script = []) {
  const log = []
  const release = vi.fn()
  const query = async (sql, params) => {
    const s = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    log.push({ sql: s, params })
    const hit = script.find(([fragment]) => s.includes(fragment))
    const out = hit ? hit[1] : []
    if (out instanceof Error) throw out
    return { rows: out }
  }
  return { pool: { query, connect: async () => ({ query, release }) }, log, release, sqls: () => log.map((l) => l.sql) }
}

// Invented names only.
const ONE = ['Test Member One', 'A line about them.']
const TWO = ['Test Member Two']

describe('all', () => {
  it('is empty when nothing is stored', async () => {
    const { pool } = fakePool()
    expect(await createCompanyNotablesStore(pool).all()).toStrictEqual({})
  })

  it('asks for every company, in id order, and returns id → entries', async () => {
    const { pool, log } = fakePool([
      ['from company_notables', [{ company_id: 'alpha', entries: [ONE] }, { company_id: 'beta', entries: [TWO] }]],
    ])
    expect(await createCompanyNotablesStore(pool).all()).toStrictEqual({ alpha: [ONE], beta: [TWO] })
    expect(log).toHaveLength(1)
    expect(log[0].sql).toBe('select company_id, entries from company_notables order by company_id')
  })

  it('keeps ids like __proto__ and constructor as own keys', async () => {
    const { pool } = fakePool([
      ['from company_notables', [{ company_id: '__proto__', entries: [ONE] }, { company_id: 'constructor', entries: [TWO] }]],
    ])
    const all = await createCompanyNotablesStore(pool).all()
    expect(Object.getPrototypeOf(all)).toBe(Object.prototype)
    expect(Object.keys(all).sort()).toStrictEqual(['__proto__', 'constructor'])
  })
})

describe('seed', () => {
  it('stores each pair in one transaction and says how many companies', async () => {
    const { pool, log, release } = fakePool()
    const n = await createCompanyNotablesStore(pool).seed([['alpha', [ONE, TWO]], ['beta', [TWO]]])
    expect(n).toBe(2)
    expect(log.map((l) => l.sql.split(' ')[0])).toStrictEqual(['begin', 'insert', 'insert', 'commit'])
    expect(log[1].params).toStrictEqual(['alpha', JSON.stringify([ONE, TWO])])
    expect(log[2].params).toStrictEqual(['beta', JSON.stringify([TWO])])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('replaces a company’s earlier entries and stamps the time', async () => {
    const { pool, log } = fakePool()
    await createCompanyNotablesStore(pool).seed([['alpha', [ONE]]])
    expect(log[1].sql).toBe(
      'insert into company_notables (company_id, entries) values ($1, $2::jsonb) on conflict (company_id) do update set entries = excluded.entries, updated_at = now()',
    )
  })

  it('an empty list takes the company out, and touches no other, in the same transaction', async () => {
    const { pool, log } = fakePool()
    const n = await createCompanyNotablesStore(pool).seed([['alpha', [ONE]], ['quiet', []], ['beta', [TWO]]])
    expect(n).toBe(3)
    expect(log.map((l) => l.sql.split(' ')[0])).toStrictEqual(['begin', 'insert', 'delete', 'insert', 'commit'])
    expect(log[2].sql).toBe('delete from company_notables where company_id = $1')
    expect(log[2].params).toStrictEqual(['quiet'])
  })

  it('rolls back everything when taking a company out fails', async () => {
    const boom = new Error('delete failed')
    const { pool, sqls, release } = fakePool([['delete from', boom]])
    await expect(createCompanyNotablesStore(pool).seed([['alpha', [ONE]], ['quiet', []]])).rejects.toBe(boom)
    expect(sqls().at(-1)).toBe('rollback')
    expect(sqls()).not.toContain('commit')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('with nothing to store, commits an empty transaction and says zero', async () => {
    const { pool, log } = fakePool()
    expect(await createCompanyNotablesStore(pool).seed([])).toBe(0)
    expect(log.map((l) => l.sql)).toStrictEqual(['begin', 'commit'])
  })

  it('rolls back, hands the failure on and gives the connection back when a write fails', async () => {
    const boom = new Error('write failed')
    const { pool, sqls, release } = fakePool([['insert into', boom]])
    await expect(createCompanyNotablesStore(pool).seed([['alpha', [ONE]], ['beta', [TWO]]])).rejects.toBe(boom)
    expect(sqls()).toStrictEqual([expect.stringContaining('begin'), expect.stringContaining('insert into'), 'rollback'])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('a rollback that fails does not hide the failure that caused it', async () => {
    const boom = new Error('write failed')
    const { pool, release } = fakePool([['insert into', boom], ['rollback', new Error('rollback failed')]])
    await expect(createCompanyNotablesStore(pool).seed([['alpha', [ONE]]])).rejects.toBe(boom)
    expect(release).toHaveBeenCalledTimes(1)
  })
})
