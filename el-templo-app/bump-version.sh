#!/usr/bin/env bash
# Reads version from version.txt and updates Android build.gradle + iOS project.pbxproj
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION=$(tr -d '[:space:]' < "$SCRIPT_DIR/version.txt")

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: Invalid version format '$VERSION'. Expected X.Y.Z"
  exit 1
fi

echo "Bumping version to $VERSION"

# Android build.gradle
GRADLE="$SCRIPT_DIR/src-capacitor/android/app/build.gradle"
sed -i "s/versionName = \".*\"/versionName = \"$VERSION\"/" "$GRADLE"
echo "  Updated $GRADLE"

# iOS project.pbxproj
PBXPROJ="$SCRIPT_DIR/src-capacitor/ios/App/App.xcodeproj/project.pbxproj"
sed -i "s/MARKETING_VERSION = .*;/MARKETING_VERSION = $VERSION;/" "$PBXPROJ"
echo "  Updated $PBXPROJ"

echo "Done. Version is now $VERSION"
