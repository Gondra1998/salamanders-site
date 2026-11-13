import { describe, it, expect, vi } from 'vitest'
import { createDeathwatchStore } from './deathwatchStore'
import { MAX_ACTIVE_ACCESS, MAX_ACTIVE_GRANTS } from './deathwatchValidate'

// The SQL itself is proven against real Postgres by the e2e stack (e2e/tests/deathwatch-api.spec.js).
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

const ACTOR = { id: '300000000000000001' }
const TARGET = '300000000000000009'
const has = (fragment) => expect.stringContaining(fragment)

describe('readAll', () => {
  it('returns the three collections, empty ones present', async () => {
    const { pool } = fakePool()
    expect(await createDeathwatchStore(pool).readAll()).toEqual({ teams: {}, cfg: {}, archive: {} })
  })

  it('groups documents by collection and id', async () => {
    const { pool } = fakePool([
      ['from deathwatch_docs', [
        { col: 'cfg', id: 's', doc: { w: 2 } },
        { col: 'teams', id: 'alpha', doc: { n: 1 } },
        { col: 'archive', id: 'tour-1', doc: { name: 'x' } },
      ]],
    ])
    expect(await createDeathwatchStore(pool).readAll()).toEqual({
      teams: { alpha: { n: 1 } },
      cfg: { s: { w: 2 } },
      archive: { 'tour-1': { name: 'x' } },
    })
  })

  it('keeps ids like __proto__ and constructor as own keys', async () => {
    const { pool } = fakePool([
      ['from deathwatch_docs', [
        { col: 'teams', id: '__proto__', doc: { p: 1 } },
        { col: 'teams', id: 'constructor', doc: { c: 1 } },
        { col: 'teams', id: 'alpha', doc: { n: 1 } },
      ]],
    ])
    const { teams } = await createDeathwatchStore(pool).readAll()
    expect(Object.getPrototypeOf(teams)).toBe(Object.prototype)
    expect(Object.keys(teams).sort()).toEqual(['__proto__', 'alpha', 'constructor'])
    expect(Object.hasOwn(JSON.parse(JSON.stringify(teams)), '__proto__')).toBe(true)
  })
})

