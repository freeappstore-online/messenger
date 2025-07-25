#!/usr/bin/env bash
# scripts/launch_chromes.sh
# Launch two independent Chrome instances with mDNS ICE candidate hiding disabled
# so local WebRTC peer connections can exchange host candidates.
#
# Usage: ./scripts/launch_chromes.sh [url]
# If no URL is provided, defaults to http://localhost:5173

set -euo pipefail

APP_URL="${1:-http://localhost:5173}"

# macOS Chrome bundle path
CHROME_APP="Google Chrome"

# Common flags – disable mDNS obfuscation and open DevTools for convenience.
COMMON_FLAGS=(
  "--disable-features=WebRtcHideLocalIpsWithMdns"
  "--enable-features=WebRtcAllowWslH264"
  "--new-window"
  "--auto-open-devtools-for-tabs"
  "--allow-insecure-localhost"
)

# Launch first Chrome instance using its own temporary profile
open -na "$CHROME_APP" --args \
  "--user-data-dir=/tmp/rtc_chrome_1" \
  "${COMMON_FLAGS[@]}" \
  "$APP_URL" &

# Small delay to ensure separate process IDs
sleep 1

# Launch second Chrome instance with a different profile directory
open -na "$CHROME_APP" --args \
  "--user-data-dir=/tmp/rtc_chrome_2" \
  "${COMMON_FLAGS[@]}" \
  "$APP_URL" &

echo "✔ Two Chrome windows launched pointing at $APP_URL with mDNS disabled."
