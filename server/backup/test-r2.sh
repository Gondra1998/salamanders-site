#!/usr/bin/env bash
# Adversarial tests for salamanders-r2-backup. A fake `docker` plays rclone against a directory standing in
# for the bucket, and plays the API's purge. Assertions are on exit codes, the status file, what the backup
# directory holds and what the purge was handed, never on which commands ran, except one: the secret must not
# be on any command line. SCRIPT=<path> tests a mutated copy (see mutate-r2.py).
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT=${SCRIPT:-$HERE/salamanders-r2-backup}
ROOT=$(mktemp -d /tmp/r2backup-test.XXXXXX)
trap 'rm -rf "$ROOT"' EXIT
PASS=0; FAIL=0; CASE=""
# The canary: the real backup directory must be exactly as it was when the run ends.
PROD=${BACKUP_PROD_DIR:-/mnt/bretpc/salamanders-r2-backup}
prod_state() { find "$PROD" -printf '%P %s %T@\n' 2>/dev/null | sort; }
PROD_BEFORE=$(prod_state)

SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
KEYID=fedcba9876543210fedcba9876543210
ACCOUNT=00112233445566778899aabbccddeeff
BUCKET=invented-bucket
IMAGE=rclone/rclone:1.76.0@sha256:7cbeec24a44f206067597c0368be4de90ae19a64d5113c7d1938bd737a81e466

BIN=$ROOT/bin; mkdir -p "$BIN"
cat > "$BIN/docker" <<'SHIM'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_STATE/argv"
case "$1" in
  run)
    shift; host=""; image_seen=0; args=()
    while [ $# -gt 0 ]; do
      case $1 in
        -v) host=${2%%:/backup}; shift 2 ;;
        -e) [ -n "${!2+x}" ] || { echo "fake: env $2 not set" >&2; exit 97; }; shift 2 ;;
        --rm) shift ;;
        --user) shift 2 ;;
        --config) shift 2 ;;
        *) if [ $image_seen = 0 ]; then image_seen=1; [ "$1" = "$FAKE_IMAGE" ] || { echo "fake: wrong image $1" >&2; exit 96; }; else args+=("$1"); fi; shift ;;
      esac
    done
    # The credentials rclone would sign with must be the ones in .env.
    [ "$RCLONE_CONFIG_R2_SECRET_ACCESS_KEY" = "$FAKE_SECRET" ] || { echo "fake: R2 refused the credentials" >&2; exit 1; }
    [ "$RCLONE_CONFIG_R2_ACCESS_KEY_ID" = "$FAKE_KEYID" ] || { echo "fake: R2 refused the key id" >&2; exit 1; }
    [ "$RCLONE_CONFIG_R2_ENDPOINT" = "https://$FAKE_ACCOUNT.r2.cloudflarestorage.com" ] || { echo "fake: wrong endpoint" >&2; exit 1; }
    [ "${args[1]}" = "r2:$FAKE_BUCKET" ] || { echo "fake: no such bucket ${args[1]}" >&2; exit 1; }
    case "${args[0]}" in
      copy)
        echo copy >> "$FAKE_STATE/order"
        [ "${FAKE_COPY_FAIL:-}" = 1 ] && { echo "fake: copy failed" >&2; exit 1; }
        [[ " ${args[*]} " == *" --ignore-existing "* ]] || { echo "fake: copy without --ignore-existing would overwrite" >&2; exit 95; }
        (cd "$FAKE_R2" && find . -type f) | while read -r f; do
          [ -e "$host/$f" ] && continue
          mkdir -p "$(dirname "$host/$f")" && cp "$FAKE_R2/$f" "$host/$f"
        done
        exit 0 ;;
      check)
        [[ " ${args[*]} " == *" --one-way "* ]] || { echo "fake: a two-way check fails on purged files" >&2; exit 1; }
        bad=0
        while read -r f; do cmp -s "$FAKE_R2/$f" "$host/$f" || { echo "fake: differs $f" >&2; bad=1; }; done < <(cd "$FAKE_R2" && find . -type f)
        exit $bad ;;
      lsf)
        [ "${FAKE_LSF_FAIL:-}" = 1 ] && { echo "fake: list failed" >&2; exit 1; }
        (cd "$FAKE_R2" && find . -type f -printf '%s\t%P\n')
        exit 0 ;;
    esac
    echo "fake: unknown rclone call ${args[*]}" >&2; exit 98 ;;
  compose)
    shift
    [ "$1" = -f ] && [ "$2" = "$FAKE_COMPOSE_FILE" ] || { echo "fake: wrong compose file $2" >&2; exit 94; }
    shift 2
    [ "$1 $2 $3" = "exec -T api" ] || { echo "fake: not exec -T api: $*" >&2; exit 93; }
    shift 3
    if [ "$1 $2 $3" = "bun run src/galleryEraseRun.js" ]; then
      shift 3
      echo erase >> "$FAKE_STATE/order"
      printf '%s\n' "$*" > "$FAKE_STATE/erase-args"
      [ "${FAKE_ERASE_FAIL:-}" = 1 ] && { echo "Erase failed: Error: db down"; exit 1; }
      echo "Erased 2 items (1 with a file); 0 files R2 would not delete now, left for the backup run to retry."
      exit 0
    fi
    [ "$1 $2 $3" = "bun run src/galleryPurgeRun.js" ] || { echo "fake: wrong purge command" >&2; exit 92; }
    shift 3
    echo purge >> "$FAKE_STATE/order"
    cat > "$FAKE_STATE/manifest"
    printf '%s\n' "$*" > "$FAKE_STATE/purge-args"
    [ "${FAKE_PURGE_FAIL:-}" = 1 ] && { echo "Purge failed: R2Error: R2 is unreachable."; exit 1; }
    echo "Purged 0 of 0 candidates (0.0 MB); 0 gone, 0 waiting for the backup, 0 changed meanwhile."
    echo "Stored: 0.0 MB by the database, 0.0 MB listed in R2 before the purge."
    # The keys the backup is to let go of, one a line; the real purge names none in a dry run.
    if [ "$*" != "--dry-run" ] || [ "${FAKE_EXPIRE_EVEN_DRY:-}" = 1 ]; then
      while IFS= read -r k; do [ -n "$k" ] && printf 'expire\t%s\n' "$k"; done <<< "${FAKE_EXPIRE:-}"
    fi
    exit 0 ;;