describe('writeDoc', () => {
  const doc = { n: 1 }

  it('upserts a set and records history in one transaction', async () => {
    const { pool, log, sqls, release } = fakePool([['insert into deathwatch_docs', [{ changed: 1 }]]])
    const out = await createDeathwatchStore(pool).writeDoc({ col: 'teams', id: 'alpha', op: 'set', doc }, ACTOR)
    expect(out).toEqual({ changed: true })
    expect(sqls()).toEqual(['begin', has('insert into deathwatch_docs'), has('insert into deathwatch_doc_history'), 'commit'])
    expect(log[1].params).toEqual(['teams', 'alpha', JSON.stringify(doc), ACTOR.id])
    expect(log[2].params).toEqual(['teams', 'alpha', 'set', JSON.stringify(doc), ACTOR.id])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('records no history when the set changes nothing', async () => {
    const { pool, sqls } = fakePool([['insert into deathwatch_docs', []]])
    const out = await createDeathwatchStore(pool).writeDoc({ col: 'teams', id: 'alpha', op: 'set', doc }, ACTOR)
    expect(out).toEqual({ changed: false })
    expect(sqls()).toEqual(['begin', has('insert into deathwatch_docs'), 'commit'])
  })

  it('deletes a row and records the document that was removed', async () => {
    const { pool, log, sqls } = fakePool([['delete from deathwatch_docs', [{ doc }]]])
    const out = await createDeathwatchStore(pool).writeDoc({ col: 'teams', id: 'alpha', op: 'delete', doc: null }, ACTOR)
    expect(out).toEqual({ changed: true })
    expect(sqls()).toEqual(['begin', has('delete from deathwatch_docs'), has('insert into deathwatch_doc_history'), 'commit'])
    expect(log[1].params).toEqual(['teams', 'alpha'])
    expect(log[2].params).toEqual(['teams', 'alpha', 'delete', JSON.stringify(doc), ACTOR.id])
  })

  it('changes and records nothing when the document to delete is missing', async () => {
    const { pool, sqls } = fakePool([['delete from deathwatch_docs', []]])
    const out = await createDeathwatchStore(pool).writeDoc({ col: 'teams', id: 'nope', op: 'delete', doc: null }, ACTOR)
    expect(out).toEqual({ changed: false })
    expect(sqls()).toEqual(['begin', has('delete from deathwatch_docs'), 'commit'])
  })

  it('rolls back, releases the client and rethrows when a statement fails', async () => {
    const { pool, sqls, release } = fakePool([
      ['insert into deathwatch_docs', [{ changed: 1 }]],
      ['insert into deathwatch_doc_history', new Error('boom')],
    ])
    await expect(createDeathwatchStore(pool).writeDoc({ col: 'teams', id: 'alpha', op: 'set', doc }, ACTOR)).rejects.toThrow('boom')
    expect(sqls().at(-1)).toBe('rollback')
    expect(sqls()).not.toContain('commit')
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe('grants', () => {
  it('isGranted asks for an unrevoked grant of that user', async () => {
    const hit = fakePool([['from deathwatch_grants', [{ one: 1 }]]])
    expect(await createDeathwatchStore(hit.pool).isGranted(TARGET)).toBe(true)
    expect(hit.log[0].sql).toContain('revoked_at is null')
    expect(hit.log[0].params).toEqual([TARGET])
    expect(await createDeathwatchStore(fakePool().pool).isGranted(TARGET)).toBe(false)
  })

  it('listGrants returns the active grants, camelCased', async () => {
    const at = new Date('2026-01-02T03:04:05Z')
    const { pool, log } = fakePool([['from deathwatch_grants', [{ discord_id: TARGET, granted_by: ACTOR.id, granted_at: at }]]])
    expect(await createDeathwatchStore(pool).listGrants()).toEqual([{ discordId: TARGET, grantedBy: ACTOR.id, grantedAt: at }])
    expect(log[0].sql).toContain('revoked_at is null')
  })

  it('grant takes the lock, inserts, and records the event', async () => {
    const { pool, log, sqls } = fakePool([['as active', []], ['count(', [{ n: 3 }]]])
    expect(await createDeathwatchStore(pool).grant(TARGET, ACTOR)).toBe('granted')
    expect(sqls()).toEqual([
      'begin',
      has('pg_advisory_xact_lock'),
      has('as active'),
      has('count('),
      has('insert into deathwatch_grants'),
      has('insert into deathwatch_grant_events'),
      'commit',
    ])
    expect(log[4].sql).toContain('revoked_at = null')
    expect(log[4].sql).toContain('revoked_by = null')
    expect(log[4].params).toEqual([TARGET, ACTOR.id])
    expect(log[5].params).toEqual([TARGET, ACTOR.id, 'granted'])
  })

  it('grant is a no-op for a user who already has an active grant', async () => {
    const { pool, sqls } = fakePool([['as active', [{ active: true }]]])
    expect(await createDeathwatchStore(pool).grant(TARGET, ACTOR)).toBe('exists')
    expect(sqls()).toEqual(['begin', has('pg_advisory_xact_lock'), has('as active'), 'commit'])
  })

  it('grant renews a revoked grant', async () => {
    const { pool, sqls } = fakePool([['as active', [{ active: false }]], ['count(', [{ n: 0 }]]])
    expect(await createDeathwatchStore(pool).grant(TARGET, ACTOR)).toBe('granted')
    expect(sqls()).toContainEqual(has('insert into deathwatch_grants'))
  })

  it('grant refuses at the active-grant limit and inserts nothing', async () => {
    const { pool, sqls } = fakePool([['as active', []], ['count(', [{ n: String(MAX_ACTIVE_GRANTS) }]]])
    expect(await createDeathwatchStore(pool).grant(TARGET, ACTOR)).toBe('limit')
    expect(sqls()).toEqual(['begin', has('pg_advisory_xact_lock'), has('as active'), has('count('), 'commit'])
  })

  it('grant still has room one below the limit', async () => {
    const { pool } = fakePool([['as active', []], ['count(', [{ n: MAX_ACTIVE_GRANTS - 1 }]]])
    expect(await createDeathwatchStore(pool).grant(TARGET, ACTOR)).toBe('granted')
  })

  it('revoke marks the grant revoked and records the event', async () => {
    const { pool, log, sqls } = fakePool([['update deathwatch_grants', [{ discord_id: TARGET }]]])
    expect(await createDeathwatchStore(pool).revoke(TARGET, ACTOR)).toBe('revoked')
    expect(sqls()).toEqual(['begin', has('update deathwatch_grants'), has('insert into deathwatch_grant_events'), 'commit'])
    expect(log[1].sql).toContain('revoked_at is null')
    expect(log[1].params).toEqual([TARGET, ACTOR.id])
    expect(log[2].params).toEqual([TARGET, ACTOR.id, 'revoked'])
  })

  it('revoke reports none, and records nothing, when there is no active grant', async () => {
    const { pool, sqls } = fakePool([['update deathwatch_grants', []]])
    expect(await createDeathwatchStore(pool).revoke(TARGET, ACTOR)).toBe('none')
    expect(sqls()).toEqual(['begin', has('update deathwatch_grants'), 'commit'])
  })
})

describe('access (people given access by hand, by kind)', () => {
  const at = new Date('2026-01-02T03:04:05Z')

  it('delegationsOf returns that person\'s active kinds with when each was given', async () => {
    const { pool, log } = fakePool([['from deathwatch_access', [{ kind: 'desk', granted_at: at }, { kind: 'deathwatch', granted_at: at }]]])
    expect(await createDeathwatchStore(pool).delegationsOf(TARGET)).toEqual([
      { kind: 'desk', grantedAt: at },
      { kind: 'deathwatch', grantedAt: at },
    ])
    expect(log[0].sql).toContain('revoked_at is null')
    expect(log[0].params).toEqual([TARGET])
    expect(await createDeathwatchStore(fakePool().pool).delegationsOf(TARGET)).toEqual([])
  })

  it('listAccess returns every active row, camelCased, oldest first', async () => {
    const { pool, log } = fakePool([['from deathwatch_access', [{ discord_id: TARGET, kind: 'watchcommand', granted_by: ACTOR.id, granted_at: at }]]])
    expect(await createDeathwatchStore(pool).listAccess()).toEqual([{ discordId: TARGET, kind: 'watchcommand', grantedBy: ACTOR.id, grantedAt: at }])
    expect(log[0].sql).toContain('revoked_at is null')
    expect(log[0].sql).toContain('order by granted_at, discord_id, kind')
  })

  it('addAccess takes the lock, checks, counts, inserts and records the event', async () => {
    const { pool, log, sqls } = fakePool([['select 1 from deathwatch_access', []], ['count(', [{ n: 3 }]]])
    expect(await createDeathwatchStore(pool).addAccess(TARGET, 'desk', ACTOR.id)).toBe('added')
    expect(sqls()).toEqual([
      'begin',
      has('pg_advisory_xact_lock'),
      has('select 1 from deathwatch_access'),
      has('count('),
      has('insert into deathwatch_access '),
      has('insert into deathwatch_access_events'),
      'commit',
    ])
    expect(Number.isSafeInteger(log[1].params[0])).toBe(true)
    expect(log[2].sql).toContain('revoked_at is null')
    expect(log[2].params).toEqual([TARGET, 'desk'])
    expect(log[3].sql).toContain('revoked_at is null')
    expect(log[4].params).toEqual([TARGET, 'desk', ACTOR.id])
    expect(log[5].params).toEqual([TARGET, 'desk', ACTOR.id, 'added'])
  })

  it('addAccess is a no-op for a kind the person already holds', async () => {
    const { pool, sqls } = fakePool([['select 1 from deathwatch_access', [{ one: 1 }]]])
    expect(await createDeathwatchStore(pool).addAccess(TARGET, 'desk', ACTOR.id)).toBe('exists')
    expect(sqls()).toEqual(['begin', has('pg_advisory_xact_lock'), has('select 1 from deathwatch_access'), 'commit'])
  })

  it('addAccess refuses at the ceiling and inserts nothing, and has room one below it', async () => {
    const full = fakePool([['select 1 from deathwatch_access', []], ['count(', [{ n: String(MAX_ACTIVE_ACCESS) }]]])
    expect(await createDeathwatchStore(full.pool).addAccess(TARGET, 'desk', ACTOR.id)).toBe('limit')
    expect(full.sqls()).toEqual(['begin', has('pg_advisory_xact_lock'), has('select 1 from deathwatch_access'), has('count('), 'commit'])
    const room = fakePool([['select 1 from deathwatch_access', []], ['count(', [{ n: MAX_ACTIVE_ACCESS - 1 }]]])
    expect(await createDeathwatchStore(room.pool).addAccess(TARGET, 'desk', ACTOR.id)).toBe('added')
  })

  it('removeAccess revokes that one kind and records who did it, a person or left-guild', async () => {
    for (const actor of [ACTOR.id, 'left-guild']) {
      const { pool, log, sqls } = fakePool([['update deathwatch_access', [{ discord_id: TARGET }]]])
      expect(await createDeathwatchStore(pool).removeAccess(TARGET, 'watchcommand', actor)).toBe('removed')
      expect(sqls()).toEqual(['begin', has('update deathwatch_access'), has('insert into deathwatch_access_events'), 'commit'])
      expect(log[1].sql).toContain('revoked_at is null')
      expect(log[1].params).toEqual([TARGET, 'watchcommand', actor])
      expect(log[2].params).toEqual([TARGET, 'watchcommand', actor, 'removed'])
    }
  })

  it('removeAccess reports none, and records nothing, when that kind is not active', async () => {
    const { pool, sqls } = fakePool([['update deathwatch_access', []]])
    expect(await createDeathwatchStore(pool).removeAccess(TARGET, 'desk', ACTOR.id)).toBe('none')
    expect(sqls()).toEqual(['begin', has('update deathwatch_access'), 'commit'])
  })
})
