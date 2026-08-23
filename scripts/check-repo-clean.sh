#!/usr/bin/env bash
#
# Fails if this repository is carrying anything an installation accumulated
# rather than anything that makes the application work.
#
# .gitignore stops new files from being added. It does nothing about a file
# already tracked — ignore rules do not apply to those — so a secret committed
# once stays committed however good the rules become afterwards. This checks
# the tracked set itself, which is the thing that actually ships.
#
# Run before publishing, or from CI.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
report() { printf '  %s\n' "$1"; fail=1; }

echo "== Paths that should never be tracked =="
# Deliberately matched against the tracked list rather than the filesystem:
# what is on disk is not what is published.
while IFS= read -r f; do
  case "$f" in
    .env|.env.*) [[ "$f" == *.example ]] || report "secret file: $f" ;;
    .pgdata/*)            report "database cluster: $f" ;;
    data/csv/*|data/strategies/*|data/indicators/*|data/groups/*)
                          report "installation data: $f" ;;
    data/datasets/*|data/backtest-history/*|data/view-settings/*)
                          report "installation data: $f" ;;
    *.dump|*.pgdump|*.backup) report "database dump: $f" ;;
    *.sql) [[ "$f" == prisma/migrations/* ]] || report "stray SQL: $f" ;;
    *.pem|*.key)          report "key material: $f" ;;
  esac
done < <(git ls-files)
[ "$fail" -eq 0 ] && echo "  none"

echo "== Secret-looking values in tracked files =="
# Long random-looking values assigned to a name that sounds like a secret.
# Example files are exempt only when the value is empty, so a placeholder that
# someone filled in for testing is still caught.
pattern='(SECRET|TOKEN|PASSWORD|API_KEY|ENCRYPTION_KEY|APIKEY)[[:space:]]*[:=][[:space:]]*['"'"'"]?[A-Za-z0-9+/_-]{16,}'
# Documented placeholders are not findings. A check that cries wolf gets
# muted, and a muted check is worse than none because it still reads as
# coverage. Real values do not look like "your-secret-here".
placeholders='your[-_]|example|changeme|placeholder|xxxx|<[^>]*>|\.\.\.|REPLACE|TODO'
if git grep -nIE "$pattern" -- . ':!*.example' ':!scripts/check-repo-clean.sh' 2>/dev/null \
   | grep -v '=[[:space:]]*$' | grep -viE "$placeholders" | head -20 | grep .; then
  fail=1
else
  echo "  none"
fi

echo "== Personal identifiers =="
# An installation's admin account is not part of the application.
if git grep -nIE '[A-Za-z0-9._%+-]+@(gmail|qq|163|outlook|hotmail)\.(com|cn)' -- . ':!*.example' 2>/dev/null | head -10 | grep .; then
  fail=1
else
  echo "  none"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "OK — tracked files carry code and configuration only."
else
  echo "FAILED — see above. Remember that deleting a file now does not remove"
  echo "it from history; a leaked credential must be rotated, not just removed."
fi
exit "$fail"
