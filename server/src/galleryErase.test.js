import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { eraseFor, eraseTarget } from './galleryErase.js'

const MEMBER = '111111111111111111'

describe('eraseTarget: what the command line names', () => {
  it('takes one item by id, or one member by Discord id', () => {
    expect(eraseTarget(['--item', '42'])).toEqual({ item: '42' })
    expect(eraseTarget(['--member', MEMBER])).toEqual({ member: MEMBER })
  })

  it.each([
    [[]],
    [['--item']],
    [['--member']],
    [['--item', '']],
    [['--item', 'abc']],
    [['--item', '-1']],
    [['--item', '1.5']],
    [['--item', '1234567890123456']],
    [['--member', '1234']],
    [['--member', '123456789012345678901']],
    [['--member', 'someone']],
    [['--item', '42', '--member', MEMBER]],
    [['--item', '42', 'extra']],
    [['--member', MEMBER, 'extra']],
    [['--member', MEMBER, '--item', '42']],
    [['--item', MEMBER]],
    [['--everyone', MEMBER]],
    [['--member', '42']],
    [['--everyone']],
    [['42']],
  ])('refuses %j, naming the usage and never guessing', (argv) => {
    expect(() => eraseTarget(argv)).toThrow('usage: --item <id> or --member <discord id>, one of them, once')
  })

  it('refuses anything but exactly one well-formed target, over any arguments', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 4 }), (argv) => {
        let got
        try {
          got = eraseTarget(argv)
        } catch {
          return
        }
        expect(argv).toHaveLength(2)
        if (got.item !== undefined) expect(argv).toEqual(['--item', got.item])
        else expect(argv).toEqual(['--member', got.member])
      }),
    )
  })
})

/** The store's erase contract in memory: eraseItem deletes the row and answers its file key. */
function fakeStore(items) {
  const s = {
    items: new Map(items.map((it) => [it.id, it])),
    async itemIdsBy(author) {
      return [...s.items.values()].filter((it) => it.author === author).map((it) => it.id)
    },
    async eraseItem(id) {
      const it = s.items.get(id)
      if (!it) return 'missing'
      s.items.delete(id)
      return { key: it.key }
    },
  }
  return s
}

function fakeR2(failOn = new Set()) {
  const r2 = {
    removed: [],
    async remove(key) {
      if (failOn.has(key)) throw new Error('R2 is unreachable.')
      r2.removed.push(key)
    },
  }
  return r2
}

describe('eraseFor', () => {
  const world = () =>
    fakeStore([
      { id: '1', author: MEMBER, key: 'art/1.png' },
      { id: '2', author: MEMBER, key: null },
      { id: '3', author: '222222222222222222', key: 'art/3.png' },
      { id: '4', author: MEMBER, key: 'clips/5/6.mp4' },
    ])

  it("takes every piece one member posted, and their files out of R2, leaving everyone else's", async () => {
    const store = world()
    const r2 = fakeR2()
    expect(await eraseFor({ store, r2, member: MEMBER })).toEqual({ items: 3, files: 2, leftForTonight: 0 })
    expect([...store.items.keys()]).toEqual(['3'])
    expect(r2.removed).toEqual(['art/1.png', 'clips/5/6.mp4'])
  })

  it('takes one item by id', async () => {
    const store = world()
    const r2 = fakeR2()
    expect(await eraseFor({ store, r2, item: '3' })).toEqual({ items: 1, files: 1, leftForTonight: 0 })
    expect(r2.removed).toEqual(['art/3.png'])
  })

  it('counts nothing for an item that is not there, or a member with nothing posted', async () => {
    expect(await eraseFor({ store: world(), r2: fakeR2(), item: '99' })).toEqual({ items: 0, files: 0, leftForTonight: 0 })
    expect(await eraseFor({ store: world(), r2: fakeR2(), member: '333333333333333333' })).toEqual({ items: 0, files: 0, leftForTonight: 0 })
  })

  it('goes on past a file R2 would not delete: its key is noted, so the backup run that follows takes it', async () => {
    const store = world()
    const r2 = fakeR2(new Set(['art/1.png']))
    expect(await eraseFor({ store, r2, member: MEMBER })).toEqual({ items: 3, files: 2, leftForTonight: 1 })
    expect(r2.removed).toEqual(['clips/5/6.mp4'])
    expect([...store.items.keys()]).toEqual(['3'])
  })

  it('lets a store failure through: what was erased by then stays erased', async () => {
    const store = world()
    const boom = new Error('db down')
    const erase = store.eraseItem
    store.eraseItem = async (id) => {
      if (id === '2') throw boom
      return erase(id)
    }
    await expect(eraseFor({ store, r2: fakeR2(), member: MEMBER })).rejects.toBe(boom)
    expect([...store.items.keys()]).toEqual(['2', '3', '4'])
  })
})
