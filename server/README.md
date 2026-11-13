# Builds API

## Database roles

The API connects as `salamanders_app`: it can read and write the tables and
nothing else (not a superuser, cannot create roles or tables). `salamanders`
(`POSTGRES_USER`) owns the tables and is for admin work such as applying
`schema.sql`. Roles live in the cluster, not the database, so create the app role
once on a fresh volume, and do it **before** restoring a dump into one: the dump's
`GRANT`s name the role, and `pg_restore` stops at the first one if it does not exist.
Put `APP_DB_PASSWORD` in `server/.env` and export it in your shell, then:

```sh
{ printf '\\set app_password '"'"'%s'"'"'\n' "$APP_DB_PASSWORD"; cat app-role.sql; } \
  | docker compose exec -T db psql -U salamanders -d salamanders_builds -v ON_ERROR_STOP=1
```

It is idempotent. Tables added later by `schema.sql` are covered automatically.

## Archive key (`GET /archive/key`)

Hands the Legion Archive decryption key to a caller whose Discord token is
valid and who holds the `ARCHIVE_ROLE_ID` role in the guild. Both are checked
live against Discord on every request: there is no member list and no cache, so
a role granted or removed takes effect at once. Anything uncertain fails closed:
401 (no well-formed Bearer token, or Discord rejects it; sign in), 403 (signed in
but without the role), 503 (`ARCHIVE_KEY` or the role id not set, the guild id or
bot token not set, or Discord could not be reached). A request without a
well-formed Bearer token is answered 401 before the guild id or bot token is
looked at; a caller with a well-formed token gets 503 while either is unset. An
unset `ARCHIVE_KEY` or role id is 503 for every caller.

| Variable | Value |
|---|---|
| `ARCHIVE_KEY` | base64 key from `archive-export/.env` (also stored in a password manager) |
| `ARCHIVE_ROLE_ID` | `1377787723976409211` (XVIIIth Legion). The guild's member role: used for the archive key, `GET /membership` and the member flag on the builds list, so narrowing it changes who counts as a member across the site |
| `DISCORD_GUILD_ID` | required |
| `DISCORD_BOT_TOKEN` | required — the caller's roles are read with it |

Until the required values are set, a caller with a well-formed token gets 503
and the site shows "couldn't be reached" (see above for who still gets 401).
Rotating the key (`bun run archive keygen --rotate`,
then `seal --publish`) requires updating `ARCHIVE_KEY` here and redeploying.

## Member reports (`/reports/*`)

