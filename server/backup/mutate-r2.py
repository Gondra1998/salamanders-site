"""Poor man's mutation testing for salamanders-r2-backup: apply one bug at a time to a copy of the script and
require test-r2.sh to FAIL. A mutant that passes is a hole in the tests (or an equivalent mutant, which must be
justified here, never ignored).

Not mutated on purpose: DEST=${DEST-...} -> ${DEST:-...}. That bug falls back to the production path, so running
it could write into the real backup directory; the test for it (DEST empty) and the canary below guard it.
"""
import os, subprocess, sys, tempfile, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "salamanders-r2-backup")
TEST = os.path.join(HERE, "test-r2.sh")
PROD = os.environ.get("BACKUP_PROD_DIR", "/mnt/bretpc/salamanders-r2-backup")

src = open(SRC).read()
MUTANTS = [
    # what the night does, and in what order
    ("copy overwrites what the backup holds", "--ignore-existing --fast-list >>", "--fast-list >>"),
    ("copy failure ignored", '|| fail 5 "rclone copy failed', '|| true "rclone copy failed'),
    ("check skipped", 'rclone check "r2:$R2_BUCKET" /backup --one-way --fast-list >> "$STATE_DIR/backup.log" 2>&1 || fail 6', "true || fail 6"),
    ("check failure ignored", '|| fail 6 "the backup does not match R2', '|| true "the backup does not match R2'),
    ("check two-way (fails on purged files)", "--one-way --fast-list >>", "--fast-list >>"),
    ("listing failure ignored", '|| fail 7 "rclone could not list R2"', '|| true'),
    ("R2 lines not marked as r2", "sed 's/^/r2\\t/'", "sed 's/^//'"),
    ("R2 lines marked as backup", "sed 's/^/r2\\t/'", "sed 's/^/backup\\t/'"),
    ("backup not listed", "find \"$DEST_REAL\" -type f -printf 'backup\\t%s\\t%P\\n' >> \"$MANIFEST\"", "true"),
    ("backup listed with full paths", "-printf 'backup\\t%s\\t%P\\n'", "-printf 'backup\\t%s\\t%p\\n'"),
    ("backup listed with no size", "-printf 'backup\\t%s\\t%P\\n'", "-printf 'backup\\t0\\t%P\\n'"),
    ("an empty bucket writes a blank r2 line", 'if [ -n "$listing" ]; then printf', 'if true; then printf'),
    ("purge failure ignored", '[ "$code" -eq 0 ] || fail 8', 'true || fail 8'),
    ("purge reason dropped", 'fail 8 "the purge failed: $(printf \'%s\\n\' "$out" | tail -n 1)"', 'fail 8 "the purge failed"'),
    ("PURGE=0 still purges", 'if [ "$PURGE" = 0 ]; then\n  SUMMARY="$SUMMARY purge=off"\n  exit 0\nfi', 'true'),
    ("dry run purges for real", '[ "$PURGE" = dry ] && args=(--dry-run)', "true"),
    ("manifest left behind", 'if [ -n "$MANIFEST" ]; then rm -f -- "$MANIFEST"; fi', "true"),
    ("copied count wrong", 'copied=$(( $(held) - before ))', 'copied=$(held)'),
    # configuration at the boundary
    ("PURGE not validated", '[[ $PURGE =~ ^(0|1|dry)$ ]] ||', "true ||"),
    ("PURGE regex loses its anchors", "^(0|1|dry)$", "(0|1|dry)"),
    ("API_SERVICE not validated", '[[ $API_SERVICE =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] ||', "true ||"),
    ("unpinned image accepted", '[[ $RCLONE_IMAGE =~ ^[a-z0-9./_-]+:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}$ ]] ||', "true ||"),
    ("short digest accepted", "@sha256:[0-9a-f]{64}$ ]]", "@sha256:[0-9a-f]+$ ]]"),
    ("empty COMPOSE_DIR accepted", '[ -n "$COMPOSE_DIR" ] || fail 2', 'true || fail 2'),
    ("empty DEST accepted", '[ -n "$DEST" ] || fail 2 "DEST is empty"', 'true'),
    ("DEST containment removed", '*) fail 2 "DEST ($DEST_REAL) is not inside', '*) true "DEST ($DEST_REAL) is not inside'),
    ("DEST not resolved (..)", 'DEST_REAL=$(realpath -m -- "$DEST") ||', 'DEST_REAL=$(printf %s "$DEST") ||'),
    ("mount check removed", 'mountpoint -q -- "$mount_real" || fail 3', "true || fail 3"),
    ("REQUIRE_MOUNT='' not honoured", 'if [ -n "$REQUIRE_MOUNT" ]; then', "if true; then"),
    # the R2 values
    ("missing .env tolerated", '[ -r "$ENV_FILE" ] || fail 4', 'true || fail 4'),
    ("first repeated key wins", '| tail -n 1; }', '| head -n 1; }'),
    ("mock endpoint accepted", '[ -z "$(setting R2_ENDPOINT)" ] || fail 4', 'true || fail 4'),
    ("account id not checked", '[[ $R2_ACCOUNT_ID =~ ^[0-9a-f]{32}$ ]] ||', "true ||"),
    ("account id case-insensitive", "^[0-9a-f]{32}$ ]] || fail 4 \"R2_ACCOUNT_ID", "^[0-9a-fA-F]{32}$ ]] || fail 4 \"R2_ACCOUNT_ID"),
    ("bucket not checked", '[[ $R2_BUCKET =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] ||', "true ||"),
    ("bucket may start with a hyphen", "^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", "^[a-z0-9-][a-z0-9-]{1,61}[a-z0-9]$"),
    ("key id not checked", '[[ $R2_ACCESS_KEY_ID =~ ^[A-Za-z0-9]{16,128}$ ]] ||', "true ||"),
    ("secret not checked", '[[ $R2_SECRET_ACCESS_KEY =~ ^[A-Za-z0-9]{16,128}$ ]] ||', "true ||"),
    ("secret named and shown", 'fail 4 "R2_SECRET_ACCESS_KEY is missing or malformed"', 'fail 4 "R2_SECRET_ACCESS_KEY is malformed: $R2_SECRET_ACCESS_KEY"'),
    ("env file sourced", 'setting() { sed -n "s/^$1=//p" -- "$ENV_FILE" | tail -n 1; }', 'set -a; . "$ENV_FILE"; set +a\nsetting() { sed -n "s/^$1=//p" -- "$ENV_FILE" | tail -n 1; }'),
    ("secret on the command line", '-e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \\', '-e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$RCLONE_CONFIG_R2_SECRET_ACCESS_KEY" \\'),
    ("secret not exported", 'RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"\nunset', '\nunset'),
    ("wrong endpoint", 'export RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"', 'export RCLONE_CONFIG_R2_ENDPOINT="https://r2.cloudflarestorage.com"'),
    # runs and status
    ("no run lock", "flock -n 9 ||", "true ||"),
    ("losing run clobbers the status file", 'NO_STATUS=1; echo "another', 'echo "another'),
    ("success not recorded as OK", 'line="OK $SUMMARY"', 'line="$SUMMARY"'),
    ("failure not recorded", 'line="FAILED exit=$code reason=$REASON"', 'line="OK"'),
    ("status appended, not replaced", '"$line" > "$STATE_DIR/last-run"', '"$line" >> "$STATE_DIR/last-run"'),
]