esac
echo "fake docker: unexpected $*" >&2; exit 99
SHIM
chmod +x "$BIN/docker"
# The real one would answer for /mnt/bretpc; this one answers from a list, so a test can say what is mounted.
cat > "$BIN/mountpoint" <<'SHIM'
#!/usr/bin/env bash
grep -qxF -- "${!#}" "$FAKE_STATE/mounts" 2>/dev/null
SHIM
chmod +x "$BIN/mountpoint"

# A fresh world per case: a bucket with two objects, an .env, an empty backup directory.
fresh() {
  CASE=$1
  W=$ROOT/w$((PASS + FAIL)); rm -rf "$W"; mkdir -p "$W/r2/clips/1" "$W/r2/art" "$W/server" "$W/state" "$W/fake" "$W/mnt"
  printf 'clip one' > "$W/r2/clips/1/2.mp4"
  printf 'art three' > "$W/r2/art/3.png"
  printf 'POSTGRES_PASSWORD=x\nR2_ACCOUNT_ID=%s\nR2_BUCKET=%s\nR2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\nGALLERY_CHANNEL_ID=1\n' \
    "$ACCOUNT" "$BUCKET" "$KEYID" "$SECRET" > "$W/server/.env"
  : > "$W/server/docker-compose.yml"
  echo "$W/mnt" > "$W/fake/mounts"
  ENVV=(PATH="$BIN:$PATH" HOME="$W" FAKE_STATE="$W/fake" FAKE_R2="$W/r2" FAKE_SECRET="$SECRET" FAKE_KEYID="$KEYID"
    FAKE_ACCOUNT="$ACCOUNT" FAKE_BUCKET="$BUCKET" FAKE_IMAGE="$IMAGE" FAKE_COMPOSE_FILE="$W/server/docker-compose.yml"
    COMPOSE_DIR="$W/server" DEST="$W/mnt/backup" REQUIRE_MOUNT="$W/mnt" STATE_DIR="$W/state")
}
run() { env "${ENVV[@]}" bash "$SCRIPT" "$@" > "$W/out" 2>&1; CODE=$?; }
ok() { if eval "$1"; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); echo "FAIL [$CASE] $2 (exit $CODE)"; sed 's/^/    | /' "$W/out" | tail -5; fi; }
status() { cat "$W/state/last-run" 2>/dev/null; }
purged() { [ -e "$W/fake/manifest" ]; }

