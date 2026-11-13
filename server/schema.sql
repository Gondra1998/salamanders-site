-- Shared builds gallery. Mirrors the shape saveBuild() already produces
-- client-side (see src/stores/planner.js) — the API is a thin layer over
-- this, not a redesign of what a "build" is.
create table if not exists builds (
  id              bigserial primary key,
  title           text not null,
  role            text not null default '',
  notes           text not null default '',
  class_name      text not null,
  level           integer not null,
  prestige        integer not null default 0,
  prestige_picks  jsonb not null default '[]',
  perks           jsonb not null default '[]',
  perk_ids        jsonb not null default '{}',
  justifications  jsonb not null default '{}',
  weapons         jsonb not null default '{}',
  weapon_perks    jsonb not null default '{}',

  -- Verified server-side against Discord on create, never trusted from the
  -- client — see src/index.js. This is what makes delete permissions real
  -- instead of "whoever has the id can delete it."
  author_discord_id       text not null,
  author_discord_username text not null,

  created_at      timestamptz not null default now()
);

create index if not exists builds_class_name_idx on builds (class_name);
create index if not exists builds_author_idx on builds (author_discord_id);

-- Member incident reports (see docs/superpowers/specs/2026-09-26-member-reports-design.md).
-- Kept permanently: nothing in the API deletes a report or an event.
create table if not exists reports (
  id                   bigserial primary key,
  reporter_discord_id  text not null,
  reporter_username    text not null,
  incident_date        date,
  reported_member      text not null,
  witnesses            text not null default '',
  medium               text not null check (medium in ('text', 'voice', 'dm', 'other')),
  medium_other         text not null default '',
  description          text not null,
  status               text not null default 'received'
                       check (status in ('received', 'under_review', 'resolved', 'escalated')),
  handler_discord_id   text,
  handler_username     text,
  resolution_note      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  closed_at            timestamptz
);

create index if not exists reports_reporter_idx on reports (reporter_discord_id);
create index if not exists reports_status_idx on reports (status);