def prod_state():
    try:
        return sorted((root, f) for root, _, files in os.walk(PROD) for f in files)
    except FileNotFoundError:
        return None

work = tempfile.mkdtemp(prefix="r2mut.")
survivors, killed, bad = [], 0, []
before = prod_state()
try:
    only = sys.argv[1:]   # optional: substrings of mutant descriptions to run (a quick re-check)
    for i, (desc, old, new) in enumerate(MUTANTS, 1):
        if only and not any(o in desc for o in only):
            continue
        n = src.count(old)
        if n != 1:
            bad.append((desc, f"pattern found {n} times (need exactly 1)"))
            continue
        path = os.path.join(work, f"m{i}")
        open(path, "w").write(src.replace(old, new))
        os.chmod(path, 0o755)
        r = subprocess.run(["bash", TEST], env={**os.environ, "SCRIPT": path},
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300)
        if prod_state() != before:
            print(f"ABORT: mutant {i} ({desc}) touched the production backup directory"); sys.exit(3)
        if r.returncode == 0:
            survivors.append(desc); print(f"SURVIVED  {i:2d}  {desc}")
        else:
            killed += 1
            failing = sorted({l.split("]")[0].lstrip("FAIL [") for l in r.stdout.splitlines() if l.startswith("FAIL [")})
            print(f"killed    {i:2d}  {desc}   <- {', '.join(failing[:2])}{'…' if len(failing) > 2 else ''}")
finally:
    shutil.rmtree(work, ignore_errors=True)

print(f"\nmutants: {len(MUTANTS)}  killed: {killed}  survived: {len(survivors)}  unusable patterns: {len(bad)}")
for d, why in bad: print("UNUSABLE", d, "-", why)
sys.exit(1 if survivors or bad else 0)