fresh "a clean night copies everything, checks it, and hands the purge both listings"
run
ok '[ $CODE -eq 0 ]' "exit 0"
ok 'cmp -s "$W/r2/clips/1/2.mp4" "$W/mnt/backup/clips/1/2.mp4" && cmp -s "$W/r2/art/3.png" "$W/mnt/backup/art/3.png"' "both objects backed up"
ok 'grep -q "^.* OK r2=2 backup=2 copied=2 Purged 0 of 0" "$W/state/last-run"' "status says what happened"
ok 'grep -qxF "$(printf "r2\t8\tclips/1/2.mp4")" "$W/fake/manifest" && grep -qxF "$(printf "backup\t9\tart/3.png")" "$W/fake/manifest"' "manifest lists both sides"
ok '[ "$(wc -l < "$W/fake/manifest")" -eq 4 ]' "manifest has exactly the four lines"
ok '[ -z "$(cat "$W/fake/purge-args")" ]' "a real purge, not a dry run"
ok '[ -z "$(ls "$W/state" | grep manifest)" ]' "the manifest is not left behind"

fresh "a second night copies nothing new and never overwrites what it holds"
run; run
ok '[ $CODE -eq 0 ]' "exit 0"
ok 'grep -q "copied=0" "$W/state/last-run"' "nothing copied the second time"

fresh "the backup keeps files the bucket no longer has, and lists them for the purge"
mkdir -p "$W/mnt/backup/art"; printf 'purged long ago' > "$W/mnt/backup/art/1.png"
run
ok '[ $CODE -eq 0 ]' "exit 0"
ok '[ "$(cat "$W/mnt/backup/art/1.png")" = "purged long ago" ]' "the old file is still there"
ok 'grep -qxF "$(printf "backup\t15\tart/1.png")" "$W/fake/manifest" && ! grep -q "^r2.*art/1.png" "$W/fake/manifest"' "listed as backup only"

fresh "a backup file that differs from R2 stops the night before the purge"
mkdir -p "$W/mnt/backup/art"; printf 'tampered!' > "$W/mnt/backup/art/3.png"
run
ok '[ $CODE -eq 6 ]' "exit 6"
ok '! purged' "no purge"
ok 'grep -q "FAILED exit=6" "$W/state/last-run"' "status says so"
ok '[ "$(cat "$W/mnt/backup/art/3.png")" = "tampered!" ]' "and it did not overwrite the copy it holds"

fresh "a copy failure stops before the check and the purge"
ENVV+=(FAKE_COPY_FAIL=1); run
ok '[ $CODE -eq 5 ]' "exit 5"
ok '! purged' "no purge"

fresh "a listing failure stops before the purge"
ENVV+=(FAKE_LSF_FAIL=1); run
ok '[ $CODE -eq 7 ]' "exit 7"
ok '! purged' "no purge"

fresh "a purge failure is a failed night, with the purge's own reason"
ENVV+=(FAKE_PURGE_FAIL=1); run
ok '[ $CODE -eq 8 ]' "exit 8"
ok 'grep -q "reason=the purge failed: Purge failed: R2Error: R2 is unreachable." "$W/state/last-run"' "reason recorded"
ok '[ -e "$W/mnt/backup/art/3.png" ]' "the backup it made stands"

fresh "PURGE=0 backs up and purges nothing"
ENVV+=(PURGE=0); run
ok '[ $CODE -eq 0 ]' "exit 0"
ok '! purged' "no purge"
ok 'grep -q "purge=off" "$W/state/last-run"' "status says the purge is off"
ok '[ -e "$W/mnt/backup/art/3.png" ]' "backed up"

