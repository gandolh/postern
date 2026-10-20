#!/usr/bin/env bash
# corpus/lint.sh — mechanical health check for the corpus.
#
#   bash corpus/lint.sh           run all checks; exit non-zero on failure
#   bash corpus/lint.sh --index   regenerate the catalog block in index.md
#
# Checks (FAIL — gate a commit):
#   - every wiki page has non-empty `summary:` and `updated:` frontmatter
#   - every relative markdown link resolves on disk
#   - no wiki page exceeds MAX_BODY_LINES body lines (frontmatter excluded)
#   - every wiki page is reachable from index.md
#   - no IP address in the corpus (loopback and the any-address are allowed)
# Checks (WARN — informational):
#   - backticked paths whose root directory does not exist yet. Pre-implementation
#     this is expected: the wiki legitimately describes a layout the briefs will
#     create. It becomes real signal once the code lands.
set -uo pipefail

CORPUS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$CORPUS/.." && pwd)"
WIKI="$CORPUS/wiki"
INDEX="$CORPUS/index.md"
MAX_BODY_LINES=200

fail=0
warns=0
problem() { printf 'FAIL  %s\n' "$1"; fail=1; }
warn()    { printf 'WARN  %s\n' "$1"; warns=$((warns + 1)); }
ok()      { printf 'ok    %s\n' "$1"; }

rel() { printf '%s' "${1#"$ROOT"/}"; }

summary_of() { head -20 "$1" | sed -n 's/^summary:[[:space:]]*//p' | head -1; }

has_key() { head -20 "$1" | grep -qE "^$2:[[:space:]]*[^[:space:]]"; }

body_line_count() {
  awk 'NR==1 && $0=="---" { fm=1; next }
       fm  && $0=="---"   { fm=0; next }
       !fm                { n++ }
       END                { print n+0 }' "$1"
}

