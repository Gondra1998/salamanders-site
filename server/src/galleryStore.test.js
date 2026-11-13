import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createGalleryStore, POLL_ACTOR, PURGE_ACTOR } from './galleryStore'
import { PURGEABLE } from './galleryPolicy'
import { PAGE_SIZE } from './galleryValidate'

// The SQL itself is proven against real Postgres by the e2e stack. Here a recording pool pins what the
// store asks for, in what order, and what it does on failure, as deathwatchStore.test.js does.
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

const REVIEWER = { id: '300000000000000001', username: 'Reviewer' }
const OWNER = { id: '300000000000000002', username: 'Artist' }
const has = (fragment) => expect.stringContaining(fragment)
const store = (pool) => createGalleryStore(pool)
const rowsWithIds = (from, to) => Array.from({ length: from - to + 1 }, (_, i) => ({ id: String(from - i) }))

const clip = {
  messageId: '300000000000000010',
  authorId: OWNER.id,
  authorUsername: OWNER.username,
  title: 'Lava run',
  postedAt: '2026-11-01T10:00:00.000Z',
  attachmentId: '300000000000000011',
  media: 'video',
  r2Key: 'clips/a.mp4',
  contentType: 'video/mp4',
  bytes: 2048,
  status: 'approved',
}

describe('POLL_ACTOR', () => {
  it('is the fixed sentinel for the clips channel poll', () => {
    expect(POLL_ACTOR).toEqual({ id: 'clips-poll', username: 'Clips channel poll' })
  })
})