fresh "PURGE=dry asks the purge for a dry run"
ENVV+=(PURGE=dry); run
ok '[ $CODE -eq 0 ]' "exit 0"
ok '[ "$(cat "$W/fake/purge-args")" = "--dry-run" ]' "--dry-run passed"

fresh "an empty bucket and an empty backup are a clean night with an empty manifest"
rm -rf "$W/r2"/*; run
ok '[ $CODE -eq 0 ]' "exit 0"
ok '[ ! -s "$W/fake/manifest" ]' "manifest empty"
ok 'grep -q "r2=0 backup=0 copied=0" "$W/state/last-run"' "counts are zero"

for bad in 2 yes "" " 1"; do
  fresh "PURGE='$bad' is refused before anything runs"
  ENVV+=(PURGE="$bad"); run
  ok '[ $CODE -eq 2 ]' "exit 2"
  ok '[ ! -e "$W/fake/argv" ]' "docker never ran"
done

for bad in "" "-x" "api;rm" "a b"; do
  fresh "API_SERVICE='$bad' is refused"
  ENVV+=(API_SERVICE="$bad"); run
  ok '[ $CODE -eq 2 ]' "exit 2"
done

for bad in "rclone/rclone:latest" "rclone/rclone:1.76.0" "rclone/rclone@sha256:7cbeec24" "rclone/rclone:1.76.0@sha256:7cbeec24" "" "rclone/rclone:1.76.0@sha256:7CBEEC24a44f206067597c0368be4de90ae19a64d5113c7d1938bd737a81e466"; do
  fresh "RCLONE_IMAGE='$bad' is refused: only a pinned image runs with the secret"
  ENVV+=(RCLONE_IMAGE="$bad"); run
  ok '[ $CODE -eq 2 ]' "exit 2"
done

fresh "an empty COMPOSE_DIR is refused, not read from the working directory"
ENVV+=(COMPOSE_DIR=""); run
ok '[ $CODE -eq 2 ]' "exit 2"

fresh "an empty DEST is refused, never the production default"
ENVV+=(DEST=""); run
ok '[ $CODE -eq 2 ]' "exit 2"
ok 'grep -q "reason=DEST is empty" "$W/state/last-run"' "says why"
ok '[ "$(prod_state)" = "$PROD_BEFORE" ]' "nothing written to production (compared by listing, never by reading a file there)"

fresh "a DEST outside the required mount is refused"
ENVV+=(DEST="$ROOT/elsewhere"); run
ok '[ $CODE -eq 2 ]' "exit 2"
ok '[ ! -e "$ROOT/elsewhere" ]' "not created"

fresh "a DEST that climbs out of the mount with .. is refused"
ENVV+=(DEST="$W/mnt/../escape"); run
ok '[ $CODE -eq 2 ]' "exit 2"

fresh "a drive that is not mounted stops the night: no writing onto the system disk"
: > "$W/fake/mounts"; run
ok '[ $CODE -eq 3 ]' "exit 3"
ok '[ ! -e "$W/mnt/backup" ]' "DEST not created"

fresh "REQUIRE_MOUNT='' trusts DEST as it is"
: > "$W/fake/mounts"; ENVV+=(REQUIRE_MOUNT=""); run
ok '[ $CODE -eq 0 ]' "exit 0"

fresh "a missing .env stops the night"
rm "$W/server/.env"; run
ok '[ $CODE -eq 4 ]' "exit 4"
ok 'grep -q "reason=cannot read $W/server/.env" "$W/state/last-run"' "says which file"
ok '[ ! -e "$W/fake/argv" ]' "docker never ran"

for key in R2_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  fresh "a missing $key stops the night"
  sed -i "/^$key=/d" "$W/server/.env"; run
  ok '[ $CODE -eq 4 ]' "exit 4"
  ok '[ ! -e "$W/fake/argv" ]' "docker never ran"
done

for bad in "R2_ACCOUNT_ID=00112233445566778899AABBCCDDEEFF" "R2_ACCOUNT_ID=0011" "R2_BUCKET=Invented_Bucket" "R2_BUCKET=ab" "R2_BUCKET=-bucket" "R2_ACCESS_KEY_ID=\"$KEYID\"" "R2_SECRET_ACCESS_KEY=$SECRET extra" "R2_SECRET_ACCESS_KEY=short"; do
  fresh "a malformed '${bad%%=*}' stops the night"
  echo "$bad" >> "$W/server/.env"; run
  ok '[ $CODE -eq 4 ]' "exit 4"
done

fresh "the last of a repeated key wins, as Docker Compose reads it"
printf 'R2_BUCKET=nope_not_valid\nR2_BUCKET=%s\n' "$BUCKET" >> "$W/server/.env"; run
ok '[ $CODE -eq 0 ]' "exit 0"

fresh "an .env pointing at a mock R2 is refused: this backs up Cloudflare R2"
echo "R2_ENDPOINT=http://discord-mock:4400" >> "$W/server/.env"; run
ok '[ $CODE -eq 4 ]' "exit 4"

fresh "the .env is read, never run"
echo 'R2_OTHER=$(touch '"$W"'/pwned)' >> "$W/server/.env"; echo "touch $W/pwned2" >> "$W/server/.env"; run
ok '[ $CODE -eq 0 ]' "exit 0"
ok '[ ! -e "$W/pwned" ] && [ ! -e "$W/pwned2" ]' "nothing in it ran"

fresh "the secret is on no command line, in no log, status or output"
run
ok '[ $CODE -eq 0 ]' "exit 0"
ok '! grep -rqF "$SECRET" "$W/fake/argv" "$W/state" "$W/out"' "secret not written anywhere"
ok 'grep -q "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY" "$W/fake/argv"' "it is passed by name"

fresh "the secret is not echoed when it is malformed either"
sed -i "s/^R2_SECRET_ACCESS_KEY=.*/R2_SECRET_ACCESS_KEY=${SECRET}!/" "$W/server/.env"; run
ok '[ $CODE -eq 4 ]' "exit 4"
ok '! grep -rqF "$SECRET" "$W/state" "$W/out"' "secret not written"

