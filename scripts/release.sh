#!/usr/bin/env bash
set -euo pipefail

# release.sh - Create a GitHub release with whatever dist artifacts exist
#
# Usage: pnpm release

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

FILES=()
for pattern in dist/*.dmg dist/*.zip dist/*.exe dist/*.AppImage dist/*.deb; do
  for f in $pattern; do
    [ -f "$f" ] && FILES+=("$f")
  done
done

if [ ${#FILES[@]} -eq 0 ]; then
  echo "Error: No release artifacts found in dist/"
  echo "Run 'pnpm dist:signed' first."
  exit 1
fi

echo "Creating GitHub release $TAG with:"
for f in "${FILES[@]}"; do
  echo "  $(basename "$f")"
done

gh release create "$TAG" "${FILES[@]}" --title "Broomy $TAG" --generate-notes