# ---------------------------------------------------------------- --index mode
if [[ "${1:-}" == "--index" ]]; then
  if ! grep -q '<!-- BEGIN CATALOG -->' "$INDEX"; then
    problem "$(rel "$INDEX") has no <!-- BEGIN CATALOG --> marker"
    exit 1
  fi
  tmp="$(mktemp)"
  awk '/<!-- BEGIN CATALOG -->/ { print; exit } { print }' "$INDEX" >"$tmp"
  {
    echo
    for f in "$WIKI"/*.md; do
      [[ -e "$f" ]] || continue
      base="$(basename "$f")"
      s="$(summary_of "$f")"
      printf -- '- [wiki/%s](wiki/%s) - %s\n' "$base" "$base" "${s:-NO SUMMARY}"
    done
    echo
  } >>"$tmp"
  awk 'f { print } /<!-- END CATALOG -->/ && !f { print; f=1 }' "$INDEX" \
    | awk 'NR==1 { print; next } { print }' >>"$tmp"
  mv "$tmp" "$INDEX"
  echo "regenerated catalog in $(rel "$INDEX")"
  exit 0
fi

# ------------------------------------------------------------ frontmatter/size
for f in "$WIKI"/*.md; do
  [[ -e "$f" ]] || continue
  r="$(rel "$f")"
  has_key "$f" summary || problem "$r: missing or empty \`summary:\` frontmatter"
  has_key "$f" updated || problem "$r: missing or empty \`updated:\` frontmatter"
  n="$(body_line_count "$f")"
  if (( n > MAX_BODY_LINES )); then
    problem "$r: $n body lines exceeds $MAX_BODY_LINES — split this page"
  fi
done

# ----------------------------------------------------------------- link resolve
while IFS= read -r f; do
  d="$(dirname "$f")"
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    case "$target" in
      http://*|https://*|mailto:*|\#*) continue ;;
    esac
    target="${target%%#*}"
    [[ -z "$target" ]] && continue
    if [[ ! -e "$d/$target" ]]; then
      problem "$(rel "$f"): broken link → $target"
    fi
  done < <(grep -oE '\]\([^) ]+\)' "$f" | sed -E 's/^\]\(//; s/\)$//')
done < <(find "$CORPUS" -name '*.md' -type f | sort)

# --------------------------------------------------------------- orphan pages
for f in "$WIKI"/*.md; do
  [[ -e "$f" ]] || continue
  base="$(basename "$f")"
  if ! grep -q "wiki/$base" "$INDEX"; then
    problem "wiki/$base is an orphan — not linked from index.md"
  fi
done

# ------------------------------------------------------------ stale path roots
# Only multi-segment paths are checked: a bare `foo/` is prose shorthand for a
# directory, not a path reference, and flagging it drowns the real signal.
# Roots are resolved against both the repo root and the referring file's own
# directory. Gitignored build outputs are skipped; roots the briefs have yet to
# create live in .planned-roots and are removed from it as they land.
IGNORE_ROOTS=" node_modules dist coverage .codegraph "
# npm package subpath specifiers (`vitest/config`, `@base-ui/react`) are shaped
# exactly like repo paths but resolve through node_modules. Read the real
# dependency list rather than maintaining a second, drifting copy of it here.
DEPS=" $(node -e 'const p=require("./package.json");const d={...p.dependencies,...p.devDependencies};console.log(Object.keys(d).map(n=>n.split("/")[0]).join(" "))' 2>/dev/null) "
PLANNED="$CORPUS/.planned-roots"
planned=" "
[[ -f "$PLANNED" ]] && planned=" $(sed 's/#.*//' "$PLANNED" | tr -s '[:space:]' ' ') "

while IFS= read -r f; do
  # Append-only records describe the layout as it was when written, so checking
  # them against the current tree is noise. Immutable briefs and the log are
  # exempt. The wiki, CLAUDE.md, todos/ and briefs/todo/ must match the tree.
  case "$f" in
    */briefs/done/*|*/briefs/superseded/*|*/log.md) continue ;;
  esac
  d="$(dirname "$f")"
  while IFS= read -r p; do
    [[ "$p" == */ && "$p" != */*/* ]] && continue   # bare `foo/` → prose
    root="${p%%/*}"
    [[ -z "$root" || "$root" == "." || "$root" == ".." ]] && continue
    [[ "$IGNORE_ROOTS" == *" $root "* ]] && continue
    [[ "$DEPS"         == *" $root "* ]] && continue
    [[ "$planned"      == *" $root "* ]] && continue
    # Not paths: JMAP method names (`Email/query`) start upper-case, MIME types
    # (`text/html`) have a fixed set of top-level types, and hostnames
    # (`example.org/webmail`) contain a dot.
    [[ "$root" =~ ^[A-Z] ]] && continue
    [[ " text image audio video application multipart message font " == *" $root "* ]] && continue
    [[ "$root" == *.* ]] && continue
    [[ -e "$ROOT/$root" || -e "$d/$root" ]] && continue
    warn "$(rel "$f"): references \`$p\` but ./$root does not exist"
  done < <(grep -oE '`[a-zA-Z0-9_.-]+/[a-zA-Z0-9_./*-]*`' "$f" \
             | tr -d '`' | sort -u)
done < <(find "$CORPUS" -name '*.md' -type f | sort)

# ------------------------------------------------------------- no IP addresses
# The estate's addresses belong in vps-deploy, not here.
while IFS= read -r hit; do
  problem "IP address in corpus: $(rel "$hit")"
done < <(grep -rnoE '\b[0-9]{1,3}(\.[0-9]{1,3}){3}\b' "$CORPUS" --include='*.md' \
           | grep -vE ':(127\.0\.0\.1|0\.0\.0\.0)$')

# Planned roots that now exist should be dropped from the allowlist.
if [[ -f "$PLANNED" ]]; then
  for root in $planned; do
    [[ -e "$ROOT/$root" ]] && warn ".planned-roots lists \`$root\` but it now exists — remove it"
  done
fi

echo
if (( fail )); then
  echo "corpus lint: FAILED  ($warns warning(s))"
  exit 1
fi
echo "corpus lint: clean  ($warns warning(s))"