fresh "a second run while one holds the lock touches nothing"
run; before=$(status)
exec 8> "$W/state/lock"; flock -n 8
rm -f "$W/fake/argv"; run
ok '[ $CODE -eq 9 ]' "exit 9"
ok '[ "$(status)" = "$before" ]' "status untouched"
ok '[ ! -e "$W/fake/argv" ]' "docker never ran"
exec 8>&-

fresh "a failed night records the failure as the latest result"
run; ENVV+=(FAKE_COPY_FAIL=1); run
ok 'grep -q "FAILED exit=5" "$W/state/last-run" && [ "$(wc -l < "$W/state/last-run")" -eq 1 ]' "one line, the failure"

# ---- the backup lets go of what the purge names -------------------------------------------------
held_by_backup() { mkdir -p "$(dirname "$W/mnt/backup/$1")" && printf 'old' > "$W/mnt/backup/$1"; }

fresh "the purge's expire lines delete exactly those files from the backup, and the folders left empty"
held_by_backup art/1.png; held_by_backup clips/9/8.mp4
ENVV+=(FAKE_EXPIRE=$'art/1.png\nclips/9/8.mp4\nart/77.png'); run
ok '[ $CODE -eq 0 ]' "exit 0"
ok '[ ! -e "$W/mnt/backup/art/1.png" ] && [ ! -e "$W/mnt/backup/clips/9/8.mp4" ]' "both named files gone"
ok '[ ! -e "$W/mnt/backup/clips/9" ]' "the empty folder went with them"
ok '[ -e "$W/mnt/backup/art/3.png" ] && [ -e "$W/mnt/backup/clips/1/2.mp4" ]' "what R2 still holds stays"
ok 'grep -q "expired=2" "$W/state/last-run"' "counts the two it deleted, not the one it did not hold"
ok '! grep -q "clips/9/8.mp4\|art/1.png" "$W/state/backup.log" "$W/state/last-run"' "no key in the log or status"

