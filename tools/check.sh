#!/usr/bin/env bash
# Red Hand Research — pre-push check. Run: bash tools/check.sh
# 1) No typed prices in any HTML file (prices must come from the sheet / config).
# 2) Every local link and asset in the HTML files points at a file that exists.
set -u
cd "$(dirname "$0")/.."
fail=0
echo "• Checking for typed prices in HTML…"
if grep -nE '\$[0-9]' --include='*.html' -r . --exclude-dir=.git; then
  echo "  FAIL: a dollar amount is typed into an HTML file. Move it to the sheet or assets/config.js."; fail=1
else echo "  OK"; fi
echo "• Checking local links…"
missing=0
for f in *.html; do
  for ref in $(grep -oE '(href|src)="[^"#?:]+' "$f" | sed -E 's/^(href|src)="//' | sort -u); do
    case "$ref" in mailto*|tel*|http*) continue;; esac
    [ -e "$ref" ] || { echo "  MISSING in $f: $ref"; missing=1; }
  done
done
[ "$missing" = 0 ] && echo "  OK" || fail=1
exit $fail
