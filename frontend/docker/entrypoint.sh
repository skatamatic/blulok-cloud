#!/bin/sh
set -eu

# Generate runtime configuration for the SPA
BACKEND_URL_VALUE="${BACKEND_URL:-}"
BACKEND_WS_URL_VALUE="${BACKEND_WS_URL:-}"

# Derive WS URL from BACKEND_URL if BACKEND_WS_URL not provided
if [ -z "$BACKEND_WS_URL_VALUE" ] && [ -n "$BACKEND_URL_VALUE" ]; then
  case "$BACKEND_URL_VALUE" in
    https:*) BACKEND_WS_URL_VALUE="$(echo "$BACKEND_URL_VALUE" | sed 's/^https:/wss:/')" ;;
    http:*)  BACKEND_WS_URL_VALUE="$(echo "$BACKEND_URL_VALUE" | sed 's/^http:/ws:/')" ;;
    *)       BACKEND_WS_URL_VALUE="$BACKEND_URL_VALUE" ;;
  esac
fi

printf "window.__APP_CONFIG__={apiBaseUrl:%s,wsBaseUrl:%s};" \
  "$(printf "%s" "'$BACKEND_URL_VALUE'")" \
  "$(printf "%s" "'$BACKEND_WS_URL_VALUE'")" \
  > /usr/share/nginx/html/config.js

echo "Runtime config written: BACKEND_URL=${BACKEND_URL_VALUE} BACKEND_WS_URL=${BACKEND_WS_URL_VALUE}"

# Start nginx in foreground
exec nginx -g 'daemon off;'