for bad in "../escape.png" "/etc/passwd" "art/1.png/../../x.png" "art/../art/1.png" "art/x.png" "art/1.exe" "art/1.png " " art/1.png" "clips/1/a.mp4" "art//1.png" "ART/1.png" "art/1.PNG" "clips/1.mp4" "art/1" "art/12345678901234567890123.png"; do
  fresh "a purge that names '$bad' stops the run and the backup loses nothing"
  held_by_backup art/1.png
  ENVV+=(FAKE_EXPIRE="art/1.png"$'\n'"$bad"); run
  ok '[ $CODE -eq 8 ]' "exit 8"
  ok '[ -e "$W/mnt/backup/art/1.png" ]' "not even the good key before it was deleted"
  ok 'grep -q "reason=the purge named a file that is not a storage key" "$W/state/last-run"' "says why"
done

fresh "a dry run deletes nothing from the backup, whatever the purge says"
held_by_backup art/1.png
ENVV+=(PURGE=dry FAKE_EXPIRE_EVEN_DRY=1 FAKE_EXPIRE=art/1.png); run
ok '[ $CODE -eq 0 ]' "exit 0"
ok '[ -e "$W/mnt/backup/art/1.png" ]' "still there"
ok 'grep -q "expired=0" "$W/state/last-run"' "nothing counted"

fresh "with PURGE=0 there is no purge, so nothing leaves the backup"
held_by_backup art/1.png
ENVV+=(PURGE=0 FAKE_EXPIRE=art/1.png); run
ok '[ $CODE -eq 0 ] && [ -e "$W/mnt/backup/art/1.png" ]' "still there"

# ---- the owner's erase -----------------------------------------------------------------------------
fresh "--erase-item erases that item first, then runs the night, so its backup copy goes too"
held_by_backup art/42.png
ENVV+=(FAKE_EXPIRE=art/42.png); run --erase-item 42
ok '[ $CODE -eq 0 ]' "exit 0"
ok '[ "$(cat "$W/fake/erase-args")" = "--item 42" ]' "the API erased item 42"
ok '[ "$(tr "\n" " " < "$W/fake/order")" = "erase copy purge " ]' "erase, then copy, then purge"
ok '[ ! -e "$W/mnt/backup/art/42.png" ]' "and the backup copy is gone"
ok 'grep -q "expired=1 erase: Erased 2 items" "$W/state/last-run"' "status says both"

fresh "--erase-member erases everything one member posted"
run --erase-member 111111111111111111
ok '[ $CODE -eq 0 ]' "exit 0"
ok '[ "$(cat "$W/fake/erase-args")" = "--member 111111111111111111" ]' "the API erased that member"

for args in "--erase-item abc" "--erase-item" "--erase-item 1234567890123456" "--erase-item -1" "--erase-member 1234" "--erase-member 123456789012345678901" "--erase-member" "--erase-item 1 --erase-member 111111111111111111" "--bogus" "extra" "--erase-item 1 extra"; do
  fresh "'$args' is refused before anything runs"
  read -ra A <<< "$args"; run "${A[@]}"
  ok '[ $CODE -eq 2 ]' "exit 2"
  ok '[ ! -e "$W/fake/argv" ]' "docker never ran"
done

for p in 0 dry; do
  fresh "an erase with PURGE=$p is refused: the backup copy would stay"
  ENVV+=(PURGE=$p); run --erase-item 42
  ok '[ $CODE -eq 2 ]' "exit 2"
  ok '[ ! -e "$W/fake/argv" ]' "docker never ran"
done

fresh "a failed erase stops the night before the copy, with the API's reason"
ENVV+=(FAKE_ERASE_FAIL=1); run --erase-item 42
ok '[ $CODE -eq 10 ]' "exit 10"
ok '[ "$(cat "$W/fake/order")" = "erase" ]' "nothing ran after it"
ok 'grep -q "reason=the erase failed: Erase failed: Error: db down" "$W/state/last-run"' "reason recorded"

CASE="canary"; CODE=-
ok '[ "$(prod_state)" = "$PROD_BEFORE" ]' "the real backup directory ($PROD) did not change"

echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