XVIIILegion members file; Reclusiarchs claim, resolve or escalate (via a
pre-filled link to High Command's official form); Administrators read and can
reopen. Roles are checked live against Discord on every request. Reports and
their `report_events` audit rows are kept permanently. Design:
`docs/superpowers/specs/2026-09-26-member-reports-design.md`.

Env: `REPORTS_WEBHOOK_URL` (secret; leadership channel ping, id + link only),
optional `REPORTER_ROLE_ID` / `RECLUSIARCH_ROLE_ID` overrides.

**Existing databases:** `schema.sql` only runs automatically on a fresh volume.
Apply the new tables once (idempotent):

```sh
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U salamanders salamanders_builds < schema.sql
```

Perk corrections (2026-09-27) added tables and two `builds` columns; re-run
`schema.sql` (idempotent, command above) **before** rebuilding or starting the
new API image — the new `listBuilds` reads `builds.deleted_at`, so the API
errors until the column exists. Then seed once with `docker compose exec -T api bun
run src/seed.js < ../src/data/perk-corrections.json`. `DISCORD_MOD_ROLE_ID` is
no longer read; moderator roles live in `src/privileges.js`.

## Notable server members (`GET /company-notables`)

The Companies page's Notable Server Members cards are real members' names and write-ups, so they are kept in
the database (`company_notables`, one row per company) and never in the repo or the site's bundle. The route
answers 200 `{ companies: { <companyId>: [[name, ...lines], ...] } }` to a signed-in guild member (the same live
check as `/membership`), 401 with no or an invalid token, 403 to a signed-in non-member and 503 when Discord
cannot answer. Every answer is `private, no-store`.

To change the entries, write a JSON object of `companyId` → `[[name, ...lines], ...]` to a file outside the repo
(it holds real names), then, from this folder:

```sh
docker compose exec -T api bun run src/seedNotables.js < /path/outside/the/repo/notables.json
```

It prints counts only, never a name, and is safe to re-run. Each company in the file gets its entries replaced, an
empty list takes that company out, and companies the file does not name are left alone. A document it cannot store
is refused with the position of the fault (`company 3, entry 2`), not the text.

## Deathwatch (`/deathwatch/*`)

The Discord-role-gated Deathwatch area ("Watch Fortress Ebonhold"). Design:
`docs/superpowers/specs/2026-10-20-deathwatch-design.md`. Access comes from Discord roles, asked live (the bot only
reads them: it never gives or removes a role), and from what the Watch Commander gives people by hand in
Administratum → Access (`deathwatch_access`). Commander status comes only from the Commander role. Reads (`/me`,
`/data`, `/deployment`, `/members`, `GET /access`) reuse a verdict for 30 seconds; every write checks Discord afresh,
and every access change drops the cached verdicts. Any Discord failure answers 503: the area fails closed.

Given by hand, per person: `deathwatch` (the general level, `deployment`), `watchcommand` (as the Deathwatch Command
role) or `desk` (runs the Administratum desk; also `deployment`). It counts only for a guild member whose present
membership began before it was given: leaving the guild ends it for good, and the server removes it (actor
`left-guild`) when it notices. Admins (the guild owner, or a role with Administrator; read every five minutes) see
the Administratum and change nothing.

| Endpoint | Who | Notes |
|---|---|---|
| `GET /deathwatch/me` | any signed-in user | `{ access, watchCommander, deathwatchCommand, roles }`; never 403 |
| `GET /deathwatch/data` | access | `{ teams, cfg, archive }`; `ETag`, 304 on `If-None-Match`; 403 without access. `teams` and `archive` only to the Watch Commander and `deployment` |
| `GET /deathwatch/deployment` | Watch Commander, `deployment` | `{ members, faces }`: who holds `DEATHWATCH_ROLE_ID`, and the Legion/Emissary members the tracker names, from the roster's member cache (no extra Discord calls); 503 until that has loaded |
| `POST /deathwatch/doc` | Watch Commander, `desk` | `{ col, id, op: 'set' \| 'delete', doc }`; JSON content type required |
| `GET /deathwatch/members?q=` | Watch Commander | `{ members: [{ id, name, avatar }] }`, at most 10: a 17–20 digit `q` is that member, otherwise 2+ characters of a display name, prefix matches first; from the roster cache; 503 until it has loaded |
| `GET /deathwatch/access` | Watch Commander, `desk`, `admin` | `{ people: [{ id, kind, name, avatar, grantedBy, grantedAt }] }`; first removes anyone who has left the guild since (not while the roster is still loading) |
| `POST /deathwatch/access` | Watch Commander | `{ discordId, kind }`; 201 new, 200 if already active, 404 "Not in the server.", 409 at 1000 active, 503 before the roster has loaded |
| `DELETE /deathwatch/access/:discordId/:kind` | Watch Commander | removes; 404 if none is active |

Limits: collections `teams`, `cfg`, `archive`; ids match `^[A-Za-z0-9_-]{1,64}$`; a
document is a JSON object of at most 1 MB with no U+0000 or lone surrogate (Postgres
`jsonb` cannot store them); a request body is at most 2 MB (the server refuses more than
12 MB outright); `discordId` is 17 to 20 digits. Document edits and access changes are
recorded in `deathwatch_doc_history` and `deathwatch_access_events`, in the same
transaction as the change. (`deathwatch_grants` and `deathwatch_grant_events` are the old grants, no longer used.)

| Variable | Value |
|---|---|
| `DEATHWATCH_ROLE_ID` | the Deathwatch Deployment role id, or several separated by commas with no spaces (a holder of any one is `deployment`, as is Deathwatch Command, anything given by hand, the guild owner or an Administrator) — no default, required |
| `WATCH_COMMANDER_ROLE_ID` | the Watch Commander role id: opens everything — no default, required |
| `DEATHWATCH_COMMAND_ROLE_ID` | the Deathwatch Command role id (one id, not the Watch Commander's) — optional. Its holders are `command` and `deployment` (and `deathwatchCommand: true`). Unset or not a single id, nobody holds it and nothing else changes |
| `EMISSARY_ROLE_ID` | the Emissary role id (one id) — optional; its holders are `emissary`. The Legion role (`rosterLadder.js`) gives `legion` |
| `XENOSBANE_SIGIL_ROLE_ID` | the Xenosbane Sigil award role id — optional; its holders are `xenosbane` |
| `VIGILIA_MORTIS_ROLE_ID` | the Vigilia Mortis in Aeternum award role id — optional; its holders are `vigilia` |
| `KILL_MARINE_ROLE_ID` | the Deathwatch Kill-Marine award role id — optional; its holders are `killmarine` |

`GET /deathwatch/me` answers `roles`: the standings the caller holds (`legion`, `emissary`, `deployment`,
`command`, `xenosbane`, `vigilia`, `killmarine`, `desk`, `admin`). Any standing, or the Watch Commander role, lets
them into the area; which parts open to which standings is fixed in the site's `src/lib/deathwatch/areas.js`. The
server keeps the Event Tracker's documents and every write itself; the site's locks guard only static texts.

Until **both** are set every `/deathwatch/*` route answers 503 "not configured". The role
ids are supplied at deploy time and never committed. To deploy: set both in `server/.env`,
apply the schema (idempotent, command in the reports section above) before starting the new
image, then restart the API. An image with `deathwatch_access` needs `schema.sql` applied first. The one-time import of the old site's data is a separate job.

## Reliquarium (`/gallery/*`)

Members-only galleries: gameplay clips polled from a Discord channel, and artwork
uploaded on the site and approved before anyone sees it. Design:
`docs/superpowers/specs/2026-11-02-reliquarium-design.md`. Access is the
XVIIIth Legion role (`REPORTER_ROLE_ID`), or being the guild owner or an
Administrator. An approver is someone with access who also holds the Reclusiarch,
Captain, Legion Hierarchy or curator role, or is an Administrator. Roles are asked
of Discord live. Reads reuse a verdict for 30 seconds; every approve, reject, hide,
upload and removal checks Discord afresh. Any Discord failure answers 503.

| Who | May |
|---|---|
| member | view clips and art, submit art, remove their own items, see their own submissions and why one was rejected |
| approver | also read the review queue, the poll status and the audit trail; approve, reject (with a reason) and hide anything |

| Endpoint | Who | Notes |
|---|---|---|
| `GET /gallery/me` | any signed-in user | `{ access, approver }`; never 403 |
| `GET /gallery/clips?before=<id>` | member | 24 approved clips, newest first: `{ items, next }`; `next` is the next page's `before`, or null |
| `GET /gallery/art?before=<id>` | member | the same for art |
| `GET /gallery/mine` | member | `{ items }`: the caller's own items in every status |
| `POST /gallery/art` | member | multipart form: `file`, `title`, optional `note`; 201 `{ item }`, pending review |
| `DELETE /gallery/items/:id` | the item's owner | for good: the row, its trail and its file go (R2 now, the backup tonight); 204; 404 if not theirs or gone, 409 if hidden or removed |
| `GET /gallery/review` | approver | `{ items, sync }`: the pending queue and the clips poll's `lastRunAt`, `lastOkAt`, `lastError` |
| `POST /gallery/items/:id/approve` | approver | from pending or rejected; `{ item }` |
| `POST /gallery/items/:id/reject` | approver | JSON `{ reason }`, required; from pending; `{ item }` |
| `POST /gallery/items/:id/hide` | approver | optional JSON `{ note }`; from pending, approved or rejected; `{ item }` |
| `GET /gallery/events?before=<id>` | approver | 100 audit rows, newest first: `{ events, next }` |
| `GET /gallery/takedowns` | approver | `{ items }`: rejected, hidden or removed pieces whose file R2 or the backup still holds |
| `POST /gallery/items/:id/erase` | approver | Delete for good: the file leaves R2 now and the backup tonight; the row and trail stay; 204; 409 if live or erased already |

An item carries `url`: a presigned R2 link valid 15 minutes for a stored file, or the
Medal / YouTube / Twitch link for an embed. The bucket is private; that link is the
only way to a file. A status change the item does not allow answers 409, an unknown id 404.

Limits: an upload is one JPEG, PNG, WebP or GIF of at most 10 MB, checked by its
bytes, not its name or declared type; a title is 1 to 120 characters and a note at
most 500; a rejection reason 1 to 500. A JSON body is at most 16 KB. No row is ever
deleted: every change writes a `gallery_events` row in the same transaction.

**Storage** (`galleryPolicy.js`). R2's free tier is 10 GB, so the store holds at most 9 GB,
counted from the rows' own sizes. Past 7 GB only `#gameplay` clips are copied; past 9 GB
nothing is, and an art upload answers 507. A clip that does not fit is skipped before it is
downloaded and named on the Review tab's poll line. A link holds no file and always goes in.
A file whose item has been rejected, hidden or removed for 30 days leaves R2 once the nightly
backup holds it (`galleryPurge.js`, run by `backup/salamanders-r2-backup`): the row and its
trail stay, `file_purged_at` is set, a `file_purged` event names the storage purge, and the
item can no longer be approved. The backup copy goes 60 days after the takedown. A member's own
removal, an approver's Delete for good and the owner's `salamanders-r2-backup --erase-item <id>` /
`--erase-member <discord id>` do not wait: the key goes into `gallery_erasures` (nothing else is
kept there), the file leaves R2 at once and the backup that night, and the note is dropped once
both are gone. A member's removal and the owner command also delete the row and its trail.

**The clips channel.** Posting in it is the publish step: the poll (every 2 minutes)
copies each video or image attachment into R2, and records Medal / YouTube / Twitch links
as embeds. A message tagged `#gameplay` (anywhere in its text, outside its links; the tag
is taken out of the title) goes straight on the site, files and Medal links alike. Anything
untagged, and every YouTube or Twitch link whatever its tag (nothing says the poster made
the video), waits in the review queue, its file already copied so an approver can watch
it. Attachments over 100 MB are skipped. An
attachment that cannot be copied (a dead Discord link, a file R2 refuses, a copy that cannot
finish in two minutes) is skipped too and named on the Review tab's poll line; the
back-catalogue job can pick it up later. Deleting
the message in Discord removes the clip from the site, or from the review queue (the newest
50 are checked every pass, all of them hourly); an approver can also hide one. The first pass only notes the
newest message: clips posted before launch are not imported.

| Variable | Value |
|---|---|
| `GALLERY_CHANNEL_ID` | the clips channel id — no default, required |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | the private bucket and an API token scoped to it alone — no defaults, required; the secret lives in `server/.env` only |
| `GALLERY_CURATOR_ROLE_ID` | the curator role id — optional. Unset, nobody is curator and the other approver roles still work |
| `GALLERY_POLL_MS` | how often the poll runs, in ms — optional, default 120000; a value under 1000 is raised to 1000 |
| `R2_ENDPOINT` | for the e2e stack's mock R2 only; leave unset in production. Scheme and host[:port] only, no path (`http://discord-mock:4400`): a path, query or credentials make the client refuse it, and every `/gallery/*` route answers 503 |
| `REPORTER_ROLE_ID`, `RECLUSIARCH_ROLE_ID` | shared with member reports (see above); default in code |

Until the channel id and all four R2 values are set, every `/gallery/*` route answers 503
"not configured" and the poll does not start, so the image may ship first. When some of
these variables are set but they do not make a working gallery, the API logs one warning at
startup naming each one missing or refused (never its value).

**Bot permissions, once:** View Channel and Read Message History on the clips channel,
and the Message Content intent toggle on the bot's page in the Discord Developer Portal
(without it, messages come back with no attachments or text).

Rollout:

1. Create the private R2 bucket (no public access, no custom domain) and an API token
   scoped to that bucket alone. Put the R2 values, `GALLERY_CHANNEL_ID` and (if wanted)
   `GALLERY_CURATOR_ROLE_ID` in `server/.env`.
2. Apply `schema.sql` (idempotent, command in the reports section above), then start the
   new API image. The storage purge (2026-11-07) added `gallery_items.file_purged_at` and the
   `file_purged` event: apply `schema.sql` **before** starting an image that has it, since
   every approval reads that column.
3. Grant the bot the permissions above. The first pass seeds the cursor; watch the
   Review tab's poll status for `lastOkAt` and an empty `lastError`.
4. Merge the site; the Reliquarium nav entry appears for members only.
5. Back the bucket up and run the purge: `backup/salamanders-r2-backup` nightly (see
   `backup/README.md`). It copies, never syncs: the backup keeps the files the purge takes out.

The one-time import of the channel's back catalogue is a separate job.
