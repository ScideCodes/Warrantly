#!/usr/bin/env bash
# Publishes an over-the-air update to the preview channel, then a matching GitHub pre-release.
#   scripts/ota-release.sh "what changed" [path/to/app.apk]
# The APK is only needed for the first release of an app version (see docs/releasing.md).
# DRAFT=1 creates the release as a draft instead of publishing it.
set -euo pipefail
cd "$(dirname "$0")/.."

msg=${1:?usage: scripts/ota-release.sh "what changed" [app.apk]}
apk=${2:-}

if ! git diff --quiet HEAD -- src modules assets plugins patches app.json package.json; then
  echo "Commit your app changes first: the update must match a commit." >&2; exit 1
fi
sha=$(git rev-parse HEAD)
git fetch -q origin
if [ -z "$(git branch -r --contains "$sha")" ]; then
  echo "Push $sha first: the release tag points at it." >&2; exit 1
fi

version=$(node -p "require('./app.json').expo.version")
out=$(npx eas-cli@latest update --channel preview --environment preview --platform android \
  --non-interactive --json --message "$msg")
group=$(printf '%s' "$out" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8'))[0].group)")

n=$(( $(gh release list --limit 200 --json tagName --jq '.[].tagName' | grep -c "^v${version}-beta\." || true) + 1 ))
tag="v${version}-beta.${n}"
notes=$(mktemp)
cat > "$notes" <<NOTES
$msg

- App version: $version (runtime $version)
- Commit: ${sha:0:7}
- Over-the-air update group: \`$group\`

Installed beta builds fetch this update on the next launch. Install the APK from the first
\`v${version}-beta.*\` release only if you do not have the beta yet.
NOTES

args=(--target "$sha" --title "Warrantly $version beta $n" --notes-file "$notes" --prerelease)
[ "${DRAFT:-}" = 1 ] && args+=(--draft)
[ -n "$apk" ] && args+=("$apk#Warrantly-$version-beta.apk")
gh release create "$tag" "${args[@]}"
rm -f "$notes"
echo "Published update $group and release $tag"
