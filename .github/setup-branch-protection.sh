#!/usr/bin/env bash
# Apply branch protection to develop / staging / main.
# Requires the repo to be PUBLIC or on GitHub Pro/Team (protection is gated on private+Free).
# Run after upgrading: bash .github/setup-branch-protection.sh
set -euo pipefail

REPO="${REPO:-Youcef-C/encre-et-plume}"

protect() {
  local branch="$1" reviews="$2"
  echo "Protecting ${branch}…"
  gh api -X PUT "repos/${REPO}/branches/${branch}/protection" --input - >/dev/null <<JSON
{
  "required_status_checks": { "strict": true, "checks": [ { "context": "validate" } ] },
  "enforce_admins": false,
  "required_pull_request_reviews": ${reviews},
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
}

# main (production): require 1 review + passing CI, dismiss stale reviews.
protect main '{ "required_approving_review_count": 1, "dismiss_stale_reviews": true }'
# staging + develop: require passing CI on PRs.
protect staging 'null'
protect develop 'null'

echo "Done. Branch protection applied to develop, staging, main."