describe('insertDiscordItem', () => {
  it('inserts a clip in the status it is given and records the stored event in one transaction', async () => {
    const { pool, log, sqls, release } = fakePool([['insert into gallery_items', [{ id: '42' }]]])
    const out = await store(pool).insertDiscordItem(clip, POLL_ACTOR)
    expect(out).toEqual({ id: '42' })
    expect(sqls()).toEqual(['begin', has('insert into gallery_items'), has('insert into gallery_events'), 'commit'])
    expect(log[1].sql).toContain("'clip'")
    expect(log[1].sql).toContain("'discord'")
    expect(log[1].sql).toContain('values (\'clip\', \'discord\', $12,')
    expect(log[1].params).toEqual([
      clip.messageId,
      clip.attachmentId,
      clip.authorId,
      clip.authorUsername,
      clip.title,
      'video',
      'clips/a.mp4',
      null,
      'video/mp4',
      2048,
      clip.postedAt,
      'approved',
    ])
    expect(log[2].params).toEqual(['42', 'stored', POLL_ACTOR.id, POLL_ACTOR.username, ''])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('stores an embed with its url and no file columns', async () => {
    const embed = {
      ...clip,
      attachmentId: 'https://youtu.be/xyz',
      media: 'embed',
      embedUrl: 'https://youtu.be/xyz',
      r2Key: null,
      contentType: null,
      bytes: null,
    }
    const { pool, log } = fakePool([['insert into gallery_items', [{ id: '43' }]]])
    await store(pool).insertDiscordItem(embed, POLL_ACTOR)
    expect(log[1].params).toEqual([
      clip.messageId,
      'https://youtu.be/xyz',
      clip.authorId,
      clip.authorUsername,
      clip.title,
      'embed',
      null,
      'https://youtu.be/xyz',
      null,
      null,
      clip.postedAt,
      'approved',
    ])
  })

  it('stores a clip that waits for review as pending', async () => {
    const { pool, log } = fakePool([['insert into gallery_items', [{ id: '44' }]]])
    await store(pool).insertDiscordItem({ ...clip, status: 'pending' }, POLL_ACTOR)
    expect(log[1].params.at(-1)).toBe('pending')
  })

  it.each([undefined, null, '', 'rejected', 'hidden', 'removed', 'Approved', 'approved '])(
    'refuses a status of %j before any query: the poll only ever stores approved or pending',
    async (status) => {
      const { pool, log } = fakePool()
      await expect(store(pool).insertDiscordItem({ ...clip, status }, POLL_ACTOR)).rejects.toThrow(
        `insertDiscordItem: a polled clip goes in approved or pending, not ${String(status)}`,
      )
      expect(log).toEqual([])
    },
  )

  it.each([
    ['messageId', null],
    ['messageId', undefined],
    ['messageId', ''],
    ['messageId', 300000000000000010],
    ['attachmentId', null],
    ['attachmentId', undefined],
    ['attachmentId', ''],
  ])('refuses a %s of %j before any query, since a null id would escape the unique index', async (field, value) => {
    const { pool, log } = fakePool()
    const refused = store(pool).insertDiscordItem({ ...clip, [field]: value }, POLL_ACTOR)
    await expect(refused).rejects.toThrow(TypeError)
    await expect(refused).rejects.toThrow(`${field} must be a non-empty string`)
    expect(log).toEqual([])
  })

  it("skips a message and attachment it already holds: 'exists', and no event", async () => {
    const { pool, log, sqls } = fakePool([['insert into gallery_items', []]])
    expect(await store(pool).insertDiscordItem(clip, POLL_ACTOR)).toBe('exists')
    expect(sqls()).toEqual(['begin', has('insert into gallery_items'), 'commit'])
    expect(log[1].sql).toContain(
      'on conflict (discord_message_id, discord_attachment_id) where discord_message_id is not null do nothing',
    )
  })
})

describe('hasDiscordItem', () => {
  it('asks by message and attachment id, as parameters, and answers whether a row came back', async () => {
    const held = fakePool([['select 1 from gallery_items', [{ '?column?': 1 }]]])
    expect(await store(held.pool).hasDiscordItem(clip.messageId, clip.attachmentId)).toBe(true)
    expect(held.log).toEqual([
      {
        sql: 'select 1 from gallery_items where discord_message_id = $1 and discord_attachment_id = $2 limit 1',
        params: [clip.messageId, clip.attachmentId],
      },
    ])
    expect(await store(fakePool().pool).hasDiscordItem(clip.messageId, clip.attachmentId)).toBe(false)
  })

  it.each([
    [null, clip.attachmentId],
    ['', clip.attachmentId],
    [clip.messageId, undefined],
    [clip.messageId, ''],
  ])('refuses (%j, %j) before any query', async (messageId, attachmentId) => {
    const { pool, log } = fakePool()
    const refused = store(pool).hasDiscordItem(messageId, attachmentId)
    await expect(refused).rejects.toThrow(TypeError)
    await expect(refused).rejects.toThrow(`${messageId ? 'attachmentId' : 'messageId'} must be a non-empty string`)
    expect(log).toEqual([])
  })
})

describe('insertArt', () => {
  const art = { title: 'Dread', note: 'oils', ext: 'png', contentType: 'image/png', bytes: 5000 }

  it('inserts a pending piece, names its key from the new id, then records submitted, all in one transaction', async () => {
    const { pool, log, sqls, release } = fakePool([['insert into gallery_items', [{ id: '17' }]]])
    const out = await store(pool).insertArt(art, OWNER)
    expect(out).toEqual({ id: '17', r2Key: 'art/17.png' })
    expect(sqls()).toEqual([
      'begin',
      has('insert into gallery_items'),
      has('update gallery_items set r2_key = $2 where id = $1'),
      has('insert into gallery_events'),
      'commit',
    ])
    expect(log[1].sql).toContain("'art'")
    expect(log[1].sql).toContain("'site'")
    expect(log[1].sql).toContain("'image'")
    expect(log[1].sql).toContain("'pending'")
    expect(log[1].sql).toContain("'pending', '', now()") // r2_key goes in empty and is set once the id is known
    expect(log[1].params).toEqual([OWNER.id, OWNER.username, 'Dread', 'oils', 'image/png', 5000])
    expect(log[2].params).toEqual(['17', 'art/17.png'])
    expect(log[3].params).toEqual(['17', 'submitted', OWNER.id, OWNER.username, ''])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('rolls back and leaves no half-made piece when the key update fails', async () => {
    const { pool, sqls } = fakePool([
      ['insert into gallery_items', [{ id: '17' }]],
      ['update gallery_items', new Error('boom')],
    ])
    await expect(store(pool).insertArt(art, OWNER)).rejects.toThrow('boom')
    expect(sqls().at(-1)).toBe('rollback')
    expect(sqls()).not.toContain('commit')
  })
})

describe('transition', () => {
  const move = { from: ['pending'], to: 'approved', action: 'approved', actor: REVIEWER, note: null }

  it('moves an item the statuses allow and records the event in the same transaction', async () => {
    const item = { id: '9', status: 'approved' }
    const { pool, log, sqls } = fakePool([['update gallery_items', [item]]])
    expect(await store(pool).transition('9', move)).toEqual({ item })
    expect(sqls()).toEqual(['begin', has('update gallery_items'), has('insert into gallery_events'), 'commit'])
    expect(log[1].sql).toContain('where id = $1 and status = any($2::text[])')
    expect(log[1].sql).toContain('returning *')
    expect(log[1].sql).toContain('reviewed_by = $4, reviewed_by_username = $5, review_note = $6')
    expect(log[1].params).toEqual(['9', ['pending'], 'approved', REVIEWER.id, REVIEWER.username, null])
    expect(log[2].params).toEqual(['9', 'approved', REVIEWER.id, REVIEWER.username, ''])
  })

  it('builds exactly this statement for a reviewer, with no owner check', async () => {
    const { pool, log } = fakePool([['update gallery_items', [{ id: '9' }]]])
    await store(pool).transition('9', move)
    expect(log[1].sql).toBe(
      "update gallery_items set status = $3, reviewed_by = $4, reviewed_by_username = $5, review_note = $6, updated_at = now() where id = $1 and status = any($2::text[]) and ($3 <> 'approved' or file_purged_at is null) returning *",
    )
  })

  it('makes an item approved only while its file is kept: a purged file cannot go back on the site', async () => {
    const { pool, log } = fakePool([['update gallery_items', [{ id: '9' }]]])
    await store(pool).transition('9', move)
    expect(log[1].sql).toContain('where id = $1 and status = any($2::text[]) and ($3 <> \'approved\' or file_purged_at is null)')
  })

  it("answers 'conflict' for approving an item whose file was purged, and writes no event", async () => {
    const { pool, sqls } = fakePool([
      ['update gallery_items', []],
      ['select 1 from gallery_items', [{ '?column?': 1 }]],
    ])
    expect(await store(pool).transition('9', { ...move, from: ['rejected'] })).toBe('conflict')
    expect(sqls()).not.toContainEqual(has('insert into gallery_events'))
  })

  it('carries the reviewer note to the item and to the event', async () => {
    const { pool, log } = fakePool([['update gallery_items', [{ id: '9' }]]])
    await store(pool).transition('9', { ...move, from: ['pending', 'approved'], to: 'rejected', action: 'rejected', note: 'Off topic' })
    expect(log[1].params).toEqual(['9', ['pending', 'approved'], 'rejected', REVIEWER.id, REVIEWER.username, 'Off topic'])
    expect(log[2].params).toEqual(['9', 'rejected', REVIEWER.id, REVIEWER.username, 'Off topic'])
  })

  it("answers 'missing' when no item has that id, and writes no event", async () => {
    const { pool, log, sqls } = fakePool([
      ['update gallery_items', []],
      ['select 1 from gallery_items', []],
    ])
    expect(await store(pool).transition('9', move)).toBe('missing')
    expect(sqls()).toEqual(['begin', has('update gallery_items'), has('select 1 from gallery_items where id = $1'), 'commit'])
    expect(log[2].params).toEqual(['9'])
  })

  it("answers 'conflict' when the item exists but is not in a status the move allows, and writes no event", async () => {
    const { pool, sqls } = fakePool([
      ['update gallery_items', []],
      ['select 1 from gallery_items', [{ one: 1 }]],
    ])
    expect(await store(pool).transition('9', move)).toBe('conflict')
    expect(sqls()).toEqual(['begin', has('update gallery_items'), has('select 1 from gallery_items'), 'commit'])
  })

  it('rolls back and rethrows when the event cannot be written', async () => {
    const { pool, sqls, release } = fakePool([
      ['update gallery_items', [{ id: '9' }]],
      ['insert into gallery_events', new Error('boom')],
    ])
    await expect(store(pool).transition('9', move)).rejects.toThrow('boom')
    expect(sqls().at(-1)).toBe('rollback')
    expect(sqls()).not.toContain('commit')
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe('eraseByOwner: a member takes their own piece down, and nothing of it stays', () => {
  const held = (over = {}) => [{ status: 'approved', r2_key: 'art/9.png', ...over }]

  it('locks the row, notes the file key for the nightly run, then deletes the trail and the row, in one transaction', async () => {
    const { pool, log, sqls, release } = fakePool([['from gallery_items where id = $1 and author', held()]])
    expect(await store(pool).eraseByOwner('9', OWNER)).toEqual({ key: 'art/9.png' })
    expect(sqls()).toEqual([
      'begin',
      'select status, r2_key from gallery_items where id = $1 and author_discord_id = $2 for update',
      'insert into gallery_erasures (r2_key) values ($1) on conflict do nothing',
      'delete from gallery_events where item_id = $1',
      'delete from gallery_items where id = $1',
      'commit',
    ])
    expect(log.slice(1, 5).map((l) => l.params)).toEqual([['9', OWNER.id], ['art/9.png'], ['9'], ['9']])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it.each(['pending', 'approved', 'rejected'])('takes a %s piece', async (status) => {
    const { pool } = fakePool([['from gallery_items where id = $1 and author', held({ status })]])
    expect(await store(pool).eraseByOwner('9', OWNER)).toEqual({ key: 'art/9.png' })
  })

  it('notes no key for a piece with no file (a link), and still deletes it', async () => {
    for (const r2_key of [null, '']) {
      const { pool, sqls } = fakePool([['from gallery_items where id = $1 and author', held({ r2_key })]])
      expect(await store(pool).eraseByOwner('9', OWNER)).toEqual({ key: null })
      expect(sqls()).not.toContainEqual(has('gallery_erasures'))
      expect(sqls()).toContain('delete from gallery_items where id = $1')
    }
  })

  it("answers 'missing' for no such item or someone else's, without saying which, and deletes nothing", async () => {
    const { pool, sqls } = fakePool([['from gallery_items where id = $1 and author', []]])
    expect(await store(pool).eraseByOwner('9', OWNER)).toBe('missing')
    expect(sqls()).toEqual(['begin', has('for update'), 'commit'])
  })

  it.each(['hidden', 'removed'])("answers 'conflict' for the owner's own %s piece, and deletes nothing", async (status) => {
    const { pool, sqls } = fakePool([['from gallery_items where id = $1 and author', held({ status })]])
    expect(await store(pool).eraseByOwner('9', OWNER)).toBe('conflict')
    expect(sqls()).toEqual(['begin', has('for update'), 'commit'])
  })

  it.each([
    ['no id', { username: 'Artist' }],
    ['an undefined id', { id: undefined, username: 'Artist' }],
    ['a null id', { id: null, username: 'Artist' }],
    ['an empty id', { id: '', username: 'Artist' }],
    ['a numeric id', { id: 300000000000000002, username: 'Artist' }],
    ['no user at all', undefined],
  ])('refuses a user with %s before any query, so the owner check can never be dropped', async (_name, user) => {
    const { pool, log } = fakePool([['from gallery_items', held()]])
    const refused = store(pool).eraseByOwner('9', user)
    await expect(refused).rejects.toThrow(TypeError)
    await expect(refused).rejects.toThrow('user.id must be a non-empty string')
    expect(log).toEqual([])
  })

  it('rolls back, keeping the row and its trail, when a delete fails', async () => {
    const { pool, sqls } = fakePool([
      ['from gallery_items where id = $1 and author', held()],
      ['delete from gallery_items', new Error('boom')],
    ])
    await expect(store(pool).eraseByOwner('9', OWNER)).rejects.toThrow('boom')
    expect(sqls().at(-1)).toBe('rollback')
    expect(sqls()).not.toContain('commit')
  })
})

describe('eraseItem: the owner command, for any piece in any status', () => {
  it('deletes the piece as a member removal does, with no owner or status check', async () => {
    const { pool, log, sqls } = fakePool([['select r2_key from gallery_items', [{ r2_key: 'clips/1/2.mp4' }]]])
    expect(await store(pool).eraseItem('7')).toEqual({ key: 'clips/1/2.mp4' })
    expect(sqls()).toEqual([
      'begin',
      'select r2_key from gallery_items where id = $1 for update',
      'insert into gallery_erasures (r2_key) values ($1) on conflict do nothing',
      'delete from gallery_events where item_id = $1',
      'delete from gallery_items where id = $1',
      'commit',
    ])
    expect(log[1].params).toEqual(['7'])
  })

  it("answers 'missing' for no such item", async () => {
    const { pool, sqls } = fakePool([['select r2_key from gallery_items', []]])
    expect(await store(pool).eraseItem('7')).toBe('missing')
    expect(sqls()).toEqual(['begin', has('for update'), 'commit'])
  })

  it.each([null, undefined, '', 7])('refuses an id of %j before any query', async (id) => {
    const { pool, log } = fakePool()
    await expect(store(pool).eraseItem(id)).rejects.toThrow('id must be a non-empty string')
    expect(log).toEqual([])
  })
})

describe('itemIdsBy', () => {
  it("lists one member's pieces by id, as text, oldest first", async () => {
    const { pool, log } = fakePool([['from gallery_items', [{ id: 3 }, { id: '12' }]]])
    expect(await store(pool).itemIdsBy(OWNER.id)).toEqual(['3', '12'])
    expect(log[0].sql).toBe('select id from gallery_items where author_discord_id = $1 order by id')
    expect(log[0].params).toEqual([OWNER.id])
  })

  it.each([null, undefined, '', 300000000000000002])('refuses an author of %j before any query', async (who) => {
    const { pool, log } = fakePool()
    await expect(store(pool).itemIdsBy(who)).rejects.toThrow('authorId must be a non-empty string')
    expect(log).toEqual([])
  })
})

describe("eraseFile: an approver deletes a taken-down piece's file for good", () => {
  const ERASABLE =
    "select r2_key, file_purged_at from gallery_items where id = $1 and status = any($2::text[]) and r2_key is not null and r2_key <> '' and updated_at > now() - make_interval(days => $3) and not exists (select 1 from gallery_erasures e where e.r2_key = gallery_items.r2_key) for update"

  it('notes the key, marks the file gone from R2 and records who did it, in one transaction; the row stays', async () => {
    const { pool, log, sqls } = fakePool([['select r2_key, file_purged_at', [{ r2_key: 'art/4.png', file_purged_at: null }]]])
    expect(await store(pool).eraseFile('4', REVIEWER)).toEqual({ key: 'art/4.png', inR2: true })
    expect(sqls()).toEqual([
      'begin',
      ERASABLE,
      'insert into gallery_erasures (r2_key) values ($1) on conflict do nothing',
      'update gallery_items set file_purged_at = now() where id = $1',
      has('insert into gallery_events'),
      'commit',
    ])
    expect(log[1].params).toEqual(['4', [...PURGEABLE], 60])
    expect(log[2].params).toEqual(['art/4.png'])
    expect(log[3].params).toEqual(['4'])
    expect(log[4].params).toEqual(['4', 'file_purged', REVIEWER.id, REVIEWER.username, 'deleted for good'])
    expect(sqls()).not.toContainEqual(has('delete from'))
  })

  it('for a file the purge already took out of R2, only notes the key for the backup', async () => {
    const { pool, sqls } = fakePool([['select r2_key, file_purged_at', [{ r2_key: 'art/4.png', file_purged_at: '2026-12-01' }]]])
    expect(await store(pool).eraseFile('4', REVIEWER)).toEqual({ key: 'art/4.png', inR2: false })
    expect(sqls()).not.toContain('update gallery_items set file_purged_at = now() where id = $1')
    expect(sqls()).toContainEqual(has('insert into gallery_events'))
  })

  it("answers 'conflict' for a piece that is live, has no file, was erased already or is past 60 days", async () => {
    const { pool, sqls } = fakePool([
      ['select r2_key, file_purged_at', []],
      ['select 1 from gallery_items', [{ one: 1 }]],
    ])
    expect(await store(pool).eraseFile('4', REVIEWER)).toBe('conflict')
    expect(sqls()).toEqual(['begin', ERASABLE, 'select 1 from gallery_items where id = $1', 'commit'])
  })

  it("answers 'missing' for no such item", async () => {
    const { pool } = fakePool([['select r2_key, file_purged_at', []]])
    expect(await store(pool).eraseFile('4', REVIEWER)).toBe('missing')
  })

  it.each([null, undefined, '', 4])('refuses an id of %j before any query', async (id) => {
    const { pool, log } = fakePool()
    await expect(store(pool).eraseFile(id, REVIEWER)).rejects.toThrow('id must be a non-empty string')
    expect(log).toEqual([])
  })
})

describe('takedowns: what an approver can still delete for good', () => {
  it('lists taken-down pieces with a file that R2 or the backup still holds and nobody erased, newest first', async () => {
    const rows = [{ id: '5' }]
    const { pool, log } = fakePool([['from gallery_items', rows]])
    expect(await store(pool).takedowns()).toEqual(rows)
    expect(log[0].sql).toBe(
      "select * from gallery_items where status = any($1::text[]) and r2_key is not null and r2_key <> '' and updated_at > now() - make_interval(days => $2) and not exists (select 1 from gallery_erasures e where e.r2_key = gallery_items.r2_key) order by id desc",
    )
    expect(log[0].params).toEqual([[...PURGEABLE], 60])
  })
})

describe('the erasure notes', () => {
  it('erasures lists every noted key, in order', async () => {
    const { pool, log } = fakePool([['from gallery_erasures', [{ r2_key: 'a' }, { r2_key: 'b' }]]])
    expect(await store(pool).erasures()).toEqual(['a', 'b'])
    expect(log[0].sql).toBe('select r2_key from gallery_erasures order by r2_key')
  })

  it('dropErasure deletes one note by its key', async () => {
    const { pool, log } = fakePool()
    await store(pool).dropErasure('art/4.png')
    expect(log[0].sql).toBe('delete from gallery_erasures where r2_key = $1')
    expect(log[0].params).toEqual(['art/4.png'])
  })

  it.each([null, undefined, ''])('dropErasure refuses a key of %j before any query', async (key) => {
    const { pool, log } = fakePool()
    await expect(store(pool).dropErasure(key)).rejects.toThrow('key must be a non-empty string')
    expect(log).toEqual([])
  })

  it('expiredKeys lists the files of pieces taken down 60 days ago or more, already out of R2', async () => {
    const { pool, log } = fakePool([['from gallery_items', [{ r2_key: 'art/1.png' }]]])
    expect(await store(pool).expiredKeys()).toEqual(['art/1.png'])
    expect(log[0].sql).toBe(
      "select r2_key from gallery_items where status = any($1::text[]) and file_purged_at is not null and r2_key is not null and r2_key <> '' and updated_at < now() - make_interval(days => $2) order by id",
    )
    expect(log[0].params).toEqual([[...PURGEABLE], 60])
  })
})

describe('list', () => {
  it('asks for approved items of a kind, newest first, with one extra row to find the next page', async () => {
    const { pool, log } = fakePool([['from gallery_items', rowsWithIds(10, 1)]])
    const out = await store(pool).list({ kind: 'clip' })
    expect(log[0].sql).toContain("where kind = $1 and status = 'approved' order by id desc limit $2")
    expect(log[0].params).toEqual(['clip', PAGE_SIZE + 1])
    expect(out).toEqual({ rows: rowsWithIds(10, 1), next: null })
  })

  it('continues after a cursor', async () => {
    const { pool, log } = fakePool([['from gallery_items', []]])
    await store(pool).list({ kind: 'art', before: '500' })
    expect(log[0].sql).toContain("where kind = $1 and status = 'approved' and id < $2 order by id desc limit $3")
    expect(log[0].params).toEqual(['art', '500', PAGE_SIZE + 1])
  })

  it('has no next page when exactly a page came back', async () => {
    const { pool } = fakePool([['from gallery_items', rowsWithIds(24, 1)]])
    const out = await store(pool).list({ kind: 'clip' })
    expect(out.rows).toHaveLength(24)
    expect(out.next).toBeNull()
  })

  it("trims the extra row and points 'next' at the last id kept", async () => {
    const { pool } = fakePool([['from gallery_items', rowsWithIds(25, 1)]])
    const out = await store(pool).list({ kind: 'clip' })
    expect(out.rows).toEqual(rowsWithIds(25, 2))
    expect(out.next).toBe('2')
  })
})

describe('mine and pending', () => {
  it("mine returns every status of one author's items, newest first", async () => {
    const rows = [{ id: '2' }, { id: '1' }]
    const { pool, log } = fakePool([['from gallery_items', rows]])
    expect(await store(pool).mine(OWNER.id)).toEqual(rows)
    expect(log[0].sql).toContain('where author_discord_id = $1 order by id desc')
    expect(log[0].sql).not.toContain('status')
    expect(log[0].params).toEqual([OWNER.id])
  })

  it('pending returns the review queue, newest first', async () => {
    const rows = [{ id: '3' }]
    const { pool, log } = fakePool([['from gallery_items', rows]])
    expect(await store(pool).pending()).toEqual(rows)
    expect(log[0].sql).toContain("where status = 'pending' order by id desc")
  })
})

describe('events', () => {
  it('returns the first page of the trail, newest first, 100 to a page', async () => {
    const { pool, log } = fakePool([['from gallery_events', rowsWithIds(50, 1)]])
    const out = await store(pool).events()
    expect(log[0].sql).toContain('from gallery_events order by id desc limit $1')
    expect(log[0].params).toEqual([101])
    expect(out).toEqual({ rows: rowsWithIds(50, 1), next: null })
  })

  it('continues after a cursor and gives a next cursor when a page is full', async () => {
    const { pool, log } = fakePool([['from gallery_events', rowsWithIds(300, 200)]])
    const out = await store(pool).events({ before: '301' })
    expect(log[0].sql).toContain('from gallery_events where id < $1 order by id desc limit $2')
    expect(log[0].params).toEqual(['301', 101])
    expect(out.rows).toHaveLength(100)
    expect(out.next).toBe('201')
  })
})

describe('sync', () => {
  const CHANNEL = '300000000000000020'

  it('getSync returns the channel row, or null when it has none', async () => {
    const row = { channel_id: CHANNEL, last_message_id: '5', last_error: null }
    const hit = fakePool([['from gallery_sync', [row]]])
    expect(await store(hit.pool).getSync(CHANNEL)).toEqual(row)
    expect(hit.log[0].sql).toContain('where channel_id = $1')
    expect(hit.log[0].params).toEqual([CHANNEL])
    expect(await store(fakePool().pool).getSync(CHANNEL)).toBeNull()
  })

  it('setSync upserts only the columns it is given, so a null can clear last_error', async () => {
    const { pool, log } = fakePool()
    await store(pool).setSync(CHANNEL, { last_error: null, last_ok_at: '2026-11-02T00:00:00.000Z' })
    expect(log).toHaveLength(1)
    expect(log[0].sql).toBe(
      'insert into gallery_sync (channel_id, last_error, last_ok_at) values ($1, $2, $3) ' +
        'on conflict (channel_id) do update set last_error = excluded.last_error, last_ok_at = excluded.last_ok_at',
    )
    expect(log[0].params).toEqual([CHANNEL, null, '2026-11-02T00:00:00.000Z'])
  })

  it('setSync takes all four columns', async () => {
    const { pool, log } = fakePool()
    const patch = { last_message_id: '9', last_run_at: 'a', last_ok_at: 'b', last_error: 'c' }
    await store(pool).setSync(CHANNEL, patch)
    expect(log[0].sql).toContain('(channel_id, last_message_id, last_run_at, last_ok_at, last_error)')
    expect(log[0].params).toEqual([CHANNEL, '9', 'a', 'b', 'c'])
  })

  it('setSync refuses any other key, and sends nothing', async () => {
    const { pool, log } = fakePool()
    const sneaky = { last_error: null, 'channel_id = channel_id; drop table gallery_items --': 1 }
    await expect(store(pool).setSync(CHANNEL, sneaky)).rejects.toThrow(TypeError)
    await expect(store(pool).setSync(CHANNEL, { channel_id: 'x' })).rejects.toThrow('setSync: not a gallery_sync column: channel_id')
    expect(log).toEqual([])
  })

  it.each(['last_message_id', 'last_run_at', 'last_ok_at', 'last_error'])(
    'setSync refuses an undefined %s, which pg would send as null and so clear it',
    async (column) => {
      const { pool, log } = fakePool()
      const refused = store(pool).setSync(CHANNEL, { last_ok_at: 'a', [column]: undefined })
      await expect(refused).rejects.toThrow(TypeError)
      await expect(refused).rejects.toThrow(`setSync: ${column} is undefined (use null to clear it)`)
      expect(log).toEqual([])
    },
  )

  it('setSync refuses an empty patch', async () => {
    const { pool, log } = fakePool()
    await expect(store(pool).setSync(CHANNEL, {})).rejects.toThrow('setSync: nothing to set')
    expect(log).toEqual([])
  })
})

describe('the sweep reads', () => {
  // Pending clips are watched too: a link deleted in Discord must leave the review queue, not wait there.
  const live = "where kind = 'clip' and source = 'discord' and status in ('approved', 'pending')"

  it('watchedClipIds returns the newest 50 by default, newest first', async () => {
    const rows = [{ id: '9', discord_message_id: '300000000000000030' }]
    const { pool, log } = fakePool([['from gallery_items', rows]])
    expect(await store(pool).watchedClipIds()).toEqual(rows)
    expect(log[0].sql).toContain(`select id, discord_message_id from gallery_items ${live} order by id desc limit $1`)
    expect(log[0].params).toEqual([50])
  })

  it('watchedClipIds takes a different count', async () => {
    const { pool, log } = fakePool()
    await store(pool).watchedClipIds({ newest: 7 })
    expect(log[0].params).toEqual([7])
  })

  it('watchedClipMessageIds starts at the oldest, 100 to a page', async () => {
    const rows = [{ id: '1', discord_message_id: '300000000000000031' }]
    const { pool, log } = fakePool([['from gallery_items', rows]])
    expect(await store(pool).watchedClipMessageIds()).toEqual(rows)
    expect(log[0].sql).toContain(`select id, discord_message_id from gallery_items ${live} order by id asc limit $1`)
    expect(log[0].params).toEqual([100])
  })

  it('watchedClipMessageIds pages on from the last id seen', async () => {
    const { pool, log } = fakePool()
    await store(pool).watchedClipMessageIds({ after: '100', limit: 25 })
    expect(log[0].sql).toContain(`${live} and id > $1 order by id asc limit $2`)
    expect(log[0].params).toEqual(['100', 25])
  })
})

describe('markDiscordDeleted', () => {
  const MESSAGE = '300000000000000040'

  it('removes every approved or pending row of the message and records one discord_deleted event each', async () => {
    const { pool, log, sqls } = fakePool([['update gallery_items', [{ id: '5' }, { id: '6' }]]])
    expect(await store(pool).markDiscordDeleted(MESSAGE)).toBe(2)
    expect(sqls()).toEqual([
      'begin',
      has('update gallery_items'),
      has('insert into gallery_events'),
      has('insert into gallery_events'),
      'commit',
    ])
    expect(log[1].sql).toContain(
      "set status = 'removed', updated_at = now() where discord_message_id = $1 and status in ('approved', 'pending') returning id",
    )
    expect(log[1].params).toEqual([MESSAGE])
    expect(log[2].params).toEqual(['5', 'discord_deleted', POLL_ACTOR.id, POLL_ACTOR.username, ''])
    expect(log[3].params).toEqual(['6', 'discord_deleted', POLL_ACTOR.id, POLL_ACTOR.username, ''])
  })

  it('records nothing and counts 0 when no approved or pending row holds that message', async () => {
    const { pool, sqls } = fakePool([['update gallery_items', []]])
    expect(await store(pool).markDiscordDeleted(MESSAGE)).toBe(0)
    expect(sqls()).toEqual(['begin', has('update gallery_items'), 'commit'])
  })

  it('rolls back, so no row is removed without its event, when an event fails', async () => {
    const { pool, sqls } = fakePool([
      ['update gallery_items', [{ id: '5' }, { id: '6' }]],
      ['insert into gallery_events', new Error('boom')],
    ])
    await expect(store(pool).markDiscordDeleted(MESSAGE)).rejects.toThrow('boom')
    expect(sqls().at(-1)).toBe('rollback')
    expect(sqls()).not.toContain('commit')
  })
})

describe('every write rolls back and releases its client when a statement fails', () => {
  const writes = [
    ['purgeFile', (s) => s.purgeFile('9', async () => {}), 'from gallery_items'],
    ['insertDiscordItem', (s) => s.insertDiscordItem(clip, POLL_ACTOR), 'insert into gallery_items'],
    [
      'insertArt',
      (s) => s.insertArt({ title: 't', note: '', ext: 'png', contentType: 'image/png', bytes: 1 }, OWNER),
      'insert into gallery_items',
    ],
    [
      'transition',
      (s) => s.transition('9', { from: ['pending'], to: 'approved', action: 'approved', actor: REVIEWER }),
      'update gallery_items',
    ],
    ['eraseByOwner', (s) => s.eraseByOwner('9', OWNER), 'from gallery_items'],
    ['eraseItem', (s) => s.eraseItem('9'), 'from gallery_items'],
    ['eraseFile', (s) => s.eraseFile('9', REVIEWER), 'from gallery_items'],
    ['markDiscordDeleted', (s) => s.markDiscordDeleted('300000000000000040'), 'update gallery_items'],
  ]
  it.each(writes)('%s', async (_name, run, failing) => {
    const { pool, sqls, release } = fakePool([[failing, new Error('boom')]])
    await expect(run(store(pool))).rejects.toThrow('boom')
    expect(sqls()).toEqual(['begin', has(failing), 'rollback'])
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe('a rollback that fails too', () => {
  it('still rejects with the error that caused it, and still releases the client', async () => {
    const cause = new Error('insert failed')
    const { pool, sqls, release } = fakePool([
      ['insert into gallery_items', cause],
      ['rollback', new Error('connection lost')],
    ])
    await expect(store(pool).insertDiscordItem(clip, POLL_ACTOR)).rejects.toBe(cause)
    expect(sqls()).toEqual(['begin', has('insert into gallery_items'), 'rollback'])
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe('values never reach the SQL text', () => {
  it('sends every caller value as a parameter, never inside the statement', async () => {
    const mark = "x'; drop table gallery_items; --"
    const { pool, log } = fakePool([
      ['insert into gallery_items', [{ id: '1' }]],
      ['update gallery_items', [{ id: '1' }]],
    ])
    const s = store(pool)
    await s.insertDiscordItem({ ...clip, title: mark, authorUsername: mark }, { id: mark, username: mark })
    await s.hasDiscordItem(mark, mark)
    await s.insertArt({ title: mark, note: mark, ext: 'png', contentType: mark, bytes: 1 }, { id: mark, username: mark })
    await s.transition(mark, { from: [mark], to: mark, action: mark, actor: { id: mark, username: mark }, note: mark })
    await s.eraseByOwner(mark, { id: mark, username: mark })
    await s.eraseItem(mark)
    await s.eraseFile(mark, { id: mark, username: mark })
    await s.itemIdsBy(mark)
    await s.dropErasure(mark)
    await s.list({ kind: mark, before: mark })
    await s.mine(mark)
    await s.events({ before: mark })
    await s.getSync(mark)
    await s.setSync(mark, { last_error: mark })
    await s.watchedClipIds({ newest: mark })
    await s.watchedClipMessageIds({ after: mark, limit: mark })
    await s.markDiscordDeleted(mark)
    await s.purgeCandidates({ days: 30 })
    await s.purgeFile(mark, async () => {})
    expect(log.length).toBeGreaterThan(20)
    for (const { sql } of log) expect(sql).not.toContain('drop table')
  })
})

describe('schema.sql gallery_items', () => {
  // Postgres enforces these on the e2e stack (a fresh database built from schema.sql); here they are pinned
  // inside the create table, since the table has never been created in production and needs no migration.
  const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
  const table = /create table if not exists gallery_items \(([\s\S]*?)\r?\n\);/.exec(sql)?.[1] ?? ''

  it.each([
    ['both Discord ids or neither', "check ((discord_message_id is null) = (discord_attachment_id is null))"],
    ['Discord ids exactly when the source is discord', "check ((source = 'discord') = (discord_message_id is not null))"],
  ])('checks %s', (_, check) => {
    expect(table).toContain(check)
  })
})

describe('storedBytes', () => {
  it('sums the sizes of the files R2 still holds: a row with no key, an empty key or a purged file holds none', async () => {
    const { pool, log } = fakePool([['from gallery_items', [{ n: '4324169' }]]])
    expect(await store(pool).storedBytes()).toBe(4_324_169)
    expect(log[0].sql).toBe(
      "select coalesce(sum(bytes), 0)::text as n from gallery_items where r2_key is not null and r2_key <> '' and file_purged_at is null",
    )
  })

  it('is 0 with nothing stored', async () => {
    const { pool } = fakePool([['from gallery_items', [{ n: '0' }]]])
    expect(await store(pool).storedBytes()).toBe(0)
  })

  it('is exact past 2^31 and past 4 GiB, where a 32-bit sum would wrap', async () => {
    const { pool } = fakePool([['from gallery_items', [{ n: '8999999999' }]]])
    expect(await store(pool).storedBytes()).toBe(8_999_999_999)
  })

  it.each([[[{ n: 'x' }]], [[{ n: '-1' }]], [[{ n: null }]], [[]], [[{ n: '1e400' }]]])(
    'refuses an answer that is not a count of bytes (%j) rather than let a cap check run on it',
    async (rows) => {
      const { pool } = fakePool([['from gallery_items', rows]])
      await expect(store(pool).storedBytes()).rejects.toThrow('storedBytes: Postgres did not answer a byte count')
    },
  )
})

describe('purgeCandidates', () => {
  it('lists the kept files of items that have sat purgeable for the given days, oldest first', async () => {
    const rows = [{ id: '3', r2_key: 'art/3.png', bytes: '10' }]
    const { pool, log } = fakePool([['from gallery_items', rows]])
    expect(await store(pool).purgeCandidates({ days: 30 })).toEqual(rows)
    expect(log[0].sql).toBe(
      "select id, r2_key, bytes from gallery_items where status = any($1::text[]) and r2_key is not null and r2_key <> '' and file_purged_at is null and updated_at < now() - make_interval(days => $2) order by id",
    )
    expect(log[0].params).toEqual([[...PURGEABLE], 30])
  })

  it('takes a single day: the smallest whole number above 0', async () => {
    const { pool, log } = fakePool()
    await store(pool).purgeCandidates({ days: 1 })
    expect(log[0].params).toEqual([[...PURGEABLE], 1])
  })

  it.each([0, -1, 1.5, NaN, Infinity, '30', null, undefined])('refuses %j days before any query', async (days) => {
    const { pool, log } = fakePool()
    await expect(store(pool).purgeCandidates({ days })).rejects.toThrow('purgeCandidates: days must be a whole number above 0')
    expect(log).toEqual([])
  })
})

describe('PURGE_ACTOR', () => {
  it('is the fixed sentinel the trail names for the storage purge', () => {
    expect(PURGE_ACTOR).toEqual({ id: 'storage-purge', username: 'Storage purge' })
    expect(Object.isFrozen(PURGE_ACTOR)).toBe(true)
  })
})

describe('purgeFile', () => {
  const locked = [{ id: '7', r2_key: 'clips/1/2.mp4' }]

  it('locks the row, checks it still qualifies, removes the file, marks it purged and records it, in one transaction', async () => {
    const removed = []
    const { pool, log, sqls, release } = fakePool([['from gallery_items', locked]])
    expect(await store(pool).purgeFile('7', async (key) => removed.push(key))).toBe(true)
    expect(removed).toEqual(['clips/1/2.mp4'])
    expect(sqls()).toEqual(['begin', has('for update'), has('update gallery_items'), has('insert into gallery_events'), 'commit'])
    expect(log[1].sql).toBe(
      "select id, r2_key from gallery_items where id = $1 and status = any($2::text[]) and r2_key is not null and r2_key <> '' and file_purged_at is null and updated_at < now() - make_interval(days => $3) for update",
    )
    expect(log[1].params).toEqual(['7', [...PURGEABLE], 30])
    expect(log[2].sql).toBe('update gallery_items set file_purged_at = now() where id = $1')
    expect(log[2].params).toEqual(['7'])
    expect(log[3].params).toEqual(['7', 'file_purged', PURGE_ACTOR.id, PURGE_ACTOR.username, ''])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('removes nothing and answers false when the item no longer qualifies (approved meanwhile, say)', async () => {
    const removed = []
    const { pool, sqls } = fakePool([['from gallery_items', []]])
    expect(await store(pool).purgeFile('7', async (key) => removed.push(key))).toBe(false)
    expect(removed).toEqual([])
    expect(sqls()).toEqual(['begin', has('for update'), 'commit'])
  })

  it('marks nothing when removing the file fails, so the next run tries again', async () => {
    const boom = new Error('R2 is unreachable.')
    const { pool, sqls } = fakePool([['from gallery_items', locked]])
    await expect(store(pool).purgeFile('7', async () => { throw boom })).rejects.toBe(boom)
    expect(sqls()).toEqual(['begin', has('for update'), 'rollback'])
  })

  it('removes the file before marking it: a mark that fails leaves a file R2 no longer has, never one it still bills', async () => {
    const order = []
    const pool = fakePool([['from gallery_items', locked]]).pool
    const query = pool.connect
    pool.connect = async () => {
      const c = await query()
      const q = c.query
      return { ...c, query: async (sql, p) => (order.push(sql.split(' ')[0]), q(sql, p)) }
    }
    await store(pool).purgeFile('7', async () => order.push('REMOVE'))
    expect(order).toEqual(['begin', 'select', 'REMOVE', 'update', 'insert', 'commit'])
  })

  it.each([null, undefined, '', 7])('refuses an id of %j before any query', async (id) => {
    const { pool, log } = fakePool()
    await expect(store(pool).purgeFile(id, async () => {})).rejects.toThrow(TypeError)
    await expect(store(pool).purgeFile(id, async () => {})).rejects.toThrow('id must be a non-empty string')
    expect(log).toEqual([])
  })
})

describe('schema.sql for the storage purge', () => {
  const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')

  it('adds file_purged_at to gallery_items in its own alter, since the table exists in production', () => {
    expect(sql).toContain('alter table gallery_items add column if not exists file_purged_at timestamptz;')
  })

  it('replaces the event check in one statement, so no moment exists without one, and lets file_purged in', () => {
    expect(sql).toMatch(
      /alter table gallery_events\s+drop constraint if exists gallery_events_action_check,\s+add constraint gallery_events_action_check check \(action in \('stored', 'submitted', 'approved', 'rejected', 'hidden', 'removed', 'discord_deleted', 'file_purged'\)\);/,
    )
  })
})

describe('schema.sql gallery_erasures', () => {
  const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
  const table = /create table if not exists gallery_erasures \(([\s\S]*?)\r?\n\);/.exec(sql)?.[1] ?? ''

  it('holds a storage key and when it was noted, and nothing else: no person, no title, no item id', () => {
    const columns = table
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('--'))
      .map((line) => line.split(/\s+/)[0])
    expect(columns).toEqual(['r2_key', 'requested_at'])
    expect(table).toContain('r2_key       text primary key')
    expect(table).toContain('requested_at timestamptz not null default now()')
  })
})
