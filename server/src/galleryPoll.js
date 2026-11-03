/**
 * The clips poll: posting in the Discord clips channel is how a clip is published. Every intervalMs one
 * pass reads the channel past the cursor, copies each attachment into R2, then stores its row; the cursor
 * moves only after a whole batch is stored, so a pass cut short repeats that batch (and 'exists' makes
 * the repeat harmless). Then it removes clips whose message is gone: the newest 50 every pass, all of
 * them once every sweepMs.
 *
 * Discord or R2 down (Upstream, R2Error), or Postgres down, ends the pass where it is: last_error says
 * why and the next pass retries. A message the parser cannot read, or a row the store refuses, is
 * skipped and named in last_error, so one bad message cannot hold the cursor back for ever.
 * runOnce never rejects; two passes never overlap.
 */
import { parseMessage } from './galleryParse.js'
import { Upstream } from './discordRoles.js'
import { R2Error } from './r2.js'
import { POLL_ACTOR } from './galleryStore.js'

const BATCH = 100
const WINDOW = 50
const SWEEP_PAGE = 100
// Postgres refusing the row itself: a data exception (22) or an integrity constraint (23).
const ROW_SQLSTATE = /^2[23][0-9A-Z]{3}$/

const isOutage = (err) => err instanceof Upstream || err instanceof R2Error
const rejectsRow = (err) => err instanceof TypeError || ROW_SQLSTATE.test(err?.code)
// For logs and last_error: short, and with any link (a signed CDN one, say) cut out.
const describe = (err) => `${err?.name ?? 'Error'}: ${String(err?.message ?? '').replace(/https?:\/\/\S*/g, '[link]')}`.slice(0, 200)
const isoOrNull = (v) => (v == null ? null : new Date(v).toISOString())

export function createGalleryPoll({
  discord,
  r2,
  store,
  parse = parseMessage,
  channelId,
  intervalMs,
  sweepMs = 3_600_000,
  uploadTimeoutMs = 120_000,
  now = Date.now,
  log = console.error,
}) {
  for (const [name, ms] of Object.entries({ intervalMs, sweepMs, uploadTimeoutMs })) {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) throw new TypeError(`${name} must be a finite number of milliseconds above 0`)
  }
  let running = false
  let timer = null
  let lastSweepAt = null // in memory: a restart just sweeps sooner
  let skipNote = null

  const stamp = () => new Date(now()).toISOString()

  async function storeRow({ download, ...row }) {
    if (!download) return store.insertDiscordItem({ ...row, r2Key: null, contentType: null, bytes: null }, POLL_ACTOR)
    const { url, size, contentType, ext } = download
    const r2Key = `clips/${row.messageId}/${row.attachmentId}.${ext}`
    // One deadline for the download and the upload it streams into.
    const signal = AbortSignal.timeout(uploadTimeoutMs)
    const { body } = await discord.download(url, { signal })
    await r2.put(r2Key, body, { contentType, contentLength: size, signal })
    return store.insertDiscordItem({ ...row, r2Key, contentType, bytes: size }, POLL_ACTOR)
  }

  function skip(message, err) {
    const messageId = /^\d{1,20}$/.test(message?.id) ? message.id : '?'
    skipNote = `Skipped clips message ${messageId} (${describe(err)})`.slice(0, 300)
    log(`Clips poll: ${skipNote}`)
  }

  async function copyMessage(message) {
    let rows
    try {
      rows = parse(message).rows
    } catch (err) {
      return skip(message, err)
    }
    for (const row of rows) {
      try {
        await storeRow(row)
      } catch (err) {
        if (isOutage(err) || !rejectsRow(err)) throw err
        skip(message, err) // that row only: its siblings in the message are still worth storing
      }
    }
  }

  async function copyNew(cursor) {
    for (;;) {
      const batch = await discord.messagesAfter(channelId, cursor, BATCH)
      if (!batch.length) return
      for (const message of batch) await copyMessage(message)
      cursor = batch.at(-1).id
      await store.setSync(channelId, { last_message_id: cursor })
      if (batch.length < BATCH) return
    }
  }

  async function fastWindow() {
    const recent = await discord.newest(channelId, WINDOW)
    const present = new Set(recent.map((m) => m.id))
    // A full window reaches back only so far: a clip older than its oldest message is out of view, not gone.
    const floor = recent.length < WINDOW ? null : recent.reduce((min, m) => (BigInt(m.id) < min ? BigInt(m.id) : min), BigInt(recent[0].id))
    const gone = new Set()
    for (const { discord_message_id: messageId } of await store.approvedClipIds({ newest: WINDOW })) {
      if (!present.has(messageId) && (floor === null || BigInt(messageId) > floor)) gone.add(messageId)
    }
    for (const messageId of gone) await store.markDiscordDeleted(messageId)
  }

  async function sweep() {
    const checked = new Set()
    let after = null
    for (;;) {
      const page = await store.approvedClipMessageIds({ after, limit: SWEEP_PAGE })
      for (const { discord_message_id: messageId } of page) {
        if (checked.has(messageId)) continue
        checked.add(messageId)
        if (!(await discord.exists(channelId, messageId))) await store.markDiscordDeleted(messageId)
      }
      if (page.length < SWEEP_PAGE) break
      after = page.at(-1).id
    }
    lastSweepAt = now()
  }

  // First run: start from the newest message, storing nothing (launch onward only). An empty channel
  // starts from the beginning, '0', so its first clip is copied rather than taken for history.
  async function seed() {
    const batch = await discord.messagesAfter(channelId, null, 1)
    if (batch.length && typeof batch[0]?.id !== 'string') throw new TypeError('The newest clips message has no id.')
    const at = stamp()
    await store.setSync(channelId, { last_message_id: batch.length ? batch[0].id : '0', last_run_at: at, last_ok_at: at, last_error: null })
  }

  async function pass() {
    const cursor = (await store.getSync(channelId))?.last_message_id ?? null
    if (cursor === null) return seed()
    await copyNew(cursor)
    await fastWindow()
    if (lastSweepAt === null || now() - lastSweepAt >= sweepMs) await sweep()
    const at = stamp()
    await store.setSync(channelId, { last_run_at: at, last_ok_at: at, last_error: skipNote })
  }

  async function fail(err) {
    const note = isOutage(err) ? err.message || 'Discord or R2 is unavailable.' : `The clips poll failed (${err?.name ?? 'Error'}).`
    log(`Clips poll: ${isOutage(err) ? note : describe(err)}`)
    try {
      await store.setSync(channelId, { last_run_at: stamp(), last_error: note })
    } catch (e) {
      log(`Clips poll: could not record the failure (${describe(e)})`)
    }
  }

  async function runOnce() {
    if (running) return
    running = true
    skipNote = null
    try {
      await pass()
    } catch (err) {
      await fail(err)
    } finally {
      running = false
    }
  }

  return {
    runOnce,
    start() {
      if (timer) return
      runOnce()
      timer = setInterval(runOnce, intervalMs)
      timer.unref?.()
    },
    stop() {
      clearInterval(timer)
      timer = null
    },
    async status() {
      const row = await store.getSync(channelId)
      return { lastRunAt: isoOrNull(row?.last_run_at), lastOkAt: isoOrNull(row?.last_ok_at), lastError: row?.last_error ?? null }
    },
  }
}
