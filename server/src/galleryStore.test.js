import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createGalleryStore, POLL_ACTOR } from './galleryStore'
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
}

describe('POLL_ACTOR', () => {
  it('is the fixed sentinel for the clips channel poll', () => {
    expect(POLL_ACTOR).toEqual({ id: 'clips-poll', username: 'Clips channel poll' })
  })
})

describe('insertDiscordItem', () => {
  it('inserts an approved clip and records the stored event in one transaction', async () => {
    const { pool, log, sqls, release } = fakePool([['insert into gallery_items', [{ id: '42' }]]])
    const out = await store(pool).insertDiscordItem(clip, POLL_ACTOR)
    expect(out).toEqual({ id: '42' })
    expect(sqls()).toEqual(['begin', has('insert into gallery_items'), has('insert into gallery_events'), 'commit'])
    expect(log[1].sql).toContain("'clip'")
    expect(log[1].sql).toContain("'discord'")
    expect(log[1].sql).toContain("'approved'")
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
    ])
  })

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
    await expect(store(pool).insertDiscordItem({ ...clip, [field]: value }, POLL_ACTOR)).rejects.toThrow(TypeError)
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
    await expect(store(pool).hasDiscordItem(messageId, attachmentId)).rejects.toThrow(TypeError)
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

describe('removeByOwner', () => {
  it("removes the owner's own live item and records the removed event", async () => {
    const item = { id: '9', status: 'removed' }
    const { pool, log, sqls } = fakePool([['update gallery_items', [item]]])
    expect(await store(pool).removeByOwner('9', OWNER)).toEqual({ item })
    expect(sqls()).toEqual(['begin', has('update gallery_items'), has('insert into gallery_events'), 'commit'])
    expect(log[1].sql).toContain('where id = $1 and status = any($2::text[]) and author_discord_id = $4')
    expect(log[1].params).toEqual(['9', ['pending', 'approved', 'rejected'], 'removed', OWNER.id])
    expect(log[2].params).toEqual(['9', 'removed', OWNER.id, OWNER.username, ''])
  })

  it('leaves the reviewer columns alone, since an owner removing their own piece is not a review', async () => {
    const { pool, log } = fakePool([['update gallery_items', [{ id: '9' }]]])
    await store(pool).removeByOwner('9', OWNER)
    expect(log[1].sql).toContain("set status = $3, updated_at = now()")
    expect(log[1].sql).not.toContain('reviewed_by')
    expect(log[1].sql).not.toContain('review_note')
  })

  it.each([
    ['no id', { username: 'Artist' }],
    ['an undefined id', { id: undefined, username: 'Artist' }],
    ['a null id', { id: null, username: 'Artist' }],
    ['an empty id', { id: '', username: 'Artist' }],
    ['a numeric id', { id: 300000000000000002, username: 'Artist' }],
    ['no user at all', undefined],
  ])('refuses a user with %s before any query, so the owner check can never be dropped', async (_name, user) => {
    const { pool, log } = fakePool([['update gallery_items', [{ id: '9' }]]])
    await expect(store(pool).removeByOwner('9', user)).rejects.toThrow(TypeError)
    expect(log).toEqual([])
  })

  it("answers 'missing' when there is no such item or it is someone else's, without saying which", async () => {
    const { pool, log, sqls } = fakePool([
      ['update gallery_items', []],
      ['select 1 from gallery_items', []],
    ])
    expect(await store(pool).removeByOwner('9', OWNER)).toBe('missing')
    expect(log[2].sql).toContain('where id = $1 and author_discord_id = $2')
    expect(log[2].params).toEqual(['9', OWNER.id])
    expect(sqls()).toEqual(['begin', has('update gallery_items'), has('select 1 from gallery_items'), 'commit'])
  })

  it("answers 'conflict' only for the owner's own item that can no longer be removed", async () => {
    const { pool, sqls } = fakePool([
      ['update gallery_items', []],
      ['select 1 from gallery_items', [{ one: 1 }]],
    ])
    expect(await store(pool).removeByOwner('9', OWNER)).toBe('conflict')
    expect(sqls()).toEqual(['begin', has('update gallery_items'), has('select 1 from gallery_items'), 'commit'])
  })

  it('rolls back and rethrows when the event cannot be written', async () => {
    const { pool, sqls } = fakePool([
      ['update gallery_items', [{ id: '9' }]],
      ['insert into gallery_events', new Error('boom')],
    ])
    await expect(store(pool).removeByOwner('9', OWNER)).rejects.toThrow('boom')
    expect(sqls().at(-1)).toBe('rollback')
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
    await expect(store(pool).setSync(CHANNEL, { channel_id: 'x' })).rejects.toThrow(TypeError)
    expect(log).toEqual([])
  })

  it.each(['last_message_id', 'last_run_at', 'last_ok_at', 'last_error'])(
    'setSync refuses an undefined %s, which pg would send as null and so clear it',
    async (column) => {
      const { pool, log } = fakePool()
      await expect(store(pool).setSync(CHANNEL, { last_ok_at: 'a', [column]: undefined })).rejects.toThrow(TypeError)
      expect(log).toEqual([])
    },
  )

  it('setSync refuses an empty patch', async () => {
    const { pool, log } = fakePool()
    await expect(store(pool).setSync(CHANNEL, {})).rejects.toThrow(TypeError)
    expect(log).toEqual([])
  })
})

