# Weekly database backup

`salamanders-db-backup` takes a logical backup of the builds API database, proves it restores, and keeps the
newest eight. It runs on the host that runs `server/docker-compose.yml`, not inside Docker.

A file named `salamanders_builds-weekly-<UTC stamp>.dump` therefore always means *dumped, listed, restored and
compared*:

1. `pg_dump -Fc` of the running database container, and `pg_restore -l` must read it back.
2. A throwaway container of the **same image** restores it. Every table's row count and content hash, and every
   table and sequence privilege, must match the live database.
3. Only then are the `.dump`, `.sha256` and `.fingerprint` published, and only then does retention run, so a
   failing week never shrinks the set of proven backups. A dump that fails its restore is kept as
   `*.dump.failed-drill` and is never counted as, or restored as, a good one.

The script refuses to write unless the backup drive is really mounted (so a missing drive cannot fill the system
disk) and takes a lock so two runs cannot overlap.

## Install

```sh
install -m 755 server/backup/salamanders-db-backup ~/.local/bin/
crontab -e   # add:
40 3 * * 0 $HOME/.local/bin/salamanders-db-backup >> $HOME/.local/state/salamanders-db-backup/cron.log 2>&1
```

That is Sundays at 03:40 local time. The user needs access to the Docker socket. The defaults are the production
values (`server-db-1`, `/mnt/bretpc/salamanders-db-backups`, keep 8); every setting is an environment variable,
documented in the header of the script, along with the exit codes.

**The latest result is always `~/.local/state/salamanders-db-backup/last-run`.** Nothing alerts on failure:
someone has to look at that file.

## Restore

Into a fresh volume, **create the app role first**, then restore. The dump's `GRANT`s name `salamanders_app`;
roles live in the cluster, not in the dump, so restoring first stops at the first `GRANT`.

```sh
{ printf '\\set app_password '"'"'%s'"'"'\n' "$APP_DB_PASSWORD"; cat server/app-role.sql; } \
  | docker compose exec -T db psql -U salamanders -d salamanders_builds -v ON_ERROR_STOP=1
docker compose exec -T db pg_restore -U salamanders -d salamanders_builds --exit-on-error < the.dump
```

Verify a dump without restoring it: `sha256sum -c the.sha256` in the backup directory.

## Tests

```sh
bash server/backup/test.sh           # ~200 cases against a fake `docker`; about 10 seconds
python3 -I server/backup/mutate.py   # applies ~40 hand-made bugs one at a time; every one must make test.sh fail (~5 minutes)
```

The tests assert on the resulting directory contents, exit codes and the status file, never on which commands ran.
`mutate.py` is the substitute for a mutation tool, which does not exist for shell: a surviving mutant is a hole in
the tests (or must be justified as an equivalent mutant), never to be ignored.

`test.sh` ends with a canary that fails if the **real** backup directory changed during the run
(`BACKUP_PROD_DIR`, default `/mnt/bretpc/salamanders-db-backups`). It exists because an earlier version fell back to
the production path when `DEST` was set but empty, and a test wrote fake files into the real backups. An empty
`DEST` is now rejected; do not weaken that check, and do not add a test or mutant that can reach the default `DEST`.

After editing the script, rerun both, then reinstall it (`install -m 755 ...` above); the installed copy is what
cron runs.

# Nightly R2 backup and storage purge

`salamanders-r2-backup` backs up the Reliquarium's private R2 bucket into `/mnt/bretpc/salamanders-r2-backup`, then
runs the storage purge (`server/src/galleryPurge.js`, rules in `server/src/galleryPolicy.js`). It runs on the host,
with rclone in a container pinned by digest, so nothing is installed for it.

1. `rclone copy --ignore-existing`: every object the backup does not hold yet. An object is written once under its
   own key and never changed, so nothing is sent twice. It **copies, never syncs**: nothing in the backup is ever
   deleted, so it keeps the files the purge takes out of R2.
2. `rclone check --one-way`: every object in R2 must be in the backup at the same size and MD5.
3. Only then, both listings go to the API's purge, which takes out of R2 the files of items rejected, hidden or
   removed for 30 days, and only those the backup holds at R2's size. Its counts go into the status line.

The R2 values are read from `server/.env` (read, never sourced) and reach rclone as environment variables passed by
name, so the secret is never on a command line. The script refuses to run on a mutable image tag, on a mock
endpoint, or when the backup drive is not mounted, and takes a lock so two runs cannot overlap.

## Install

```sh
install -m 755 server/backup/salamanders-r2-backup ~/.local/bin/
crontab -e   # add:
10 3 * * * $HOME/.local/bin/salamanders-r2-backup >> $HOME/.local/state/salamanders-r2-backup/cron.log 2>&1
```

That is every night at 03:10 local time, before the Sunday database backup at 03:40. `PURGE=0` backs up without
purging, `PURGE=dry` only reports what the purge would take. The other settings and the exit codes are in the
header of the script. **The latest result is always `~/.local/state/salamanders-r2-backup/last-run`**, and nothing
alerts on failure.

To restore a file the purge took, copy it back from the backup to the same key (`rclone copyto`), then clear
`file_purged_at` on its row. A restored item is still rejected, hidden or removed: approve it, if wanted, after that.

## Tests

```sh
bash server/backup/test-r2.sh           # ~90 cases against a fake `docker`; a few seconds
python3 -I server/backup/mutate-r2.py   # ~50 hand-made bugs, one at a time; every one must make test-r2.sh fail
```

`test-r2.sh` ends with the same kind of canary as `test.sh`, on `/mnt/bretpc/salamanders-r2-backup`. After editing the
script, rerun both, then reinstall it; the installed copy is what cron runs.
