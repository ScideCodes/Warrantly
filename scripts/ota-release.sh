#!/usr/bin/env bash
# Publishes an over-the-air update to the preview channel, then a matching GitHub pre-release.
#   scripts/ota-release.sh "what changed" [path/to/app.apk]
# Stable APK releases are published separately (see docs/releasing.md).
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

max=$(git tag -l "v${version}-ota.*" | sed -n "s/^v${version}-ota\.//p" | sort -n | tail -1 || true)
n=$(( ${max:-0} + 1 ))
tag="v${version}-ota.${n}"
notes=$(mktemp)
cat > "$notes" <<NOTES
$msg

- App version: $version (runtime $version)
- Commit: ${sha:0:7}
- Over-the-air update group: \`$group\`

Compatible builds with runtime $version fetch this update on launch. If your installed app
uses an older runtime, install the APK from the stable \`v${version}\` release first.
NOTES

if [ -n "$apk" ]; then
  args=(--target "$sha" --title "Warrantly $version update $n" --notes-file "$notes" --prerelease --latest=false "$apk#Warrantly-$version.apk")
  [ "${DRAFT:-}" = 1 ] && args+=(--draft)
  gh release create "$tag" "${args[@]}"
  echo "Published update $group and release $tag with APK"
else
  git tag "$tag" "$sha"
  git push origin "$tag"
  echo "Published OTA update $group and tagged $tag"
fi
rm -f "$notes"
