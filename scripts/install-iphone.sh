#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo "iPhone installation requires a Mac with Xcode. See docs/INSTALL.md."
  exit 1
fi
for tool in node npm xcodebuild pod; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing $tool. Follow the prerequisites in docs/INSTALL.md."
    exit 1
  fi
done
if [[ ! -f .env && ! -f .env.local ]]; then
  cp .env.example .env
  echo "Created .env. Add your hosted Supabase URL and public key, then run again."
  exit 1
fi
echo "Building a standalone Release. Unlock/connect your iPhone and select it when prompted."
echo "Xcode may ask you to sign in and select your Apple development team."
npm ci
npm run security:check
npx expo run:ios --configuration Release --device
