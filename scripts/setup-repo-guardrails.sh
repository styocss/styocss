#!/usr/bin/env bash
#
# Applies the repository guardrails that make agent-authored pull requests safe
# to supervise instead of audit line by line. Idempotent: re-run it after
# changing the CI job matrix or after temporarily removing branch protection.
#
#   pnpm setup:guardrails               # apply
#   pnpm setup:guardrails --dry-run     # print what would change, touch nothing
#
# What it configures:
#   1. Branch protection on the default branch, with enforce_admins so the rule
#      also binds agents running under the owner's own credentials.
#   2. A pull request requirement with no review requirement. The
#      `required_pull_request_reviews` block must stay present even at zero
#      approvals: dropping it removes the "require a pull request" rule and lets
#      pushes reach the branch directly. A single maintainer cannot approve their
#      own pull request, so requiring a review would deadlock every one.
#   3. allow_auto_merge + delete_branch_on_merge.
#   4. Removal of unused deployment environments (see UNUSED_ENVIRONMENTS).
#
# Releasing does NOT need a bypass here. `bump.yml` only pushes a `release/v*`
# branch; the version commit reaches main as a normal pull request a human
# opens and merges, and that human then pushes the tag `release.yml` triggers
# on — branch protection governs branches, not tags.
#
# The `release` environment is gone: `release.yml` no longer declares one, and
# the npm trusted publisher is not scoped to it. It is listed in
# UNUSED_ENVIRONMENTS so re-running this script removes the leftover — along
# with the required reviewer it used to carry, which merging the version pull
# request already covers.
#
# Emergency bypass (blocks even the owner otherwise):
#   gh api -X DELETE "repos/$REPO/branches/$BRANCH/protection"
# then re-run this script once the hotfix has landed.
#
# Requires: gh, authenticated with admin rights on the repository.

set -euo pipefail

REPO="${REPO:-pikacss/pikacss}"
BRANCH="${BRANCH:-main}"
CI_WORKFLOW="${CI_WORKFLOW:-ci.yml}"
UNUSED_ENVIRONMENTS=("copilot" "release")

# Required status checks. Keep in sync with the job names produced by
# .github/workflows/ci.yml; the script warns when the live run disagrees.
REQUIRED_CHECKS=(
	"check"
	"test (22, ubuntu-latest)"
	"test (24, ubuntu-latest)"
	"test (22, macos-latest)"
	"test (24, macos-latest)"
	"test (22, windows-latest)"
	"test (24, windows-latest)"
)

DRY_RUN=0
for arg in "$@"; do
	case "$arg" in
		--dry-run) DRY_RUN=1 ;;
		-h | --help)
			sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			echo "unknown argument: $arg" >&2
			exit 2
			;;
	esac
done

log() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '  \033[33mwarning:\033[0m %s\n' "$*" >&2; }

run_api() {
	if [ "$DRY_RUN" -eq 1 ]; then
		info "[dry-run] gh api $*"
		if [ ! -t 0 ]; then cat > /dev/null; fi
		return 0
	fi
	gh api "$@" > /dev/null
}

require_admin() {
	local admin
	admin="$(gh api "repos/$REPO" --jq '.permissions.admin')"
	[ "$admin" = "true" ] || {
		echo "error: the authenticated account lacks admin on $REPO" >&2
		exit 1
	}
}

# Compare the hardcoded contexts against the most recent CI run so a changed
# job matrix surfaces here instead of silently leaving a check unrequired.
verify_required_checks() {
	local run_id live
	run_id="$(gh run list --repo "$REPO" --workflow "$CI_WORKFLOW" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
	[ -n "$run_id" ] || {
		warn "no $CI_WORKFLOW run found; cannot cross-check required status checks"
		return 0
	}
	live="$(gh api "repos/$REPO/actions/runs/$run_id/jobs" --jq '.jobs[].name' | sort)"
	local expected
	expected="$(printf '%s\n' "${REQUIRED_CHECKS[@]}" | sort)"
	if [ "$live" != "$expected" ]; then
		warn "REQUIRED_CHECKS differs from the latest $CI_WORKFLOW run:"
		diff <(printf '%s\n' "$expected") <(printf '%s\n' "$live") | sed 's/^/    /' >&2 || true
		warn "update REQUIRED_CHECKS in this script if the matrix changed"
	else
		info "required status checks match the latest CI run ($run_id)"
	fi
}

apply_branch_protection() {
	log "branch protection: $REPO@$BRANCH"
	local contexts
	contexts="$(printf '%s\n' "${REQUIRED_CHECKS[@]}" | jq -R . | jq -s .)"
	jq -n --argjson contexts "$contexts" '{
		required_status_checks: { strict: false, contexts: $contexts },
		enforce_admins: true,
		required_pull_request_reviews: {
			dismiss_stale_reviews: false,
			require_code_owner_reviews: false,
			required_approving_review_count: 0,
			require_last_push_approval: false
		},
		restrictions: null,
		allow_force_pushes: false,
		allow_deletions: false,
		required_conversation_resolution: true
	}' | run_api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input -
	info "enforce_admins=true, pull request required, force pushes blocked"
}

apply_repo_settings() {
	log "repository merge settings"
	run_api -X PATCH "repos/$REPO" -F allow_auto_merge=true -F delete_branch_on_merge=true
	info "allow_auto_merge=true, delete_branch_on_merge=true"
}

remove_unused_environments() {
	log "unused deployment environments"
	local existing
	existing="$(gh api "repos/$REPO/environments" --jq '.environments[].name')"
	for env in "${UNUSED_ENVIRONMENTS[@]}"; do
		if printf '%s\n' "$existing" | grep -qx "$env"; then
			run_api -X DELETE "repos/$REPO/environments/$env"
			info "deleted environment: $env"
		else
			info "absent already: $env"
		fi
	done
}

report() {
	log "resulting state"
	if [ "$DRY_RUN" -eq 1 ]; then
		info "dry run: nothing was changed"
		return 0
	fi
	gh api "repos/$REPO/branches/$BRANCH/protection" --jq '
		"enforce_admins=\(.enforce_admins.enabled)",
		"pull_request_required=\(.required_pull_request_reviews != null)",
		"required_approvals=\(.required_pull_request_reviews.required_approving_review_count)",
		"force_pushes=\(.allow_force_pushes.enabled)",
		"required_checks=\(.required_status_checks.contexts | length)"
	' | sed 's/^/  /'
	gh api "repos/$REPO" --jq '"auto_merge=\(.allow_auto_merge) delete_branch_on_merge=\(.delete_branch_on_merge)"' | sed 's/^/  /'
}

[ "$DRY_RUN" -eq 1 ] && log "DRY RUN — no changes will be made"
require_admin
verify_required_checks
apply_branch_protection
apply_repo_settings
remove_unused_environments
report