describe('the sweep reads', () => {
  const live = "where kind = 'clip' and source = 'discord' and status = 'approved'"

  it('approvedClipIds returns the newest 50 by default, newest first', async () => {
    const rows = [{ id: '9', discord_message_id: '300000000000000030' }]
    const { pool, log } = fakePool([['from gallery_items', rows]])
    expect(await store(pool).approvedClipIds()).toEqual(rows)
    expect(log[0].sql).toContain(`select id, discord_message_id from gallery_items ${live} order by id desc limit $1`)
    expect(log[0].params).toEqual([50])
  })

  it('approvedClipIds takes a different count', async () => {
    const { pool, log } = fakePool()
    await store(pool).approvedClipIds({ newest: 7 })
    expect(log[0].params).toEqual([7])
  })

  it('approvedClipMessageIds starts at the oldest, 100 to a page', async () => {
    const rows = [{ id: '1', discord_message_id: '300000000000000031' }]
    const { pool, log } = fakePool([['from gallery_items', rows]])
    expect(await store(pool).approvedClipMessageIds()).toEqual(rows)
    expect(log[0].sql).toContain(`select id, discord_message_id from gallery_items ${live} order by id asc limit $1`)
    expect(log[0].params).toEqual([100])
  })

  it('approvedClipMessageIds pages on from the last id seen', async () => {
    const { pool, log } = fakePool()
    await store(pool).approvedClipMessageIds({ after: '100', limit: 25 })
    expect(log[0].sql).toContain(`${live} and id > $1 order by id asc limit $2`)
    expect(log[0].params).toEqual(['100', 25])
  })
})

describe('markDiscordDeleted', () => {
  const MESSAGE = '300000000000000040'

  it('removes every approved row of the message and records one discord_deleted event each', async () => {
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
      "set status = 'removed', updated_at = now() where discord_message_id = $1 and status = 'approved' returning id",
    )
    expect(log[1].params).toEqual([MESSAGE])
    expect(log[2].params).toEqual(['5', 'discord_deleted', POLL_ACTOR.id, POLL_ACTOR.username, ''])
    expect(log[3].params).toEqual(['6', 'discord_deleted', POLL_ACTOR.id, POLL_ACTOR.username, ''])
  })

  it('records nothing and counts 0 when no approved row holds that message', async () => {
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
    ['removeByOwner', (s) => s.removeByOwner('9', OWNER), 'update gallery_items'],
    ['markDiscordDeleted', (s) => s.markDiscordDeleted('300000000000000040'), 'update gallery_items'],
  ]
  it.each(writes)('%s', async (_name, run, failing) => {
    const { pool, sqls, release } = fakePool([[failing, new Error('boom')]])
    await expect(run(store(pool))).rejects.toThrow('boom')
    expect(sqls()).toEqual(['begin', has(failing), 'rollback'])
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
    await s.removeByOwner(mark, { id: mark, username: mark })
    await s.list({ kind: mark, before: mark })
    await s.mine(mark)
    await s.events({ before: mark })
    await s.getSync(mark)
    await s.setSync(mark, { last_error: mark })
    await s.approvedClipIds({ newest: mark })
    await s.approvedClipMessageIds({ after: mark, limit: mark })
    await s.markDiscordDeleted(mark)
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