-- One row per state change, written in the same transaction as the change.
create table if not exists report_events (
  id                bigserial primary key,
  report_id         bigint not null references reports (id),
  actor_discord_id  text not null,
  actor_username    text not null,
  action            text not null check (action in ('filed', 'claimed', 'resolved', 'escalated', 'reopened')),
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists report_events_report_idx on report_events (report_id);

-- Perk corrections and version history
-- (see docs/superpowers/specs/2026-09-27-perk-corrections-design.md).
-- Nothing in the API deletes from these tables.
alter table builds add column if not exists deleted_at timestamptz;
alter table builds add column if not exists deleted_by text;

create table if not exists perk_corrections (
  id                 bigserial primary key,
  kind               text not null check (kind in ('weapon', 'class')),
  target             text not null,
  quality            text check (quality in ('Standard', 'Master-Crafted', 'Artificer', 'Relic', 'Heroic')),
  op                 text not null check (op in ('add', 'remove', 'edit')),
  perk_name          text not null,
  description        text,
  note               text,
  active             boolean not null default true,
  author_discord_id  text not null,
  author_username    text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((kind = 'weapon' and quality is not null) or (kind = 'class' and quality is null and op = 'edit'))
);

create index if not exists perk_corrections_active_idx on perk_corrections (active, created_at, id);

create table if not exists edit_events (
  id                bigserial primary key,
  subject           text not null check (subject in ('perk_correction', 'build', 'privilege')),
  subject_id        text not null,
  action            text not null check (action in ('created', 'edited', 'reverted', 'deleted', 'revoked', 'reinstated')),
  actor_discord_id  text not null,
  actor_username    text not null,
  snapshot          jsonb,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists edit_events_subject_idx on edit_events (subject, id desc);

create table if not exists privilege_revocations (
  id                   bigserial primary key,
  discord_id           text not null,
  username             text not null,
  revoked_by           text not null,
  revoked_by_username  text not null,
  reason               text not null,
  created_at           timestamptz not null default now(),
  lifted_by            text,
  lifted_by_username   text,
  lifted_at            timestamptz
);

-- At most one open revocation per member.
create unique index if not exists privilege_revocations_open_idx
  on privilege_revocations (discord_id) where lifted_at is null;

-- Deathwatch area (see docs/superpowers/specs/2026-10-20-deathwatch-design.md).
-- The API deletes only deathwatch_docs rows (op 'delete'); the history keeps what they held.
create table if not exists deathwatch_docs (
  col         text not null check (col in ('teams', 'cfg', 'archive')),
  id          text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  doc         jsonb not null check (jsonb_typeof(doc) = 'object'),
  updated_at  timestamptz not null default now(),
  updated_by  text not null,
  primary key (col, id)
);

create table if not exists deathwatch_doc_history (
  id                bigserial primary key,
  col               text not null,
  doc_id            text not null,
  op                text not null check (op in ('set', 'delete')),
  doc               jsonb not null, -- as written; for a delete, the document that was removed
  actor_discord_id  text not null,
  created_at        timestamptz not null default now()
);

create index if not exists deathwatch_doc_history_doc_idx on deathwatch_doc_history (col, doc_id, id desc);

create table if not exists deathwatch_grants (
  discord_id  text primary key check (discord_id ~ '^\d{17,20}$'),
  granted_by  text not null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  text
);

create table if not exists deathwatch_grant_events (
  id                bigserial primary key,
  discord_id        text not null,
  actor_discord_id  text not null,
  action            text not null check (action in ('granted', 'revoked')),
  created_at        timestamptz not null default now()
);

-- The Companies page's Notable Server Members: real members' names and short write-ups. They live here and nowhere
-- in the repo or the client bundle; GET /company-notables sends them to signed-in guild members only. One row per
-- company, entries = [[name, ...blurb lines], ...]. Filled by src/seedNotables.js.
create table if not exists company_notables (
  company_id  text primary key check (company_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  entries     jsonb not null check (jsonb_typeof(entries) = 'array'),
  updated_at  timestamptz not null default now()
);

-- Reliquarium: members-only art and clips galleries (see docs/superpowers/specs/2026-11-02-reliquarium-design.md).
-- Nothing in the API deletes from these three tables; status and the event trail carry the history.
-- A Discord message with several attachments is several rows sharing discord_message_id; an embed row uses the
-- link's URL as its attachment id.
create table if not exists gallery_items (
  id                     bigserial primary key,
  kind                   text not null check (kind in ('clip', 'art')),
  source                 text not null check (source in ('discord', 'site')),
  discord_message_id     text,
  discord_attachment_id  text,
  author_discord_id      text not null,
  author_username        text not null,
  title                  text not null default '',
  note                   text not null default '',
  media                  text not null check (media in ('video', 'image', 'embed')),
  r2_key                 text,
  embed_url              text,
  content_type           text,
  bytes                  bigint,
  status                 text not null check (status in ('pending', 'approved', 'rejected', 'hidden', 'removed')),
  reviewed_by            text,
  reviewed_by_username   text,
  review_note            text,
  posted_at              timestamptz not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- A polled clip has both Discord ids and a site upload neither, so the partial unique index covers every
  -- polled row. These live inside create table (not a later alter) because this table has never been created
  -- in production: no migration is needed. Once it exists, a new check must come as its own alter table.
  check ((discord_message_id is null) = (discord_attachment_id is null)),
  check ((source = 'discord') = (discord_message_id is not null))
);

create index if not exists gallery_items_list_idx on gallery_items (kind, status, id desc);
create index if not exists gallery_items_author_idx on gallery_items (author_discord_id);
-- A re-poll of the same message cannot insert the same attachment twice.
create unique index if not exists gallery_items_discord_idx
  on gallery_items (discord_message_id, discord_attachment_id) where discord_message_id is not null;

create table if not exists gallery_events (
  id                bigserial primary key,
  item_id           bigint not null references gallery_items (id),
  action            text not null check (action in ('stored', 'submitted', 'approved', 'rejected', 'hidden', 'removed', 'discord_deleted')),
  actor_discord_id  text not null,
  actor_username    text not null,
  note              text not null default '',
  created_at        timestamptz not null default now()
);

create index if not exists gallery_events_item_idx on gallery_events (item_id, id desc);

-- One row per polled channel: the cursor and the outcome of the last pass (last_error is null when it succeeded).
create table if not exists gallery_sync (
  channel_id       text primary key,
  last_message_id  text,
  last_run_at      timestamptz,
  last_ok_at       timestamptz,
  last_error       text
);

-- Storage purge (galleryPolicy.js, galleryPurge.js): a file can leave R2 once its item has been rejected, hidden or
-- removed for 30 days and the nightly backup holds it. The row and its trail stay; file_purged_at says the file went.
-- gallery_items exists in production, so the column and the new event action come as their own alter statements.
alter table gallery_items add column if not exists file_purged_at timestamptz;

-- One statement, so the table is never without its check. Re-running it is harmless.
alter table gallery_events
  drop constraint if exists gallery_events_action_check,
  add constraint gallery_events_action_check check (action in ('stored', 'submitted', 'approved', 'rejected', 'hidden', 'removed', 'discord_deleted', 'file_purged'));

-- Erasures (galleryStore.js eraseByOwner, eraseItem, eraseFile): the storage key of a file deleted for good, noted
-- until the nightly backup run has taken it out of R2 and out of the backup. A member's own takedown deletes the
-- item's row and trail, so this key is all that is left, and it goes too once both copies have.
create table if not exists gallery_erasures (
  r2_key       text primary key,
  requested_at timestamptz not null default now()
);
