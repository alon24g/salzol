#!/usr/bin/env bash
# Keep a chain's last good data when this run's cloud fetch got no PriceFull files for it (a
# portal timing out, as Shufersal did on 2026-10-18). Takes the chain's raw files from the newest
# earlier pipeline run of the last 48h (spec §9) whose fetch got them. The site then shows that
# chain's real age: "updated" comes from the file names, and the About page flags data over 48h.
#
# Usage: reuse-previous-raw.sh RAW_DIR CURRENT_RUN_ID   (needs gh, jq and GH_TOKEN)
set -euo pipefail

raw=$1
current=$2
repo=${GITHUB_REPOSITORY:-alon24g/salzol}
summary=${GITHUB_STEP_SUMMARY:-/dev/null}

has_prices() { [ -n "$(find "$1" -path '*/price_full/*' -type f -print -quit 2>/dev/null)" ]; }

# A fetch group needs help if its artifact is missing from this run or one of its chains has no
# prices. fetch_status-<group>.json lists the group's chains.
needs() {
  local status="$raw/fetch_status-$1.json"
  [ -f "$status" ] || return 0
  for chain in $(jq -r '.[].chain' "$status"); do
    has_prices "$raw/$chain" || return 0
  done
  return 1
}

runs=$(gh run list --repo "$repo" --workflow pipeline.yml --limit 20 --json databaseId,createdAt \
        --jq ".[] | select(.databaseId != $current) | select((now - (.createdAt | fromdateiso8601)) < 172800) | .databaseId")

for run in $runs; do
  groups=$(gh api "repos/$repo/actions/runs/$run/artifacts" \
            --jq '.artifacts[] | select(.expired | not) | .name | select(startswith("raw-cloud-")) | ltrimstr("raw-cloud-")')
  for group in $groups; do
    needs "$group" || continue
    rm -rf raw-prev
    gh run download "$run" --repo "$repo" --name "raw-cloud-$group" --dir raw-prev 2>/dev/null || continue
    for dir in raw-prev/*/; do
      chain=$(basename "$dir")
      has_prices "$dir" || continue
      has_prices "$raw/$chain" && continue
      rm -rf "${raw:?}/$chain"
      cp -r "$dir" "$raw/$chain"
      echo "Previous data: $chain from run $run" | tee -a "$summary"
    done
    # A group missing from this run: from now on, only its chains still without prices are looked for.
    [ -f "$raw/fetch_status-$group.json" ] || cp "raw-prev/fetch_status-$group.json" "$raw/" 2>/dev/null || true
  done
done
rm -rf raw-prev
